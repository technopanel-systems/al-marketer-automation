// Google search results (brand name and buyer searches). The page is read in a temporary browser session or through
// SerpApi; these tests protect the reading rules: the client is recognised by its own domain, a profile only when the
// name matches, "not on the first page" is never "not on Google", and a blocked search is never a "no".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-google-'));
process.env.ALM_CLIENTS_DIR = root;
after(() => rmSync(root, { recursive: true, force: true }));

const G = await import('../../collect/google.js');
const { clientPaths, loadChecks, upsertCheck, save, loadSources } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');

// The first page for "Technopanel" in Saudi Arabia, as read on 2026-09-15.
const brandPage = {
  query: 'Technopanel',
  status: 'ok',
  route: 'browser',
  organic: [
    { title: 'Technopanel – تكنوبانل', site: 'Technopanel Cladding - تكنوبانل كلادينج', cite: 'https://technopanel.com.sa › ...' },
    { title: 'Technopanel - تكنوبانل', site: 'LinkedIn · Technopanel - تكنوبانل', cite: '2.1K+ followers' },
    { title: 'Technopanel - تكنوبانل | Riyadh', site: 'Facebook · Technopanel - تكنوبانل', cite: '1.7K+ followers' },
    { title: 'Technopanel JSC', site: 'Технопанел ЕАД', cite: 'https://www.technopanel.com › home › .html' },
    { title: 'Technopanel - تكنوبانل (@technopanelco)', site: 'Instagram · technopanelco', cite: '650+ followers' },
    { title: 'Technopanel | Saudi building materials company in Syria', site: 'Rebuilding Syria Platform', cite: 'https://www.rebuilding-syria.com › Companies' },
    { title: 'Aluminium composite panels', site: 'YouTube · Some channel', cite: 'YouTube · 2 years ago' },
  ],
  ads: [
    { site: 'saritco.com', cite: 'https://www.saritco.com › cladding', title: 'Saudi cladding supplier' },
    { site: 'jzmfacade.com', cite: 'https://www.jzmfacade.com', title: 'ACP panels factory' },
  ],
  localPack: 'Places Technopanel Cladding - تكنوبانل كلادينج 4.1 (92) Manufacturer',
  paa: [],
  related: ['Technopanel Saudi Arabia', 'Saudi Bond cladding catalogue PDF', 'Aluminum Cladding Saudi Arabia', 'Alucopanel price', 'Aluminum Cladding supplier in Saudi Arabia'],
};
const opts = { domain: 'technopanel.com.sa', platforms: ['linkedin', 'facebook', 'instagram'], names: ['Technopanel'] };

test('the client is found by its own domain; profiles only on its platforms with its name; other pages with the name are listed', () => {
  assert.equal(G.hostFromCite('https://technopanel.com.sa › ...'), 'technopanel.com.sa');
  assert.equal(G.hostFromCite('www.jarir.com › sa-en'), 'jarir.com');
  assert.equal(G.hostFromCite('2.1K+ followers'), '');

  const r = G.readGoogleRun(brandPage, opts);
  assert.equal(r.domainRank, 1);
  assert.deepEqual(r.profiles, [{ platform: 'linkedin', rank: 2 }, { platform: 'facebook', rank: 3 }, { platform: 'instagram', rank: 5 }]);
  assert.deepEqual(r.sameName.map((x) => [x.host, x.rank]), [['technopanel.com', 4], ['rebuilding-syria.com', 6]], 'a different company with the same name is not the client');
  assert.ok(!r.profiles.some((x) => x.platform === 'youtube'), 'a YouTube result without the brand name is not the client');
  assert.equal(r.ads.length, 2);
  assert.ok(r.ads.every((a) => !a.own));
  assert.deepEqual(r.localPack, { shown: true, hasClient: true });
  assert.ok(G.mentionsBrand('مصنع تكنوبانل', G.brandTokens(['تكنوبانل'])));
  assert.ok(!G.mentionsBrand('Fashion week Cairo', G.brandTokens(['Hayaa Fashion'])), 'a generic word alone is not the brand');
});

