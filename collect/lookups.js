// Checks a person used to do by hand (docs/research/auto-checks.md), now done by code in a normal logged-out browser:
// - Meta Ad Library: active ads of the brand's own Facebook page (found by the page id, never by name)
// - Brave Search: where the brand's website ranks when searching its name (labelled Brave: its index is not Google's)
// - Google Maps: a business listing whose website link is the client's domain
// - Google Ads Transparency Center: ads pointing to the client's domain
// - Facebook: visible comments on the latest posts, and which ones the page answered
// Identity rules keep answers honest: a name-only match "needs confirmation", a page that cannot be read is "unknown"
// or "blocked", never "no". No logins, no CAPTCHA solving, one browser, one source at a time, with pauses.
// Parsers are pure functions (tested with saved HTML); the browser parts only fetch pages.
import { join, relative } from 'node:path';
import { mkdirSync } from 'node:fs';
import { save, load, upsertCheck, addTextSource, loadChecks, removeChecks } from '../pipeline/client.js';
import { cleanWebsite } from '../engine/util/url.js';
import { brandProfiles } from '../pipeline/social.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
const sameSite = (host, domain) => Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));

// "Saudi Arabia" → SA, "مصر" → EG; anything else searches everywhere.
export function countryOf(market = '') {
  if (/(^|\b)(sa|ksa|saudi)|السعودية/i.test(market)) return 'SA';
  if (/(^|\b)(eg|egypt)|مصر/i.test(market)) return 'EG';
  return null;
}

// ---------- Meta Ad Library ----------

