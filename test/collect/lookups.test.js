// Automated outside checks (Meta Ad Library, Brave Search, Google Maps, Google Ads Transparency, Facebook replies).
// The parsers must never turn "could not read" into "no", and never accept a listing or advertiser matched by name only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-lookups-'));
process.env.ALM_CLIENTS_DIR = root;
after(() => rmSync(root, { recursive: true, force: true }));

const L = await import('../../collect/lookups.js');
const { clientPaths, upsertCheck, loadChecks } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');

const script = (obj) => `<script type="application/json" data-sjs>${JSON.stringify(obj)}</script>`;

test('Meta: the page id comes from the page plugin; the ads count from the embedded results', () => {
  const plugin = '<div><a class="_1drp _5lv6" title="Technopanel - تكنوبانل" href="https://www.facebook.com/2033228233590083?ref=embed_page">x</a></div><script>{"pageID":"2033228233590083"}</script>';
  assert.deepEqual(L.parsePluginPageId(plugin), { pageId: '2033228233590083', pageName: 'Technopanel - تكنوبانل' });
  assert.equal(L.parsePluginPageId('<html>nothing</html>').pageId, null);

  const html = script({ require: [[{ __bbox: { result: { data: { ad_library_main: { search_results_connection: { count: 29, edges: [{ node: { collated_results: [{ ad_archive_id: '1', page_id: '190297627669223', start_date: 1786924800, publisher_platform: ['INSTAGRAM', 'FACEBOOK'], snapshot: { page_name: 'Jarir', link_url: 'https://www.jarir.com/' } }] } }] } } } } } }]] });
  const r = L.parseMetaAdLibrary(html, '~29 results');
  assert.equal(r.status, 'ok');
  assert.equal(r.count, 29);
  assert.equal(r.ads[0].platforms.length, 2);
  const present = L.metaAdsCheck(r, { pageName: 'Jarir', pageId: '190297627669223', country: 'SA' });
  assert.equal(present.result, 'present');
  assert.match(present.question, /shown in SA/);
  assert.match(present.detail, /29 active ad\(s\) for "Jarir" \(Meta shows ~29\), started 2026-/);

  assert.equal(L.metaAdsCheck(L.parseMetaAdLibrary('', 'No ads match your search'), { pageName: 'Technopanel', pageId: '1', country: 'SA' }).result, 'absent');
  assert.equal(L.metaAdsCheck(L.parseMetaAdLibrary('', 'You must log in to continue.'), { pageId: '1' }).result, 'blocked');
  assert.equal(L.metaAdsCheck(L.parseMetaAdLibrary('', 'Something else entirely'), { pageId: '1' }).result, 'unknown', 'an unreadable page is unknown, never "no ads"');
});

