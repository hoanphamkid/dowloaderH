# Social Video Downloader

Ứng dụng React + Vite / Node.js + Express để tải **nội dung công khai mà bạn sở hữu hoặc có quyền tải xuống**. yt-dlp lấy metadata/tải stream ở backend; FFmpeg ghép video/audio và chuyển MP3. Không đăng nhập, không database, không cookie tài khoản, không vượt DRM/paywall/quyền truy cập.

## Chạy nhanh trên Windows 10/11

1. Cài [Node.js LTS](https://nodejs.org/en/download) (yêu cầu Node **22.12+**), mở lại PowerShell và kiểm tra `node --version`, `npm --version`.
2. Mở PowerShell trong thư mục dự án:

```powershell
cd D:\tool\social-video-downloader
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
npm run dev
```

Script setup tải **yt-dlp chính thức** và **FFmpeg Gyan essentials**, so sánh SHA256 từ nhà phát hành, lưu riêng trong `.tools/`, cấu hình `.env`. Không thay đổi PATH hoặc cài toàn hệ thống. Cần kết nối Internet. `ExecutionPolicy Bypass` chỉ áp dụng tiến trình chạy script này.

Frontend: **http://127.0.0.1:5173**. Backend: **http://127.0.0.1:3000**. Chạy `npm run dev` khởi động cả hai; Ctrl+C để dừng.

Nếu đã cài yt-dlp/FFmpeg trên PATH, không cần script: sao chép `.env.example` thành `.env`. Hoặc tự đặt `YT_DLP_PATH` và `FFMPEG_PATH` là đường dẫn executable; đường dẫn `./` được tính từ thư mục dự án. Đặt `ffprobe.exe` cùng thư mục với `ffmpeg.exe`.

Cài thủ công: tải `yt-dlp.exe` tại [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases), tải/giải nén [FFmpeg Windows builds](https://www.gyan.dev/ffmpeg/builds/), thêm thư mục executable vào PATH hoặc `.env`. Không dùng file `.cmd` làm executable. Kiểm tra `yt-dlp --version`, `ffmpeg -version` và `ffprobe -version`.

## macOS / Linux

Cài Node.js LTS từ [nodejs.org](https://nodejs.org/en/download). Với Homebrew trên macOS:

```sh
brew install yt-dlp ffmpeg
cp .env.example .env
npm install
npm run dev
```

Ubuntu/Debian (Python 3.10+):

```sh
sudo apt update
sudo apt install ffmpeg pipx
pipx install 'yt-dlp[default]'
pipx ensurepath
# Mở lại terminal để PATH có hiệu lực
cp .env.example .env
npm install
npm run dev
```

Cập nhật yt-dlp thường xuyên vì nền tảng thay đổi: `pipx upgrade yt-dlp`, `brew upgrade yt-dlp`, hoặc chạy lại script Windows. Phiên bản yt-dlp phải hỗ trợ `--js-runtimes`; Node được truyền rõ ràng làm JS runtime. Không tự tải remote component. Tham khảo [hướng dẫn yt-dlp](https://github.com/yt-dlp/yt-dlp#installation).

## Lệnh phát triển và production

```sh
npm run dev                  # backend + frontend
npm run dev -w server        # chỉ Express; tương đương cd server && npm run dev
npm run dev -w client        # chỉ Vite; tương đương cd client && npm run dev
npm run check                # syntax backend/scripts
npm test                     # unit, HTTP, SSRF, queue, cleanup, subprocess
node scripts/smoke-test.js    # yt-dlp + FFmpeg thật, media fixture tự tạo
npm run build                # kiểm tra JSX/import và build frontend
npm start                    # Express phục vụ client/dist tại cổng 3000
```

`npm test` gồm 14 kiểm thử backend và 12 kiểm thử React/theo dõi giao tệp. UI test dùng một worker thread để tương thích Windows. `npm run test:media` là alias của smoke test. Kết quả đã chạy được ghi trong [TESTING.md](./TESTING.md).

Backend mặc định không tự restart khi sửa file để tránh cắt ngang lượt tải. Nếu cần phát triển backend với auto-reload, dùng `npm run dev:watch -w server`. Frontend vẫn cập nhật nóng. Vite dùng cổng cố định 5173 và báo lỗi nếu đã có phiên chạy, không âm thầm chuyển sang cổng khác.

Startup dừng và báo lỗi rõ nếu yt-dlp/FFmpeg không chạy được. `npm run build` và unit test không cần hai executable này trên PATH (kiểm thử tải thực tế thì cần).

## Hỗ trợ video Threads

Backend dùng extractor Threads được đóng gói tại `yt-dlp-threads/`, dựa trên [tribixbite/yt-dlp-threads](https://github.com/tribixbite/yt-dlp-threads), commit `c4c44141cb10715f94296a808f5d89a0d24dfe94` (Unlicense). Extractor chọn đúng shortcode của bài và đọc URL MP4 từ dữ liệu Threads dành cho trình thu thập link công khai. Nó không dùng cookie hay tài khoản; bài riêng tư, yêu cầu đăng nhập, bài ảnh/chữ và carousel nhiều video không được hỗ trợ. Threads có thể đổi định dạng trang khiến extractor cần cập nhật.

yt-dlp chỉ nạp plugin đã review trong repo: `--no-plugin-dirs` tắt thư mục mặc định, sau đó `--plugin-dirs` trỏ tới root dự án. Docker dùng bản yt-dlp Python nên hỗ trợ plugin này. Bản `yt-dlp.exe` standalone trên Windows không nạp plugin Python; muốn chạy Threads local cần cài yt-dlp bằng Python/pip.

Kiểm tra extractor bằng fixture offline: `python -m unittest discover -s yt-dlp-threads/tests`.

## Tính năng

- Dark UI responsive, chọn Single URL / Batch URLs, paste clipboard, dropdown định dạng thực tế, thumbnail, tác giả, thời lượng, nền tảng.
- Video giữ stream gốc; ghép stream riêng bằng FFmpeg. MP4 khi codec/container phù hợp; WebM/MKV hiển thị đúng container thực tế. Không giả lập 4K hoặc upscale.
- MP3 128/192/256/320 kbps là **chuyển đổi**, không phải khẳng định bitrate nguồn. M4A chỉ có khi nguồn cung cấp stream M4A.
- Batch phân tích tuần tự, kết quả riêng từng URL; Download all đưa từng mục vào queue. Khi xử lý xong, bấm Save file trên từng mục để trình duyệt bắt đầu lưu.
- SSE realtime: queued + vị trí, fetching, preparing, downloading, merging, processing, completed; tự chuyển sang polling nếu SSE mất kết nối.
- Xử lý xong hiển thị Save file. Đây là liên kết `<a download>` trực tiếp tới attachment, bắt đầu từ cú bấm thật của người dùng. Không fetch toàn bộ video thành Blob hoặc tự kích hoạt tải sau SSE. Nếu truyền bị ngắt, giữ file cho phép thử lại đến TTL.
- History lưu localStorage (tối đa 100 mục), phân tích lại link và xóa lịch sử. Không lưu video trong localStorage.
- Queue in-memory giới hạn concurrency/capacity; hàng đợi metadata riêng; duration, filesize, output-size và timeout có giới hạn.
- Không giới hạn domain theo tên nền tảng. Chấp nhận website khác nếu yt-dlp trích xuất được metadata/stream được hỗ trợ.

## Cấu trúc

```text
social-video-downloader/
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── components/          # PlatformIcon, VideoCard
│       ├── pages/               # History
│       ├── services/api.js      # REST, SSE và polling fallback
│       ├── hooks/useHistory.js
│       ├── utils/format.js
│       ├── App.jsx
│       ├── main.jsx
│       └── styles.css
├── server/
│   ├── controllers/videoController.js
│   ├── routes/videoRoutes.js
│   ├── middleware/validation.js
│   ├── services/
│   │   ├── videoService.js
│   │   ├── downloadService.js
│   │   ├── ffmpegService.js
│   │   ├── processService.js
│   │   ├── proxyService.js
│   │   ├── queueService.js
│   │   └── cleanupService.js
│   ├── utils/                  # URL/SSRF, filename, errors
│   ├── tests/                  # API, security, services
│   ├── temp/                   # UUID directory per job; gitignored
│   ├── config.js
│   ├── app.js
│   ├── server.js
│   └── package.json
├── scripts/                    # syntax check, portable Windows setup
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Cấu hình `.env`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| HOST | 127.0.0.1 | Chỉ lắng nghe local theo mặc định |
| PORT | 3000 | Cổng Express |
| CLIENT_URL | http://localhost:5173,http://127.0.0.1:5173 | Origin frontend được phép, phân cách dấu phẩy |
| MAX_CONCURRENT_DOWNLOADS | 3 | Số job download đồng thời |
| MAX_QUEUE_SIZE | 30 | Số tác vụ chờ tối đa mỗi queue |
| TEMP_FILE_TTL_MINUTES | 30 | TTL file/job hoàn tất hoặc thất bại |
| MAX_VIDEO_DURATION_SECONDS | 7200 | Thời lượng video/audio tối đa |
| MAX_BATCH_URLS | 10 | Số URL/lần phân tích batch |
| MAX_FILE_SIZE_MB | 1024 | Giới hạn file đầu ra; budget tạm 2× để merge |
| PROCESS_TIMEOUT_SECONDS | 900 | Timeout toàn bộ download + hậu xử lý |
| INFO_TIMEOUT_SECONDS | 90 | Timeout trích xuất metadata |
| INFO_RATE_LIMIT | 30 | Lượt info/IP/cửa sổ thời gian |
| DOWNLOAD_RATE_LIMIT | 10 | Lượt download/IP/cửa sổ, dùng chung video/audio |
| RATE_WINDOW_MINUTES | 10 | Độ dài cửa sổ rate limit |
| YT_DLP_PATH | yt-dlp | Executable yt-dlp |
| FFMPEG_PATH | ffmpeg | Executable FFmpeg (ffprobe cùng thư mục) |

Batch có rate limit riêng `max(1, floor(INFO_RATE_LIMIT / MAX_BATCH_URLS))` request/cửa sổ để không biến 1 request thành tải metadata không giới hạn. Khi đổi PORT, sửa target trong `client/vite.config.js`. Khi chạy production bằng hostname khác, thêm origin đó vào CLIENT_URL.

## API

Tất cả POST yêu cầu `Content-Type: application/json`. Lỗi có dạng `{ "error": "message" }`.

| Method | Path | Nội dung / kết quả |
|---|---|---|
| GET | /api/health | Trạng thái, phiên bản dependency, giới hạn |
| POST | /api/video/info | `{url}` → title, thumbnail, duration, platform, author, formats |
| POST | /api/batch/info | `{urls: [...]}` → `{results: [{url, video? , error?}]}` |
| POST | /api/video/download | `{url, formatId, type: "video"}` → HTTP 202 `{jobId, state, ...}` |
| POST | /api/audio/download | `{url, formatId, type: "audio"}` → HTTP 202 job |
| GET | /api/download/:jobId/status | state, progress, queuePosition, error, filename |
| GET | /api/download/:jobId/progress | SSE `data: { ...status }` + heartbeat |
| GET | /api/download/:jobId/file | Attachment khi completed; 409 khi chưa sẵn sàng/đã giao |

Download dùng job bất đồng bộ để có progress/queue; **POST không giữ kết nối để trả ngay file**. Sau completed, người dùng bấm Save file để trình duyệt GET `/file`. Frontend chỉ polling JSON status để xác nhận server đã gửi xong rồi ghi history. `formatId` lấy nguyên `formats[].id` từ info, không phải biểu thức CLI. Backend trích xuất lại metadata và đối chiếu ID/type trước tải.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
$body = @{ url = 'https://YOUR-PUBLIC-VIDEO-URL' } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/api/video/info -Method Post -ContentType application/json -Body $body
```

## Bảo mật và giới hạn triển khai

- `spawn(command, argumentsArray, {shell:false})`, URL sau `--`, không nhận argument tùy ý; format selector chỉ được tạo từ metadata có ID đã kiểm tra.
- Chặn URL không phải HTTP/HTTPS, credential trong URL, port khác 80/443, localhost, IPv4 private/link-local/loopback/multicast/reserved, IPv6 private và IPv4-mapped IPv6. Kiểm tra **mọi** DNS answer.
- yt-dlp dùng HTTP proxy loopback; từng CONNECT/HTTP request được resolve, chặn private và nối tới IP đã xác minh. Redirect/CDN/fragment đi qua cùng proxy, giảm DNS rebinding và redirect SSRF. Chỉ cung cấp HTTP(S), DASH native, HLS native; không RTMP/FTP/external downloader.
- Helmet, CORS allowlist, kiểm tra Origin cho POST, Zod strict body, limit body 64 KB, rate limit, giới hạn SSE subscribers, UUID job khó đoán, tên file ASCII portable, thư mục temp cố định.
- Không đọc browser cookies/netrc/config/plugin của người dùng. Không bypass geo restriction. Từ chối livestream, playlist, DRM, nội dung yêu cầu tài khoản, age restriction và metadata thiếu thời lượng.
- Đây là ứng dụng **local/single-instance**. Queue và rate limit ở RAM; tác vụ đang chạy không tiếp tục sau restart. Tác vụ đã hoàn tất có manifest tạm cạnh file, được khôi phục sau restart nếu chưa hết TTL. File và manifest bị xóa sau khi gửi thành công. HEAD chỉ kiểm tra file, không tiêu thụ lượt tải; Range bị bỏ qua để tránh xóa file sau khi mới gửi một phần. Job ID là bearer capability: ai có ID có thể lấy file trước khi giao. Không có tài khoản/phân quyền giữa nhiều người dùng.
- Trước khi mở Internet: triển khai trong container/OS sandbox ít quyền, chặn private-network egress tại firewall cho **toàn bộ process tree** (kể cả FFmpeg/JS runtime), đặt disk/memory quota, reverse proxy HTTPS và cấu hình proxy trust theo hạ tầng. Application proxy không thay thế sandbox cho native media parsers hoặc extractor bên thứ ba.
- Budget thư mục tạm được kiểm tra mỗi giây nên có thể vượt ngưỡng trong một khoảng ngắn; quota OS mới là giới hạn cứng. Tối đa 500 job trong RAM; cleanup mỗi phút.
- File được stream bằng trình quản lý tải của trình duyệt, không giữ toàn bộ video trong RAM của React. History ghi khi server báo đã gửi xong; website không thể xác nhận vị trí lưu cuối cùng hoặc người dùng chọn Save/Cancel trong hộp thoại hệ điều hành. Nếu không có lượt tải, kiểm tra bảng Downloads/quyền tải của trình duyệt; trạng thái 100% chỉ xác nhận video đã xử lý xong trên server.
- Không đảm bảo mọi link từ mọi nền tảng đều tải được. Anti-bot, thay đổi extractor, region/account restrictions và network errors được báo lỗi; không tự thử vượt rào cản. Format thiếu duration/codec cần thiết bị bỏ qua để giữ giới hạn tài nguyên.

## Kiểm thử từng chức năng

Chạy `npm run check`, `npm test`, `npm run build` trước. Kiểm thử tải thật cần Internet, yt-dlp/FFmpeg và URL công khai có quyền tải.

`node scripts/smoke-test.js` tự sinh video 2 giây, tạo DASH video/audio riêng, đưa qua yt-dlp và API bằng proxy fixture chỉ tồn tại trong process test. Kiểm tra ghép stream, các bitrate MP3, SSE, file attachment và xóa temp. Không thay đổi proxy SSRF của server đang chạy; không cần tải nội dung người khác. Fixture/output test nằm trong `.tools/smoke/`.

| Chức năng | Thao tác | Kết quả mong đợi |
|---|---|---|
| Startup | Đổi YT_DLP_PATH sang tên không tồn tại | Backend báo dependency thiếu và thoát, không crash im lặng |
| Info | Dán URL public hợp lệ, Analyze link | Thumbnail/title/author/duration/format thật |
| Video | Chọn video format và Download | Queue → progress → file attachment, có hình và tiếng |
| Merge | Chọn video-only HD có audio riêng | Merger chạy, file phát được cả hai stream |
| Audio | Chọn Audio → từng MP3 bitrate hoặc M4A | File đúng container; MP3 chuyển đổi, M4A giữ nguồn |
| Batch | 2 link tốt + 1 lỗi, Analyze rồi Download all | Mỗi link có kết quả riêng; link lỗi không phá batch |
| Batch limit | Gửi MAX_BATCH_URLS+1 URL | HTTP 400 / frontend báo giới hạn |
| Queue | MAX_CONCURRENT_DOWNLOADS=1, tải nhiều mục | Một job chạy; mục còn lại hiển thị vị trí chờ |
| SSE | Quan sát tab Network `/progress` | Nhận tiến trình và completed; ngắt SSE thử polling |
| History | Tải thành công rồi mở History/reload | Lịch sử còn; Analyze again điền lại URL; Clear xóa |
| Temp | Quan sát server/temp sau nhận file | Thư mục job bị xóa sau truyền hoàn tất |
| TTL | Đặt TTL=1, tạo job không GET file | File được xóa sau TTL + tối đa 1 chu kỳ cleanup |
| URL/SSRF | localhost, 127.1, 10.0.0.1, ::1, file:// | Bị từ chối; test tự động kiểm tra cả HTTP proxy và CONNECT |
| CLI injection | formatId chứa `;`, URL option giả | HTTP 400 / validation error; không chạy shell |
| Restriction | URL private/deleted/DRM/account/region | Thông báo dễ hiểu, không bypass |
| Duration | Đặt MAX_VIDEO_DURATION_SECONDS=5, phân tích video dài | Từ chối trước khi download |
| Rate | Giảm INFO_RATE_LIMIT rồi gửi vượt | HTTP 429, không làm sập server |
| Responsive | Xem 1440px, 768px, 390px | Input/nút không tràn, menu mobile, card xếp dọc |

Nếu thấy lỗi permission `spawn EPERM` trong môi trường sandbox, chạy các lệnh test/build trong terminal được cho phép tạo subprocess. Không tắt validation hay SSRF để làm test vượt qua.
