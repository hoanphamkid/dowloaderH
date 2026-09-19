import { getInfo, publicInfo } from '../services/videoService.js';
import { createDownload, getJob, jobStatus, terminal } from '../services/downloadService.js';
import { removeJobFiles } from '../services/cleanupService.js';
import { AppError, ERROR_CODES, fail } from '../utils/errors.js';
import { contentTypeForExt } from '../utils/mediaFile.js';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function info(req, res) {
  res.json(publicInfo(await getInfo(req.body.url)));
}
export async function batchInfo(req, res) {
  const results = [];
  for (const url of req.body.urls) {
    try {
      results.push({ url, video: publicInfo(await getInfo(url)) });
    } catch (error) {
      results.push({
        url,
        success: false,
        error: error instanceof AppError ? error.message : 'Unable to analyze this URL.',
        code: error instanceof AppError ? error.code : 'UPSTREAM_ERROR',
        message: error instanceof AppError ? error.message : 'Unable to analyze this URL.',
      });
    }
  }
  res.json({ results });
}
export function download(req, res) {
  if (req.path.startsWith('/audio/') && req.body.type !== 'audio')
    throw fail(ERROR_CODES.INVALID_URL, 400, 'An audio format is required.');
  const job = createDownload(req.body);
  res.status(202).json({ jobId: job.id, ...jobStatus(job) });
}
export function status(req, res) {
  res.json(jobStatus(getJob(req.params.jobId)));
}
export function progress(req, res) {
  const job = getJob(req.params.jobId);
  if (job.listeners.size >= 5)
    throw fail(ERROR_CODES.DOWNLOAD_ABORTED, 429, 'Too many progress connections.');
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (terminal.has(data.state)) res.end();
  };
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    job.listeners.delete(send);
  });
  job.listeners.add(send);
  send(jobStatus(job));
}
export async function file(req, res, next) {
  const job = getJob(req.params.jobId);
  if (job.state !== 'completed' || job.sending)
    throw fail(
      ERROR_CODES.MEDIA_NOT_FOUND,
      409,
      'This file is not ready, already delivered, or expired.',
    );
  const mediaType = contentTypeForExt(path.extname(job.filename || job.file));
  if (mediaType) res.type(mediaType);
  res.set('Cache-Control', 'no-store');
  // Link previews and HEAD checks must never consume a one-time download.
  if (req.method === 'HEAD') {
    const stat = await fs.stat(job.file);
    res.attachment(job.filename).set('Content-Length', String(stat.size)).end();
    return;
  }
  job.sending = true;
  job.deliveryError = null;
  res.download(
    job.file,
    job.filename,
    { acceptRanges: false, cacheControl: false },
    async (error) => {
      job.sending = false;
      if (error) {
        job.deliveryError = 'The file transfer was interrupted. Click Save file to try again.';
        console.error('File delivery failed:', job.id, error.code || error.message);
        if (!res.headersSent) next(error);
        return;
      }
      job.state = 'delivered';
      job.finishedAt = Date.now();
      await removeJobFiles(job.id).catch((error) =>
        console.error('Cleanup failed:', error.message),
      );
    },
  );
}
