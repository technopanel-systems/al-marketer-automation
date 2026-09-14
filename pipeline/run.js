// Runs pipeline steps for one client, records results and stops at gates, questions and failures.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { clientPaths, load, save } from './client.js';
import { STEPS, computeState, inputFingerprint, outputHash, recordStepResult, loadStatus } from './steps.js';
import { confirmedProblems } from './gates.js';
import { runRecordStep } from './steps/record.js';
import { runCollect } from '../collect/site.js';
import { runNotesStep } from '../ai/steps/notes.js';
import { runResearchStep } from '../ai/steps/research.js';
import { runDiagnoseStep, runReviewStep } from '../ai/steps/diagnose.js';
import { runCompetitorsStep } from '../ai/steps/competitors.js';
import { runSocialStep, loadBenchmarks } from './social.js';
import { runWriteStep, runLanguageReview, writerContext } from '../ai/steps/write.js';
import { runContentChecks } from '../engine/checks/content-checks.js';
import { AiPendingError, AiAuthError } from '../ai/runner.js';
import { loadCatalogAndRules } from '../engine/rules/load.js';
import { buildPlan } from '../engine/plan/build.js';
import { assembleDeck } from '../engine/proposal/assemble.js';
import { renderProposal } from '../render/render.js';
import { hashOf } from '../engine/util/data.js';

export function engineContext() {
  const { catalog, catalogMeta, rules } = loadCatalogAndRules();
  return { catalog, rules, catalogHash: catalogMeta?.contentHash, rulesHash: rules.hash, socialBenchmarksHash: hashOf(loadBenchmarks()) };
}

export function planFromDisk(p) {
  if (!existsSync(p.scope)) return null;
  return { scope: load(p.scope), schedule: load(join(p.planDir, 'schedule.json')), kpis: load(join(p.planDir, 'kpis.json')), checks: load(join(p.planDir, 'checks.json'), []), ok: load(join(p.planDir, 'plan-summary.json'), {}).ok };
}

function problemsForPlan(p) {
  return confirmedProblems(p).map((x) => ({ id: x.id, type: x.problemType, severity: x.severity }));
}

export function readinessValues(p) {
  return Object.fromEntries(Object.entries(load(p.readiness, {})).map(([k, v]) => [k, v.value]));
}

