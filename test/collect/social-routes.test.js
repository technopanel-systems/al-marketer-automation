// No-login fallbacks (shapes from pages saved on 2026-09-15), the route chain with the ownership check, and the Apify guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapchatProfile, parseTikTokCreatorEmbed, parseTikTokVideoEmbed, parseInstagramProfileEmbed, parseFacebookPageHtml, tiktokIdDate, captureSnapchatPublic } from '../../collect/social/routes.js';
import { captureWithFallbacks } from '../../collect/social/chain.js';
import { CaptureError } from '../../collect/social/errors.js';
import { apifyFallback, apifyBudget, MAPPERS } from '../../collect/social/apify.js';

const script = (id, data) => `<html><body><script id="${id}" type="application/json">${JSON.stringify(data)}</script></body></html>`;

test('Snapchat: subscribers, website and Spotlight posts newest first; "0" subscribers means hidden', () => {
  const page = script('__NEXT_DATA__', { props: { pageProps: { userProfile: { publicProfileInfo: { title: 'Jarirbookstore', subscriberCount: '141300', websiteUrl: 'https://www.jarir.com', lastUpdateTimestampMs: { value: '1789395285000' } } }, story: { snapList: [{}, {}] }, spotlightStoryMetadata: [{ videoMetadata: { uploadDateMs: '1788000000000' }, engagementStats: { viewCount: '-1', shareCount: '3', commentCount: '1' } }, { videoMetadata: { uploadDateMs: '1789395257837', contentUrl: 'https://cf-st.sc-cdn.net/x' }, engagementStats: { viewCount: '10948', shareCount: '330', commentCount: '10' } }, { videoMetadata: {} }] } } });
  const r = parseSnapchatProfile(page);
  assert.equal(r.profile.followers, 141300);
  assert.equal(r.profile.website, 'https://www.jarir.com');
  assert.equal(r.profile.storyLiveSnaps, 2);
  assert.equal(r.posts.length, 2, 'an entry without an upload date is skipped');
  assert.equal(r.posts[0].views, 10948, 'newest first');
  assert.equal(r.posts[1].views, null, '-1 views means hidden');
  const hidden = parseSnapchatProfile(script('__NEXT_DATA__', { props: { pageProps: { userProfile: { publicProfileInfo: { title: 'Al-Marketer', subscriberCount: '0' } } } } }));
  assert.equal(hidden.profile.followers, null);
  assert.equal(parseSnapchatProfile('<html>404</html>'), null);
});

test('a missing Snapchat account is "not found", not a failure', async () => {
  const fake = async () => new Response('not found', { status: 404 });
  await assert.rejects(captureSnapchatPublic('https://www.snapchat.com/add/nobody', { fetchImpl: fake }), (e) => e.code === 'not_found');
});

test('TikTok embeds: followers and videos from the creator embed; likes, comments and shares from the video embed', () => {
  const creator = script('__FRONTITY_CONNECT_STATE__', { source: { data: { '/embed/@almarketerksa': { userInfo: { nickname: 'Al-Marketer', followerCount: 20, heartCount: 247, signature: 'bio https://calendly.com/x', privateAccount: false }, videoList: [{ id: '7683852724697533716', desc: 'older', playCount: 8 }, { id: '7685047379745131797', desc: 'newer', playCount: 178 }] } } } });
  const c = parseTikTokCreatorEmbed(creator, 'almarketerksa');
  assert.equal(c.profile.followers, 20);
  assert.equal(c.videos[0].id, '7685047379745131797', 'newest first (pinned videos come first in the page)');
  assert.equal(c.videos[0].date, tiktokIdDate('7685047379745131797'));
  const video = script('__FRONTITY_CONNECT_STATE__', { source: { data: { '/embed/v2/7681625488569191700': { videoData: { itemInfos: { id: '7681625488569191700', createTime: '1788517810', diggCount: 7, commentCount: 0, shareCount: 1, playCount: 340, text: 'caption' }, authorStats: { videoCount: 83 }, imagePostInfo: { displayImages: [{}] } } } } } });
  const v = parseTikTokVideoEmbed(video, '7681625488569191700');
  assert.deepEqual([v.post.likes, v.post.comments, v.post.shares, v.post.views, v.post.type, v.videoCount], [7, 0, 1, 340, 'carousel', 83]);
  assert.equal(v.post.date, '2026-09-04T10:30:10.000Z');
});

