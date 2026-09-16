import { config } from '../config.js';
import { validateUrl, detectPlatform } from '../utils/url.js';
import { AppError } from '../utils/errors.js';
import { runProcess } from './processService.js';
import { TaskQueue } from './queueService.js';
export const infoQueue = new TaskQueue(2, config.maxQueue);
let proxyUrl;
export function setProxy(url) {
  proxyUrl = url;
}
export function baseArgs() {
  if (!proxyUrl) throw new AppError('Media service is not ready.', 503);
  return [
    '--ignore-config',
    '--no-plugin-dirs',
    '--no-playlist',
    '--playlist-items',
    '1',
    '--no-cache-dir',
    '--no-cookies',
    '--no-geo-bypass',
    '--no-check-formats',
    '--socket-timeout',
    '25',
    '--retries',
    '2',
    '--fragment-retries',
    '2',
    '--proxy',
    proxyUrl,
    '--js-runtimes',
    'node',
    '--ffmpeg-location',
    config.ffmpeg,
  ];
}
const supported = new Set(['http', 'https', 'm3u8_native', 'http_dash_segments']);
export function normalizeInfo(raw, url) {
  if (raw._type === 'playlist' || raw.entries)
    throw new AppError('Please paste a single video URL, not a playlist.');
  if (raw.is_live || raw.live_status === 'is_live' || raw.live_status === 'is_upcoming')
    throw new AppError('Live and upcoming streams are not supported.');
  if (raw.has_drm) throw new AppError('This video is DRM protected. Downloading is not supported.');
  if (
    raw.age_limit >= 18 ||
    (raw.availability && !['public', 'unlisted'].includes(raw.availability))
  )
    throw new AppError('This video is unavailable or requires permission to access.');
  if (!Number.isFinite(raw.duration) || raw.duration <= 0)
    throw new AppError(
      'The duration could not be verified. This media cannot be downloaded safely.',
    );
  if (raw.duration > config.maxDuration)
    throw new AppError(`Video exceeds the ${Math.floor(config.maxDuration / 60)} minute limit.`);
  const formats = (raw.formats || (raw.url ? [raw] : [])).filter(
    (f) =>
      !f.has_drm &&
      /^[a-zA-Z0-9_.-]+$/.test(String(f.format_id)) &&
      supported.has(f.protocol || 'https') &&
      /^https?:\/\//.test(f.url || '') &&
      (!f.filesize || f.filesize <= config.maxBytes),
  );
  const audio = formats
    .filter((f) => f.acodec && f.acodec !== 'none')
    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
  const audioOnly = audio.filter((f) => f.vcodec === 'none');
  const options = [];
  for (const f of formats
    .filter(
      (f) => f.vcodec !== 'none' && (f.vcodec || ['mp4', 'webm', 'mkv', 'mov'].includes(f.ext)),
    )
    .sort((a, b) => (b.height || 0) - (a.height || 0))) {
    const merge = f.acodec === 'none';
    const companion = audioOnly.find((a) => a.ext === 'm4a') || audioOnly[0];
    if (merge && !companion) continue;
    const ext = merge ? (f.ext === 'mp4' && companion.ext === 'm4a' ? 'mp4' : 'mkv') : f.ext;
    if (!['mp4', 'webm', 'mkv', 'mov'].includes(ext)) continue;
    options.push({
      id: `video-${f.format_id}`,
      type: 'video',
      label: `${f.height ? f.height + 'p' : 'Original'} · ${ext.toUpperCase()}${f.fps > 30 ? ' · ' + Math.round(f.fps) + ' fps' : ''}`,
      ext,
      height: f.height || 0,
      size: f.filesize || f.filesize_approx || null,
      selector: merge ? `${f.format_id}+${companion.format_id}` : String(f.format_id),
    });
  }
  if (audio.length) {
    const source = audioOnly[0] || audio[0];
    for (const bitrate of [128, 192, 256, 320])
      options.push({
        id: `mp3-${bitrate}`,
        type: 'audio',
        label: `MP3 · ${bitrate} kbps (converted)`,
        ext: 'mp3',
        bitrate,
        selector: String(source.format_id),
      });
    const m4a = audioOnly.find((f) => f.ext === 'm4a');
    if (m4a)
      options.push({
        id: `audio-${m4a.format_id}`,
        type: 'audio',
        label: `M4A · original${m4a.abr ? ' · ' + Math.round(m4a.abr) + ' kbps' : ''}`,
        ext: 'm4a',
        selector: String(m4a.format_id),
      });
  }
  if (!options.length) throw new AppError('No supported, unprotected media formats were found.');
  return {
    url,
    title: raw.title || 'Untitled video',
    thumbnail: /^https?:\/\//.test(raw.thumbnail || '') ? raw.thumbnail : null,
    duration: raw.duration,
    platform: detectPlatform(url),
    author: raw.uploader || raw.channel || raw.creator || 'Unknown creator',
    formats: options,
  };
}
export function getInfo(input) {
  return infoQueue.add(async () => {
    const url = await validateUrl(input);
    const stdout = await runProcess(
      config.yt,
      [...baseArgs(), '--skip-download', '--dump-single-json', '--', url],
      { timeout: config.infoTimeout },
    );
    let raw;
    try {
      raw = JSON.parse(stdout);
    } catch {
      throw new AppError('The platform returned invalid media information.', 502);
    }
    return normalizeInfo(raw, url);
  });
}
export function publicInfo(info) {
  return { ...info, formats: info.formats.map(({ selector, ...format }) => format) };
}
