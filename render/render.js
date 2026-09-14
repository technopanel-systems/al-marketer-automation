// Renders a DeckModel to PDF + self-contained web HTML, measuring every slide for overflow and small text.
// Overflowing sections are re-laid out with fewer items per slide (never smaller text — Blueprint p.65).
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildDeck, DEFAULT_LAYOUT } from './deck.js';

const MIN_FONT_PX = 14;
const ALLOWED_TEXT_PER_SLIDE = 6; // strong elements (cards, weeks, months, rows) per slide

// Runs inside the page: returns per-slide measurements.
function measureInPage({ minFont }) {
  const slides = [...document.querySelectorAll('.slide')];
  return slides.map((slide, i) => {
    const sr = slide.getBoundingClientRect();
    const footer = slide.querySelector('.footer');
    const bottomLimit = footer ? footer.getBoundingClientRect().top - 6 : sr.bottom;
    const issues = [];
    const skip = (el) => el.closest('.footer, .glow, .sun, .eyebrow') || el.classList.contains('mascot') || el.classList.contains('logo');
    for (const el of slide.querySelectorAll('*')) {
      if (skip(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom > bottomLimit + 1 || r.left < sr.left + 40 || r.right > sr.right - 40) {
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText || el.matches('.card, .week, .month, .row-card, .pillar, .stat, .bar, .note, .chip')) {
          issues.push({ type: 'overflow', tag: el.tagName.toLowerCase(), cls: el.className, text: el.textContent.trim().slice(0, 60), bottom: Math.round(r.bottom - sr.top), limit: Math.round(bottomLimit - sr.top) });
        }
      }
      if (el.matches('.card, .week, .month, .pillar') && el.scrollHeight > el.clientHeight + 2) {
        issues.push({ type: 'clipped', cls: el.className, text: el.textContent.trim().slice(0, 60) });
      }
    }
    let smallest = 999;
    for (const el of slide.querySelectorAll('*')) {
      if (skip(el)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < smallest) smallest = size;
    }
    if (smallest < minFont) issues.push({ type: 'small_font', size: smallest });
    if (slide.dataset.section === 'cover') {
      const content = slide.querySelector('.content')?.getBoundingClientRect();
      const logo = slide.querySelector('.logo')?.getBoundingClientRect();
      if (content && logo && content.top < logo.bottom + 20) issues.push({ type: 'overflow', cls: 'content', text: 'cover text reaches the logo', bottom: Math.round(content.top - sr.top), limit: Math.round(logo.bottom - sr.top + 20) });
    }
    const strong = slide.querySelectorAll('.card, .week, .month, .row-card, .pillar').length;
    return { index: i + 1, section: slide.dataset.section, issues, smallestFont: smallest, strongElements: strong };
  });
}

export async function measure(page, html, workDir) {
  const file = join(workDir, 'deck.html');
  writeFileSync(file, html, 'utf8');
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({ arabic: document.fonts.check('800 40px "Noto Sans Arabic"', 'مرحبا'), latin: document.fonts.check('700 40px Manrope', 'Aa') }));
  const slides = await page.evaluate(measureInPage, { minFont: MIN_FONT_PX });
  return { file, fonts, slides };
}

// First try a denser layout of the same slide; only then spread the section over more slides. Never smaller text.
const SHRINK = {
  cover: (L) => (!L.coverCompact ? { coverCompact: true } : null),
  business: (L) => (L.business !== 'split' ? { business: 'split' } : null),
  brand: (L) => (L.brand !== 'split' ? { brand: 'split' } : null),
  tracking: (L) => (!L.trackingCompact ? { trackingCompact: true } : null),
  problems: (L) => (L.problemsVariant !== 'rows' ? { problemsVariant: 'rows' } : L.problems > 1 ? { problems: L.problems - 1 } : null),
  impact: (L) => (L.impact > 1 ? { impact: L.impact - 1 } : null),
  solutions: (L) => (L.solutions > 1 ? { solutions: L.solutions - 1 } : null),
  expected: (L) => (!L.expectedCompact ? { expectedCompact: true } : L.expected > 1 ? { expected: L.expected - 1 } : null),
  map: (L) => (L.mapItems > 4 ? { mapItems: L.mapItems - 2 } : null),
  weeks: (L) => (L.weekItems > 3 ? { weekItems: 3 } : null),
  kpis: (L) => (L.kpis > 1 ? { kpis: L.kpis - 1 } : null),
};

/**
 * @returns {Promise<{ pdf, web, slides, layout, report }>}
 */
export async function renderProposal(model, { outDir, baseName, previews = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  const workDir = join(tmpdir(), `alm-render-${process.pid}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    let layout = { ...DEFAULT_LAYOUT };
    let built;
    let measured;
    for (let attempt = 1; attempt <= 10; attempt++) {
      built = buildDeck(model, layout);
      measured = await measure(page, built.html, workDir);
      const bad = [...new Set(measured.slides.filter((s) => s.issues.some((x) => x.type !== 'small_font')).map((s) => s.section))];
      const changes = bad.map((section) => SHRINK[section]?.(layout)).filter(Boolean);
      if (process.env.ALM_RENDER_DEBUG) console.error(`render attempt ${attempt}`, JSON.stringify(layout), JSON.stringify(measured.slides.flatMap((s) => s.issues.slice(0, 2).map((x) => ({ slide: s.index, section: s.section, ...x })))));
      if (bad.length === 0 || changes.length === 0) break;
      layout = Object.assign({ ...layout }, ...changes);
    }

    const pdf = join(outDir, `${baseName}.pdf`);
    await page.pdf({ path: pdf, width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true });
    const pdfPages = (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

    const web = join(outDir, `${baseName}.html`);
    writeFileSync(web, built.html.replace('<body>', '<body class="web">'), 'utf8');

    const previewFiles = [];
    if (previews) {
      const dir = join(outDir, 'previews');
      rmSync(dir, { recursive: true, force: true }); // old previews from a longer deck must not linger
      mkdirSync(dir, { recursive: true });
      const slideEls = await page.$$('.slide');
      for (let i = 0; i < slideEls.length; i++) {
        const f = join(dir, `${baseName}-slide-${String(i + 1).padStart(2, '0')}.png`);
        await slideEls[i].screenshot({ path: f, scale: 'css' });
        previewFiles.push(f);
      }
    }

    const problems = measured.slides.flatMap((s) => s.issues.map((i) => ({ slide: s.index, section: s.section, ...i })));
    const report = {
      slides: built.slides.length,
      pdfPages,
      fontsLoaded: measured.fonts.arabic && measured.fonts.latin,
      layout,
      issues: problems,
      tooManyElements: measured.slides.filter((s) => s.section !== 'cover' && s.strongElements > ALLOWED_TEXT_PER_SLIDE).map((s) => s.index),
      smallestFont: Math.min(...measured.slides.map((s) => s.smallestFont)),
      ok: false,
    };
    report.ok = report.fontsLoaded && report.issues.length === 0 && report.pdfPages === report.slides && report.tooManyElements.length === 0;
    return { pdf, web, slides: built.slides, layout, report, previews: previewFiles };
  } finally {
    await browser.close();
    rmSync(workDir, { recursive: true, force: true });
  }
}
