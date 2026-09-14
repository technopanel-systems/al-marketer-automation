// Automatic social captures that need no login: TikTok and YouTube via yt-dlp (free, open source), YouTube Data API
// when a free key exists, and Instagram Business Discovery (Meta's official API) when a token exists.
// Every function returns a normalized capture: { platform, url, method, status, capturedAt, profile, posts, limit, error? }.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../../engine/catalog/store.js';

export const LIMITS = { tiktok: 30, youtube: 12, instagram: 30 };

export function ytDlpPath() {
  if (process.env.ALM_YTDLP) return process.env.ALM_YTDLP;
  const local = join(ROOT, 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return existsSync(local) ? local : 'yt-dlp';
}

function run(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

async function ytDlpJson(args, timeoutMs = 120_000) {
  const res = await run(ytDlpPath(), ['--no-warnings', '--ignore-config', ...args], timeoutMs);
  if (res.error && !res.stdout.trim()) {
    const reason = res.error.code === 'ENOENT' ? 'yt-dlp is not installed (tools/yt-dlp.exe) — start the Control Center once to install it' : (res.stderr.split('\n').find((l) => /ERROR/.test(l)) || res.error.message).slice(0, 300);
    throw new Error(reason);
  }
  return res.stdout
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l));
}

const captureBase = (platform, url, method, limit) => ({ platform, url, method, status: 'ok', capturedAt: new Date().toISOString(), profile: {}, posts: [], limit });
const iso = (seconds) => (typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null);
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// TikTok's profile page embeds its own numbers (followers, likes, video count) in a JSON script — read without login.
async function tiktokProfile(url) {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);
    return await page.evaluate(() => {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!el) return null;
      const info = JSON.parse(el.textContent).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
      if (!info) return null;
      const s = info.stats || info.statsV2 || {};
      return { name: info.user?.nickname || null, bio: info.user?.signature || null, followers: Number(s.followerCount ?? NaN), postsTotal: Number(s.videoCount ?? NaN), totalLikes: Number(s.heartCount ?? s.heart ?? NaN) };
    });
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

export async function captureTikTok(url, { limit = LIMITS.tiktok } = {}) {
  const cap = captureBase('tiktok', url, 'auto: yt-dlp', limit);
  const [list] = await ytDlpJson(['--flat-playlist', '-J', '--playlist-end', String(limit), url], 150_000);
  cap.posts = (list?.entries || []).map((e) => ({
    id: String(e.id),
    url: e.url || `https://www.tiktok.com/@${e.uploader}/video/${e.id}`,
    date: iso(e.timestamp),
    type: /\/photo\//.test(e.url || '') ? 'carousel' : 'video',
    caption: e.description || e.title || null,
    likes: n(e.like_count),
    comments: n(e.comment_count),
    shares: n(e.repost_count),
    views: n(e.view_count),
  }));
  const profile = await tiktokProfile(url);
  if (profile) cap.profile = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, typeof v === 'number' && Number.isNaN(v) ? null : v]));
  if (!cap.posts.length) cap.status = profile ? 'partial' : 'failed';
  return cap;
}

