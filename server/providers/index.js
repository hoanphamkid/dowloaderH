const providerDefinitions = [
  ['youtube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'youtubekids.com']],
  ['tiktok', ['tiktok.com']],
  ['facebook', ['facebook.com', 'fb.watch']],
  ['instagram', ['instagram.com']],
  ['twitter', ['twitter.com', 'x.com']],
  ['reddit', ['reddit.com', 'redd.it']],
  ['vimeo', ['vimeo.com']],
  ['dailymotion', ['dailymotion.com', 'dai.ly']],
  ['twitch', ['twitch.tv']],
  ['threads', ['threads.net', 'threads.com']],
  ['pinterest', ['pinterest.com', 'pin.it']],
  ['tumblr', ['tumblr.com']],
  ['soundcloud', ['soundcloud.com']],
].map(([id, hosts]) => ({ id, hosts }));

export const providers = Object.freeze([...providerDefinitions, { id: 'generic', hosts: [] }]);

export function resolveProvider(input) {
  let hostname;
  try {
    hostname = new URL(input).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return providers.at(-1);
  }
  return (
    providers.find(
      (provider) =>
        provider.id !== 'generic' &&
        provider.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    ) || providers.at(-1)
  );
}

export function providerLabel(provider) {
  return provider.id === 'generic' ? 'generic' : provider.id;
}
