// Background work for the Control Center. Each client has at most one scheduler (it runs every ready step in parallel);
// one-off jobs such as capturing a single profile run next to it and wake the scheduler when they finish.
// Archiving or deleting waits for running work: a step still writing into a moved folder would bring it back.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { runAuto, isAutoRunning, nudgeAuto, stopAuto, logActivity, engineContext } from '../pipeline/run.js';
import { computeState, stepById } from '../pipeline/steps.js';
import { clientPaths, load, save } from '../pipeline/client.js';
import { archiveClient, deleteClient } from '../pipeline/archive.js';
import { bus } from '../pipeline/events.js';

const clients = new Map();
const entry = (slug) => {
  if (!clients.has(slug)) clients.set(slug, { autopilot: null, side: [] });
  return clients.get(slug);
};
const settled = (slug) => bus.emit('state', { slug, step: null, at: Date.now() });

// A removal waiting for running work: { action: 'archive' | 'delete', requestedAt }. Kept on disk so it survives a restart.
const removalFile = (slug) => join(clientPaths(slug).dir, 'removal.json');
export const pendingRemoval = (slug) => load(removalFile(slug), null);

// Start the scheduler for a client, or wake it if it is already running.
export function kick(slug) {
  if (process.env.ALM_NO_AUTORUN) return 'disabled';
  if (pendingRemoval(slug)) return 'removing';
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
      if (!finishPendingRemoval(slug)) settled(slug);
    });
  return 'started';
}

// A job next to the scheduler (single capture, research browser). When it ends, the scheduler picks up what changed.
export function sideJob(slug, label, fn) {
  if (pendingRemoval(slug)) return false;
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
      if (!finishPendingRemoval(slug)) kick(slug);
    });
  return true;
}

export function jobInfo(slug) {
  const e = clients.get(slug);
  const side = (e?.side || []).filter((j) => j.running);
  return { running: Boolean(e?.autopilot?.running) || side.length > 0 || isAutoRunning(slug), side: side.map((j) => j.label), last: e?.autopilot || null };
}

function removeNow(slug, action) {
  const status = action === 'archive' ? computeState(slug, engineContext()).blueprintStatus : '';
  rmSync(removalFile(slug), { force: true });
  const id = action === 'archive' ? archiveClient(slug, { status }) : (deleteClient(slug), null);
  clients.delete(slug);
  bus.emit('state', { slug, step: null, at: Date.now(), removed: action });
  return id;
}

/**
 * Archive or delete a proposal. With nothing running it happens at once; otherwise the scheduler starts nothing new and
 * the proposal is removed as soon as the running steps finish. Returns { ok, pending, id, error }.
 */
export function removeClient(slug, action) {
  if (!['archive', 'delete'].includes(action)) return { ok: false, error: 'Unknown action.' };
  if (jobInfo(slug).running) {
    save(removalFile(slug), { action, requestedAt: new Date().toISOString() });
    stopAuto(slug);
    logActivity(slug, `${action === 'archive' ? 'Archive' : 'Delete'} requested: nothing new starts, and it happens when the running work finishes`);
    settled(slug);
    return { ok: true, pending: true };
  }
  const elsewhere = computeState(slug, engineContext()).running;
  if (elsewhere.length) return { ok: false, error: `${stepById(elsewhere[0]).label} is still running (started from the command line). Try again when it finishes.` };
  try {
    return { ok: true, pending: false, id: removeNow(slug, action) };
  } catch (e) {
    rmSync(removalFile(slug), { force: true });
    return { ok: false, error: e.message };
  }
}

// Cancels a removal that is still waiting, and lets the work continue.
export function keepClient(slug) {
  if (!pendingRemoval(slug)) return false;
  rmSync(removalFile(slug), { force: true });
  logActivity(slug, 'Kept: the archive/delete request was cancelled');
  kick(slug);
  settled(slug);
  return true;
}

// Called whenever a job ends, and when the Control Center starts. True when the proposal was removed (or could not be).
export function finishPendingRemoval(slug) {
  const pending = pendingRemoval(slug);
  if (!pending || jobInfo(slug).running) return false;
  try {
    removeNow(slug, pending.action);
  } catch (e) {
    rmSync(removalFile(slug), { force: true });
    logActivity(slug, `Could not ${pending.action} this proposal: ${e.message}`);
    settled(slug);
  }
  return true;
}
