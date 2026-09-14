// Turns what a platform's own web app loads (JSON responses) or shows (page DOM) into normalized posts and profile numbers.
// Parsers look for well-known field signatures anywhere in the data instead of exact endpoint paths, so small API changes
// don't break them. Anything not found stays null — the team can fill it in on the review screen.

export const POST_TYPES = ['video', 'image', 'carousel', 'text', 'document', 'article', 'other'];

// "1,234" · "1.2K" · "3M" · "١٬٢٣٤" · "12.5 ألف" → number; returns null when there is no number.
export function parseCount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٬,](?=\d{3}\b)/g, '')
    .replace('٫', '.')
    .trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*([KkMmBb]|ألف|مليون)?/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, 'ألف': 1e3, 'مليون': 1e6 }[String(m[2] || '').toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// LinkedIn activity ids carry their creation time in the first 41 bits (milliseconds since 1970).
export function linkedInActivityDate(id) {
  try {
    const ms = Number(BigInt(String(id)) >> 22n);
    return ms > Date.UTC(2003, 0, 1) && ms < Date.now() + 86_400_000 ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

function walk(node, visit, depth = 0) {
  if (depth > 60 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, visit, depth + 1);
    return;
  }
  visit(node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, visit, depth + 1);
}

// First value in a subtree that passes `test` (breadth-first, limited depth).
function findIn(node, test, maxDepth = 12) {
  const queue = [[node, 0]];
  while (queue.length) {
    const [n, d] = queue.shift();
    if (!n || typeof n !== 'object') continue;
    const hit = test(n);
    if (hit !== undefined && hit !== null) return hit;
    if (d < maxDepth) for (const v of Object.values(n)) if (v && typeof v === 'object') queue.push([v, d + 1]);
  }
  return null;
}

const postMap = () => new Map();
const upsert = (map, id, patch) => {
  const cur = map.get(id) || { id };
  for (const [k, v] of Object.entries(patch)) if (v !== null && v !== undefined && v !== '' && (cur[k] === null || cur[k] === undefined || cur[k] === '')) cur[k] = v;
  map.set(id, cur);
};

function linkedin(json, into) {
  walk(json, (o) => {
    const strings = [o.entityUrn, o.urn, o.backendUrn, o.metadata?.backendUrn, o.updateMetadata?.urn, o['*socialDetail'], o.shareUrn].filter((x) => typeof x === 'string').join(' ');
    const id = (strings.match(/urn:li:activity:(\d{15,22})/) || [])[1];
    if (!id) return;
    if ('numLikes' in o || 'numComments' in o || Array.isArray(o.reactionTypeCounts)) {
      const reactions = Array.isArray(o.reactionTypeCounts) && o.reactionTypeCounts.length ? o.reactionTypeCounts.reduce((s, r) => s + (r.count || 0), 0) : parseCount(o.numLikes);
      upsert(into.posts, id, { likes: reactions, comments: parseCount(o.numComments), shares: parseCount(o.numShares), views: parseCount(o.numImpressions) });
    }
    const caption = o.commentary?.text?.text ?? (typeof o.commentary?.text === 'string' ? o.commentary.text : null);
    if (caption !== null || o.content) {
      const keys = JSON.stringify(Object.keys(o.content || {})).toLowerCase();
      const type = /video/.test(keys) ? 'video' : /document/.test(keys) ? 'document' : /article/.test(keys) ? 'article' : /carousel|multiimage/.test(keys) ? 'carousel' : /image/.test(keys) ? 'image' : caption !== null ? 'text' : null;
      upsert(into.posts, id, { caption, type, url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` });
    }
    upsert(into.posts, id, { date: linkedInActivityDate(id) });
  });
}

function instagram(json, into, handle) {
  walk(json, (o) => {
    const code = o.code || o.shortcode;
    const takenAt = o.taken_at ?? o.taken_at_timestamp;
    const likes = o.like_count ?? o.edge_liked_by?.count ?? o.edge_media_preview_like?.count;
    const comments = o.comment_count ?? o.edge_media_to_comment?.count;
    if (code && typeof takenAt === 'number' && (likes !== undefined || comments !== undefined)) {
      const type = o.product_type === 'clips' || o.media_type === 2 || o.is_video || o.__typename === 'GraphVideo' ? 'video' : o.media_type === 8 || o.__typename === 'GraphSidecar' ? 'carousel' : 'image';
      upsert(into.posts, String(code), {
        url: `https://www.instagram.com/p/${code}/`,
        date: new Date(takenAt * 1000).toISOString(),
        type,
        likes: parseCount(likes),
        comments: parseCount(comments),
        views: parseCount(o.play_count ?? o.ig_play_count ?? o.view_count ?? o.video_view_count),
        caption: o.caption?.text ?? o.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
      });
    }
    if (typeof o.username === 'string' && (!handle || o.username.toLowerCase() === handle.toLowerCase())) {
      const followers = o.follower_count ?? o.edge_followed_by?.count;
      if (followers !== undefined) into.profile.followers ??= parseCount(followers);
      const total = o.media_count ?? o.edge_owner_to_timeline_media?.count;
      if (total !== undefined) into.profile.postsTotal ??= parseCount(total);
      if (o.full_name) into.profile.name ??= o.full_name;
    }
  });
}

function x(json, into, handle) {
  walk(json, (o) => {
    const l = o.legacy;
    if (l && typeof l.created_at === 'string' && 'favorite_count' in l) {
      const id = l.id_str || o.rest_id;
      if (!id) return;
      const media = l.extended_entities?.media?.[0]?.type;
      upsert(into.posts, String(id), {
        date: Number.isNaN(Date.parse(l.created_at)) ? null : new Date(l.created_at).toISOString(),
        type: media === 'video' || media === 'animated_gif' ? 'video' : media === 'photo' ? ((l.extended_entities?.media?.length || 0) > 1 ? 'carousel' : 'image') : 'text',
        likes: parseCount(l.favorite_count),
        comments: parseCount(l.reply_count),
        shares: (parseCount(l.retweet_count) || 0) + (parseCount(l.quote_count) || 0),
        views: parseCount(o.views?.count),
        caption: l.full_text ?? null,
      });
    }
    if (l && typeof l.screen_name === 'string' && 'followers_count' in l && (!handle || l.screen_name.toLowerCase() === handle.toLowerCase())) {
      into.profile.followers ??= parseCount(l.followers_count);
      into.profile.postsTotal ??= parseCount(l.statuses_count);
      into.profile.name ??= l.name;
    }
  });
}

function facebook(json, into) {
  walk(json, (o) => {
    if (typeof o.post_id !== 'string' || !/^\d+$/.test(o.post_id)) return;
    const created = findIn(o, (n) => (typeof n.creation_time === 'number' ? n.creation_time : undefined));
    const reactions = findIn(o, (n) => (n.reaction_count && typeof n.reaction_count.count === 'number' ? n.reaction_count.count : n.reactors && typeof n.reactors.count === 'number' ? n.reactors.count : undefined));
    const comments = findIn(o, (n) => (n.comments && typeof n.comments.total_count === 'number' ? n.comments.total_count : typeof n.total_comment_count === 'number' ? n.total_comment_count : undefined));
    const shares = findIn(o, (n) => (n.share_count && typeof n.share_count.count === 'number' ? n.share_count.count : undefined));
    const caption = findIn(o, (n) => (n.message && typeof n.message.text === 'string' ? n.message.text : undefined), 6);
    const hasVideo = Boolean(findIn(o, (n) => (n.__typename === 'Video' || n.playable_url ? true : undefined), 10));
    const photos = findIn(o, (n) => (Array.isArray(n.all_subattachments?.nodes) ? n.all_subattachments.nodes.length : undefined), 10);
    const url = findIn(o, (n) => (typeof n.url === 'string' && /facebook\.com\/.+\/(posts|videos|photos)\//.test(n.url) ? n.url : undefined), 8);
    upsert(into.posts, o.post_id, { date: created ? new Date(created * 1000).toISOString() : null, likes: reactions, comments, shares, caption, type: hasVideo ? 'video' : photos > 1 ? 'carousel' : photos === 1 ? 'image' : caption ? 'text' : null, url });
  });
}

const PARSERS = { linkedin, instagram, x, facebook };

/**
 * @param {string} platform
 * @param {Array<object>} jsonBodies parsed JSON responses captured while the page was open
 * @param {{ handle?: string }} [opts]
 */
export function extractFromJson(platform, jsonBodies, { handle } = {}) {
  const into = { posts: postMap(), profile: {} };
  const parse = PARSERS[platform];
  if (parse) for (const body of jsonBodies) parse(body, into, handle);
  return { posts: [...into.posts.values()].filter((p) => p.date || p.likes !== undefined || p.comments !== undefined), profile: into.profile };
}

// Responses sometimes come as "for (;;);{...}" or several JSON documents separated by newlines.
export function parseJsonBodies(text) {
  const clean = String(text || '').replace(/^\s*for\s*\(;;\);/, '').trim();
  if (!clean || !/^[[{]/.test(clean)) return [];
  try {
    return [JSON.parse(clean)];
  } catch {
    return clean.split(/\n(?=[[{])/).flatMap((part) => {
      try {
        return [JSON.parse(part)];
      } catch {
        return [];
      }
    });
  }
}

/**
 * Runs inside the page (serialized by Playwright): reads what is on screen as a fallback and for profile numbers.
 * Must not reference anything outside its own body.
 */
export function domExtractor(platform) {
  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const count = (s) => {
    const m = String(s || '').replace(/,(?=\d{3})/g, '').match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
    return m ? Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[String(m[2] || '').toLowerCase()] || 1)) : null;
  };
  const body = text(document.body);
  const followersMatch = body.match(/([\d.,]+\s?[KkMm]?)\s+(followers|Followers|متابِع|متابع)/);
  const profile = { followers: followersMatch ? count(followersMatch[1]) : null };
  const posts = [];
  if (platform === 'linkedin') {
    for (const el of document.querySelectorAll('[data-urn^="urn:li:activity:"]')) {
      const id = (el.getAttribute('data-urn').match(/activity:(\d+)/) || [])[1];
      if (!id) continue;
      const t = text(el);
      const reactionsEl = el.querySelector('.social-details-social-counts__reactions-count, [data-test-id="social-actions__reaction-count"]');
      const reactionsLabel = el.querySelector('[aria-label*="reaction" i]')?.getAttribute('aria-label');
      posts.push({
        id,
        likes: count(text(reactionsEl)) ?? count((reactionsLabel || '').match(/[\d.,]+\s?[KkMm]?/)?.[0]),
        comments: count((t.match(/([\d.,]+\s?[KkMm]?)\s+comments?/i) || [])[1]),
        shares: count((t.match(/([\d.,]+\s?[KkMm]?)\s+reposts?/i) || [])[1]),
        caption: text(el.querySelector('.update-components-text, .feed-shared-inline-show-more-text, .feed-shared-update-v2__description')) || null,
        type: el.querySelector('video') ? 'video' : el.querySelector('.update-components-document__container, iframe[title*="ocument"]') ? 'document' : el.querySelectorAll('.update-components-image img').length > 1 ? 'carousel' : el.querySelector('.update-components-image') ? 'image' : el.querySelector('.update-components-article') ? 'article' : 'text',
      });
    }
  } else if (platform === 'x') {
    for (const el of document.querySelectorAll('article[data-testid="tweet"]')) {
      const link = [...el.querySelectorAll('a[href*="/status/"]')].map((a) => a.getAttribute('href')).find((h) => /\/status\/\d+$/.test(h));
      const id = (link || '').match(/status\/(\d+)/)?.[1];
      if (!id) continue;
      const label = (sel) => el.querySelector(sel)?.getAttribute('aria-label') || '';
      posts.push({ id, url: `https://x.com${link}`, date: el.querySelector('time')?.getAttribute('datetime') || null, likes: count(label('[data-testid="like"]')), comments: count(label('[data-testid="reply"]')), shares: count(label('[data-testid="retweet"]')), views: count(label('a[href*="/analytics"]')), caption: text(el.querySelector('[data-testid="tweetText"]')) || null, type: el.querySelector('video') ? 'video' : el.querySelector('[data-testid="tweetPhoto"]') ? 'image' : 'text' });
    }
  }
  return { posts, profile, title: document.title, url: location.href };
}

// Merges several extraction results for the same page; JSON values win over DOM values, and nothing is invented.
export function mergeExtractions(platform, results) {
  const posts = postMap();
  const profile = {};
  for (const r of results) {
    for (const p of r.posts || []) {
      const date = p.date || (platform === 'linkedin' ? linkedInActivityDate(p.id) : null);
      upsert(posts, String(p.id), { ...p, date, url: p.url || (platform === 'linkedin' ? `https://www.linkedin.com/feed/update/urn:li:activity:${p.id}/` : null) });
    }
    for (const [k, v] of Object.entries(r.profile || {})) if (v !== null && v !== undefined && profile[k] === undefined) profile[k] = v;
  }
  const list = [...posts.values()].map((p) => ({ id: p.id, url: p.url || null, date: p.date || null, type: POST_TYPES.includes(p.type) ? p.type : 'other', caption: p.caption ?? null, likes: p.likes ?? null, comments: p.comments ?? null, shares: p.shares ?? null, views: p.views ?? null }));
  list.sort((a, b) => (Date.parse(b.date || 0) || 0) - (Date.parse(a.date || 0) || 0));
  return { posts: list, profile };
}
