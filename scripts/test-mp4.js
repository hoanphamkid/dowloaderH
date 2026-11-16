import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/config.js';
import { runProcess } from '../server/services/processService.js';
import { prepareMp4 } from '../server/services/mp4Service.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp4-compat-'));
const probe = path.join(
  path.dirname(config.ffmpeg),
  process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
);
try {
  for (const codec of ['libvpx-vp9', 'libx264']) {
    const file = path.join(dir, `${codec}.mp4`);
    await runProcess(config.ffmpeg, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=s=160x90:r=10',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440',
      '-t',
      '1',
      '-c:v',
      codec,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      file,
    ]);
    await prepareMp4(file);
    const { streams, format } = JSON.parse(
      await runProcess(probe, [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        file,
      ]),
    );
    assert.equal(streams.find((s) => s.codec_type === 'video').codec_name, 'h264');
    assert.equal(streams.find((s) => s.codec_type === 'video').pix_fmt, 'yuv420p');
    assert.equal(streams.find((s) => s.codec_type === 'audio').codec_name, 'aac');
    assert.ok(Number(format.duration) >= 1);
    const bytes = await fs.readFile(file);
    assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')));
    await runProcess(config.ffmpeg, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
    console.log(`${codec}: H.264/AAC, faststart, full decode passed`);
  }
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
