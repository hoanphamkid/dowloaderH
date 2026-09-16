export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function processError(message = '') {
  if (/DRM/i.test(message))
    return new AppError('This video is DRM protected. Downloading is not supported.');
  if (
    /private|sign in|login|age.restrict|members.only|authentication|cookies|confirm your age/i.test(
      message,
    )
  )
    return new AppError('This video is unavailable or requires permission to access.');
  if (/geo|country|region/i.test(message))
    return new AppError('This video is restricted in the server’s region.');
  if (/unsupported URL|no suitable extractor/i.test(message))
    return new AppError('This website or URL is not supported.');
  if (/removed|deleted|unavailable|404|not found/i.test(message))
    return new AppError('This video has been deleted or is unavailable.');
  if (/ffmpeg|ffprobe/i.test(message))
    return new AppError('FFmpeg could not process this media. Try another format.', 502);
  if (/timed? out|timeout/i.test(message))
    return new AppError('The request timed out. Please try again.', 504);
  return new AppError(
    'The platform could not provide this media. Please check the public URL or try again later.',
    502,
  );
}
