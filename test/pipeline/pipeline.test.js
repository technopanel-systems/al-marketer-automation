// End-to-end pipeline test without Claude: AI outputs are supplied as files, everything else runs for real
// (record, gates, rule engine, content checks, rendering, change tracking).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const root = mkdtempSync(join(tmpdir(), 'alm-pipeline-'));
process.env.ALM_CLIENTS_DIR = root;
process.env.ALM_AI_MODE = 'files';

const { clientPaths, addTextSource, save, load } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { computeState, recordStepResult, inputFingerprint, outputHash } = await import('../../pipeline/steps.js');
const { runStep, runAuto, engineContext } = await import('../../pipeline/run.js');
const { saveGate1, approveGate1, saveGate2Edits, approveGate2, approveGate3, markSent, requestRevision } = await import('../../pipeline/gates.js');
const { saveAnswer } = await import('../../pipeline/steps/record.js');
const { hashOf } = await import('../../engine/util/data.js');

const slug = 'test-client';
let p;
const ctx = engineContext();
const state = () => computeState(slug, ctx);

// Marks an AI step as done with the files already written (stands in for a real AI run).
function fakeAiDone(stepId) {
  const status = load(p.status, { steps: {} });
  recordStepResult(p, stepId, { state: 'done', summary: 'fake', inputHash: hashOf(inputFingerprint(p, stepId, { ...ctx, status })), outputHash: outputHash(p, stepId) });
}

before(() => {
  const notes = readFileSync(join(repo, 'samples', 'hijab-store', 'meeting-notes.md'), 'utf8');
  createClient({ slug, name: 'Hijab Store', presentedTo: 'م. سامح — Hijab Store', market: 'Saudi Arabia', notes });
  p = clientPaths(slug);
});
after(() => rmSync(root, { recursive: true, force: true }));

test('a new client is "received" and the first step is collect', () => {
  const s = state();
  assert.equal(s.blueprintStatus, 'received');
  assert.equal(s.nextStep, 'collect');
});

test('collect (no website) and fake notes/research lead to a record with blocking questions', async () => {
  const r = await runStep(slug, 'collect', { ctx });
  assert.equal(r.ok, true, r.error);
  const n = addTextSource(p, { kind: 'notes', url: 'inputs/meeting-notes.md', title: 'Meeting notes', text: readFileSync(p.notes, 'utf8') });
  save(join(p.researchDir, 'notes.json'), { notesSourceId: n.id, facts: [{ field: 'products_services', value: 'ملابس محتشمة', quote: 'شغال في الملابس المحتشمة', evidenceId: n.id, confidence: 'high' }], readiness: [], languageHint: 'ar', rejected: [] });
  fakeAiDone('notes');
  for (const team of ['business', 'brand', 'channels']) save(join(p.researchDir, `${team}.json`), { team, facts: [], rejected: [], unknown: [] });
  save(join(p.researchDir, 'summary.json'), { teams: {} });
  fakeAiDone('research');
  const rec = await runStep(slug, 'record', { ctx });
  assert.equal(rec.ok, true, rec.error);
  const s = state();
  assert.equal(s.needsInput, true);
  assert.equal(s.blueprintStatus, 'needs-input');
  const stop = await runAuto(slug);
  assert.equal(stop.reason, 'questions need your answers');
});

test('answering questions unblocks, and the answers become human evidence', async () => {
  const q = load(p.questions).questions.filter((x) => x.blocking);
  for (const x of q) saveAnswer(p, x.id, x.kind === 'language' ? 'ar' : 'إجابة من الفريق للاختبار');
  assert.equal(state().steps.record.state, 'stale', 'record is stale after new answers');
  await runStep(slug, 'record', { ctx });
  assert.equal(state().needsInput, false);
  const sources = load(p.sources);
  assert.ok(sources.some((s) => s.kind === 'human'));
});

