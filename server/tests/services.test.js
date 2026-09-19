import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TaskQueue } from '../services/queueService.js';
import { baseArgs, normalizeInfo, publicInfo, setProxy } from '../services/videoService.js';
import { jobDirectory, cleanupOldFiles, removeJobFiles } from '../services/cleanupService.js';
import { config, root } from '../config.js';
import { runProcess } from '../services/processService.js';
import { donorName } from '../services/donationService.js';
const raw = {
  title: 'Test',
  duration: 10,
  formats: [
    {
      format_id: '137',
      vcodec: 'avc1',
      acodec: 'none',
      height: 1080,
      ext: 'mp4',
      url: 'https://example.com/v',
      protocol: 'https',
    },
    {
      format_id: '140',
      vcodec: 'none',
      acodec: 'aac',
      abr: 128,
      ext: 'm4a',
      url: 'https://example.com/a',
      protocol: 'https',
    },
  ],
};
test('formats expose actual streams and explicit MP3 conversions', () => {
  const info = normalizeInfo(raw, 'https://youtube.com/watch?v=x');
  assert.equal(info.formats[0].selector, '137+140');
  assert.equal(info.previewUrl, 'https://example.com/v');
  assert.equal(info.formats[0].ext, 'mp4');
  assert.equal(info.formats.filter((f) => f.bitrate).length, 4);
  assert.equal(publicInfo(info).formats[0].selector, undefined);
  assert.equal(
    info.formats.some((f) => f.height === 2160),
    false,
  );
});
test('recovers donor names from transfer descriptions when webhook names are missing', () => {
  assert.equal(
    donorName('Một người bạn', 'Qagmnd9566 APP2232376 1 Thanh toan QR FT26261866529074'),
    'Qagmnd9566',
  );
  assert.equal(
    donorName('Một người bạn', 'Duong Thuy Linh chuyen tien FT26261537966421'),
    'Duong Thuy Linh',
  );
  assert.equal(
    donorName('Một người bạn', 'Nguyen Van An chuyen tien web luu dc link ytb'),
    'Nguyen Van An',
  );
});
test('rejects DRM, live, restricted, overlong and unknown-duration media', () => {
  for (const changes of [
    { has_drm: true },
    { is_live: true },
    { availability: 'private' },
    { age_limit: 18 },
    { duration: config.maxDuration + 1 },
    { duration: null },
    { entries: [] },
  ])
    assert.throws(() => normalizeInfo({ ...raw, ...changes }, 'https://example.com'));
  assert.throws(() =>
    normalizeInfo(
      { ...raw, formats: raw.formats.map((f) => ({ ...f, has_drm: true })) },
      'https://example.com',
    ),
  );
});
test('allows an explicitly enabled public age-restricted X post', () => {
  const previous = config.allowAgeRestrictedX;
  config.allowAgeRestrictedX = true;
  try {
    const info = normalizeInfo(
      { ...raw, age_limit: 18, availability: 'age_restricted' },
      'https://x.com/example/status/123',
    );
    assert.equal(info.platform, 'twitter');
  } finally {
    config.allowAgeRestrictedX = previous;
  }
});
test('yt-dlp loads the bundled extractor and installed YouTube provider plugins', () => {
  setProxy('http://127.0.0.1:3128');
  const args = baseArgs();
  const pluginFlag = args.indexOf('--plugin-dirs');
  assert.notEqual(pluginFlag, -1);
  assert.equal(args[pluginFlag + 1], root);
});
test('queue limits concurrency and recovers after task errors', async () => {
  const q = new TaskQueue(1, 2);
  let release;
  const gate = new Promise((r) => (release = r));
  const events = [];
  const a = q
    .add(async () => {
      events.push('a');
      await gate;
      throw new Error('expected');
    })
    .catch((e) => e.message);
  const b = q.add(
    async () => {
      events.push('b');
      return 2;
    },
    (p) => events.push(`position ${p}`),
  );
  const c = q.add(async () => 3);
  await assert.rejects(
    q.add(async () => 4),
    /Server busy/,
  );
  release();
  assert.equal(await a, 'expected');
  assert.equal(await b, 2);
  assert.equal(await c, 3);
  assert.ok(events.indexOf('b') > events.indexOf('a'));
  assert.ok(events.includes('position 1'));
});
test('cleanup removes stale leftovers, preserves active jobs and supports immediate deletion', async () => {
  const stale = randomUUID(),
    active = randomUUID();
  try {
    for (const id of [stale, active]) {
      await fs.mkdir(jobDirectory(id), { recursive: true });
      await fs.writeFile(path.join(jobDirectory(id), 'media.mp4'), 'test');
      const old = new Date(Date.now() - config.ttl - 1000);
      await fs.utimes(jobDirectory(id), old, old);
    }
    await cleanupOldFiles(new Set([active]));
    await assert.rejects(fs.stat(jobDirectory(stale)));
    assert.ok((await fs.stat(jobDirectory(active))).isDirectory());
    await removeJobFiles(active);
    await assert.rejects(fs.stat(jobDirectory(active)));
    assert.throws(() => jobDirectory('../../outside'));
  } finally {
    await removeJobFiles(stale);
    await removeJobFiles(active);
  }
});
test('process wrapper handles missing executable, timeout and literal arguments', async () => {
  await assert.rejects(
    runProcess('definitely-missing-social-downloader-executable', []),
    /not installed/,
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeout: 100 }),
    /timed out/,
  );
  const result = await runProcess(process.execPath, [
    '-e',
    'console.log(process.argv[1])',
    'hello; & echo bad',
  ]);
  assert.equal(result.trim(), 'hello; & echo bad');
});