const RUNNERS = {
  async collect(p, intake, ctx, log) {
    const s = await runCollect(p, intake, { log });
    return `${s.pages.length} website page(s), ${s.social.length} social page(s)${s.blocked.length ? `, ${s.blocked.length} blocked` : ''}`;
  },
  async notes(p, intake, ctx, log) {
    const r = await runNotesStep(p, intake, { logFile: p.runLog });
    return r.skipped ? 'no meeting notes' : `${r.facts.length} fact(s), ${r.readiness.length} readiness item(s)`;
  },
  async research(p, intake, ctx, log) {
    const s = await runResearchStep(p, intake, { logFile: p.runLog, log });
    return Object.entries(s.teams).map(([t, v]) => `${t}: ${v.facts} facts`).join(', ');
  },
  async record(p, intake) {
    const r = runRecordStep(p, intake);
    return `${r.facts} verified fact(s); ${r.open} open question(s)${r.needsInput ? ' — needs your input' : ''}`;
  },
  async competitors(p, intake) {
    const r = await runCompetitorsStep(p, intake, { logFile: p.runLog });
    return r.added ? `${r.added} competitor(s) proposed — confirm them on the Social tab` : 'no new competitors proposed';
  },
  async social(p, intake, ctx, log) {
    const r = await runSocialStep(p, intake, { log });
    return `${r.brands} brand(s), ${r.captured} profile(s) captured${r.competitorsToReview ? `; ${r.competitorsToReview} competitor(s) to confirm` : ''}${r.waiting ? `; ${r.waiting} capture(s) waiting for you` : ''}`;
  },
  async diagnose(p, intake, ctx) {
    const gate1 = load(p.gate1, {});
    const r = await runDiagnoseStep(p, intake, ctx.rules, { logFile: p.runLog, dialect: gate1.dialect });
    return `${r.problems} problem(s)${r.unverified ? `, ${r.unverified} without verified evidence` : ''}`;
  },
  async review(p, intake, ctx) {
    const r = await runReviewStep(p, ctx.rules, { logFile: p.runLog });
    return `confirmed ${r.confirmed}, needs review ${r.needsReview}, rejected ${r.rejected}`;
  },
  async plan(p, intake, ctx) {
    const plan = buildPlan({ catalog: ctx.catalog, rules: ctx.rules, problems: problemsForPlan(p), readiness: readinessValues(p), gate2: load(p.gate2, {}) });
    save(p.scope, plan.scope);
    save(join(p.planDir, 'deliverables.json'), plan.scope.deliverables);
    save(join(p.planDir, 'schedule.json'), plan.schedule);
    save(join(p.planDir, 'kpis.json'), plan.kpis);
    save(join(p.planDir, 'checks.json'), plan.checks);
    save(join(p.planDir, 'plan-summary.json'), { ok: plan.ok, failed: plan.checks.filter((c) => !c.ok).map((c) => c.id), flags: [...plan.scope.flags, ...plan.schedule.flags] });
    return `${plan.scope.groups.length} service group(s), ${plan.scope.deliverables.length} deliverable(s); checks ${plan.ok ? 'pass' : 'FAIL'}`;
  },
  async write(p, intake, ctx) {
    const gate1 = load(p.gate1, {});
    const gate3 = load(p.gate3, {});
    const plan = planFromDisk(p);
    const inProposal = new Set(plan.scope.problems.filter((x) => x.status === 'in_proposal').map((x) => x.id));
    const problemsView = confirmedProblems(p).filter((x) => inProposal.has(x.id));
    const r = await runWriteStep(p, { intake, plan, problemsView, catalog: ctx.catalog, dialect: gate1.dialect || 'egyptian', revisionNotes: gate3.revisionNotes || '', logFile: p.runLog });
    return `wrote 11 sections for ${r.problems} problem(s)`;
  },
  async check(p, intake, ctx, log) {
    const plan = planFromDisk(p);
    const content = load(p.content);
    const { _meta, ...text } = content;
    const inProposal = new Set(plan.scope.problems.filter((x) => x.status === 'in_proposal').map((x) => x.id));
    const problemsView = confirmedProblems(p).filter((x) => inProposal.has(x.id));
    const wctx = writerContext(p, { intake, plan, problemsView, catalog: ctx.catalog });
    const contentChecks = runContentChecks({ content: text, problemIds: problemsView.map((x) => x.id), allowedNumbers: wctx.allowedNumbers, humanNumbers: wctx.humanNumbers, outOfScopeNames: wctx.outOfScopeNames, latinTerms: wctx.latinTerms, knownEvidenceIds: wctx.knownEvidenceIds, language: 'ar' });
    let languageReview = null;
    let languageError = null;
    try {
      log('Language review (advisory)');
      languageReview = await runLanguageReview(p, { content, dialect: load(p.gate1, {}).dialect, logFile: p.runLog });
    } catch (e) {
      if (e instanceof AiPendingError) throw e;
      languageError = e.message;
    }
    const errors = [...contentChecks.filter((c) => c.level === 'error' && !c.ok), ...plan.checks.filter((c) => !c.ok)];
    save(p.review, { ok: errors.length === 0, contentChecks, scopeChecks: plan.checks, languageReview, languageError, checkedAt: new Date().toISOString() });
    return `${errors.length ? `${errors.length} blocking issue(s)` : 'all blocking checks pass'}; ${contentChecks.filter((c) => c.level === 'warning' && !c.ok).length} warning(s)`;
  },
  async render(p, intake, ctx) {
    const plan = planFromDisk(p);
    const content = load(p.content);
    const inProposal = new Set(plan.scope.problems.filter((x) => x.status === 'in_proposal').map((x) => x.id));
    const problemsView = confirmedProblems(p).filter((x) => inProposal.has(x.id));
    const client = { displayName: intake.displayName || intake.name, presentedTo: intake.presentedTo || intake.name, year: String(new Date().getFullYear()) };
    const model = assembleDeck({ client, content, plan, problemsView, scorecard: load(p.scorecard, null) });
    const res = await renderProposal(model, { outDir: p.draftDir, baseName: 'proposal-draft', previews: true });
    save(join(p.draftDir, 'deck-model.json'), model);
    save(join(p.draftDir, 'render-report.json'), { ...res.report, slides: res.slides, previews: res.previews.map((f) => f.slice(p.dir.length + 1).replace(/\\/g, '/')), renderedAt: new Date().toISOString() });
    return `${res.report.slides} slide(s); layout checks ${res.report.ok ? 'pass' : 'have issues'}`;
  },
};