// The classic page id the Ad Library uses, from the Facebook Page Plugin (the public page shows a different, newer id).
export function parsePluginPageId(html = '') {
  const id = (html.match(/"pageID":"(\d+)"/) || html.match(/href="https:\/\/www\.facebook\.com\/(\d+)\?ref=embed_page/) || [])[1] || null;
  const name = (html.match(/<a[^>]+class="[^"]*_1drp[^"]*"[^>]+title="([^"]+)"/) || html.match(/<a[^>]+title="([^"]+)"[^>]+class="[^"]*_1drp/) || [])[1] || null;
  return { pageId: id, pageName: name ? decodeEntities(name) : null };
}

const decodeEntities = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function findKey(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 60) return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const hit = findKey(v, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
const jsonScripts = (html, marker) => [...String(html).matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.includes(marker));

// The Ad Library page embeds its results as JSON; the visible text gives "~N results" or "No ads match".
export function parseMetaAdLibrary(html = '', text = '') {
  let data = null;
  for (const raw of jsonScripts(html, 'search_results_connection')) {
    try {
      const conn = findKey(JSON.parse(raw), 'search_results_connection');
      if (!conn) continue;
      const ads = (conn.edges || []).flatMap((e) => e.node?.collated_results || []).map((r) => ({
        adArchiveId: r.ad_archive_id || null,
        pageId: r.page_id || null,
        pageName: r.snapshot?.page_name || null,
        startDate: r.start_date ? new Date(r.start_date * 1000).toISOString().slice(0, 10) : null,
        platforms: r.publisher_platform || [],
        linkUrl: r.snapshot?.cards?.[0]?.link_url || r.snapshot?.link_url || null,
      }));
      data = { count: typeof conn.count === 'number' ? conn.count : null, ads };
      break;
    } catch {
      // another script block; keep looking
    }
  }
  const shown = (text.match(/(~?[\d,]+) results?/i) || [])[1] || (/No ads match/i.test(text) ? '0' : null);
  const shownCount = shown === null ? null : Number(shown.replace(/[~,]/g, ''));
  const count = data?.count ?? shownCount;
  const status = count === null ? (/log in to continue|you must log in/i.test(text) ? 'login_wall' : 'no_data') : 'ok';
  return { status, count, shown, ads: data?.ads || [] };
}

// What the check says about the page's active ads.
export function metaAdsCheck(result, { pageName, pageId, country }) {
  const where = country ? `shown in ${country}` : 'in any country';
  const question = `Meta Ad Library: active ads from the brand's Facebook page (${where})`;
  if (!result || result.status !== 'ok') return { key: 'ads_meta_active', question, result: result?.status === 'login_wall' ? 'blocked' : 'unknown', detail: result?.status === 'login_wall' ? 'Facebook asked to log in' : 'the Ad Library page could not be read' };
  if (!result.count) return { key: 'ads_meta_active', question, result: 'absent', detail: `no active ads for the page "${pageName || pageId}" (page id ${pageId})` };
  const dates = result.ads.map((a) => a.startDate).filter(Boolean).sort();
  const platforms = {};
  for (const a of result.ads) for (const pl of a.platforms) platforms[pl] = (platforms[pl] || 0) + 1;
  const topPlatforms = Object.entries(platforms).sort((a, b) => b[1] - a[1]).map(([pl, n]) => `${pl.toLowerCase()} ${n}`).join(', ');
  return {
    key: 'ads_meta_active',
    question,
    result: 'present',
    value: `${result.count} active ad${result.count === 1 ? '' : 's'}`,
    detail: `${result.count} active ad(s) for "${pageName || pageId}"${result.shown && result.shown.startsWith('~') ? ` (Meta shows ${result.shown})` : ''}${dates.length ? `, started ${dates[0]} to ${dates.at(-1)}` : ''}${topPlatforms ? `; first ads by platform: ${topPlatforms}` : ''}`,
  };
}

// ---------- Brave Search ----------

const letters = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const safeDecode = (u) => {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
};
const norm = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/([a-z]{2}\.|www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

// Top-10 results → where the client's website and profiles rank. A page where nothing mentions the query is "unreliable".
export function rankSearchResults(results, { query, domain, socials = [] }) {
  const seen = new Set();
  const top = results.filter((r) => /^https?:/.test(r.url) && !seen.has(r.url) && seen.add(r.url)).slice(0, 10).map((r, i) => ({ rank: i + 1, url: r.url, title: r.title || '', host: hostOf(r.url) }));
  const words = letters(query).split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  const glued = letters(query).replace(/[\s\-_.]+/g, '');
  const relevant = top.some((r) => {
    const hay = letters(`${r.title} ${safeDecode(r.url)}`);
    return words.some((w) => hay.includes(w)) || (glued.length >= 3 && hay.replace(/[\s\-_.]+/g, '').includes(glued));
  });
  const profiles = socials.map(norm).filter(Boolean);
  return {
    results: top,
    status: !top.length ? 'no_results' : relevant ? 'ok' : 'unreliable',
    domainRank: top.find((r) => sameSite(r.host, domain))?.rank ?? null,
    socialRanks: top.filter((r) => profiles.some((s) => norm(r.url).startsWith(s))).map((r) => ({ rank: r.rank, url: r.url })),
  };
}

export function braveCheck(runs, { domain }) {
  const question = `Brave Search: does ${domain} appear in the top 10 when searching the brand's name?`;
  const ok = runs.filter((r) => r.status === 'ok');
  if (!ok.length) {
    const blocked = runs.some((r) => r.status === 'blocked');
    return { key: 'search_brand_brave', question, result: blocked ? 'blocked' : 'unknown', detail: blocked ? 'Brave Search asked to verify the visitor' : runs.some((r) => r.status === 'unreliable') ? 'the results did not mention the brand name, so they were not used' : 'no results could be read' };
  }
  const found = ok.filter((r) => r.domainRank);
  const describe = (r) => `"${r.query}": ${r.domainRank ? `website #${r.domainRank}` : 'website not in the top 10'}${r.socialRanks.length ? `, profiles #${r.socialRanks.map((s) => s.rank).join(', #')}` : ''}; top results: ${r.results.slice(0, 3).map((x) => x.host).join(', ')}`;
  return {
    key: 'search_brand_brave',
    question,
    result: found.length ? 'present' : 'absent',
    value: found.length ? `#${Math.min(...found.map((r) => r.domainRank))}` : '',
    detail: `${ok.map(describe).join(' · ')} (Brave's results, not Google's)`,
  };
}

// ---------- Google Maps ----------

// Which listing belongs to the client: only one whose website link is the client's domain.
export function pickMapsListing(listings, domain) {
  const matched = listings.filter((l) => sameSite(hostOf(l.website || ''), domain));
  if (matched.length) return { answer: 'yes', listing: matched[0], matched };
  return { answer: listings.length === 1 ? 'needs_confirmation' : listings.length ? 'not_found_in_checked' : 'no_listing_shown', listing: listings[0] || null, matched: [] };
}

// "Sunday, 8 AM to 4 PM" ×7 (Maps starts from today) → "Sun–Thu 8 AM to 4 PM; Fri–Sat Closed", the week starting Sunday.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function compactHours(hours = []) {
  const byDay = new Map(hours.map((h) => [h.slice(0, 3), h.replace(/^\w+,\s*/, '').trim()]));
  if (!DAYS.every((d) => byDay.has(d))) return hours.map((h) => h.replace(/^(\w{3})\w*,\s*/, '$1 ')).join('; ');
  const groups = [];
  for (const d of DAYS) {
    const last = groups.at(-1);
    if (last && last.hours === byDay.get(d)) last.to = d;
    else groups.push({ from: d, to: d, hours: byDay.get(d) });
  }
  return groups.map((g) => `${g.from}${g.to !== g.from ? `–${g.to}` : ''} ${g.hours}`).join('; ');
}

export function mapsChecks(run, { domain, query }) {
  const question = `Google Maps: business listing linked to ${domain}`;
  if (!run || run.status === 'blocked') return [{ key: 'maps_listing', question, result: run ? 'blocked' : 'unknown', detail: run ? 'Google Maps asked to verify the visitor' : 'Maps could not be read' }];
  const pick = pickMapsListing(run.listings, domain);
  if (pick.answer === 'yes') {
    const l = pick.listing;
    const rating = l.rating != null ? `${l.rating}★ from ${l.reviews || 0} review${l.reviews === 1 ? '' : 's'}` : 'no rating shown';
    return [
      { key: 'maps_listing', question, result: 'present', value: l.name || '', detail: `"${l.name}"${l.category ? `, ${l.category}` : ''}${l.address ? `, ${l.address}` : ''}${pick.matched.length > 1 ? `; ${pick.matched.length} listings link to the website` : ''}` },
      { key: 'maps_rating', question: 'Google Maps: rating and number of reviews of the client\'s listing', result: 'value', value: rating, detail: [l.hours?.length ? `hours: ${compactHours(l.hours)}` : 'no opening hours shown', l.claimPrompt ? '"Claim this business" is shown (the listing may not be managed)' : '', l.ownerResponsesVisible ? `${l.ownerResponsesVisible} owner response(s) visible` : 'no owner responses visible'].filter(Boolean).join('; ') },
    ];
  }
  const detail = pick.answer === 'needs_confirmation' ? `one listing shown for "${query}" ("${pick.listing.name}"${pick.listing.website ? `, website ${hostOf(pick.listing.website)}` : ', no website'}) but it does not link to ${domain}` : pick.answer === 'not_found_in_checked' ? `none of the ${run.listings.length} listing(s) opened for "${query}" link to ${domain}` : `no listing shown for "${query}"`;
  return [{ key: 'maps_listing', question, result: pick.answer === 'needs_confirmation' ? 'unknown' : 'absent', detail }];
}

// ---------- Google Ads Transparency Center ----------

export function parseGatc(text = '', rpcBody = null) {
  const shown = (text.match(/(~?[\d,.]+[KM]?\+?)\s+ads?\b/i) || [])[1] || (/No ads found/i.test(text) ? '0' : null);
  let advertisers = [];
  let lastShown = null;
  try {
    const j = rpcBody ? JSON.parse(rpcBody) : null;
    const list = Array.isArray(j?.['1']) ? j['1'] : [];
    advertisers = [...new Map(list.filter((c) => c['1']).map((c) => [c['1'], { id: c['1'], name: c['12'] || null }])).values()];
    lastShown = list.map((c) => Number(c['7']?.['1'])).filter(Boolean).map((s) => new Date(s * 1000).toISOString().slice(0, 10)).sort().at(-1) || null;
  } catch {
    // the visible count is enough
  }
  return { shown, advertisers, lastShown };
}

export function gatcCheck(anyTime, last30, { domain, region }) {
  const question = `Google Ads Transparency Center: ads pointing to ${domain}${region ? ` shown in ${region}` : ''}`;
  if (!anyTime || anyTime.shown === null) return { key: 'ads_google_transparency', question, result: 'unknown', detail: 'the ads count could not be read' };
  if (anyTime.shown === '0') return { key: 'ads_google_transparency', question, result: 'absent', detail: 'No ads found (any time)' };
  const names = anyTime.advertisers.map((a) => a.name).filter(Boolean).slice(0, 4);
  return {
    key: 'ads_google_transparency',
    question,
    result: 'present',
    value: `${anyTime.shown} ads`,
    detail: `${anyTime.shown} ads any time${last30?.shown != null ? `, ${last30.shown} in the last 30 days` : ''}${names.length ? `; advertisers: ${names.join(', ')}` : ''}${anyTime.lastShown ? `; last shown ${anyTime.lastShown}` : ''} (Google's rounded counts; other advertisers can point to the same domain)`,
  };
}

// ---------- Facebook comment replies ----------

export const QUESTION = /[?؟]|(?:^|[\s,.!،])(how|when|where|price|available|متى|كم|بكم|وين|فين|هل|كيف|ليش|لماذا|متوفر|متوفرة|السعر|سعر|طلبي|ما وصل|ماوصل)(?=$|[\s,.!،?؟])/i;
const plain = (s) => String(s || '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Top-level comments embedded in a logged-out post page, with the replies Facebook shows.
export function commentsFromPostHtml(html = '') {
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.__typename === 'Comment' && o.body && o.depth === 0) {
      out.push({
        date: o.created_time ? new Date(o.created_time * 1000).toISOString().slice(0, 10) : null,
        author: o.author?.name || '',
        text: o.body.text || '',
        replyCount: o.feedback?.replies_fields?.total_count ?? null,
        repliesShown: (o.feedback?.replies_connection?.edges || []).map((e) => ({ author: e.node?.author?.name || '' })),
      });
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  for (const raw of jsonScripts(html, '"__typename":"Comment"')) {
    try {
      walk(JSON.parse(raw));
    } catch {
      // not JSON we understand
    }
  }
  const seen = new Set();
  return out.filter((c) => !seen.has(`${c.author}|${c.text}`) && seen.add(`${c.author}|${c.text}`));
}

// answered_by_page only when a page reply is visible; no_reply only when Facebook says 0 replies.
export function classifyComments(rows, pageName) {
  return rows.filter((c) => plain(c.author) !== plain(pageName)).map((c) => ({
    ...c,
    question: QUESTION.test(c.text),
    status: c.repliesShown.some((r) => plain(r.author) === plain(pageName)) ? 'answered_by_page' : c.replyCount === 0 ? 'no_reply' : 'replies_by_others_or_hidden',
  }));
}

export function repliesCheck(posts, { pageName }) {
  const question = 'Facebook: are visible comments on the latest posts answered by the page?';
  if (!posts) return { key: 'comments_facebook_replies', question, result: 'unknown', detail: 'the posts could not be read' };
  const rows = posts.flatMap((x) => x.rows);
  if (!posts.length) return { key: 'comments_facebook_replies', question, result: 'unknown', detail: 'no recent posts were visible' };
  const answered = rows.filter((r) => r.status === 'answered_by_page');
  const none = rows.filter((r) => r.status === 'no_reply');
  const questions = none.filter((r) => r.question);
  if (!rows.length) return { key: 'comments_facebook_replies', question, result: 'value', value: 'no visible comments', detail: `no visible comments on the last ${posts.length} post(s) of "${pageName}"` };
  return {
    key: 'comments_facebook_replies',
    question,
    result: 'value',
    value: `${answered.length} of ${rows.length} answered by the page`,
    detail: `last ${posts.length} post(s): ${rows.length} visible comment(s), ${answered.length} answered by the page, ${none.length} with no reply${questions.length ? ` (${questions.length === 1 ? '1 looks like a question' : `${questions.length} look like questions`}, e.g. "${questions[0].text.replace(/\s+/g, ' ').slice(0, 80)}")` : ''}. Facebook shows logged-out visitors only its "most relevant" comments.`,
  };
}

// ---------- browser runners ----------

async function newPage(browser, { locale = 'en-US', height = 900 } = {}) {
  const ctx = await browser.newContext({ locale, userAgent: UA, viewport: { width: 1366, height } });
  return { ctx, page: await ctx.newPage() };
}
const bodyText = (page) => page.evaluate(() => document.body?.innerText || '').catch(() => '');
async function shot(page, file) {
  mkdirSync(join(file, '..'), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality: 70 }).catch(() => {});
  return file;
}

export async function runMeta(browser, { facebookUrl, country, shotPath }) {
  const { ctx, page } = await newPage(browser);
  try {
    await page.goto(`https://www.facebook.com/plugins/page.php?${new URLSearchParams({ href: facebookUrl, tabs: 'timeline', width: '340', height: '500' })}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await pause(2000);
    const plugin = parsePluginPageId(await page.content());
    if (!plugin.pageId) return { status: 'no_page_id', ...plugin };
    const url = `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country: country || 'ALL', is_targeted_country: 'false', media_type: 'all', search_type: 'page', view_all_page_id: plugin.pageId })}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    await page.waitForFunction(() => /~?[\d,]+ results?|No ads match/i.test(document.body?.innerText || ''), null, { timeout: 25_000 }).catch(() => {});
    await pause(1500);
    const text = await bodyText(page);
    const parsed = parseMetaAdLibrary(await page.content(), text);
    return { ...parsed, ...plugin, url, text, screenshot: await shot(page, shotPath) };
  } finally {
    await ctx.close();
  }
}

