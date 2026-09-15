// "Find online presence" for the brief: reads the client's website once, before any research, and lists what it links to —
// social profiles (links, JSON-LD sameAs), logo candidates (JSON-LD logo, header logo image, touch icon, social image),
// contact details and a market guess. The person ticks what is right; nothing is used without that.
import { classifySocialUrl } from './social.js';
import { cleanWebsite } from '../engine/util/url.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const PRESENCE_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'x', 'snapchat', 'youtube', 'linkedin', 'whatsapp'];

// Runs inside the page: everything the parser needs, nothing else.
function readPage() {
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return '';
    }
  };
  const attrText = (el) => [el.getAttribute('src'), el.getAttribute('alt'), el.getAttribute('class'), el.id, el.closest('a')?.getAttribute('class'), el.closest('[class*="logo" i], [id*="logo" i]') ? 'logo-ancestor' : ''].filter(Boolean).join(' ');
  const images = [...document.querySelectorAll('img, image, [style*="background-image"]')].slice(0, 400).map((el) => {
    const r = el.getBoundingClientRect();
    const src = el.tagName === 'IMG' ? el.currentSrc || el.getAttribute('src') || '' : el.getAttribute('href') || (getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || '';
    const inHeader = Boolean(el.closest('header, nav, [class*="header" i], [id*="header" i], [class*="navbar" i]'));
    const linksHome = (() => {
      const a = el.closest('a');
      if (!a) return false;
      try {
        const u = new URL(a.href);
        return u.origin === location.origin && (u.pathname === '/' || /^\/(ar|en)\/?$/.test(u.pathname));
      } catch {
        return false;
      }
    })();
    return { src: abs(src), hints: attrText(el), top: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height), inHeader, linksHome };
  });
  const svgLogos = [...document.querySelectorAll('header svg, nav svg, a[href="/"] svg, [class*="logo" i] svg')].slice(0, 3).map((s) => ({ width: Math.round(s.getBoundingClientRect().width), height: Math.round(s.getBoundingClientRect().height), markup: s.outerHTML.length < 60000 ? s.outerHTML : '' }));
  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.lang || '',
    siteName: document.querySelector('meta[property="og:site_name"]')?.content || '',
    ogImage: abs(document.querySelector('meta[property="og:image"]')?.content || ''),
    icons: [...document.querySelectorAll('link[rel*="icon" i]')].map((l) => ({ href: abs(l.getAttribute('href')), sizes: l.getAttribute('sizes') || '', rel: l.getAttribute('rel') || '' })),
    links: [...document.querySelectorAll('a[href]')].map((a) => ({ href: abs(a.getAttribute('href')), text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 60) })),
    ldJson: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 20000)),
    images,
    svgLogos,
    text: (document.body?.innerText || '').slice(0, 20000),
  };
}

const PHONE_COUNTRY = [
  [/\+?966|00966/, 'Saudi Arabia'],
  [/\+?971|00971/, 'United Arab Emirates'],
  [/\+?20(?=1|2|3)|0020/, 'Egypt'],
  [/\+?965/, 'Kuwait'],
  [/\+?974/, 'Qatar'],
  [/\+?973/, 'Bahrain'],
  [/\+?968/, 'Oman'],
  [/\+?962/, 'Jordan'],
];
const TLD_COUNTRY = { sa: 'Saudi Arabia', eg: 'Egypt', ae: 'United Arab Emirates', kw: 'Kuwait', qa: 'Qatar', bh: 'Bahrain', om: 'Oman', jo: 'Jordan' };

function ldValues(ldJson) {
  const sameAs = [];
  const logos = [];
  const names = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const types = [].concat(node['@type'] || []).map(String);
    if (types.some((t) => /Organization|LocalBusiness|Store|Brand|Corporation|WebSite/i.test(t))) {
      [].concat(node.sameAs || []).forEach((u) => typeof u === 'string' && sameAs.push(u));
      const logo = typeof node.logo === 'string' ? node.logo : node.logo?.url || node.logo?.contentUrl;
      if (logo) logos.push(logo);
      if (typeof node.name === 'string') names.push(node.name);
    }
    Object.values(node).forEach(walk);
  };
  for (const raw of ldJson || []) {
    try {
      walk(JSON.parse(raw));
    } catch {
      // ignore broken JSON-LD
    }
  }
  return { sameAs, logos, names };
}

const iconSize = (sizes) => Math.max(0, ...String(sizes).split(/\s+/).map((s) => Number(s.split('x')[0]) || 0));

