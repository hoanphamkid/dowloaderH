import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clipboard,
  Download,
  History as HistoryIcon,
  Layers,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api, monitorJob, monitorDelivery, API_URL } from './services/api.js';
import { useHistory } from './hooks/useHistory.js';
import PlatformIcon, { platforms } from './components/PlatformIcon.jsx';
import VideoCard from './components/VideoCard.jsx';
import BatchLinks from './components/BatchLinks.jsx';
import History from './pages/History.jsx';
import InteractiveBackground from './components/InteractiveBackground.jsx';
import { detectPlatformFromUrl, platformLabel } from './utils/platform.js';
import { errorMessage } from './utils/errorMessage.js';
export default function App() {
  const cleanDonationMessage = (message = '') =>
    message
      .replace(/\b(?:FT|APP|QR|REF|TXN)[A-Z0-9_-]+\b/gi, '')
      .replace(/\b[A-Z0-9]{12,}\b/gi, '')
      .replace(/\s*[/|_-]?\s*\d{6,}\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  const donorName = (item) => {
    if (item.name && item.name !== 'Một người bạn') return item.name;
    const match = String(item.message || '').match(/^(.{2,60}?)\s+(?:chuyen tien|thanh toan|ung ho|donate)\b/i);
    return match?.[1]?.trim() || item.name || 'Một người bạn';
  };
  const [page, setPage] = useState('home'),
    [mode, setMode] = useState('single'),
    [url, setUrl] = useState(''),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [maxBatch, setMaxBatch] = useState(10),
    [online, setOnline] = useState(null),
    [menu, setMenu] = useState(false),
    [showNotice, setShowNotice] = useState(true),
    [showYoutubeWarning, setShowYoutubeWarning] = useState(false),
    [donations, setDonations] = useState([]);
  const { history, add, clear } = useHistory();
  const stops = useRef(new Map()),
    itemsRef = useRef(items),
    addRef = useRef(add),
    saveLocks = useRef(new Set());
  itemsRef.current = items;
  addRef.current = add;
  const detectedPlatforms = useMemo(
    () => [...new Set(url.split(/\r?\n/).map(detectPlatformFromUrl).filter(Boolean))],
    [url],
  );
  useEffect(() => {
    api('/health')
      .then((data) => setMaxBatch(data.limits.maxBatch))
      .catch(() => {});
    return () => {
      for (const stop of stops.current.values()) stop();
    };
  }, []);
  useEffect(() => {
    api('/donations').then((data) => setDonations(data.donations || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const key = 'hoanpham-visitor-id';
    const id = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, id);
    const heartbeat = () =>
      fetch(`${API_URL}/api/visitors/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
        .then((response) => response.json())
        .then((data) => setOnline(data.online))
        .catch(() => {});
    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, []);
  const patch = (id, changes) =>
    setItems((old) => old.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  const navigate = (target) => {
    setPage(target);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const section = (id) => {
    setPage('home');
    setMenu(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const active = items.some(
    (i) => i.job && !['failed', 'delivered', 'expired', 'completed'].includes(i.job.state),
  );
  const closeWelcomeNotice = () => {
    setShowNotice(false);
    setShowYoutubeWarning(true);
  };
  async function analyze(event) {
    event?.preventDefault();
    setError('');
    const urls = [
      ...new Set(
        url
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (!urls.length) {
      setError('Bạn hãy dán liên kết video để bắt đầu.');
      return;
    }
    if (urls.length > (mode === 'batch' ? maxBatch : 1)) {
      setError(
        `Bạn chỉ có thể nhập tối đa ${mode === 'batch' ? maxBatch : 1} liên kết.`,
      );
      return;
    }
    if (
      urls.some((value) => {
        try {
          return !['http:', 'https:'].includes(new URL(value).protocol);
        } catch {
          return true;
        }
      })
    ) {
      setError('Liên kết chưa hợp lệ. Hãy nhập đầy đủ https:// hoặc http://.');
      return;
    }
    setLoading(true);
    try {
      const results =
        mode === 'single'
          ? [{ url: urls[0], video: await api('/video/info', { url: urls[0] }) }]
          : (await api('/batch/info', { urls })).results;
      setItems(
        results.map((result) => ({
          ...result,
          id: crypto.randomUUID(),
          selected: result.video?.formats[0]?.id,
        })),
      );
    } catch (error) {
      setError(errorMessage(error.message, error.code));
    } finally {
      setLoading(false);
    }
  }
  function save(id) {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item || saveLocks.current.has(id)) return;
    saveLocks.current.add(id);
    const target = item.job.id;
    patch(id, { job: { ...item.job, state: 'saving', error: null, progress: 100 } });
    // The clicked <a download> streams the file using the browser download manager.
    // Only small JSON status messages pass through fetch; no Blob or synthetic click.
    const stop = monitorDelivery(target, (data) => {
      patch(id, { job: { ...item.job, ...data } });
      if (data.state === 'delivered') {
        addRef.current({
          ...item.video,
          formats: undefined,
          format: item.video.formats.find((f) => f.id === item.selected)?.label,
        });
      }
      if (data.state !== 'saving') {
        saveLocks.current.delete(id);
        stops.current.delete(`save-${id}`);
      }
    });
    stops.current.set(`save-${id}`, stop);
  }
  async function download(id) {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    const format = item.video.formats.find((f) => f.id === item.selected);
    if (!format) return;
    patch(id, { job: { state: 'preparing', progress: 0 } });
    try {
      const job = await api(format.type === 'audio' ? '/audio/download' : '/video/download', {
        url: item.video.url,
        formatId: format.id,
        type: format.type,
      });
      patch(id, { job });
      const stop = monitorJob(job.jobId, (data) => {
        patch(id, { job: data });
        if (data.state === 'completed') {
          stops.current.delete(id);
        }
        if (data.state === 'failed') stops.current.delete(id);
      });
      stops.current.set(id, stop);
    } catch (error) {
      patch(id, { job: { state: 'failed', error: error.message, progress: 0 } });
    }
  }
  async function paste() {
    try {
      setUrl(await navigator.clipboard.readText());
      setError('');
    } catch {
      setError('Không thể đọc bộ nhớ tạm. Nhấn Ctrl+V hoặc nhấn giữ ô nhập để dán liên kết.');
    }
  }
  return (
    <div className="app-shell">
      <InteractiveBackground />
      {showNotice && (
        <div className="welcome-backdrop" role="presentation" onMouseDown={closeWelcomeNotice}>
          <section className="welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="welcome-close" onClick={closeWelcomeNotice} aria-label="Đóng thông báo"><X size={18} /></button>
            <h2 id="welcome-title"><span>⚡</span> Thông Báo <span>⚡</span></h2>
            <p className="welcome-intro">Xin chào mình là Hoàn Phạm,<br />mình là sinh viên IT nhưng mình không biết code,<br />mình chỉ biết <strong>vibe code :)))</strong></p>
            <p className="welcome-note">Mình đang học hỏi mỗi ngày và tự làm công cụ nhỏ này để mọi người tải video dễ dàng hơn.</p>
            <button className="primary welcome-button" onClick={closeWelcomeNotice}>Đã hiểu <ArrowRight size={16} /></button>
          </section>
        </div>
      )}
      {showYoutubeWarning && (
        <div className="welcome-backdrop youtube-warning-backdrop" role="presentation" onMouseDown={() => setShowYoutubeWarning(false)}>
          <section className="youtube-warning" role="alertdialog" aria-modal="true" aria-labelledby="youtube-warning-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="youtube-warning-close" onClick={() => setShowYoutubeWarning(false)} aria-label="Đóng cảnh báo"><X size={15} /></button>
            <h2 id="youtube-warning-title"><span>⚠</span> Thông Báo <span>⚠</span></h2>
            <p>Video từ YouTube hiện chưa thể tải vì nền tảng đang giới hạn truy cập.</p>
            <p>Vui lòng thử lại sau hoặc sử dụng liên kết từ nền tảng khác.</p>
            <button className="primary welcome-button" onClick={() => setShowYoutubeWarning(false)}>Đã hiểu <ArrowRight size={16} /></button>
          </section>
        </div>
      )}
      <header className="navbar">
        <button
          className="logo"
          onClick={() => navigate('home')}
          aria-label="Hoan Pham Downloader home"
        >
          <span className="logo-icon">
            <ArrowDownToLine size={23} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">Hoan Pham</span><span className="logo-light">Downloader</span>
            <small>CREATED BY HOAN PHAM</small>
          </span>
        </button>
        <nav className={menu ? 'open' : ''} aria-label="Main navigation">
          <button className={page === 'home' ? 'nav-active' : ''} onClick={() => navigate('home')}>
            Trình tải video
          </button>
          <button onClick={() => section('platforms')}>Nền tảng hỗ trợ</button>
          <button
            className={page === 'history' ? 'nav-active' : ''}
            onClick={() => navigate('history')}
          >
            <HistoryIcon size={16} />
            Lịch sử{history.length > 0 && <span className="count">{history.length}</span>}
          </button>
        </nav>
        <span className="nav-badge">
          <span />
          Miễn phí · Đơn giản · Riêng tư
        </span>
        {online !== null && (
          <span className="online-badge" title="Số người đang truy cập">
            <span /> {online} đang online
          </span>
        )}
        <button
          className="menu-button"
          aria-label="Đóng hoặc mở menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <main>
        {page === 'history' ? (
          <History
            history={history}
            onClear={clear}
            onReuse={(value) => {
              setUrl(value);
              setMode('single');
              navigate('home');
            }}
          />
        ) : (
          <>
            <section className="hero">
              <div className="hero-grid" aria-hidden="true" />
              <div className="hero-badge">
                <Sparkles size={13} />
                <span>NỘI DUNG BẠN YÊU THÍCH, LUÔN SẴN SÀNG</span>
              </div>
              <h1>
                Hoan Pham <span>Downloader</span>
              </h1>
              <p className="hero-subtitle">
                Dán liên kết video từ mạng xã hội và tải xuống chỉ trong vài giây.
                <br />
                Nhanh chóng, đơn giản và tiện lợi.
              </p>
              <div className="download-panel">
                <div className="panel-top">
                  <div className="mode-tabs">
                    <button
                      className={mode === 'single' ? 'selected' : ''}
                      onClick={() => setMode('single')}
                      disabled={loading}
                    >
                      <Link2 size={16} />
                      Một liên kết
                    </button>
                    <button
                      className={mode === 'batch' ? 'selected' : ''}
                      onClick={() => setMode('batch')}
                      disabled={loading}
                    >
                      <Layers size={16} />
                      Nhiều liên kết <span>MỚI</span>
                    </button>
                  </div>
                  <span className="panel-hint">
                    <LockKeyhole size={13} />
                    Không cần đăng ký
                  </span>
                </div>
                <form onSubmit={analyze}>
                  <label className="sr-only" htmlFor="video-url">
                    {mode === 'single' ? 'Liên kết video' : 'Các liên kết video, mỗi dòng một liên kết'}
                  </label>
                  <div className={`input-row ${mode === 'batch' ? 'batch-input' : ''}`}>
                    <Link2 className="input-icon" size={20} />
                    {mode === 'single' ? (
                      <input
                        id="video-url"
                        placeholder="Dán liên kết video tại đây..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        autoComplete="off"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? 'link-error' : undefined}
                        spellCheck="false"
                      />
                    ) : (
                      <BatchLinks value={url} onChange={setUrl} limit={maxBatch} disabled={loading || active} />
                    )}
                    <button
                      type="button"
                      className="paste"
                      hidden={mode === 'batch'}
                      onClick={paste}
                      aria-label="Dán liên kết từ bộ nhớ tạm"
                    >
                      <Clipboard size={15} />
                      <span>Dán</span>
                    </button>
                    <button type="submit" className="primary analyze" disabled={loading || active}>
                      {loading || active ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <ArrowDownToLine size={18} />
                      )}{' '}
                      {loading ? 'Đang lấy video…' : active ? 'Đang tải…' : 'Lấy video'}
                      {!loading && !active && <ArrowRight size={17} />}
                    </button>
                  </div>
                  {detectedPlatforms.length > 0 && (
                    <div className="platform-detection" aria-live="polite">
                      <span className="platform-detection-label">Nền tảng được nhận diện</span>
                      <div className="detected-platform-list">
                        {detectedPlatforms.map((platform) => (
                          <span className={`detected-platform detected-${platform}`} key={platform}>
                            <PlatformIcon platform={platform} size={15} />
                            {platformLabel(platform)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="input-help">
                    <span>
                      <ShieldCheck size={14} />
                      Chỉ tải nội dung bạn sở hữu hoặc được phép lưu.
                    </span>
                    <span>
                      {mode === 'batch' ? `Tối đa ${maxBatch} liên kết` : 'MP4, WebM, MP3 và nhiều định dạng khác'}
                    </span>
                  </div>
                </form>
                {error && (
                  <div className="error-message" id="link-error" role="alert">
                    {error}
                      <button onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
                      <X size={16} />
                    </button>
                  </div>
                )}
                {(loading || active) && (
                  <div className="analyzing" role="status">
                    <LoaderCircle className="spin" size={16} />
                    {loading ? 'Đang lấy thông tin và chất lượng video…' : 'Đang tải video. Tiến độ hiển thị bên dưới.'}
                  </div>
                )}
              </div>
              <div className="trust-row">
                <span>
                  <Check size={14} />
                  Chất lượng gốc
                </span>
                <i />
                <span>
                  <Check size={14} />
                  Không thêm hình mờ
                </span>
                <i />
                <span>
                  <Check size={14} />
                  Không quảng cáo
                </span>
              </div>
            </section>
            {items.length > 0 && (
              <section className="results">
                <div className="section-top">
                  <div>
                  <span className="section-kicker">SẴN SÀNG KHI BẠN SẴN SÀNG</span>
                    <h2>
                      Video của bạn{' '}
                      <span className="count">{items.filter((i) => i.video).length}</span>
                    </h2>
                  </div>
                  {items.filter((i) => i.video).length > 1 && (
                    <button
                      className="ghost"
                      disabled={active}
                      onClick={() => {
                        items
                          .filter((i) => i.video && i.job?.state !== 'delivered')
                          .forEach((i) => download(i.id));
                      }}
                    >
                      <Download size={16} />
                      Tải tất cả
                    </button>
                  )}
                </div>
                {items.map((item) => (
                  <VideoCard
                    key={item.id}
                    item={item}
                    onSelect={(id, selected) => patch(id, { selected, job: undefined })}
                    onDownload={download}
                    onSave={save}
                  />
                ))}
              </section>
            )}
            <section id="platforms" className="platform-section">
              <div className="platform-heading">
                <span className="tiny-line" />
                MỘT CÔNG CỤ. MỌI NỀN TẢNG CỦA BẠN.
                <span className="tiny-line" />
              </div>
              <div className="platforms">
                {platforms.map(([id, label, color]) => (
                  <div className="platform" key={id}>
                    <span style={{ color }}>
                      <PlatformIcon platform={id} size={25} />
                    </span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p>
                Cùng Vimeo, Dailymotion, Pinterest, Threads, Tumblr và các trang công khai khác{' '}
                <ArrowUpRight size={12} />
              </p>
            </section>
            <section className="privacy-strip">
              <div className="privacy-icon">
                <ShieldCheck size={23} />
              </div>
              <div>
                <h3>Video của bạn, quyền riêng tư của bạn.</h3>
                <p>Không cần tài khoản, không theo dõi, không lưu tệp. Chỉ bạn và nội dung của mình.</p>
              </div>
              <span>
                <LockKeyhole size={14} />
                RIÊNG TƯ NGAY TỪ THIẾT KẾ
              </span>
            </section>
          </>
        )}
      </main>
      <section className="donate-section" aria-labelledby="donate-section-title">
        <div className="donate-heading"><h2 id="donate-section-title">♡ Ủng hộ dự án ♡</h2></div>
        <div className="donate-columns"><div className="donate-card"><h3>☕ Giúp tôi duy trì website</h3><p className="donate-support-copy">Nếu website hữu ích với bạn, một lời ủng hộ sẽ giúp mình duy trì và phát triển dự án.</p><img className="donate-section-qr" src="/images/qr-payment.png" alt="Mã QR ủng hộ Phạm Thanh Hoàn" /><strong>PHẠM THANH HOÀN</strong><span>0945459491 · Ngân hàng MB</span></div><div className="donate-card donation-history"><h3>🎁 Lịch sử đóng góp</h3><div className="supporters-list">{donations.length ? donations.map((item) => { const message = cleanDonationMessage(item.message); return <article key={item.id}><small>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</small><b>{donorName(item)}</b><em>+{new Intl.NumberFormat('vi-VN').format(item.amount)}đ</em>{message && <i>{message}</i>}</article>; }) : <p>Chưa có lượt ủng hộ nào. Bạn sẽ là người đầu tiên!</p>}</div><footer className="donation-thanks">💖 Cảm ơn {donations.length} người đã ủng hộ 💖</footer></div></div>
      </section>
      <footer>
        <div>
          <span className="footer-symbol">
            <ArrowDownToLine size={16} />
          </span>
          <span>Hoan Pham Downloader</span>
          <span className="footer-caption">Dành cho những khoảnh khắc đáng lưu giữ.</span>
        </div>
        <div>
          <span>Tôn trọng người sáng tạo. Tải xuống có trách nhiệm.</span>
        </div>
      </footer>
    </div>
  );
}

