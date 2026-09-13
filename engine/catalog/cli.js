#!/usr/bin/env node
// Catalog commands. Usage: node engine/catalog/cli.js <pull-notion|export-csv|import-csv|validate|report|wait-notion-access>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { ROOT, catalogPaths, loadCatalog, saveCatalog, writeFileAtomic } from './store.js';
import { exportCsv, readCsvCatalog, catalogToCsvFiles } from './csv-io.js';
import { validateCatalog } from './validate.js';
import { compareWithBlueprint } from './mismatch.js';
import { renderCatalogReport } from './report.js';
import { createNotionClient, fetchNotionCatalog, NotionError } from './notion.js';
import { mergeNotion } from './merge.js';

const paths = catalogPaths(ROOT);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function loadEnv() {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

function writeReport(lastPull) {
  const doc = loadCatalog(ROOT);
  const { meta, ...catalog } = doc;
  const validation = validateCatalog(catalog);
  const mismatches = compareWithBlueprint(catalog, readJson(join(ROOT, 'rules', 'blueprint-catalog.json')));
  const file = join(paths.reportsDir, 'catalog-report.html');
  writeFileAtomic(file, renderCatalogReport({ root: ROOT, catalog, meta, validation, mismatches, lastPull }));
  return { file, mismatches };
}

function printList(title, items) {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const item of items) console.log(`  - ${item}`);
}

function writePullLog(name, lines) {
  writeFileAtomic(join(paths.reportsDir, name), lines.join('\n') + '\n');
}

async function cmdImportCsv(args) {
  const dir = args[0] ? join(process.cwd(), args[0]) : paths.csvDir;
  const { catalog, errors, warnings } = readCsvCatalog(dir);
  printList('Warnings:', warnings);
  if (errors.length) {
    printList('The CSV files have problems — the local catalog was NOT changed:', errors);
    return 1;
  }
  const result = saveCatalog(catalog, { source: 'csv', root: ROOT });
  printList('Warnings:', result.warnings);
  if (result.errors.length) {
    printList('The CSV data breaks catalog rules — the local catalog was NOT changed:', result.errors);
    return 1;
  }
  console.log(result.unchanged ? 'Catalog unchanged (CSV content is identical to the local catalog).' : `Catalog updated from CSV (hash ${result.hash.slice(0, 12)}).`);
  // Re-export so the CSV files are always in canonical form.
  exportCsv(loadCatalog(ROOT), paths.csvDir);
  const { file } = writeReport(null);
  console.log(`Report: ${file}`);
  return 0;
}

async function cmdExportCsv() {
  const files = exportCsv(loadCatalog(ROOT), paths.csvDir);
  console.log('Exported:');
  for (const f of files) console.log(`  ${f}`);
  return 0;
}

async function cmdValidate() {
  const { meta, ...catalog } = loadCatalog(ROOT);
  const { errors, warnings } = validateCatalog(catalog);
  printList('Errors:', errors);
  printList('Warnings:', warnings);
  console.log(errors.length ? '\nCatalog is INVALID.' : `\nCatalog is valid (source ${meta?.source}, hash ${meta?.contentHash?.slice(0, 12)}).`);
  return errors.length ? 1 : 0;
}

async function cmdReport() {
  const { file, mismatches } = writeReport(null);
  console.log(`Report: ${file}\nBlueprint differences to fix: ${mismatches.filter((m) => m.level === 'fix').length}`);
  return 0;
}

function explainNotionError(e) {
  if (e.status === 401) return 'Notion rejected the token (it may have been regenerated or revoked). Double-click setup-notion-token.cmd and paste the current token.';
  if (e.status === 404 || e.code === 'object_not_found') {
    return [
      'The Notion connection cannot see the catalog databases yet.',
      '1) In Notion, open each database (Services, Offerings, Deliverables) → ••• → Connections → add the connection.',
      '2) If you already did that: the connection belongs to one Notion workspace only. Make sure it was created in the SAME workspace that contains these databases; if not, create it there and save its token with setup-notion-token.cmd.',
      'The local catalog keeps working meanwhile.',
    ].join('\n');
  }
  if (e.code === 'missing_token') return e.message;
  return `Notion API error: ${e.message}`;
}

async function cmdPullNotion() {
  loadEnv();
  const source = readJson(paths.notionSourceFile);
  const { meta, ...local } = loadCatalog(ROOT);
  let notion;
  try {
    const client = createNotionClient({ token: process.env.NOTION_TOKEN, version: source.notionVersion });
    notion = await fetchNotionCatalog(client, source);
  } catch (e) {
    console.error(e instanceof NotionError ? explainNotionError(e) : `Could not reach Notion: ${e.message}`);
    console.error('The local catalog was NOT changed.');
    return 1;
  }
  return applyNotionData(local, notion, source, 'notion');
}