// Pure: page data → what was found. Scores decide the order; the person decides what is used.
export function parsePresence(page, { website = '' } = {}) {
  const host = (() => {
    try {
      return new URL(page.url || cleanWebsite(website)).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const ld = ldValues(page.ldJson);
  const socials = new Map();
  const add = (raw, source, confidence) => {
    const hit = classifySocialUrl(cleanWebsite(raw) || raw);
    if (!hit || !PRESENCE_PLATFORMS.includes(hit.platform)) return;
    const key = hit.url.replace(/^https?:\/\/(www\.|m\.|web\.)?/i, '').toLowerCase();
    const existing = socials.get(key);
    if (!existing || existing.confidence < confidence) socials.set(key, { ...hit, source, confidence });
  };
  ld.sameAs.forEach((u) => add(u, 'structured data', 3));
  (page.links || []).forEach((l) => add(l.href, 'website link', 2));
  const byPlatform = {};
  for (const s of socials.values()) (byPlatform[s.platform] ||= []).push(s);
  const list = Object.values(byPlatform).flatMap((items) => items.sort((a, b) => b.confidence - a.confidence).map((s, i) => ({ ...s, primary: i === 0 })));

  const logos = [];
  const pushLogo = (url, source, score, extra = {}) => {
    if (!url || /^data:image\/gif/.test(url) || logos.some((l) => l.url === url)) return;
    try {
      if (new URL(url).pathname.replace(/\/+$/, '') === '') return; // a page address, not an image
    } catch {
      return;
    }
    logos.push({ url, source, score, ...extra });
  };
  ld.logos.forEach((u) => pushLogo(u, 'structured data', 110));
  for (const img of page.images || []) {
    const hints = img.hints.toLowerCase();
    const logoish = /logo|brand|شعار/.test(hints);
    if (!img.src || img.width < 24 || img.height < 12) continue;
    let score = 0;
    if (logoish) score += 50;
    if (img.inHeader) score += 20;
    if (img.linksHome) score += 25;
    if (img.top < 160) score += 10;
    if (img.width > 700 || img.height > 300) score -= 40;
    if (/\.svg(\?|$)/i.test(img.src)) score += 5;
    if (score >= 45) pushLogo(img.src, logoish ? 'logo image on the website' : 'header image linking home', score, { width: img.width, height: img.height });
  }
  const icons = (page.icons || []).filter((i) => i.href).sort((a, b) => iconSize(b.sizes) - iconSize(a.sizes));
  const touch = icons.find((i) => /apple-touch/i.test(i.rel)) || icons.find((i) => iconSize(i.sizes) >= 120);
  if (touch) pushLogo(touch.href, 'app icon', 40);
  if (page.ogImage) pushLogo(page.ogImage, 'social sharing image', 15);
  const svg = (page.svgLogos || []).find((s) => s.markup && s.width >= 40);
  logos.sort((a, b) => b.score - a.score);

  const text = page.text || '';
  const emails = [...new Set((text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) || []).concat((page.links || []).filter((l) => /^mailto:/i.test(l.href)).map((l) => l.href.slice(7).split('?')[0])))].slice(0, 5);
  const phones = [...new Set((page.links || []).filter((l) => /^tel:/i.test(l.href)).map((l) => decodeURIComponent(l.href.slice(4)).replace(/[^\d+]/g, '')).concat(text.match(/\+\d[\d\s-]{8,}\d/g) || []).map((p) => p.replace(/[\s-]/g, '')))].slice(0, 5);
  const whatsapp = list.find((s) => s.platform === 'whatsapp')?.url || '';
  const tld = host.split('.').pop();
  const phoneCountry = PHONE_COUNTRY.find(([re]) => [...phones, whatsapp].some((p) => re.test(p.replace(/^.*wa\.me\//, '+'))))?.[1];
  const market = TLD_COUNTRY[tld] || phoneCountry || '';
  return {
    website: cleanWebsite(page.url || website),
    host,
    title: page.title || '',
    name: ld.names[0] || page.siteName || '',
    language: /^ar/i.test(page.lang) ? 'Arabic' : /^en/i.test(page.lang) ? 'English' : '',
    socials: list.filter((s) => s.platform !== 'whatsapp'),
    whatsapp,
    logos: logos.slice(0, 4),
    svgLogo: svg ? { width: svg.width, height: svg.height } : null,
    emails,
    phones,
    market,
    marketBasis: TLD_COUNTRY[tld] ? `.${tld} domain` : phoneCountry ? 'phone number on the website' : '',
  };
}

// Opens the website in headless Chromium (many sites only show links after scripts run) and parses it.
export async function findPresence(website, { browser = null, timeoutMs = 25_000 } = {}) {
  const url = cleanWebsite(website);
  if (!url) throw new Error('Type the website first, for example example.com');
  const own = !browser;
  if (own) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  }
  try {
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: 'ar-SA' });
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch((e) => ({ error: e }));
    if (res?.error) throw new Error(`The website did not open: ${String(res.error.message).split('\n')[0]}`);
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    const data = await page.evaluate(readPage);
    const out = parsePresence(data, { website: url });
    out.httpStatus = res?.status?.() ?? null;
    if (out.svgLogo) {
      const el = await page.$('header svg, nav svg, a[href="/"] svg, [class*="logo" i] svg');
      if (el) out.svgLogo.png = (await el.screenshot({ omitBackground: true }).catch(() => null))?.toString('base64') || null;
    }
    await ctx.close();
    return out;
  } finally {
    if (own) await browser.close();
  }
}
