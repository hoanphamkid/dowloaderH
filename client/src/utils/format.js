export function duration(seconds) {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
export function fileSize(bytes) {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : 'Size varies';
}