function logLine(p, text) {
  mkdirSync(dirname(p.jobLog), { recursive: true });
  appendFileSync(p.jobLog, `[${new Date().toISOString()}] ${text}\n`);
}

export async function runStep(slug, stepId, { log = () => {}, ctx = engineContext() } = {}) {
  const p = clientPaths(slug);
  const step = STEPS.find((s) => s.id === stepId);
  if (!step || step.kind === 'gate') throw new Error(`"${stepId}" is not a runnable step`);
  const intake = load(p.intake);
  const say = (m) => {
    logLine(p, `${stepId}: ${m}`);
    log(m);
  };
  const started = Date.now();
  recordStepResult(p, stepId, { state: 'running', startedAt: new Date().toISOString(), error: null });
  say(`started — ${step.label}`);
  try {
    const summary = await RUNNERS[stepId](p, intake, ctx, say);
    const status = loadStatus(p);
    // Fingerprint is taken after the run so it reflects the inputs that were actually used.
    const inputHash = hashOf(inputFingerprint(p, stepId, { ...ctx, status }));
    recordStepResult(p, stepId, { state: 'done', summary, inputHash, outputHash: outputHash(p, stepId), finishedAt: new Date().toISOString(), durationMs: Date.now() - started });
    say(`done — ${summary}`);
    return { ok: true, summary };
  } catch (e) {
    const waiting = e instanceof AiPendingError || e instanceof AiAuthError;
    recordStepResult(p, stepId, { state: waiting ? 'waiting' : 'failed', error: e.message, requestFile: e.requestFile || null, finishedAt: new Date().toISOString(), durationMs: Date.now() - started });
    say(`${waiting ? 'waiting' : 'FAILED'} — ${e.message}`);
    return { ok: false, waiting, error: e.message };
  }
}

// Runs every step that can run, in order, until a gate, an open question or a failure.
export async function runAuto(slug, { log = () => {}, stopBefore = null } = {}) {
  const ctx = engineContext();
  for (let guard = 0; guard < STEPS.length + 2; guard++) {
    const state = computeState(slug, ctx);
    const next = STEPS.find((s) => !['done', 'approved', 'not_used'].includes(state.steps[s.id].state));
    if (!next) return { stoppedAt: null, reason: 'complete', state };
    if (stopBefore && next.id === stopBefore) return { stoppedAt: next.id, reason: 'stop requested', state };
    if (next.kind === 'gate') return { stoppedAt: next.id, reason: 'waiting for your approval', state };
    const after = (id) => STEPS.findIndex((s) => s.id === next.id) > STEPS.findIndex((s) => s.id === id);
    if (state.needsInput && after('record')) return { stoppedAt: 'record', reason: 'questions need your answers', state };
    if (state.socialNeedsInput && after('social')) return { stoppedAt: 'social', reason: 'the social media audit needs you', state };
    const res = await runStep(slug, next.id, { log, ctx });
    if (!res.ok) return { stoppedAt: next.id, reason: res.waiting ? 'waiting for an AI answer' : 'failed', error: res.error, state: computeState(slug, ctx) };
    if (next.id === 'record' && computeState(slug, ctx).needsInput) return { stoppedAt: 'record', reason: 'questions need your answers', state: computeState(slug, ctx) };
    if (next.id === 'social' && computeState(slug, ctx).socialNeedsInput) return { stoppedAt: 'social', reason: 'the social media audit needs you', state: computeState(slug, ctx) };
  }
  return { stoppedAt: null, reason: 'guard', state: computeState(slug, ctx) };
}
