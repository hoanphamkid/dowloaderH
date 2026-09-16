import { History as HistoryIcon, Trash2, ArrowUpRight } from 'lucide-react';
import PlatformIcon from '../components/PlatformIcon.jsx';
export default function History({ history, onClear, onReuse }) {
  return (
    <section className="history-page">
      <div className="section-top">
        <div>
          <span className="section-kicker">BỘ SƯU TẬP CỦA BẠN</span>
          <h1>Lịch sử tải xuống</h1>
          <p>Được lưu trên thiết bị này. Tệp luôn thuộc về bạn.</p>
        </div>
        {history.length > 0 && (
          <button className="ghost" onClick={onClear}>
            <Trash2 size={16} />
            Xóa lịch sử
          </button>
        )}
      </div>
      {!history.length ? (
        <div className="empty-state">
          <HistoryIcon size={36} />
          <h3>Chưa có video nào</h3>
          <p>Các video đã tải xong sẽ xuất hiện ở đây.</p>
          <button className="primary" onClick={() => onReuse('')}>
            Tìm video đầu tiên <ArrowUpRight size={17} />
          </button>
        </div>
      ) : (
        <div className="history-list">
          {history.map((item, index) => (
            <article key={`${item.downloadTime}-${index}`}>
              <div className="history-platform">
                <PlatformIcon platform={item.platform} />
              </div>
              <div>
                <h3>{item.title}</h3>
                <p>
                  {item.platform} · {new Date(item.downloadTime).toLocaleString()} · {item.format}
                </p>
              </div>
              <button className="ghost" onClick={() => onReuse(item.url)}>
                Phân tích lại <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
