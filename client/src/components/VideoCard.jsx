import { useEffect, useState } from 'react';
import { Download, Clock, CheckCircle2, LoaderCircle, Music2, Video, ImageOff, Play, X } from 'lucide-react';
import PlatformIcon from './PlatformIcon.jsx';
import { duration, fileSize } from '../utils/format.js';
import { platformLabel } from '../utils/platform.js';
import { API_URL } from '../services/api.js';
import { errorMessage } from '../utils/errorMessage.js';
const labels = {
  queued: 'Đang xếp hàng',
  fetching: 'Đang lấy thông tin…',
  preparing: 'Đang chuẩn bị…',
  downloading: 'Đang tải…',
  merging: 'Đang ghép âm thanh…',
  processing: 'Đang xử lý…',
  completed: 'Sẵn sàng lưu tệp',
  saving: 'Đang gửi tệp đến trình duyệt…',
  delivered: 'Đã tải xong',
  expired: 'Tệp đã hết hạn',
  failed: 'Tải thất bại',
  'connection-error': 'Đang kết nối lại…',
};
export default function VideoCard({ item, onSelect, onDownload, onSave }) {
  const [tab, setTab] = useState(item.video?.formats[0]?.type || 'video');
  const [imageFailed, setImageFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches,
  );
  const [smoothProgress, setSmoothProgress] = useState(1);
  const { video, job } = item;
  useEffect(() => {
    if (!job || !['queued', 'fetching', 'preparing'].includes(job.state)) return undefined;
    setSmoothProgress((value) => Math.max(value, job.progress || 1));
    const timer = window.setInterval(() => {
      setSmoothProgress((value) => Math.min(99, value + 1));
    }, 350);
    return () => window.clearInterval(timer);
  }, [job?.state, job?.progress]);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (!previewOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [previewOpen]);
  if (!video)
    return (
      <article className="error-card">
        <strong>Không thể phân tích liên kết này</strong>
        <span>{item.url}</span>
        <p>{errorMessage(item.error)}</p>
      </article>
    );
  const phoneSafe = (format) => !isMobile || ['mp4', 'mp3', 'm4a', 'webm'].includes(format.ext);
  const available = video.formats.filter((f) => f.type === tab && phoneSafe(f));
  const shown = available.length
    ? available
    : video.formats.filter((f) => f.type === 'audio' && phoneSafe(f));
  const selected = video.formats.find((f) => f.id === item.selected && phoneSafe(f));
  const changeTab = (next) => {
    setTab(next);
    const first = video.formats.find((f) => f.type === next);
    if (first && selected?.type !== next) onSelect(item.id, first.id);
  };
  const busy = job && !['failed', 'delivered', 'completed', 'expired'].includes(job.state);
  const progress = ['queued', 'fetching', 'preparing'].includes(job?.state)
    ? Math.max(1, Math.round(smoothProgress))
    : Math.round(job?.progress || 0);
  return (
    <article className="video-card">
      <button
        type="button"
        className={`preview-image ${video.previewUrl ? 'is-playable' : ''}`}
        onClick={() => video.previewUrl && setPreviewOpen(true)}
        disabled={!video.previewUrl}
        aria-label={video.previewUrl ? `Xem video ${video.title}` : 'Không có bản xem trước'}
      >
        {video.thumbnail && !imageFailed ? (
          <img
            src={video.thumbnail}
            alt={`Ảnh thu nhỏ của ${video.title}`}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ImageOff size={36} />
        )}
        {video.previewUrl && <span className="preview-play"><Play size={24} fill="currentColor" /></span>}
        <span className="duration">{duration(video.duration)}</span>
      </button>
      <div className="video-details">
        <div className="eyebrow">
          <PlatformIcon platform={video.platform} size={15} />
          <strong>{platformLabel(video.platform)}</strong>
          <span>•</span>
          {video.author}
        </div>
        <h3>{video.title}</h3>
        <div className="format-tabs">
          <button
            className={tab === 'video' ? 'active' : ''}
            onClick={() => changeTab('video')}
            disabled={busy || !video.formats.some((f) => f.type === 'video')}
          >
            <Video size={15} />
            Video
          </button>
          <button
            className={tab === 'audio' ? 'active' : ''}
            onClick={() => changeTab('audio')}
            disabled={busy || !video.formats.some((f) => f.type === 'audio')}
          >
            <Music2 size={15} />
            Âm thanh
          </button>
        </div>
        <div className="download-options">
          <label className="sr-only" htmlFor={`format-${item.id}`}>
            Định dạng tải xuống
          </label>
          <select
            id={`format-${item.id}`}
            value={shown.some((f) => f.id === item.selected) ? item.selected : ''}
            onChange={(e) => onSelect(item.id, e.target.value)}
            disabled={busy}
          >
            <option value="" disabled>
              Chọn chất lượng
            </option>
            {shown.map((f) => (
              <option value={f.id} key={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {['completed', 'saving'].includes(job?.state) ? (
            <a
              className="primary compact save-file-link"
              href={`${API_URL}/api/download/${encodeURIComponent(job.id)}/file`}
              download={job.filename || true}
              aria-disabled={job.state === 'saving'}
              onClick={(event) => {
                if(job.state === 'saving') { event.preventDefault(); return; }
                onSave(item.id);
              }}
            >
              {job.state === 'saving' ? <LoaderCircle size={17} className="spin"/> : <Download size={17}/>}
              {job.state === 'saving' ? 'Đang lưu…' : 'Lưu tệp'}
            </a>
          ) : (
            <button
              className="primary compact"
              disabled={busy || !selected}
              onClick={() => onDownload(item.id)}
            >
              {busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}{' '}
              {busy ? 'Đang tải…' : 'Tải xuống'}
            </button>
          )}
        </div>
        <div className="format-note">
          {selected ? fileSize(selected.size) : 'Chọn một định dạng có sẵn'}
          {selected?.bitrate
            ? ' · Chuyển đổi từ âm thanh gốc; bitrate cao hơn không làm tăng chất lượng nguồn.'
            : ''}
        </div>
        {job && (
          <div className={`job-status ${job.state === 'failed' ? 'failed' : ''}`} role="status">
            <div>
              <span>
                {job.state === 'delivered' ? <CheckCircle2 size={15} /> : <Clock size={14} />}{' '}
                {labels[job.state] || 'Đang xử lý…'}
                {job.queuePosition > 0 ? ` · Vị trí chờ: ${job.queuePosition}` : ''}
              </span>
              <span>{progress}%</span>
            </div>
            <progress aria-label="Tiến độ tải video" max="100" value={progress} />
            {job.error && <p>{errorMessage(job.error)}</p>}
          </div>
        )}
      </div>
      {previewOpen && (
        <div className="video-preview-backdrop" role="presentation" onMouseDown={() => setPreviewOpen(false)}>
          <div
            className="video-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Xem video ${video.title}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="video-preview-close" onClick={() => setPreviewOpen(false)} aria-label="Đóng video">
              <X size={22} />
            </button>
            <video src={video.previewUrl} poster={video.thumbnail || undefined} controls autoPlay playsInline>
              Trình duyệt của bạn không hỗ trợ phát video.
            </video>
          </div>
        </div>
      )}
    </article>
  );
}