test('brand and ads checks: the rank, the profiles, other advertisers; a blocked search is "blocked", never "absent"', () => {
  const read = G.readGoogleRun(brandPage, opts);
  const brand = G.googleBrandCheck([read], { domain: opts.domain });
  assert.equal(brand.key, 'search_brand_google');
  assert.equal(brand.result, 'present');
  assert.equal(brand.value, '#1');
  assert.match(brand.detail, /website #1; LinkedIn #2, Facebook #3, Instagram #5/);
  assert.match(brand.detail, /other pages with the name: technopanel\.com #4/);
  assert.match(brand.detail, /first page only/);

  const ads = G.googleBrandAdsCheck([read], { domain: opts.domain });
  assert.equal(ads.result, 'present');
  assert.equal(ads.value, '2 ad(s), 2 not from technopanel.com.sa');
  assert.match(ads.detail, /saritco\.com, jzmfacade\.com/);
  assert.equal(G.googleBrandAdsCheck([{ ...read, ads: [] }], { domain: opts.domain }).result, 'absent');

  const blocked = G.googleBrandCheck([{ query: 'Technopanel', status: 'blocked', route: 'browser' }], { domain: opts.domain });
  assert.equal(blocked.result, 'blocked');
  assert.match(blocked.detail, /SerpApi/);
  assert.equal(G.googleBrandCheck([{ query: 'x', status: 'unavailable' }], { domain: opts.domain }).result, 'unknown');

  const missing = G.readGoogleRun({ ...brandPage, organic: brandPage.organic.slice(3) }, opts);
  const absent = G.googleBrandCheck([missing], { domain: opts.domain });
  assert.equal(absent.result, 'absent');
  assert.match(absent.detail, /website not on the first page/);
  assert.doesNotMatch(absent.detail, /not on Google/);
});

test('buyer searches: where the client is, who is first, who advertises, the map; terms never name the client or a rival', () => {
  const page = G.readGoogleRun({ query: 'كلادينج الرياض', status: 'ok', route: 'serpapi', organic: [{ title: 'مصانع الكلادينج', site: 'techno-bond.com', cite: 'https://www.techno-bond.com' }, { title: 'Cladding', site: 'caricazksa.com', cite: 'https://www.caricazksa.com' }], ads: [{ site: 'api.whatsapp.com', cite: 'https://api.whatsapp.com › كلادينج', title: 'خصم 50%' }], localPack: 'Places techno bond' }, opts);
  const c = G.googleTermCheck(page, { domain: opts.domain, index: 1 });
  assert.equal(c.key, 'search_term_google_1');
  assert.equal(c.result, 'absent');
  assert.match(c.detail, /first results: techno-bond\.com, caricazksa\.com; 1 ad\(s\) from api\.whatsapp\.com; a map with places is shown, without the client/);
  assert.match(c.detail, /through SerpApi/);

  const competitorNames = ['Alucopanel Saudi Arabia', 'Saudi Bond'];
  assert.deepEqual(G.pickSearchTerms({ aiTerms: ['كلادينج الرياض', 'Technopanel cladding', 'كلادينج الرياض '], related: brandPage.related, names: ['Technopanel'], competitorNames }), ['كلادينج الرياض'], 'the research terms come first, without the brand and without repeats');
  assert.deepEqual(G.pickSearchTerms({ aiTerms: [], related: brandPage.related, names: ['Technopanel'], competitorNames }), ['Aluminum Cladding Saudi Arabia', 'Aluminum Cladding supplier in Saudi Arabia'], 'related searches skip the client, a rival, a PDF catalogue');
});

test('SerpApi answers map to the same shape; a used-up or refused key is an error, not an empty page', async () => {
  const json = { organic_results: [{ position: 1, title: 'Technopanel', link: 'https://technopanel.com.sa/', source: 'Technopanel' }], ads: [{ title: 'Ad', link: 'https://www.saritco.com/', displayed_link: 'saritco.com' }], local_results: { places: [{ title: 'Technopanel Cladding' }] }, related_questions: [{ question: 'What is ACP?' }], related_searches: [{ query: 'acp sheet price' }] };
  const fake = (status, body) => async (url) => {
    assert.match(String(url), /engine=google/);
    return { status, ok: status === 200, json: async () => body };
  };
  const r = await G.serpApiSearch('Technopanel', { key: 'k', hl: 'en', gl: 'SA', fetchImpl: fake(200, json) });
  assert.equal(r.route, 'serpapi');
  assert.equal(G.readGoogleRun({ ...r, query: 'Technopanel' }, opts).domainRank, 1);
  assert.match(r.text, /1\. Technopanel — https:\/\/technopanel\.com\.sa\//);
  await assert.rejects(G.serpApiSearch('x', { key: 'k', hl: 'en', fetchImpl: fake(429, { error: 'limit' }) }), /used up/);
  await assert.rejects(G.serpApiSearch('x', { key: 'k', hl: 'en', fetchImpl: fake(401, { error: 'Invalid API key' }) }), /did not accept/);
});

test('the step: when the browser cannot run, SerpApi answers; checks cite saved evidence and replace the manual Google check', async () => {
  createClient({ slug: 'tp', name: 'Technopanel', website: 'https://technopanel.com.sa', market: 'Saudi Arabia' });
  const p = clientPaths('tp');
  save(p.competitorsAi, { proposals: [], searchTerms: ['كلادينج الرياض'] });
  upsertCheck(p, { key: 'manual_google_brand_search', question: 'Google: does the brand appear on page 1?', by: 'you', result: 'unknown', manual: true });
  const seen = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q');
    seen.push(q);
    const body = q === 'Technopanel' ? { organic_results: [{ title: 'Technopanel', link: 'https://technopanel.com.sa/' }], ads: [] } : { organic_results: [{ title: 'Cladding', link: 'https://techno-bond.com/' }], ads: [{ title: 'Ad', link: 'https://saritco.com/' }] };
    return { status: 200, ok: true, json: async () => body };
  };
  const out = await G.runGoogleStep(p, { name: 'Technopanel', displayName: 'Technopanel', website: 'technopanel.com.sa', market: 'Saudi Arabia' }, { env: { SERPAPI_KEY: 'k' }, fetchImpl, launch: async () => { throw new Error("Chromium distribution 'msedge' is not found"); }, gap: 0 });
  assert.deepEqual(seen, ['Technopanel', 'كلادينج الرياض']);
  assert.deepEqual(out.terms, ['كلادينج الرياض']);
  assert.equal(out.termsFrom, 'competitor research');
  const checks = Object.fromEntries(loadChecks(p).map((c) => [c.key, c]));
  assert.equal(checks.search_brand_google.result, 'present');
  assert.equal(checks.ads_google_brand_search.result, 'absent');
  assert.equal(checks.search_term_google_1.result, 'absent');
  assert.match(checks.search_term_google_1.detail, /1 ad\(s\) from saritco\.com/);
  const sources = new Map(loadSources(p).map((s) => [s.id, s]));
  assert.equal(sources.get(checks.search_brand_google.sourceId)?.kind, 'lookup', 'the check cites the saved results page');
  assert.ok(!checks.manual_google_brand_search, 'the manual Google check is no longer needed');

  // Without any route the searches are "could not read", and nothing is invented.
  createClient({ slug: 'tp2', name: 'Other', website: 'https://other.example', market: 'Egypt' });
  const p2 = clientPaths('tp2');
  const none = await G.runGoogleStep(p2, { name: 'Other', website: 'other.example', market: 'Egypt' }, { env: {}, launch: async () => { throw new Error('no Edge'); }, gap: 0 });
  assert.equal(none.checks.find((c) => c.key === 'search_brand_google').result, 'unknown');
});
