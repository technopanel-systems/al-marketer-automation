// The real AI steps (prompt → schema → checks → evidence verification), fed with saved answers instead of Claude.
// These protect the constitutional rule "code verifies every quote": an invented quote must never survive.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-ai-steps-'));
process.env.ALM_CLIENTS_DIR = root;
process.env.ALM_AI_MODE = 'files';

const { clientPaths, addTextSource, save } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { runNotesStep } = await import('../../ai/steps/notes.js');
const { runDiagnoseStep } = await import('../../ai/steps/diagnose.js');
const { AiPendingError } = await import('../../ai/runner.js');
const { loadRules } = await import('../../engine/rules/load.js');

const NOTES = '- البراند مصري، شغال في الملابس المحتشمة.\n- عندهم حاليًا حوالي 28 منتج.\n- مفيش حملات إعلانية شغالة موجهة للسعودية حاليًا.';
const PAGE = 'Hayaa Fashion. Free Shipping for orders above LE 5000. Returns within 30 days. Cairo branch: 01002805561.';
let p;
let page;
const rules = loadRules();
const answer = (step, obj) => {
  mkdirSync(p.aiRequestsDir, { recursive: true });
  writeFileSync(join(p.aiRequestsDir, `${step}.answer.json`), JSON.stringify(obj));
};

before(() => {
  createClient({ slug: 'steps', name: 'Test Client', notes: NOTES, market: 'Egypt' });
  p = clientPaths('steps');
  page = addTextSource(p, { kind: 'website', url: 'https://example.com/', title: 'Home', text: PAGE });
  save(p.record, { client: {}, language: { value: 'ar' }, sections: { business: {}, brand: {}, channels: {} }, factCount: 0, fieldsFilled: 0, fieldsTotal: 0 });
});
after(() => rmSync(root, { recursive: true, force: true }));

test('notes: facts with invented quotes are dropped and recorded as rejected', async () => {
  answer('notes', {
    facts: [
      { field: 'positioning', value: 'براند مصري في الملابس المحتشمة', quote: 'البراند مصري، شغال في الملابس المحتشمة' },
      { field: 'product_count', value: 'حوالي 28 منتج', quote: 'عندهم حاليًا حوالي 28 منتج' },
      { field: 'locations', value: 'عندهم 3 فروع في الإسكندرية', quote: 'عندهم 3 فروع في الإسكندرية' },
    ],
    readiness: [],
    languageHint: 'ar',
  });
  const r = await runNotesStep(p, { name: 'Test Client' });
  assert.deepEqual(r.facts.map((f) => f.field), ['positioning', 'product_count']);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].field, 'locations');
});

test('notes: an attached meeting report is a second source; each quote is checked against the file it came from', async () => {
  mkdirSync(p.filesDir, { recursive: true });
  writeFileSync(join(p.filesDir, 'تقرير.docx'), 'binary');
  writeFileSync(join(p.filesDir, 'تقرير.docx.extracted.txt'), 'تقرير الاجتماع: الميزانية الشهرية للإعلانات 20 ألف ريال.\nالعميل عنده صور جاهزة لكل المنتجات.');
  answer('notes', {
    facts: [
      { field: 'positioning', value: 'براند مصري', quote: 'البراند مصري، شغال في الملابس المحتشمة', sourceId: 'N001' },
      { field: 'goals', value: 'ميزانية إعلانات', quote: 'الميزانية الشهرية للإعلانات 20 ألف ريال', sourceId: 'N001' },
      { field: 'goals', value: 'مختلق', quote: 'العميل يريد فتح فرع في دبي', sourceId: 'N002' },
    ],
    readiness: [{ key: 'content_assets', value: 'yes', quote: 'العميل عنده صور جاهزة لكل المنتجات', sourceId: 'N002' }],
    languageHint: 'ar',
  });
  const r = await runNotesStep(p, { name: 'Test Client' });
  assert.equal(r.sourceIds.length, 2);
  assert.equal(r.model, 'sonnet', 'a meeting report uses the stronger model');
  const report = r.sourceIds[1];
  assert.equal(r.facts.find((f) => f.quote.startsWith('الميزانية')).evidenceId, report, 'a quote cited from the wrong block still resolves to the file that contains it');
  assert.equal(r.readiness[0].evidenceId, report);
  assert.equal(r.rejected.length, 1, 'a quote in neither source is rejected');
  rmSync(p.filesDir, { recursive: true, force: true });
});

