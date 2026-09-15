// The pipeline as a dependency graph: steps the system runs, tasks and approvals that need a person, and change tracking
// (a step is stale when its inputs changed). Steps whose needs are met can run at the same time (see run.js).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { clientPaths, load, save } from './client.js';
import { sentFile, confirmedProblems } from './gates.js';
import { loadCompetitors, socialTasks } from './social.js';
import { emitState } from './events.js';
import { hashOf, sha256 } from '../engine/util/data.js';

const fileHash = (f) => (existsSync(f) ? sha256(readFileSync(f)) : null);

// What the person sees: seven stages from the brief to delivery.
export const STAGES = [
  { id: 'brief', label: 'Brief' },
  { id: 'research', label: 'Research' },
  { id: 'social', label: 'Competitors & social' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'scope', label: 'Scope & plan' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'delivery', label: 'Delivery' },
];

// kind: code (runs by itself) · ai (runs by itself, uses Claude) · task (needs a person) · gate (needs an approval)
// resource: what a step uses while it runs; the scheduler limits how many of each run at once.
// The array is in dependency order: every step comes after everything it needs.
export const STEPS = [
  { id: 'collect', stage: 'research', label: 'Website audit', kind: 'code', resource: 'browser', needs: [], outputs: (p) => [join(p.evidenceDir, 'collect-summary.json')] },
  { id: 'notes', stage: 'research', label: 'Meeting notes', kind: 'ai', model: 'haiku', resource: 'ai', needs: [], outputs: (p) => [join(p.researchDir, 'notes.json')] },
  { id: 'profiles', stage: 'research', label: 'Client social profiles', kind: 'code', resource: 'browser', needs: ['collect'], outputs: (p) => [p.clientProfiles] },
  { id: 'competitors', stage: 'research', label: 'Competitor search', kind: 'ai', model: 'sonnet', resource: 'ai', needs: ['collect', 'notes'], outputs: (p) => [p.competitorsAi] },
  { id: 'research', stage: 'research', label: 'Research teams', kind: 'ai', model: 'sonnet', resource: 'ai', needs: ['collect', 'notes'], outputs: (p) => [join(p.researchDir, 'summary.json')] },
  { id: 'record', stage: 'research', label: 'Client record', kind: 'code', resource: 'code', needs: ['research'], outputs: (p) => [p.record, p.questions, p.readiness] },
  { id: 'confirm-competitors', stage: 'research', label: 'Confirm competitors', kind: 'task', needs: ['competitors'] },
  { id: 'answer-questions', stage: 'research', label: 'Answer important questions', kind: 'task', needs: ['record'] },
  { id: 'social', stage: 'social', label: 'Competitor capture & scorecard', kind: 'code', resource: 'browser', needs: ['profiles', 'confirm-competitors'], outputs: (p) => [p.scorecard, p.socialTasks] },
  { id: 'fix-captures', stage: 'social', label: 'Fix profiles that could not be read', kind: 'task', needs: ['social'] },
  { id: 'diagnose', stage: 'diagnosis', label: 'Diagnosis', kind: 'ai', model: 'opus', resource: 'ai', needs: ['record', 'answer-questions', 'fix-captures'], outputs: (p) => [join(p.dir, 'diagnosis', 'diagnosis-raw.json')] },
  { id: 'review', stage: 'diagnosis', label: 'Independent review', kind: 'ai', model: 'sonnet', resource: 'ai', needs: ['diagnose'], outputs: (p) => [p.diagnosis] },
  { id: 'gate1', stage: 'diagnosis', label: 'Approve diagnosis', kind: 'gate', needs: ['review'] },
  { id: 'plan', stage: 'scope', label: 'Scope, 3-month plan & KPIs', kind: 'code', resource: 'code', needs: ['gate1'], outputs: (p) => [p.scope, join(p.planDir, 'schedule.json'), join(p.planDir, 'kpis.json')] },
  { id: 'gate2', stage: 'scope', label: 'Approve scope', kind: 'gate', needs: ['plan'] },
  { id: 'write', stage: 'proposal', label: 'Write the Arabic proposal', kind: 'ai', model: 'opus', resource: 'ai', needs: ['gate2'], outputs: (p) => [p.content] },
  { id: 'check', stage: 'proposal', label: 'Automated reviews', kind: 'ai', model: 'sonnet', resource: 'ai', needs: ['write'], outputs: (p) => [p.review] },
  { id: 'render', stage: 'proposal', label: 'Slide design (PDF + web)', kind: 'code', resource: 'browser', needs: ['write'], outputs: (p) => [join(p.draftDir, 'render-report.json')] },
  { id: 'gate3', stage: 'proposal', label: 'Approve proposal', kind: 'gate', needs: ['check', 'render'] },
  { id: 'sent', stage: 'delivery', label: 'Mark as sent', kind: 'gate', needs: ['gate3'] },
];
export const STEP_IDS = STEPS.map((s) => s.id);
export const stepById = (id) => STEPS.find((s) => s.id === id);
export const isRunnable = (step) => step.kind === 'code' || step.kind === 'ai';

