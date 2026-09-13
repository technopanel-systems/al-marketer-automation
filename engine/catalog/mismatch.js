// Compares the catalog (as edited in Notion or CSV) with the Blueprint's service structure.
// Output items: { level: 'fix' | 'info', where, message }.
import { indexCatalog } from './model.js';
import { englishPart, nameKey } from './merge.js';

export function compareWithBlueprint(catalog, blueprint) {
  const items = [];
  const fix = (where, message) => items.push({ level: 'fix', where, message });
  const info = (where, message) => items.push({ level: 'info', where, message });
  const idx = indexCatalog(catalog);
  const expectedIds = new Set();

  const checkNotionName = (row, expectedEn, label) => {
    if (!row.notionName) return;
    const en = englishPart(row.notionName);
    if (en && nameKey(en) !== nameKey(expectedEn)) {
      fix(row.id, `${label} is called "${row.notionName}" in Notion, but the Blueprint name is "${expectedEn}". Proposals use the Blueprint name; rename it in Notion when convenient.`);
    }
  };

  const checkDeliverables = (parentId, expectedList, page) => {
    for (const exp of expectedList) {
      if (!exp.id) {
        fix(parentId, `Blueprint p.${page} lists deliverable "${exp.nameAr}"${exp.nameEn ? ` (${exp.nameEn})` : ''} under "${parentId}", but the catalog has no such deliverable. Add it in Notion, or confirm it is an activity rather than a deliverable.`);
        continue;
      }
      expectedIds.add(exp.id);
      const hit = idx.byId.get(exp.id);
      if (!hit || !hit.row.active) {
        fix(parentId, `Blueprint p.${page} deliverable "${exp.nameAr}" (${exp.id}) is missing or inactive in the catalog.`);
        continue;
      }
      if (hit.row.parentId !== parentId) fix(exp.id, `Belongs to "${hit.row.parentId}" in the catalog but to "${parentId}" in the Blueprint (p.${page}).`);
      if (exp.kind && hit.row.kind !== exp.kind) fix(exp.id, `Blueprint marks it "${exp.kind}" but the catalog says "${hit.row.kind}".`);
      if (exp.nameEn) checkNotionName(hit.row, exp.nameEn, 'Deliverable');
    }
  };

  for (const svc of blueprint.services) {
    expectedIds.add(svc.id);
    const hit = idx.byId.get(svc.id);
    if (!hit || !hit.row.active) {
      fix(svc.id, `Blueprint service "${svc.nameAr}" (${svc.nameEn}, p.${svc.page}) is missing or inactive in the catalog.`);
      continue;
    }
    const row = hit.row;
    checkNotionName(row, svc.nameEn, 'Service');
    if (row.strategic !== svc.strategic) fix(svc.id, `Blueprint says strategic = ${svc.strategic ? 'yes' : 'no'}, catalog says ${row.strategic ? 'yes' : 'no'}.`);
    if (row.capability === null) {
      info(svc.id, 'No capability score. Until one is set, this service is excluded from proposals by default (you can opt in at Gate 2). Add the score in Notion.');
    }
    const activeOfferings = (idx.offeringsByService.get(svc.id) || []).filter((o) => o.active);
    if (svc.model === 'A' && activeOfferings.length === 0) fix(svc.id, `Blueprint structures this service with offerings (model A, p.${svc.page}), but the catalog has none.`);
    if (svc.model === 'B' && activeOfferings.length > 0) fix(svc.id, `Blueprint sells this service as one unit (model B, p.${svc.page}), but the catalog gives it offerings.`);

    if (svc.deliverables) checkDeliverables(svc.id, svc.deliverables, svc.page);
    for (const off of svc.offerings || []) {
      expectedIds.add(off.id);
      const o = idx.byId.get(off.id);
      if (!o || !o.row.active) {
        fix(svc.id, `Blueprint offering "${off.nameAr}" (${off.nameEn}) is missing or inactive in the catalog.`);
        continue;
      }
      if (o.row.serviceId !== svc.id) fix(off.id, `Belongs to "${o.row.serviceId}" in the catalog but to "${svc.id}" in the Blueprint.`);
      checkNotionName(o.row, off.nameEn, 'Offering');
      checkDeliverables(off.id, off.deliverables, svc.page);
    }
  }

  for (const table of ['services', 'offerings', 'deliverables']) {
    for (const row of catalog[table]) {
      if (row.active && !expectedIds.has(row.id)) info(row.id, `"${row.nameEn}" is in the catalog but not in the Blueprint service map.`);
    }
    const byDescription = new Map();
    for (const row of catalog[table].filter((r) => r.active && r.descriptionAr)) {
      const key = row.descriptionAr.trim();
      if (!byDescription.has(key)) byDescription.set(key, []);
      byDescription.get(key).push(row.id);
    }
    for (const ids of byDescription.values()) {
      if (ids.length > 1) fix(ids.join(', '), 'These items have exactly the same description — one of them is probably a copy-paste. Fix the description in Notion.');
    }
  }

  for (const bad of blueprint.forbiddenNames || []) {
    const pattern = new RegExp(`\\b${bad.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const table of ['services', 'offerings', 'deliverables']) {
      for (const row of catalog[table].filter((r) => r.active)) {
        const where = [['display name (EN)', row.nameEn], ['display name (AR)', row.nameAr]].filter(([, v]) => pattern.test(v || ''));
        for (const [field] of where) fix(row.id, `Uses the forbidden name "${bad.text}" in its ${field}. ${bad.reason}.`);
      }
    }
  }

  const unlinked = ['services', 'offerings', 'deliverables'].flatMap((t) => catalog[t].filter((r) => r.active && !r.notionPageId).map((r) => r.id));
  if (unlinked.length) info('catalog', `${unlinked.length} item(s) are not linked to a Notion page yet (normal before the first Notion pull, or for items added only in CSV).`);

  return items;
}
