const domains = {
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

const labels = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X / Twitter',
  reddit: 'Reddit',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  threads: 'Threads',
  pinterest: 'Pinterest',
  tumblr: 'Tumblr',
  soundcloud: 'SoundCloud',
  other: 'Website khác',
};

export function detectPlatformFromUrl(value) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    return Object.entries(domains).find(([, list]) => list.some((domain) => host === domain || host.endsWith(`.${domain}`)))?.[0] || 'other';
  } catch {
    return null;
  }
}

export function platformLabel(platform) {
  return labels[platform] || labels.other;
}