async function youtubeApi(url, key, limit) {
  const get = async (path, params) => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key })}`, { signal: AbortSignal.timeout(30_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`YouTube API ${res.status}: ${body.error?.message || 'error'}`);
    return body;
  };
  const u = new URL(url);
  const handle = (u.pathname.match(/^\/@([^/]+)/) || [])[1];
  const channelId = (u.pathname.match(/^\/channel\/([^/]+)/) || [])[1];
  const ch = await get('channels', { part: 'snippet,statistics,contentDetails', ...(handle ? { forHandle: handle } : channelId ? { id: channelId } : { forUsername: u.pathname.split('/').filter(Boolean).pop() }) });
  const c = ch.items?.[0];
  if (!c) throw new Error('YouTube API: channel not found');
  const uploads = await get('playlistItems', { part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: String(Math.min(50, limit)) });
  const ids = (uploads.items || []).map((i) => i.contentDetails.videoId);
  const videos = ids.length ? await get('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') }) : { items: [] };
  return {
    profile: { name: c.snippet.title, followers: n(Number(c.statistics.subscriberCount)), postsTotal: n(Number(c.statistics.videoCount)), totalViews: n(Number(c.statistics.viewCount)) },
    posts: (videos.items || []).map((v) => ({ id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, date: v.snippet.publishedAt, type: 'video', caption: v.snippet.title, likes: n(Number(v.statistics.likeCount)), comments: n(Number(v.statistics.commentCount)), shares: null, views: n(Number(v.statistics.viewCount)) })),
  };
}

export async function captureYouTube(url, { limit = LIMITS.youtube, apiKey = process.env.YOUTUBE_API_KEY } = {}) {
  const base = url.replace(/\/(videos|shorts|streams|featured)\/?$/, '');
  if (apiKey) {
    const cap = captureBase('youtube', base, 'auto: YouTube Data API', limit);
    Object.assign(cap, await youtubeApi(base, apiKey, limit));
    return cap;
  }
  const cap = captureBase('youtube', base, 'auto: yt-dlp', limit);
  const [list] = await ytDlpJson(['--flat-playlist', '-J', '--playlist-end', String(limit), `${base}/videos`], 120_000);
  cap.profile = { name: list?.channel || list?.uploader || null, followers: n(list?.channel_follower_count) };
  const ids = (list?.entries || []).map((e) => e.id).filter(Boolean);
  // Dates, likes and comments need one lookup per video; a few at a time keeps it polite.
  const details = [];
  for (let i = 0; i < ids.length; i += 3) {
    const batch = await Promise.all(ids.slice(i, i + 3).map((id) => ytDlpJson(['-j', '--skip-download', `https://www.youtube.com/watch?v=${id}`], 90_000).then((r) => r[0]).catch(() => null)));
    details.push(...batch);
  }
  cap.posts = ids.map((id, i) => {
    const d = details[i];
    const e = list.entries[i];
    return { id, url: `https://www.youtube.com/watch?v=${id}`, date: iso(d?.timestamp), type: 'video', caption: d?.title || e?.title || null, likes: n(d?.like_count), comments: n(d?.comment_count), shares: null, views: n(d?.view_count ?? e?.view_count) };
  });
  if (cap.profile.followers === null && details[0]) cap.profile.followers = n(details[0].channel_follower_count);
  if (!cap.posts.length) cap.status = 'partial';
  return cap;
}

// Meta's official Business Discovery: another business/creator account's public posts, read from the agency's own
// Instagram business account. Needs META_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID.
export async function captureInstagramApi(url, { limit = LIMITS.instagram, token = process.env.META_ACCESS_TOKEN, igUserId = process.env.IG_BUSINESS_ACCOUNT_ID, version = process.env.META_GRAPH_VERSION || 'v23.0' } = {}) {
  if (!token || !igUserId) throw new Error('Instagram API keys are not set');
  const handle = (new URL(url).pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '');
  const fields = `business_discovery.username(${handle}){username,name,followers_count,media_count,media.limit(${limit}){id,timestamp,like_count,comments_count,media_type,media_product_type,caption,permalink}}`;
  const res = await fetch(`https://graph.facebook.com/${version}/${igUserId}?${new URLSearchParams({ fields, access_token: token })}`, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Instagram API: ${body.error?.message || res.status}`);
  const bd = body.business_discovery;
  const cap = captureBase('instagram', url, 'auto: Instagram Business Discovery API', limit);
  cap.profile = { name: bd.name || bd.username, followers: n(bd.followers_count), postsTotal: n(bd.media_count) };
  cap.posts = (bd.media?.data || []).map((m) => ({
    id: m.id,
    url: m.permalink || null,
    date: m.timestamp ? new Date(String(m.timestamp).replace(/\+0000$/, 'Z')).toISOString() : null,
    type: m.media_product_type === 'REELS' || m.media_type === 'VIDEO' ? 'video' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image',
    caption: m.caption || null,
    likes: n(m.like_count),
    comments: n(m.comments_count),
    shares: null,
    views: null,
  }));
  return cap;
}
