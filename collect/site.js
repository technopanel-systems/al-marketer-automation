// Collect step: website + public social pages → evidence pages, screenshots, audits and automated checks.
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';
import { capturePage, evidenceText } from './capture.js';
import { detectTech } from './tech.js';
import { pickSocialProfiles, classifySocialUrl, PLATFORMS } from './social.js';
import { addTextSource, upsertCheck, save, loadChecks } from '../pipeline/client.js';
import { ROOT } from '../engine/catalog/store.js';

const PAGE_HINTS = [
  { key: 'product', path: /\/(products?|p|item)\/[^/?#]+/i, weight: 4 },
  { key: 'products', path: /\/(collections|categories|category|shop|store|products?)\/?$/i, text: /(المنتجات|تسوق|الأقسام|منتجات|shop|products)/i, weight: 5 },
  { key: 'about', path: /(about|who-we-are|our-story|من-نحن)/i, text: /(about|من نحن|عن ?(المتجر|البراند|الشركة|نا))/i, weight: 4 },
  { key: 'shipping', path: /(shipping|delivery)/i, text: /(shipping|delivery|الشحن|التوصيل)/i, weight: 3 },
  { key: 'returns', path: /(return|refund|exchange)/i, text: /(return|الاسترجاع|الاستبدال)/i, weight: 2 },
  { key: 'contact', path: /contact/i, text: /(contact|تواصل|اتصل)/i, weight: 2 },
  { key: 'faq', path: /faq/i, text: /(faq|الأسئلة|اسئلة)/i, weight: 1 },
];
const MAX_EXTRA_PAGES = 5;

export function normalizeWebsite(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).toString();
  } catch {
    return null;
  }
}

// Picks internal pages worth reading, deterministically (keyword score, then link order).
export function pickInternalPages(homeUrl, links) {
  const home = new URL(homeUrl);
  const seen = new Set([home.href.replace(/\/$/, '')]);
  const scored = [];
  links.forEach((l, order) => {
    let u;
    try {
      u = new URL(l.href);
    } catch {
      return;
    }
    if (u.hostname.replace(/^www\./, '') !== home.hostname.replace(/^www\./, '')) return;
    if (/\.(jpg|jpeg|png|webp|gif|pdf|zip|mp4)$/i.test(u.pathname) || /cart|checkout|login|account|register|wishlist|search/i.test(u.pathname)) return;
    u.hash = '';
    const key = u.href.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    const path = decodeURIComponent(u.pathname);
    // The first matching kind wins, so a single product page is never mistaken for the product list.
    const first = PAGE_HINTS.find((h) => h.path.test(path) || (h.text && h.text.test(l.text) && !PAGE_HINTS[0].path.test(path)));
    const hits = first ? [first] : [];
    if (!hits.length) return;
    scored.push({ url: u.href, kinds: hits.map((h) => h.key), score: Math.max(...hits.map((h) => h.weight)), order });
  });
  const picked = [];
  const usedKinds = new Set();
  for (const s of scored.sort((a, b) => b.score - a.score || a.order - b.order)) {
    const kind = s.kinds[0];
    if (usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    picked.push(s);
    if (picked.length >= MAX_EXTRA_PAGES) break;
  }
  return picked;
}

async function fetchText(url, timeoutMs = 15_000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0 (Al-Marketer audit)' }, redirect: 'follow' });
    return { status: res.status, text: res.ok ? (await res.text()).slice(0, 200_000) : '' };
  } catch (e) {
    return { status: 0, text: '', error: e.message };
  }
}

// Optional free Google API key (PAGESPEED_API_KEY in .env.local). Without it Google often answers 429 (shared quota).
function pageSpeedKey() {
  if (process.env.PAGESPEED_API_KEY) return process.env.PAGESPEED_API_KEY.trim();
  const file = join(ROOT, '.env.local');
  return existsSync(file) ? (parseEnv(readFileSync(file, 'utf8')).PAGESPEED_API_KEY || '').trim() : '';
}

