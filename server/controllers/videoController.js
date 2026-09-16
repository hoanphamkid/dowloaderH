import { getInfo, publicInfo } from '../services/videoService.js';
import { createDownload, getJob, jobStatus, terminal } from '../services/downloadService.js';
import { removeJobFiles } from '../services/cleanupService.js';
import { AppError } from '../utils/errors.js';
import fs from 'node:fs/promises';
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
        error: error instanceof AppError ? error.message : 'Unable to analyze this URL.',
      });
    }
  }
  res.json({ results });
}
export function download(req, res) {
  if (req.path.startsWith('/audio/') && req.body.type !== 'audio')
    throw new AppError('An audio format is required.');
  const job = createDownload(req.body);
  res.status(202).json({ jobId: job.id, ...jobStatus(job) });
}
export function status(req, res) {
  res.json(jobStatus(getJob(req.params.jobId)));
}
export function progress(req, res) {
  const job = getJob(req.params.jobId);
  if (job.listeners.size >= 5) throw new AppError('Too many progress connections.', 429);
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
    throw new AppError('This file is not ready, already delivered, or expired.', 409);
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
