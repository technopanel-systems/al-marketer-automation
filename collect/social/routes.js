// More logged-out routes, tested live on 2026-09-15 (docs/research/social-fallbacks.md). No login, no key, no proxy.
//   Snapchat   snapchat.com/add/<user> page data: subscribers (when shown), website, Spotlight posts with date/views/shares
//   TikTok     oEmbed (does the account exist?), creator embed (followers, last ~10 videos), video embed (likes, comments…)
//   Instagram  profile embed in Chromium: exact followers + last 6 posts with likes and comments
//   Facebook   the page itself by plain fetch: followers text, latest post, the page's own website and profile links
//   X          X's official oEmbed: does the account exist?
//   LinkedIn   guest company typeahead: exact company names for finding the right page
// Parsers are pure (tested with fixtures); capture functions fetch and pace requests and throw CaptureError when useful.
import { chromium } from 'playwright';
import { parseCount } from './extract.js';
import { CaptureError } from './errors.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const DAY = 86_400_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (platform, url, method, limit) => ({ platform, url, method, status: 'ok', capturedAt: new Date().toISOString(), profile: {}, posts: [], limit });
const handleOf = (url, index = 0) => {
  try {
    return (new URL(url).pathname.split('/').filter(Boolean)[index] || '').replace(/^@/, '');
  } catch {
    return '';
  }
};
const num = (v) => (v === undefined || v === null || v === '' || Number(v) < 0 || Number.isNaN(Number(v)) ? null : Number(v));
const get = (url, { fetchImpl = fetch, headers = {}, timeoutMs = 30_000 } = {}) => fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
const refused = (res, host) => (res.status === 429 || res.status === 999 ? new CaptureError('rate_limited', `${host} refused the request for now (HTTP ${res.status}); it is retried later`, { host, retryAfterMs: 15 * 60_000 }) : null);

