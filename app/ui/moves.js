// What a person should do next for a proposal, derived from the engine state. Home and the client page use the same words.
import { STAGES, stepById } from '../../pipeline/steps.js';

const TASK_MOVES = {
  'confirm-competitors': (slug, t) => ({ label: 'Confirm competitors', detail: `${t.count} suggested by the AI`, href: `/c/${slug}/research#competitors` }),
  'answer-questions': (slug, t) => ({ label: 'Answer questions', detail: `${t.count} important question${t.count === 1 ? '' : 's'} the research could not answer`, href: `/c/${slug}/research#questions` }),
  'fix-captures': (slug, t) => ({ label: 'Fix social profiles', detail: `${t.count} profile${t.count === 1 ? '' : 's'} could not be read`, href: `/c/${slug}/social#captures` }),
  gate1: (slug) => ({ label: 'Review diagnosis', detail: 'Confirm or reject each problem, then approve', href: `/c/${slug}/diagnosis` }),
  gate2: (slug) => ({ label: 'Review scope', detail: 'Services, 3-month plan and KPIs are ready to approve', href: `/c/${slug}/scope` }),
  gate3: (slug) => ({ label: 'Review proposal', detail: 'Slides and reviews are ready; compare the facts and approve', href: `/c/${slug}/proposal` }),
  sent: (slug) => ({ label: 'Send the proposal', detail: 'Download the approved files, send them yourself, then mark as sent', href: `/c/${slug}/delivery` }),
  'optional-input': (slug, t) => (t.readiness ? { label: 'Add readiness answers', detail: `${t.readiness} readiness question${t.readiness === 1 ? '' : 's'} unknown on the brief (never holds anything up)`, href: `/c/${slug}/brief` } : { label: 'Add manual checks', detail: `${t.manual} check${t.manual === 1 ? '' : 's'} the system could not do (never holds anything up)`, href: `/c/${slug}/research#optional` }),
};

// One item a person can act on: { label, detail, href } or { label, detail, post: { action, fields } }.
export function taskMove(slug, t) {
  if (t.type === 'failed') return { label: 'Try again', detail: `${stepById(t.id)?.label}: ${t.interrupted ? 'interrupted when the app or computer was closed' : t.error}`, post: { action: `/c/${slug}/run`, fields: { step: t.id } }, tone: 'bad' };
  if (t.type === 'waiting') return { label: 'Check again', detail: `${stepById(t.id)?.label}: Claude could not run in the background. Open Claude Code in the project folder and type /run-step, or check your Claude login.`, post: { action: `/c/${slug}/run`, fields: { step: t.id } }, tone: 'bad' };
  const move = TASK_MOVES[t.id]?.(slug, t);
  return move ? { ...move, tone: t.blocking ? 'you' : 'neutral' } : null;
}

export function primaryMove(slug, state, { running = false } = {}) {
  const blocking = state.tasks.filter((t) => t.blocking);
  if (blocking.length) return taskMove(slug, blocking[0]);
  if (running || state.running.length) return { label: 'Working', detail: nowText(state), working: true };
  if (state.ready.length) return { label: 'Continue', detail: `Ready: ${state.ready.map((id) => stepById(id).label).join(', ')}`, post: { action: `/c/${slug}/run`, fields: {} }, tone: 'you' };
  if (!state.nextStep) return { label: 'Complete', detail: 'Approved and marked as sent', done: true };
  return { label: 'Waiting', detail: nowText(state) };
}

// A short sentence about what is happening now.
export function nowText(state) {
  if (state.running.length) return `Working: ${state.running.map((id) => stepById(id).label).join(', ')}`;
  const blocking = state.tasks.find((t) => t.blocking);
  if (blocking) return taskMove('', blocking)?.detail || '';
  if (!state.nextStep) return 'Sent to the client';
  const next = state.steps[state.nextStep];
  return next.waitingFor?.length ? `Waiting for ${next.waitingFor.map((id) => stepById(id).label.toLowerCase()).join(' and ')}` : `Next: ${next.label}`;
}

// The stage to open when someone clicks a client: where attention is needed, else where work is happening.
export function focusStage(state) {
  const blocking = state.tasks.find((t) => t.blocking);
  if (blocking) return blocking.stage;
  const working = state.stages.find((s) => s.state === 'working');
  if (working) return working.id;
  const next = state.stages.find((s) => !['done', 'skipped'].includes(s.state));
  return next ? next.id : STAGES[STAGES.length - 1].id;
}
