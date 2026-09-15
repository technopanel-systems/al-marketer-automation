// Runs pipeline steps for one client: every step whose needs are met starts at once (within limits), results are recorded,
// and the run stops only when nothing more can happen without a person (a task, an approval, a failure) or all is done.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { clientPaths, load, save } from './client.js';
import { stepById, isRunnable, computeState, inputFingerprint, outputHash, recordStepResult, loadStatus } from './steps.js';
import { emitLog } from './events.js';
import { confirmedProblems } from './gates.js';
import { runRecordStep } from './steps/record.js';
import { runCollect } from '../collect/site.js';
import { runNotesStep } from '../ai/steps/notes.js';
import { runResearchStep } from '../ai/steps/research.js';
import { runDiagnoseStep, runReviewStep } from '../ai/steps/diagnose.js';
import { runCompetitorsStep } from '../ai/steps/competitors.js';
import { runSocialStep, runProfilesStep, loadBenchmarks } from './social.js';
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
  async profiles(p, intake, ctx, log) {
    const r = await runProfilesStep(p, intake, { log });
    const failed = r.platforms.filter((x) => x.state === 'failed').length;
    return `${r.platforms.length} profile(s) known${r.captured ? `, ${r.captured} captured` : ''}${failed ? `, ${failed} could not be read` : ''}${r.duplicates.length ? `; more than one account on ${r.duplicates.map((d) => d.platform).join(', ')}` : ''}`;
  },
  async competitors(p, intake) {
    const r = await runCompetitorsStep(p, intake, { logFile: p.runLog });
    return r.added ? `${r.added} competitor(s) proposed — confirm them` : 'no new competitors proposed';
  },
  async research(p, intake, ctx, log) {
    const s = await runResearchStep(p, intake, { logFile: p.runLog, log });
    return Object.entries(s.teams).map(([t, v]) => `${t}: ${v.facts} facts`).join(', ');
  },
  async record(p, intake) {
    const r = runRecordStep(p, intake);
    return `${r.facts} verified fact(s); ${r.open} open question(s)${r.needsInput ? ' — needs your input' : ''}`;
  },
  async social(p, intake, ctx, log) {
    const r = await runSocialStep(p, intake, { log });
    return `${r.brands} brand(s), ${r.captured} profile(s) captured${r.waiting ? `; ${r.waiting} profile(s) need you` : ''}`;
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
    const model = assembleDeck({ client, content, plan, problemsView, scorecard: load(p.scorecard, null), checks: load(p.checks, []), readiness: load(p.readiness, {}) });
    const res = await renderProposal(model, { outDir: p.draftDir, baseName: 'proposal-draft', previews: true });
    save(join(p.draftDir, 'deck-model.json'), model);
    save(join(p.draftDir, 'render-report.json'), { ...res.report, slides: res.slides, previews: res.previews.map((f) => f.slice(p.dir.length + 1).replace(/\\/g, '/')), renderedAt: new Date().toISOString() });
    return `${res.report.slides} slide(s); layout checks ${res.report.ok ? 'pass' : 'have issues'}`;
  },
};

function logLine(p, text) {
  // A proposal that was archived or deleted gets no new log folder (it would come back as an empty folder under its old name).
  if (!existsSync(p.dir)) return;
  mkdirSync(dirname(p.jobLog), { recursive: true });
  appendFileSync(p.jobLog, `[${new Date().toISOString()}] ${text}\n`);
  emitLog(p, text);
}

// Writes a line to the client's persistent activity log (used by jobs outside the step runner, e.g. a single capture).
export const logActivity = (slug, text) => logLine(clientPaths(slug), text);