export async function runBrave(browser, { query, country, domain, socials, shotPath }) {
  const { ctx, page } = await newPage(browser, { locale: /[؀-ۿ]/.test(query) ? 'ar-SA' : 'en-US' });
  const url = `https://search.brave.com/search?${new URLSearchParams({ q: query, source: 'web', ...(country ? { country: country.toLowerCase() } : {}) })}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('div.snippet[data-type="web"]', { timeout: 20_000 }).catch(() => {});
    await pause(1200);
    const text = await bodyText(page);
    const raw = await page.evaluate(() => [...document.querySelectorAll('div.snippet[data-type="web"]')].map((d) => ({ url: d.querySelector('a[href^="http"]')?.href || '', title: (d.querySelector('.title, .search-snippet-title')?.innerText || '').trim() })));
    const ranked = rankSearchResults(raw, { query, domain, socials });
    const status = ranked.results.length ? ranked.status : /captcha|verify you are human|too many requests/i.test(text.slice(0, 3000)) ? 'blocked' : 'no_results';
    return { query, url, ...ranked, status, text, screenshot: await shot(page, shotPath) };
  } finally {
    await ctx.close();
  }
}

// Runs in the page.
function readPlace() {
  const label = (sel) => document.querySelector(sel)?.getAttribute('aria-label')?.replace(/^[^:]+:\s*/, '').trim() || null;
  const reviews = [...document.querySelectorAll('div[role="main"] [aria-label]')].map((e) => e.getAttribute('aria-label').trim()).find((l) => /^[\d,.]+ reviews?$/.test(l));
  const rating = document.querySelector('div.F7nice span[aria-hidden="true"]')?.innerText;
  const text = document.querySelector('div[role="main"]')?.innerText || '';
  return {
    name: document.querySelector('div[role="main"] h1')?.innerText.trim() || null,
    rating: rating ? Number(rating.replace(',', '.')) : null,
    reviews: reviews ? Number(reviews.replace(/[^\d]/g, '')) : 0,
    category: document.querySelector('button[jsaction*="category"]')?.innerText.trim() || null,
    address: label('button[data-item-id="address"]'),
    phone: label('button[data-item-id^="phone:tel:"]'),
    website: document.querySelector('a[data-item-id="authority"]')?.href || null,
    hours: [...document.querySelectorAll('[aria-label$="Copy open hours"]')].map((e) => e.getAttribute('aria-label').replace(/, Copy open hours$/, '')),
    claimPrompt: /Claim this business/i.test(text),
    ownerResponsesVisible: (text.match(/Response from the owner/g) || []).length,
  };
}
const PLACE_READY = () => document.querySelector('div[role="feed"]') || (document.querySelectorAll('[aria-label$="Copy open hours"]').length >= 7 && [...document.querySelectorAll('div[role="main"] [aria-label]')].some((e) => /^[\d,.]+ reviews?$/.test(e.getAttribute('aria-label').trim())));

export async function runMaps(browser, { query, country, domain, maxOpen = 4, shotPath }) {
  const { ctx, page } = await newPage(browser);
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en${country ? `&gl=${country.toLowerCase()}` : ''}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (/consent\.google|\/sorry\//.test(page.url())) return { query, url, status: 'blocked', listings: [] };
    await page.waitForSelector('div[role="main"] h1, div[role="feed"]', { timeout: 20_000 }).catch(() => {});
    await page.waitForFunction(PLACE_READY, null, { timeout: 8000 }).catch(() => {});
    await pause(2500);
    const listings = [];
    if (!(await page.locator('div[role="feed"]').count())) {
      let place = await page.evaluate(readPlace);
      // A half-rendered panel (a few hours rows, or a rating without its review count) reloads once.
      if (place.name && ((place.hours.length > 0 && place.hours.length < 7) || (place.rating !== null && !place.reviews))) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(PLACE_READY, null, { timeout: 8000 }).catch(() => {});
        place = await page.evaluate(readPlace);
      }
      if (place.name) listings.push({ ...place, url: page.url().split('?')[0] });
    } else {
      const list = await page.evaluate(() => [...document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]')].map((a) => ({ name: a.getAttribute('aria-label'), url: a.href.split('?')[0], sponsored: /Sponsored/.test(a.parentElement?.innerText || '') })));
      for (const item of list.filter((x) => !x.sponsored).slice(0, maxOpen)) {
        await pause(1500);
        await page.goto(`${item.url}?hl=en`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
        await page.waitForFunction(PLACE_READY, null, { timeout: 8000 }).catch(() => {});
        const place = await page.evaluate(readPlace).catch(() => null);
        if (place?.name) listings.push({ ...place, url: item.url });
        if (place && sameSite(hostOf(place.website || ''), domain)) break;
      }
    }
    const text = await bodyText(page);
    return { query, url, status: 'ok', listings, text, screenshot: await shot(page, shotPath) };
  } finally {
    await ctx.close();
  }
}

export async function runGatc(browser, { domain, region, shotPath }) {
  const { ctx, page } = await newPage(browser);
  const one = async (url) => {
    let body = null;
    const onResp = async (r) => {
      if (!body && /SearchService\/SearchCreatives/.test(r.url())) body = await r.text().catch(() => null);
    };
    page.on('response', onResp);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    await page.waitForFunction(() => /~?[\d,.]+[KM]?\+?\s+ads?\b|No ads found/i.test(document.body?.innerText || ''), null, { timeout: 25_000 }).catch(() => {});
    await pause(1500);
    page.off('response', onResp);
    const text = await bodyText(page);
    return { url, text, ...parseGatc(text, body) };
  };
  try {
    const base = { region: region || 'anywhere', domain, hl: 'en' };
    const anyTime = await one(`https://adstransparency.google.com/?${new URLSearchParams(base)}`);
    const screenshot = await shot(page, shotPath);
    let last30 = null;
    if (anyTime.shown && anyTime.shown !== '0') {
      await pause(2000);
      last30 = await one(`https://adstransparency.google.com/?${new URLSearchParams({ ...base, 'preset-date': 'Last 30 days' })}`);
    }
    return { anyTime, last30, screenshot };
  } finally {
    await ctx.close();
  }
}