test('Instagram profile embed: exact followers and likes + comments for the latest posts', () => {
  const context = { context: { full_name: 'Almarai', followers_count: 778458, posts_count: 6205, graphql_media: [{ shortcode_media: { id: '1', shortcode: 'A', taken_at_timestamp: 1788000000, __typename: 'GraphSidecar', edge_liked_by: { count: 1933 }, edge_media_to_comment: { count: 107 } } }, { shortcode_media: { id: '2', shortcode: 'B', taken_at_timestamp: 1789000000, __typename: 'GraphVideo', edge_liked_by: { count: 50 }, edge_media_to_comment: { count: 2 }, video_view_count: 900 } }] } };
  const html = `<script>window.x = {"contextJSON":${JSON.stringify(JSON.stringify(context))}};</script>`;
  const r = parseInstagramProfileEmbed(html);
  assert.equal(r.profile.followers, 778458);
  assert.equal(r.posts[0].url, 'https://www.instagram.com/p/B/');
  assert.deepEqual([r.posts[1].likes, r.posts[1].comments, r.posts[1].type], [1933, 107, 'carousel']);
  assert.equal(parseInstagramProfileEmbed('<html></html>'), null);
});

test("Facebook page: followers, latest post date and the page's own links; a login shell is unreadable", () => {
  const html = '<title>Al-Marketer الماركتير</title><meta property="og:description" content="Al-Marketer. 31 likes."><script>{"text":"31 followers"} {"creation_time":1789315517} {"creation_time":1780000000} "url":"https:\\/\\/l.facebook.com\\/l.php?u=http\\u00253A\\u00252F\\u00252Fwww.al-marketer.com\\u00252F&h=AU" "external_url":"https:\\/\\/www.instagram.com\\/almarketerksa"</script>';
  const r = parseFacebookPageHtml(html);
  assert.equal(r.profile.followers, 31);
  assert.equal(r.latestPostDate, '2026-09-13T16:05:17.000Z');
  assert.ok(r.profile.links.includes('http://www.al-marketer.com/'));
  assert.ok(r.profile.links.includes('https://www.instagram.com/almarketerksa'));
  assert.equal(parseFacebookPageHtml('<title>Facebook</title><body>log in</body>'), null);
});

const ok = (followers, extra = {}) => async (url) => ({ platform: 'instagram', url, method: 'fake', status: 'ok', capturedAt: new Date().toISOString(), profile: { followers, ...extra }, posts: [] });
const fail = (code, message = code) => async () => {
  throw new CaptureError(code, message);
};

test('the chain tries the next route after a block, stops at an answer, and uses Apify only when the free routes failed', async () => {
  let apifyCalls = 0;
  const apify = async () => (apifyCalls++, null);
  const routes = { instagram: [{ name: 'page', run: fail('rate_limited') }, { name: 'embed', run: ok(500) }] };
  const cap = await captureWithFallbacks('instagram', 'https://instagram.com/brand', { routes, apify });
  assert.equal(cap.profile.followers, 500);
  assert.deepEqual(cap.routes.map((r) => [r.route, r.ok]), [['page', false], ['embed', true]]);
  assert.equal(apifyCalls, 0);

  const stopped = { instagram: [{ name: 'page', run: fail('not_found', 'gone') }, { name: 'embed', run: ok(1) }] };
  await assert.rejects(captureWithFallbacks('instagram', 'https://instagram.com/gone', { routes: stopped, apify }), (e) => e.code === 'not_found' && e.routes.length === 1);
  assert.equal(apifyCalls, 0, 'an account that does not exist is not sent to Apify');

  const allFail = { instagram: [{ name: 'page', run: fail('login_wall') }, { name: 'embed', run: fail('parse_failed') }] };
  const viaApify = await captureWithFallbacks('instagram', 'https://instagram.com/brand', { routes: allFail, apify: async (pl, url) => (apifyCalls++, { platform: pl, url, method: 'fallback: Apify', status: 'ok', profile: { followers: 9 }, posts: [] }) });
  assert.equal(viaApify.profile.followers, 9);
  assert.equal(apifyCalls, 1);
});

test('hidden posts still give the followers; a page that belongs to someone else is refused', async () => {
  const partial = { platform: 'linkedin', url: 'https://linkedin.com/company/x', status: 'partial', rhythmUnknown: true, profile: { followers: 233 }, posts: [] };
  const routes = { linkedin: [{ name: 'guest page', run: async () => { throw new CaptureError('posts_hidden', 'hidden', { capture: partial }); } }] };
  const cap = await captureWithFallbacks('linkedin', 'https://linkedin.com/company/x', { routes, apify: async () => null });
  assert.equal(cap.status, 'partial');
  assert.equal(cap.profile.followers, 233);

  const other = { facebook: [{ name: 'page', run: async (url) => ({ platform: 'facebook', url, status: 'ok', profile: { name: 'سعودى كلادينج - Saudi Cladding', followers: 8100, links: [] }, posts: [] }) }] };
  await assert.rejects(captureWithFallbacks('facebook', 'https://www.facebook.com/Saudi.Cladding', { routes: other, identity: { brand: { names: ['Dalcobond'], website: 'https://dalcobond.com' }, foundVia: 'ai' }, apify: async () => null }), (e) => e.code === 'wrong_page' && /does not look like Dalcobond/.test(e.message));
  const trusted = await captureWithFallbacks('facebook', 'https://www.facebook.com/Saudi.Cladding', { routes: other, identity: { brand: { names: ['Dalcobond'], website: 'https://dalcobond.com' }, foundVia: 'team' }, apify: async () => null });
  assert.equal(trusted.identity.level, 'confirmed', 'a link the team entered is trusted');
});

