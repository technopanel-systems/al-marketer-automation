// The v2 workflow: dependency graph, tasks that need a person, the parallel scheduler and its limits.
// AI and browser steps are replaced by fake runners that write the same output files, so the timing is observable.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-graph-'));
process.env.ALM_CLIENTS_DIR = root;
const { clientPaths, save, load } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { STEPS, STAGES, computeState, requestStepRun, skipStep, recordStepResult, inputFingerprint, outputHash, inputsUnchanged } = await import('../../pipeline/steps.js');
const { runAuto, nudgeAuto, stopAuto, engineContext } = await import('../../pipeline/run.js');
const { addAiCompetitors, saveCompetitorReview, loadCompetitors } = await import('../../pipeline/social.js');
const { hashOf } = await import('../../engine/util/data.js');
after(() => rmSync(root, { recursive: true, force: true }));

const ctx = engineContext();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fake runners: each waits a little, writes its outputs and records when it started and ended.
function fakeRunners(timeline, { delays = {}, proposeCompetitors = 0 } = {}) {
  const step = (id, write) => async (p, intake) => {
    timeline.push({ id, at: 'start', t: performance.now() });
    await sleep(delays[id] ?? 30);
    write(p, intake);
    timeline.push({ id, at: 'end', t: performance.now() });
    return 'fake';
  };
  return {
    collect: step('collect', (p) => save(join(p.evidenceDir, 'collect-summary.json'), { pages: [] })),
    notes: step('notes', (p) => save(join(p.researchDir, 'notes.json'), { facts: [] })),
    profiles: step('profiles', (p) => save(p.clientProfiles, { platforms: [] })),
    competitors: step('competitors', (p) => {
      const proposals = Array.from({ length: proposeCompetitors }, (_, i) => ({ name: `Rival ${i + 1}`, website: `https://rival${i + 1}.example`, socials: [], reason: 'sells the same panels', confidence: 'high' }));
      save(p.competitorsAi, { proposals });
      addAiCompetitors(p, proposals);
    }),
    research: step('research', (p) => save(join(p.researchDir, 'summary.json'), { teams: {} })),
    business: step('business', (p) => save(join(p.auditsDir, 'business.json'), { checks: [] })),
    'business-analyst': step('business-analyst', (p) => save(join(p.researchDir, 'business-ops.json'), { businessModel: { label: 'unknown', evidence: [] }, facts: [], observations: [] })),
    lookups: step('lookups', (p) => save(join(p.auditsDir, 'lookups.json'), { checks: [] })),
    record: step('record', (p) => {
      save(p.record, { sections: {} });
      save(p.questions, { needsInput: false, questions: [] });
      save(p.readiness, {});
    }),
    social: step('social', (p) => {
      save(p.scorecard, { platforms: [] });
      save(p.socialTasks, { tasks: [] });
    }),
    diagnose: step('diagnose', (p) => save(join(p.dir, 'diagnosis', 'diagnosis-raw.json'), { problems: [] })),
    review: step('review', (p) => save(p.diagnosis, { problems: [] })),
  };
}
const span = (timeline, id) => ({ start: timeline.find((e) => e.id === id && e.at === 'start')?.t, end: timeline.find((e) => e.id === id && e.at === 'end')?.t });
const overlap = (a, b) => a.start < b.end && b.start < a.end;
let n = 0;
const newClient = () => createClient({ slug: `g${++n}`, name: `Graph ${n}`, website: '' });

test('the graph is in dependency order, every need exists, and every stage is known', () => {
  const seen = new Set();
  for (const s of STEPS) {
    for (const need of s.needs) assert.ok(seen.has(need), `${s.id} needs ${need}, which must come earlier`);
    assert.ok(STAGES.some((st) => st.id === s.stage), `${s.id} has an unknown stage`);
    if (s.kind === 'code' || s.kind === 'ai') assert.ok(s.outputs && s.resource, `${s.id} needs outputs and a resource`);
    seen.add(s.id);
  }
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
});

test('independent steps run at the same time; a person confirming competitors lets the rest continue to the diagnosis approval', async () => {
  const slug = newClient();
  const timeline = [];
  const runners = fakeRunners(timeline, { proposeCompetitors: 2 });
  const first = await runAuto(slug, { runners, ctx });
  // Website audit and meeting notes start together; then client profiles, competitor search and research together.
  assert.ok(overlap(span(timeline, 'collect'), span(timeline, 'notes')), 'collect and notes overlap');
  assert.ok(overlap(span(timeline, 'competitors'), span(timeline, 'research')), 'competitor search and research overlap');
  assert.ok(span(timeline, 'record').start >= span(timeline, 'research').end, 'the record waits for research');
  assert.equal(first.reason, 'the social media audit needs you');
  assert.equal(first.stoppedAt, 'confirm-competitors');
  const s = first.state;
  assert.equal(s.steps['confirm-competitors'].state, 'open');
  assert.equal(s.steps['confirm-competitors'].count, 2);
  assert.equal(s.steps.social.state, 'blocked');
  assert.deepEqual(s.steps.social.waitingFor, ['confirm-competitors'], 'the waiting step names what it waits for');
  assert.ok(s.tasks[0].id === 'confirm-competitors' && s.tasks[0].blocking);
  assert.equal(s.stages.find((x) => x.id === 'research').state, 'needs-you');
  assert.ok(!first.ran.includes('diagnose'));

  const p = clientPaths(slug);
  const decisions = Object.fromEntries(loadCompetitors(p).list.map((c, i) => [c.id, { status: i === 0 ? 'confirmed' : 'rejected' }]));
  saveCompetitorReview(p, { decisions });
  const second = await runAuto(slug, { runners, ctx });
  assert.deepEqual(second.ran, ['social', 'diagnose', 'review']);
  assert.equal(second.reason, 'waiting for your approval');
  assert.equal(second.stoppedAt, 'gate1');
  assert.equal(second.state.stages.find((x) => x.id === 'diagnosis').state, 'needs-you');
});

