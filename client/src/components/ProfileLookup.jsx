import { useState } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CircleHelp,
  Clipboard,
  Code2,
  Download,
  Globe2,
  Heart,
  Languages,
  List,
  LoaderCircle,
  Lock,
  MessageCircle,
  Music2,
  Play,
  Scissors,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react';
import { api } from '../services/api.js';

const numberFormat = new Intl.NumberFormat('vi-VN');

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '0';
  try {
    return numberFormat.format(BigInt(String(value)));
  } catch {
    return String(value);
  }
}

function formatDate(value) {
  if (!value) return 'Không có thông tin';
  const match = String(value).match(/^(\d{2}:\d{2}:\d{2})\s*\|\|\s*(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[2]}/${match[3]}/${match[4]} · ${match[1]}` : String(value);
}

function valueOrFallback(value) {
  if (value === null || value === undefined || value === '') return 'Không có thông tin';
  return typeof value === 'boolean' ? (value ? 'Có' : 'Không') : String(value);
}

function countryName(value) {
  if (!value) return 'Không có thông tin';
  const code = String(value).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return String(value);
  try {
    return `${new Intl.DisplayNames(['vi'], { type: 'region' }).of(code) || code} ${[...code]
      .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
      .join('')}`;
  } catch {
    return code;
  }
}

function setting(value, labels) {
  return value === null || value === undefined ? 'Không có thông tin' : labels[value] || String(value);
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="profile-detail">
      <p><Icon size={13} />{label}</p>
      <strong>{valueOrFallback(children)}</strong>
    </div>
  );
}

function DetailGroup({ title, icon: Icon, children, open = false }) {
  return (
    <details className="profile-group" open={open}>
      <summary>
        <span><Icon size={15} />{title}</span>
        <span className="profile-chevron">⌄</span>
      </summary>
      <div className="profile-detail-grid">{children}</div>
    </details>
  );
}

function Stat({ icon: Icon, label, value, className }) {
  return (
    <div className="profile-stat">
      <Icon size={17} className={className} />
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function videoMetric(value) {
  return formatNumber(value);
}

function videoDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Không có ngày';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
  }).format(new Date(timestamp * 1000));
}

function VideoCard({ item }) {
  if (!item) return null;
  return (
    <article className="profile-video-card">
      <a className="profile-video-thumb" href={item.url || '#'} target="_blank" rel="noreferrer">
        {item.thumbnail ? <img src={item.thumbnail} alt={item.title} loading="lazy" /> : <Play size={24} />}
        <span><Play size={14} /> Xem</span>
      </a>
      <div className="profile-video-copy">
        <h4>{item.title}</h4>
        <p>@{item.author?.username || 'unknown'} · {videoDate(item.createdAt)}</p>
        <div className="profile-video-metrics">
          <span>♥ {videoMetric(item.stats?.likes)}</span>
          <span>▣ {videoMetric(item.stats?.comments)}</span>
          <span>↗ {videoMetric(item.stats?.shares)}</span>
        </div>
        {item.url && <a className="profile-video-link" href={item.url} target="_blank" rel="noreferrer">Mở video TikTok <ArrowUpRight size={13} /></a>}
      </div>
    </article>
  );
}

function VideoCollection({ title, items, empty, featured = false }) {
  return (
    <section className={`profile-video-section ${featured ? 'is-featured' : ''}`}>
      <div className="profile-video-heading">
        <h3>{title}</h3>
        {items?.length > 0 && <span>{items.length} video</span>}
      </div>
      {items?.length ? <div className="profile-video-grid">{items.map((item) => <VideoCard key={item.id} item={item} />)}</div> : <p className="profile-content-empty">{empty}</p>}
    </section>
  );
}

export default function ProfileLookup() {
  const [input, setInput] = useState('');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function lookup(event) {
    event.preventDefault();
    const value = input.trim();
    if (!value) {
      setError('Vui lòng nhập username, ID hoặc link TikTok.');
      setProfile(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setProfile(await api('/profile/info', { input: value }));
    } catch (requestError) {
      setProfile(null);
      setError(requestError.message || 'Không thể lấy thông tin tài khoản.');
    } finally {
      setLoading(false);
    }
  }

  async function paste() {
    try {
      setInput(await navigator.clipboard.readText());
      setError('');
    } catch {
      setError('Không thể đọc clipboard. Hãy dán thủ công bằng Ctrl+V.');
    }
  }

  const user = profile?.user;
  const stats = profile?.stats;
  const content = profile?.content || {};
  const settings = user?.settings || {};
  const tabs = user?.tabs || {};

  return (
    <div className="download-panel profile-panel">
      <div className="panel-top">
        <div>
          <span className="section-kicker">TRA CỨU CÔNG KHAI</span>
          <h2 className="profile-panel-title">Thông tin tài khoản TikTok</h2>
        </div>
        <span className="panel-hint"><Lock size={13} /> Không cần đăng ký</span>
      </div>
      <form onSubmit={lookup}>
        <label className="sr-only" htmlFor="profile-input">Link, username hoặc ID TikTok</label>
        <div className="profile-input-row">
          <UserRound className="input-icon" size={20} />
          <input
            id="profile-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="@username hoặc https://www.tiktok.com/@username"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" className="paste" onClick={paste} aria-label="Dán username hoặc link">
            <Clipboard size={15} /> <span>Dán</span>
          </button>
          <button type="submit" className="primary analyze" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}
            {loading ? 'Đang tra cứu…' : 'Tra cứu'}
            {!loading && <ArrowUpRight size={17} />}
          </button>
        </div>
        <div className="input-help profile-help">
          <span><ShieldCheck size={14} /> Chỉ hiển thị dữ liệu công khai.</span>
          <span>Ví dụ: <button type="button" onClick={() => setInput('@tiktok')}>@tiktok</button></span>
        </div>
      </form>
      {error && (
        <div className="error-message" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Đóng thông báo lỗi"><X size={16} /></button>
        </div>
      )}
      {loading && <div className="analyzing" role="status"><LoaderCircle className="spin" size={16} /> Đang lấy thông tin tài khoản…</div>}
      {user && stats && (
        <div className="profile-result fade-in">
          <div className="profile-identity">
            <div className={`profile-avatar-wrap ${user.live ? 'is-live' : ''}`}>
              {user.avatar ? <img src={user.avatar} alt={`Ảnh đại diện ${user.nickname}`} /> : <UserRound size={32} />}
              {user.live && <span>LIVE</span>}
            </div>
            <div className="profile-identity-copy">
              <h2>{user.nickname || user.username} {user.verified && <BadgeCheck size={17} className="verified" />}</h2>
              <p>@{user.username}</p>
              <div className="profile-bio">{user.signature || 'Tài khoản chưa có tiểu sử.'}</div>
            </div>
            <a className="profile-open" href={user.profileUrl || profile.sourceUrl} target="_blank" rel="noreferrer">
              Mở TikTok <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="profile-stats">
            <Stat icon={Users} label="Follower" value={stats.followers} className="pink" />
            <Stat icon={UserPlus} label="Đang follow" value={stats.following} className="cyan" />
            <Stat icon={Heart} label="Lượt thích" value={stats.likes} className="red" />
            <Stat icon={Video} label="Video" value={stats.videos} className="yellow" />
            <Stat icon={UserRound} label="Bạn bè" value={stats.friends} className="violet" />
          </div>
          <div className="profile-content">
            <VideoCollection
              title="Video đã đăng"
              items={content.videos || []}
              empty="Chưa lấy được danh sách video công khai của tài khoản này."
            />
            <VideoCollection
              title="Bài đăng lại"
              items={content.reposts || []}
              empty={content.repostsPublic ? 'Tài khoản chưa có bài đăng lại hoặc TikTok không trả dữ liệu.' : 'Tài khoản chưa công khai tab bài đăng lại.'}
            />
            <VideoCollection
              title="Video đầu tiên trong danh sách đã thích"
              items={content.likedFirst ? [content.likedFirst] : []}
              featured
              empty={content.likesPublic ? 'Tài khoản chưa có video đã thích hoặc TikTok không trả dữ liệu.' : 'Tài khoản đang ẩn danh sách video đã thích.'}
            />
          </div>
          <div className="profile-groups">
            <div className="profile-group-heading">
              <h3>Thông tin chi tiết</h3>
              <span>Bấm vào từng nhóm để xem</span>
            </div>
            <DetailGroup title="Thông tin tài khoản" icon={UserRound} open>
              <Detail icon={UserRound} label="ID">{user.id}</Detail>
              <Detail icon={CalendarDays} label="Ngày tạo tài khoản">{formatDate(user.createTime)}</Detail>
              <Detail icon={Globe2} label="Khu vực">{countryName(user.region)}</Detail>
              <Detail icon={Languages} label="Ngôn ngữ">{user.language}</Detail>
              <Detail icon={UserRound} label="Trạng thái">{user.privateAccount ? 'Tài khoản riêng tư' : 'Tài khoản công khai'}</Detail>
              <Detail icon={CalendarDays} label="Lần sửa username">{formatDate(user.usernameModifyTime)}</Detail>
            </DetailGroup>
            <DetailGroup title="Nội dung & hồ sơ" icon={Music2}>
              <Detail icon={Users} label="Đăng lại">{tabs.repost ? 'Cho phép xem bài đăng lại' : 'Không cho phép xem bài đăng lại'}</Detail>
              <Detail icon={List} label="Danh sách phát">{tabs.playlist ? 'Có danh sách phát' : 'Không có danh sách phát'}</Detail>
              <Detail icon={Heart} label="Video đã thích">{user.privateAccount ? 'Đang ẩn' : 'Hiển thị theo cài đặt'}</Detail>
              <Detail icon={Music2} label="Music tab">{tabs.music}</Detail>
              <Detail icon={CircleHelp} label="Q&A tab">{tabs.question}</Detail>
            </DetailGroup>
            <DetailGroup title="Quyền riêng tư & quyền hạn" icon={ShieldCheck}>
              <Detail icon={MessageCircle} label="Bình luận">{setting(settings.comment, { 0: 'Mọi người', 1: 'Bạn bè', 2: 'Không ai cả' })}</Detail>
              <Detail icon={Users} label="Duet">{setting(settings.duet, { 0: 'Mọi người', 1: 'Bạn bè', 2: 'Không cho phép' })}</Detail>
              <Detail icon={Scissors} label="Ghép nối">{setting(settings.stitch, { 0: 'Mọi người', 1: 'Bạn bè', 2: 'Không cho phép' })}</Detail>
              <Detail icon={Download} label="Cho phép tải video">{setting(settings.download, { 0: 'Không cho phép', 1: 'Cho phép' })}</Detail>
              <Detail icon={Users} label="Following">{setting(settings.followingVisibility, { 1: 'Có thể xem', 2: 'Đã ẩn' })}</Detail>
              <Detail icon={Code2} label="Embed">{settings.embedBanned ? 'Bị chặn' : 'Được phép'}</Detail>
            </DetailGroup>
          </div>
        </div>
      )}
    </div>
  );
}
