// Captures a web page with a real browser: visible text, metadata, links, requests, timing and screenshots.
// Saved text is what AI reads and what quotes are verified against.

const BLOCK_SIGNS = [
  /just a moment\.\.\./i,
  /attention required!? \| cloudflare/i,
  /checking your browser before accessing/i,
  /verify you are human/i,
  /enable javascript and cookies to continue/i,
  /access denied/i,
  /captcha/i,
  /تحقق من أنك إنسان/,
];
const LOGIN_WALL_SIGNS = [/log in to instagram|login • instagram|sign up to see photos/i, /log in to tiktok|log in to follow creators/i, /you must log in to continue|log into facebook/i];

export const DESKTOP = { width: 1440, height: 900 };
export const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function extractInPage() {
  const meta = {};
  for (const m of document.querySelectorAll('meta[name], meta[property]')) {
    const key = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase();
    if (/^(description|keywords|robots|viewport|og:|twitter:|generator|theme-color)/.test(key)) meta[key] = (m.getAttribute('content') || '').slice(0, 500);
  }
  const headings = [...document.querySelectorAll('h1, h2, h3')].slice(0, 60).map((h) => ({ level: Number(h.tagName[1]), text: h.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) })).filter((h) => h.text);
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80) })).filter((l) => /^https?:|^mailto:|^tel:/.test(l.href));
  const images = [...document.images];
  const ldJson = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 2000));
  const text = (document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return {
    title: document.title,
    lang: document.documentElement.getAttribute('lang') || '',
    dir: document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction,
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute('hreflang')),
    meta,
    headings,
    links,
    imageCount: images.length,
    imagesWithoutAlt: images.filter((i) => !(i.getAttribute('alt') || '').trim()).length,
    ldJsonTypes: ldJson.map((j) => (j.match(/"@type"\s*:\s*"([^"]+)"/) || [])[1]).filter(Boolean),
    formsWithEmail: document.querySelectorAll('input[type="email"]').length,
    text,
  };
}

function collectVitals() {
  return new Promise((resolve) => {
    const out = { lcpMs: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const e = list.getEntries().at(-1);
        if (e) out.lcpMs = Math.round(e.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // older engines
    }
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      resolve({
        ...out,
        cls: Math.round(out.cls * 1000) / 1000,
        ttfbMs: nav ? Math.round(nav.responseStart) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadMs: nav ? Math.round(nav.loadEventEnd) : null,
        transferKb: Math.round((resources.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0)) / 1024),
        requestCount: resources.length + 1,
      });
    }, 1200);
  });
}

/**
 * Captures one URL. Returns a result object; never throws for page problems (status: ok | blocked | login_wall | failed).
 * @param {import('playwright').Browser} browser
 */
export async function capturePage(browser, url, { mobile = false, screenshots = true, shotPath, timeoutMs = 45_000 } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: MOBILE.width, height: MOBILE.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE.userAgent, locale: 'ar-EG' } : { viewport: DESKTOP, userAgent: DESKTOP_UA, locale: 'ar-EG' });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.length < 800 && requests.push(r.url()));
  const started = Date.now();
  const result = { url, finalUrl: url, mobile, status: 'failed', httpStatus: null, headers: {}, fetchedAt: new Date().toISOString() };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(800);
    result.httpStatus = response?.status() ?? null;
    result.headers = response ? await response.allHeaders().catch(() => ({})) : {};
    result.finalUrl = page.url();
    // Scroll once so lazy content and pixels load.
    await page.evaluate(async () => {
      for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 900) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    }).catch(() => {});
    const vitals = await page.evaluate(collectVitals).catch(() => null);
    const data = await page.evaluate(extractInPage);
    const html = await page.content();
    Object.assign(result, data, { html, requests, vitals, durationMs: Date.now() - started });
    const sample = `${data.title}\n${data.text.slice(0, 3000)}`;
    if (BLOCK_SIGNS.some((re) => re.test(sample)) && data.text.length < 3000) result.status = 'blocked';
    else if (LOGIN_WALL_SIGNS.some((re) => re.test(sample))) result.status = 'login_wall';
    else if (result.httpStatus && result.httpStatus >= 400) result.status = 'failed';
    else result.status = 'ok';
    if (screenshots && shotPath) {
      await page.screenshot({ path: shotPath, type: 'jpeg', quality: 62, fullPage: false });
      result.screenshot = shotPath;
    }
  } catch (e) {
    result.error = e.message.split('\n')[0];
    result.durationMs = Date.now() - started;
  } finally {
    await ctx.close().catch(() => {});
  }
  return result;
}

// Text that gets saved as evidence: metadata first (it is often all a login-walled social page exposes), then visible text.
export function evidenceText(capture, maxChars = 24_000) {
  const lines = [];
  lines.push(`URL: ${capture.finalUrl || capture.url}`);
  if (capture.title) lines.push(`Title: ${capture.title}`);
  for (const [k, v] of Object.entries(capture.meta || {})) if (/^(description|og:title|og:description|twitter:description)$/.test(k) && v) lines.push(`${k}: ${v}`);
  if (capture.headings?.length) lines.push(`Headings: ${capture.headings.map((h) => h.text).join(' | ')}`);
  lines.push('---');
  lines.push((capture.text || '').slice(0, maxChars));
  return lines.join('\n');
}
