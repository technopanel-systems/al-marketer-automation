// Client logo: any image format becomes a trimmed PNG; a white background becomes transparent; tone is measured.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { saveClientLogo, downloadImage } from '../../collect/logo.js';

const dir = mkdtempSync(join(tmpdir(), 'alm-logo-'));
const p = { logo: join(dir, 'brand', 'logo.png'), logoInfo: join(dir, 'brand', 'logo.json') };
let browser;
before(async () => (browser = await chromium.launch()));
after(async () => {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
});
const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

test('an SVG logo with empty space around it is trimmed and saved as a dark logo', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect x="100" y="50" width="200" height="100" fill="#111111"/></svg>');
  const info = await saveClientLogo(p, { buf: svg, filename: 'logo.svg', source: 'uploaded' }, { browser });
  assert.ok(existsSync(p.logo));
  const { w, h } = pngSize(p.logo);
  assert.ok(w >= 200 && w <= 216 && h >= 100 && h <= 116, `trimmed to the mark (${w}x${h})`);
  assert.equal(info.tone, 'dark');
  assert.equal(info.clearedBackground, false);
});

test('a logo on a white background loses the white; a light logo is marked light; a non-image is refused', async () => {
  const page = await browser.newPage();
  const whiteBg = Buffer.from((await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 150;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 300, 150);
    g.fillStyle = '#ef4625';
    g.fillRect(60, 40, 180, 70);
    return c.toDataURL('image/jpeg', 0.95);
  })).split(',')[1], 'base64');
  await page.close();
  const info = await saveClientLogo(p, { buf: whiteBg, type: 'image/jpeg', source: 'website' }, { browser });
  assert.equal(info.clearedBackground, true);
  const { w } = pngSize(p.logo);
  assert.ok(w < 200, `the white area is gone (${w}px wide)`);
  const light = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="10" y="60" font-size="60" fill="#fcf6d4">LOGO</text></svg>');
  assert.equal((await saveClientLogo(p, { buf: light, filename: 'white.svg' }, { browser })).tone, 'light');
  await assert.rejects(saveClientLogo(p, { buf: Buffer.from('hello'), filename: 'notes.txt' }, { browser }), /not an image/);
  const fake = async () => new Response('<html>not an image</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(downloadImage('https://example.com/logo', { fetchImpl: fake }), /not an image/);
});
