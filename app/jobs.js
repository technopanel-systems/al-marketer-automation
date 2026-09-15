// Background work for the Control Center. Each client has at most one scheduler (it runs every ready step in parallel);
// one-off jobs such as capturing a single profile run next to it and wake the scheduler when they finish.
import { runAuto, isAutoRunning, nudgeAuto, logActivity } from '../pipeline/run.js';
import { bus } from '../pipeline/events.js';

const clients = new Map();
const entry = (slug) => {
  if (!clients.has(slug)) clients.set(slug, { autopilot: null, side: [] });
  return clients.get(slug);
};
const settled = (slug) => bus.emit('state', { slug, step: null, at: Date.now() });

// Start the scheduler for a client, or wake it if it is already running.
export function kick(slug) {
  if (process.env.ALM_NO_AUTORUN) return 'disabled';
  if (isAutoRunning(slug)) {
    nudgeAuto(slug);
    return 'nudged';
  }
  const e = entry(slug);
  e.autopilot = { running: true, startedAt: new Date().toISOString(), result: '' };
  settled(slug);
  runAuto(slug)
    .then((r) => {
      e.autopilot.result = r.reason;
      if (r.reason === 'failed' || r.reason === 'waiting for an AI answer') logActivity(slug, `stopped: ${r.reason}${r.error ? ` — ${r.error}` : ''}`);
    })
    .catch((err) => {
      e.autopilot.result = `error — ${err.message}`;
      logActivity(slug, `ERROR ${err.message}`);
    })
    .finally(() => {
      e.autopilot.running = false;
      e.autopilot.finishedAt = new Date().toISOString();
      settled(slug);
    });
  return 'started';
}

// A job next to the scheduler (single capture, research browser). When it ends, the scheduler picks up what changed.
export function sideJob(slug, label, fn) {
  const e = entry(slug);
  if (e.side.some((j) => j.running && j.label === label)) return false;
  const job = { label, running: true, startedAt: new Date().toISOString() };
  e.side = [...e.side.filter((j) => j.running), job];
  logActivity(slug, `${label}: started`);
  settled(slug);
  Promise.resolve()
    .then(() => fn((m) => logActivity(slug, `${label}: ${m}`)))
    .catch((err) => logActivity(slug, `${label}: ERROR ${err.message}`))
    .finally(() => {
      job.running = false;
      logActivity(slug, `${label}: finished`);
      kick(slug);
    });
  return true;
}

export function jobInfo(slug) {
  const e = clients.get(slug);
  const side = (e?.side || []).filter((j) => j.running);
  return { running: Boolean(e?.autopilot?.running) || side.length > 0 || isAutoRunning(slug), side: side.map((j) => j.label), last: e?.autopilot || null };
}