// ---------- Snapchat ----------
export function parseSnapchatProfile(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let pp;
  try {
    pp = JSON.parse(m[1]).props?.pageProps || {};
  } catch {
    return null;
  }
  const info = pp.userProfile?.publicProfileInfo;
  if (!info) return null;
  const subs = num(info.subscriberCount);
  const posts = (pp.spotlightStoryMetadata || [])
    .filter((s) => s.videoMetadata?.uploadDateMs)
    .map((s) => ({
      id: String(s.videoMetadata.contentUrl || s.videoMetadata.uploadDateMs),
      url: s.videoMetadata.contentUrl || null,
      date: new Date(Number(s.videoMetadata.uploadDateMs)).toISOString(),
      type: 'video',
      caption: s.videoMetadata.embeddedTextCaption || s.videoMetadata.description || null,
      likes: null,
      comments: num(s.engagementStats?.commentCount),
      shares: num(s.engagementStats?.shareCount),
      views: num(s.engagementStats?.viewCount),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const storySnaps = (pp.story?.snapList || []).length;
  const lastUpdate = info.lastUpdateTimestampMs?.value ? new Date(Number(info.lastUpdateTimestampMs.value)).toISOString() : null;
  return {
    // "0" subscribers means the brand hides the number, not that it has none.
    profile: { name: info.title || null, followers: subs === 0 ? null : subs, website: info.websiteUrl || null, bio: info.bio || null, lastUpdate, storyLiveSnaps: storySnaps },
    posts,
  };
}

export async function captureSnapchatPublic(url, { fetchImpl = fetch } = {}) {
  const handle = handleOf(url, 0) === 'add' ? handleOf(url, 1) : handleOf(url, 0);
  if (!handle) throw new CaptureError('parse_failed', 'No Snapchat account name in the link');
  const res = await get(`https://www.snapchat.com/add/${encodeURIComponent(handle)}`, { fetchImpl });
  const limited = refused(res, 'Snapchat');
  if (limited) throw limited;
  if (res.status === 404) throw new CaptureError('not_found', 'This Snapchat account was not found. Correct the link, or mark it as not on this platform.');
  const parsed = parseSnapchatProfile(await res.text());
  if (!parsed) throw new CaptureError('parse_failed', 'Snapchat did not show a public profile for this account');
  const cap = base('snapchat', url, 'auto: Snapchat public profile (no login)', null);
  cap.profile = parsed.profile;
  cap.posts = parsed.posts;
  cap.note = `Posts = Spotlight videos (stories disappear after 24 hours and cannot be counted over 90 days)${parsed.profile.storyLiveSnaps ? `; a story with ${parsed.profile.storyLiveSnaps} snap(s) is live now` : ''}${parsed.profile.followers === null ? '; the subscriber count is hidden by the brand' : ''}.`;
  return cap;
}

// ---------- TikTok ----------
const frontity = (html) => {
  const m = String(html || '').match(/<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
};
export const tiktokIdDate = (id) => {
  try {
    return new Date(Number(BigInt(String(id)) >> 32n) * 1000).toISOString();
  } catch {
    return null;
  }
};

// oEmbed: 200 = the account exists, 400 = it does not.
export async function tiktokExists(handle, { fetchImpl = fetch } = {}) {
  const res = await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${handle}`)}`, { fetchImpl });
  if (res.status === 400 || res.status === 404) return false;
  if (!res.ok) return null;
  return true;
}

export function parseTikTokCreatorEmbed(html, handle) {
  const data = frontity(html)?.source?.data || {};
  const key = Object.keys(data).find((k) => k.toLowerCase() === `/embed/@${String(handle).toLowerCase()}`) || Object.keys(data).find((k) => k.startsWith('/embed/@'));
  const d = key ? data[key] : null;
  if (!d?.userInfo) return null;
  const u = d.userInfo;
  return {
    profile: { name: u.nickname || null, followers: num(u.followerCount), totalLikes: num(u.heartCount), bio: u.signature || null, private: Boolean(u.privateAccount) },
    videos: (d.videoList || []).map((v) => ({ id: String(v.id), caption: v.desc || null, views: num(v.playCount), date: tiktokIdDate(v.id) })).sort((a, b) => String(b.date).localeCompare(String(a.date))),
  };
}

export function parseTikTokVideoEmbed(html, id) {
  const data = frontity(html)?.source?.data || {};
  const v = data[`/embed/v2/${id}`]?.videoData || Object.values(data).find((x) => x?.videoData)?.videoData;
  if (!v?.itemInfos) return null;
  const i = v.itemInfos;
  const images = v.imagePostInfo?.displayImages || v.imagePostInfo?.images || [];
  return {
    post: { id: String(i.id || id), date: i.createTime ? new Date(Number(i.createTime) * 1000).toISOString() : tiktokIdDate(id), type: images.length ? 'carousel' : 'video', caption: i.text || null, likes: num(i.diggCount), comments: num(i.commentCount), shares: num(i.shareCount), views: num(i.playCount) },
    videoCount: num(v.authorStats?.videoCount),
  };
}

// TikTok without yt-dlp and without a browser: creator embed, then one video embed per video inside the window.
export async function captureTikTokEmbeds(url, { fetchImpl = fetch, windowDays = 90, now = Date.now(), paceMs = 3500 } = {}) {
  const handle = handleOf(url, 0);
  if (!handle) throw new CaptureError('parse_failed', 'No TikTok account name in the link');
  const res = await get(`https://www.tiktok.com/embed/@${encodeURIComponent(handle)}`, { fetchImpl });
  if (res.status === 400 || res.status === 404) throw new CaptureError('not_found', 'This TikTok account was not found. Correct the link, or mark it as not on this platform.');
  const limited = refused(res, 'TikTok');
  if (limited) throw limited;
  const creator = parseTikTokCreatorEmbed(await res.text(), handle);
  if (!creator) throw new CaptureError('parse_failed', 'TikTok changed its public profile embed');
  if (creator.profile.private) throw new CaptureError('private', 'This TikTok account is private');
  const cap = base('tiktok', url, 'auto: TikTok public embeds (no login)', creator.videos.length);
  cap.profile = { name: creator.profile.name, followers: creator.profile.followers, totalLikes: creator.profile.totalLikes, bio: creator.profile.bio };
  const windowStart = now - windowDays * DAY;
  for (const v of creator.videos) {
    const inWindow = v.date && Date.parse(v.date) >= windowStart;
    let post = { id: v.id, url: `https://www.tiktok.com/@${handle}/video/${v.id}`, date: v.date, type: 'video', caption: v.caption, likes: null, comments: null, shares: null, views: v.views };
    if (inWindow) {
      await pause(paceMs);
      try {
        const vr = await get(`https://www.tiktok.com/embed/v2/${v.id}`, { fetchImpl });
        const parsed = vr.ok ? parseTikTokVideoEmbed(await vr.text(), v.id) : null;
        if (parsed) {
          post = { ...post, ...parsed.post, url: post.url };
          cap.profile.postsTotal ??= parsed.videoCount;
        }
      } catch {
        // keep the views from the creator embed
      }
    }
    cap.posts.push(post);
  }
  cap.note = 'Interactions = likes + comments + shares from each video\'s public embed; the creator embed lists the latest ~10 videos.';
  return cap;
}

// ---------- Instagram ----------
export function parseInstagramProfileEmbed(html) {
  const m = String(html || '').match(/"contextJSON":("(?:[^"\\]|\\.)*")/);
  if (!m) return null;
  let c;
  try {
    c = JSON.parse(JSON.parse(m[1])).context || {};
  } catch {
    return null;
  }
  const posts = (c.graphql_media || [])
    .map((e) => e.shortcode_media || e.node || e)
    .filter((n) => n?.shortcode)
    .map((n) => ({
      id: String(n.id || n.shortcode),
      url: `https://www.instagram.com/p/${n.shortcode}/`,
      date: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
      type: n.__typename === 'GraphVideo' ? 'video' : n.__typename === 'GraphSidecar' ? 'carousel' : 'image',
      caption: n.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 300) || null,
      likes: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? null,
      comments: n.edge_media_to_comment?.count ?? null,
      shares: null,
      views: n.video_view_count ?? null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { profile: { name: c.full_name || null, followers: c.followers_count ?? null, postsTotal: c.posts_count ?? null }, posts };
}

export async function captureInstagramEmbed(url, { browser = null } = {}) {
  const handle = handleOf(url, 0);
  if (!handle) throw new CaptureError('parse_failed', 'No Instagram account name in the link');
  const own = !browser;
  const b = browser || (await chromium.launch());
  try {
    const page = await (await b.newContext({ locale: 'en-US', userAgent: UA, viewport: { width: 1280, height: 1000 } })).newPage();
    const res = await page.goto(`https://www.instagram.com/${handle}/embed/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await pause(3500);
    if (res?.status() === 404) throw new CaptureError('not_found', 'This Instagram account was not found. Correct the link, or mark it as not on this platform.');
    if (res?.status() === 429) throw new CaptureError('rate_limited', 'Instagram refused the request for now; it is retried later', { host: 'Instagram', retryAfterMs: 15 * 60_000 });
    const parsed = parseInstagramProfileEmbed(await page.content());
    if (!parsed || parsed.profile.followers === null) throw new CaptureError('parse_failed', 'Instagram did not show the public profile embed');
    const cap = base('instagram', url, 'auto: Instagram profile embed (no login)', 6);
    cap.profile = parsed.profile;
    cap.posts = parsed.posts;
    cap.note = 'Interactions = likes + comments from the public profile embed (the latest 6 posts).';
    return cap;
  } finally {
    if (own) await b.close();
  }
}

// ---------- Facebook ----------
const unescapeFb = (s) => String(s || '').replace(/\\u0025/gi, '%').replace(/\\\//g, '/').replace(/\\u0040/gi, '@');
export function parseFacebookPageHtml(html) {
  const text = String(html || '');
  const title = (text.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '';
  const hasOg = /<meta property="og:(title|description)"/.test(text);
  if (!hasOg && /^\s*Facebook\s*$/.test(title)) return null;
  const decodeHtml = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\u200e/g, '');
  const og = decodeHtml((text.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || '');
  const followers = parseCount((text.match(/"text":"([\d.,]+[KkMm]?) followers"/) || [])[1]);
  const likes = parseCount((og.match(/([\d.,]+[KkMm]?) likes/) || [])[1]);
  const links = new Set();
  for (const [, u] of text.matchAll(/l\.facebook\.com\\?\/l\.php\?u=([^&"]+)/g)) {
    try {
      links.add(decodeURIComponent(unescapeFb(u)));
    } catch {}
  }
  for (const [, u] of text.matchAll(/"external_url":"([^"]+)"/g)) links.add(unescapeFb(u));
  const created = [...text.matchAll(/"creation_time":(\d{9,11})/g)].map((m) => Number(m[1])).sort((a, b) => b - a)[0];
  return {
    profile: { name: decodeHtml(title).trim() || null, followers, likes, followersApproximate: /[KkMm]$/.test((text.match(/"text":"([\d.,]+[KkMm]?) followers"/) || [])[1] || ''), links: [...links].filter((l) => /^https?:\/\//.test(l) && !/l\.facebook\.com\/l\.php/.test(l)).slice(0, 20) },
    latestPostDate: created ? new Date(created * 1000).toISOString() : null,
  };
}

// The page by plain fetch: followers, the page's own links (for checking it is the right company) and the latest post date.
export async function fetchFacebookPage(url, { fetchImpl = fetch } = {}) {
  const res = await get(url, { fetchImpl, headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none', accept: 'text/html' } });
  const limited = refused(res, 'Facebook');
  if (limited) throw limited;
  const parsed = res.ok ? parseFacebookPageHtml(await res.text()) : null;
  if (!parsed) throw new CaptureError('restricted_or_missing', 'Facebook does not show this page to logged-out visitors (it may not exist, be a personal profile, or be age/country restricted)');
  return parsed;
}

export async function captureFacebookPage(url, options = {}) {
  const parsed = await fetchFacebookPage(url, options);
  const cap = base('facebook', url, 'auto: Facebook page (no login)', 1);
  cap.status = 'partial';
  cap.profile = { name: parsed.profile.name, followers: parsed.profile.followers, links: parsed.profile.links };
  cap.posts = parsed.latestPostDate ? [{ id: `fb-${Date.parse(parsed.latestPostDate)}`, url: null, date: parsed.latestPostDate, type: 'other', caption: null, likes: null, comments: null, shares: null, views: null }] : [];
  cap.rhythmUnknown = true;
  cap.note = 'Only the followers and the latest post date were readable; the posting rhythm is unknown.';
  return cap;
}

// ---------- X ----------
export async function xExists(handle, { fetchImpl = fetch } = {}) {
  const res = await get(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`, { fetchImpl });
  if (res.status === 404) return false;
  if (!res.ok) return null;
  return true;
}

// ---------- LinkedIn ----------
export async function linkedInCompanies(query, { fetchImpl = fetch } = {}) {
  const res = await get(`https://www.linkedin.com/jobs-guest/api/typeaheadHits?typeaheadType=COMPANY&query=${encodeURIComponent(query)}`, { fetchImpl });
  if (!res.ok) return [];
  const list = await res.json().catch(() => []);
  return (Array.isArray(list) ? list : []).filter((x) => x.type === 'COMPANY').map((x) => ({ id: String(x.id), name: x.displayName }));
}