// Clients diagnosed before these steps existed keep their approvals; the steps can still be run on demand.
const OPTIONAL_LATE_STEPS = ['profiles', 'competitors', 'social'];
const PASSING = new Set(['done', 'approved', 'not_used']);
export const passes = (state) => PASSING.has(state);

export const BLUEPRINT_STATUSES = {
  received: { en: 'Received', ar: 'استلام' },
  research: { en: 'Research', ar: 'بحث' },
  'needs-input': { en: 'Needs you', ar: 'يحتاج بحثًا أعمق' },
  'diagnosis-review': { en: 'Diagnosis review', ar: 'مراجعة التشخيص' },
  'scope-approval': { en: 'Scope approval', ar: 'اعتماد النطاق' },
  'deliverables-defined': { en: 'Deliverables defined', ar: 'تحديد التسليمات' },
  'map-review': { en: 'Map review', ar: 'مراجعة الخارطة' },
  'ready-to-generate': { en: 'Ready to generate', ar: 'جاهز للتوليد' },
  'proposal-review': { en: 'Proposal review', ar: 'مراجعة العرض' },
  approved: { en: 'Approved', ar: 'معتمد' },
  sent: { en: 'Sent', ar: 'أُرسل' },
};

export function loadStatus(p) {
  return load(p.status, { steps: {}, history: [] });
}

export function outputHash(p, stepId) {
  const step = stepById(stepId);
  const files = step.outputs ? step.outputs(p) : [];
  if (!files.length || files.some((f) => !existsSync(f))) return null;
  return hashOf(files.map(fileHash));
}

// What each step depends on. When any of these change, the step (and everything after it) is stale.
export function inputFingerprint(p, stepId, ctx) {
  const intake = load(p.intake, {});
  const status = ctx.status;
  const out = (id) => status.steps[id]?.outputHash ?? null;
  const gate2 = load(p.gate2, {});
  const gate3 = load(p.gate3, {});
  switch (stepId) {
    case 'collect':
      return { website: intake.website || '', socials: intake.socials || [], name: intake.name, market: intake.market || '' };
    case 'notes': {
      // Attached meeting reports count only when there are any, so notes from before reports existed stay up to date.
      const files = p.filesDir && existsSync(p.filesDir) ? readdirSync(p.filesDir).filter((f) => f.endsWith('.extracted.txt')).sort().map((f) => [f, fileHash(join(p.filesDir, f))]) : [];
      return { notes: fileHash(p.notes), name: intake.name, ...(files.length ? { files } : {}) };
    }
    case 'profiles': {
      const client = existsSync(p.capturesDir) ? readdirSync(p.capturesDir).filter((f) => f.startsWith('client__')).map((f) => [f, fileHash(join(p.capturesDir, f))]) : [];
      const statuses = Object.entries(load(p.socialStatus, {})).filter(([k]) => k.startsWith('client:')).map(([k, v]) => [k, v.status]);
      return { collect: out('collect'), socials: intake.socials || [], extra: load(join(p.socialDir, 'profiles-extra.json'), {}).client || null, statuses, client };
    }
    case 'competitors':
      return { collect: out('collect'), notes: out('notes'), competitors: intake.competitors || '', market: intake.market || '', industry: intake.industry || 'general' };
    case 'research':
      return { collect: out('collect'), notes: out('notes'), market: intake.market || '', constraints: intake.constraints || '' };
    case 'record': {
      const manual = load(p.checks, []).filter((c) => c.manual).map((c) => [c.key, c.result, c.value]);
      // Captured social posts are evidence too, but they come from other steps and must not re-open the record.
      // Hashed exactly like the file itself, so records made before social captures existed stay up to date.
      const sources = existsSync(p.sources) ? sha256(`${JSON.stringify(load(p.sources, []).filter((s) => s.kind !== 'social-data'), null, 2)}\n`) : null;
      return { research: out('research'), notes: out('notes'), answers: fileHash(join(p.recordDir, 'answers.json')), manual, sources };
    }
    case 'social': {
      const competitors = load(p.competitors, { list: [] }).list.map((c) => [c.id, c.status, c.name, c.website, c.socials]);
      const captures = existsSync(p.capturesDir) ? readdirSync(p.capturesDir).filter((f) => f.endsWith('.json')).map((f) => [f, fileHash(join(p.capturesDir, f))]) : [];
      return { competitorsAi: out('competitors'), competitors, captures, statuses: fileHash(p.socialStatus), profiles: fileHash(join(p.socialDir, 'profiles-extra.json')), socials: intake.socials || [], industry: intake.industry || 'general', benchmarks: ctx.socialBenchmarksHash || null };
    }
    case 'diagnose':
      // Only the record and check results matter; answering a readiness question must not re-run the diagnosis.
      return { record: fileHash(p.record), checks: load(p.checks, []).map((c) => [c.id, c.result, c.value || '']) };
    case 'review':
      return { diagnose: out('diagnose') };
    case 'plan':
      return { gate1: fileHash(p.gate1), readiness: fileHash(p.readiness), gate2: { optIn: gate2.optIn || [], remove: gate2.remove || [], add: gate2.add || [], phase: gate2.phase || {} }, catalog: ctx.catalogHash, rules: ctx.rulesHash };
    case 'write':
      return { plan: out('plan'), record: out('record'), gate1: fileHash(p.gate1), revision: gate3.revisionNotes || '' };
    case 'check':
      return { write: out('write'), plan: out('plan') };
    case 'render':
      return { write: out('write'), plan: out('plan') };
    default:
      return {};
  }
}

