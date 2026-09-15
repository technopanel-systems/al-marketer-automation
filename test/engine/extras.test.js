// Proposal v2 sections built by code: executive summary, website audit, next steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summaryModel, auditModel, nextStepsModel } from '../../engine/proposal/extras.js';
import { loadCatalogAndRules } from '../../engine/rules/load.js';
import { buildPlan } from '../../engine/plan/build.js';
import { assembleDeck } from '../../engine/proposal/assemble.js';
import { buildDeck } from '../../render/deck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = join(root, 'samples', 'hijab-store');
const input = JSON.parse(readFileSync(join(sample, 'plan-input.json'), 'utf8'));
const content = JSON.parse(readFileSync(join(sample, 'content.json'), 'utf8'));
const { catalog, rules } = loadCatalogAndRules();
const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });

const check = (key, result, value = '') => ({ key, result, value, at: '2026-09-14T09:00:00.000Z' });
const websiteChecks = [
  check('website_reachable', 'value', 'yes (HTTP 200)'),
  check('psi_mobile', 'value', 'performance 61/100, SEO 92/100, accessibility 91/100'),
  check('perf_mobile_lcp', 'value', '8.0 s — poor (2 MB downloaded)'),
  check('seo_https', 'present'), check('seo_meta_description', 'present'), check('seo_h1', 'absent'), check('seo_noindex', 'absent'),
  check('seo_image_alt', 'value', '9 of 101'),
  check('tech_ga4', 'present'), check('tech_meta_pixel', 'absent'), check('tech_whatsapp_link', 'present'),
];

test('website audit: statuses come from thresholds and check results, never from AI', () => {
  const a = auditModel(websiteChecks);
  const item = (label) => a.groups.flatMap((g) => g.items).find((i) => i.label === label);
  assert.deepEqual(item('تقييم Google PageSpeed'), { label: 'تقييم Google PageSpeed', value: '61/100', status: 'needs' });
  assert.equal(item('ظهور المحتوى الرئيسي').status, 'poor');
  assert.equal(item('ظهور المحتوى الرئيسي').value, '8 ثانية');
  assert.equal(item('عنوان رئيسي H1').status, 'needs');
  assert.equal(item('الصفحة مفتوحة لجوجل').status, 'good', 'no noindex means the page is open to Google');
  assert.equal(item('صور بدون وصف بديل').value, '9 من 101');
  assert.equal(item('بيكسل ميتا').value, 'غير موجود');
  assert.match(a.intro, /10 نقطة، منهم 5 محتاجين شغل/);
  assert.match(a.note, /14\/9\/2026/);
  // No website (or an unreachable one), or too few checks: no audit slide.
  assert.equal(auditModel([]), null);
  assert.equal(auditModel([check('website_reachable', 'unknown'), ...websiteChecks.slice(1)]), null);
  assert.equal(auditModel(websiteChecks.slice(0, 4)), null);
});

test('next steps ask only for what the client has not already confirmed, and ads items only when ads are in scope', () => {
  const noAds = { ...plan.scope, groups: plan.scope.groups.filter((g) => g.serviceId !== 'svc.performance_marketing') };
  const withAds = plan.scope.groups.some((g) => g.serviceId === 'svc.performance_marketing') ? plan.scope : { ...plan.scope, groups: [...plan.scope.groups, { serviceId: 'svc.performance_marketing' }] };
  const readiness = { ad_budget: { value: 'unknown' }, ad_account_access: { value: 'no' }, content_assets: { value: 'yes' }, tracking_installed: { value: 'no' } };
  const a = nextStepsModel({ scope: noAds, schedule: plan.schedule, readiness });
  assert.ok(!a.asks.some((x) => /الإعلانات/.test(x)), JSON.stringify(a.asks));
  assert.ok(!a.asks.includes('الصور والفيديوهات المتاحة عندكم'), 'content the client already has is not asked for');
  assert.ok(a.asks.includes('صلاحية تركيب أدوات القياس على الموقع'));
  const b = nextStepsModel({ scope: withAds, schedule: plan.schedule, readiness });
  assert.ok(b.asks.includes('تحديد ميزانية الإعلانات الشهرية'));
  assert.equal(a.steps.length, 3);
  assert.match(a.steps[2].text, /،|تسليمات/);
});

test('summary lists the confirmed problems in order and every service in scope; the deck places the new slides', () => {
  const s = summaryModel({ problems: content.problems.items, scope: plan.scope, schedule: plan.schedule });
  assert.deepEqual(s.findings, content.problems.items.slice(0, 4).map((x) => x.title));
  assert.equal(s.actions.length, Math.min(6, plan.scope.groups.length));
  assert.ok(s.start.startsWith('الأسبوع الأول: '));
  const model = assembleDeck({ client: input.client, content, plan, checks: websiteChecks, readiness: {} });
  const deck = buildDeck(model, {});
  const sections = [...new Set(deck.slides.map((x) => x.section))];
  assert.deepEqual(sections.slice(0, 4), ['cover', 'summary', 'business', 'brand']);
  assert.equal(sections[4], 'audit');
  assert.equal(sections.at(-1), 'next');
  assert.equal((deck.html.match(/class="audit-row /g) || []).length, 10);
});
