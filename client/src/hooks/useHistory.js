import { useState } from 'react';
const key = 'social-video-history-v1';
function read() {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list)
      ? list
          .filter((i) => i && typeof i.title === 'string' && typeof i.url === 'string')
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export function useHistory() {
  const [history, setHistory] = useState(read);
  const save = (items) => {
    setHistory(items);
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* Private mode / full storage: session history still works. */
    }
  };
  return {
    history,
    add: (item) =>
      save([{ ...item, downloadTime: new Date().toISOString() }, ...read()].slice(0, 100)),
    clear: () => save([]),
  };
}
