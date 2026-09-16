import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'temp') await walk(file);
    else if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) {
        console.error(result.stderr);
        process.exitCode = 1;
      }
    }
  }
}
await walk('server');
await walk('scripts');
if (!process.exitCode)
  console.log(
    'All server and script JavaScript syntax checks passed. Run npm run build to check JSX/imports.',
  );
