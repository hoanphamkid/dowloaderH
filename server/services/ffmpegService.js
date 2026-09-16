import { config } from '../config.js';
import path from 'node:path';
import { runProcess } from './processService.js';
export async function checkDependencies() {
  const versions = {};
  const ffprobe =
    path.dirname(config.ffmpeg) === '.'
      ? 'ffprobe'
      : path.join(
          path.dirname(config.ffmpeg),
          process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
        );
  for (const [name, command, args] of [
    ['yt-dlp', config.yt, ['--version']],
    ['FFmpeg', config.ffmpeg, ['-version']],
    ['FFprobe', ffprobe, ['-version']],
  ]) {
    try {
      versions[name] = (await runProcess(command, args)).split(/\r?\n/)[0];
    } catch {
      throw new Error(`${name} is not installed or cannot run. See README.md.`);
    }
  }
  return versions;
}
