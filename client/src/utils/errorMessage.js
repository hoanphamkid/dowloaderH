const translations = new Map([
  ['This video is DRM protected. Downloading is not supported.', 'Video có bảo vệ DRM nên không hỗ trợ tải xuống.'],
  ['This video is unavailable or requires permission to access.', 'Video không khả dụng hoặc cần quyền truy cập.'],
  ['This video is private.', 'Video này ở chế độ riêng tư.'],
  ['This video is restricted in the server’s region.', 'Video bị giới hạn tại khu vực của máy chủ.'],
  ['This website or URL is not supported.', 'Chưa hỗ trợ trang web hoặc liên kết này.'],
  ['This video has been deleted or is unavailable.', 'Video đã bị xóa hoặc không còn khả dụng.'],
  ['Video unavailable', 'Video không khả dụng.'],
  ['FFmpeg could not process this media. Try another format.', 'Không thể xử lý video này. Vui lòng chọn định dạng khác.'],
  ['The request timed out. Please try again.', 'Kết nối tới máy chủ video bị timeout. Vui lòng thử lại.'],
  ['The platform could not provide this media. Please check the public URL or try again later.', 'Nền tảng không cung cấp media để tải bằng phương thức hiện tại.'],
  ['The transfer was interrupted. Click Save file to try again.', 'Quá trình lưu bị gián đoạn. Nhấn Lưu tệp để thử lại.'],
  ['The file transfer was interrupted. Click Save file to try again.', 'Quá trình lưu bị gián đoạn. Nhấn Lưu tệp để thử lại.'],
  ['Please enter a valid video URL.', 'Liên kết chưa hợp lệ. Hãy nhập đầy đủ http:// hoặc https://.'],
  ['Please enter a valid YouTube video URL.', 'Liên kết YouTube chưa hợp lệ.'],
  ['No supported, unprotected media formats were found.', 'Không tìm thấy định dạng video/audio có thể tải.'],
  ['Unable to analyze this URL.', 'Không thể phân tích liên kết này.'],
  ['Unable to process this download.', 'Không thể xử lý lượt tải này.'],
]);

const byCode = new Map([
  ['INVALID_URL', 'Liên kết chưa hợp lệ. Hãy nhập đầy đủ http:// hoặc https://.'],
  ['UNSUPPORTED_PLATFORM', 'Chưa hỗ trợ trang web hoặc liên kết này.'],
  ['VIDEO_NOT_FOUND', 'Không tìm thấy video.'],
  ['VIDEO_PRIVATE', 'Video này ở chế độ riêng tư.'],
  ['VIDEO_UNAVAILABLE', 'Video không khả dụng.'],
  ['ACCESS_DENIED', 'Không có quyền truy cập nội dung này.'],
  ['MEDIA_NOT_FOUND', 'Không tìm thấy file media tại liên kết này.'],
  ['MEDIA_TYPE_INVALID', 'Máy chủ không trả về video/audio. Không thể lưu phản hồi này thành tệp media.'],
  ['DOWNLOAD_TIMEOUT', 'Kết nối tới máy chủ video bị timeout. Vui lòng thử lại.'],
  ['UPSTREAM_ERROR', 'Máy chủ video gặp lỗi. Vui lòng thử lại sau.'],
  ['DOWNLOAD_ABORTED', 'Lượt tải đã bị hủy.'],
  ['YOUTUBE_DOWNLOAD_UNAVAILABLE', 'Nền tảng không cung cấp media để tải bằng phương thức hiện tại.'],
  ['SERVER_ERROR', 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.'],
]);

export function errorMessage(message, code) {
  if (translations.has(message)) return translations.get(message);
  if (message && /[àáạảãâăèéêìíòóôùúýđ]/i.test(message)) return message;
  if (code && byCode.has(code)) return byCode.get(code);
  return message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
