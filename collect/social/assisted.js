// Assisted capture: an employee browses a profile in the research browser; the app records what the platform's own
// web app loads (post data responses and embedded JSON) plus what is on screen, and shows a live counter on the page.
// Read-only: nothing is clicked, posted or followed by the app.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractFromJson, parseJsonBodies, domExtractor, mergeExtractions } from './extract.js';
import { PLATFORM_NAMES } from '../../engine/social/metrics.js';

const DOMAINS = { linkedin: /(^|\.)linkedin\.com$/, instagram: /(^|\.)instagram\.com$/, facebook: /(^|\.)facebook\.com$/, x: /(^|\.)(x|twitter)\.com$/, tiktok: /(^|\.)tiktok\.com$/, youtube: /(^|\.)youtube\.com$/, snapchat: /(^|\.)snapchat\.com$/ };
export const HINTS = {
  linkedin: 'Open the company page → Posts tab, then scroll down slowly until the counter says 3 months are covered.',
  instagram: 'Scroll the profile grid down until the counter says 3 months are covered. If likes stay at 0, open the latest few posts.',
  facebook: 'Scroll the page’s posts down until the counter says 3 months are covered.',
  x: 'Scroll the posts down until the counter says 3 months are covered.',
  tiktok: 'Scroll the videos down until the counter says 3 months are covered.',
  youtube: 'Open the Videos tab and scroll a little.',
  snapchat: 'Look at the public profile, then press Done and type the numbers on the review screen.',
};
const LOGIN_URL = /authwall|\/login|\/signin|accounts\/login|\/i\/flow\/login|checkpoint/i;

// Runs inside every page of the capture tab. Builds the floating panel with DOM calls only (no innerHTML), so it works on
// sites with strict content-security or trusted-types policies.
function overlayScript(info) {
  if (window.top !== window) return;
  const build = () => {
    if (document.getElementById('alm-capture')) return;
    const box = document.createElement('div');
    box.id = 'alm-capture';
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:330px;background:#0b0b0b;color:#fff;font:13px/1.45 system-ui,Segoe UI,Arial;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:14px 16px;border-top:4px solid #EF4423';
    const line = (text, css = '') => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = css;
      box.appendChild(d);
      return d;
    };
    line(`Al-Marketer capture · ${info.brandName} · ${info.platformName}`, 'font-weight:700;margin-bottom:6px');
    line(info.hint, 'color:#ccc;margin-bottom:8px');
    const status = line('Waiting for posts…', 'background:#1c1c1c;border-radius:8px;padding:8px;margin-bottom:10px');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    const button = (label, action, bg) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `border:0;border-radius:8px;padding:7px 10px;cursor:pointer;font:600 12px system-ui;color:#fff;background:${bg}`;
      b.addEventListener('click', () => window.__almCapture && window.__almCapture(action));
      row.appendChild(b);
    };
    button('Done — save', 'done', '#EF4423');
    button('Not on this platform', 'not_found', '#444');
    button('Cancel', 'cancel', '#444');
    box.appendChild(row);
    document.documentElement.appendChild(box);
    window.__almUpdate = (s) => {
      if (s.loginWall) {
        status.textContent = 'Not logged in. Log in with the agency research account in this window, then open the profile again.';
        status.style.background = '#5a1a12';
        return;
      }
      status.style.background = '#1c1c1c';
      const covered = s.oldestDays !== null && s.oldestDays >= 85;
      status.textContent = `Posts found: ${s.posts}${s.dated !== s.posts ? ` (${s.dated} with dates)` : ''}\n${s.oldestDays === null ? 'Oldest: —' : `Oldest post: ${s.oldestDays} days ago`}${s.followers !== null ? `\nFollowers: ${s.followers.toLocaleString('en-US')}` : ''}\n${covered ? '✓ 3 months covered — press Done' : 'Keep scrolling…'}`;
      status.style.whiteSpace = 'pre-line';
    };
    window.__almHide = () => {
      box.style.display = 'none';
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  setInterval(build, 3000);
}

