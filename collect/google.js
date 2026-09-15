// Google search results, without any account or saved browser profile:
// 1. the Edge browser that ships with Windows, in a temporary in-memory session (like a private window, thrown away at
//    the end): Google's home page first, then each search; a blocked search waits and tries once more, a second
//    block stops the browser for the rest of the run (no hammering, no CAPTCHA solving);
// 2. SerpApi, only if its free key is saved on the Settings & keys page, for the searches the browser could not read.
// What is searched: the brand's names, and up to 3 searches a buyer might type (proposed by the competitor research,
// or Google's own "people also search for" when there are none). Only the first page is read, so a missing result is
// "not on the first page", never "not on Google". Parsers are pure functions; the browser part only fetches pages.
import { join, relative } from 'node:path';
import { mkdirSync } from 'node:fs';
import { save, load, upsertCheck, addTextSource, removeChecks } from '../pipeline/client.js';
import { cleanWebsite } from '../engine/util/url.js';
import { brandProfiles, loadCompetitors } from '../pipeline/social.js';
import { hostOf, countryOf } from './lookups.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sameSite = (host, domain) => Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
const letters = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const arabic = (s) => /[؀-ۿ]/.test(s);

const PLATFORMS = [
  ['linkedin', /^linkedin\b/i, /(^|\.)linkedin\.com$/],
  ['facebook', /^facebook\b/i, /(^|\.)facebook\.com$/],
  ['instagram', /^instagram\b/i, /(^|\.)instagram\.com$/],
  ['tiktok', /^tiktok\b/i, /(^|\.)tiktok\.com$/],
  ['x', /^(x|twitter)\b/i, /(^|\.)(x|twitter)\.com$/],
  ['youtube', /^youtube\b/i, /(^|\.)youtube\.com$/],
  ['snapchat', /^snapchat\b/i, /(^|\.)snapchat\.com$/],
];
const PLATFORM_LABEL = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', youtube: 'YouTube', snapchat: 'Snapchat' };
// Words too common to identify a brand by themselves.
const GENERIC = new Set(['company', 'group', 'store', 'shop', 'online', 'fashion', 'factory', 'restaurant', 'trading', 'international', 'saudi', 'arabia', 'egypt', 'official', 'the', 'and', 'شركه', 'مصنع', 'مجموعه', 'متجر', 'مطعم', 'للتجاره', 'السعوديه', 'مصر']);

export const googleSearchUrl = (query, { hl = 'en', gl = '' } = {}) => `https://www.google.com/search?${new URLSearchParams({ q: query, hl, ...(gl ? { gl: gl.toLowerCase() } : {}) })}`;

