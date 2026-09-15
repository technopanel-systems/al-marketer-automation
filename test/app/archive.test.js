// Archive and delete: a proposal leaves the list without touching a new proposal for the same customer, can be restored,
// and is never moved or deleted while work is still writing into it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-archive-'));
process.env.ALM_CLIENTS_DIR = root;
process.env.ALM_NO_AUTORUN = '1';
const { clientPaths, listClients, load, save } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { logActivity } = await import('../../pipeline/run.js');
const { archiveClient, listArchived, restoreArchived, deleteArchived, deleteClient, validArchiveId } = await import('../../pipeline/archive.js');
const { sideJob, removeClient, keepClient, pendingRemoval, kick, jobInfo } = await import('../../app/jobs.js');
after(() => rmSync(root, { recursive: true, force: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brief = { name: 'ALUVI', website: 'https://m-alshareef.com', notes: 'first meeting' };

test('an archived proposal leaves the list, a new one for the same customer starts clean, and restoring never overwrites it', () => {
  const first = createClient(brief);
  assert.equal(first, 'aluvi');
  const p = clientPaths(first);
  save(p.questions, { questions: [{ id: 'Q1', text: 'old answer' }] });
  mkdirSync(p.outputDir, { recursive: true });
  for (const f of ['aluvi-proposal-v1.pdf', 'aluvi-proposal-v2.pdf', 'aluvi-proposal-v2.html']) writeFileSync(join(p.outputDir, f), 'x');

  const id = archiveClient(first, { status: 'approved', now: new Date('2026-09-15T08:18:59Z') });
  assert.equal(id, 'aluvi--20260915-081859');
  assert.equal(validArchiveId(id), true);
  assert.deepEqual(listClients(), [], 'out of the proposals list');
  assert.ok(!existsSync(p.dir), 'the folder name is free again');
  const [a] = listArchived();
  assert.equal(a.name, 'ALUVI');
  assert.equal(a.status, 'approved');
  assert.equal(a.version, 2);
  assert.deepEqual(a.files, ['aluvi-proposal-v2.html', 'aluvi-proposal-v2.pdf'], 'only the latest approved files');

  const second = createClient({ ...brief, notes: 'second meeting' });
  assert.equal(second, 'aluvi', 'same readable folder name');
  assert.equal(load(clientPaths(second).questions, null), null, 'nothing carried over from the archived proposal');

  const restored = restoreArchived(id);
  assert.equal(restored, 'aluvi-2', 'restored next to the new one, not over it');
  assert.ok(existsSync(join(clientPaths(restored).questions)));
  assert.ok(!existsSync(join(clientPaths(restored).dir, 'archived.json')));
  assert.equal(readFileSync(clientPaths(second).notes, 'utf8'), 'second meeting', 'the new proposal keeps its own notes');
  assert.equal(readFileSync(clientPaths(restored).notes, 'utf8'), 'first meeting');
  assert.deepEqual(listClients(), ['aluvi', 'aluvi-2']);
  assert.deepEqual(listArchived(), []);

  const again = archiveClient('aluvi-2');
  deleteArchived(again);
  deleteClient('aluvi');
  assert.deepEqual(listClients(), []);
  assert.deepEqual(listArchived(), []);
  assert.deepEqual(readdirSync(root).filter((d) => d !== '_archive'), [], 'nothing left behind, not even an empty trash folder');
});

test('archive ids cannot reach outside the archive, and a removed proposal does not come back through its log', () => {
  for (const bad of ['../aluvi--20260915-081859', 'aluvi--20260915-081859/../../x', 'aluvi', '_archive', '']) assert.equal(validArchiveId(bad), false, bad);
  assert.throws(() => deleteArchived('../../etc'), /does not exist/);
  const slug = createClient({ name: 'Ghost Test' });
  deleteClient(slug);
  logActivity(slug, 'a late line from a step that was still running');
  assert.ok(!existsSync(clientPaths(slug).dir), 'no empty folder is recreated under the old name');
});

test('while work runs, archive/delete waits: nothing new starts, and it happens when the work ends (or is cancelled)', async () => {
  const slug = createClient({ name: 'Busy Client' });
  let finish;
  sideJob(slug, 'Capture', () => new Promise((r) => (finish = r)));
  await sleep(0);
  assert.equal(jobInfo(slug).running, true);

  const r = removeClient(slug, 'delete');
  assert.deepEqual(r, { ok: true, pending: true });
  assert.equal(pendingRemoval(slug).action, 'delete');
  assert.ok(existsSync(clientPaths(slug).intake), 'not removed while the job writes into it');
  assert.equal(kick(slug), 'disabled');
  delete process.env.ALM_NO_AUTORUN;
  assert.equal(kick(slug), 'removing', 'the scheduler does not start for a proposal being removed');
  process.env.ALM_NO_AUTORUN = '1';
  assert.equal(sideJob(slug, 'Another capture', async () => {}), false, 'no new job either');

  assert.equal(keepClient(slug), true, 'the request can be cancelled');
  assert.equal(pendingRemoval(slug), null);
  assert.equal(removeClient(slug, 'archive').pending, true);
  finish();
  await sleep(50);
  assert.ok(!existsSync(clientPaths(slug).dir), 'removed once the job ended');
  const archived = listArchived().find((a) => a.slug === slug);
  assert.ok(archived, 'archived, as asked the second time');
  assert.equal(archived.status, 'received');

  const idle = createClient({ name: 'Idle Client' });
  assert.equal(removeClient(idle, 'delete').pending, false, 'with nothing running it happens at once');
  assert.ok(!existsSync(clientPaths(idle).dir));
  assert.equal(removeClient(idle, 'delete').ok, false, 'a second request reports that it is gone');
  assert.ok(!existsSync(clientPaths(idle).dir), 'and does not bring the folder back');
});
