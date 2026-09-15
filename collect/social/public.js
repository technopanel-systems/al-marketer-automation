// Logged-out captures of public pages — no account, no login, no key (tested 2026-09-14):
//   LinkedIn  company page as a guest (plain HTTP): followers + the last ~10 posts (date from the post id, format, reactions, comments)
//   Facebook  the official Page Plugin that websites embed: followers + the last ~5 posts (date, reactions, comments, shares)
//   X         FxEmbed's public API (github.com/FxEmbed/FxEmbed, free, open source): followers + posts (date, likes, reposts, replies, views)
//   Instagram the public profile page: followers + the last 12 posts (date, format); likes from each post's public embed
// Each parser is a pure function (tested with fixtures); the capture functions only fetch and pace requests.
// Every function returns a normalized capture: { platform, url, method, status, capturedAt, profile, posts, limit }.
import { chromium } from 'playwright';
import { parseCount, linkedInActivityDate } from './extract.js';
import { CaptureError } from './errors.js';

export const PUBLIC_LIMITS = { linkedin: 10, facebook: 5, instagram: 12, xPages: 5 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const DAY = 86_400_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (platform, url, method, limit) => ({ platform, url, method, status: 'ok', capturedAt: new Date().toISOString(), profile: {}, posts: [], limit });
const decode = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
const handleOf = (url, index = 0) => {
  try {
    return (new URL(url).pathname.split('/').filter(Boolean)[index] || '').replace(/^@/, '');
  } catch {
    return '';
  }
};

// ---------- LinkedIn ----------
export function parseLinkedInCompanyHtml(html) {
  const text = String(html || '');
  const followers = parseCount((text.match(/([\d,.]+[KkMm]?) followers/) || [])[1]);
  const name = decode((text.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '').replace(/\s*\|\s*LinkedIn\s*$/, '') || null;
  const hasUpdates = text.includes('data-test-id="updates"');
  const redirect = (text.match(/data-tracking-control-name="about_website"[^>]*href="[^"]*[?&]url=([^&"]+)/) || [])[1];
  let website = null;
  try {
    website = redirect ? decodeURIComponent(redirect.replace(/&amp;/g, '&')) : (text.match(/"sameAs":"([^"]+)"/) || [])[1] || null;
  } catch {}
  const posts = [];
  for (const chunk of text.split(/<article [^>]*data-activity-urn="urn:li:activity:/).slice(1)) {
    const card = chunk.slice(0, chunk.indexOf('</article>') + 1 || undefined);
    const id = (card.match(/^(\d{15,22})/) || [])[1];
    if (!id) continue;
    const testIds = new Set([...card.matchAll(/data-test-id="([^"]+)"/g)].map((m) => m[1]));
    const has = (re) => [...testIds].some((x) => re.test(x));
    const images = (card.match(/data-test-id="feed-images-content__list-item"/g) || []).length;
    const type = /<video\b/.test(card) || has(/video/) ? 'video' : has(/document/) ? 'document' : images > 1 ? 'carousel' : images === 1 ? 'image' : has(/article/) ? 'article' : 'text';
    posts.push({
      id,
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
      date: linkedInActivityDate(id),
      type,
      caption: decode((card.match(/data-test-id="main-feed-activity-card__commentary"[^>]*>([\s\S]*?)<\/p>/) || [])[1]).slice(0, 300) || null,
      likes: parseCount(decode((card.match(/data-test-id="social-actions__reaction-count"[^>]*>([\s\S]*?)<\/span>/) || [])[1])) ?? 0,
      comments: parseCount((card.match(/data-num-comments="(\d+)"/) || [])[1]) ?? 0,
      shares: null,
      views: null,
    });
  }
  return { profile: { name, followers, website }, posts, hasUpdates };
}

export async function captureLinkedInPublic(url, { fetchImpl = fetch } = {}) {
  const kind = handleOf(url, 0);
  if (!['company', 'showcase', 'school'].includes(kind)) throw new Error('Only LinkedIn company pages can be read without a login — add the company page link (linkedin.com/company/...)');
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  const html = await res.text();
  if (res.status === 999 || res.status === 429) throw new CaptureError('rate_limited', `LinkedIn refused the request for now (HTTP ${res.status}); it is retried later`, { host: 'LinkedIn', retryAfterMs: 15 * 60_000 });
  const parsed = parseLinkedInCompanyHtml(html);
  if (res.status === 404) throw new CaptureError('not_found', 'This LinkedIn company page was not found. The link may be out of date: correct it, or mark it as not on this platform.');
  if (!res.ok || parsed.profile.followers === null) throw new CaptureError('parse_failed', `LinkedIn did not show the public company page (HTTP ${res.status})`);
  // Without the posts section LinkedIn hid them from guests: followers are known, the rhythm stays unknown (never "no posts").
  if (!parsed.hasUpdates) {
    const partial = base('linkedin', res.url || url, 'auto: LinkedIn public page (no login)', 0);
    partial.status = 'partial';
    partial.profile = parsed.profile;
    partial.postsHidden = true;
    partial.rhythmUnknown = true;
    partial.note = 'LinkedIn shows this page\'s followers but hides its posts from logged-out visitors, so the posting rhythm is unknown.';
    throw new CaptureError('posts_hidden', 'LinkedIn shows this page but hides its posts from logged-out visitors', { capture: partial });
  }
  const cap = base('linkedin', url, 'auto: LinkedIn public page (no login)', PUBLIC_LIMITS.linkedin);
  cap.profile = parsed.profile;
  cap.posts = parsed.posts;
  cap.note = 'Interactions = reactions + comments (LinkedIn does not show reposts to guests).';
  return cap;
}

// ---------- Facebook ----------
// Cards come from the Page Plugin DOM: { utime, text, like, comment, share, video, images }.
export function mapFacebookPluginCards(cards) {
  const count = (v) => (/\d/.test(String(v || '')) ? parseCount(v) : 0);
  return cards
    .filter((c) => c.utime)
    .map((c) => ({
      id: `fb-${c.utime}`,
      url: c.link || null,
      date: new Date(Number(c.utime) * 1000).toISOString(),
      type: c.video ? 'video' : c.images > 1 || c.more ? 'carousel' : c.images === 1 ? 'image' : 'text',
      caption: String(c.text || '').slice(0, 300) || null,
      likes: count(c.like),
      comments: count(c.comment),
      shares: count(c.share),
      views: null,
    }));
}

export async function captureFacebookPublic(url, { browser = null } = {}) {
  const own = !browser;
  const b = browser || (await chromium.launch());
  try {
    const page = await (await b.newContext({ locale: 'en-US', userAgent: UA, viewport: { width: 1280, height: 1000 } })).newPage();
    const plugin = `https://www.facebook.com/plugins/page.php?${new URLSearchParams({ href: url, tabs: 'timeline', width: '500', height: '5000', hide_cover: 'true', show_facepile: 'false' })}`;
    await page.goto(plugin, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('[data-utime], body', { timeout: 15_000 }).catch(() => {});
    await pause(5000);
    const data = await page.evaluate(() => {
      const header = document.body.innerText.slice(0, 400);
      const cards = [...document.querySelectorAll('abbr[data-utime]')].map((stamp) => {
        let card = stamp;
        for (let i = 0; i < 16 && card.parentElement; i++) {
          card = card.parentElement;
          if (card.querySelector('div[title="Like"], div[title="Comment"]')) break;
        }
        const title = (t) => card.querySelector(`div[title="${t}"]`)?.innerText.trim() || '';
        return {
          utime: stamp.getAttribute('data-utime'),
          link: stamp.closest('a')?.href || null,
          text: card.querySelector('[data-testid="post_message"]')?.innerText.trim() || '',
          like: title('Like'),
          comment: title('Comment'),
          share: title('Share'),
          video: Boolean(card.querySelector('video')),
          // Post photos, not the page's small profile pictures; "+5" marks more photos in the same post.
          images: [...card.querySelectorAll('img')].filter((i) => Math.max(i.width || 0, i.naturalWidth || 0) >= 120).length,
          more: /(^|\n)\+\d+(\n|$)/.test(card.innerText),
        };
      });
      return { header, cards };
    });
    const followers = parseCount((data.header.match(/([\d,.]+[KkMm]?) (?:followers|likes)/i) || [])[1]);
    if (followers === null && !data.cards.length) throw new CaptureError('restricted_or_missing', 'Facebook did not show this page publicly (it may not exist, be a personal profile, or be restricted)');
    const cap = base('facebook', url, 'auto: Facebook Page Plugin (no login)', PUBLIC_LIMITS.facebook);
    cap.profile = { name: data.header.split('\n')[0]?.trim() || null, followers };
    cap.posts = mapFacebookPluginCards(data.cards);
    cap.note = 'Interactions = reactions + comments + shares. The public plugin shows the latest 5 posts.';
    return cap;
  } finally {
    if (own) await b.close();
  }
}

// ---------- X ----------
export function mapFxStatuses(results, handle) {
  const own = String(handle || '').toLowerCase();
  return (results || [])
    .filter((s) => s && s.type !== 'repost' && !s.reposted_by && String(s.author?.screen_name || '').toLowerCase() === own)
    .filter((s) => !s.replying_to || String(s.replying_to.screen_name || s.replying_to || '').toLowerCase() === own)
    .map((s) => ({
      id: String(s.id),
      url: s.url || null,
      date: s.created_timestamp ? new Date(s.created_timestamp * 1000).toISOString() : s.created_at ? new Date(s.created_at).toISOString() : null,
      type: s.media?.videos?.length ? 'video' : (s.media?.photos?.length || 0) > 1 ? 'carousel' : s.media?.photos?.length ? 'image' : 'text',
      caption: String(s.text || '').slice(0, 300) || null,
      likes: s.likes ?? null,
      comments: s.replies ?? null,
      shares: (s.reposts ?? 0) + (s.quotes ?? 0),
      views: s.views ?? null,
    }));
}

export async function captureXPublic(url, { fetchImpl = fetch, apiBase = process.env.ALM_FXTWITTER_API || 'https://api.fxtwitter.com', windowDays = 90, now = Date.now(), pageDelayMs = 1500 } = {}) {
  const handle = handleOf(url, 0);
  if (!handle) throw new Error('No X account name in the link');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new CaptureError('not_found', `"${handle}" is not an X account name. Correct the link, or mark it as not on this platform.`);
  const get = async (path) => {
    const res = await fetchImpl(`${apiBase}${path}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    const body = await res.json().catch(() => null);
    if (res.status === 404) throw new CaptureError('not_found', 'This X account was not found. The link may be out of date: correct it, or mark it as not on this platform.');
    if (res.status === 429) throw new CaptureError('rate_limited', 'The X public data service refused for now; it is retried later', { host: 'FxEmbed', retryAfterMs: 15 * 60_000 });
    if (!res.ok || !body) throw new CaptureError('parse_failed', res.ok ? 'The X public data service answered without readable data; try again later' : `X public data service answered HTTP ${res.status}; try again later`);
    return body;
  };
  const profile = await get(`/${encodeURIComponent(handle)}`);
  if (!profile.user) throw new CaptureError('not_found', 'X account not found or not public');
  const cap = base('x', url, 'auto: X via FxEmbed (no login)', null);
  cap.profile = { name: profile.user.name || null, followers: profile.user.followers ?? null, postsTotal: profile.user.tweets ?? null, website: profile.user.website?.url || null, bio: profile.user.description || null };
  const windowStart = now - windowDays * DAY;
  let cursor = null;
  const seen = new Set();
  for (let pageNo = 0; pageNo < PUBLIC_LIMITS.xPages; pageNo++) {
    if (pageNo) await pause(pageDelayMs);
    const body = await get(`/2/profile/${encodeURIComponent(handle)}/statuses${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    const results = body.results || [];
    for (const post of mapFxStatuses(results, handle)) if (!seen.has(post.id)) (seen.add(post.id), cap.posts.push(post));
    const oldest = Math.min(...results.map((s) => (s.created_timestamp ? s.created_timestamp * 1000 : Infinity)));
    cursor = body.cursor?.bottom || null;
    if (!results.length || !cursor || oldest < windowStart) break;
    // Stopped by the page cap while still inside the window: mark the capture as cut off.
    if (pageNo === PUBLIC_LIMITS.xPages - 1) cap.limit = cap.posts.length;
  }
  cap.note = 'Interactions = likes + replies + reposts/quotes; reposts of other accounts are not counted as posts.';
  return cap;
}

// ---------- Instagram ----------
// Instagram media ids carry their creation time: milliseconds since Instagram's epoch, shifted left by 23 bits.
export function instagramIdDate(pk) {
  try {
    const ms = Number(BigInt(String(pk)) >> 23n) + 1314220021721;
    return ms > Date.UTC(2010, 9, 1) && ms < Date.now() + DAY ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

const findKey = (o, key) => {
  if (!o || typeof o !== 'object') return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
};

export function parseInstagramProfileHtml(html) {
  const text = String(html || '');
  const meta = decode((text.match(/<meta (?:property="og:description"|name="description") content="([^"]*)"/) || [])[1] || '');
  const profile = { followers: parseCount((meta.match(/([\d,.]+[KkMm]?) Followers/i) || [])[1]), postsTotal: parseCount((meta.match(/([\d,.]+[KkMm]?) Posts/i) || [])[1]) };
  let edges = [];
  for (const [, json] of text.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!json.includes('polaris_ordered_timeline_connection')) continue;
    try {
      edges = findKey(JSON.parse(json), 'polaris_ordered_timeline_connection')?.edges || [];
    } catch {}
    if (edges.length) break;
  }
  const posts = edges
    .map((e) => e?.node)
    .filter((n) => n?.code)
    .map((n) => ({
      id: String(n.pk || n.code),
      url: `https://www.instagram.com/p/${n.code}/`,
      code: n.code,
      date: instagramIdDate(n.pk),
      type: n.product_type === 'clips' || n.media_type === 2 ? 'video' : n.media_type === 8 || n.product_type === 'carousel_container' ? 'carousel' : 'image',
      caption: String(n.caption?.text || '').slice(0, 300) || null,
      likes: null,
      comments: null,
      shares: null,
      views: null,
    }));
  return { profile, posts, loginWall: /accounts\/login/.test(text) && !posts.length };
}

// The public embed of one post ("1 like", "View all 3 comments").
export function parseInstagramEmbedText(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const likes = t.match(/([\d,.]+[KkMm]?) likes?\b/i);
  const comments = t.match(/View all ([\d,.]+[KkMm]?) comments?/i);
  return { likes: likes ? parseCount(likes[1]) : null, comments: comments ? parseCount(comments[1]) : null };
}

export async function captureInstagramPublic(url, { browser = null, windowDays = 90, now = Date.now(), postDelayMs = 2500 } = {}) {
  const handle = handleOf(url, 0);
  if (!handle) throw new Error('No Instagram account name in the link');
  const own = !browser;
  const b = browser || (await chromium.launch());
  try {
    const page = await (await b.newContext({ locale: 'en-US', userAgent: UA, viewport: { width: 1280, height: 1000 } })).newPage();
    const res = await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await pause(4000);
    const parsed = parseInstagramProfileHtml(await page.content());
    const title = await page.title().catch(() => '');
    if (res?.status() === 404 || /isn.t available/i.test(title)) throw new CaptureError('not_found', 'This Instagram account was not found. Correct the link, or mark it as not on this platform.');
    if (parsed.profile.followers === null && !parsed.posts.length) throw parsed.loginWall ? new CaptureError('login_wall', 'Instagram asked for a login this time') : new CaptureError('parse_failed', 'Instagram did not show this profile publicly');
    // Pinned posts come first on the profile; the rhythm needs them in date order.
    parsed.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const cap = base('instagram', url, 'auto: Instagram public page (no login)', PUBLIC_LIMITS.instagram);
    cap.profile = parsed.profile;
    cap.posts = parsed.posts;
    // Likes: one public embed per post inside the window, at a slow pace; stop quietly if Instagram slows us down.
    const windowStart = now - windowDays * DAY;
    let read = 0;
    for (const post of cap.posts.filter((x) => x.date && Date.parse(x.date) >= windowStart)) {
      await pause(postDelayMs);
      try {
        await page.goto(`https://www.instagram.com/p/${post.code}/embed/captioned/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await pause(2500);
        const numbers = parseInstagramEmbedText(await page.evaluate(() => document.body.innerText));
        if (numbers.likes === null) break;
        post.likes = numbers.likes;
        post.comments = numbers.comments;
        read++;
      } catch {
        break;
      }
    }
    for (const post of cap.posts) delete post.code;
    cap.note = `Interactions = likes${read ? '' : ' (not readable this time)'}; Instagram does not show comment counts to logged-out visitors on every post.`;
    return cap;
  } finally {
    if (own) await b.close();
  }
}
