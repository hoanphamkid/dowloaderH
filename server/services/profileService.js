import { config } from '../config.js';
import { ERROR_CODES, fail } from '../utils/errors.js';

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
    return { ...profile, input, sourceUrl: target };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw fail(ERROR_CODES.DOWNLOAD_TIMEOUT, 504, 'Tra cá»©u tÃ i khoáº£n quÃ¡ lÃ¢u. Vui lÃ²ng thá»­ láº¡i.');
    if (error?.code) throw error;
    throw fail(ERROR_CODES.UPSTREAM_ERROR, 502, 'KhÃ´ng thá»ƒ láº¥y thÃ´ng tin tÃ i khoáº£n lÃºc nÃ y.');
  } finally {
    clearTimeout(timer);
  }
}
