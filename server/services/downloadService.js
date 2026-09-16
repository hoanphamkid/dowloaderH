import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { sanitizeFilename } from '../utils/filename.js';
import { getInfo, baseArgs } from './videoService.js';
import { runProcess } from './processService.js';
import { TaskQueue } from './queueService.js';
import { jobDirectory, removeJobFiles } from './cleanupService.js';
export const jobs = new Map();
const queue = new TaskQueue(config.concurrency, config.maxQueue);
export const terminal = new Set(['completed', 'failed', 'expired', 'delivered']);
export function jobStatus(job) {
  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    queuePosition: job.queuePosition || 0,
    sending: Boolean(job.sending),
    error: job.error || job.deliveryError || null,
    filename: job.filename || null,
  };
}
function update(job, changes) {
  Object.assign(job, changes);
  for (const listener of job.listeners) listener(jobStatus(job));
}
// Persist only completed files, so a server restart cannot orphan a ready download.
export async function persistCompletedJob(job) {
  const dir = jobDirectory(job.id);
  const manifest = {
    file: path.basename(job.file),
    filename: job.filename,
    finishedAt: job.finishedAt,
  };
  await fs.writeFile(path.join(dir, 'job.json.tmp'), JSON.stringify(manifest));
  await fs.rename(path.join(dir, 'job.json.tmp'), path.join(dir, 'job.json'));
}
export async function restoreCompletedJobs() {
  await fs.mkdir(config.temp, { recursive: true });
  for (const entry of await fs.readdir(config.temp, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name) || jobs.has(entry.name))
      continue;
    try {
      const dir = jobDirectory(entry.name);
      const record = JSON.parse(await fs.readFile(path.join(dir, 'job.json'), 'utf8'));
      if (
        !/^media\.(mp4|mkv|webm|mov|mp3|m4a)$/.test(record.file) ||
        typeof record.filename !== 'string' ||
        !/^[a-zA-Z0-9_-]+\.(mp4|mkv|webm|mov|mp3|m4a)$/.test(record.filename) ||
        !Number.isFinite(record.finishedAt) ||
        record.finishedAt > Date.now() + 60000 ||
        Date.now() - record.finishedAt > config.ttl
      )
        continue;
      const file = path.join(dir, record.file);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > config.maxBytes)
        continue;
      jobs.set(entry.name, {
        id: entry.name,
        state: 'completed',
        progress: 100,
        createdAt: record.finishedAt,
        finishedAt: record.finishedAt,
        filename: record.filename,
        file,
        listeners: new Set(),
      });
    } catch {
      /* Incomplete or expired artifacts are handled by the cleanup job. */
    }
  }
}
export function createDownload(request) {
  if (queue.pending.length >= config.maxQueue || jobs.size >= 500)
    throw new AppError('Server busy. Please try again shortly.', 503);
  const job = {
    id: randomUUID(),
    state: 'queued',
    progress: 0,
    createdAt: Date.now(),
    listeners: new Set(),
  };
  jobs.set(job.id, job);
  queue
    .add(
      async () => {
        update(job, { state: 'fetching', queuePosition: 0 });
        // Re-extract metadata instead of trusting format selectors from the browser.
        const info = await getInfo(request.url);
        const format = info.formats.find(
          (f) => f.id === request.formatId && f.type === request.type,
        );
        if (!format)
          throw new AppError('This format is no longer available. Analyze the URL again.');
        const dir = jobDirectory(job.id);
        await fs.mkdir(dir, { recursive: true });
        update(job, { state: 'preparing' });
        const args = [
          ...baseArgs(),
          '--no-simulate',
          '--newline',
          '--progress',
          '--progress-delta',
          '0.5',
          '--progress-template',
          'download:PROGRESS:%(progress._percent_str)s',
          '--max-filesize',
          String(config.maxBytes),
          '--match-filters',
          `!is_live & duration <= ${config.maxDuration} & !has_drm`,
          '--downloader',
          'native',
          '--hls-prefer-native',
          '--restrict-filenames',
          '--no-mtime',
          '--postprocessor-args',
          'ffmpeg_i:-protocol_whitelist file,pipe',
          '-f',
          format.selector,
          '-o',
          path.join(dir, 'media.%(ext)s'),
          '--print',
          'after_move:FILE:%(filepath)s',
        ];
        if (format.bitrate)
          args.push('-x', '--audio-format', 'mp3', '--audio-quality', `${format.bitrate}K`);
        if (format.type === 'video') args.push('--merge-output-format', format.ext);
        args.push('--', info.url);
        let outputPath;
        // Enforce a disk budget even when a platform does not advertise content length.
        let budgetExceeded = false;
        const monitor = setInterval(async () => {
          try {
            const files = await fs.readdir(dir);
            const sizes = await Promise.all(
              files.map((name) =>
                fs
                  .stat(path.join(dir, name))
                  .then((s) => s.size)
                  .catch(() => 0),
              ),
            );
            if (sizes.reduce((a, b) => a + b, 0) > config.maxBytes * 2) budgetExceeded = true;
          } catch {
            /* Download may already have been cleaned up. */
          }
        }, 1000);
        try {
          await runProcess(config.yt, args, {
            cwd: dir,
            timeout: config.timeout,
            onLine: (line) => {
              if (budgetExceeded) return;
              const match = line.match(/^PROGRESS:\s*([\d.]+)%/);
              if (match)
                update(job, { state: 'downloading', progress: Math.min(99, Number(match[1])) });
              if (line.includes('[Merger]')) update(job, { state: 'merging', progress: 99 });
              if (/\[ExtractAudio\]|\[Fixup/.test(line))
                update(job, { state: 'processing', progress: 99 });
              if (line.startsWith('FILE:')) outputPath = line.slice(5).trim();
            },
            shouldAbort: () => budgetExceeded,
          });
        } finally {
          clearInterval(monitor);
        }
        if (budgetExceeded) throw new AppError('This download exceeds the file size limit.', 413);
        if (!outputPath || path.dirname(path.resolve(outputPath)) !== path.resolve(dir))
          throw new AppError('The platform did not produce a downloadable file.', 502);
        const stat = await fs.lstat(outputPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > config.maxBytes)
          throw new AppError('The output exceeds the file size limit.', 413);
        job.file = outputPath;
        job.filename = sanitizeFilename(info.title) + path.extname(outputPath);
        job.finishedAt = Date.now();
        await persistCompletedJob(job);
        update(job, { state: 'completed', progress: 100 });
      },
      (position) => update(job, { queuePosition: position }),
    )
    .catch(async (error) => {
      job.failureCause = error.cause?.message;
      update(job, {
        state: 'failed',
        error: error instanceof AppError ? error.message : 'Unable to process this download.',
        finishedAt: Date.now(),
      });
      await removeJobFiles(job.id).catch(() => {});
    });
  return job;
}
export function getJob(id) {
  const job = jobs.get(id);
  if (!job) throw new AppError('Download not found or expired.', 404);
  return job;
}
export async function expireJobs() {
  for (const job of jobs.values()) {
    if (
      terminal.has(job.state) &&
      Date.now() - (job.finishedAt || job.createdAt) > config.ttl &&
      !job.sending
    ) {
      await removeJobFiles(job.id);
      update(job, { state: 'expired' });
      jobs.delete(job.id);
    }
  }
}