export function applyNotionData(local, notion, source, sourceLabel) {
  const { catalog, changes, problems } = mergeNotion(local, notion, source);
  const counts = `${notion.services.rows.length} services, ${notion.offerings.rows.length} offerings, ${notion.deliverables.rows.length} deliverables`;
  const log = [`# Catalog pull — ${new Date().toISOString()}`, '', `Source: ${sourceLabel}. Read from Notion: ${counts}.`, ''];
  log.push('## Changes', ...(changes.length ? changes.map((c) => `- ${c.table} \`${c.id}\` ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`) : ['- none']), '');
  log.push('## Needs attention', ...(problems.length ? problems.map((p) => `- ${p}`) : ['- nothing']), '');

  const { errors } = validateCatalog(catalog);
  if (errors.length) {
    const files = catalogToCsvFiles(catalog);
    for (const [name, text] of Object.entries(files)) writeFileAtomic(join(paths.pendingDir, name), text);
    log.push('## Not saved — the merged catalog breaks catalog rules', ...errors.map((e) => `- ${e}`), '', `Fill in the missing fields in catalog/pending/*.csv, copy them to catalog/csv/, then run: npm run catalog:import-csv`);
    writePullLog('last-pull.md', log);
    printList('Needs attention:', problems);
    printList('The data from Notion breaks catalog rules — the local catalog was NOT changed:', errors);
    console.error(`\nA merged copy was written to ${paths.pendingDir} so you can fill in what is missing, then run "npm run catalog:import-csv".`);
    return 1;
  }

  const result = saveCatalog(catalog, { source: sourceLabel, root: ROOT });
  exportCsv(loadCatalog(ROOT), paths.csvDir);
  writePullLog('last-pull.md', log);
  const summary = `${result.unchanged ? 'no changes' : `${changes.length} change(s) saved`} · ${counts} read from ${sourceLabel}`;
  const { file, mismatches } = writeReport({ summary, problems });
  console.log(`Catalog pull complete: ${summary}.`);
  printList('Needs attention:', problems);
  console.log(`Blueprint differences to fix: ${mismatches.filter((m) => m.level === 'fix').length}\nReport: ${file}\nChange log: ${join(paths.reportsDir, 'last-pull.md')}`);
  return 0;
}

// Polls until the Notion connection can read all three databases (used to continue automatically after access is granted).
async function cmdWaitNotionAccess(args) {
  const minutes = Number(args[0] || 180);
  const source = readJson(paths.notionSourceFile);
  const envFile = join(ROOT, '.env.local');
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    // Re-read the token every round so a token saved later with setup-notion-token.cmd is picked up.
    const token = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).NOTION_TOKEN : process.env.NOTION_TOKEN;
    if (!token) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    const client = createNotionClient({ token, version: source.notionVersion });
    let ok = 0;
    for (const t of ['services', 'offerings', 'deliverables']) {
      try {
        await client.request('GET', `/databases/${source.databases[t].databaseId}`);
        ok++;
      } catch (e) {
        if (!(e instanceof NotionError) || ![401, 403, 404].includes(e.status)) console.error(`Check failed: ${e.message}`);
      }
    }
    if (ok === 3) {
      console.log('Notion access granted for all 3 databases.');
      return 0;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  console.log(`Still no access after ${minutes} minutes.`);
  return 2;
}

// Creates the catalog databases in the token's Notion workspace from the local catalog, then points the pull at them.
async function cmdBootstrapNotion(args) {
  loadEnv();
  const source = readJson(paths.notionSourceFile);
  const force = args.includes('--force');
  const parentPageId = args.find((a) => !a.startsWith('--'));
  const client = createNotionClient({ token: process.env.NOTION_TOKEN, version: source.notionVersion });
  if (!force) {
    try {
      await client.request('GET', `/databases/${source.databases.services.databaseId}`);
      console.log('The configured Notion databases are already reachable — nothing to bootstrap. Use --force to create a new copy anyway.');
      return 1;
    } catch (e) {
      if (!(e instanceof NotionError) || e.status !== 404) throw e;
    }
  }
  const { meta, ...catalog } = loadCatalog(ROOT);
  const { bootstrapNotion } = await import('./notion-bootstrap.js');
  const created = await bootstrapNotion(client, catalog, { parentPageId, log: (m) => console.log(m) });
  const { databases: previousDatabases, previous, ...rest } = source;
  const next = {
    ...rest,
    databases: created.databases,
    notionPage: created.containerUrl || created.containerPageId,
    previous: { databases: previousDatabases, replacedAt: new Date().toISOString(), reason: 'Previous databases are not reachable with the configured Notion connection' },
  };
  writeFileAtomic(paths.notionSourceFile, JSON.stringify(next, null, 2) + '\n');
  console.log(`catalog/notion-source.json now points to the new databases. Notion page: ${next.notionPage}`);
  return cmdPullNotion();
}

const commands = {
  'bootstrap-notion': cmdBootstrapNotion,
  'pull-notion': cmdPullNotion,
  'export-csv': cmdExportCsv,
  'import-csv': cmdImportCsv,
  validate: cmdValidate,
  report: cmdReport,
  'wait-notion-access': cmdWaitNotionAccess,
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [name, ...args] = process.argv.slice(2);
  const cmd = commands[name];
  if (!cmd) {
    console.log(`Usage: node engine/catalog/cli.js <${Object.keys(commands).join('|')}>`);
    process.exit(1);
  }
  // Set exitCode instead of calling process.exit(): exiting while fetch sockets are closing crashes Node on Windows (libuv assertion).
  cmd(args)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error(e.stack || e.message);
      process.exitCode = 1;
    });
}
