#!/usr/bin/env node
// Builds render/assets/brand/cover-art.jpg: the cover's sun gradient and mascot drawn once, flattened into one opaque
// image at 2x. A transparent PNG laid over a CSS gradient leaves a faint line at the image edge in some PDF viewers
// (seen in Edge's viewer); one opaque picture has no edge to show. Run again only if the mascot or the sun changes:
//   node render/build-cover-art.js
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'brand');
const mascot = `data:image/png;base64,${readFileSync(join(DIR, 'mascot.png')).toString('base64')}`;

// Same geometry as the cover slide (1600 × 900 CSS px).
const html = `<!doctype html><html><body style="margin:0">
<div style="position:relative;width:1600px;height:900px;overflow:hidden;background:#070808">
  <div style="position:absolute;left:-260px;top:-330px;width:1250px;height:1250px;border-radius:50%;background:radial-gradient(circle at 48% 45%, #FFE3A0 0%, #FFB347 16%, #F07A2E 33%, #D2401A 48%, rgba(120,25,8,.55) 62%, rgba(7,8,8,0) 74%)"></div>
  <img src="${mascot}" style="position:absolute;left:90px;bottom:-8px;height:700px">
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  const jpg = await page.locator('div').first().screenshot({ type: 'jpeg', quality: 92 });
  writeFileSync(join(DIR, 'cover-art.jpg'), jpg);
  console.log(`cover-art.jpg written (${Math.round(jpg.length / 1024)} KB, 3200 × 1800)`);
} finally {
  await browser.close();
}
