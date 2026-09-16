// Real yt-dlp + FFmpeg, deterministic media served by a test-only HTTP proxy.
// Does not change the running app or disable its SSRF proxy.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, root } from '../server/config.js';
import { runProcess } from '../server/services/processService.js';
import { checkDependencies } from '../server/services/ffmpegService.js';
import { setProxy, getInfo } from '../server/services/videoService.js';
import { createApp } from '../server/app.js';
import { jobDirectory, removeJobFiles } from '../server/services/cleanupService.js';
import { getJob, jobs } from '../server/services/downloadService.js';

const dir = path.join(root, '.tools', 'smoke');
await fs.mkdir(dir, { recursive: true });
const media = path.join(dir, 'fixture.mp4');
console.log(await checkDependencies());
await runProcess(config.ffmpeg, [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x7050a0:s=320x180:r=25',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=44100',
  '-t',
  '2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-movflags',
  '+faststart',
  media,
]);
await runProcess(
  config.ffmpeg,
  ['-y', '-i', media, '-map', '0:v', '-map', '0:a', '-c', 'copy', '-f', 'dash', 'manifest.mpd'],
  { cwd: dir },
);
const fixture = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://example.com');
  if (/\.(mp4|mpd|m4s)$/.test(url.pathname)) {
    const content = await fs
      .readFile(path.join(dir, path.basename(url.pathname)))
      .catch(() => null);
    if (!content) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': url.pathname.endsWith('.mpd') ? 'application/dash+xml' : 'video/mp4',
      'Content-Length': content.length,
    });
    res.end(req.method === 'HEAD' ? undefined : content);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<html><head><title>Owned test video</title></head><body><script>jwplayer('player').setup({"playlist":[{"title":"Owned test video","duration":2,"sources":[{"file":"http://example.com/manifest.mpd","type":"application/dash+xml"}]}]});</script></body></html>`,
  );
});
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
setProxy(`http://127.0.0.1:${fixture.address().port}`);
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function post(endpoint, body) {
  const res = await fetch(base + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
}
try {
  await getInfo('http://example.com/owned-test').catch((error) => {
    console.error(error.cause?.message || error.message);
    throw error;
  });
  const info = await post('/video/info', { url: 'http://example.com/owned-test' });
  console.log(
    'Metadata:',
    info.title,
    info.duration,
    info.formats.map((f) => f.id),
  );
  const selection = [
    info.formats.find((f) => f.type === 'video'),
    ...info.formats.filter((f) => f.bitrate),
    info.formats.find((f) => f.ext === 'm4a'),
  ];
  assert.equal(selection.length, 6);
  for (const format of selection) {
    const created = await post(format.type === 'audio' ? '/audio/download' : '/video/download', {
      url: info.url,
      formatId: format.id,
      type: format.type,
    });
    const progress = await fetch(`${base}/download/${created.jobId}/progress`);
    const events = await progress.text();
    if (getJob(created.jobId).failureCause) console.error(getJob(created.jobId).failureCause);
    assert.match(events, /"state":"completed"/, events);
    const result = await fetch(`${base}/download/${created.jobId}/file`);
    assert.equal(result.status, 200);
    const output = Buffer.from(await result.arrayBuffer());
    assert.ok(output.length > 100);
    const destination = path.join(dir, format.id + '.' + format.ext);
    await fs.writeFile(destination, output);
    // Decode with FFmpeg, proving it is actual playable output, not only a named file.
    await runProcess(config.ffmpeg, ['-v', 'error', '-i', destination, '-f', 'null', '-']);
    for (let i = 0; i < 20; i++) {
      if (!(await fs.stat(jobDirectory(created.jobId)).catch(() => null))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(await fs.stat(jobDirectory(created.jobId)).catch(() => null), null);
    assert.equal((await fetch(`${base}/download/${created.jobId}/file`)).status, 409);
    console.log(
      `PASS ${format.label}: ${output.length} bytes, decodable, SSE complete, temp removed`,
    );
  }
} finally {
  await Promise.all([...jobs.keys()].map((id) => removeJobFiles(id)));
  server.closeAllConnections();
  fixture.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => fixture.close(resolve)),
  ]);
}
