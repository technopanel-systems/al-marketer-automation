// The pipeline: ordered steps, change tracking (a step is stale when its inputs changed), gates and status.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { clientPaths, load, save } from './client.js';
import { sentFile, confirmedProblems } from './gates.js';
import { hashOf, sha256 } from '../engine/util/data.js';

const fileHash = (f) => (existsSync(f) ? sha256(readFileSync(f)) : null);

export const STEPS = [
  { id: 'collect', label: 'Collect website & social evidence', kind: 'code', outputs: (p) => [join(p.evidenceDir, 'collect-summary.json')] },
  { id: 'notes', label: 'Read meeting notes', kind: 'ai', model: 'haiku', outputs: (p) => [join(p.researchDir, 'notes.json')] },
  { id: 'research', label: 'Research (3 teams)', kind: 'ai', model: 'sonnet', outputs: (p) => [join(p.researchDir, 'summary.json')] },
  { id: 'record', label: 'Client Information Record & questions', kind: 'code', outputs: (p) => [p.record, p.questions, p.readiness] },
  { id: 'competitors', label: 'Find competitors', kind: 'ai', model: 'sonnet', outputs: (p) => [p.competitorsAi] },
  { id: 'social', label: 'Social media audit (client + competitors)', kind: 'code', outputs: (p) => [p.scorecard, p.socialTasks] },
  { id: 'diagnose', label: 'Diagnosis', kind: 'ai', model: 'opus', outputs: (p) => [join(p.dir, 'diagnosis', 'diagnosis-raw.json')] },
  { id: 'review', label: 'Independent review of problems', kind: 'ai', model: 'sonnet', outputs: (p) => [p.diagnosis] },
  { id: 'gate1', label: 'Gate 1 — diagnosis review', kind: 'gate' },
  { id: 'plan', label: 'Scope, 3-month plan & KPIs', kind: 'code', outputs: (p) => [p.scope, join(p.planDir, 'schedule.json'), join(p.planDir, 'kpis.json')] },
  { id: 'gate2', label: 'Gate 2 — commercial scope approval', kind: 'gate' },
  { id: 'write', label: 'Write the Arabic proposal', kind: 'ai', model: 'opus', outputs: (p) => [p.content] },
  { id: 'check', label: 'Automated reviews', kind: 'code', outputs: (p) => [p.review] },
  { id: 'render', label: 'Design the slides (PDF + web)', kind: 'code', outputs: (p) => [join(p.draftDir, 'render-report.json')] },
  { id: 'gate3', label: 'Gate 3 — map & proposal approval', kind: 'gate' },
  { id: 'sent', label: 'Sent to the client', kind: 'gate' },
];
export const STEP_IDS = STEPS.map((s) => s.id);
const OPTIONAL_LATE_STEPS = ['competitors', 'social'];

export const BLUEPRINT_STATUSES = {
  received: { en: 'Received', ar: 'استلام' },
  research: { en: 'Research', ar: 'بحث' },
  'needs-input': { en: 'Needs deeper research / your input', ar: 'يحتاج بحثًا أعمق' },
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
  const step = STEPS.find((s) => s.id === stepId);
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
    case 'notes':
      return { notes: fileHash(p.notes), name: intake.name };
    case 'research':
      return { collect: out('collect'), notes: out('notes'), market: intake.market || '', constraints: intake.constraints || '' };
    case 'record': {
      const manual = load(p.checks, []).filter((c) => c.manual).map((c) => [c.key, c.result, c.value]);
      // Captured social posts are evidence too, but they come later (social step) and must not re-open the record.
      // Hashed exactly like the file itself, so records made before social captures existed stay up to date.
      const sources = existsSync(p.sources) ? sha256(`${JSON.stringify(load(p.sources, []).filter((s) => s.kind !== 'social-data'), null, 2)}\n`) : null;
      return { research: out('research'), notes: out('notes'), answers: fileHash(join(p.recordDir, 'answers.json')), manual, sources };
    }
    case 'competitors':
      return { record: out('record'), competitors: intake.competitors || '', market: intake.market || '', industry: intake.industry || 'general' };
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
      return { write: out('write'), plan: out('plan'), check: out('check') };
    default:
      return {};
  }
}