test('diagnose: an invented citation is removed from the evidence and kept as a failed citation', async () => {
  answer('diagnose', {
    problems: [
      {
        key: 'P1', title_ar: 'سياسة الشحن المجاني مش واضحة', statement_ar: 'الشحن المجاني بشرط حد أدنى للطلب ومش ظاهر للعميلة من بدري.', problemType: 'weak_conversion_path', severity: 2, severityReason: 'test',
        evidence: [{ evidenceId: page.id, quote: 'Free Shipping for orders above LE 5000' }, { evidenceId: page.id, quote: 'Free shipping on every order nationwide' }],
        impacts: [{ category: 'conversion', explanation_ar: 'العميلة بتتفاجئ بتكلفة الشحن في آخر خطوة.' }],
      },
    ],
    observations: [],
    missingInfo: [],
  });
  await runDiagnoseStep(p, { name: 'Test Client', market: 'Egypt' }, rules, {});
  const d = JSON.parse(readFileSync(p.diagnosis, 'utf8'));
  const p1 = d.problems[0];
  assert.equal(p1.evidenceStatus, 'verified');
  assert.deepEqual(p1.evidence.map((e) => e.quote), ['Free Shipping for orders above LE 5000']);
  assert.equal(p1.failedEvidence.length, 1);
  assert.match(p1.failedEvidence[0].reason, new RegExp(page.id));
});

test('diagnose: a problem whose only citation is invented rejects the whole answer and asks again', async () => {
  answer('diagnose', {
    problems: [
      {
        key: 'P1', title_ar: 'مفيش فروع في الإسكندرية', statement_ar: 'العميلات في الإسكندرية مش لاقيين فرع يجربوا فيه قبل الشراء.', problemType: 'unmapped', severity: 1, severityReason: 'test',
        evidence: [{ evidenceId: page.id, quote: 'We have 3 branches in Alexandria' }],
        impacts: [{ category: 'conversion', explanation_ar: 'العميلة اللي عايزة تجرب قبل ما تشتري بتتردد.' }],
      },
    ],
    observations: [],
    missingInfo: [],
  });
  await assert.rejects(() => runDiagnoseStep(p, { name: 'Test Client', market: 'Egypt' }, rules, {}), AiPendingError);
  const request = readFileSync(join(p.aiRequestsDir, 'diagnose.request.md'), 'utf8');
  assert.match(request, /previous_attempt_problems/);
  assert.match(request, /P1: none of its citations could be verified/);
  assert.ok(readdirSync(p.aiRequestsDir).some((f) => f.startsWith('diagnose.rejected-')));
});

test('diagnose: a citation of a check that does not exist is not accepted', async () => {
  answer('diagnose', {
    problems: [
      {
        key: 'P1', title_ar: 'مفيش بيكسل على الموقع', statement_ar: 'الموقع مش عليه أداة قياس للإعلانات، فمش هنعرف أي إعلان جاب مبيعات.', problemType: 'measurement_missing', severity: 1, severityReason: 'test',
        evidence: [{ evidenceId: 'K999', quote: '' }],
        impacts: [{ category: 'operations', explanation_ar: 'مفيش طريقة نعرف بيها الإعلان اللي جاب البيع.' }],
      },
    ],
    observations: [],
    missingInfo: [],
  });
  await assert.rejects(() => runDiagnoseStep(p, { name: 'Test Client', market: 'Egypt' }, rules, {}), AiPendingError);
  assert.match(readFileSync(join(p.aiRequestsDir, 'diagnose.request.md'), 'utf8'), /check K999 does not exist/);
});
