import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { runProcess } from './processService.js';
import { AppError } from '../utils/errors.js';

export async function prepareMp4(file, options = {}) {
  const probe = path.join(
    path.dirname(config.ffmpeg),
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  );
  const metadata = JSON.parse(
    await runProcess(
      probe,
      ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-of', 'json', file],
      options,
    ),
  );
  const video = metadata.streams.find((s) => s.codec_type === 'video');
  const audio = metadata.streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new AppError('The downloaded file does not contain video.', 502);
  const output = path.join(path.dirname(file), 'compatible.mp4');
  const copyVideo = video.codec_name === 'h264' && video.pix_fmt === 'yuv420p';
  await runProcess(
    config.ffmpeg,
    [
      '-nostdin',
      '-y',
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...(copyVideo
        ? ['-c:v', 'copy']
        : [
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
            '-vf',
            'pad=ceil(iw/2)*2:ceil(ih/2)*2',
          ]),
      ...(audio?.codec_name === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
      '-tag:v',
      'avc1',
      '-movflags',
      '+faststart',
      output,
    ],
    options,
  );
  const stat = await fs.stat(output);
  if (!stat.size || stat.size > config.maxBytes)
    throw new AppError('The output exceeds the file size limit.', 413);
  await fs.rename(output, file);
  return file;
}