test('diagnosis → Gate 1: unverified problems cannot be confirmed without a note', async () => {
  const notesId = load(p.sources).find((s) => s.kind === 'notes').id;
  const ev = (quote) => [{ evidenceId: notesId, quote, kind: 'notes' }];
  const problem = (id, type, sev, title, quote) => ({ id, key: id, title_ar: title, statement_ar: `${title} — وصف المشكلة للاختبار.`, problemType: type, severity: sev, severityReason: 'test', evidence: quote ? ev(quote) : [], failedEvidence: [], evidenceStatus: quote ? 'verified' : 'unverified', flags: [], impacts: [{ category: 'trust', explanation_ar: 'أثر للاختبار على الثقة' }], review: { verdict: 'confirmed', reason: 'test' } });
  const diagnosis = {
    problems: [
      problem('P1', 'brand_identity_inconsistent', 3, 'طريقة ظهور البراند غير متناسقة', 'طريقة ظهور البراند مختلفة بين الموقع والسوشيال'),
      problem('P2', 'offer_structure_unclear', 2, 'تنظيم وتقديم المنتجات غير موحد', 'فيه منتجات معتمدة على أكواد'),
      problem('P3', 'paid_meta_gap', 2, 'مفيش إعلانات منظمة للسوق السعودي', 'مفيش حملات إعلانية شغالة موجهة للسعودية'),
      problem('P4', 'low_third_party_reach', 1, 'مشكلة بدون دليل', null),
    ],
    observations: [],
    missingInfo: [],
  };
  save(p.diagnosis.replace('problems.json', 'diagnosis-raw.json'), diagnosis);
  save(p.diagnosis, diagnosis);
  fakeAiDone('diagnose');
  fakeAiDone('review');
  assert.equal(state().nextStep, 'gate1');
  saveGate1(p, { decisions: { P1: { decision: 'confirmed' }, P2: { decision: 'confirmed' }, P3: { decision: 'confirmed' }, P4: { decision: 'confirmed' } } });
  const denied = approveGate1(p, state().steps.review.outputHash);
  assert.equal(denied.ok, false);
  assert.match(denied.errors.join(), /P4: has no verified evidence/);
  saveGate1(p, { decisions: { P4: { decision: 'rejected' } } });
  assert.equal(approveGate1(p, state().steps.review.outputHash).ok, true);
  assert.equal(state().steps.gate1.state, 'approved');
});

test('plan → Gate 2 → the rule engine output passes all scope checks', async () => {
  const stop = await runAuto(slug);
  assert.equal(stop.stoppedAt, 'gate2');
  const scope = load(p.scope);
  assert.deepEqual(scope.groups.map((g) => g.serviceId), ['svc.product_portfolio_management', 'svc.brand_management', 'svc.marketing_management', 'svc.performance_marketing']);
  assert.ok(load(join(p.planDir, 'plan-summary.json')).ok);
  assert.equal(approveGate2(p, state().steps.plan.outputHash, true).ok, true);
  assert.equal(state().steps.gate2.state, 'approved');
});

test('Gate 2 edits after approval re-open the gate (no stale approvals)', async () => {
  saveGate2Edits(p, { phase: { 'svc.performance_marketing': 'P2' } });
  assert.notEqual(state().steps.gate2.state, 'approved');
  assert.equal(state().steps.plan.state, 'stale');
  await runStep(slug, 'plan', { ctx });
  assert.equal(load(p.scope).groups.find((g) => g.serviceId === 'svc.performance_marketing').phase, 'P2');
  saveGate2Edits(p, { phase: {} });
  await runStep(slug, 'plan', { ctx });
  assert.equal(approveGate2(p, state().steps.plan.outputHash, true).ok, true);
});

test('write (answer file) → automated reviews → render → Gate 3 → sent', async () => {
  const content = JSON.parse(readFileSync(join(repo, 'samples', 'hijab-store', 'content.json'), 'utf8'));
  delete content._comment;
  save(p.content, content);
  fakeAiDone('write');
  mkdirSync(p.aiRequestsDir, { recursive: true });
  writeFileSync(join(p.aiRequestsDir, 'language-review.answer.json'), JSON.stringify({ dialectConsistent: true, clarityForNonMarketer: 4, issues: [] }));
  const check = await runStep(slug, 'check', { ctx });
  assert.equal(check.ok, true, check.error);
  const review = load(p.review);
  assert.deepEqual(review.contentChecks.filter((c) => c.level === 'error' && !c.ok), [], JSON.stringify(review.contentChecks.filter((c) => !c.ok)));
  assert.equal(review.languageReview.clarityForNonMarketer, 4);
  const render = await runStep(slug, 'render', { ctx });
  assert.equal(render.ok, true, render.error);
  const report = load(join(p.draftDir, 'render-report.json'));
  assert.equal(report.pdfPages, report.slides.length);
  assert.ok(report.fontsLoaded);
  assert.equal(state().blueprintStatus, 'proposal-review');
  const approved = approveGate3(p, { renderHash: state().steps.render.outputHash, draftPdf: join(p.draftDir, 'proposal-draft.pdf'), draftHtml: join(p.draftDir, 'proposal-draft.html'), slug, checksOk: review.ok });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.ok(existsSync(join(p.outputDir, `${slug}-proposal-v1.pdf`)));
  assert.equal(state().blueprintStatus, 'approved');
  assert.equal(markSent(p, 'test').ok, true);
  assert.equal(state().blueprintStatus, 'sent');
});

test('a revision request after approval makes the writing stale again', () => {
  requestRevision(p, 'خلي العناوين أقصر');
  const s = state();
  assert.equal(s.steps.write.state, 'stale');
  assert.equal(s.steps.gate3.state, 'blocked');
});
