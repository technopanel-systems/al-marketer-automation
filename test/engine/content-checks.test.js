import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runContentChecks } from '../../engine/checks/content-checks.js';
import { extractNumbers } from '../../engine/util/text.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = () => {
  const c = JSON.parse(readFileSync(join(here, '..', '..', 'samples', 'hijab-store', 'content.json'), 'utf8'));
  delete c._comment;
  return c;
};
const notes = readFileSync(join(here, '..', '..', 'samples', 'hijab-store', 'meeting-notes.md'), 'utf8');
const base = (content) => ({
  content,
  problemIds: ['P1', 'P2', 'P3'],
  allowedNumbers: new Set([...extractNumbers(notes), 1, 2, 3, 4, 12]),
  humanNumbers: new Set(extractNumbers(notes)),
  outOfScopeNames: ['تسويق المؤثرين', 'التسويق بالإيميل'],
  latinTerms: ['Hijab Store', 'Zid', 'Meta', 'Meta Ad Library', 'Facebook', 'Instagram', 'TikTok', 'Code', 'Pilot'],
  knownEvidenceIds: new Set(['N001']),
});
const errors = (o) => runContentChecks(o).filter((r) => r.level === 'error' && !r.ok).map((r) => r.id);

test('the hand-written sample proposal passes every blocking check', () => {
  assert.deepEqual(errors(base(sample())), []);
});

test('C2/C3: a missing or unapproved problem is caught in every section', () => {
  const c = sample();
  c.problems.items.pop();
  c.impact.items.push({ problemId: 'P9', title: 'x', text: 'y' });
  const ids = errors(base(c));
  assert.ok(ids.includes('C2'));
  assert.ok(ids.includes('C3a'));
});

test('C4: forbidden service names and out-of-scope services are caught', () => {
  const c = sample();
  c.solutions.items[0].why = 'هنشتغل على الميديا باينج وكمان تسويق المؤثرين.';
  assert.ok(errors(base(c)).includes('C4'));
});

test('C5: guarantees are caught', () => {
  const c = sample();
  c.expected.rows[0].expected = 'نضمن مبيعات أعلى';
  assert.ok(errors(base(c)).includes('C5'));
});

test('C6: invented numbers are caught, and "expected" only accepts numbers the client gave', () => {
  const c = sample();
  c.brand.stats[0].value = '47';
  assert.ok(errors(base(c)).includes('C6'));
  const d = sample();
  d.expected.rows[0].expected = 'زيادة المبيعات 3 مرات';
  assert.ok(errors({ ...base(d), humanNumbers: new Set([28]) }).includes('C6'));
});

test('C7: citations must resolve; C9: internal ids must not leak', () => {
  const c = sample();
  c.business.cards[0].basedOn = ['E999'];
  c.problems.items[0].text = 'زي ما في K004 و svc.brand_management';
  const ids = errors(base(c));
  assert.ok(ids.includes('C7'));
  assert.ok(ids.includes('C9'));
});

test('C8: English text in an Arabic proposal is caught', () => {
  const c = sample();
  for (const item of c.problems.items) item.text = 'The brand appearance is not consistent across channels and needs a clear identity system.';
  for (const item of c.impact.items) item.text = 'Customers do not trust brands that look different everywhere they see them.';
  assert.ok(errors(base(c)).includes('C8'));
});
