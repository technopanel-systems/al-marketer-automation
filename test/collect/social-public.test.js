// Logged-out public captures: parsers tested on small fixtures shaped like the real pages (checked live 2026-09-14). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkedInCompanyHtml, captureLinkedInPublic, mapFacebookPluginCards, mapFxStatuses, captureXPublic, instagramIdDate, parseInstagramProfileHtml, parseInstagramEmbedText } from '../../collect/social/public.js';

const liCard = (id, inner) => `<article class="relative main-feed-activity-card" data-activity-urn="urn:li:activity:${id}" data-id="main-feed-card"><time class="flex-none"> 1mo </time>${inner}</article>`;
const liPage = (cards, { updates = true } = {}) => `<html><head><meta property="og:title" content="Acme Panels | LinkedIn"></head><body>
<p class="!text-xs"> 2,093 followers </p>${updates ? '<section data-test-id="updates">' : ''}${cards.join('\n')}</body></html>`;

test('LinkedIn guest company page: followers and posts with exact dates, formats, reactions and comments', () => {
  const html = liPage([
    liCard('7484509838895554561', `<p data-test-id="main-feed-activity-card__commentary" dir="ltr">Night view &amp; facade<br>Riyadh</p>
      <ul data-test-id="feed-images-content"><li data-test-id="feed-images-content__list-item"></li><li data-test-id="feed-images-content__list-item"></li></ul>
      <span data-test-id="social-actions__reaction-count"> 1,013 </span><a data-test-id="social-actions__comments" data-num-comments="4"> 4 Comments </a>`),
    liCard('7425000000000000000', `<p data-test-id="main-feed-activity-card__commentary">We are hiring. Required documentation: CV</p>`),
  ]);
  const r = parseLinkedInCompanyHtml(html);
  assert.equal(r.profile.followers, 2093);
  assert.equal(r.profile.name, 'Acme Panels');
  assert.equal(r.hasUpdates, true);
  assert.equal(r.posts.length, 2);
  assert.equal(r.posts[0].date.slice(0, 10), '2026-07-19');
  assert.equal(r.posts[0].type, 'carousel');
  assert.equal(r.posts[0].likes, 1013);
  assert.equal(r.posts[0].comments, 4);
  assert.equal(r.posts[0].caption, 'Night view & facade\nRiyadh');
  // The word "documentation" in a caption is not a document post; no reactions shown = 0.
  assert.equal(r.posts[1].type, 'text');
  assert.equal(r.posts[1].likes, 0);
  assert.equal(r.posts[1].comments, 0);
});

test('LinkedIn capture refuses personal profiles, blocks and hidden posts instead of reporting "no posts"', async () => {
  const fake = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, text: async () => body });
  await assert.rejects(captureLinkedInPublic('https://www.linkedin.com/in/someone', { fetchImpl: fake(200, liPage([])) }), /company pages/);
  await assert.rejects(captureLinkedInPublic('https://www.linkedin.com/company/acme', { fetchImpl: fake(999, '') }), /refused/);
  await assert.rejects(captureLinkedInPublic('https://www.linkedin.com/company/acme', { fetchImpl: fake(200, liPage([], { updates: false })) }), (e) => e.code === 'posts_hidden' && e.capture.postsHidden && e.capture.status === 'partial' && e.capture.profile.followers !== null);
  await assert.rejects(captureLinkedInPublic('https://www.linkedin.com/company/gone', { fetchImpl: fake(404, '<title>LinkedIn</title>') }), (e) => e.code === 'not_found');
  const cap = await captureLinkedInPublic('https://www.linkedin.com/company/acme', { fetchImpl: fake(200, liPage([])) });
  assert.equal(cap.posts.length, 0, 'the posts section is there and empty: the page really has no posts');
  assert.equal(cap.limit, 10);
});

test('Facebook Page Plugin cards: dates from the timestamp, labels without numbers count as zero', () => {
  const posts = mapFacebookPluginCards([
    { utime: '1787577232', text: 'Built to last', like: '1', comment: 'Comment', share: '2', video: false, images: 0, more: false },
    { utime: '1784419200', text: 'Naya Tower', like: '1.2K', comment: '3', share: 'Share', video: false, images: 1, more: true },
    { utime: '1783900000', text: '', like: 'Like', comment: 'Comment', share: 'Share', video: true, images: 0, more: false },
    { utime: null, text: 'no timestamp' },
  ]);
  assert.equal(posts.length, 3);
  assert.equal(posts[0].date.slice(0, 10), '2026-08-24');
  assert.deepEqual([posts[0].likes, posts[0].comments, posts[0].shares, posts[0].type], [1, 0, 2, 'text']);
  assert.deepEqual([posts[1].likes, posts[1].comments, posts[1].shares, posts[1].type], [1200, 3, 0, 'carousel']);
  assert.equal(posts[2].type, 'video');
});

