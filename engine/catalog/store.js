// Reads and writes the local catalog — the single source of truth the engine uses.
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, canonicalCatalog, contentHash } from './model.js';
import { validateCatalog } from './validate.js';

// ALM_ROOT lets tests run the commands against a temporary copy of the project data.
export const ROOT = process.env.ALM_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function catalogPaths(root = ROOT) {
  const dir = join(root, 'catalog');
  return {
    dir,
    catalogFile: join(dir, 'catalog.json'),
    csvDir: join(dir, 'csv'),
    pendingDir: join(dir, 'pending'),
    reportsDir: join(dir, 'reports'),
    notionSourceFile: join(dir, 'notion-source.json'),
  };
}

export function loadCatalog(root = ROOT) {
  const { catalogFile } = catalogPaths(root);
  if (!existsSync(catalogFile)) {
    throw new Error(`No local catalog at ${catalogFile}. Run "npm run catalog:import-csv" or "npm run catalog:pull-notion" first.`);
  }
  return JSON.parse(readFileSync(catalogFile, 'utf8'));
}

export function writeFileAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

// Validates and saves. Returns { saved, unchanged, errors, warnings, hash }.
// If the content is identical to what is on disk, the file is left untouched (stable round-trips).
export function saveCatalog(catalog, { source, root = ROOT, now = new Date() } = {}) {
  const { errors, warnings } = validateCatalog(catalog);
  if (errors.length) return { saved: false, unchanged: false, errors, warnings, hash: null };

  const hash = contentHash(catalog);
  const { catalogFile } = catalogPaths(root);
  if (existsSync(catalogFile)) {
    try {
      const existing = JSON.parse(readFileSync(catalogFile, 'utf8'));
      if (existing.meta?.contentHash === hash) return { saved: false, unchanged: true, errors, warnings, hash };
    } catch {
      // unreadable existing file: overwrite with the valid catalog
    }
  }
  const doc = {
    meta: { schemaVersion: SCHEMA_VERSION, source, updatedAt: now.toISOString(), contentHash: hash },
    ...canonicalCatalog(catalog),
  };
  delete doc.schemaVersion;
  writeFileAtomic(catalogFile, JSON.stringify(doc, null, 2) + '\n');
  return { saved: true, unchanged: false, errors, warnings, hash };
}
