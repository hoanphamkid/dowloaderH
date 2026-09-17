import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monitorDelivery } from './api.js';

const completed = { id: 'job-123', state: 'completed', progress: 100, sending: false };
const respond = (status, httpStatus = 200) => ({
  ok: httpStatus >= 200 && httpStatus < 300,
  status: httpStatus,
  json: async () => status,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('native download confirmation', () => {
  it('polls status until delivery is confirmed and never fetches the media', async () => {
    fetch.mockResolvedValueOnce(respond({ ...completed, sending: true }))
      .mockResolvedValue(respond({ ...completed, state: 'delivered' }));
    const update = vi.fn();
    monitorDelivery('job-123', update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledWith({ id: 'job-123', state: 'delivered', progress: 100, error: null });
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url === '/api/download/job-123/status')).toBe(true);
  });

  it('releases the save button when the browser never starts a transfer', async () => {
    fetch.mockResolvedValue(respond(completed));
    const update = vi.fn();
    monitorDelivery('job-123', update, { startTimeout: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed', error: expect.stringContaining('chưa bắt đầu tải') }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(update).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('allows retry after a started transfer disconnects', async () => {
    fetch.mockResolvedValueOnce(respond({ ...completed, sending: true }))
      .mockResolvedValue(respond(completed));
    const update = vi.fn();
    monitorDelivery('job-123', update);
    await vi.advanceTimersByTimeAsync(2000);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed', error: expect.stringContaining('bị gián đoạn') }));
  });

  it('requires preparation again when the file has expired', async () => {
    fetch.mockResolvedValue(respond({ error: 'Not found' }, 404));
    const update = vi.fn();
    monitorDelivery('job-123', update);
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed', error: expect.stringContaining('hết hạn') }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops after repeated connection failures without reporting delivery', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const update = vi.fn();
    monitorDelivery('job-123', update);
    await vi.advanceTimersByTimeAsync(10000);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed', error: expect.stringContaining('Chưa thể xác nhận') }));
    expect(update).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('ignores a pending status response after monitoring is stopped', async () => {
    let resolve;
    fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const update = vi.fn();
    const stop = monitorDelivery('job-123', update);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    resolve(respond({ ...completed, state: 'delivered' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(update).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