/**
 * Computes the live state of every step.
 * state: done | stale | pending | running | failed | waiting (AI answer pending) | blocked
 * gates: approved | open | blocked
 */
export function computeState(slug, ctx) {
  const p = clientPaths(slug);
  const status = loadStatus(p);
  const full = { ...ctx, status };
  const states = {};
  let upstreamOk = true;
  const questions = load(p.questions, { needsInput: false, questions: [] });
  const social = load(p.socialTasks, { needsInput: false, tasks: [], waiting: 0, competitorsToReview: 0 });
  for (const step of STEPS) {
    const rec = status.steps[step.id] || {};
    let state;
    if (step.kind === 'gate') {
      state = gateState(p, step.id, status);
      if (!upstreamOk) state = 'blocked';
    } else if (rec.state === 'running') state = 'running';
    else if (!upstreamOk) state = 'blocked';
    else if (rec.state === 'failed' || rec.state === 'waiting') state = rec.state;
    // Clients diagnosed before the social audit existed keep their approvals; the audit can still be run on demand.
    else if (!rec.outputHash && OPTIONAL_LATE_STEPS.includes(step.id) && status.steps.diagnose?.outputHash) state = 'not_used';
    else if (!rec.outputHash) state = 'pending';
    else if (hashOf(inputFingerprint(p, step.id, full)) !== rec.inputHash || outputHash(p, step.id) !== rec.outputHash) state = 'stale';
    else state = 'done';
    states[step.id] = { ...rec, state, label: step.label, kind: step.kind, model: step.model };
    const passes = step.kind === 'gate' ? state === 'approved' : state === 'done' || state === 'not_used';
    if (!passes) upstreamOk = false;
    if (step.id === 'record' && state === 'done' && questions.needsInput) upstreamOk = false;
    if (step.id === 'social' && state === 'done' && social.needsInput) upstreamOk = false;
  }
  return { slug, steps: states, needsInput: questions.needsInput, socialNeedsInput: states.social.state === 'done' && Boolean(social.needsInput), social, blueprintStatus: blueprintStatus(states, questions, social), nextStep: STEPS.find((s) => !['done', 'approved', 'not_used'].includes(states[s.id].state))?.id || null };
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

function blueprintStatus(s, questions, social = {}) {
  const done = (id) => s[id].state === 'done' || s[id].state === 'approved';
  if (s.sent.state === 'approved') return 'sent';
  if (s.gate3.state === 'approved') return 'approved';
  if (done('render')) return 'proposal-review';
  if (done('write') || done('check')) return 'ready-to-generate';
  if (s.gate2.state === 'approved') return 'map-review';
  if (done('plan')) return s.gate1.state === 'approved' ? 'scope-approval' : 'deliverables-defined';
  if (s.gate1.state === 'approved') return 'deliverables-defined';
  if (done('review') || done('diagnose')) return 'diagnosis-review';
  if (done('record') && questions.needsInput) return 'needs-input';
  if (done('social') && social.needsInput) return 'needs-input';
  if (['collect', 'notes', 'research', 'record', 'competitors', 'social'].some((id) => ['done', 'running', 'failed', 'waiting', 'stale'].includes(s[id].state))) return 'research';
  return 'received';
}

export function recordStepResult(p, stepId, patch) {
  const status = loadStatus(p);
  status.steps[stepId] = { ...(status.steps[stepId] || {}), ...patch };
  status.history = [...(status.history || []), { step: stepId, ...patch, at: new Date().toISOString() }].slice(-300);
  save(p.status, status);
  return status;
}

export { confirmedProblems };
export const fileModified = (f) => (existsSync(f) ? statSync(f).mtime.toISOString() : null);
