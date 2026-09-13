// Collector tests against a local page (no internet): capture, internal page picking, tech detection, checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pickInternalPages, runCollect } from '../../collect/site.js';
import { classifySocialUrl, pickSocialProfiles } from '../../collect/social.js';
import { detectTech } from '../../collect/tech.js';

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home.html'), 'utf8');
let server;
let base;
let root;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.end('User-agent: *');
    if (req.url === '/sitemap.xml') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url === '/' ? fixture : `<!doctype html><html><head><title>${req.url}</title></head><body><h1>صفحة ${req.url}</h1><p>الشحن خلال ٣ أيام عمل.</p></body></html>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  root = mkdtempSync(join(tmpdir(), 'alm-collect-'));
});
after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

test('social URLs are classified and share/intent links are ignored', () => {
  assert.equal(classifySocialUrl('https://www.instagram.com/test.store/?hl=ar').url, 'https://www.instagram.com/test.store');
  assert.equal(classifySocialUrl('https://www.facebook.com/sharer/sharer.php?u=x'), null);
  assert.equal(classifySocialUrl('https://www.tiktok.com/tag/abaya'), null);
  assert.equal(classifySocialUrl('https://www.tiktok.com/@teststore').platform, 'tiktok');
  const picked = pickSocialProfiles(['https://instagram.com/from.intake'], ['https://www.instagram.com/from.site', 'https://www.tiktok.com/@x']);
  assert.deepEqual(picked.map((p) => [p.platform, p.source]), [['instagram', 'intake'], ['tiktok', 'website']]);
});

test('internal pages are picked by keyword, one per kind, skipping cart and external links', () => {
  const links = [
    { href: 'https://shop.test/cart', text: 'السلة' },
    { href: 'https://shop.test/products', text: 'كل المنتجات' },
    { href: 'https://shop.test/products/abaya', text: 'عباية' },
    { href: 'https://shop.test/pages/about-us', text: 'من نحن' },
    { href: 'https://other.test/about', text: 'about' },
    { href: 'https://shop.test/collections/new', text: 'جديد' },
  ];
  const picked = pickInternalPages('https://shop.test/', links);
  assert.deepEqual(picked.map((p) => p.kinds[0]), ['products', 'product', 'about']);
});

test('tech detection finds platform and pixels from html and requests', () => {
  const { detected } = detectTech([{ url: 'x', html: '<script src="https://cdn.zid.store/a.js"></script>', requests: ['https://connect.facebook.net/en_US/fbevents.js'], headers: {} }]);
  const ids = detected.map((d) => d.id);
  assert.ok(ids.includes('zid'));
  assert.ok(ids.includes('meta_pixel'));
  assert.ok(!ids.includes('tiktok_pixel'));
});

test('runCollect captures pages, saves evidence text and screenshots, and records checks', async () => {
  const { clientPaths } = await import('../../pipeline/client.js');
  process.env.ALM_CLIENTS_DIR = root;
  const p = { ...clientPaths('x'), dir: join(root, 'x') };
  for (const k of Object.keys(p)) if (typeof p[k] === 'string') p[k] = p[k].replace(clientPaths('x').dir, p.dir);
  const summary = await runCollect(p, { name: 'متجر تجربة', website: base, socials: [], market: 'مصر' }, { pageSpeed: false, captureSocial: false });
  assert.equal(summary.website.status, 'ok');
  assert.ok(summary.pages.length >= 4, `pages: ${summary.pages.length}`);
  const sources = JSON.parse(readFileSync(p.sources, 'utf8'));
  const home = readFileSync(join(p.pagesDir, `${sources[0].id}.txt`), 'utf8');
  assert.match(home, /أكثر من ٢٨ منتج/);
  assert.ok(existsSync(join(p.dir, sources[0].screenshot)));
  const checks = JSON.parse(readFileSync(p.checks, 'utf8'));
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
  assert.equal(byKey.tech_meta_pixel.result, 'present');
  assert.equal(byKey.tech_tiktok_pixel.result, 'absent');
  assert.equal(byKey.tech_whatsapp_link.result, 'present');
  assert.match(byKey.tech_platform.value, /Zid/);
  assert.equal(byKey.seo_meta_description.result, 'absent');
  assert.equal(byKey.seo_h1.result, 'present');
  assert.equal(byKey.social_instagram.result, 'present');
  assert.equal(byKey.social_snapchat.result, 'absent');
  assert.equal(byKey.manual_meta_ad_library.by, 'you');
});
