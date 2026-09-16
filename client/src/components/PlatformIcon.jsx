import { Youtube, Instagram, Facebook, Music2, Globe, AudioLines } from 'lucide-react';
export const platforms = [
  ['youtube', 'YouTube', '#ff4a54'],
  ['tiktok', 'TikTok', '#ebebef'],
  ['instagram', 'Instagram', '#e575b7'],
  ['facebook', 'Facebook', '#619aff'],
  ['twitter', 'Twitter / X', '#e7e7ed'],
  ['reddit', 'Reddit', '#ff7948'],
  ['vimeo', 'Vimeo', '#55c5e8'],
  ['soundcloud', 'SoundCloud', '#ffa45a'],
];
export default function PlatformIcon({ platform, size = 20 }) {
  const Icon = {
    youtube: Youtube,
    instagram: Instagram,
    facebook: Facebook,
    tiktok: Music2,
    soundcloud: AudioLines,
  }[platform];
  if (Icon) return <Icon size={size} />;
  if (platform === 'twitter')
    return (
      <span className="brand-letter" style={{ fontSize: size }}>
        𝕏
      </span>
    );
  if (platform === 'vimeo')
    return (
      <span className="brand-letter vimeo" style={{ fontSize: size + 5 }}>
        v
      </span>
    );
  if (platform === 'reddit')
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <ellipse cx="12" cy="14" rx="9" ry="6" />
        <path d="m12 8 2-6 5 1M8 17q4 3 8 0" />
        <circle cx="20" cy="3" r="2" />
        <circle cx="8" cy="13" r="1" fill="currentColor" />
        <circle cx="16" cy="13" r="1" fill="currentColor" />
      </svg>
    );
  return <Globe size={size} />;
}
