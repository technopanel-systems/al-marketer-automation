// The client's logo for the proposal: downloaded from the chosen candidate (or uploaded), drawn in Chromium so SVG, WebP,
// AVIF and ICO all work, trimmed to its content, a plain white/solid background made transparent, saved as PNG.
// Also records whether the logo is mostly dark or light, so slides can put it on a matching box.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { save } from '../pipeline/client.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_BYTES = 5 * 1024 * 1024;

const sniff = (buf, hint = '') => {
  const head = buf.subarray(0, 64).toString('latin1');
  if (buf[0] === 0x89 && head.startsWith('\x89PNG')) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (head.startsWith('GIF8')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (head.slice(4, 12).includes('ftypavif')) return 'image/avif';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon';
  if (/<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8')) || /svg/i.test(hint)) return 'image/svg+xml';
  return '';
};

export async function downloadImage(url, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/svg+xml,image/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the image did not download (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('the image is larger than 5 MB');
  const type = sniff(buf, res.headers.get('content-type') || url);
  if (!type) throw new Error('that link is not an image');
  return { buf, type };
}

// Runs in the page: trim, clear a solid background, measure tone, return a PNG data URL.
function processInPage({ src, maxSide }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || 600;
      const h0 = img.naturalHeight || 300;
      const scale = Math.min(1, maxSide / Math.max(w0, h0)) || 1;
      const w = Math.max(1, Math.round(w0 * (w0 < 200 && h0 < 200 ? Math.min(4, maxSide / Math.max(w0, h0)) : scale)));
      const h = Math.max(1, Math.round((h0 / w0) * w));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h);
      const px = data.data;
      const at = (x, y) => (y * w + x) * 4;
      let transparent = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) transparent++;
      const hasAlpha = transparent > px.length / 4 / 50;
      // A logo on a solid background (JPG, white PNG): if the four corners share a colour, clear that colour.
      let clearedBackground = false;
      if (!hasAlpha) {
        const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)].map((i) => [px[i], px[i + 1], px[i + 2]]);
        const [r, gg, b] = corners[0];
        const same = corners.every(([cr, cg, cb]) => Math.abs(cr - r) + Math.abs(cg - gg) + Math.abs(cb - b) < 30);
        if (same) {
          for (let i = 0; i < px.length; i += 4) {
            const d = Math.abs(px[i] - r) + Math.abs(px[i + 1] - gg) + Math.abs(px[i + 2] - b);
            if (d < 24) px[i + 3] = 0;
            else if (d < 60) px[i + 3] = Math.min(px[i + 3], Math.round(((d - 24) / 36) * 255));
          }
          clearedBackground = true;
        }
      }
      let minX = w, minY = h, maxX = -1, maxY = -1, lum = 0, count = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = at(x, y);
          if (px[i + 3] > 24) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) * (px[i + 3] / 255);
            count += px[i + 3] / 255;
          }
        }
      }
      if (maxX < 0) return reject(new Error('the image is empty'));
      g.putImageData(data, 0, 0);
      const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
      const cw = Math.min(w, maxX - minX + 1 + pad * 2);
      const ch = Math.min(h, maxY - minY + 1 + pad * 2);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d').drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), cw, ch, 0, 0, cw, ch);
      resolve({ png: out.toDataURL('image/png'), width: cw, height: ch, luminance: count ? Math.round(lum / count) : 0, clearedBackground, hadTransparency: hasAlpha });
    };
    img.onerror = () => reject(new Error('the image could not be drawn'));
    img.src = src;
  });
}

// → { width, height, tone: 'dark' | 'light', ... } and writes p.logo (PNG) + p.logoInfo.
export async function saveClientLogo(p, { url = '', buf = null, type = '', source = '', filename = '' }, { browser = null, fetchImpl = fetch } = {}) {
  if (!buf) ({ buf, type } = await downloadImage(url, { fetchImpl }));
  type = type || sniff(buf, filename);
  if (!type) throw new Error('that file is not an image (PNG, JPG, SVG, WebP or ICO)');
  const own = !browser;
  if (own) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  }
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(processInPage, { src: `data:${type};base64,${buf.toString('base64')}`, maxSide: 900 });
    await page.close();
    const png = Buffer.from(r.png.split(',')[1], 'base64');
    mkdirSync(dirname(p.logo), { recursive: true });
    writeFileSync(p.logo, png);
    const info = { source: source || (url ? 'website' : 'uploaded'), url: url || null, filename: filename || null, width: r.width, height: r.height, luminance: r.luminance, tone: r.luminance > 170 ? 'light' : 'dark', clearedBackground: r.clearedBackground, at: new Date().toISOString() };
    save(p.logoInfo, info);
    return info;
  } finally {
    if (own) await browser.close();
  }
}
