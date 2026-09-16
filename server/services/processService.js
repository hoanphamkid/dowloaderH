import { spawn } from 'node:child_process';
import { AppError, processError } from '../utils/errors.js';
export const children = new Set();
export function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
    });
    killer.on('error', () => child.kill());
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}
export function runProcess(
  command,
  args,
  { timeout = 30000, onLine, cwd, maxOutput = 16 * 1024 * 1024, shouldAbort } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      cwd,
      env: { ...process.env, NO_PROXY: '', no_proxy: '' },
    });
    children.add(child);
    let stdout = '',
      stderr = '',
      buffer = '',
      failure;
    const timer = setTimeout(() => {
      failure = new AppError('The request timed out. Please try a shorter video.', 504);
      killTree(child);
    }, timeout);
    const abortTimer = shouldAbort
      ? setInterval(() => {
          if (shouldAbort()) {
            failure = new AppError('This download exceeds the file size limit.', 413);
            killTree(child);
          }
        }, 1000)
      : null;
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      buffer += chunk.toString();
      if (stdout.length > maxOutput) {
        failure = new AppError('Media information exceeds the resource limit.', 413);
        killTree(child);
      }
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) onLine?.(line);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-16000);
      if (String(command).toLowerCase().includes('yt-dlp')) console.error('[YT-DLP]', text.trim());
      text.split(/\r?\n/).forEach((line) => onLine?.(line));
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      clearInterval(abortTimer);
      children.delete(child);
      reject(
        new AppError(
          error.code === 'ENOENT'
            ? `${command} is not installed. See README for setup.`
            : 'Unable to start the media processor.',
          503,
        ),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      clearInterval(abortTimer);
      children.delete(child);
      if (buffer) onLine?.(buffer);
      if (failure) reject(failure);
      else if (code !== 0) {
        const error = processError(stderr);
        error.cause = new Error(stderr);
        reject(error);
      } else resolve(stdout);
    });
  });
}