test('Apify: off without a token (no network call), refused on a paid plan, and skipped when a run would cost too much', async () => {
  let calls = 0;
  const spy = async () => (calls++, new Response('{}'));
  assert.equal(await apifyFallback('instagram', 'https://instagram.com/x', { env: {}, fetchImpl: spy }), null);
  assert.equal(calls, 0);
  const reply = (routes) => async (url) => {
    const path = new URL(url).pathname;
    const body = Object.entries(routes).find(([k]) => path.endsWith(k))?.[1] ?? {};
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const steps = () => [{ actor: 'apify~instagram-profile-scraper', expect: { profile: 1 } }];
  const paying = await apifyBudget({ token: 't', steps: steps(), limit: 20, maxUsd: 0.12, reserveUsd: 0.5, proposalSpentUsd: 0, proposalCapUsd: 0.3, fetchImpl: reply({ '/users/me': { data: { isPaying: true } } }) });
  assert.match(paying.skip, /not on the free plan/);
  const price = (usd) => ({ '/users/me': { data: { isPaying: false } }, '/users/me/limits': { data: { limits: { maxMonthlyUsageUsd: 5 }, current: { monthlyUsageUsd: 1 } } }, '/acts/apify~instagram-profile-scraper': { data: { pricingInfos: [{ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { profile: { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: usd } } } } } }] } } });
  assert.match((await apifyBudget({ token: 't', steps: steps(), limit: 20, maxUsd: 0.12, reserveUsd: 0.5, proposalSpentUsd: 0, proposalCapUsd: 0.3, fetchImpl: reply(price(0.5)) })).skip, /above the \$0.12 cap/);
  assert.equal((await apifyBudget({ token: 't', steps: steps(), limit: 20, maxUsd: 0.12, reserveUsd: 0.5, proposalSpentUsd: 0, proposalCapUsd: 0.3, fetchImpl: reply(price(0.0026)) })).estimate, 0.0026);
  assert.match((await apifyBudget({ token: 't', steps: steps(), limit: 20, maxUsd: 0.12, reserveUsd: 0.5, proposalSpentUsd: 0.299, proposalCapUsd: 0.3, fetchImpl: reply(price(0.0026)) })).skip, /budget for this proposal/);
  const mapped = MAPPERS.instagram('u', [{ items: [{ fullName: 'Brand', followersCount: 12, postsCount: 3, latestPosts: [{ id: '1', timestamp: '2026-09-01T00:00:00Z', likesCount: 4, commentsCount: 1, type: 'Sidecar' }] }] }]);
  assert.deepEqual([mapped.profile.followers, mapped.posts[0].likes, mapped.posts[0].type, mapped.posts[0].shares], [12, 4, 'carousel', null]);
});

test('page discovery: handle and LinkedIn slug guesses, and only existing pages are suggested', async () => {
  const { handleVariations, linkedInSlugGuesses, discoverProfiles } = await import('../../collect/social/discover.js');
  assert.deepEqual(handleVariations({ website: 'https://www.al-marketer.com', handles: ['almarketerksa'] }), ['almarketerksa', 'almarketer', 'almarketersa', 'almarketerco']);
  assert.ok(linkedInSlugGuesses('Al-Marketer', 'https://www.al-marketer.com').includes('almarketersa'), 'the real slug is among the guesses');
  const fake = async (url) => {
    if (url.includes('tiktok.com/oembed') && url.includes('%40almarketerksa')) return new Response('{}', { status: 200 });
    if (url.includes('tiktok.com/oembed')) return new Response('{"code":400}', { status: 400 });
    if (url.includes('tiktok.com/embed/@almarketerksa')) return new Response(script('__FRONTITY_CONNECT_STATE__', { source: { data: { '/embed/@almarketerksa': { userInfo: { nickname: 'Al-Marketer', followerCount: 20, signature: 'https://www.al-marketer.com' }, videoList: [] } } } }));
    return new Response('not found', { status: 404 });
  };
  const found = await discoverProfiles({ names: ['Al-Marketer'], website: 'https://www.al-marketer.com', handles: ['almarketerksa'] }, ['tiktok', 'snapchat'], { fetchImpl: fake, paceMs: 0 });
  assert.equal(found.length, 1);
  assert.equal(found[0].url, 'https://www.tiktok.com/@almarketerksa');
  assert.equal(found[0].level, 'confirmed', 'the TikTok bio links the website');
});
