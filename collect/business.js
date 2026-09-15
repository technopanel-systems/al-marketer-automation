// Business signals (docs/research/business-layer.md): how customers buy, payments, lead handling and support tools,
// retention, fulfilment, scale and trust — read by code from the client's own pages, DNS and free public lookups.
// Every signal is a check (biz_*) the diagnosis can cite. Not found on the pages checked is "absent", never "has none";
// a source that could not be read is "unknown". Business signals never become sold services by themselves.
import { resolveMx, resolveTxt } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../engine/catalog/store.js';
import { capturePage } from './capture.js';
import { save, upsertCheck, addTextSource } from '../pipeline/client.js';
import { cleanWebsite } from '../engine/util/url.js';

let rules;
const fingerprints = () => (rules ||= JSON.parse(readFileSync(join(ROOT, 'rules', 'business-fingerprints.json'), 'utf8')));
const any = (patterns = [], s = '') => patterns.some((p) => new RegExp(p, 'i').test(s));
const names = (list, test) => list.filter(test).map((x) => x.name);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Pages worth reading for business signals, by link text or address (contact, shipping, returns, FAQ, careers).
export function pickBusinessPages(homeUrl, links = [], max = 3) {
  let origin;
  try {
    origin = new URL(homeUrl).origin;
  } catch {
    return [];
  }
  const want = /(contact|shipping|delivery|return|refund|exchange|policy|faq|careers|jobs|اتصل|تواصل|الشحن|التوصيل|الاسترجاع|الاستبدال|سياسة|الأسئلة|وظائف)/i;
  const out = [];
  for (const l of links) {
    try {
      const u = new URL(l.href);
      if (u.origin !== origin || u.hash && u.pathname === new URL(homeUrl).pathname) continue;
      if (/\.(pdf|jpe?g|png|zip|docx?)$/i.test(u.pathname) || !want.test(`${decodeURIComponent(u.pathname)} ${l.text || ''}`)) continue;
      const clean = `${u.origin}${u.pathname}`;
      if (!out.includes(clean) && clean.replace(/\/$/, '') !== homeUrl.replace(/\/$/, '')) out.push(clean);
    } catch {}
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Pure: pages [{ url, html, text, links }], dns { mx: [..], txt: [..] }, extras { shopifyProducts, iosApp, webSince, sbcFound }
 * → checks [{ key, question, result, value, detail, url }]
 */
export function detectBusinessSignals({ pages = [], dns = null, extras = {}, market = '' }) {
  const fp = fingerprints();
  const html = pages.map((p) => p.html || '').join('\n');
  const text = pages.map((p) => p.text || '').join('\n');
  const links = pages.flatMap((p) => (p.links || []).map((l) => l.href || l));
  const home = pages[0]?.url || '';
  const kw = fp.keywords;
  const checks = [];
  const add = (key, question, result, value = '', detail = '') => checks.push({ key: `biz_${key}`, question, result, value, detail: detail || `checked ${pages.length} page(s) of the website`, url: home });
  const onPages = (re) => pages.filter((p) => re(p)).map((p) => p.url);

  const storeLike = /cdn\.shopify\.com|salla|zid\.store|zidstatic|woocommerce|youcan\.shop|expandcart/i.test(html);
  const addToCart = any(kw.add_to_cart, text) || /add-to-cart|cart\/add|data-add-to-cart|salla-add-product-button|js-add-to-cart/i.test(html);
  add('online_checkout', 'Visitors can add to cart and buy on the website', addToCart ? 'present' : 'absent', '', addToCart ? `add-to-cart found on ${onPages((p) => any(kw.add_to_cart, p.text || '') || /add-to-cart|cart\/add/i.test(p.html || '')).length || 1} page(s)` : '');
  if (any(kw.checkout_disabled, text)) add('checkout_disabled', 'The store shows that buying is disabled', 'present');

  const priceRe = /(\d[\d,.]*\s?(ر\.س|ريال|SAR|ر\.س\.|ج\.م|جنيه|EGP|AED|درهم|KWD|د\.ك)|(SAR|EGP|AED|KWD|ر\.س)\s?\d[\d,.]*)/i;
  const jsonLdPrice = /"price"\s*:\s*"?\d/.test(html);
  const prices = priceRe.test(text) || jsonLdPrice;
  add('prices_visible', 'Prices are shown on the website', prices ? 'present' : 'absent', '', prices ? (jsonLdPrice ? 'prices in the page data (schema.org offers)' : 'prices with a currency in the page text') : '');
  if (any(kw.quote, text)) add('quote_request', '"Request a quote" path on the website', 'present', '', (text.match(new RegExp(kw.quote.join('|'), 'i')) || [])[0] || '');
  const pdf = [...new Set(links.filter((u) => /\.pdf(\?|$)/i.test(u) && any(kw.catalogue_pdf_link, decodeURIComponent(u))))];
  if (pdf.length) add('catalogue_pdf', 'Catalogue or company profile offered as a PDF', 'present', pdf.slice(0, 2).join(' , '));
  const b2b = kw.b2b.filter((w) => new RegExp(w, 'i').test(text));
  add('b2b_indicators', 'Business-to-business signs on the website (projects, clients, distributors, certificates)', b2b.length ? 'value' : 'absent', b2b.slice(0, 6).join(', '));

  const payments = fp.payments.filter((pm) => any(pm.html, html) || any(pm.text, text));
  add('payment_methods', 'Payment methods shown on the website', payments.length ? 'value' : storeLike ? 'absent' : 'unknown', payments.map((x) => x.name).join(', '), payments.length ? '' : storeLike ? 'the store pages checked show no payment method names or icons' : 'not a store website, or payment methods are only shown at checkout');
  const bnpl = payments.filter((x) => fp.bnpl.includes(x.id));
  if (payments.length || storeLike) add('bnpl', 'Buy now, pay later offered (Tabby, Tamara, valU, Sympl)', bnpl.length ? 'value' : 'absent', bnpl.map((x) => x.name).join(', '));
  if (payments.some((x) => x.id === 'cod')) add('cod', 'Cash on delivery offered', 'present');
  if (extras.shopifyProducts !== undefined && extras.shopifyProducts !== null) add('catalog_size', 'Number of products published on the store', 'value', String(extras.shopifyProducts), 'from the store\'s public /meta.json');

  const langs = [...new Set(pages.flatMap((p) => [...String(p.html || '').matchAll(/hreflang="([a-z]{2})(?:-[a-zA-Z]{2})?"/g)].map((m) => m[1])))];
  if (langs.length) add('languages', 'Website language versions', 'value', langs.join(', '));

  // Each form on its own: contact details plus a message box, and not a search form.
  const leadForm = pages.some((p) => [...String(p.html || '').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].some(([, attrs, body]) => !/role=["']?search|action=["'][^"']*search/i.test(attrs) && !/type=["']?search/i.test(body) && /type=["']?(email|tel)["']?|name=["']?(phone|mobile|email)["']?/i.test(body) && /<textarea|name=["']?(message|msg|details)["']?/i.test(body)));
  add('lead_form', 'Enquiry form on the website (contact details + message)', leadForm ? 'present' : 'absent');
  const booking = names(fp.booking, (b) => any(b.html, html));
  if (booking.length) add('booking_tool', 'Online booking / appointment tool', 'value', booking.join(', '));
  const wa = links.filter((u) => /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(u));
  const waWidget = /wati\.io|getbutton\.io|elfsight.*whatsapp|joinchat|whatsapp-widget|zoko/i.test(html);
  add('whatsapp_path', 'WhatsApp contact path', wa.length || waWidget ? 'value' : 'absent', waWidget ? 'WhatsApp chat widget' : wa.length ? `WhatsApp link (${wa[0].replace(/^https?:\/\//, '').slice(0, 40)})` : '');
  const chat = names(fp.live_chat, (c) => any(c.html, html));
  add('live_chat', 'Live chat widget on the website', chat.length ? 'value' : 'absent', chat.join(', '));

  const dnsText = dns ? [...(dns.txt || [])].join('\n') : '';
  const crm = names(fp.crm, (c) => any(c.html, html) || (dns && any(c.dns, dnsText)));
  add('crm_tools', 'CRM / marketing automation tools found (website or domain records)', crm.length ? 'value' : dns ? 'absent' : 'unknown', crm.join(', '), dns ? 'checked the website pages and the domain\'s public DNS records' : 'the domain records could not be read');
  const helpdesk = names(fp.helpdesk, (c) => any(c.html, html) || (dns && any(c.dns, dnsText)));
  if (helpdesk.length) add('helpdesk', 'Helpdesk / ticketing tool found', 'value', helpdesk.join(', '));
  if (dns) {
    const senders = names(fp.email_senders, (c) => any(c.dns, dnsText));
    add('email_tools', 'Email sending tools in the domain records', senders.length ? 'value' : 'absent', senders.join(', '), 'from the domain\'s public SPF/TXT records');
    const mxText = (dns.mx || []).join('\n');
    const host = fp.mail_hosts.find((h) => any(h.mx, mxText));
    add('business_email', 'The brand domain receives email', (dns.mx || []).length ? 'value' : 'absent', (dns.mx || []).length ? `yes${host ? ` (${host.name})` : ''}` : '', 'from the domain\'s public MX records');
  }

  const loyalty = names(fp.loyalty, (l) => any(l.html, html) || any(l.text, text));
  if (loyalty.length) add('loyalty', 'Loyalty / points / cashback on the website', 'value', loyalty.join(', '));
  const reviews = names(fp.reviews, (r) => any(r.html, html));
  const ratingSchema = /"aggregateRating"/.test(html);
  if (reviews.length || ratingSchema) add('onsite_reviews', 'Customer reviews / ratings shown on the website', 'value', [...reviews, ratingSchema ? 'star ratings in page data' : ''].filter(Boolean).join(', '));
  const couriers = names(fp.couriers, (c) => any(c.text, text));
  if (couriers.length) add('couriers', 'Couriers named on the website', 'value', couriers.join(', '));
  const returns = links.some((u) => /return|refund|exchange|استرجاع|استبدال/i.test(decodeURIComponent(u))) || any(kw.returns, text);
  if (storeLike || addToCart) add('returns_policy', 'Returns / exchange policy on the website', returns ? 'present' : 'absent');
  const markets = names(fp.marketplaces, (m) => links.some((u) => any(m.links, u)));
  if (markets.length) add('marketplaces', 'Links to marketplaces or delivery apps', 'value', markets.join(', '));
  const ios = links.find((u) => /apps\.apple\.com\/.*id\d+/i.test(u));
  const android = links.find((u) => /play\.google\.com\/store\/apps\/details\?id=/i.test(u));
  if (ios) add('app_ios', 'iPhone app linked from the website', 'value', extras.iosApp ? `${extras.iosApp.name}: rating ${extras.iosApp.rating ?? '?'} from ${extras.iosApp.ratings ?? '?'} ratings, updated ${extras.iosApp.updated || '?'}` : ios, extras.iosApp ? 'from the App Store lookup API' : 'link found on the website');
  if (android) add('app_android', 'Android app linked from the website', 'value', android);
  if (any(kw.careers, text) || links.some((u) => /careers|jobs|وظائف/i.test(decodeURIComponent(u)))) add('hiring', 'Careers / jobs page on the website', 'present');
  if (extras.webSince) add('web_age', 'Website online since (first archived copy)', 'value', extras.webSince, 'from the Internet Archive');

  if (/saudi|السعودية|ksa|gcc/i.test(market) || /\.sa\b/.test(home)) {
    add('sbc_badge', 'Saudi Business Center e-store authentication shown on the website', any(kw.sbc, html) || any(kw.sbc, text) ? 'present' : 'absent');
    const vat = text.match(/(?:VAT|الرقم الضريبي|ضريبة القيمة المضافة)[^\d]{0,30}(3\d{14})/i);
    const cr = text.match(/(?:C\.?R\.?|س\.?\s?ت|السجل التجاري)[^\d]{0,20}(\d{10})/i);
    add('vat_cr_shown', 'VAT or commercial registration number shown on the website', vat || cr ? 'value' : 'absent', [vat && `VAT ${vat[1]}`, cr && `CR ${cr[1]}`].filter(Boolean).join(', '));
  }
  return checks;
}

const rootDomain = (url) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    return parts.length > 2 && /^(com|net|org|gov|edu)$/.test(parts.at(-2)) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  } catch {
    return '';
  }
};

export async function readDns(domain) {
  if (!domain) return null;
  try {
    const [mx, txt] = await Promise.all([resolveMx(domain).catch((e) => (e.code === 'ENODATA' || e.code === 'ENOTFOUND' ? [] : Promise.reject(e))), resolveTxt(domain).catch(() => [])]);
    return { mx: mx.sort((a, b) => a.priority - b.priority).map((r) => r.exchange), txt: txt.map((r) => r.join('')) };
  } catch {
    return null;
  }
}

async function json(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
  return res.ok ? res.json().catch(() => null) : null;
}

export async function runBusinessStep(p, intake, { log = () => {}, browser = null, fetchImpl = fetch, dnsReader = readDns } = {}) {
  // Older briefs saved the address as typed ("example.com"); the browser needs the full form.
  const website = cleanWebsite(intake.website);
  if (!website) {
    const out = { skipped: 'no website', checks: [], at: new Date().toISOString() };
    save(join(p.auditsDir, 'business.json'), out);
    return out;
  }
  const own = !browser;
  if (own) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  }
  const pages = [];
  try {
    log(`Reading ${website} for business signals`);
    const home = await capturePage(browser, website, { screenshots: false, timeoutMs: 40_000 });
    if (home.status === 'ok') {
      pages.push({ url: home.finalUrl || website, html: home.html, text: home.text, links: home.links });
      for (const url of pickBusinessPages(home.finalUrl || website, home.links || [])) {
        log(`  reading ${url}`);
        const cap = await capturePage(browser, url, { screenshots: false, timeoutMs: 30_000 });
        if (cap.status !== 'ok') continue;
        pages.push({ url: cap.finalUrl || url, html: cap.html, text: cap.text, links: cap.links });
        if (/return|refund|exchange|shipping|delivery|policy|استرجاع|استبدال|الشحن|التوصيل|سياسة/i.test(decodeURIComponent(url))) addTextSource(p, { kind: 'business', url: cap.finalUrl || url, title: cap.title || url, text: String(cap.text || '').slice(0, 12_000) });
      }
    }
  } finally {
    if (own) await browser.close();
  }
  const domain = rootDomain(pages[0]?.url || website);
  const dns = await dnsReader(domain);
  const extras = {};
  const html = pages.map((x) => x.html || '').join('\n');
  if (/cdn\.shopify\.com/i.test(html) && pages[0]) {
    const meta = await json(`${new URL(pages[0].url).origin}/meta.json`, fetchImpl).catch(() => null);
    extras.shopifyProducts = meta?.published_products_count ?? null;
  }
  const ios = pages.flatMap((x) => (x.links || []).map((l) => l.href)).map((u) => (String(u).match(/apps\.apple\.com\/.*id(\d+)/i) || [])[1]).find(Boolean);
  if (ios) {
    const country = /egypt|مصر/i.test(intake.market || '') ? 'eg' : 'sa';
    const r = (await json(`https://itunes.apple.com/lookup?id=${ios}&country=${country}`, fetchImpl).catch(() => null))?.results?.[0];
    if (r) extras.iosApp = { name: r.trackName, rating: r.averageUserRating ? Math.round(r.averageUserRating * 100) / 100 : null, ratings: r.userRatingCount ?? null, updated: String(r.currentVersionReleaseDate || '').slice(0, 10) };
  }
  const wayback = await json(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&limit=1&output=json&fl=timestamp`, fetchImpl).catch(() => null);
  const ts = wayback?.[1]?.[0];
  if (ts) extras.webSince = `${ts.slice(0, 4)}-${ts.slice(4, 6)}`;

  if (!pages.length) {
    const out = { skipped: 'the website could not be opened', domain, checks: [], at: new Date().toISOString() };
    save(join(p.auditsDir, 'business.json'), out);
    log('The website could not be opened for business signals');
    return out;
  }
  const checks = detectBusinessSignals({ pages, dns, extras, market: intake.market || '' });
  const saved = checks.map((c) => upsertCheck(p, { ...c, by: 'code' }));
  const out = { domain, pages: pages.map((x) => x.url), dns: dns ? { mx: dns.mx, spf: dns.txt.filter((t) => /^v=spf1/i.test(t)) } : null, extras, checks: saved.map((c) => ({ key: c.key, id: c.id, result: c.result, value: c.value })), at: new Date().toISOString() };
  save(join(p.auditsDir, 'business.json'), out);
  log(`${checks.length} business signal(s) checked on ${pages.length} page(s)`);
  return out;
}