/**
 * @returns {Promise<{ action: 'done'|'not_found'|'cancel'|'timeout', capture: object|null }>}
 */
export async function assistedCapture({ browser, platform, url, brandName, handle, shotsDir, fileBase, log = () => {}, timeoutMs = 30 * 60_000 }) {
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  const bodies = [];
  let bytes = 0;
  page.on('response', async (res) => {
    try {
      if (!DOMAINS[platform]?.test(new URL(res.url()).hostname)) return;
      if (!['xhr', 'fetch'].includes(res.request().resourceType())) return;
      if (!/json|javascript|text\/plain/.test(res.headers()['content-type'] || '')) return;
      if (bytes > 80e6 || bodies.length > 800) return;
      const text = await res.text();
      if (text.length > 8e6) return;
      const parsed = parseJsonBodies(text);
      if (parsed.length) {
        bodies.push(...parsed);
        bytes += text.length;
      }
    } catch {
      /* a response that can't be read is simply not used */
    }
  });
  let resolveAction;
  const action = new Promise((r) => {
    resolveAction = r;
  });
  await page.exposeBinding('__almCapture', (_source, a) => resolveAction(String(a)));
  await page.addInitScript(overlayScript, { brandName, platformName: PLATFORM_NAMES[platform] || platform, hint: HINTS[platform] || '' });
  await page.bringToFront().catch(() => {});
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => log(`The page is slow to load: ${e.message}`));

  const snapshot = async () => {
    const dom = await page.evaluate(domExtractor, platform).catch(() => ({ posts: [], profile: {} }));
    const embedded = await page
      .evaluate(() => [...document.querySelectorAll('script[type="application/json"]')].map((s) => s.textContent).filter((t) => t && t.length < 3e6 && /like_count|taken_at|numLikes|favorite_count|reaction_count/.test(t)))
      .catch(() => []);
    const json = extractFromJson(platform, [...bodies, ...embedded.flatMap(parseJsonBodies)], { handle });
    return mergeExtractions(platform, [json, dom]);
  };
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const merged = await snapshot();
      const dated = merged.posts.filter((p) => p.date);
      const oldestDays = dated.length ? Math.floor((Date.now() - Date.parse(dated[dated.length - 1].date)) / 86_400_000) : null;
      await page.evaluate((s) => window.__almUpdate && window.__almUpdate(s), { posts: merged.posts.length, dated: dated.length, oldestDays, followers: merged.profile.followers ?? null, loginWall: LOGIN_URL.test(page.url()) });
    } catch {
      /* the page may be navigating */
    } finally {
      busy = false;
    }
  }, 2500);
  const timeout = setTimeout(() => resolveAction('timeout'), timeoutMs);
  page.on('close', () => resolveAction('cancel'));
  const result = await action;
  clearInterval(timer);
  clearTimeout(timeout);

  let capture = null;
  if (result === 'done' && !page.isClosed()) {
    const merged = await snapshot();
    mkdirSync(shotsDir, { recursive: true });
    await page.evaluate(() => window.__almHide && window.__almHide()).catch(() => {});
    const shots = [];
    const shot = async (name) => {
      const file = join(shotsDir, `${fileBase}-${name}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 70 }).catch(() => null);
      shots.push(file);
    };
    await shot('where-you-stopped');
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(900);
    await shot('top');
    capture = { platform, url: page.url(), requestedUrl: url, method: 'assisted (research browser)', status: merged.posts.length ? 'ok' : 'partial', capturedAt: new Date().toISOString(), profile: merged.profile, posts: merged.posts, limit: null, shots, dataResponses: bodies.length };
    log(`Recorded ${merged.posts.length} posts from ${bodies.length} data responses`);
  }
  if (!page.isClosed()) await page.close().catch(() => {});
  return { action: result, capture };
}
