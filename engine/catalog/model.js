// Catalog data model: table definitions, enums, CSV column mapping, canonical form and hashing.
import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 1;

export const STAGES = ['strategic', 'research', 'plan', 'execution', 'monitoring', 'optimization', 'report'];
export const KINDS = ['fixed', 'conditional'];

// Column order in the CSV files. "type" drives conversion between CSV text and JSON values.
export const TABLES = {
  services: {
    file: 'services.csv',
    prefix: 'svc.',
    columns: [
      { csv: 'id', key: 'id', type: 'string' },
      { csv: 'sort_order', key: 'sortOrder', type: 'int' },
      { csv: 'name_en', key: 'nameEn', type: 'string' },
      { csv: 'name_ar', key: 'nameAr', type: 'string' },
      { csv: 'strategic', key: 'strategic', type: 'bool' },
      { csv: 'capability', key: 'capability', type: 'intOrNull' },
      { csv: 'description_ar', key: 'descriptionAr', type: 'string' },
      { csv: 'notion_name', key: 'notionName', type: 'string' },
      { csv: 'notion_page_id', key: 'notionPageId', type: 'string' },
      { csv: 'active', key: 'active', type: 'bool' },
    ],
  },
  offerings: {
    file: 'offerings.csv',
    prefix: 'off.',
    columns: [
      { csv: 'id', key: 'id', type: 'string' },
      { csv: 'service_id', key: 'serviceId', type: 'string' },
      { csv: 'sort_order', key: 'sortOrder', type: 'int' },
      { csv: 'name_en', key: 'nameEn', type: 'string' },
      { csv: 'name_ar', key: 'nameAr', type: 'string' },
      { csv: 'description_ar', key: 'descriptionAr', type: 'string' },
      { csv: 'notion_name', key: 'notionName', type: 'string' },
      { csv: 'notion_page_id', key: 'notionPageId', type: 'string' },
      { csv: 'active', key: 'active', type: 'bool' },
    ],
  },
  deliverables: {
    file: 'deliverables.csv',
    prefix: 'del.',
    columns: [
      { csv: 'id', key: 'id', type: 'string' },
      { csv: 'parent_id', key: 'parentId', type: 'string' },
      { csv: 'sort_order', key: 'sortOrder', type: 'int' },
      { csv: 'name_en', key: 'nameEn', type: 'string' },
      { csv: 'name_ar', key: 'nameAr', type: 'string' },
      { csv: 'kind', key: 'kind', type: 'string' },
      { csv: 'stage', key: 'stage', type: 'string' },
      { csv: 'recurring', key: 'recurring', type: 'bool' },
      { csv: 'visual', key: 'visual', type: 'bool' },
      { csv: 'depends_on', key: 'dependsOn', type: 'idList' },
      { csv: 'description_ar', key: 'descriptionAr', type: 'string' },
      { csv: 'notion_name', key: 'notionName', type: 'string' },
      { csv: 'notion_page_id', key: 'notionPageId', type: 'string' },
      { csv: 'active', key: 'active', type: 'bool' },
    ],
  },
};

export const TABLE_NAMES = Object.keys(TABLES);

// Sort rows deterministically so the same content always produces the same files.
export function sortRows(rows) {
  return [...rows].sort((a, b) => (a.sortOrder - b.sortOrder) || a.id.localeCompare(b.id));
}

export function canonicalCatalog(catalog) {
  const out = { schemaVersion: SCHEMA_VERSION };
  for (const t of TABLE_NAMES) {
    out[t] = sortRows(catalog[t] || []).map((row) => {
      const clean = {};
      for (const col of TABLES[t].columns) clean[col.key] = row[col.key];
      return clean;
    });
  }
  return out;
}

export function contentHash(catalog) {
  const canonical = canonicalCatalog(catalog);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// Build the parent lookup used by validation, reports and the rule engine.
export function indexCatalog(catalog) {
  const byId = new Map();
  for (const t of TABLE_NAMES) for (const row of catalog[t] || []) byId.set(row.id, { table: t, row });
  const offeringsByService = new Map();
  for (const o of catalog.offerings || []) {
    if (!offeringsByService.has(o.serviceId)) offeringsByService.set(o.serviceId, []);
    offeringsByService.get(o.serviceId).push(o);
  }
  const deliverablesByParent = new Map();
  for (const d of catalog.deliverables || []) {
    if (!deliverablesByParent.has(d.parentId)) deliverablesByParent.set(d.parentId, []);
    deliverablesByParent.get(d.parentId).push(d);
  }
  const serviceOf = (id) => {
    const hit = byId.get(id);
    if (!hit) return null;
    if (hit.table === 'services') return hit.row;
    if (hit.table === 'offerings') return byId.get(hit.row.serviceId)?.row ?? null;
    if (hit.table === 'deliverables') return serviceOf(hit.row.parentId);
    return null;
  };
  return { byId, offeringsByService, deliverablesByParent, serviceOf };
}

export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
