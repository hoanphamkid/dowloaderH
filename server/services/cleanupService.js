import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
export function jobDirectory(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid job directory');
  return path.join(config.temp, id);
}
export async function removeJobFiles(id) {
  await fs.rm(jobDirectory(id), { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
export async function cleanupOldFiles(activeIds = new Set(), now = Date.now()) {
  await fs.mkdir(config.temp, { recursive: true });
  for (const entry of await fs.readdir(config.temp, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name) || activeIds.has(entry.name))
      continue;
    const stat = await fs.stat(jobDirectory(entry.name));
    if (now - stat.mtimeMs > config.ttl) await removeJobFiles(entry.name);
  }
}
