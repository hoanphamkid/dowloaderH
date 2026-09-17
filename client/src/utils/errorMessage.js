const translations = new Map([
  ['This video is DRM protected. Downloading is not supported.', 'Video có bảo vệ DRM nên không hỗ trợ tải xuống.'],
  ['This video is unavailable or requires permission to access.', 'Video không khả dụng hoặc cần quyền truy cập.'],
  ['This video is private.', 'Video này ở chế độ riêng tư.'],
  ['This video is restricted in the server’s region.', 'Video bị giới hạn tại khu vực của máy chủ.'],
  ['This website or URL is not supported.', 'Chưa hỗ trợ trang web hoặc liên kết này.'],
  ['This video has been deleted or is unavailable.', 'Video đã bị xóa hoặc không còn khả dụng.'],
  ['Video unavailable', 'Video không khả dụng.'],
  ['FFmpeg could not process this media. Try another format.', 'Không thể xử lý video này. Vui lòng chọn định dạng khác.'],
  ['The request timed out. Please try again.', 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.'],
  ['The platform could not provide this media. Please check the public URL or try again later.', 'Không lấy được video từ nền tảng này. Kiểm tra liên kết công khai hoặc thử lại sau.'],
  ['The transfer was interrupted. Click Save file to try again.', 'Quá trình lưu bị gián đoạn. Nhấn Lưu tệp để thử lại.'],
]);

export function errorMessage(message) {
  return translations.get(message) || message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