test('Brave: ranks of the website and profiles; results that never mention the brand are unreliable, not "absent"', () => {
  const results = [
    { url: 'https://www.facebook.com/technopanel', title: 'Technopanel - تكنوبانل | Facebook' },
    { url: 'https://www.instagram.com/technopanel/', title: 'Technopanel (@technopanel)' },
    { url: 'https://technopanel.com.sa/ar/', title: 'تكنوبانل كلادينج' },
    { url: 'https://technopanel.com.sa/ar/', title: 'duplicate' },
  ];
  const r = L.rankSearchResults(results, { query: 'Technopanel', domain: 'technopanel.com.sa', socials: ['https://www.facebook.com/technopanel', 'https://instagram.com/technopanel'] });
  assert.equal(r.status, 'ok');
  assert.equal(r.domainRank, 3);
  assert.deepEqual(r.socialRanks.map((s) => s.rank), [1, 2]);
  assert.equal(r.results.length, 3, 'duplicates are dropped');

  const junk = L.rankSearchResults([{ url: 'https://www.zhihu.com/question/1', title: '如何评价' }, { url: 'https://velo-club.net/', title: 'Velo club' }], { query: 'تكنوبانل', domain: 'technopanel.com.sa' });
  assert.equal(junk.status, 'unreliable');
  const arabic = L.rankSearchResults([{ url: 'https://x.com/a', title: 'تكنوبانل للكلادينج' }], { query: 'تكنوبانل', domain: 'technopanel.com.sa' });
  assert.equal(arabic.status, 'ok');

  const check = L.braveCheck([{ query: 'Technopanel', ...r }], { domain: 'technopanel.com.sa' });
  assert.equal(check.result, 'present');
  assert.equal(check.value, '#3');
  assert.match(check.question, /^Brave Search/);
  assert.match(check.detail, /not Google's/);
  assert.equal(L.braveCheck([{ query: 'x', ...junk }], { domain: 'technopanel.com.sa' }).result, 'unknown');
  assert.equal(L.braveCheck([{ query: 'Al Marketer', status: 'ok', domainRank: null, socialRanks: [], results: [{ host: 'almarketer.net' }] }], { domain: 'al-marketer.com' }).result, 'absent');
});

test('Maps: only a listing linked to the client\'s website counts; one other listing needs confirmation', () => {
  const mine = { name: 'TECHNOPANEL Cladding', rating: 4.1, reviews: 92, category: 'Manufacturer', address: 'Al Mashael, Riyadh', website: 'https://technopanel.com.sa/', hours: ['Sunday, 8 AM to 4 PM'], claimPrompt: false, ownerResponsesVisible: 0 };
  const yes = L.mapsChecks({ status: 'ok', listings: [{ name: 'Other', website: 'https://other.sa' }, mine] }, { domain: 'technopanel.com.sa', query: 'Technopanel' });
  assert.equal(yes[0].result, 'present');
  assert.equal(yes[1].value, '4.1★ from 92 reviews');
  assert.match(yes[1].detail, /no owner responses visible/);
  assert.equal(L.pickMapsListing([{ name: 'Branch', website: 'https://www.shop.technopanel.com.sa/x' }], 'technopanel.com.sa').answer, 'yes', 'a subdomain of the website counts');

  const yemen = L.mapsChecks({ status: 'ok', listings: [{ name: 'ماركيتير لك للتسويق الالكتروني', website: 'https://marketerlek.com' }] }, { domain: 'al-marketer.com', query: 'الماركتير' });
  assert.equal(yemen[0].result, 'unknown', 'a single listing that is not linked to the website is not the client');
  assert.match(yemen[0].detail, /does not link to al-marketer\.com/);
  const none = L.mapsChecks({ status: 'ok', listings: [{ name: 'A' }, { name: 'B' }] }, { domain: 'al-marketer.com', query: 'Al Marketer' });
  assert.equal(none[0].result, 'absent');
  assert.match(none[0].detail, /none of the 2 listing\(s\) opened/);
  assert.equal(L.mapsChecks({ status: 'blocked', listings: [] }, { domain: 'a.com', query: 'a' })[0].result, 'blocked');
});

test('Google Ads Transparency: the visible count, advertisers from the page\'s own data, "No ads found" is absent', () => {
  const body = JSON.stringify({ 1: [{ 1: 'AR1', 12: 'ALMARAI COMPANY', 7: { 1: '1789430400' } }, { 1: 'AR1', 12: 'ALMARAI COMPANY', 7: { 1: '1789000000' } }] });
  const any = L.parseGatc('Almarai\n~600 ads\nFilters', body);
  assert.equal(any.shown, '~600');
  assert.deepEqual(any.advertisers, [{ id: 'AR1', name: 'ALMARAI COMPANY' }]);
  const c = L.gatcCheck(any, L.parseGatc('~500 ads'), { domain: 'almarai.com', region: 'SA' });
  assert.equal(c.result, 'present');
  assert.match(c.detail, /~600 ads any time, ~500 in the last 30 days; advertisers: ALMARAI COMPANY; last shown 2026-/);
  assert.equal(L.gatcCheck(L.parseGatc('No ads found'), null, { domain: 'technopanel.com.sa', region: 'SA' }).result, 'absent');
  assert.equal(L.gatcCheck(L.parseGatc('Loading…'), null, { domain: 'x.com' }).result, 'unknown');
  assert.equal(L.parseGatc('~20K ads').shown, '~20K');
});

test('Facebook replies: answered only when the page\'s reply is visible; no reply only when Facebook says 0', () => {
  const comment = (author, text, total, replies = []) => ({ __typename: 'Comment', depth: 0, created_time: 1789430400, author: { name: author }, body: { text }, feedback: { replies_fields: { total_count: total }, replies_connection: { edges: replies.map((a) => ({ node: { author: { name: a } } })) } } });
  const html = script({ data: { comments: [comment('Fahim', 'If I purchase with Tamara?', 1, ['Jarir Bookstore مكتبة جرير']), comment('Sara', 'متى تبدا العروض؟', 0), comment('Omar', 'Great', 3, ['Ali']), comment('Jarir Bookstore مكتبة جرير', 'Thanks all', 0)] } });
  const rows = L.classifyComments(L.commentsFromPostHtml(html), 'Jarir Bookstore مكتبة جرير');
  assert.deepEqual(rows.map((r) => r.status), ['answered_by_page', 'no_reply', 'replies_by_others_or_hidden'], 'the page\'s own comment is not counted');
  assert.equal(rows[1].question, true);
  const c = L.repliesCheck([{ url: 'u', rows }], { pageName: 'Jarir' });
  assert.equal(c.value, '1 of 3 answered by the page');
  assert.match(c.detail, /1 with no reply \(1 looks like a question, e\.g\. "متى تبدا العروض؟"\)/);
  assert.match(c.detail, /most relevant/);
  assert.equal(L.repliesCheck([{ rows: [] }], { pageName: 'T' }).value, 'no visible comments');
  assert.equal(L.repliesCheck(null, {}).result, 'unknown');
});

test('opening hours are grouped by day from Sunday; a broken address in the results does not stop the ranking', () => {
  const week = ['Tuesday, 8 AM to 4 PM', 'Wednesday, 8 AM to 4 PM', 'Thursday, 8 AM to 4 PM', 'Friday, Closed', 'Saturday, Closed', 'Sunday, 8 AM to 4 PM', 'Monday, 8 AM to 4 PM'];
  assert.equal(L.compactHours(week), 'Sun–Thu 8 AM to 4 PM; Fri–Sat Closed');
  assert.equal(L.compactHours(['Sunday, Open 24 hours']), 'Sun Open 24 hours', 'an incomplete week is listed as shown');
  assert.equal(L.rankSearchResults([{ url: 'https://a.com/%E0%A4%A', title: 'Brand A' }], { query: 'Brand', domain: 'a.com' }).domainRank, 1);
});

test('countryOf reads the market in English or Arabic', () => {
  assert.equal(L.countryOf('Saudi Arabia'), 'SA');
  assert.equal(L.countryOf('السعودية'), 'SA');
  assert.equal(L.countryOf('Egypt'), 'EG');
  assert.equal(L.countryOf('UAE'), null);
});

test('the step without a website or Facebook page: no browser, the team gets Maps and Google as optional checks, answered ones are kept', async () => {
  createClient({ slug: 'nosite', name: 'Hayaa', market: 'Egypt' });
  const p = clientPaths('nosite');
  upsertCheck(p, { key: 'manual_social_activity', question: 'Social activity', result: 'unknown', manual: true, by: 'you' });
  upsertCheck(p, { key: 'manual_meta_ad_library', question: 'Meta', result: 'present', value: 'yes, 3 ads', manual: true, by: 'you' });
  const browser = { newContext: () => assert.fail('no page should be opened') };
  const out = await L.runLookupsStep(p, { name: 'Hayaa', market: 'Egypt' }, { browser, gap: 0 });
  const byKey = Object.fromEntries(loadChecks(p).map((c) => [c.key, c]));
  assert.equal(byKey.manual_social_activity, undefined, 'the social cadence checks replace this one');
  assert.equal(byKey.manual_meta_ad_library.value, 'yes, 3 ads', 'the team\'s answer is kept');
  assert.equal(byKey.ads_meta_active.result, 'unknown');
  assert.equal(byKey.manual_google_maps.manual, true);
  assert.equal(byKey.manual_google_brand_search.manual, true);
  assert.deepEqual(out.manualFallbacks.sort(), ['manual_google_brand_search', 'manual_google_maps', 'manual_meta_ad_library']);
});