export async function runStep(slug, stepId, { log = () => {}, ctx = engineContext(), runner = RUNNERS[stepId] } = {}) {
  const p = clientPaths(slug);
  const step = stepById(stepId);
  if (!step || !isRunnable(step)) throw new Error(`"${stepId}" is not a runnable step`);
  const intake = load(p.intake);
  const say = (m) => {
    logLine(p, `${stepId}: ${m}`);
    log(m);
  };
  const started = Date.now();
  recordStepResult(p, stepId, { state: 'running', startedAt: new Date().toISOString(), pid: process.pid, error: null, force: false, skipped: false });
  say(`started — ${step.label}`);
  try {
    const summary = await runner(p, intake, ctx, say);
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

// How many steps of each kind may run at the same time: Claude steps are limited to respect the plan, browsers to spare the PC.
export const DEFAULT_LIMITS = { ai: 2, browser: 2, code: 4 };

const autopilots = new Map();
export const isAutoRunning = (slug) => autopilots.has(slug);
// Wakes a running scheduler so it notices work a person just unblocked (e.g. competitors confirmed while research runs).
export function nudgeAuto(slug) {
  const a = autopilots.get(slug);
  if (a) a.wake();
  return Boolean(a);
}
// Lets the steps already running finish, but starts nothing new (used before a proposal is archived or deleted).
export function stopAuto(slug) {
  const a = autopilots.get(slug);
  if (a) {
    a.stopping = true;
    a.wake();
  }
  return Boolean(a);
}

// Why the scheduler stopped, in the words the Control Center and the command line show.
export function stopReason(state) {
  if (!state.nextStep) return { stoppedAt: null, reason: 'complete' };
  const first = (type, ids) => state.tasks.find((t) => t.type === type && (!ids || ids.includes(t.id)));
  const failed = first('failed');
  if (failed) return { stoppedAt: failed.id, reason: 'failed', error: failed.error };
  const waiting = first('waiting');
  if (waiting) return { stoppedAt: waiting.id, reason: 'waiting for an AI answer', error: waiting.error };
  if (first('task', ['answer-questions'])) return { stoppedAt: 'answer-questions', reason: 'questions need your answers' };
  const social = first('task', ['confirm-competitors', 'fix-captures']);
  if (social) return { stoppedAt: social.id, reason: 'the social media audit needs you' };
  const approval = first('approval');
  if (approval) return { stoppedAt: approval.id, reason: 'waiting for your approval' };
  return { stoppedAt: state.nextStep, reason: 'nothing ready to run' };
}

/**
 * Runs everything that can run, in parallel within the limits, until nothing more can happen without a person.
 * If a scheduler is already running for this client, it is nudged instead and this call returns at once.
 */
export async function runAuto(slug, { log = () => {}, limits = DEFAULT_LIMITS, runners = RUNNERS, ctx = null, maxRunsPerStep = 3 } = {}) {
  if (autopilots.has(slug)) {
    nudgeAuto(slug);
    return { stoppedAt: null, reason: 'already running', joined: true };
  }
  let wake = () => {};
  const me = { wake: () => wake(), stopping: false };
  autopilots.set(slug, me);
  const context = ctx || engineContext();
  const inflight = new Map();
  const runs = {};
  const ran = [];
  try {
    for (;;) {
      const state = computeState(slug, context);
      const used = (resource) => [...inflight.values()].filter((x) => x.resource === resource).length;
      for (const id of me.stopping ? [] : state.ready) {
        const step = stepById(id);
        const resource = step.resource || 'code';
        if (inflight.has(id) || (runs[id] || 0) >= maxRunsPerStep || used(resource) >= (limits[resource] ?? Infinity)) continue;
        runs[id] = (runs[id] || 0) + 1;
        ran.push(id);
        const promise = runStep(slug, id, { log: (m) => log(`${step.label}: ${m}`), ctx: context, runner: runners[id] || RUNNERS[id] }).finally(() => inflight.delete(id));
        inflight.set(id, { resource, promise });
      }
      if (!inflight.size) {
        if (me.stopping) return { stoppedAt: null, reason: 'stopped', ran };
        const final = computeState(slug, context);
        return { ...stopReason(final), state: final, ran };
      }
      const woken = new Promise((resolve) => (wake = resolve));
      await Promise.race([...[...inflight.values()].map((x) => x.promise), woken]);
    }
  } finally {
    autopilots.delete(slug);
  }
}
