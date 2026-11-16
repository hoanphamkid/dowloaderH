import { config } from '../config.js';
import { ERROR_CODES, fail } from '../utils/errors.js';
import { runProcess } from './processService.js';
import { baseArgs } from './videoService.js';

function profileUrl(input) {
  const value = String(input || '').trim();
  if (!/^https?:\/\//i.test(value)) return `https://www.tiktok.com/@${value.replace(/^@/, '')}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Link TikTok khÃ´ng há»£p lá»‡.');
  }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname))
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Vui lÃ²ng nháº­p link tÃ i khoáº£n TikTok.');
  if (!/^\/@[^/]+(?:\/)?$/i.test(parsed.pathname))
    throw fail(ERROR_CODES.INVALID_URL, 400, 'Link pháº£i trÃ´ng nhÆ° https://www.tiktok.com/@username.');
  return parsed.toString();
}

function httpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : null;
}

function profileDate(value) {
  if (!value) return null;
  const formatted = String(value).match(/^(\d{2}:\d{2}:\d{2})\s*\|\|\s*(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!formatted) return value;
  return `${formatted[1]} || ${formatted[2]}/${formatted[3]}/${formatted[4]}`;
}

function cleanProfile(user = {}, stats = {}) {
  const tabs = user.profileTab || {};
  const username = String(user.uniqueId || user.id || '').trim();
  return {
    user: {
      id: user.id || null,
      username,
      nickname: user.nickname || username || null,
      signature: user.signature || '',
      avatar: httpsUrl(user.avatarLarger || user.avatarMedium || user.avatarThumb),
      verified: Boolean(user.verified),
      privateAccount: Boolean(user.privateAccount),
      live: Boolean(user.roomId),
      createTime: profileDate(user.createTime),
      region: user.region || null,
      language: user.language || null,
      nicknameModifyTime: profileDate(user.nickNameModifyTime),
      usernameModifyTime: profileDate(user.uniqueIdModifyTime),
      profileUrl: username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : null,
      tabs: {
        music: Boolean(tabs.showMusicTab),
        question: Boolean(tabs.showQuestionTab),
        playlist: Boolean(tabs.showPlayListTab),
        repost: Boolean(tabs.showRepostTab),
      },
      settings: {
        comment: user.commentSetting ?? null,
        duet: user.duetSetting ?? null,
        stitch: user.stitchSetting ?? null,
        download: user.downloadSetting ?? null,
        followingVisibility: user.followingVisibility ?? null,
        embedBanned: Boolean(user.isEmbedBanned),
      },
      commerce: Boolean(user.commerceUserInfo?.commerceUser),
      seller: Boolean(user.ttSeller),
      adVirtual: Boolean(user.isADVirtual),
    },
    stats: {
      followers: stats.followerCount ?? 0,
      following: stats.followingCount ?? 0,
      likes: stats.heartCount ?? stats.heart ?? 0,
      videos: stats.videoCount ?? 0,
      friends: stats.friendCount ?? 0,
    },
  };
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function safeThumbnail(value) {
  if (Array.isArray(value)) return safeThumbnail(value[0]);
  if (value && typeof value === 'object') return safeThumbnail(value.url || value.src);
  return httpsUrl(value);
}

function normalizeVideo(raw = {}) {
  const item = raw.itemStruct || raw;
  const author = item.author || {};
  const video = item.video || {};
  const stats = item.stats || {};
  const id = String(item.id || item.itemId || '').trim();
  const username = String(author.uniqueId || item.uploader || '').trim();
  if (!id) return null;
  return {
    id,
    title: item.desc || item.title || 'TikTok video',
    url:
      item.shareUrl ||
      item.webVideoUrl ||
      (username ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${id}` : null),
    thumbnail: safeThumbnail(
      video.cover || video.originCover || video.dynamicCover || item.thumbnail || item.thumbnails,
    ),
    duration: Number(video.duration || item.duration || 0) || null,
    createdAt: item.createTime || item.timestamp || null,
    author: {
      username: username || null,
      nickname: author.nickname || item.author || null,
      avatar: safeThumbnail(author.avatarLarger || author.avatarMedium || author.avatarThumb),
    },
    stats: {
      views: stats.playCount ?? item.view_count ?? 0,
      likes: stats.diggCount ?? item.like_count ?? 0,
      comments: stats.commentCount ?? item.comment_count ?? 0,
      shares: stats.shareCount ?? item.repost_count ?? 0,
    },
  };
}

function profilePlaylistArgs() {
  const source = baseArgs();
  const args = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '--no-playlist') continue;
    if (source[index] === '--playlist-items') {
      index += 1;
      continue;
    }
    args.push(source[index]);
  }
  return [
    ...args,
    '--flat-playlist',
    '--playlist-end',
    String(config.profileItems),
    '--skip-download',
    '--dump-single-json',
  ];
}

async function getPublishedVideos(target) {
  try {
    const stdout = await runProcess(
      config.yt,
      [...profilePlaylistArgs(), '--', target],
      { timeout: config.profileTimeout, maxOutput: 8 * 1024 * 1024 },
    );
    const payload = parseJsonOutput(stdout);
    return (payload?.entries || []).map(normalizeVideo).filter(Boolean);
  } catch (error) {
    console.warn('[PROFILE VIDEOS]', error?.message || error);
    return [];
  }
}

function tiktokListUrl(kind, secUid, username) {
  const endpoint = new URL(`https://www.tiktok.com/api/${kind}/item_list/`);
  const params = {
    secUid,
    count: '30',
    cursor: '0',
    aid: '1988',
    app_name: 'tiktok_web',
    device_platform: 'web_pc',
    from_page: 'user',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_version: '5.0',
    browser_platform: 'Win32',
    browser_online: 'true',
    cookie_enabled: 'true',
    language: 'en',
    region: 'US',
    priority_region: 'US',
    screen_height: '900',
    screen_width: '1440',
    tz_name: 'Asia/Ho_Chi_Minh',
    user_is_login: 'false',
    webcast_language: 'en',
    history_len: '2',
    is_page_visible: 'true',
    focus_state: 'true',
    is_fullscreen: 'false',
    data_collection_enabled: 'false',
  };
  Object.entries(params).forEach(([key, value]) => endpoint.searchParams.set(key, value));
  return { endpoint, referer: `https://www.tiktok.com/@${encodeURIComponent(username)}` };
}

async function getTikTokCollection(kind, secUid, username) {
  if (!secUid) return [];
  try {
    const { endpoint, referer } = tiktokListUrl(kind, secUid, username);
    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json, text/plain, */*',
        referer,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
      signal: AbortSignal.timeout(config.profileTimeout),
    });
    const text = await response.text();
    if (!response.ok || !text.trim()) return [];
    const payload = JSON.parse(text);
    return (payload.itemList || []).map(normalizeVideo).filter(Boolean);
  } catch (error) {
    console.warn(`[PROFILE ${kind}]`, error?.message || error);
    return [];
  }
}

async function getProfileContent(target, user) {
  const username = user.uniqueId || user.id || '';
  const tasks = [getPublishedVideos(target)];
  tasks.push(user.profileTab?.showRepostTab ? getTikTokCollection('repost', user.secUid, username) : Promise.resolve([]));
  tasks.push(user.openFavorite ? getTikTokCollection('favorite', user.secUid, username) : Promise.resolve([]));
  const [videos, reposts, liked] = await Promise.all(tasks);
  return {
    videos,
    reposts,
    likedFirst: liked[0] || null,
    repostsPublic: Boolean(user.profileTab?.showRepostTab),
    likesPublic: Boolean(user.openFavorite),
  };
}

export async function getProfile(input) {
  const target = profileUrl(input);
  const endpoint = new URL(config.tiktokProfileApi);
  endpoint.searchParams.set('input', input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.profileTimeout);
  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'HoanPhamDownloader/1.0' },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const userInfo = payload?.data?.userInfo;
    if (!response.ok || !payload?.success || !userInfo?.user)
      throw fail(
        ERROR_CODES.PROFILE_NOT_FOUND,
        response.status === 404 ? 404 : 502,
        payload?.error || payload?.data?.statusMsg || undefined,
      );
    const profile = cleanProfile(userInfo.user, userInfo.statsV2 || userInfo.stats || {});
    if (!profile.user.username) throw fail(ERROR_CODES.PROFILE_NOT_FOUND, 404);
    const content = await getProfileContent(target, userInfo.user);
    return { ...profile, content, input, sourceUrl: target };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw fail(ERROR_CODES.DOWNLOAD_TIMEOUT, 504, 'Tra cá»©u tÃ i khoáº£n quÃ¡ lÃ¢u. Vui lÃ²ng thá»­ láº¡i.');
    if (error?.code) throw error;
    throw fail(ERROR_CODES.UPSTREAM_ERROR, 502, 'KhÃ´ng thá»ƒ láº¥y thÃ´ng tin tÃ i khoáº£n lÃºc nÃ y.');
  } finally {
    clearTimeout(timer);
  }
}