const fx = (id, days, extra = {}) => ({ type: 'status', id: String(id), url: `https://x.com/acme/status/${id}`, text: `post ${id}`, author: { screen_name: 'Acme' }, likes: 3, replies: 1, reposts: 2, quotes: 1, views: 90, created_timestamp: Math.floor((Date.UTC(2026, 8, 14) - days * 86_400_000) / 1000), ...extra });

test('X (FxEmbed): own posts and self-threads count; reposts and replies to other accounts do not', () => {
  const posts = mapFxStatuses([
    fx(1, 1, { media: { photos: [{}, {}] } }),
    fx(2, 2, { reposted_by: { screen_name: 'acme' }, author: { screen_name: 'someone' } }),
    fx(3, 3, { replying_to: { screen_name: 'customer' } }),
    fx(4, 4, { replying_to: { screen_name: 'acme' }, media: { videos: [{}] } }),
    fx(5, 5, { author: { screen_name: 'other' } }),
  ], 'acme');
  assert.deepEqual(posts.map((p) => p.id), ['1', '4']);
  assert.deepEqual([posts[0].type, posts[0].likes, posts[0].comments, posts[0].shares, posts[0].views], ['carousel', 3, 1, 3, 90]);
  assert.equal(posts[1].type, 'video');
});

test('X capture pages back only until the 90-day window is covered', async () => {
  const pages = { '': [fx(10, 5), fx(11, 40)], c1: [fx(12, 80), fx(13, 120)] };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const body = u.pathname.endsWith('/statuses') ? { results: pages[u.searchParams.get('cursor') || ''], cursor: { bottom: u.searchParams.get('cursor') ? 'c2' : 'c1' } } : { user: { name: 'Acme', followers: 262, tweets: 966 } };
    return { ok: true, status: 200, json: async () => body };
  };
  const cap = await captureXPublic('https://x.com/acme', { fetchImpl, apiBase: 'https://fx.test', now: Date.UTC(2026, 8, 14), pageDelayMs: 0 });
  assert.equal(cap.profile.followers, 262);
  assert.equal(cap.posts.length, 4);
  assert.equal(calls.filter((c) => c.includes('/statuses')).length, 2, 'stops once a post older than 90 days is seen');
  assert.equal(cap.limit, null);
});

test('Instagram public profile: followers, post count and the last posts with dates decoded from their ids; likes from the embed', () => {
  assert.equal(instagramIdDate('3937370988601974968').slice(0, 10), '2026-07-09');
  assert.equal(instagramIdDate('not-a-number'), null);
  const timeline = { require: [['X', null, null, [{ result: { data: { xig_user_by_username: { polaris_ordered_timeline_connection: { edges: [
    { node: { pk: '3937370988601974968', code: 'DakWg2UjKC4', media_type: 8, product_type: 'carousel_container', caption: { text: 'واجهة' } } },
    { node: { pk: '3937370988601974000', code: 'Reel1', media_type: 2, product_type: 'clips', caption: null } },
    { node: { pk: '3937370988601973000', code: 'Img1', media_type: 1, product_type: 'feed' } },
  ] } } } } }]]] };
  const html = `<meta property="og:description" content="1.2K Followers, 635 Following, 696 Posts - See Instagram photos">
<script type="application/json" data-sjs>${JSON.stringify(timeline)}</script>`;
  const r = parseInstagramProfileHtml(html);
  assert.equal(r.profile.followers, 1200);
  assert.equal(r.profile.postsTotal, 696);
  assert.deepEqual(r.posts.map((p) => p.type), ['carousel', 'video', 'image']);
  assert.equal(r.posts[0].date.slice(0, 10), '2026-07-09');
  assert.equal(r.posts[0].url, 'https://www.instagram.com/p/DakWg2UjKC4/');
  assert.equal(r.posts[0].likes, null, 'likes come from the post embed, not the profile page');
  assert.deepEqual(parseInstagramEmbedText('technopanelco 656 followers View more on Instagram Like Comment Share Save 1 like technopanelco text'), { likes: 1, comments: null });
  assert.deepEqual(parseInstagramEmbedText('Save 1,234 likes acme ... View all 12 comments'), { likes: 1234, comments: 12 });
  assert.equal(parseInstagramProfileHtml('<a href="/accounts/login/">Log in</a>').loginWall, true);
});
