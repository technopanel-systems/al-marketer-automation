// Automated "Scope" review (Blueprint p.52) as machine-checkable assertions over scope + schedule + KPIs.
// Each result: { id, ok, message }. A proposal cannot move forward while any check fails.
import { indexCatalog } from '../catalog/model.js';

export function runScopeChecks({ catalog, rules, scope, schedule, kpis }) {
  const idx = indexCatalog(catalog);
  const results = [];
  const check = (id, ok, message) => results.push({ id, ok: Boolean(ok), message });
  const problemStatus = new Map(scope.problems.map((p) => [p.id, p.status]));
  const selectedTargets = scope.groups.flatMap((g) => g.targets.map((t) => ({ ...t, serviceId: g.serviceId, mandatory: g.mandatory })));
  const selectedIds = new Set(selectedTargets.map((t) => t.id));
  const scopeDeliverables = new Set(scope.deliverables.map((d) => d.id));

  // S1 strategic services present
  const strategic = catalog.services.filter((s) => s.active && s.strategic).map((s) => s.id);
  const missingStrategic = strategic.filter((id) => !selectedIds.has(id));
  check('S1', missingStrategic.length === 0, missingStrategic.length ? `Missing strategic services: ${missingStrategic.join(', ')}` : 'All 3 strategic services are in scope');

  // S2 every other target traces to a confirmed problem in the proposal, or a Gate 2 reason
  const untraced = selectedTargets.filter((t) => !t.mandatory && !t.problemIds.some((id) => problemStatus.get(id) === 'in_proposal') && !t.reasons.some((r) => r.startsWith('gate2:')));
  check('S2', untraced.length === 0, untraced.length ? `No confirmed problem behind: ${untraced.map((t) => t.id).join(', ')}` : 'Every added service traces to a confirmed problem');

  // S3 every deliverable exists and is active in the catalog used
  const unknown = scope.deliverables.filter((d) => !idx.byId.get(d.id)?.row.active);
  check('S3', unknown.length === 0, unknown.length ? `Not in the catalog: ${unknown.map((d) => d.id).join(', ')}` : 'All deliverables come from the catalog');

  // S4 fixed deliverables complete; no deliverable outside the selected targets
  const incomplete = [];
  for (const t of selectedTargets) {
    for (const d of (idx.deliverablesByParent.get(t.id) || []).filter((x) => x.active && x.kind === 'fixed')) if (!scopeDeliverables.has(d.id)) incomplete.push(d.id);
  }
  const orphans = scope.deliverables.filter((d) => !selectedIds.has(idx.byId.get(d.id)?.row.parentId));
  check('S4', incomplete.length === 0 && orphans.length === 0, [incomplete.length ? `Fixed deliverables missing: ${incomplete.join(', ')}` : '', orphans.length ? `Deliverables outside scope: ${orphans.map((d) => d.id).join(', ')}` : ''].filter(Boolean).join(' · ') || 'Fixed deliverables complete, nothing outside scope');

  // S5 service name shown only when all its offerings are selected
  const wrongDisplay = scope.groups.filter((g) => {
    const offerings = (idx.offeringsByService.get(g.serviceId) || []).filter((o) => o.active);
    if (offerings.length === 0) return g.display !== 'service';
    const all = offerings.every((o) => selectedIds.has(o.id));
    return (g.display === 'service') !== all;
  });
  check('S5', wrongDisplay.length === 0, wrongDisplay.length ? `Wrong naming level for: ${wrongDisplay.map((g) => g.serviceId).join(', ')}` : 'Service vs offering naming is correct');

  // S6 conditional deliverables are justified
  const unjustified = scope.deliverables.filter((d) => d.kind === 'conditional' && d.problemIds.length === 0 && !selectedTargets.find((t) => t.id === d.targetId)?.reasons.some((r) => r.startsWith('gate2:')));
  check('S6', unjustified.length === 0, unjustified.length ? `Conditional without justification: ${unjustified.map((d) => d.id).join(', ')}` : 'Conditional deliverables are justified');

  // S7 low-capability services only with an opt-in
  const min = rules.settings.capabilityMinimumToInclude;
  const lowWithoutOptIn = selectedTargets.filter((t) => !t.mandatory && (t.capability === null || t.capability < min) && !t.optedIn);
  check('S7', lowWithoutOptIn.length === 0, lowWithoutOptIn.length ? `Low capability without opt-in: ${lowWithoutOptIn.map((t) => t.id).join(', ')}` : 'Capability rule respected');

  // S9 week 1 = exactly the 3 strategic deliverables, in order
  const week1 = schedule.items.filter((i) => i.startWeek === 1).sort((a, b) => a.slot - b.slot).map((i) => i.deliverableId);
  const order = rules.timing.stages.strategic.week1Order;
  check('S9', JSON.stringify(week1) === JSON.stringify(order), `Week 1: ${week1.join(' → ') || '(empty)'}`);

  // S10 dependencies respected
  const broken = [];
  const firstStart = (pred) => Math.min(99, ...schedule.items.filter(pred).map((i) => i.startWeek));
  const lastEnd = (pred) => Math.max(0, ...schedule.items.filter(pred).map((i) => i.endWeek));
  const bbEnd = lastEnd((i) => i.deliverableId === 'del.brand_book_documentation');
  const smEnd = lastEnd((i) => i.deliverableId === 'del.marketing_strategy_map');
  for (const d of scope.deliverables) {
    const start = firstStart((i) => i.deliverableId === d.id);
    if (start === 99) continue;
    if (d.visual && start <= bbEnd) broken.push(`${d.id} starts before the Brand Book is done`);
    if (d.stage === 'plan' && start <= smEnd) broken.push(`${d.id} starts before the Strategy Map is done`);
    for (const dep of d.dependsOn || []) if (scopeDeliverables.has(dep) && start < lastEnd((i) => i.deliverableId === dep)) broken.push(`${d.id} starts before ${dep} ends`);
    if (d.stage === 'execution') {
      const planEnd = lastEnd((i) => i.targetId === d.targetId && i.stage === 'plan');
      if (start <= planEnd) broken.push(`${d.id} starts before its plan`);
    }
  }
  for (const [a, b] of [['del.product_portfolio_master_sheet', 'del.brand_book_documentation'], ['del.brand_book_documentation', 'del.marketing_strategy_map']]) {
    const ia = schedule.items.find((i) => i.deliverableId === a);
    const ib = schedule.items.find((i) => i.deliverableId === b);
    if (ia && ib && (ia.startWeek > ib.startWeek || (ia.startWeek === ib.startWeek && ia.slot >= ib.slot))) broken.push(`${a} must come before ${b}`);
  }
  check('S10', broken.length === 0, broken.length ? broken.join(' · ') : 'Every dependency is respected');

  // S11 tracking/optimisation only after execution; month-1 prep in week 2
  const s11 = [];
  for (const i of schedule.items) {
    if (i.stage === 'optimization' && i.endWeek <= 4) s11.push(`${i.deliverableId} is in month 1`);
    if (i.stage === 'monitoring' || i.stage === 'optimization') {
      const exec = firstStart((x) => x.targetId === i.targetId && x.stage === 'execution');
      if (exec === 99 || i.startWeek <= exec) s11.push(`${i.deliverableId} (week ${i.startWeek}) is not after execution starts`);
    }
    if (i.phase === 'P1' && (i.stage === 'research' || i.stage === 'plan') && i.startWeek !== 2) s11.push(`${i.deliverableId} should be in week 2`);
  }
  check('S11', s11.length === 0, s11.length ? s11.join(' · ') : 'Tracking and optimisation follow execution; month-1 prep is in week 2');

  // S12 map covers exactly the scope; nothing beyond week 12 except the explicit list
  const mapped = new Set([...schedule.items, ...schedule.afterMonth3].map((i) => i.deliverableId));
  const unmapped = [...scopeDeliverables].filter((id) => !mapped.has(id));
  const extra = [...mapped].filter((id) => !scopeDeliverables.has(id));
  const beyond = schedule.items.filter((i) => i.endWeek > 12 || i.startWeek < 1);
  check('S12', unmapped.length + extra.length + beyond.length === 0, [unmapped.length ? `Not scheduled: ${unmapped.join(', ')}` : '', extra.length ? `Scheduled but not in scope: ${extra.join(', ')}` : '', beyond.length ? 'Items outside weeks 1–12' : ''].filter(Boolean).join(' · ') || 'The map matches the scope');

  // S13 KPIs only from the library, for in-scope targets, from the measurement week
  const library = new Map(rules.kpis.kpis.map((k) => [k.target, k]));
  const badKpis = kpis.filter((k) => !library.has(k.targetId) || !(selectedIds.has(k.targetId) || scopeDeliverables.has(k.targetId)));
  const earlyKpis = kpis.filter((k) => {
    const mon = firstStart((i) => i.targetId === k.targetId && i.stage === 'monitoring');
    return mon !== 99 && k.startWeek < mon;
  });
  check('S13', badKpis.length + earlyKpis.length === 0, badKpis.length || earlyKpis.length ? `KPI problems: ${[...badKpis, ...earlyKpis].map((k) => k.targetId).join(', ')}` : 'KPIs match the approved scope');

  return results;
}
