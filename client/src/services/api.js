export const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'hoanpham-downloader.vercel.app'
    ? 'https://dowloaderh-api.onrender.com'
    : '');
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
    .catch(() => ({
      success: false,
      code: 'SERVER_ERROR',
      error: 'Máy chủ tạm thời không khả dụng. Vui lòng thử lại sau.',
    }));
  if (!response.ok || data.error || data.success === false) {
    const error = new Error(
      data.message || data.error || 'Yêu cầu không thành công. Vui lòng thử lại.',
    );
    error.status = response.status;
    error.code = data.code;
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
          status.error || 'Tệp không còn khả dụng. Nhấn Tải xuống để chuẩn bị lại.',
        );
        return;
      }
      if (status.sending) seenTransfer = true;
      else if (status.error) {
        finish('completed', status.error);
        return;
      } else if (seenTransfer) {
        finish('completed', 'Quá trình lưu bị gián đoạn. Nhấn Lưu tệp để thử lại.');
        return;
      } else if (Date.now() - started >= startTimeout) {
        finish(
          'completed',
          'Trình duyệt chưa bắt đầu tải. Nhấn Lưu tệp và kiểm tra quyền tải xuống của trình duyệt.',
        );
        return;
      }
      if (Date.now() - started >= transferTimeout) {
        finish('completed', 'Kiểm tra tệp trong mục Tải xuống của trình duyệt.');
        return;
      }
    } catch (error) {
      if (stopped) return;
      if (error.status === 404) {
        finish('failed', 'Tệp đã hết hạn hoặc bị xóa. Nhấn Tải xuống để chuẩn bị lại.');
        return;
      }
      if (++errors >= 5) {
        finish(
          'completed',
          'Chưa thể xác nhận đã lưu tệp. Kiểm tra mục Tải xuống của trình duyệt trước khi thử lại.',
        );
        return;
      }
    }
    if (!stopped) timer = setTimeout(poll, interval);
  };
  timer = setTimeout(poll, interval);
  return stop;
}
