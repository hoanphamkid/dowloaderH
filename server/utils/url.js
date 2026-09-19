import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { ERROR_CODES, fail } from './errors.js';
import { canonicalYoutubeUrl, extractYoutubeId, isYoutubeHost } from './youtube.js';
export function isPublicAddress(address) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function parsePublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Please enter a valid video URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw fail(
      ERROR_CODES.INVALID_URL,
      400,
      'Only public HTTP/HTTPS URLs on ports 80 or 443 are allowed.',
    );
  if (
    (!host.includes('.') && !net.isIP(host)) ||
    /(^|\.)(localhost|local|internal|home|lan|test|invalid|metadata)$/.test(host) ||
    host === 'metadata.google.internal' ||
    (net.isIP(host) && !isPublicAddress(host))
  )
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Local and private network addresses are not allowed.');
  return url;
}
export async function resolvePublic(hostname, lookup = dns.lookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  let records;
  try {
    records = net.isIP(host)
      ? [{ address: host, family: net.isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw fail(ERROR_CODES.INVALID_URL, 400, 'This website could not be resolved.');
  }
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Local and private network addresses are not allowed.');
  return records[0];
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'si',
  'feature',
  'pp',
  'ab_channel',
  'embeds_referring_euri',
  'embeds_referring_origin',
]);

export function canonicalizePublicUrl(input) {
  const url = parsePublicUrl(input);
  if (isYoutubeHost(url.hostname)) {
    const id = extractYoutubeId(url);
    if (!id)
      throw fail(ERROR_CODES.INVALID_URL, 400, 'Please enter a valid YouTube video URL.');
    return parsePublicUrl(canonicalYoutubeUrl(id));
  }
  for (const key of [...url.searchParams.keys()])
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  return url;
}

export async function validateUrl(input) {
  const url = canonicalizePublicUrl(input);
  await resolvePublic(url.hostname);
  return url.href;
}
export function detectPlatform(input) {
  const host = new URL(input).hostname.toLowerCase();
  const platforms = {
    youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'youtubekids.com'],
    tiktok: ['tiktok.com'],
    facebook: ['facebook.com', 'fb.watch'],
    instagram: ['instagram.com'],
    twitter: ['twitter.com', 'x.com'],
    reddit: ['reddit.com', 'redd.it'],
    vimeo: ['vimeo.com'],
    dailymotion: ['dailymotion.com', 'dai.ly'],
    threads: ['threads.net', 'threads.com'],
    pinterest: ['pinterest.com', 'pin.it'],
    tumblr: ['tumblr.com'],
    soundcloud: ['soundcloud.com'],
  };
  return (
    Object.entries(platforms).find(([, domains]) =>
      domains.some((d) => host === d || host.endsWith('.' + d)),
    )?.[0] || 'other'
  );
}