export async function runFacebookReplies(browser, { facebookUrl, maxPosts = 3, delayMs = 3000, shotPath }) {
  // A tall window: scrolling a logged-out post page opens a sign-up dialog.
  const { ctx, page } = await newPage(browser, { height: 1400 });
  try {
    await page.goto(`https://www.facebook.com/plugins/page.php?${new URLSearchParams({ href: facebookUrl, tabs: 'timeline', width: '500', height: '3000' })}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await pause(5000);
    const pageName = await page.locator('a._1drp').first().getAttribute('title', { timeout: 5000 }).catch(() => null);
    if (!pageName) return { status: 'no_page', posts: null };
    const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('abbr[data-utime]')].map((a) => a.closest('a')?.href).filter(Boolean))]);
    const handle = new URL(facebookUrl).pathname.split('/').filter(Boolean)[0];
    const posts = [];
    for (const link of links.slice(0, maxPosts)) {
      await pause(delayMs);
      const url = link.replace(/\?ref=embed_page$/, '').replace(/^https:\/\/www\.facebook\.com\/reel\/(\d+)\/?$/, `https://www.facebook.com/${handle}/videos/$1/`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
      await pause(5000);
      const rows = classifyComments(commentsFromPostHtml(await page.content()), pageName);
      posts.push({ url, rows });
      if (posts.length === 1) await shot(page, shotPath);
    }
    return { status: 'ok', pageName, posts, screenshot: posts.length ? shotPath : null };
  } finally {
    await ctx.close();
  }
}

