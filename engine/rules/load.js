// Loads the rule tables the engine decides with (problem types, timing, KPIs, dependencies, settings).
import { join } from 'node:path';
import { ROOT, loadCatalog } from '../catalog/store.js';
import { readJson, hashOf } from '../util/data.js';

export function loadRules(root = ROOT) {
  const dir = join(root, 'rules');
  const problemTypes = readJson(join(dir, 'problem-types.json'));
  const timing = readJson(join(dir, 'timing.json'));
  const kpis = readJson(join(dir, 'kpis.json'));
  const impact = readJson(join(dir, 'impact-and-dependencies.json'));
  const rules = {
    problemTypes,
    typeById: new Map(problemTypes.types.map((t) => [t.id, t])),
    timing,
    kpis,
    impactCategories: impact.impactCategories,
    dependencies: impact.dependencies,
    settings: impact.settings,
  };
  rules.hash = hashOf({ problemTypes, timing, kpis, impact });
  return rules;
}

export function loadCatalogAndRules(root = ROOT) {
  const { meta, ...catalog } = loadCatalog(root);
  return { catalog, catalogMeta: meta, rules: loadRules(root) };
}

// Rules must only point at things that exist in the catalog.
export function checkRulesAgainstCatalog(rules, catalog) {
  const ids = new Set([...catalog.services, ...catalog.offerings, ...catalog.deliverables].filter((r) => r.active).map((r) => r.id));
  const errors = [];
  for (const t of rules.problemTypes.types) for (const j of t.justifies) if (!ids.has(j)) errors.push(`Problem type "${t.id}" justifies "${j}", which is not an active catalog item`);
  for (const k of rules.kpis.kpis) if (!ids.has(k.target)) errors.push(`KPI group target "${k.target}" is not an active catalog item`);
  for (const o of rules.timing.overrides) if (!ids.has(o.target)) errors.push(`Timing override target "${o.target}" is not an active catalog item`);
  for (const id of rules.timing.stages.strategic.week1Order) if (!ids.has(id)) errors.push(`Week-1 order item "${id}" is not an active catalog item`);
  return errors;
}