// Fingerprints from before v2 (2026-09-15). A step recorded with the old definition stays up to date as long as the old
// inputs are unchanged, so earlier approvals are not re-opened just because the step graph changed.
const LEGACY_FINGERPRINTS = {
  competitors: (p, ctx) => {
    const intake = load(p.intake, {});
    return { record: ctx.status.steps.record?.outputHash ?? null, competitors: intake.competitors || '', market: intake.market || '', industry: intake.industry || 'general' };
  },
  render: (p, ctx) => {
    const out = (id) => ctx.status.steps[id]?.outputHash ?? null;
    return { write: out('write'), plan: out('plan'), check: out('check') };
  },
};

export function inputsUnchanged(p, stepId, ctx, recorded) {
  if (hashOf(inputFingerprint(p, stepId, ctx)) === recorded) return true;
  const legacy = LEGACY_FINGERPRINTS[stepId];
  return Boolean(legacy && hashOf(legacy(p, ctx)) === recorded);
}

/**
 * Live state of every step, task and approval, plus stage summaries and what needs a person.
 * steps: done | stale | pending | running | failed | waiting (AI answer pending) | blocked | not_used
 * tasks: done | open | blocked | not_used        approvals: approved | open | blocked
 */
export function computeState(slug, ctx) {
  const p = clientPaths(slug);
  const status = loadStatus(p);
  const full = { ...ctx, status };
  const intake = load(p.intake, {});
  const questions = load(p.questions, { needsInput: false, questions: [] });
  let socialLive = null;
  const social = () => (socialLive ||= existsSync(p.intake) ? socialTasks(p, intake) : { tasks: [], waiting: 0, competitorsToReview: 0, needsInput: false });
  const states = {};
  for (const step of STEPS) {
    const rec = status.steps[step.id] || {};
    const unmet = step.needs.filter((n) => !passes(states[n].state));
    let state;
    let extra = {};
    if (step.kind === 'gate') state = unmet.length ? 'blocked' : gateState(p, step.id, status);
    else if (step.kind === 'task') {
      if (unmet.length) state = 'blocked';
      else ({ state, extra } = taskState(p, step.id, { states, questions, social }));
    } else if (rec.state === 'running' && isLiveRun(rec)) state = 'running';
    else if (unmet.length) state = 'blocked';
    else if (rec.state === 'running') {
      state = 'failed';
      extra = { error: 'Interrupted — the app or the computer was closed while this step was running. Run it again; nothing else is lost.', interrupted: true };
    } else if (rec.force) state = 'pending';
    else if (rec.skipped && OPTIONAL_LATE_STEPS.includes(step.id)) state = 'not_used';
    else if (rec.state === 'failed' || rec.state === 'waiting') state = rec.state;
    else if (!rec.outputHash && OPTIONAL_LATE_STEPS.includes(step.id) && status.steps.diagnose?.outputHash) state = 'not_used';
    else if (!rec.outputHash) state = 'pending';
    else if (!inputsUnchanged(p, step.id, full, rec.inputHash) || outputHash(p, step.id) !== rec.outputHash) state = 'stale';
    else state = 'done';
    states[step.id] = { ...rec, ...extra, id: step.id, state, label: step.label, kind: step.kind, stage: step.stage, model: step.model, waitingFor: unmet };
  }
  const tasks = needsYou(p, states, { questions, social });
  const stages = STAGES.map((stage) => stageSummary(stage, states));
  const nextStep = STEPS.find((s) => !passes(states[s.id].state))?.id || null;
  return {
    slug,
    steps: states,
    stages,
    tasks,
    ready: STEPS.filter((s) => isRunnable(s) && ['pending', 'stale'].includes(states[s.id].state)).map((s) => s.id),
    running: STEPS.filter((s) => states[s.id].state === 'running').map((s) => s.id),
    needsInput: questions.needsInput,
    socialNeedsInput: states['confirm-competitors'].state === 'open' || states['fix-captures'].state === 'open',
    social: social(),
    blueprintStatus: blueprintStatus(states),
    nextStep,
  };
}

