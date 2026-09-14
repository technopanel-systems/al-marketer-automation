// The renderer must report layout problems it cannot fix — Gate 3 refuses approval on them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadCatalogAndRules } from '../../engine/rules/load.js';
import { buildPlan } from '../../engine/plan/build.js';
import { assembleDeck } from '../../engine/proposal/assemble.js';
import { renderProposal } from '../../render/render.js';

const sample = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples', 'hijab-store');
const out = mkdtempSync(join(tmpdir(), 'alm-render-test-'));
after(() => rmSync(out, { recursive: true, force: true }));

// Repeats a phrase up to exactly n characters (the writer's schema maximum for that field).
const fill = (s, n) => `${s} `.repeat(Math.ceil(n / (s.length + 1))).slice(0, n).trim();

test('cover text at the writer\'s maximum lengths is reported as a layout problem, not silently accepted', async () => {
  const input = JSON.parse(readFileSync(join(sample, 'plan-input.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(sample, 'content.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  content.cover.eyebrow = fill('عرض فني لتجربة شراء أوضح وأسرع', 60);
  content.cover.accent = fill('في مصر والسعودية والإمارات', 40);
  content.cover.subtitle = fill('نخلي الطريق من التصفح للطلب أوضح وأسهل وأسرع للعميلة', 90);
  content.cover.lead = fill('براند قوي وجمهور كبير موجودين بالفعل، وإحنا هنرتّب الشحن والتواصل والاسم والأقسام عشان قرار الشراء يبقى أسهل', 180);
  const model = assembleDeck({ client: { ...input.client, displayName: 'Hayaa Fashion' }, content, plan });
  const { report } = await renderProposal(model, { outDir: out, baseName: 'overflow' });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => i.section === 'cover' && i.type === 'overflow'), JSON.stringify(report.issues));
});

test('the overflow detector flags content that runs past the footer or the side margins', async () => {
  const { chromium } = await import('playwright');
  const { measure } = await import('../../render/render.js');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const slide = (inner) => `<section class="slide" data-section="business" style="position:relative;width:1600px;height:900px;overflow:hidden;font-size:20px">${inner}<div class="footer" style="position:absolute;left:96px;right:96px;top:840px;height:30px"></div></section>`;
    const html = `<!doctype html><html><body style="margin:0">${slide('<div class="card" style="position:absolute;left:96px;top:100px;width:600px;height:200px">fits</div>')}${slide('<div class="card" style="position:absolute;left:96px;top:700px;width:600px;height:200px">runs past the footer</div>')}${slide('<div class="card" style="position:absolute;left:1500px;top:100px;width:400px;height:100px">past the right margin</div>')}</body></html>`;
    const { slides } = await measure(page, html, out);
    assert.deepEqual(slides[0].issues.filter((i) => i.type === 'overflow'), []);
    assert.ok(slides[1].issues.some((i) => i.type === 'overflow'), JSON.stringify(slides[1].issues));
    assert.ok(slides[2].issues.some((i) => i.type === 'overflow'), JSON.stringify(slides[2].issues));
  } finally {
    await browser.close();
  }
});
