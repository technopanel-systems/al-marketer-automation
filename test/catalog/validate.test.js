import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../../engine/catalog/validate.js';
import { sampleCatalog, clone } from './fixtures.js';

const errorsOf = (catalog) => validateCatalog(catalog).errors;

test('sample catalog is valid', () => {
  assert.deepEqual(errorsOf(sampleCatalog()), []);
});

test('rejects duplicate ids', () => {
  const c = sampleCatalog();
  c.deliverables.push(clone(c.deliverables[0]));
  assert.ok(errorsOf(c).some((e) => e.includes('Duplicate id "del.master_sheet"')));
});

test('rejects a deliverable whose parent does not exist', () => {
  const c = sampleCatalog();
  c.deliverables[4].parentId = 'off.missing';
  assert.ok(errorsOf(c).some((e) => e.includes('parent_id "off.missing"')));
});

test('rejects a deliverable attached directly to a service that has offerings', () => {
  const c = sampleCatalog();
  c.deliverables[4].parentId = 'svc.website';
  assert.ok(errorsOf(c).some((e) => e.includes('hangs directly on service "svc.website"')));
});

test('requires exactly three strategic services', () => {
  const c = sampleCatalog();
  c.services[3].strategic = true;
  assert.ok(errorsOf(c).some((e) => e.includes('exactly 3 active strategic services')));
});

test('rejects unknown stage and kind values', () => {
  const c = sampleCatalog();
  c.deliverables[4].stage = 'launch';
  c.deliverables[5].kind = 'maybe';
  const errors = errorsOf(c);
  assert.ok(errors.some((e) => e.includes('column "stage"')));
  assert.ok(errors.some((e) => e.includes('column "kind"')));
});

test('rejects dependency cycles and unknown dependencies', () => {
  const c = sampleCatalog();
  c.deliverables[4].dependsOn = ['del.seo_implementation'];
  c.deliverables[3].dependsOn = ['del.nope'];
  const errors = errorsOf(c);
  assert.ok(errors.some((e) => e.startsWith('Dependency cycle')));
  assert.ok(errors.some((e) => e.includes('depends_on "del.nope"')));
});

test('rejects strategic stage outside strategic services', () => {
  const c = sampleCatalog();
  c.deliverables[4].stage = 'strategic';
  assert.ok(errorsOf(c).some((e) => e.includes('belongs to non-strategic service')));
});

test('blank capability is a warning, not an error', () => {
  const c = sampleCatalog();
  c.services[3].capability = null;
  const { errors, warnings } = validateCatalog(c);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('no capability score')));
});
