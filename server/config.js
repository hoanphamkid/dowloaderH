import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
function number(key, fallback, min = 1, max = 1000000) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}
export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: number('PORT', 3000, 1, 65535),
  origins: (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim()),
  concurrency: number('MAX_CONCURRENT_DOWNLOADS', 3, 1, 16),
  maxQueue: number('MAX_QUEUE_SIZE', 30, 1, 100),
  ttl: number('TEMP_FILE_TTL_MINUTES', 30) * 60000,
  maxDuration: number('MAX_VIDEO_DURATION_SECONDS', 7200),
  maxBatch: number('MAX_BATCH_URLS', 10, 1, 30),
  maxBytes: number('MAX_FILE_SIZE_MB', 1024) * 1024 * 1024,
  timeout: number('PROCESS_TIMEOUT_SECONDS', 900) * 1000,
  infoTimeout: number('INFO_TIMEOUT_SECONDS', 90) * 1000,
  infoLimit: number('INFO_RATE_LIMIT', 30),
  downloadLimit: number('DOWNLOAD_RATE_LIMIT', 10),
  rateWindow: number('RATE_WINDOW_MINUTES', 10) * 60000,
  yt: process.env.YT_DLP_PATH || 'yt-dlp',
  ffmpeg: process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg' : '/usr/bin/ffmpeg'),
  // The Oracle/Linux deployment has the optional bgutil script provider installed.
  // Windows development can omit it and use yt-dlp's built-in extractors.
  bgutilServerHome:
    process.env.BGUTIL_SERVER_HOME ||
    (process.platform === 'linux' ? '/opt/bgutil-ytdlp-pot-provider/server' : ''),
  bgutilPluginDir:
    process.env.BGUTIL_PLUGIN_DIR ||
    (process.platform === 'linux' ? '/opt/bgutil-ytdlp-pot-provider/plugin' : ''),
  temp: path.join(root, 'server', 'temp'),
};
// Relative executable paths are always rooted at the project, not the current job directory.
for (const key of ['yt', 'ffmpeg'])
  if (config[key].startsWith('.')) config[key] = path.resolve(root, config[key]);
