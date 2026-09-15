// Editing after the PDF: every text is a version that can be restored; the slide editor and the AI chat only change
// what they were asked to, within the writer's limits, and the reviews and design run again.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = mkdtempSync(join(tmpdir(), 'alm-versions-'));
process.env.ALM_CLIENTS_DIR = root;
const { clientPaths, save, load } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { listVersions, snapshot, applyContent, restoreVersion, validateContent } = await import('../../pipeline/versions.js');
const { contentFromForm } = await import('../../app/views/editor.js');
const { contentSchema } = await import('../../ai/steps/write.js');
const { changedPaths, textPlaces, applyTextChanges } = await import('../../ai/steps/edit.js');
after(() => rmSync(root, { recursive: true, force: true }));

const sample = JSON.parse(readFileSync(join(repo, 'samples', 'hijab-store', 'content.json'), 'utf8'));
const problemIds = sample.problems.items.map((x) => x.problemId);

test('the AI text, an editor change and a restore are all versions; restoring brings the old text back', () => {
  createClient({ slug: 'v', name: 'Versions' });
  const p = clientPaths('v');
  save(p.content, { ...sample, _meta: { problemIds } });
  assert.equal(snapshot(p, load(p.content), { source: 'write' }), 1);
  assert.equal(snapshot(p, load(p.content), { source: 'write' }), 1, 'the same text is not kept twice');

  const form = new URLSearchParams();
  form.set('f:cover.subtitle', 'وعد جديد للعرض');
  form.set('f:tracking.principleLines.0', 'سطر أول');
  form.set('f:tracking.principleLines.1', 'سطر ثاني');
  form.set('f:tracking.principleLines.2', '');
  const edited = contentFromForm(load(p.content), form);
  assert.equal(edited.cover.subtitle, 'وعد جديد للعرض');
  assert.deepEqual(edited.tracking.principleLines, ['سطر أول', 'سطر ثاني'], 'an empty optional line is removed');
  assert.equal(edited.business.title, sample.business.title, 'fields not in the form stay as they were');
  assert.deepEqual(validateContent(edited, contentSchema(problemIds)), []);

  const n = applyContent(p, edited, { source: 'editor' });
  assert.equal(n, 2);
  assert.equal(load(p.content).cover.subtitle, 'وعد جديد للعرض');
  assert.equal(load(p.status).steps.write.state, 'done', 'the edited text becomes the writing result, so reviews and design follow');
  restoreVersion(p, 1);
  assert.equal(load(p.content).cover.subtitle, sample.cover.subtitle);
  assert.deepEqual(listVersions(p).map((v) => v.source), ['write', 'editor', 'restore']);
  assert.throws(() => restoreVersion(p, 99), /does not exist/);
});

test('the editor refuses text longer than a slide allows, and the chat shows exactly what changed', () => {
  const tooLong = contentFromForm(sample, new URLSearchParams({ 'f:cover.subtitle': 'ك'.repeat(300) }));
  assert.match(validateContent(tooLong, contentSchema(problemIds)).join(' '), /cover › subtitle: too long \(at most 90 characters\)/);
  const changed = changedPaths(sample, { ...sample, cover: { ...sample.cover, lead: 'جملة جديدة' } });
  assert.deepEqual(changed.map((c) => c.path), ['cover.lead']);
});

test('the AI chat returns only the texts it changes; code puts them in place and refuses anything that is not an existing text', () => {
  const places = textPlaces(sample).map((x) => x.path);
  assert.ok(places.includes('cover.lead') && places.includes('tracking.principleLines[1]') && places.includes('problems.items[0].title'));
  assert.ok(!places.some((x) => /basedOn|problemId|icon/.test(x)), 'evidence ids, problem ids and icons are not text');

  const { content, problems } = applyTextChanges(sample, [{ path: 'cover.lead', text: 'جملة أقصر' }, { path: 'problems.items[0].title', text: 'عنوان جديد' }]);
  assert.deepEqual(problems, []);
  assert.equal(content.cover.lead, 'جملة أقصر');
  assert.deepEqual(changedPaths(sample, content).map((c) => c.path), ['cover.lead', 'problems.items.0.title'], 'nothing else changed');
  assert.notEqual(sample.cover.lead, 'جملة أقصر', 'the current proposal is not modified in place');

  const refused = applyTextChanges(sample, [
    { path: 'cover.newLine', text: 'x' },
    { path: 'business.cards[0].basedOn[0]', text: 'E999' },
    { path: 'problems.items[40].text', text: 'x' },
    { path: '__proto__.polluted', text: 'x' },
    { path: 'problems.items', text: 'x' },
  ]);
  assert.equal(refused.problems.length, 5);
  assert.deepEqual(refused.content, sample);
  assert.equal({}.polluted, undefined);
});

test('a chat request applies the AI text as a new version; a request that changes nothing adds no version', async () => {
  const { chatEdit } = await import('../../pipeline/run.js');
  const p = clientPaths('v');
  save(p.gate1, { dialect: 'saudi' });
  // A minimal approved plan on disk so the chat has its context.
  const { loadCatalogAndRules } = await import('../../engine/rules/load.js');
  const { buildPlan } = await import('../../engine/plan/build.js');
  const input = JSON.parse(readFileSync(join(repo, 'samples', 'hijab-store', 'plan-input.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(p.planDir, { recursive: true });
  for (const [name, value] of Object.entries({ scope: plan.scope, schedule: plan.schedule, kpis: plan.kpis, checks: plan.checks })) writeFileSync(join(p.planDir, `${name}.json`), JSON.stringify(value));
  save(p.scope, plan.scope);
  const before = listVersions(p).length;
  let seen;
  const runner = async (_, args) => {
    seen = args;
    return { content: { ...load(p.content), cover: { ...load(p.content).cover, lead: 'جملة أقصر' } }, summary: 'Shortened the cover sentence.', notDone: [], changes: [{ path: 'cover.lead' }], costUsd: 0.04 };
  };
  const reply = await chatEdit(p, 'خلي جملة الغلاف أقصر', { ctx: { catalog }, runner }).catch((e) => ({ error: e.message }));
  assert.equal(reply.error, undefined, reply.error);
  assert.equal(seen.dialect, 'saudi', 'the chat writes in the approved Arabic style');
  assert.equal(reply.changes, 1);
  assert.equal(load(p.content).cover.lead, 'جملة أقصر');
  assert.equal(listVersions(p).length, before + 1);
  const same = await chatEdit(p, 'change the KPIs', { ctx: { catalog }, runner: async () => ({ content: load(p.content), summary: 'KPIs come from the approved scope.', notDone: ['KPIs are decided by the scope page'], changes: [], costUsd: 0.01 }) });
  assert.equal(same.changes, 0);
  assert.equal(listVersions(p).length, before + 1, 'no version for no change');
  const chat = load(p.chat).messages;
  assert.equal(chat.length, 4);
  assert.deepEqual(chat.map((m) => m.role), ['you', 'ai', 'you', 'ai']);
});
