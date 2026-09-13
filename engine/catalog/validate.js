// Catalog validation: JSON Schema (shape) + business checks (structure the Blueprint relies on).
// Returns { errors: string[], warnings: string[] }. A catalog with errors must never be saved.
import Ajv from 'ajv';
import { STAGES, KINDS, TABLES, TABLE_NAMES, indexCatalog } from './model.js';

const idPattern = (prefix) => `^${prefix.replace('.', '\\.')}[a-z0-9_]+$`;

const baseRow = {
  id: { type: 'string' },
  sortOrder: { type: 'integer', minimum: 0 },
  nameEn: { type: 'string', minLength: 1 },
  nameAr: { type: 'string', minLength: 1 },
  descriptionAr: { type: 'string' },
  notionName: { type: 'string' },
  notionPageId: { type: 'string' },
  active: { type: 'boolean' },
};

const catalogSchema = {
  type: 'object',
  required: ['services', 'offerings', 'deliverables'],
  properties: {
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: TABLES.services.columns.map((c) => c.key),
        properties: {
          ...baseRow,
          id: { type: 'string', pattern: idPattern(TABLES.services.prefix) },
          strategic: { type: 'boolean' },
          capability: { anyOf: [{ type: 'integer', minimum: 0, maximum: 5 }, { type: 'null' }] },
        },
      },
    },
    offerings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: TABLES.offerings.columns.map((c) => c.key),
        properties: {
          ...baseRow,
          id: { type: 'string', pattern: idPattern(TABLES.offerings.prefix) },
          serviceId: { type: 'string', minLength: 1 },
        },
      },
    },
    deliverables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: TABLES.deliverables.columns.map((c) => c.key),
        properties: {
          ...baseRow,
          id: { type: 'string', pattern: idPattern(TABLES.deliverables.prefix) },
          parentId: { type: 'string', minLength: 1 },
          kind: { enum: KINDS },
          stage: { enum: STAGES },
          recurring: { type: 'boolean' },
          visual: { type: 'boolean' },
          dependsOn: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
const checkShape = ajv.compile(catalogSchema);

function describeAjvError(catalog, err) {
  const [, table, index, field] = err.instancePath.split('/');
  const row = catalog[table]?.[Number(index)];
  const where = row?.id ? `${table} "${row.id}"` : `${table} row ${Number(index) + 1}`;
  const col = TABLES[table]?.columns.find((c) => c.key === field)?.csv ?? field;
  return col ? `${where}: column "${col}" ${err.message}` : `${where}: ${err.message}`;
}

export function validateCatalog(catalog) {
  const errors = [];
  const warnings = [];

  if (!checkShape(catalog)) {
    for (const err of checkShape.errors) errors.push(describeAjvError(catalog, err));
    return { errors, warnings };
  }

  // Unique IDs across all tables; unique Notion page IDs.
  const seen = new Map();
  const notionSeen = new Map();
  for (const t of TABLE_NAMES) {
    for (const row of catalog[t]) {
      if (seen.has(row.id)) errors.push(`Duplicate id "${row.id}" (in ${seen.get(row.id)} and ${t})`);
      seen.set(row.id, t);
      if (row.notionPageId) {
        if (notionSeen.has(row.notionPageId)) {
          errors.push(`Notion page ${row.notionPageId} is linked to both "${notionSeen.get(row.notionPageId)}" and "${row.id}"`);
        }
        notionSeen.set(row.notionPageId, row.id);
      }
    }
  }

  const idx = indexCatalog(catalog);
  const active = (row) => row && row.active;

  for (const o of catalog.offerings) {
    const parent = idx.byId.get(o.serviceId);
    if (!parent || parent.table !== 'services') errors.push(`Offering "${o.id}": service_id "${o.serviceId}" is not a service in the catalog`);
    else if (o.active && !parent.row.active) errors.push(`Offering "${o.id}" is active but its service "${o.serviceId}" is not`);
  }

  for (const d of catalog.deliverables) {
    const parent = idx.byId.get(d.parentId);
    if (!parent || parent.table === 'deliverables') {
      errors.push(`Deliverable "${d.id}": parent_id "${d.parentId}" must be a service or an offering in the catalog`);
      continue;
    }
    if (d.active && !parent.row.active) errors.push(`Deliverable "${d.id}" is active but its parent "${d.parentId}" is not`);
    if (parent.table === 'services') {
      const serviceOfferings = (idx.offeringsByService.get(parent.row.id) || []).filter(active);
      if (d.active && serviceOfferings.length > 0) {
        errors.push(`Deliverable "${d.id}" hangs directly on service "${parent.row.id}", but that service has offerings — attach it to one of its offerings`);
      }
    }
    for (const dep of d.dependsOn) {
      const target = idx.byId.get(dep);
      if (dep === d.id) errors.push(`Deliverable "${d.id}" depends on itself`);
      else if (!target || target.table !== 'deliverables') errors.push(`Deliverable "${d.id}": depends_on "${dep}" is not a deliverable in the catalog`);
    }
  }

  // Every active service and offering must lead to at least one active deliverable.
  for (const s of catalog.services.filter(active)) {
    const direct = (idx.deliverablesByParent.get(s.id) || []).filter(active);
    const viaOfferings = (idx.offeringsByService.get(s.id) || [])
      .filter(active)
      .flatMap((o) => (idx.deliverablesByParent.get(o.id) || []).filter(active));
    if (direct.length + viaOfferings.length === 0) errors.push(`Service "${s.id}" has no active deliverables`);
    if (s.capability === null) warnings.push(`Service "${s.id}" has no capability score (treated as excluded by default)`);
    if (!s.descriptionAr) warnings.push(`Service "${s.id}" has no description`);
  }
  for (const o of catalog.offerings.filter(active)) {
    if ((idx.deliverablesByParent.get(o.id) || []).filter(active).length === 0) errors.push(`Offering "${o.id}" has no active deliverables`);
  }

  // Blueprint: exactly three strategic services, each with a fixed strategic deliverable.
  const strategic = catalog.services.filter((s) => s.active && s.strategic);
  if (strategic.length !== 3) errors.push(`There must be exactly 3 active strategic services (found ${strategic.length})`);
  for (const s of strategic) {
    const hasFoundation = (idx.deliverablesByParent.get(s.id) || []).some((d) => d.active && d.kind === 'fixed' && d.stage === 'strategic');
    if (!hasFoundation) errors.push(`Strategic service "${s.id}" needs a fixed deliverable with stage "strategic"`);
  }
  for (const d of catalog.deliverables.filter((x) => x.active && x.stage === 'strategic')) {
    const svc = idx.serviceOf(d.id);
    if (svc && !svc.strategic) errors.push(`Deliverable "${d.id}" has stage "strategic" but belongs to non-strategic service "${svc.id}"`);
  }

  // No dependency cycles.
  const deps = new Map(catalog.deliverables.map((d) => [d.id, d.dependsOn]));
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      errors.push(`Dependency cycle: ${[...path, id].join(' → ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const next of deps.get(id) || []) if (deps.has(next)) visit(next, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of deps.keys()) visit(id, []);

  return { errors, warnings };
}
