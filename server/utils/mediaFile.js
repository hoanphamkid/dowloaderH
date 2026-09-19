import fs from 'node:fs/promises';
import { ERROR_CODES, fail } from './errors.js';

const MEDIA_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

const DIRECT_EXT = new Set(Object.keys(MEDIA_TYPES));

export function contentTypeForExt(ext) {
  return MEDIA_TYPES[String(ext || '').replace(/^\./, '').toLowerCase()] || null;
}

export function isDirectMediaPath(pathname = '') {
  const match = String(pathname).toLowerCase().match(/\.([a-z0-9]+)(?:$|[/?])/);
  return Boolean(match && DIRECT_EXT.has(match[1]));
}

export function classifyContentType(value = '') {
  const type = String(value).split(';')[0].trim().toLowerCase();
  if (!type) return 'unknown';
  if (type.startsWith('text/html') || type === 'application/xhtml+xml') return 'html';
  if (type === 'application/json' || type.endsWith('+json')) return 'json';
  if (type.startsWith('video/') || type.startsWith('audio/') || type === 'application/octet-stream')
    return 'media';
  return 'other';
}

export async function assertRealMediaFile(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, 64, 0);
    const head = buffer.subarray(0, bytesRead);
    const text = head.toString('utf8');
    if (/^\s*</.test(text) || /^\s*\{/.test(text) || /^\s*\[/.test(text))
      throw fail(ERROR_CODES.MEDIA_TYPE_INVALID, 502);
  } finally {
    await handle.close();
  }
}
