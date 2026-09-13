// Merges rows pulled from Notion into the local catalog.
// Notion owns: notion name, notion page id, description, capability, parent links, presence (active).
// The local catalog owns: stable ids, display names (EN/AR), strategic flag, kind, stage, recurring, visual, depends_on.
import { TABLES, slugify } from './model.js';

// "إدارة البراند (Brand Management)" → "Brand Management"; "SEO Plan" → "SEO Plan".
export function englishPart(title) {
  const t = String(title || '').trim();
  const inParens = [...t.matchAll(/\(([^()]*[A-Za-z][^()]*)\)/g)].map((m) => m[1].trim());
  if (inParens.length) return inParens[inParens.length - 1];
  return /[A-Za-z]/.test(t) ? t : '';
}

// "إدارة البراند (Brand Management)" → "إدارة البراند"; returns '' when there is no Arabic.
export function arabicPart(title) {
  const t = String(title || '').replace(/\([^()]*\)/g, '').trim();
  return /[؀-ۿ]/.test(t) ? t : '';
}

export const nameKey = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function uniqueId(prefix, base, taken) {
  let id = `${prefix}${base || 'item'}`;
  let n = 2;
  while (taken.has(id)) id = `${prefix}${base || 'item'}_${n++}`;
  taken.add(id);
  return id;
}

export function mergeNotion(localCatalog, notion, source) {
  const catalog = {
    services: localCatalog.services.map((r) => ({ ...r })),
    offerings: localCatalog.offerings.map((r) => ({ ...r })),
    deliverables: localCatalog.deliverables.map((r) => ({ ...r, dependsOn: [...r.dependsOn] })),
  };
  const changes = [];
  const problems = [];
  const takenIds = new Set([...catalog.services, ...catalog.offerings, ...catalog.deliverables].map((r) => r.id));
  const notionToLocal = new Map(); // notion page id → local id (all tables)
  const record = (table, id, field, from, to) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ table, id, field, from, to });
  };

  for (const table of ['services', 'offerings', 'deliverables']) {
    const rows = catalog[table];
    const prefix = TABLES[table].prefix;
    const aliases = source.aliases?.[table] || {};
    const pulled = notion[table]?.rows || [];
    const pulledIds = new Set(pulled.map((p) => p.pageId));
    const maxSort = () => rows.reduce((m, r) => Math.max(m, r.sortOrder), 0);

    for (const p of pulled) {
      const en = englishPart(p.title);
      const key = nameKey(en);
      let row = p.stableId ? rows.find((r) => r.id === p.stableId) : undefined;
      if (!row) row = rows.find((r) => r.notionPageId && r.notionPageId === p.pageId);
      if (!row && aliases[key]) row = rows.find((r) => r.id === aliases[key]);
      if (!row) {
        row = rows.find(
          (r) => (!r.notionPageId || !pulledIds.has(r.notionPageId)) && (nameKey(r.nameEn) === key || nameKey(englishPart(r.notionName)) === key),
        );
      }

      if (!row) {
        row = {
          id: uniqueId(prefix, slugify(en || p.title), takenIds),
          sortOrder: maxSort() + 10,
          nameEn: en || p.title,
          nameAr: arabicPart(p.title),
          descriptionAr: '',
          notionName: '',
          notionPageId: '',
          active: true,
        };
        if (table === 'services') Object.assign(row, { strategic: false, capability: null });
        if (table === 'offerings') row.serviceId = '';
        if (table === 'deliverables') Object.assign(row, { parentId: '', kind: 'fixed', stage: '', recurring: false, visual: false, dependsOn: [] });
        rows.push(row);
        changes.push({ table, id: row.id, field: '(new item from Notion)', from: null, to: p.title });
        if (!row.nameAr) problems.push(`New ${table.slice(0, -1)} "${row.id}" from Notion needs an Arabic name (name_ar)`);
        if (table === 'deliverables') problems.push(`New deliverable "${row.id}" from Notion needs kind and stage filled in`);
      }

      // Display name follows Notion only when it was never overridden locally.
      const previousEnglish = englishPart(row.notionName);
      if (row.notionName && nameKey(row.nameEn) === nameKey(previousEnglish) && en && nameKey(en) !== nameKey(row.nameEn)) {
        record(table, row.id, 'nameEn', row.nameEn, en);
        row.nameEn = en;
      }
      record(table, row.id, 'notionName', row.notionName, p.title);
      row.notionName = p.title;
      record(table, row.id, 'notionPageId', row.notionPageId, p.pageId);
      row.notionPageId = p.pageId;
      if (p.description) {
        record(table, row.id, 'descriptionAr', row.descriptionAr, p.description);
        row.descriptionAr = p.description;
      }
      if (table === 'services' && p.capability !== undefined) {
        let cap = p.capability;
        if (cap !== null && !Number.isInteger(cap)) {
          problems.push(`Service "${row.id}": capability ${cap} in Notion is not a whole number; rounded`);
          cap = Math.round(cap);
        }
        record(table, row.id, 'capability', row.capability, cap);
        row.capability = cap;
      }
      if (!row.active) {
        record(table, row.id, 'active', false, true);
        row.active = true;
      }
      notionToLocal.set(p.pageId, row.id);
      row.__notion = p;
    }

    // Items that disappeared from Notion are deactivated, never deleted.
    for (const row of rows) {
      if (row.notionPageId && !pulledIds.has(row.notionPageId) && row.active) {
        record(table, row.id, 'active', true, false);
        row.active = false;
        problems.push(`"${row.id}" is no longer in Notion — marked inactive`);
      }
    }
  }

  // Parent links come from Notion relations, resolved to our stable ids.
  const resolveOne = (ids, allowed, label, childId) => {
    const mapped = ids.map((id) => notionToLocal.get(id)).filter((id) => id && allowed.has(id));
    if (mapped.length > 1) problems.push(`"${childId}" is linked to several ${label} in Notion (${mapped.join(', ')}); using the first`);
    return mapped[0];
  };
  const serviceIds = new Set(catalog.services.map((s) => s.id));
  const offeringIds = new Set(catalog.offerings.map((o) => o.id));

  for (const o of catalog.offerings) {
    if (!o.__notion) continue;
    const parent = resolveOne(o.__notion.serviceIds, serviceIds, 'services', o.id);
    if (parent) {
      record('offerings', o.id, 'serviceId', o.serviceId, parent);
      o.serviceId = parent;
    } else if (!o.serviceId) problems.push(`Offering "${o.id}" has no Service link in Notion`);
  }
  for (const d of catalog.deliverables) {
    if (!d.__notion) continue;
    const parent = resolveOne(d.__notion.offeringIds, offeringIds, 'offerings', d.id) || resolveOne(d.__notion.serviceIds, serviceIds, 'services', d.id);
    if (parent) {
      record('deliverables', d.id, 'parentId', d.parentId, parent);
      d.parentId = parent;
    } else if (!d.parentId) problems.push(`Deliverable "${d.id}" has no Offering or Service link in Notion`);
  }

  for (const table of ['services', 'offerings', 'deliverables']) for (const r of catalog[table]) delete r.__notion;
  return { catalog, changes, problems };
}