test('limits: with one Claude step at a time, competitor search and research never overlap', async () => {
  const slug = newClient();
  const timeline = [];
  await runAuto(slug, { runners: fakeRunners(timeline), ctx, limits: { ai: 1, browser: 2, code: 4 } });
  const ai = ['notes', 'competitors', 'research', 'diagnose', 'review'].map((id) => span(timeline, id)).filter((x) => x.start);
  for (let i = 0; i < ai.length; i++) for (let j = i + 1; j < ai.length; j++) assert.ok(!overlap(ai[i], ai[j]), 'two Claude steps overlapped');
});

test('a person finishing a task while the scheduler is busy wakes it: competitor capture starts before research ends', async () => {
  const slug = newClient();
  const timeline = [];
  const runners = fakeRunners(timeline, { proposeCompetitors: 1, delays: { research: 400, competitors: 10 } });
  const run = runAuto(slug, { runners, ctx });
  const p = clientPaths(slug);
  while (!timeline.some((e) => e.id === 'competitors' && e.at === 'end') || !timeline.some((e) => e.id === 'profiles' && e.at === 'end')) await sleep(5);
  await sleep(20);
  assert.equal(computeState(slug, ctx).steps['confirm-competitors'].state, 'open');
  saveCompetitorReview(p, { decisions: Object.fromEntries(loadCompetitors(p).list.map((c) => [c.id, { status: 'confirmed' }])) });
  assert.equal(nudgeAuto(slug), true);
  assert.equal((await runAuto(slug, { runners, ctx })).reason, 'already running', 'a second start joins the running scheduler');
  await run;
  assert.ok(span(timeline, 'social').start < span(timeline, 'research').end, 'social started while research was still running');
});

test('stopping the scheduler lets running steps finish but starts nothing new (before archive or delete)', async () => {
  const slug = newClient();
  const timeline = [];
  const running = runAuto(slug, { runners: fakeRunners(timeline, { delays: { collect: 80, notes: 80 } }), ctx });
  await sleep(20);
  assert.equal(stopAuto(slug), true);
  const r = await running;
  assert.equal(r.reason, 'stopped');
  assert.deepEqual(r.ran.sort(), ['collect', 'notes'], 'only the steps already running');
  assert.ok(span(timeline, 'collect').end && span(timeline, 'notes').end, 'the running steps finished');
  assert.ok(!timeline.some((e) => ['profiles', 'competitors', 'research'].includes(e.id)), 'nothing new started after the stop');
  assert.equal(stopAuto(slug), false, 'no scheduler is left behind');
});

test('run again, skip, and approvals made before v2 are kept', async () => {
  const slug = newClient();
  const p = clientPaths(slug);
  const runners = fakeRunners([], { proposeCompetitors: 1 });
  await runAuto(slug, { runners, ctx });
  // Skipping the competitor comparison lets the diagnosis go ahead without it.
  skipStep(p, 'competitors');
  let s = computeState(slug, ctx);
  assert.equal(s.steps.competitors.state, 'not_used');
  assert.equal(s.steps['confirm-competitors'].state, 'not_used');
  const r = await runAuto(slug, { runners, ctx });
  assert.ok(r.ran.includes('diagnose'), JSON.stringify(r.ran));
  // "Run again" marks a finished step as ready; everything after it follows once it has run.
  requestStepRun(p, 'notes');
  s = computeState(slug, ctx);
  assert.equal(s.steps.notes.state, 'pending');
  assert.ok(s.ready.includes('notes'));
  assert.equal(s.steps.research.state, 'blocked');
  // A render recorded with the pre-v2 fingerprint (which included the automated reviews) is still up to date.
  save(p.content, { cover: {} });
  save(p.review, { ok: true });
  save(join(p.draftDir, 'render-report.json'), { ok: true });
  const status = load(p.status, { steps: {} });
  for (const id of ['write', 'check']) status.steps[id] = { state: 'done', outputHash: outputHash(p, id), inputHash: 'x' };
  save(p.status, status);
  const legacy = hashOf({ write: status.steps.write.outputHash, plan: status.steps.plan?.outputHash ?? null, check: status.steps.check.outputHash });
  recordStepResult(p, 'render', { state: 'done', outputHash: outputHash(p, 'render'), inputHash: legacy });
  const full = { ...ctx, status: load(p.status) };
  assert.notEqual(hashOf(inputFingerprint(p, 'render', full)), legacy, 'the new fingerprint differs from the old one');
  assert.equal(inputsUnchanged(p, 'render', full, legacy), true, 'an old fingerprint that still matches counts as unchanged');
  save(p.review, { ok: false, changed: true });
  status.steps.check.outputHash = outputHash(p, 'check');
  save(p.status, { ...load(p.status), steps: { ...load(p.status).steps, check: status.steps.check } });
  assert.equal(inputsUnchanged(p, 'render', { ...ctx, status: load(p.status) }, legacy), false, 'once the old inputs change, the step is stale');
});
