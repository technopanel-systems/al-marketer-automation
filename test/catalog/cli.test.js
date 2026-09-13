// End-to-end tests of the catalog commands against a temporary copy of the project data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(repo, 'engine', 'catalog', 'cli.js');

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'alm-catalog-'));
  cpSync(join(repo, 'catalog'), join(root, 'catalog'), { recursive: true });
  cpSync(join(repo, 'rules'), join(root, 'rules'), { recursive: true });
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, ALM_ROOT: root, NOTION_TOKEN: '' }, encoding: 'utf8' });

test('export → import round-trip leaves catalog.json byte-for-byte identical', () => {
  const root = sandbox();
  try {
    const before = readFileSync(join(root, 'catalog', 'catalog.json'), 'utf8');
    assert.equal(run(root, 'export-csv').status, 0);
    const imp = run(root, 'import-csv');
    assert.equal(imp.status, 0, imp.stdout + imp.stderr);
    assert.match(imp.stdout, /Catalog unchanged/);
    assert.equal(readFileSync(join(root, 'catalog', 'catalog.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a broken CSV is rejected and the local catalog stays unchanged', () => {
  const root = sandbox();
  try {
    const catalogFile = join(root, 'catalog', 'catalog.json');
    const before = readFileSync(catalogFile, 'utf8');
    const csvFile = join(root, 'catalog', 'csv', 'deliverables.csv');
    const broken = readFileSync(csvFile, 'utf8').replace(',fixed,research,', ',fixed,launch,').replace(',no,no,,', ',maybe,no,,');
    writeFileSync(csvFile, broken);
    const imp = run(root, 'import-csv');
    assert.equal(imp.status, 1);
    assert.match(imp.stdout, /NOT changed/);
    assert.match(imp.stdout, /must be yes or no/);
    assert.equal(readFileSync(catalogFile, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an edited CSV (e.g. from Google Sheets, no BOM, LF endings) updates the catalog', () => {
  const root = sandbox();
  try {
    const csvFile = join(root, 'catalog', 'csv', 'services.csv');
    const edited = readFileSync(csvFile, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace('إدارة المواقع', 'إدارة وتطوير المواقع');
    writeFileSync(csvFile, edited);
    const imp = run(root, 'import-csv');
    assert.equal(imp.status, 0, imp.stdout + imp.stderr);
    const doc = JSON.parse(readFileSync(join(root, 'catalog', 'catalog.json'), 'utf8'));
    assert.equal(doc.services.find((s) => s.id === 'svc.website_management').nameAr, 'إدارة وتطوير المواقع');
    assert.equal(doc.meta.source, 'csv');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pull without a token fails clearly and changes nothing', () => {
  const root = sandbox();
  try {
    const catalogFile = join(root, 'catalog', 'catalog.json');
    const before = readFileSync(catalogFile, 'utf8');
    const res = spawnSync(process.execPath, [cli, 'pull-notion'], { env: { ...process.env, ALM_ROOT: root, NOTION_TOKEN: '' }, encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /NOTION_TOKEN is not set/);
    assert.equal(readFileSync(catalogFile, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the real project catalog is valid', () => {
  const res = spawnSync(process.execPath, [cli, 'validate'], { env: { ...process.env, ALM_ROOT: repo }, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});