// ---------- the step ----------

// Manual checks the team used to fill; the automated check that replaced each one.
export const REPLACED_MANUAL = { manual_meta_ad_library: 'ads_meta_active', manual_google_brand_search: 'search_brand_brave', manual_google_maps: 'maps_listing', manual_social_activity: 'social cadence checks', manual_unanswered_comments: 'comments_facebook_replies' };

export async function runLookupsStep(p, intake, { log = () => {}, browser = null, gap = 3000 } = {}) {
  const website = cleanWebsite(intake.website);
  const domain = hostOf(website);
  const country = countryOf(intake.market || '');
  const names = [...new Set([intake.name, intake.displayName].map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 2);
  const profiles = brandProfiles(p, intake).client || {};
  const status = load(p.socialStatus, {});
  const facebookUrl = profiles.facebook && !['wrong_page', 'not_found'].includes(status['client:facebook']?.status) ? profiles.facebook : null;
  const rel = (f) => (f ? relative(p.dir, f).replace(/\\/g, '/') : null);
  const evidence = (kind, { url, title, text, screenshot }) => (text ? addTextSource(p, { kind: 'lookup', url, title, text: String(text).slice(0, 8000), screenshot: rel(screenshot), extra: { lookup: kind } }).id : null);
  const checks = [];
  const add = (c, sourceId) => checks.push(upsertCheck(p, { ...c, by: 'code', ...(sourceId ? { sourceId } : {}) }));
  const fallbacks = [];
  const runs = {};
  // The Google search step (collect/google.js) answers the brand search when it can read Google.
  const googleAnswered = () => loadChecks(p).some((c) => c.key === 'search_brand_google' && ['present', 'absent'].includes(c.result));

  const own = !browser;
  // The browser starts only when there is something to look up.
  let starting = null;
  const open = async () => (browser ||= await (starting ||= import('playwright').then(({ chromium }) => chromium.launch())));
  const attempt = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      log(`${label} could not be read: ${String(e.message || e).split('\n')[0]}`);
      return null;
    }
  };
  try {
    // Meta Ad Library, by the page id of the brand's own Facebook page.
    if (facebookUrl) {
      log(`Meta Ad Library for ${facebookUrl}`);
      const r = (runs.meta = await attempt('Meta Ad Library', async () => runMeta(await open(), { facebookUrl, country, shotPath: join(p.shotsDir, 'lookup-meta-ads.jpg') })));
      if (!r) add({ key: 'ads_meta_active', question: 'Meta Ad Library: active ads from the brand\'s Facebook page', result: 'unknown', detail: 'the Ad Library could not be read' });
      else if (r.pageId) add({ ...metaAdsCheck(r, { pageName: r.pageName, pageId: r.pageId, country }), url: r.url }, evidence('meta', { url: r.url, title: `Meta Ad Library: ${r.pageName || r.pageId}`, text: r.text, screenshot: r.screenshot }));
      else add({ key: 'ads_meta_active', question: 'Meta Ad Library: active ads from the brand\'s Facebook page', result: 'unknown', detail: 'the Facebook page id could not be read from the page plugin' });
      await pause(gap);
    } else add({ key: 'ads_meta_active', question: 'Meta Ad Library: active ads from the brand\'s Facebook page', result: 'unknown', detail: 'no confirmed Facebook page for the brand' });
    if (checks.at(-1).result === 'unknown' || checks.at(-1).result === 'blocked') {
      fallbacks.push({ key: 'manual_meta_ad_library', question: `Meta Ad Library: does the brand run active ads? (automatic check: ${checks.at(-1).detail})`, url: `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country: country || 'ALL', q: names[0] || '', search_type: 'keyword_unordered' })}` });
    }

    // Brave Search for each name of the brand.
    if (domain && names.length) {
      runs.brave = [];
      for (const [i, query] of names.entries()) {
        log(`Brave Search for "${query}"`);
        const r = await attempt('Brave Search', async () => runBrave(await open(), { query, country, domain, socials: Object.values(profiles), shotPath: join(p.shotsDir, `lookup-brave-${i + 1}.jpg`) }));
        if (r) {
          r.sourceId = evidence('brave', { url: r.url, title: `Brave Search: ${query}`, text: r.text, screenshot: r.screenshot });
          runs.brave.push(r);
          if (r.status === 'blocked') break;
        }
        await pause(gap);
      }
      const c = braveCheck(runs.brave, { domain });
      add({ ...c, url: runs.brave[0]?.url || '' }, runs.brave[0]?.sourceId);
      if (['unknown', 'blocked'].includes(c.result) && !googleAnswered()) fallbacks.push({ key: 'manual_google_brand_search', question: 'Google: does the brand appear on page 1 when searching its name?', url: `https://www.google.com/search?q=${encodeURIComponent(names[0])}` });
    }

    // Google Maps: the listing whose website is the client's domain.
    if (domain && names.length) {
      let last = null;
      for (const [i, query] of names.entries()) {
        log(`Google Maps for "${query}"`);
        const r = await attempt('Google Maps', async () => runMaps(await open(), { query, country, domain, shotPath: join(p.shotsDir, `lookup-maps-${i + 1}.jpg`) }));
        await pause(gap);
        if (!r) continue;
        last = r;
        r.sourceId = evidence('maps', { url: r.url, title: `Google Maps: ${query}`, text: r.text, screenshot: r.screenshot });
        if (r.status === 'blocked' || pickMapsListing(r.listings, domain).answer === 'yes') break;
      }
      runs.maps = last;
      const list = mapsChecks(last, { domain, query: last?.query || names[0] });
      for (const c of list) add({ ...c, url: last?.listings?.find((l) => sameSite(hostOf(l.website || ''), domain))?.url || last?.url || '' }, last?.sourceId);
      if (['unknown', 'blocked'].includes(list[0].result)) fallbacks.push({ key: 'manual_google_maps', question: `Google Maps: is there a business listing? (automatic check: ${list[0].detail})`, url: `https://www.google.com/maps/search/${encodeURIComponent(names[0])}` });
    }

    // Google Ads Transparency Center, by domain.
    if (domain) {
      log(`Google Ads Transparency Center for ${domain}`);
      const r = (runs.gatc = await attempt('Google Ads Transparency Center', async () => runGatc(await open(), { domain, region: country, shotPath: join(p.shotsDir, 'lookup-google-ads.jpg') })));
      add({ ...gatcCheck(r?.anyTime, r?.last30, { domain, region: country }), url: r?.anyTime?.url || '' }, r ? evidence('gatc', { url: r.anyTime.url, title: `Google Ads Transparency Center: ${domain}`, text: r.anyTime.text, screenshot: r.screenshot }) : null);
      await pause(gap);
    }

    // Facebook comments on the latest posts, and which the page answered.
    if (facebookUrl) {
      log(`Facebook comment replies on ${facebookUrl}`);
      const r = (runs.facebookReplies = await attempt('Facebook comments', async () => runFacebookReplies(await open(), { facebookUrl, shotPath: join(p.shotsDir, 'lookup-facebook-comments.jpg') })));
      const c = repliesCheck(r?.posts || null, { pageName: r?.pageName || '' });
      const text = r?.posts?.flatMap((x) => x.rows.map((row) => `${row.date || ''} ${row.author}: ${row.text} [${row.status}]`)).join('\n');
      add({ ...c, url: facebookUrl }, text ? evidence('facebook-comments', { url: `${facebookUrl}#comments`, title: `Facebook comments: ${r.pageName}`, text, screenshot: r.screenshot }) : null);
    }
  } finally {
    if (own && browser) await browser.close();
  }

  // Without a website nothing proves a listing or a search result is the client's: those stay with the team.
  if (!domain && names.length) {
    fallbacks.push({ key: 'manual_google_maps', question: 'Google Maps: is there a business listing? (no website to match the listing against)', url: `https://www.google.com/maps/search/${encodeURIComponent(names[0])}` });
    if (!googleAnswered()) fallbacks.push({ key: 'manual_google_brand_search', question: 'Google: does the brand appear on page 1 when searching its name?', url: `https://www.google.com/search?q=${encodeURIComponent(names[0])}` });
  }

  // Instagram and TikTok hide who answered a comment from logged-out visitors: that one stays optional.
  if (profiles.instagram || profiles.tiktok) fallbacks.push({ key: 'manual_unanswered_comments', question: `${profiles.instagram ? 'Instagram' : 'TikTok'}: are comments / questions left unanswered? (${profiles.instagram ? 'Instagram' : 'TikTok'} hides replies from visitors who are not logged in${facebookUrl ? '; Facebook is checked automatically' : ''})`, url: profiles.instagram || profiles.tiktok });

  // Keep the team's answers; replace unanswered manual checks with the automated ones.
  const answered = new Set(loadChecks(p).filter((c) => c.manual && c.result !== 'unknown').map((c) => c.key));
  const wanted = new Set(fallbacks.map((f) => f.key));
  removeChecks(p, (c) => c.manual && c.result === 'unknown' && c.key in REPLACED_MANUAL && !wanted.has(c.key));
  for (const f of fallbacks) if (!answered.has(f.key)) upsertCheck(p, { ...f, by: 'you', result: 'unknown', manual: true });

  const out = {
    domain,
    country,
    names,
    facebookUrl,
    checks: checks.map((c) => ({ key: c.key, id: c.id, result: c.result, value: c.value || '', detail: c.detail || '' })),
    manualFallbacks: fallbacks.map((f) => f.key),
    runs: {
      meta: runs.meta ? { status: runs.meta.status, pageId: runs.meta.pageId, pageName: runs.meta.pageName, count: runs.meta.count, ads: (runs.meta.ads || []).slice(0, 20) } : null,
      brave: (runs.brave || []).map((r) => ({ query: r.query, status: r.status, domainRank: r.domainRank, socialRanks: r.socialRanks, results: r.results })),
      maps: runs.maps ? { query: runs.maps.query, status: runs.maps.status, listings: runs.maps.listings } : null,
      gatc: runs.gatc ? { anyTime: { shown: runs.gatc.anyTime.shown, advertisers: runs.gatc.anyTime.advertisers, lastShown: runs.gatc.anyTime.lastShown }, last30: runs.gatc.last30 ? { shown: runs.gatc.last30.shown } : null } : null,
      facebookReplies: runs.facebookReplies ? { pageName: runs.facebookReplies.pageName, posts: runs.facebookReplies.posts } : null,
    },
    at: new Date().toISOString(),
  };
  save(join(p.auditsDir, 'lookups.json'), out);
  log(`${checks.length} automatic check(s)${fallbacks.length ? `; ${fallbacks.length} optional check(s) left for the team` : ''}`);
  return out;
}