async function pageSpeed(url) {
  const key = pageSpeedKey();
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json();
    const cats = j.lighthouseResult?.categories || {};
    const audits = j.lighthouseResult?.audits || {};
    return {
      ok: true,
      scores: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)])),
      lcp: audits['largest-contentful-paint']?.displayValue || null,
      cls: audits['cumulative-layout-shift']?.displayValue || null,
      tbt: audits['total-blocking-time']?.displayValue || null,
      field: j.loadingExperience?.overall_category || null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const rate = (lcp) => (lcp === null ? 'unknown' : lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs improvement' : 'poor');

export function seoAudit(home, robots, sitemap) {
  const title = home.title || '';
  const description = home.meta?.description || '';
  const h1 = (home.headings || []).filter((h) => h.level === 1);
  return {
    https: /^https:/.test(home.finalUrl || ''),
    title,
    titleLength: title.length,
    metaDescription: description,
    metaDescriptionLength: description.length,
    h1Count: h1.length,
    h1: h1.map((h) => h.text).slice(0, 3),
    canonical: home.canonical || '',
    lang: home.lang || '',
    hreflang: home.hreflang || [],
    viewportMeta: Boolean(home.meta?.viewport),
    noindex: /noindex/i.test(home.meta?.robots || ''),
    imageCount: home.imageCount || 0,
    imagesWithoutAlt: home.imagesWithoutAlt || 0,
    structuredDataTypes: home.ldJsonTypes || [],
    robotsTxt: robots.status === 200,
    sitemapXml: sitemap.status === 200 && /<(urlset|sitemapindex)/i.test(sitemap.text),
  };
}

/**
 * @param {object} p       clientPaths()
 * @param {object} intake  { name, website, socials[] }
 * @param {object} [o]     { log, pageSpeed: true, captureSocial: true }
 */
export async function runCollect(p, intake, o = {}) {
  const log = o.log || (() => {});
  mkdirSync(p.shotsDir, { recursive: true });
  mkdirSync(p.auditsDir, { recursive: true });
  const rel = (f) => (f ? relative(p.dir, f).replace(/\\/g, '/') : null);
  const summary = { website: null, pages: [], social: [], tech: [], seo: null, performance: null, pageSpeed: null, blocked: [] };
  const browser = await chromium.launch();
  const today = new Date().toISOString().slice(0, 10);
  try {
    const website = normalizeWebsite(intake.website);
    let foundSocialLinks = [];
    const techPages = [];

    if (!website) {
      upsertCheck(p, { key: 'website_reachable', question: 'Website', result: 'unknown', detail: 'no website address was given at intake' });
    } else {
      log(`Capturing ${website}`);
      const home = await capturePage(browser, website, { shotPath: join(p.shotsDir, 'home-desktop.jpg') });
      const homeMobile = await capturePage(browser, website, { mobile: true, shotPath: join(p.shotsDir, 'home-mobile.jpg') });
      const homeSource = addTextSource(p, { kind: 'website', url: home.finalUrl || website, title: home.title, status: home.status, text: evidenceText(home), screenshot: rel(home.screenshot), mobileScreenshot: rel(homeMobile.screenshot), extra: { httpStatus: home.httpStatus, page: 'home' } });
      summary.website = { url: website, finalUrl: home.finalUrl, status: home.status, httpStatus: home.httpStatus, sourceId: homeSource.id, error: home.error || null };
      summary.pages.push({ id: homeSource.id, url: home.finalUrl, kind: 'home', status: home.status });
      upsertCheck(p, { key: 'website_reachable', question: 'Website loads in a browser', url: website, result: 'value', value: home.status === 'ok' ? `yes (HTTP ${home.httpStatus})` : `${home.status}${home.httpStatus ? ` (HTTP ${home.httpStatus})` : ''}${home.error ? ` — ${home.error}` : ''}`, screenshot: rel(home.screenshot) });
      if (home.status === 'blocked') summary.blocked.push(website);

      if (home.status === 'ok') {
        techPages.push(home, homeMobile);
        foundSocialLinks = (home.links || []).map((l) => l.href);
        for (const extra of pickInternalPages(home.finalUrl, home.links || [])) {
          log(`Capturing ${extra.url} (${extra.kinds.join(', ')})`);
          const cap = await capturePage(browser, extra.url, { shotPath: join(p.shotsDir, `page-${extra.kinds[0]}.jpg`) });
          const src = addTextSource(p, { kind: 'website', url: cap.finalUrl || extra.url, title: cap.title, status: cap.status, text: evidenceText(cap), screenshot: rel(cap.screenshot), extra: { httpStatus: cap.httpStatus, page: extra.kinds[0] } });
          summary.pages.push({ id: src.id, url: cap.finalUrl, kind: extra.kinds[0], status: cap.status });
          if (cap.status === 'ok') {
            techPages.push(cap);
            foundSocialLinks.push(...(cap.links || []).map((l) => l.href));
          }
        }

        const origin = new URL(home.finalUrl).origin;
        const [robots, sitemap] = await Promise.all([fetchText(`${origin}/robots.txt`), fetchText(`${origin}/sitemap.xml`)]);
        const seo = seoAudit(home, robots, sitemap);
        summary.seo = seo;
        save(join(p.auditsDir, 'seo.json'), seo);
        const seoChecks = [
          ['https', 'Website uses HTTPS', seo.https],
          ['meta_description', 'Homepage has a meta description', Boolean(seo.metaDescription), seo.metaDescription ? `"${seo.metaDescription.slice(0, 120)}"` : ''],
          ['h1', 'Homepage has an H1 heading', seo.h1Count > 0, seo.h1Count ? `${seo.h1Count} H1: "${seo.h1[0]}"` : ''],
          ['structured_data', 'Homepage has structured data (schema.org)', seo.structuredDataTypes.length > 0, seo.structuredDataTypes.join(', ')],
          ['sitemap', 'sitemap.xml is available', seo.sitemapXml],
          ['robots', 'robots.txt is available', seo.robotsTxt],
          ['viewport', 'Homepage is set up for mobile (viewport meta)', seo.viewportMeta],
          ['noindex', 'Homepage is blocked from Google (noindex)', seo.noindex],
        ];
        for (const [key, question, ok, detail] of seoChecks) upsertCheck(p, { key: `seo_${key}`, question, url: home.finalUrl, result: ok ? 'present' : 'absent', detail: detail || '' });
        if (seo.imageCount) upsertCheck(p, { key: 'seo_image_alt', question: 'Homepage images missing alt text', url: home.finalUrl, result: 'value', value: `${seo.imagesWithoutAlt} of ${seo.imageCount}` });

        const v = homeMobile.vitals || {};
        summary.performance = { mobile: v, desktop: home.vitals || {} };
        save(join(p.auditsDir, 'performance.json'), summary.performance);
        if (v.lcpMs !== null && v.lcpMs !== undefined) {
          upsertCheck(p, { key: 'perf_mobile_lcp', question: 'Homepage main content load time on mobile (LCP, measured once from this PC)', url: website, result: 'value', value: `${(v.lcpMs / 1000).toFixed(1)} s — ${rate(v.lcpMs)}`, detail: `${Math.round(v.transferKb / 1024)} MB downloaded while loading and scrolling the page (incl. images and videos), ${v.requestCount} requests` });
        }
        if (o.pageSpeed !== false) {
          log(`Asking Google PageSpeed Insights (free${pageSpeedKey() ? ', with your API key' : ', no key'})`);
          const psi = await pageSpeed(home.finalUrl);
          summary.pageSpeed = psi;
          save(join(p.auditsDir, 'pagespeed.json'), psi);
          if (psi.ok) upsertCheck(p, { key: 'psi_mobile', question: 'Google PageSpeed Insights (mobile) scores', url: home.finalUrl, result: 'value', value: `performance ${psi.scores.performance ?? '?'}/100, SEO ${psi.scores.seo ?? '?'}/100, accessibility ${psi.scores.accessibility ?? '?'}/100`, detail: [psi.lcp && `LCP ${psi.lcp}`, psi.tbt && `TBT ${psi.tbt}`, psi.cls && `CLS ${psi.cls}`].filter(Boolean).join(', ') });
        }

        const tech = detectTech(techPages);
        summary.tech = tech.detected;
        save(join(p.auditsDir, 'tech.json'), tech);
        const has = (id) => tech.detected.find((t) => t.id === id);
        const platforms = tech.detected.filter((t) => t.category === 'ecommerce_platform' || t.category === 'cms');
        upsertCheck(p, { key: 'tech_platform', question: 'Website / store platform', url: website, result: 'value', value: platforms.length ? platforms.map((t) => t.name).join(', ') : 'not identified' });
        const trackingChecks = [
          ['meta_pixel', 'Meta (Facebook/Instagram) Pixel on the website'],
          ['ga4', 'Google Analytics 4 on the website'],
          ['gtm', 'Google Tag Manager on the website'],
          ['tiktok_pixel', 'TikTok Pixel on the website'],
          ['snap_pixel', 'Snap Pixel on the website'],
          ['google_ads_tag', 'Google Ads conversion tag on the website'],
          ['whatsapp_link', 'WhatsApp contact link on the website'],
          ['newsletter_form', 'Email signup / capture form on the website'],
        ];
        for (const [id, question] of trackingChecks) {
          const hit = has(id);
          upsertCheck(p, { key: `tech_${id}`, question, url: website, result: hit ? 'present' : 'absent', detail: hit ? `found on ${hit.foundOn.length} page(s)` : `checked ${techPages.length} page load(s)` });
        }
      }
    }

    // Social profiles: given at intake or linked from the website.
    const profiles = pickSocialProfiles(intake.socials || [], foundSocialLinks);
    for (const prof of o.captureSocial === false ? [] : profiles.filter((x) => !['whatsapp', 'google_maps'].includes(x.platform))) {
      log(`Capturing ${prof.name}: ${prof.url}`);
      const cap = await capturePage(browser, prof.url, { shotPath: join(p.shotsDir, `social-${prof.platform}.jpg`), timeoutMs: 35_000 });
      const src = addTextSource(p, { kind: 'social', platform: prof.platform, url: prof.url, title: cap.title, status: cap.status, text: evidenceText(cap, 8000), screenshot: rel(cap.screenshot), extra: { httpStatus: cap.httpStatus, foundVia: prof.source } });
      summary.social.push({ id: src.id, platform: prof.platform, url: prof.url, status: cap.status, foundVia: prof.source });
      if (cap.status !== 'ok') summary.blocked.push(prof.url);
    }
    const mainPlatforms = ['instagram', 'tiktok', 'facebook', 'snapchat', 'x', 'youtube', 'linkedin'];
    for (const platform of mainPlatforms) {
      const prof = profiles.find((x) => x.platform === platform);
      const name = PLATFORMS.find((x) => x.id === platform).name;
      upsertCheck(p, { key: `social_${platform}`, question: `${name} profile found (given at intake or linked from the website)`, url: prof?.url || '', result: prof ? 'present' : 'absent', detail: prof ? `via ${prof.source}` : website ? 'not given at intake and no link on the captured website pages' : 'not given at intake' });
    }

    // Ads, brand search, Maps and comment replies are checked by code in the "lookups" step (collect/lookups.js);
    // only what that step cannot read is left to the team, as optional checks.

    summary.collectedAt = new Date().toISOString();
    summary.date = today;
    save(join(p.evidenceDir, 'collect-summary.json'), summary);
    return summary;
  } finally {
    await browser.close();
  }
}

// Captures URLs requested by AI researchers (public http/https only, no private hosts).
export async function captureRequested(p, urls, { log = () => {}, max = 6 } = {}) {
  const safe = [];
  for (const raw of urls) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname) || !u.hostname.includes('.')) continue;
    if (!safe.includes(u.href)) safe.push(u.href);
    if (safe.length >= max) break;
  }
  if (!safe.length) return [];
  const browser = await chromium.launch();
  const rel = (f) => (f ? relative(p.dir, f).replace(/\\/g, '/') : null);
  const out = [];
  try {
    for (const [i, url] of safe.entries()) {
      log(`Capturing requested page ${url}`);
      const social = classifySocialUrl(url);
      const cap = await capturePage(browser, url, { shotPath: join(p.shotsDir, `requested-${Date.now()}-${i}.jpg`), timeoutMs: 35_000 });
      const src = addTextSource(p, { kind: social ? 'social' : 'requested', platform: social?.platform || null, url, title: cap.title, status: cap.status, text: evidenceText(cap, 12_000), screenshot: rel(cap.screenshot), extra: { httpStatus: cap.httpStatus, requestedBy: 'research' } });
      out.push(src);
    }
  } finally {
    await browser.close();
  }
  return out;
}
