import { useState } from 'react';
import { Clipboard, Plus, X } from 'lucide-react';

export default function BatchLinks({ value, onChange, limit, disabled }) {
  const [minimumRows, setMinimumRows] = useState(2);
  const [notice, setNotice] = useState('');
  const rows = value.split('\n');
  while (rows.length < Math.min(minimumRows, limit)) rows.push('');
  function update(index, text) {
    const incoming = text.split(/\r?\n/).map((line) => line.trim());
    const next = [...rows];
    next.splice(index, 1, ...incoming);
    if (next.length > limit) {
      setNotice(`Tối đa ${limit} ô liên kết. Hãy dán ít liên kết hơn.`);
      return;
    }
    setNotice('');
    onChange(next.join('\n'));
  }
  return (
    <div className="batch-links">
      <p className="batch-caption">Mỗi ô một liên kết video</p>
      {rows.map((text, index) => (
        <div className="batch-link-card" key={index}>
          <label htmlFor={`batch-link-${index}`}>Liên kết {index + 1}</label>
          <div className="batch-link-controls">
            <input id={`batch-link-${index}`} value={text} disabled={disabled}
              placeholder="https://…" autoComplete="off" spellCheck={false}
              onChange={(event) => update(index, event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text');
                if (/[\r\n]/.test(pasted)) { event.preventDefault(); update(index, pasted); }
              }} />
            <button type="button" className="paste" disabled={disabled}
              aria-label={`Dán liên kết ${index + 1}`} onClick={async () => {
                try { update(index, await navigator.clipboard.readText()); }
                catch { setNotice('Không đọc được bộ nhớ tạm. Hãy dán trực tiếp vào ô nhập.'); }
              }}><Clipboard size={16} /><span>Dán</span></button>
            <button type="button" className="batch-remove" disabled={disabled}
              aria-label={`Xóa liên kết ${index + 1}`} onClick={() => {
                const next = rows.filter((_, i) => i !== index);
                setMinimumRows(Math.max(1, next.length));
                onChange(next.join('\n'));
              }}><X size={18} /></button>
          </div>
        </div>
      ))}
      <div className="batch-links-footer">
        <button type="button" className="batch-add" disabled={disabled || rows.length >= limit}
          onClick={() => { setMinimumRows(rows.length + 1); onChange([...rows, ''].join('\n')); }}>
          <Plus size={16} /> Thêm liên kết
        </button>
        <span>{rows.filter((row) => row.trim()).length}/{limit} liên kết</span>
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
