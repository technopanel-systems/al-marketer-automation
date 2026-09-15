// Control Center: every page renders, old links redirect, the team's actions change the right files, text is escaped.
// Background work is switched off (ALM_NO_AUTORUN) so nothing runs a real browser or Claude here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = mkdtempSync(join(tmpdir(), 'alm-app-'));
process.env.ALM_CLIENTS_DIR = root;
process.env.ALM_NO_AUTORUN = '1';
process.env.ALM_AI_MODE = 'files';

const { createServer } = await import('../../app/server.js');
const { createClient } = await import('../../pipeline/cli.js');
const { clientPaths, load, save } = await import('../../pipeline/client.js');
const { addAiCompetitors, loadCompetitors } = await import('../../pipeline/social.js');
const { computeState } = await import('../../pipeline/steps.js');
const { engineContext } = await import('../../pipeline/run.js');

let server;
let base;
const slug = 'aluvi';
before(async () => {
  createClient({ name: 'مصنع <script>alert(1)</script>', displayName: 'ALUVI', website: 'https://m-alshareef.com', market: 'Saudi Arabia', notes: 'ملاحظات الاجتماع' });
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const get = (path) => fetch(base + path, { redirect: 'manual' });
const post = (path, fields) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

test('the new client gets a readable folder name and every page renders', async () => {
  assert.ok(existsSync(join(root, slug, 'intake.json')), 'folder named after the cover name');
  const pages = ['/', '/new', '/catalog', '/help', `/c/${slug}/brief`, `/c/${slug}/research`, `/c/${slug}/evidence`, `/c/${slug}/record`, `/c/${slug}/social`, `/c/${slug}/diagnosis`, `/c/${slug}/scope`, `/c/${slug}/proposal`, `/c/${slug}/delivery`, `/c/${slug}/activity`, `/c/${slug}/social/capture?b=client&pl=linkedin`];
  for (const path of pages) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.ok(!html.includes('<script>alert(1)</script>'), `${path} escapes user text`);
  }
  const css = await get('/static/app.css');
  assert.equal(css.status, 200);
  assert.equal((await get('/static/brand-fonts.css')).status, 200);
  assert.equal((await get('/static/logo-dark.png')).status, 200);
});

test('a client link opens the stage that needs attention, and v1 links redirect', async () => {
  const res = await get(`/c/${slug}`);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), `/c/${slug}/research`);
  assert.equal((await get(`/c/${slug}/gate1`)).headers.get('location'), `/c/${slug}/diagnosis`);
  assert.equal((await get(`/c/${slug}/gate3`)).headers.get('location'), `/c/${slug}/proposal`);
  assert.equal((await get(`/c/${slug}/questions`)).headers.get('location'), `/c/${slug}/research#questions`);
  assert.equal((await get('/c/nobody/research')).status, 404);
  assert.equal((await get(`/c/${slug}/files/../../intake.json`)).status, 404, 'files outside the client folder are refused');
});

test('home lists what needs a person with a direct link', async () => {
  const p = clientPaths(slug);
  save(p.competitorsAi, { proposals: [] });
  addAiCompetitors(p, [{ name: 'Magico', website: 'https://magico-sa.com', socials: [], reason: 'aluminium facades in Riyadh', confidence: 'medium' }]);
  const status = load(p.status, { steps: {} });
  // Mark the competitor search as done so the confirmation task opens.
  const { outputHash, inputFingerprint } = await import('../../pipeline/steps.js');
  const { hashOf } = await import('../../engine/util/data.js');
  const ctx = engineContext();
  for (const id of ['collect', 'notes']) {
    const file = id === 'collect' ? join(p.evidenceDir, 'collect-summary.json') : join(p.researchDir, 'notes.json');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '{}');
    status.steps[id] = { state: 'done', outputHash: outputHash(p, id) };
    status.steps[id].inputHash = hashOf(inputFingerprint(p, id, { ...ctx, status }));
  }
  status.steps.competitors = { state: 'done', outputHash: outputHash(p, 'competitors') };
  status.steps.competitors.inputHash = hashOf(inputFingerprint(p, 'competitors', { ...ctx, status }));
  save(p.status, status);
  assert.equal(computeState(slug, ctx).steps['confirm-competitors'].state, 'open');
  const html = await (await get('/')).text();
  assert.match(html, /Confirm competitors/);
  assert.match(html, new RegExp(`/c/${slug}/research#competitors`));
  const research = await (await get(`/c/${slug}/research`)).text();
  assert.match(research, /1 competitor to decide/);
});

test('confirming competitors, answering questions, skipping and saving the brief change the right files', async () => {
  const p = clientPaths(slug);
  const c = loadCompetitors(p).list[0];
  let res = await post(`/c/${slug}/competitors`, { action: 'save-competitors', [`status_${c.id}`]: 'confirmed', new_name: 'Aluminumsa', new_website: 'aluminumsa.com' });
  assert.equal(res.status, 303);
  assert.match(decodeURIComponent(res.headers.get('location')), /Confirmed competitors are being captured/);
  const doc = loadCompetitors(p);
  assert.equal(doc.list.find((x) => x.id === c.id).status, 'confirmed');
  assert.ok(doc.list.some((x) => x.name === 'Aluminumsa' && x.status === 'confirmed'));
  assert.equal(computeState(slug, engineContext()).steps['confirm-competitors'].state, 'done');

  res = await post(`/c/${slug}/questions`, { action: 'save', 'q:readiness:ad_budget': 'yes' });
  assert.equal(res.status, 303);
  assert.equal(load(join(p.recordDir, 'answers.json'))['readiness:ad_budget'].answer, 'yes');

  res = await post(`/c/${slug}/skip`, { step: 'competitors' });
  assert.equal(computeState(slug, engineContext()).steps.competitors.state, 'not_used');
  res = await post(`/c/${slug}/run`, { step: 'competitors' });
  assert.equal(load(p.status).steps.competitors.force, true, '"Run again" asks the scheduler to run the step');

  res = await post(`/c/${slug}/brief`, { name: 'ignored', displayName: 'ALUVI', presentedTo: 'محمد الباز', website: 'https://m-alshareef.com', socials: 'https://www.linkedin.com/company/m-alshareef/\nlinkedin.com/company/manahi_alshareefco/', market: 'Saudi Arabia', industry: 'manufacturing', competitors: '', constraints: 'two entities', notes: 'new notes' });
  const intake = load(p.intake);
  assert.equal(intake.name, 'مصنع <script>alert(1)</script>', 'the client name cannot be changed from the brief');
  assert.equal(intake.industry, 'manufacturing');
  assert.equal(intake.socials.length, 2);
  assert.equal(readFileSync(p.notes, 'utf8').trim(), 'new notes');
});

test('the live state endpoint and events stream answer', async () => {
  const s = await (await get(`/api/c/${slug}/state`)).json();
  assert.ok(s.stages.research && s.steps.collect && typeof s.signature === 'string');
  const controller = new AbortController();
  const res = await fetch(`${base}/events?slug=${slug}`, { signal: controller.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = res.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /retry: 3000/);
  controller.abort();
});
