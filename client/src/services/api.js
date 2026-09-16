export const API_URL = import.meta.env.VITE_API_URL || '';
export async function api(path, body) {
  let response;
  try {
    response = await fetch(
      `${API_URL}/api${path}`,
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {},
    );
  } catch {
    throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại sau.');
  }
  const data = await response
    .json()
    .catch(() => ({ error: 'The server is unavailable. Check the backend and try again.' }));
  if (!response.ok || data.error) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export function monitorJob(id, onUpdate) {
  let stopped = false,
    source,
    timer;
  const finish = (data) => {
    if (stopped) return;
    onUpdate(data);
    if (['completed', 'failed', 'expired', 'delivered'].includes(data.state)) stop();
  };
  const poll = async () => {
    try {
      finish(await api(`/download/${id}/status`));
    } catch (error) {
      if (stopped) return;
      if (error.status === 404) {
        finish({ id, state: 'failed', error: error.message });
        return;
      }
      onUpdate({ id, state: 'connection-error', error: error.message });
    }
    if (!stopped) timer = setTimeout(poll, 2500);
  };
  const stop = () => {
    stopped = true;
    source?.close();
    clearTimeout(timer);
  };
  source = new EventSource(`${API_URL}/api/download/${id}/progress`);
  source.onmessage = (event) => {
    try {
      finish(JSON.parse(event.data));
    } catch {
      source.close();
      poll();
    }
  };
  source.onerror = () => {
    source.close();
    poll();
  };
  return stop;
}

export function monitorDelivery(
  id,
  onUpdate,
  { interval = 1000, startTimeout = 20000, transferTimeout = 15 * 60 * 1000 } = {},
) {
  let stopped = false,
    timer,
    seenTransfer = false,
    errors = 0;
  const started = Date.now();
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
  };
  const finish = (state, error) => {
    if (stopped) return;
    stop();
    onUpdate({ id, state, progress: 100, error: error || null });
  };
  const poll = async () => {
    try {
      const status = await api(`/download/${encodeURIComponent(id)}/status`);
      if (stopped) return;
      errors = 0;
      if (status.state === 'delivered') {
        finish('delivered');
        return;
      }
      if (['expired', 'failed'].includes(status.state)) {
        finish(
          'failed',
          status.error || 'This file is no longer available. Click Download to prepare it again.',
        );
        return;
      }
      if (status.sending) seenTransfer = true;
      else if (status.error) {
        finish('completed', status.error);
        return;
      } else if (seenTransfer) {
        finish('completed', 'The transfer was interrupted. Click Save file to try again.');
        return;
      } else if (Date.now() - started >= startTimeout) {
        finish(
          'completed',
          'The browser has not started the download. Click Save file and check the browser download permissions.',
        );
        return;
      }
      if (Date.now() - started >= transferTimeout) {
        finish('completed', 'Check your browser’s Downloads panel for the file.');
        return;
      }
    } catch (error) {
      if (stopped) return;
      if (error.status === 404) {
        finish('failed', 'This file expired or was removed. Click Download to prepare it again.');
        return;
      }
      if (++errors >= 5) {
        finish(
          'completed',
          'Cannot confirm the transfer. Check your browser’s Downloads panel before trying again.',
        );
        return;
      }
    }
    if (!stopped) timer = setTimeout(poll, interval);
  };
  timer = setTimeout(poll, interval);
  return stop;
}
