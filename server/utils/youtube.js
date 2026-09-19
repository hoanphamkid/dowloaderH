const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'youtubekids.com',
]);

export function isYoutubeHost(hostname) {
  const host = String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .replace(/^www\./, '')
    .toLowerCase();
  return YOUTUBE_HOSTS.has(host) || [...YOUTUBE_HOSTS].some((domain) => host.endsWith('.' + domain));
}

export function isYoutubeVideoId(id) {
  return YOUTUBE_ID.test(id || '');
}

export function extractYoutubeId(input) {
  const url = input instanceof URL ? input : new URL(input);
  if (!isYoutubeHost(url.hostname)) return null;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return isYoutubeVideoId(id) ? id : null;
  }
  const fromQuery = url.searchParams.get('v');
  if (isYoutubeVideoId(fromQuery)) return fromQuery;
  const parts = url.pathname.split('/').filter(Boolean);
  const markers = new Set(['shorts', 'embed', 'live', 'v', 'watch', 'e']);
  for (let i = 0; i < parts.length; i++) {
    if (markers.has(parts[i].toLowerCase()) && isYoutubeVideoId(parts[i + 1])) return parts[i + 1];
  }
  if (parts.length === 1 && isYoutubeVideoId(parts[0])) return parts[0];
  return null;
}

export function canonicalYoutubeUrl(id) {
  if (!isYoutubeVideoId(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}
