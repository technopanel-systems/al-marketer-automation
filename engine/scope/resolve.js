// Scope resolution — pure, deterministic. Decides WHICH services/offerings and WHICH deliverables.
// Inputs are data only; no AI is involved. Every choice carries a trace back to problems or a human decision.
import { indexCatalog, sortRows } from '../catalog/model.js';
import { hashOf } from '../util/data.js';

const SEVERITIES = new Set([1, 2, 3]);

/**
 * @param {object} p
 * @param {object} p.catalog   active catalog (services, offerings, deliverables)
 * @param {object} p.rules     from loadRules()
 * @param {Array}  p.problems  Gate-1 confirmed problems: { id, type, severity }
 * @param {object} [p.readiness]  client facts: { tracking_installed: 'yes'|'no'|'unknown', ... }
 * @param {object} [p.gate2]   human decisions: { optIn: [id], remove: [id], add: [{ targetId, problemIds, reason }], phase: { serviceId: 'P1'|'P2' } }
 */
export function resolveScope({ catalog, rules, problems, readiness = {}, gate2 = {} }) {
  const idx = indexCatalog(catalog);
  const settings = rules.settings;
  const optIn = new Set(gate2.optIn || []);
  const removed = new Set(gate2.remove || []);
  const flags = [];
  const flag = (level, code, message, extra = {}) => flags.push({ level, code, message, ...extra });
  const activeRow = (id) => {
    const hit = idx.byId.get(id);
    return hit && hit.row.active ? hit : null;
  };

  // targets: services (model B / strategic) or offerings (model A)
  const targets = new Map();
  const ensureTarget = (id, fields) => {
    if (!targets.has(id)) {
      const hit = activeRow(id);
      const service = hit.table === 'services' ? hit.row : idx.byId.get(hit.row.serviceId).row;
      targets.set(id, { id, table: hit.table, serviceId: service.id, sortOrder: hit.row.sortOrder, mandatory: false, problemIds: new Set(), addedBy: 'rule', reasons: [] });
    }
    const t = targets.get(id);
    Object.assign(t, fields);
    return t;
  };
  const activations = new Map(); // conditional deliverable id → Set(problem ids)

  for (const s of catalog.services.filter((r) => r.active && r.strategic)) {
    ensureTarget(s.id, { mandatory: true }).reasons.push('mandatory_foundation');
  }

  const problemInfo = new Map();
  for (const p of problems) {
    const info = { id: p.id, type: p.type, severity: p.severity, targetIds: new Set(), status: 'in_proposal' };
    problemInfo.set(p.id, info);
    if (!SEVERITIES.has(p.severity)) flag('error', 'invalid_severity', `Problem ${p.id} has severity ${p.severity}; expected 1, 2 or 3`, { problemId: p.id });
    const type = rules.typeById.get(p.type);
    if (!type) {
      info.status = 'invalid_type';
      flag('error', 'invalid_problem_type', `Problem ${p.id} has unknown type "${p.type}"`, { problemId: p.id });
      continue;
    }
    if (type.justifies.length === 0) {
      info.status = type.readinessBlocker ? 'readiness_blocker' : 'unmapped';
      continue;
    }
    for (const j of type.justifies) {
      const hit = activeRow(j);
      if (!hit) {
        flag('error', 'catalog_missing', `Problem type "${p.type}" points at "${j}", which is not an active catalog item`, { problemId: p.id });
        continue;
      }
      if (hit.table === 'deliverables') {
        if (!activations.has(j)) activations.set(j, new Set());
        activations.get(j).add(p.id);
        ensureTarget(hit.row.parentId).problemIds.add(p.id);
        info.targetIds.add(hit.row.parentId);
      } else if (hit.table === 'services' && (idx.offeringsByService.get(j) || []).some((o) => o.active)) {
        // A problem that justifies a whole model-A service needs all of its offerings.
        for (const o of idx.offeringsByService.get(j).filter((x) => x.active)) {
          ensureTarget(o.id).problemIds.add(p.id);
          info.targetIds.add(o.id);
        }
      } else {
        ensureTarget(j).problemIds.add(p.id);
        info.targetIds.add(j);
      }
    }
  }

  for (const add of gate2.add || []) {
    const hit = activeRow(add.targetId);
    if (!hit) {
      flag('error', 'catalog_missing', `Gate 2 added "${add.targetId}", which is not an active catalog item`);
      continue;
    }
    const problemIds = (add.problemIds || []).filter((id) => problemInfo.has(id));
    if (problemIds.length === 0 && !add.reason) {
      flag('error', 'addition_without_reason', `Gate 2 added "${add.targetId}" without a linked problem or a reason (Blueprint: no solution without a problem)`);
      continue;
    }
    // Adding something at Gate 2 is also an explicit opt-in for low-capability services.
    const addTo = (targetId) => {
      const existed = targets.has(targetId);
      const t = ensureTarget(targetId);
      if (!existed) t.addedBy = 'human';
      for (const id of problemIds) {
        t.problemIds.add(id);
        problemInfo.get(id).targetIds.add(targetId);
      }
      t.reasons.push(`gate2: ${add.reason || 'added for linked problem(s)'}`);
      optIn.add(targetId);
    };
    if (hit.table === 'deliverables') {
      if (!activations.has(add.targetId)) activations.set(add.targetId, new Set());
      for (const id of problemIds) activations.get(add.targetId).add(id);
      activations.get(add.targetId).add(`human:${add.reason || 'added'}`);
      addTo(hit.row.parentId);
    } else if (hit.table === 'services' && (idx.offeringsByService.get(add.targetId) || []).some((o) => o.active)) {
      for (const o of idx.offeringsByService.get(add.targetId).filter((x) => x.active)) addTo(o.id);
    } else {
      addTo(add.targetId);
    }
  }

  // Exclusions: removed at Gate 2, or low capability without opt-in.
  const excluded = [];
  for (const t of targets.values()) {
    const service = idx.byId.get(t.serviceId).row;
    t.capability = service.capability;
    if (t.mandatory) {
      if (removed.has(t.id)) flag('error', 'cannot_remove_strategic', `"${t.id}" is a strategic service required in every contract and cannot be removed`);
      continue;
    }
    if (removed.has(t.id) || removed.has(t.serviceId)) {
      t.excluded = 'removed_at_gate2';
    } else if ((service.capability === null || service.capability < settings.capabilityMinimumToInclude) && !optIn.has(t.id) && !optIn.has(t.serviceId)) {
      t.excluded = 'low_capability';
    }
    if (t.excluded) excluded.push({ id: t.id, serviceId: t.serviceId, reason: t.excluded, capability: service.capability, problemIds: [...t.problemIds] });
  }
  const selected = [...targets.values()].filter((t) => !t.excluded);
  const selectedIds = new Set(selected.map((t) => t.id));

  // Problem status: in the client proposal only if at least one selected target (or an active conditional deliverable) addresses it.
  for (const info of problemInfo.values()) {
    if (info.status !== 'in_proposal') continue;
    const addressed = [...info.targetIds].some((id) => selectedIds.has(id));
    if (!addressed) {
      const reasons = [...info.targetIds].map((id) => targets.get(id)?.excluded).filter(Boolean);
      info.status = reasons.includes('removed_at_gate2') ? 'removed_at_gate2' : reasons.includes('low_capability') ? 'excluded_low_capability' : 'unaddressed';
    }
  }
  const inProposal = (id) => problemInfo.get(id)?.status === 'in_proposal';

  // Readiness → phase constraints.
  const overrideFor = (t) => rules.timing.overrides.filter((o) => o.target === t.id || o.target === t.serviceId);
  for (const t of selected) {
    for (const o of overrideFor(t)) {
      if (o.forcePhase) t.forcedPhase = o.forcePhase;
      for (const check of o.readiness || []) {
        const value = readiness[check] || 'unknown';
        if (value === 'no') {
          t.forcedPhase = 'P2';
          t.notReady = [...(t.notReady || []), check];
        } else if (value !== 'yes') {
          t.readinessUnknown = [...(t.readinessUnknown || []), check];
        }
      }
    }
    if (t.notReady) flag('warn', 'not_ready', `"${t.id}" starts in month 2: client readiness missing (${t.notReady.join(', ')})`, { targetId: t.id });
    if (t.readinessUnknown) flag('warn', 'readiness_unconfirmed', `"${t.id}": confirm with the client before execution (${[...new Set(t.readinessUnknown)].join(', ')})`, { targetId: t.id });
  }

  // Group by service; rank non-strategic groups; assign phases.
  const groupsById = new Map();
  for (const t of selected) {
    if (!groupsById.has(t.serviceId)) {
      const service = idx.byId.get(t.serviceId).row;
      groupsById.set(t.serviceId, { serviceId: t.serviceId, sortOrder: service.sortOrder, mandatory: service.strategic, targets: [] });
    }
    groupsById.get(t.serviceId).targets.push(t);
  }
  const groups = [...groupsById.values()];
  for (const g of groups) {
    const problemsInGroup = new Set(g.targets.flatMap((t) => [...t.problemIds].filter(inProposal)));
    g.score = [...problemsInGroup].reduce((sum, id) => sum + (problemInfo.get(id).severity || 0), 0);
    g.maxSeverity = Math.max(0, ...[...problemsInGroup].map((id) => problemInfo.get(id).severity || 0));
    g.problemIds = [...problemsInGroup];
    g.forcedPhase = gate2.phase?.[g.serviceId] || g.targets.map((t) => t.forcedPhase).find(Boolean) || null;
    const activeOfferings = (idx.offeringsByService.get(g.serviceId) || []).filter((o) => o.active);
    g.display = activeOfferings.length > 0 && activeOfferings.every((o) => g.targets.some((t) => t.id === o.id)) ? 'service' : g.targets[0].table === 'services' ? 'service' : 'offerings';
  }
  const ranked = groups
    .filter((g) => !g.mandatory)
    .sort((a, b) => b.score - a.score || b.maxSeverity - a.maxSeverity || a.sortOrder - b.sortOrder);
  let p1Slots = settings.maxExtraServicesStartingMonth1;
  ranked.forEach((g, i) => {
    g.rank = i + 1;
    if (g.forcedPhase) g.phase = g.forcedPhase;
    else if (p1Slots > 0) {
      g.phase = 'P1';
      p1Slots--;
    } else g.phase = 'P2';
  });
  for (const g of groups.filter((x) => x.mandatory)) g.phase = 'P1';

  // Every selected non-strategic target must trace to an in-proposal problem or a human reason.
  for (const t of selected) {
    if (!t.mandatory && ![...t.problemIds].some(inProposal) && !t.reasons.some((r) => r.startsWith('gate2:'))) {
      flag('error', 'target_without_problem', `"${t.id}" has no confirmed problem in the proposal and no Gate 2 reason`, { targetId: t.id });
    }
  }

  // Deliverables: fixed ones of every selected target; conditional only when activated.
  const deliverables = [];
  const phaseOf = new Map(groups.flatMap((g) => g.targets.map((t) => [t.id, g.phase])));
  for (const t of sortRows(selected)) {
    for (const d of sortRows((idx.deliverablesByParent.get(t.id) || []).filter((x) => x.active))) {
      let activatedBy = [];
      if (d.kind === 'conditional') {
        activatedBy = [...(activations.get(d.id) || [])].filter((id) => id.startsWith('human:') || inProposal(id));
        if (activatedBy.length === 0) continue;
      }
      deliverables.push({
        id: d.id,
        targetId: t.id,
        serviceId: t.serviceId,
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        kind: d.kind,
        stage: d.stage,
        recurring: d.recurring,
        visual: d.visual,
        dependsOn: d.dependsOn,
        sortOrder: d.sortOrder,
        phase: phaseOf.get(t.id),
        mandatory: t.mandatory,
        problemIds: d.kind === 'conditional' ? activatedBy.filter((id) => !id.startsWith('human:')) : [...t.problemIds].filter(inProposal),
        trace: d.kind === 'conditional' ? 'conditional: activated by diagnosis' : t.mandatory ? 'mandatory foundation (strategic service)' : 'fixed deliverable of the approved scope',
      });
    }
  }

  const nameOf = (id) => {
    const row = idx.byId.get(id).row;
    return { nameEn: row.nameEn, nameAr: row.nameAr };
  };
  const result = {
    inputHash: hashOf({ problems, readiness, gate2, rulesHash: rules.hash }),
    groups: sortRows(groups.map((g) => ({ ...g, id: g.serviceId }))).map((g) => ({
      serviceId: g.serviceId,
      ...nameOf(g.serviceId),
      display: g.display,
      mandatory: g.mandatory,
      phase: g.phase,
      rank: g.rank ?? null,
      score: g.score,
      maxSeverity: g.maxSeverity,
      problemIds: g.problemIds,
      targets: sortRows(g.targets.map((t) => ({ ...t, sortOrder: idx.byId.get(t.id).row.sortOrder }))).map((t) => ({
        id: t.id,
        table: t.table,
        ...nameOf(t.id),
        capability: t.capability,
        problemIds: [...t.problemIds].filter(inProposal),
        addedBy: t.addedBy,
        reasons: t.reasons,
        optedIn: optIn.has(t.id) || optIn.has(t.serviceId),
      })),
    })),
    excluded: excluded.map((e) => ({ ...e, ...nameOf(e.id) })),
    deliverables,
    problems: [...problemInfo.values()].map((i) => ({ id: i.id, type: i.type, severity: i.severity, status: i.status, targetIds: [...i.targetIds] })),
    flags,
  };
  return result;
}