// "https://technopanel.com.sa › ..." → technopanel.com.sa
export function hostFromCite(cite = '') {
  const first = String(cite).split('›')[0].trim();
  if (!first || /\s/.test(first)) return '';
  return hostOf(/^https?:\/\//i.test(first) ? first : `https://${first}`);
}

export function brandTokens(names = []) {
  const glued = names.map((n) => letters(n).replace(/[^\p{L}\p{N}]+/gu, '')).filter((g) => g.length >= 4);
  const words = names.flatMap((n) => letters(n).split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 4 && !GENERIC.has(w));
  return { glued: [...new Set(glued)], words: [...new Set(words)] };
}
export function mentionsBrand(text, tokens) {
  const t = letters(text);
  const flat = t.replace(/[^\p{L}\p{N}]+/gu, '');
  return tokens.glued.some((g) => flat.includes(g)) || tokens.words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w}([^\\p{L}\\p{N}]|$)`, 'u').test(t));
}

// One results page (from the browser or SerpApi) → ranked results about the client.
export function readGoogleRun(run, { domain = '', platforms = [], names = [] } = {}) {
  const tokens = brandTokens(names);
  const organic = (run.organic || []).slice(0, 10).map((r, i) => {
    const host = hostFromCite(r.cite) || hostOf(r.href || '');
    const platform = (PLATFORMS.find(([, site, h]) => site.test(r.site || '') || h.test(host)) || [])[0] || null;
    return { rank: i + 1, title: r.title || '', site: r.site || '', host, platform };
  });
  const mentions = (r) => mentionsBrand(`${r.title} ${r.site} ${r.host}`, tokens);
  const own = organic.find((r) => sameSite(r.host, domain));
  const profiles = organic.filter((r) => r.platform && platforms.includes(r.platform) && mentions(r)).map((r) => ({ platform: r.platform, rank: r.rank }));
  const sameName = organic.filter((r) => !sameSite(r.host, domain) && !r.platform && mentions(r)).map((r) => ({ rank: r.rank, host: r.host || r.site, title: r.title }));
  const ads = (run.ads || []).map((a) => {
    const host = hostFromCite(a.cite) || hostFromCite(a.site) || '';
    return { host: host || a.site || '', title: a.title || '', own: sameSite(host, domain) };
  });
  const seenAds = new Set();
  return {
    query: run.query,
    status: run.status,
    route: run.route,
    organic,
    domainRank: own?.rank ?? null,
    profiles,
    sameName,
    ads: ads.filter((a) => !seenAds.has(`${a.host}|${a.title}`) && seenAds.add(`${a.host}|${a.title}`)),
    localPack: run.localPack ? { shown: true, hasClient: mentionsBrand(run.localPack, tokens) || Boolean(domain && letters(run.localPack).includes(domain)) } : { shown: false, hasClient: false },
    questions: (run.paa || []).slice(0, 6),
    related: (run.related || []).slice(0, 8),
    aiOverview: Boolean(run.aiOverview),
  };
}

const ROUTE_NOTE = { browser: "Google's results, read in a temporary browser session without an account", serpapi: "Google's results, through SerpApi" };
const place = (r) => `${r.domainRank ? `website #${r.domainRank}` : 'website not on the first page'}${r.profiles.length ? `; ${r.profiles.map((x) => `${PLATFORM_LABEL[x.platform]} #${x.rank}`).join(', ')}` : ''}`;
const advertisers = (ads) => [...new Set(ads.map((a) => (a.own ? `${a.host} (the client)` : a.host)).filter(Boolean))].slice(0, 5).join(', ');
const notRead = (runs, what) => {
  const blocked = runs.some((r) => r.status === 'blocked');
  return { result: blocked ? 'blocked' : 'unknown', detail: blocked ? `Google asked to verify the visitor, so ${what} could not be read (add a free SerpApi key on Settings & keys for a second route)` : `${what} could not be read` };
};

export function googleBrandCheck(runs, { domain }) {
  const question = `Google: does ${domain} appear on the first page when searching the brand's name?`;
  const ok = runs.filter((r) => r.status === 'ok');
  if (!ok.length) return { key: 'search_brand_google', question, ...notRead(runs, 'the brand search') };
  const found = ok.filter((r) => r.domainRank);
  const describe = (r) => `"${r.query}": ${place(r)}${r.sameName.length ? `; other pages with the name: ${r.sameName.slice(0, 4).map((x) => `${x.host} #${x.rank}`).join(', ')}` : ''}`;
  return {
    key: 'search_brand_google',
    question,
    result: found.length ? 'present' : 'absent',
    value: found.length ? `#${Math.min(...found.map((r) => r.domainRank))}` : '',
    detail: `${ok.map(describe).join(' · ')} (${ROUTE_NOTE[ok[0].route] || "Google's results"}; first page only)`,
  };
}

export function googleBrandAdsCheck(runs, { domain }) {
  const question = "Google: are ads shown when people search the brand's name?";
  const ok = runs.filter((r) => r.status === 'ok');
  if (!ok.length) return { key: 'ads_google_brand_search', question, ...notRead(runs, 'the brand search') };
  const total = ok.reduce((n, r) => n + r.ads.length, 0);
  const others = ok.flatMap((r) => r.ads.filter((a) => !a.own));
  return {
    key: 'ads_google_brand_search',
    question,
    result: total ? 'present' : 'absent',
    value: total ? `${total} ad(s)${others.length ? `, ${others.length} not from ${domain}` : `, all from ${domain}`}` : '',
    detail: `${ok.map((r) => `"${r.query}": ${r.ads.length ? `${r.ads.length} ad(s) from ${advertisers(r.ads)}` : 'no ads'}`).join(' · ')} (ads shown at the time of the check, in Google's results for this country)`,
  };
}

export function googleTermCheck(run, { domain, index }) {
  const question = `Google: searching «${run.query}» (a search a buyer might use) — is ${domain} on the first page?`;
  const key = `search_term_google_${index}`;
  if (run.status !== 'ok') return { key, question, ...notRead([run], 'this search') };
  const inIt = run.domainRank || run.profiles.length;
  const parts = [
    place(run),
    `first results: ${run.organic.slice(0, 5).map((r) => (r.platform ? PLATFORM_LABEL[r.platform] : r.host || r.site)).filter(Boolean).join(', ') || 'none'}`,
    run.ads.length ? `${run.ads.length} ad(s) from ${advertisers(run.ads)}` : 'no ads',
    run.localPack.shown ? `a map with places is shown${run.localPack.hasClient ? ' and the client is in it' : ', without the client'}` : '',
  ].filter(Boolean);
  return { key, question, result: inIt ? 'present' : 'absent', value: run.domainRank ? `#${run.domainRank}` : run.profiles.length ? `${PLATFORM_LABEL[run.profiles[0].platform]} #${run.profiles[0].rank}` : '', detail: `${parts.join('; ')} (${ROUTE_NOTE[run.route] || "Google's results"}; first page only)` };
}

// The buyer searches to run: the competitor research's terms first; Google's related searches only when there are none,
// and then never one about the client, a competitor, a document, a login or a job.
const NOT_BUYER = /\b(pdf|catalog(ue)?|login|sign in|jobs?|careers?|wikipedia|linkedin|facebook|instagram|tiktok|youtube)\b|وظائف|تسجيل الدخول/i;
export function pickSearchTerms({ aiTerms = [], related = [], names = [], competitorNames = [], max = 3 }) {
  const tokens = brandTokens(names);
  const rivals = brandTokens(competitorNames);
  const seen = new Set();
  const usable = (list, strict) => list.map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 3 && t.length <= 80 && !mentionsBrand(t, tokens) && !(strict && (NOT_BUYER.test(t) || mentionsBrand(t, rivals))) && !seen.has(letters(t)) && seen.add(letters(t)));
  const fromAi = usable(aiTerms, false).slice(0, max);
  return fromAi.length ? fromAi : usable(related, true).slice(0, Math.min(2, max));
}

// ---------- SerpApi ----------

export function mapSerpApi(json = {}) {
  return {
    organic: (json.organic_results || []).map((r) => ({ title: r.title || '', site: r.source || '', cite: r.link || r.displayed_link || '', href: r.link || '' })),
    ads: (json.ads || []).map((a) => ({ title: a.title || '', site: a.source || a.displayed_link || '', cite: a.link || a.displayed_link || '' })),
    localPack: (json.local_results?.places || []).map((x) => [x.title, x.website || x.links?.website].filter(Boolean).join(' ')).join(' · '),
    paa: (json.related_questions || []).map((q) => q.question).filter(Boolean),
    related: (json.related_searches || []).map((s) => s.query).filter(Boolean),
    aiOverview: Boolean(json.ai_overview),
  };
}

export async function serpApiSearch(query, { key, hl, gl, fetchImpl = fetch }) {
  const url = `https://serpapi.com/search.json?${new URLSearchParams({ engine: 'google', q: query, hl, ...(gl ? { gl: gl.toLowerCase() } : {}), num: '10', api_key: key })}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('SerpApi did not accept the key');
  if (res.status === 429) throw new Error('the SerpApi searches for this month are used up');
  if (!res.ok || body.error) throw new Error(`SerpApi answered: ${String(body.error || res.status).slice(0, 120)}`);
  const mapped = mapSerpApi(body);
  const text = [`Google results for "${query}" (through SerpApi)`, ...mapped.ads.map((a) => `Ad: ${a.title} — ${a.cite}`), ...mapped.organic.map((r, i) => `${i + 1}. ${r.title} — ${r.cite}`), mapped.localPack ? `Places: ${mapped.localPack}` : '', ...mapped.paa.map((q) => `People also ask: ${q}`), ...mapped.related.map((q) => `Related search: ${q}`)].filter(Boolean).join('\n');
  return { ...mapped, status: 'ok', route: 'serpapi', text };
}

// ---------- the browser ----------

// Runs in the page.
function readSerp() {
  const txt = (e) => (e?.innerText || '').replace(/\s+/g, ' ').trim();
  const lines = (e) => (e?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const sorry = /\/sorry\//.test(location.href) || Boolean(document.querySelector('form#captcha-form'));
  const organic = [];
  for (const h of document.querySelectorAll('#rso a h3')) {
    const a = h.closest('a');
    if (!a || a.closest('[data-text-ad]')) continue;
    const title = txt(h);
    const l = lines(a);
    const href = a.getAttribute('href') || '';
    organic.push({ title, site: txt(a.querySelector('.VuuXrf')) || l.find((x) => x !== title && !/^https?:\/\//.test(x)) || '', cite: txt(a.querySelector('cite')) || l.find((x) => /^https?:\/\//.test(x)) || '', href: /^https?:\/\//.test(href) ? href : '' });
  }
  const ads = [...document.querySelectorAll('[data-text-ad]')].map((d) => {
    const l = lines(d);
    return { site: l[0] || '', cite: l.find((x) => /^https?:\/\//.test(x)) || '', title: txt(d.querySelector('[role="heading"]')) || l[2] || '' };
  });
  const headings = [...document.querySelectorAll('[role="heading"], h2')];
  const local = headings.find((h) => /^(Places|Local results|Businesses|الأماكن|أماكن|النشاطات التجارية)$/i.test(txt(h)));
  const localBox = local ? local.closest('[data-hveid]') || local.parentElement?.parentElement : null;
  return {
    sorry,
    organic,
    ads,
    localPack: localBox ? txt(localBox).slice(0, 1000) : '',
    paa: [...new Set([...document.querySelectorAll('[data-q]')].map((e) => e.getAttribute('data-q')).filter(Boolean))].slice(0, 8),
    related: [...new Set([...document.querySelectorAll('#botstuff a[href*="/search?"], #bres a[href*="/search?"]')].map(txt).filter((t) => t && !/^\d+$/.test(t) && t.length < 90))].slice(0, 10),
    aiOverview: headings.some((h) => /AI Overview|نظرة عامة/i.test(txt(h))),
    text: (document.body?.innerText || '').slice(0, 12000),
  };
}

async function launchEdge() {
  const { chromium } = await import('playwright');
  // The installed Edge, not Playwright's own Chromium: Google refuses the latter at once. No profile is saved.
  return chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'] });
}

export async function browserSearches(searches, { shotsDir, log = () => {}, launch = launchEdge, gap = 3000 }) {
  let browser;
  try {
    browser = await launch();
  } catch (e) {
    log(`Google in the browser is not available: ${String(e.message || e).split('\n')[0]}`);
    return searches.map((s) => ({ ...s, status: 'unavailable', route: 'browser' }));
  }
  const out = [];
  try {
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('https://www.google.com/?hl=en', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await pause(2000 + Math.random() * 1000);
    let stopped = false;
    for (const [i, s] of searches.entries()) {
      if (stopped) {
        out.push({ ...s, status: 'blocked', route: 'browser' });
        continue;
      }
      const url = googleSearchUrl(s.query, s);
      let raw = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
        await page.waitForSelector('#rso, form#captcha-form', { timeout: 20_000 }).catch(() => {});
        await pause(1200);
        raw = await page.evaluate(readSerp).catch(() => null);
        if (raw && !raw.sorry) break;
        if (attempt === 1) {
          log(`  Google asked to verify the visitor for "${s.query}"; trying once more`);
          await pause(6000);
        }
      }
      if (!raw || raw.sorry) {
        log('  Google is still asking to verify the visitor: the browser stops here for this run');
        stopped = true;
        out.push({ ...s, url, status: 'blocked', route: 'browser' });
        continue;
      }
      const screenshot = join(shotsDir, `lookup-google-${i + 1}.jpg`);
      mkdirSync(shotsDir, { recursive: true });
      await page.screenshot({ path: screenshot, type: 'jpeg', quality: 70 }).catch(() => {});
      out.push({ ...s, ...raw, url, status: raw.organic.length ? 'ok' : 'no_results', route: 'browser', screenshot });
      await pause(gap + Math.random() * 2000);
    }
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

// ---------- the step ----------

export async function runGoogleStep(p, intake, { log = () => {}, env = process.env, launch, fetchImpl = fetch, gap = 3000 } = {}) {
  const website = cleanWebsite(intake.website);
  const domain = hostOf(website);
  const country = countryOf(intake.market || '');
  const names = [...new Set([intake.displayName, intake.name].map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 2);
  const platforms = Object.keys(brandProfiles(p, intake).client || {});
  if (!domain || !names.length) {
    const out = { skipped: 'no website to recognise the client in the results', checks: [], at: new Date().toISOString() };
    save(join(p.auditsDir, 'google.json'), out);
    return out;
  }
  const lang = (q) => (arabic(q) ? 'ar' : 'en');
  const rel = (f) => (f ? relative(p.dir, f).replace(/\\/g, '/') : null);
  const serpKey = env.SERPAPI_KEY;

  // Browser first; the searches it could not read go to SerpApi when a key is saved.
  const search = async (list) => {
    let runs = await browserSearches(list, { shotsDir: p.shotsDir, log, launch, gap });
    if (serpKey && runs.some((r) => r.status !== 'ok')) {
      runs = await Promise.all(runs.map(async (r) => {
        if (r.status === 'ok') return r;
        log(`SerpApi for "${r.query}"`);
        try {
          return { ...r, ...(await serpApiSearch(r.query, { key: serpKey, hl: r.hl, gl: r.gl, fetchImpl })), url: googleSearchUrl(r.query, r) };
        } catch (e) {
          log(`  SerpApi: ${e.message}`);
          return r;
        }
      }));
    }
    return runs;
  };

  log(`Google search for ${names.map((n) => `"${n}"`).join(' and ')}`);
  const brandRuns = await search(names.map((q) => ({ query: q, hl: lang(q), gl: country || '', kind: 'brand' })));
  const aiTerms = load(p.competitorsAi, {}).searchTerms || [];
  const competitorNames = loadCompetitors(p).list.map((c) => c.name);
  const terms = pickSearchTerms({ aiTerms, related: brandRuns.flatMap((r) => r.related || []), names, competitorNames });
  if (terms.length) log(`Google search for what buyers type: ${terms.map((t) => `"${t}"`).join(', ')}`);
  const termRuns = terms.length && !brandRuns.every((r) => r.status === 'blocked' && !serpKey) ? await search(terms.map((q) => ({ query: q, hl: lang(q), gl: country || '', kind: 'term' }))) : terms.map((q) => ({ query: q, status: 'blocked', route: 'browser' }));

  const evidence = (r) => (r.status === 'ok' && r.text ? addTextSource(p, { kind: 'lookup', url: r.url, title: `Google: ${r.query}`, text: String(r.text).slice(0, 8000), screenshot: rel(r.screenshot), extra: { lookup: 'google' } }).id : null);
  const read = (r) => ({ ...readGoogleRun(r, { domain, platforms, names }), sourceId: evidence(r), url: r.url });
  const brand = brandRuns.map(read);
  const buyer = termRuns.map(read);

  const checks = [];
  const add = (c, sourceId, url) => checks.push(upsertCheck(p, { ...c, by: 'code', url: url || '', ...(sourceId ? { sourceId } : {}) }));
  const firstOk = brand.find((r) => r.status === 'ok');
  add(googleBrandCheck(brand, { domain }), firstOk?.sourceId, firstOk?.url || googleSearchUrl(names[0]));
  add(googleBrandAdsCheck(brand, { domain }), firstOk?.sourceId, firstOk?.url || googleSearchUrl(names[0]));
  // Earlier buyer searches with other terms are replaced, not left behind.
  removeChecks(p, (c) => /^search_term_google_\d+$/.test(c.key) && Number(c.key.split('_').at(-1)) > buyer.length);
  buyer.forEach((r, i) => add(googleTermCheck(r, { domain, index: i + 1 }), r.sourceId, r.url));
  // A Google answer replaces the manual Google brand search the team would otherwise do.
  if (checks[0].result === 'present' || checks[0].result === 'absent') removeChecks(p, (c) => c.manual && c.key === 'manual_google_brand_search' && c.result === 'unknown');

  const slim = (r) => ({ query: r.query, status: r.status, route: r.route, domainRank: r.domainRank, profiles: r.profiles, sameName: r.sameName, ads: r.ads, localPack: r.localPack, questions: r.questions, related: r.related, aiOverview: r.aiOverview, organic: r.organic, sourceId: r.sourceId });
  const out = { domain, country, names, terms, termsFrom: load(p.competitorsAi, {}).searchTerms?.length ? 'competitor research' : terms.length ? "Google's related searches" : null, brand: brand.map(slim), buyer: buyer.map(slim), checks: checks.map((c) => ({ key: c.key, id: c.id, result: c.result, value: c.value || '', detail: c.detail || '' })), at: new Date().toISOString() };
  save(join(p.auditsDir, 'google.json'), out);
  return out;
}

