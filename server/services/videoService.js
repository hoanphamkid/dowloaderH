import { config, root } from '../config.js';
import { validateUrl, detectPlatform } from '../utils/url.js';
import { ERROR_CODES, fail } from '../utils/errors.js';
import { classifyContentType } from '../utils/mediaFile.js';
import { runProcess } from './processService.js';
import { TaskQueue } from './queueService.js';
export const infoQueue = new TaskQueue(2, config.maxQueue);
let proxyUrl;
export function setProxy(url) {
  proxyUrl = url;
}
export function baseArgs() {
  if (!proxyUrl) throw fail(ERROR_CODES.SERVER_ERROR, 503, 'Media service is not ready.');
  const args = [
    '--ignore-config',
    // Load the repository extractor and the installed bgutil YouTube POT
    // provider. The Docker image installs bgutil into yt-dlp's normal plugin
    // directory; disabling default plugin directories breaks YouTube.
    '--plugin-dirs',
    root,
    ...(config.bgutilPluginDir ? ['--plugin-dirs', config.bgutilPluginDir] : []),
    '--no-playlist',
    '--playlist-items',
    '1',
    '--no-cache-dir',
    ...(config.youtubeCookies ? ['--cookies', config.youtubeCookies] : ['--no-cookies']),
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
  // YouTube is rate-limiting the normal webpage client on Render. The mweb
  // client is the recommended yt-dlp path when paired with a PO-token provider.
  args.splice(args.indexOf('--ffmpeg-location'), 0, '--extractor-args', 'youtube:player-client=mweb');
  if (config.bgutilServerHome)
    args.splice(
      args.indexOf('--ffmpeg-location'),
      0,
      '--extractor-args',
      `youtubepot-bgutilscript:server_home=${config.bgutilServerHome}`,
    );
  return args;
}
const supported = new Set(['http', 'https', 'm3u8', 'm3u8_native', 'http_dash_segments']);

function protocolName(protocol) {
  return String(protocol || 'https')
    .split('+')[0]
    .toLowerCase();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function addYoutubeFallback(options, audioSource) {
  if (options.some((item) => item.type === 'video')) return;
  options.unshift({
    id: 'video-best',
    type: 'video',
    label: 'Best available · MP4',
    ext: 'mp4',
    height: 0,
    size: null,
    selector: 'b[ext=mp4]/bv*+ba/b',
  });
  const audioSelector = audioSource || 'ba/b';
  if (!options.some((item) => item.type === 'audio')) {
    for (const bitrate of [128, 192, 256, 320])
      options.push({
        id: `mp3-${bitrate}`,
        type: 'audio',
        label: `MP3 · ${bitrate} kbps (converted)`,
        ext: 'mp3',
        bitrate,
        selector: String(audioSelector),
      });
  }
}

export function normalizeInfo(raw, url) {
  if (raw._type === 'playlist' || raw.entries)
    throw fail(ERROR_CODES.UNSUPPORTED_PLATFORM, 400, 'Please paste a single video URL, not a playlist.');
  if (raw.is_live || raw.live_status === 'is_live' || raw.live_status === 'is_upcoming')
    throw fail(ERROR_CODES.VIDEO_UNAVAILABLE, 400, 'Live and upcoming streams are not supported.');
  if (raw.has_drm)
    throw fail(ERROR_CODES.ACCESS_DENIED, 403, 'This video is DRM protected. Downloading is not supported.');
  if (
    raw.age_limit >= 18 ||
    (raw.availability && !['public', 'unlisted'].includes(raw.availability))
  )
    throw fail(
      raw.availability === 'private' ? ERROR_CODES.VIDEO_PRIVATE : ERROR_CODES.ACCESS_DENIED,
      403,
      raw.availability === 'private'
        ? 'This video is private.'
        : 'This video is unavailable or requires permission to access.',
    );
  const platform = detectPlatform(url);
  const headerType = classifyContentType(
    raw.http_headers?.['Content-Type'] || raw.http_headers?.['content-type'] || '',
  );
  const ext = String(raw.ext || '').toLowerCase();
  if (
    platform === 'other' &&
    (['html', 'htm', 'json', 'xml', 'php'].includes(ext) || headerType === 'html' || headerType === 'json')
  )
    throw fail(ERROR_CODES.MEDIA_TYPE_INVALID, 415);
  if (raw.http_headers && [403, 404, 500, 502, 503].includes(Number(raw.status || raw.http_headers.status)))
    throw fail(
      Number(raw.status) === 404 ? ERROR_CODES.MEDIA_NOT_FOUND : ERROR_CODES.UPSTREAM_ERROR,
      Number(raw.status) === 404 ? 404 : 502,
    );
  const detectedDuration =
    Number.isFinite(raw.duration) && raw.duration > 0
      ? raw.duration
      : Math.max(0, ...(raw.formats || []).map((format) => Number(format.duration) || 0));
  const directExt = ['mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'm4a'].includes(ext);
  if (
    detectedDuration <= 0 &&
    platform !== 'instagram' &&
    !(platform === 'other' && directExt && isHttpUrl(raw.url))
  )
    throw fail(
      ERROR_CODES.VIDEO_UNAVAILABLE,
      400,
      'The duration could not be verified. This media cannot be downloaded safely.',
    );
  if (detectedDuration > config.maxDuration)
    throw fail(
      ERROR_CODES.VIDEO_UNAVAILABLE,
      400,
      `Video exceeds the ${Math.floor(config.maxDuration / 60)} minute limit.`,
    );
  const formats = (raw.formats || (raw.url ? [raw] : [])).filter((f) => {
    if (f.has_drm) return false;
    if (!/^[a-zA-Z0-9_.-]+$/.test(String(f.format_id))) return false;
    if (f.filesize && f.filesize > config.maxBytes) return false;
    const proto = protocolName(f.protocol);
    if (!supported.has(proto)) return platform === 'youtube';
    return isHttpUrl(f.url) || platform === 'youtube';
  });
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
    const outExt = merge ? (f.ext === 'mp4' && companion.ext === 'm4a' ? 'mp4' : 'mkv') : f.ext;
    if (!['mp4', 'webm', 'mkv', 'mov'].includes(outExt)) continue;
    options.push({
      id: `video-${f.format_id}`,
      type: 'video',
      label: `${f.height ? f.height + 'p' : 'Original'} · ${outExt.toUpperCase()}${f.fps > 30 ? ' · ' + Math.round(f.fps) + ' fps' : ''}`,
      ext: outExt,
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
  if (platform === 'youtube') addYoutubeFallback(options, audioOnly[0]?.format_id || audio[0]?.format_id);
  if (!options.length) {
    if (platform === 'youtube') throw fail(ERROR_CODES.YOUTUBE_DOWNLOAD_UNAVAILABLE, 502);
    throw fail(ERROR_CODES.MEDIA_NOT_FOUND, 404, 'No supported, unprotected media formats were found.');
  }
  const preview = formats
    .filter(
      (f) =>
        f.vcodec !== 'none' &&
        ['mp4', 'webm'].includes(f.ext) &&
        ['http', 'https'].includes(protocolName(f.protocol)) &&
        isHttpUrl(f.url),
    )
    .sort((a, b) => {
      const audioDifference = Number(b.acodec !== 'none') - Number(a.acodec !== 'none');
      if (audioDifference) return audioDifference;
      return (b.height || 0) - (a.height || 0);
    })[0];
  return {
    url,
    title: raw.title || 'Untitled video',
    thumbnail: isHttpUrl(raw.thumbnail) ? raw.thumbnail : null,
    previewUrl: preview?.url || null,
    duration: detectedDuration,
    platform,
    author: raw.uploader || raw.channel || raw.creator || 'Unknown creator',
    formats: options,
  };
}
export function getInfo(input) {
  return infoQueue.add(async () => {
    const url = await validateUrl(input);
    const platform = detectPlatform(url);
    console.log('[INFO] URL:', url);
    console.log('[INFO] PLATFORM:', platform);
    if (platform === 'youtube') {
      console.log('[YOUTUBE] Starting...');
      console.log('[YOUTUBE] URL:', url);
    }
    try {
      const stdout = await runProcess(
        config.yt,
        [...baseArgs(), '--skip-download', '--dump-single-json', '--', url],
        { timeout: config.infoTimeout },
      );
      let raw;
      try {
        raw = JSON.parse(stdout);
      } catch {
        const start = stdout.indexOf('{');
        const end = stdout.lastIndexOf('}');
        try {
          if (start === -1 || end <= start) throw new SyntaxError('empty');
          raw = JSON.parse(stdout.slice(start, end + 1));
        } catch {
          console.error('[INFO PARSE ERROR] stdout bytes=', stdout.length);
          throw fail(
            ERROR_CODES.UPSTREAM_ERROR,
            502,
            'The platform returned invalid media information.',
          );
        }
      }
      const info = normalizeInfo(raw, url);
      console.log('[INFO] TITLE:', info.title, 'FORMATS:', info.formats.length);
      return info;
    } catch (error) {
      if (platform === 'youtube') {
        console.error('[YOUTUBE ERROR]', error);
        console.error('[YOUTUBE ERROR MESSAGE]', error?.message);
        console.error('[YOUTUBE ERROR STACK]', error?.stack);
        console.error('[YOUTUBE ERROR CAUSE]', error?.cause?.message || error?.cause || '');
      } else {
        console.error('[INFO ERROR]', error?.message, error?.cause?.message || '');
      }
      throw error;
    }
  });
}
export function publicInfo(info) {
  return { ...info, formats: info.formats.map(({ selector, ...format }) => format) };
}
