import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizePublicUrl, detectPlatform, parsePublicUrl } from '../utils/url.js';
import { extractYoutubeId, isYoutubeVideoId } from '../utils/youtube.js';
import { normalizeInfo } from '../services/videoService.js';
import { ERROR_CODES, processError } from '../utils/errors.js';
import { assertRealMediaFile } from '../utils/mediaFile.js';
import fs from 'node:fs/promises';
import path from 'node:path';

test('canonicalizes YouTube watch, short, embed and share URLs', () => {
  const expected = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  for (const input of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&feature=share',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) {
    assert.equal(extractYoutubeId(input), 'dQw4w9WgXcQ');
    assert.equal(canonicalizePublicUrl(input).href, expected);
    assert.equal(detectPlatform(input), 'youtube');
  }
  assert.equal(isYoutubeVideoId('short'), false);
  assert.throws(() => canonicalizePublicUrl('https://www.youtube.com/watch?v=nope'));
});

test('rejects HTML and JSON generic responses as media', () => {
  for (const raw of [
    { title: 'Example', duration: 1, ext: 'html', url: 'https://example.com/page', formats: [] },
    {
      title: 'Example',
      duration: 1,
      ext: 'unknown',
      http_headers: { 'Content-Type': 'application/json' },
      url: 'https://example.com/error.json',
      formats: [],
    },
  ]) {
    try {
      normalizeInfo(raw, 'https://example.com/page');
      assert.fail('expected throw');
    } catch (error) {
      assert.equal(error.code, ERROR_CODES.MEDIA_TYPE_INVALID);
    }
  }
});

test('keeps YouTube videos when only format ids are present', () => {
  const info = normalizeInfo(
    {
      title: 'Public video',
      duration: 12,
      id: 'dQw4w9WgXcQ',
      formats: [
        { format_id: '399', vcodec: 'av01', acodec: 'none', height: 1080, ext: 'mp4', protocol: 'https' },
        { format_id: '140', vcodec: 'none', acodec: 'aac', ext: 'm4a', protocol: 'https' },
      ],
    },
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(info.formats[0].selector, '399+140');
  assert.equal(info.previewUrl, null);
});

test('refuses to treat HTML bytes as a downloaded video', async () => {
  const dir = path.resolve('server', 'temp');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `hp-html-${Date.now()}.mp4`);
  await fs.writeFile(file, '<!DOCTYPE html><html><body>error</body></html>');
  await assert.rejects(() => assertRealMediaFile(file), /media/i);
  await fs.unlink(file);
});

test('maps yt-dlp YouTube and disk failures to distinct codes', () => {
  assert.equal(processError('WARNING: ffmpeg unavailable\nERROR: [youtube] connection timed out').status, 504);
  assert.equal(processError('ERROR: [youtube] HTTP Error 429: Too Many Requests').status, 429);
  assert.equal(processError('Failed to extract python310.dll').message.includes('exhausted'), false);
  assert.equal(
    processError('ERROR: [youtube] abc: Sign in to confirm you’re not a bot').code,
    ERROR_CODES.YOUTUBE_DOWNLOAD_UNAVAILABLE,
  );
  assert.equal(
    processError('Failed to extract python310.dll').code,
    ERROR_CODES.SERVER_ERROR,
  );
});

test('parsePublicUrl still blocks non-http schemes', () => {
  assert.throws(() => parsePublicUrl('javascript:alert(1)'));
  assert.throws(() => parsePublicUrl('data:text/html,hi'));
});
