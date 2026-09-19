export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  VIDEO_PRIVATE: 'VIDEO_PRIVATE',
  VIDEO_UNAVAILABLE: 'VIDEO_UNAVAILABLE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
  MEDIA_TYPE_INVALID: 'MEDIA_TYPE_INVALID',
  DOWNLOAD_TIMEOUT: 'DOWNLOAD_TIMEOUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  DOWNLOAD_ABORTED: 'DOWNLOAD_ABORTED',
  YOUTUBE_DOWNLOAD_UNAVAILABLE: 'YOUTUBE_DOWNLOAD_UNAVAILABLE',
  SERVER_ERROR: 'SERVER_ERROR',
};

const MESSAGES = {
  [ERROR_CODES.INVALID_URL]: 'Liên kết chưa hợp lệ. Hãy nhập đầy đủ http:// hoặc https://.',
  [ERROR_CODES.UNSUPPORTED_PLATFORM]: 'Chưa hỗ trợ trang web hoặc liên kết này.',
  [ERROR_CODES.VIDEO_NOT_FOUND]: 'Không tìm thấy video.',
  [ERROR_CODES.VIDEO_PRIVATE]: 'Video này ở chế độ riêng tư.',
  [ERROR_CODES.VIDEO_UNAVAILABLE]: 'Video không khả dụng.',
  [ERROR_CODES.ACCESS_DENIED]: 'Không có quyền truy cập nội dung này.',
  [ERROR_CODES.MEDIA_NOT_FOUND]: 'Không tìm thấy file media tại liên kết này.',
  [ERROR_CODES.MEDIA_TYPE_INVALID]:
    'Máy chủ không trả về video/audio. Không thể lưu phản hồi này thành tệp media.',
  [ERROR_CODES.DOWNLOAD_TIMEOUT]: 'The request timed out. Please try again.',
  [ERROR_CODES.UPSTREAM_ERROR]: 'Máy chủ video gặp lỗi. Vui lòng thử lại sau.',
  [ERROR_CODES.DOWNLOAD_ABORTED]: 'Lượt tải đã bị hủy.',
  [ERROR_CODES.YOUTUBE_DOWNLOAD_UNAVAILABLE]:
    'Video YouTube này không thể được xử lý bằng phương thức hiện tại.',
  [ERROR_CODES.SERVER_ERROR]: 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.',
};

export class AppError extends Error {
  constructor(message, status = 400, code = ERROR_CODES.INVALID_URL) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fail(code, status = 400, message) {
  return new AppError(message || MESSAGES[code] || MESSAGES.SERVER_ERROR, status, code);
}

export function errorBody(error) {
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : ERROR_CODES.SERVER_ERROR;
  const message =
    status === 500
      ? MESSAGES.SERVER_ERROR
      : error instanceof AppError
        ? error.message
        : 'Yêu cầu không hợp lệ.';
  return {
    success: false,
    code,
    message,
    error: message,
  };
}

export function processError(text = '') {
  const message = String(text);
  if (/not enough space on the disk|ENOSPC|no space left/i.test(message))
    return fail(
      ERROR_CODES.SERVER_ERROR,
      503,
      'Temporary disk space is exhausted. The media processor cannot start.',
    );
  if (/failed to extract[^\r\n]*\.(dll|pyd)\b|failed to load python|could not load python/i.test(message))
    return fail(ERROR_CODES.SERVER_ERROR, 503, 'The media processor could not unpack or load its runtime.');
  // Transport failures must take precedence over warnings mentioning cookies,
  // tokens or FFmpeg elsewhere in the same stderr output.
  if (/timed? out|timeout/i.test(message)) return fail(ERROR_CODES.DOWNLOAD_TIMEOUT, 504);
  if (/HTTP Error 429|Too Many Requests/i.test(message))
    return fail(ERROR_CODES.UPSTREAM_ERROR, 429, 'The video platform is rate limiting this server.');
  if (/HTTP Error 403|403 Forbidden/i.test(message))
    return fail(ERROR_CODES.ACCESS_DENIED, 403, 'The video platform denied access from this server.');
  if (/DRM/i.test(message))
    return fail(ERROR_CODES.ACCESS_DENIED, 403, 'Video có bảo vệ DRM nên không hỗ trợ tải xuống.');
  if (
    /sign in to confirm|not a bot|bot check|po token|please sign in|only images are available|requested format is not available/i.test(
      message,
    )
  )
    return fail(
      ERROR_CODES.YOUTUBE_DOWNLOAD_UNAVAILABLE,
      502,
      'Video YouTube này không thể được xử lý bằng phương thức hiện tại.',
    );
  if (
    /private video|video is private|members.only|authentication|cookies|confirm your age|age.restrict/i.test(
      message,
    )
  )
    return fail(ERROR_CODES.VIDEO_PRIVATE, 403);
  if (/login|sign in/i.test(message)) return fail(ERROR_CODES.ACCESS_DENIED, 403);
  if (/geo|country|region/i.test(message))
    return fail(ERROR_CODES.ACCESS_DENIED, 403, 'Video bị giới hạn tại khu vực của máy chủ.');
  if (/unsupported URL|no suitable extractor/i.test(message))
    return fail(ERROR_CODES.UNSUPPORTED_PLATFORM, 400);
  if (/removed|deleted|unavailable|404|not found/i.test(message))
    return fail(ERROR_CODES.VIDEO_NOT_FOUND, 404);
  if (/ffmpeg|ffprobe/i.test(message))
    return fail(
      ERROR_CODES.UPSTREAM_ERROR,
      502,
      'Không thể xử lý video này. Vui lòng chọn định dạng khác.',
    );
  if (/timed? out|timeout/i.test(message)) return fail(ERROR_CODES.DOWNLOAD_TIMEOUT, 504);
  if (/\[youtube\]/i.test(message))
    return fail(
      ERROR_CODES.YOUTUBE_DOWNLOAD_UNAVAILABLE,
      502,
      'Video YouTube này không thể được xử lý bằng phương thức hiện tại.',
    );
  return fail(ERROR_CODES.UPSTREAM_ERROR, 502);
}
