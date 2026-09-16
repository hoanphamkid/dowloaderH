export function sanitizeFilename(input) {
  let name = String(input)
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (!name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name))
    name = 'video-' + (name || 'download');
  return name;
}
