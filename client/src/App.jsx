import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
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
import History from './pages/History.jsx';
import InteractiveBackground from './components/InteractiveBackground.jsx';
import { detectPlatformFromUrl, platformLabel } from './utils/platform.js';
export default function App() {
  const [page, setPage] = useState('home'),
    [mode, setMode] = useState('single'),
    [url, setUrl] = useState(''),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [maxBatch, setMaxBatch] = useState(10),
    [online, setOnline] = useState(null),
    [menu, setMenu] = useState(false);
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
      setError('Paste a public video URL to get started.');
      return;
    }
    if (urls.length > (mode === 'batch' ? maxBatch : 1)) {
      setError(
        `Please enter at most ${mode === 'batch' ? maxBatch : 1} URL${mode === 'batch' ? 's' : ''}.`,
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
      setError('Please use a complete URL beginning with https:// or http://.');
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
      setError(error.message);
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
      setError('Clipboard access is unavailable. Paste your link with Ctrl+V or long-press.');
    }
  }
  return (
    <div className="app-shell">
      <InteractiveBackground />
      <header className="navbar">
        <button
          className="logo"
          onClick={() => navigate('home')}
          aria-label="HoanPhamdowloader home"
        >
          <span className="logo-icon">
            <ArrowDownToLine size={23} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">HoanPham</span><span className="logo-light">dowloader</span>
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
          aria-label="Toggle menu"
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
                Lưu video <span>bạn yêu thích</span>
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
                        spellCheck="false"
                      />
                    ) : (
                      <textarea
                        id="video-url"
                        placeholder={`Dán tối đa ${maxBatch} liên kết, mỗi dòng một liên kết…`}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        rows={4}
                      />
                    )}
                    <button
                      type="button"
                      className="paste"
                      onClick={paste}
                      aria-label="Dán liên kết từ bộ nhớ tạm"
                    >
                      <Clipboard size={15} />
                      <span>Dán</span>
                    </button>
                    <button type="submit" className="primary analyze" disabled={loading || active}>
                      {loading ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <ArrowDownToLine size={18} />
                      )}{' '}
                      {loading ? 'Đang phân tích…' : 'Tải xuống'}
                      {!loading && <ArrowRight size={17} />}
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
                  <div className="error-message" role="alert">
                    {error}
                      <button onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
                      <X size={16} />
                    </button>
                  </div>
                )}
                {loading && (
                  <div className="analyzing" role="status">
                    <LoaderCircle className="spin" size={16} />
                    Đang lấy thông tin và các định dạng có sẵn…
                  </div>
                )}
              </div>
              <div className="trust-row">
                <span>
                  <Check size={14} />
                  Original quality
                </span>
                <i />
                <span>
                  <Check size={14} />
                  No watermarks added
                </span>
                <i />
                <span>
                  <Check size={14} />
                  No ads. Ever.
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
            <section id="how-it-works" className="how-section">
              <div className="section-top">
                <div>
                  <span className="section-kicker">ĐƠN GIẢN HƠN. NHIỀU CẢM HỨNG HƠN.</span>
                  <h2>Từ liên kết đến thư viện chỉ trong vài giây.</h2>
                </div>
                <span className="three-steps">
                  BA BƯỚC ĐƠN GIẢN <ArrowDownToLine size={14} />
                </span>
              </div>
              <div className="steps">
                <article>
                  <div className="step-head">
                    <span className="step-icon">
                      <Link2 size={21} />
                    </span>
                    <span className="step-number">01</span>
                  </div>
                  <h3>Sao chép liên kết</h3>
                  <p>Tìm video công khai bạn yêu thích và sao chép liên kết từ nền tảng quen thuộc.</p>
                </article>
                <article>
                  <div className="step-head">
                    <span className="step-icon">
                      <Layers size={21} />
                    </span>
                    <span className="step-number">02</span>
                  </div>
                  <h3>Làm theo ý bạn</h3>
                  <p>Dán liên kết ở trên, rồi chọn chất lượng video hoặc định dạng âm thanh.</p>
                </article>
                <article>
                  <div className="step-head">
                    <span className="step-icon">
                      <ArrowDownToLine size={21} />
                    </span>
                    <span className="step-number">03</span>
                  </div>
                  <h3>Lưu về thiết bị</h3>
                  <p>
                    Nhấn tải xuống để lưu vào thiết bị. Sẵn sàng xem bất cứ khi nào bạn muốn.
                  </p>
                </article>
              </div>
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
            <section className="faq-section">
              <span className="section-kicker">MỘT VÀI ĐIỀU BẠN NÊN BIẾT</span>
              <h2>Câu hỏi thường gặp</h2>
              {[
                [
                  'Những nền tảng nào được hỗ trợ?',
                  'Video và âm thanh công khai từ YouTube, TikTok, Instagram, Facebook, X, Reddit, Vimeo, SoundCloud và các trang được yt-dlp hỗ trợ. Khả năng tải còn tùy nền tảng và từng video.',
                ],
                [
                  'Tôi có thể chỉ tải âm thanh không?',
                  'Có. Phân tích liên kết, chọn Âm thanh, rồi chọn MP3 ở 128, 192, 256 hoặc 320 kbps. M4A gốc sẽ hiện khi có sẵn. Việc chuyển đổi không làm tăng chất lượng âm thanh ban đầu.',
                ],
                [
                  'Video tải xuống được lưu ở đâu?',
                  'Trình duyệt lưu tệp vào thiết bị của bạn. Bản sao trên máy chủ sẽ bị xóa sau khi gửi, còn tệp bỏ dở mặc định hết hạn sau 30 phút. Lịch sử tải chỉ được lưu trong trình duyệt này.',
                ],
                [
                  'Tôi có thể tải nội dung nào?',
                  'Chỉ tải nội dung công khai mà bạn sở hữu hoặc được phép tải. Nội dung riêng tư, yêu cầu tài khoản, giới hạn độ tuổi, trả phí hoặc được bảo vệ DRM không được hỗ trợ.',
                ],
              ].map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <ChevronDown size={17} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </section>
          </>
        )}
      </main>
      <section className="donate-section" aria-labelledby="donate-section-title">
        <div className="donate-section-copy">
          <p className="eyebrow">ỦNG HỘ DỰ ÁN</p>
          <h2 id="donate-section-title">Giúp tôi duy trì website</h2>
          <p>Nếu website hữu ích với bạn, một lời ủng hộ sẽ giúp tôi duy trì và phát triển dự án.</p>
          <strong>PHẠM THANH HOÀN</strong>
          <span>0945459491</span>
        </div>
        <img className="donate-section-qr" src="/images/qr-payment.png" alt="Mã QR ủng hộ Phạm Thanh Hoàn" />
      </section>
      <footer>
        <div>
          <span className="footer-symbol">
            <ArrowDownToLine size={16} />
          </span>
          <span>HoanPhamdowloader</span>
          <span className="footer-caption">Dành cho những khoảnh khắc đáng lưu giữ.</span>
        </div>
        <div>
          <button onClick={() => section('how-it-works')}>Cách hoạt động</button>
          <span>Tôn trọng người sáng tạo. Tải xuống có trách nhiệm.</span>
        </div>
      </footer>
    </div>
  );
}