function taskState(p, id, { states, questions, social }) {
  if (id === 'confirm-competitors') {
    if (states.competitors.state === 'not_used') return { state: 'not_used', extra: {} };
    const proposed = loadCompetitors(p).list.filter((c) => c.status === 'proposed').length;
    return proposed ? { state: 'open', extra: { count: proposed } } : { state: 'done', extra: {} };
  }
  if (id === 'answer-questions') {
    const open = questions.questions.filter((q) => q.blocking && !q.answered).length;
    return questions.needsInput ? { state: 'open', extra: { count: open } } : { state: 'done', extra: {} };
  }
  if (id === 'fix-captures') {
    if (states.social.state === 'not_used') return { state: 'not_used', extra: {} };
    const waiting = social().waiting;
    return waiting ? { state: 'open', extra: { count: waiting } } : { state: 'done', extra: {} };
  }
  return { state: 'done', extra: {} };
}

function gateState(p, id, status) {
  const out = (s) => status.steps[s]?.outputHash ?? null;
  if (id === 'gate1') {
    const g = load(p.gate1, {});
    return g.approved && g.diagnosisHash && g.diagnosisHash === out('review') ? 'approved' : 'open';
  }
  if (id === 'gate2') {
    const g = load(p.gate2, {});
    return g.approved && g.approvedPlanHash && g.approvedPlanHash === out('plan') ? 'approved' : 'open';
  }
  if (id === 'gate3') {
    const g = load(p.gate3, {});
    return g.approved && g.renderHash && g.renderHash === out('render') ? 'approved' : 'open';
  }
  if (id === 'sent') return existsSync(sentFile(p)) ? 'approved' : 'open';
  return 'open';
}

// Everything that needs a person right now, most urgent first. Optional items never block anything.
function needsYou(p, states, { questions, social }) {
  const out = [];
  for (const step of STEPS) {
    const st = states[step.id];
    if (step.kind === 'task' && st.state === 'open') out.push({ id: step.id, stage: step.stage, type: 'task', label: step.label, count: st.count || 0, blocking: true });
    if (step.kind === 'gate' && st.state === 'open') out.push({ id: step.id, stage: step.stage, type: 'approval', label: step.label, blocking: true });
    if (isRunnable(step) && st.state === 'failed') out.push({ id: step.id, stage: step.stage, type: 'failed', label: step.label, error: st.error || '', interrupted: Boolean(st.interrupted), blocking: true });
    if (isRunnable(step) && st.state === 'waiting') out.push({ id: step.id, stage: step.stage, type: 'waiting', label: step.label, error: st.error || '', requestFile: st.requestFile || null, blocking: true });
  }
  const order = { failed: 0, waiting: 1, task: 2, approval: 3 };
  out.sort((a, b) => order[a.type] - order[b.type] || STEP_IDS.indexOf(a.id) - STEP_IDS.indexOf(b.id));
  // Optional: readiness answers and manual checks help timing and evidence, but never hold anything up.
  if (passes(states.record.state) && !passes(states.gate2.state)) {
    const answers = load(join(p.recordDir, 'answers.json'), {});
    const readiness = load(p.readiness, {});
    const unknownReadiness = Object.entries(readiness).filter(([k, v]) => (v?.value ?? 'unknown') === 'unknown' && !answers[`readiness:${k}`]).length;
    const manual = load(p.checks, []).filter((c) => c.manual && c.result === 'unknown').length;
    if (unknownReadiness || manual) out.push({ id: 'optional-input', stage: unknownReadiness ? 'brief' : 'research', type: 'optional', label: 'Optional: readiness answers and manual checks', count: unknownReadiness + manual, readiness: unknownReadiness, manual, blocking: false });
  }
  return out;
}

