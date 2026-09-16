# Kết quả kiểm chứng — 16/09/2026

Môi trường thực tế: Windows, Node.js 22.19.0; yt-dlp 2026.08.19; FFmpeg/FFprobe 9.0.1. Executable portable đặt trong `.tools/` và được xác minh SHA256 khi tải.

| Kiểm tra | Kết quả |
|---|---|
| `npm run check` | Đạt: syntax JavaScript backend/scripts |
| `npm run build` | Đạt: React/Vite production bundle, import/export/JSX |
| Backend tests | 14/14 đạt: HTTP contract, Zod, Origin, SSRF IPv4/IPv6/DNS/CONNECT, filename, queue, cleanup, subprocess timeout, khôi phục download sau restart, HEAD không xóa file và truyền đầy đủ 8 MB khớp SHA256 |
| React/transfer tests | 12/12 đạt: validate URL, chọn Audio/đúng API, tiến trình, native Save file link, không fetch Blob, history chỉ sau delivered, thử lại/timeout/mất kết nối/hết hạn, batch partial failure |
| `npm run test:media` | 6/6 đầu ra đạt: MP4 ghép stream DASH, MP3 128/192/256/320, M4A nguồn |
| Kiểm tra file media | Mỗi đầu ra được FFmpeg decode thành công, SSE báo completed, attachment trả thành công, temp bị xóa, GET lại trả 409 |
| `GET /api/health` | HTTP 200, phiên bản và limits đúng |
| Frontend `http://127.0.0.1:5173` | HTTP 200 |
| YouTube thật qua proxy SSRF production | Big Buck Bunny của Blender (`aqz-KE-bpKQ`): title đúng, 635 giây, 41 lựa chọn định dạng |

Smoke test tạo media của chính ứng dụng để không phụ thuộc video bên ngoài; request metadata và file đi qua yt-dlp thật, FFmpeg thật, API/queue/SSE thật. Proxy fixture chỉ được gắn trong process test. Test này không thay thế kiểm tra SSRF của production proxy; các trường hợp đó có bộ test riêng.

Chưa kiểm chứng trực quan bằng browser tích hợp: runtime không có browser khả dụng. Kiểm thử React DOM xác nhận hành vi, không xác nhận bố cục bằng ảnh chụp. Chưa kiểm thử tải live trên từng nền tảng TikTok/Facebook/Instagram/X…; việc hỗ trợ phụ thuộc extractor và quyền truy cập video. Không khẳng định mọi URL sẽ tải được.

Trong môi trường sandbox, Node subprocess cần quyền thực thi phù hợp. Các lệnh đã chạy từ môi trường được phép. Vitest fork worker từng timeout trên máy này; cấu hình cuối dùng `pool: threads`, `maxWorkers: 1` và đã chạy qua.

Kiểm tra bổ sung lỗi lưu tệp: truyền fixture 32 MiB qua Express + Vite proxy với header tương tự trình duyệt, SHA256 khớp. HEAD của hai file thực tế trả HTTP 200, đúng Content-Length, header attachment/MIME/CORS hợp lệ. Chưa tái hiện được nguyên nhân cụ thể của `fetch` thất bại trong trình duyệt người dùng. Luồng cuối dùng liên kết tải trực tiếp từ cú bấm thật, không tự fetch video/Blob; trình duyệt quản lý việc lưu.
