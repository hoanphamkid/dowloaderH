import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { api, monitorJob, monitorDelivery } from './services/api.js';
vi.mock('./services/api.js', () => ({ api: vi.fn(), monitorJob: vi.fn(), monitorDelivery: vi.fn() }));
const video = {
  url: 'https://example.com/video',
  title: 'My public video',
  author: 'Creator',
  duration: 12,
  platform: 'youtube',
  thumbnail: null,
  formats: [
    { id: 'video-720', type: 'video', label: '720p · MP4', ext: 'mp4' },
    { id: 'mp3-128', type: 'audio', label: 'MP3 · 128 kbps (converted)', ext: 'mp3', bitrate: 128 },
  ],
};
let progressCallback, deliveryCallback;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.mockImplementation(async (path) => {
    if (path === '/health') return { limits: { maxBatch: 10 } };
    if (path === '/video/info') return video;
    if (path === '/download/job-123/status') return {id:'job-123',state:'completed',progress:100};
    if (path.endsWith('/download')) return { jobId: 'job-123', state: 'queued', progress: 0 };
    if (path === '/batch/info')
      return {
        results: [
          { url: video.url, video },
          { url: 'https://example.com/missing', error: 'Video unavailable' },
        ],
      };
    throw new Error('Unexpected API route ' + path);
  });
  monitorJob.mockImplementation((id, callback) => {
    progressCallback = callback;
    return vi.fn();
  });
  monitorDelivery.mockImplementation((id, callback) => {
    deliveryCallback = callback;
    return vi.fn();
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function analyze(user) {
  await user.type(screen.getByRole('textbox', { name: 'Video URL' }), video.url);
  await user.click(screen.getByRole('button', { name: /Analyze link/ }));
  await screen.findByRole('heading', { name: video.title });
}
describe('downloader user flows', () => {
  it('validates invalid input before requesting metadata', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Video URL' }), 'file:///secret');
    await user.click(screen.getByRole('button', { name: /Analyze link/ }));
    expect(screen.getByRole('alert').textContent).toContain('complete URL');
    expect(api.mock.calls.some(([path]) => path === '/video/info')).toBe(false);
  });
  it('analyzes the link and selects the correct audio endpoint and format', async () => {
    const user = userEvent.setup();
    render(<App />);
    await analyze(user);
    expect(screen.getByRole('combobox').value).toBe('video-720');
    await user.click(screen.getByRole('button', { name: 'Audio' }));
    expect(screen.getByRole('combobox').value).toBe('mp3-128');
    await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/audio/download', {
        url: video.url,
        formatId: 'mp3-128',
        type: 'audio',
      }),
    );
    await act(async () => progressCallback({ id: 'job-123', state: 'downloading', progress: 42 }));
    expect(screen.getByRole('progressbar').value).toBe(42);
    expect(screen.getByRole('combobox').disabled).toBe(true);
  });
  it('offers a native download link and records history only after confirmed delivery', async () => {
    const user = userEvent.setup();
    const binaryFetch = vi.fn();
    const createBlob = vi.fn();
    vi.stubGlobal('fetch', binaryFetch);
    vi.stubGlobal('Blob', createBlob);
    render(<App />);
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
    await waitFor(() => expect(monitorJob).toHaveBeenCalled());
    await act(async () => progressCallback({ id: 'job-123', state: 'completed', progress: 100, filename: 'my-video.mp4' }));
    const saveLink = screen.getByRole('link', { name: 'Save file' });
    expect(saveLink.getAttribute('href')).toBe('/api/download/job-123/file');
    expect(saveLink.getAttribute('download')).toBe('my-video.mp4');
    expect(monitorDelivery).not.toHaveBeenCalled();
    expect(localStorage.getItem('social-video-history-v1')).toBeNull();
    // JSDOM cannot perform a native download; suppress its navigation only in this test.
    saveLink.addEventListener('click', (event) => event.preventDefault());
    await user.click(saveLink);
    expect(monitorDelivery).toHaveBeenCalledWith('job-123', expect.any(Function));
    expect(binaryFetch).not.toHaveBeenCalled();
    expect(createBlob).not.toHaveBeenCalled();
    expect(localStorage.getItem('social-video-history-v1')).toBeNull();
    await act(async () => deliveryCallback({ id: 'job-123', state: 'delivered', progress: 100 }));
    await user.click(screen.getByRole('button', { name: /^History/ }));
    await screen.findByRole('heading', { name: 'Download history' });
    expect(screen.getByRole('heading', { name: video.title })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByText('A little empty, for now.')).toBeTruthy();
  });
  it('keeps an interrupted file available for another save without recording success', async () => {
    const user = userEvent.setup();
    render(<App />);
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
    await act(async () => progressCallback({ id: 'job-123', state: 'completed', progress: 100 }));
    const saveLink = screen.getByRole('link', { name: 'Save file' });
    saveLink.addEventListener('click', (event) => event.preventDefault());
    await user.click(saveLink);
    await act(async () => deliveryCallback({ id: 'job-123', state: 'completed', progress: 100, error: 'The transfer was interrupted. Click Save file to try again.' }));
    const retryLink = screen.getByRole('link', { name: 'Save file' });
    expect(retryLink.getAttribute('href')).toBe('/api/download/job-123/file');
    expect(screen.getByText(/The transfer was interrupted/)).toBeTruthy();
    expect(localStorage.getItem('social-video-history-v1')).toBeNull();
    retryLink.addEventListener('click', (event) => event.preventDefault());
    await user.click(retryLink);
    expect(monitorDelivery).toHaveBeenCalledTimes(2);
  });
  it('shows independent results and errors in batch mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Batch URLs/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Video URLs/ }),
      video.url + '\nhttps://example.com/missing',
    );
    await user.click(screen.getByRole('button', { name: /Analyze link/ }));
    await screen.findByRole('heading', { name: video.title });
    expect(screen.getByText('Video unavailable')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/batch/info', {
      urls: [video.url, 'https://example.com/missing'],
    });
  });
  it('keeps the page usable when the server rejects a URL', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/health') return { limits: { maxBatch: 10 } };
      throw new Error('This video is private.');
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Video URL' }), video.url);
    await user.click(screen.getByRole('button', { name: /Analyze link/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('This video is private.');
    expect(screen.getByRole('button', { name: /Analyze link/ }).disabled).toBe(false);
  });
});
