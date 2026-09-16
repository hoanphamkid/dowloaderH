import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { AppError } from './errors.js';
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
    throw new AppError('Please enter a valid video URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new AppError('Only public HTTP/HTTPS URLs on ports 80 or 443 are allowed.');
  if (
    (!host.includes('.') && !net.isIP(host)) ||
    /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host) ||
    (net.isIP(host) && !isPublicAddress(host))
  )
    throw new AppError('Local and private network addresses are not allowed.');
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
    throw new AppError('This website could not be resolved.');
  }
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new AppError('Local and private network addresses are not allowed.');
  return records[0];
}
export async function validateUrl(input) {
  const url = parsePublicUrl(input);
  await resolvePublic(url.hostname);
  return url.href;
}
export function detectPlatform(input) {
  const host = new URL(input).hostname.toLowerCase();
  const platforms = {
    youtube: ['youtube.com', 'youtu.be'],
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