function stageSummary(stage, states) {
  const steps = STEPS.filter((s) => s.stage === stage.id).map((s) => states[s.id]);
  if (stage.id === 'brief') return { ...stage, state: 'done', steps: [] };
  const any = (fn) => steps.some(fn);
  let state;
  if (any((s) => ['open', 'failed', 'waiting'].includes(s.state))) state = 'needs-you';
  else if (any((s) => s.state === 'running')) state = 'working';
  else if (steps.every((s) => passes(s.state))) state = steps.every((s) => s.state === 'not_used') ? 'skipped' : 'done';
  else if (any((s) => ['pending', 'stale'].includes(s.state))) state = 'ready';
  else if (any((s) => passes(s.state))) state = 'in-progress';
  else state = 'waiting';
  return { ...stage, state, steps: steps.map((s) => s.id) };
}

function blueprintStatus(s) {
  const done = (id) => s[id].state === 'done' || s[id].state === 'approved';
  if (s.sent.state === 'approved') return 'sent';
  if (s.gate3.state === 'approved') return 'approved';
  if (done('render')) return 'proposal-review';
  if (done('write') || done('check')) return 'ready-to-generate';
  if (s.gate2.state === 'approved') return 'map-review';
  if (done('plan')) return s.gate1.state === 'approved' ? 'scope-approval' : 'deliverables-defined';
  if (s.gate1.state === 'approved') return 'deliverables-defined';
  if (done('review') || done('diagnose')) return 'diagnosis-review';
  if (['answer-questions', 'confirm-competitors', 'fix-captures'].some((id) => s[id].state === 'open')) return 'needs-input';
  if (['collect', 'notes', 'profiles', 'research', 'record', 'competitors', 'social'].some((id) => ['done', 'running', 'failed', 'waiting', 'stale'].includes(s[id].state))) return 'research';
  return 'received';
}

// A step marked "running" whose process is gone (the app or the PC was closed mid-step) is an interrupted run, not a live one.
const MAX_STEP_HOURS = 3;
export function isLiveRun(rec, now = Date.now()) {
  if (rec?.state !== 'running') return false;
  if (!rec.startedAt || now - Date.parse(rec.startedAt) > MAX_STEP_HOURS * 3_600_000) return false;
  if (!rec.pid) return true;
  if (rec.pid === process.pid) return true;
  try {
    process.kill(rec.pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export function recordStepResult(p, stepId, patch) {
  const status = loadStatus(p);
  status.steps[stepId] = { ...(status.steps[stepId] || {}), ...patch };
  status.history = [...(status.history || []), { step: stepId, ...patch, at: new Date().toISOString() }].slice(-300);
  save(p.status, status);
  emitState(p, stepId);
  return status;
}

// Asks for a step to run again (a person pressed "Run again" or "Try again"); the scheduler picks it up.
export function requestStepRun(p, stepId) {
  const step = stepById(stepId);
  if (!step || !isRunnable(step)) throw new Error(`"${stepId}" is not a step the system runs`);
  return recordStepResult(p, stepId, { force: true, skipped: false, error: null });
}

// The team decides a client does not need an optional step (e.g. no competitor comparison); it counts as passed.
export function skipStep(p, stepId) {
  if (!OPTIONAL_LATE_STEPS.includes(stepId)) throw new Error(`"${stepId}" cannot be skipped`);
  return recordStepResult(p, stepId, { skipped: true, force: false, state: null, error: null });
}

export { confirmedProblems };
export const fileModified = (f) => (existsSync(f) ? statSync(f).mtime.toISOString() : null);
