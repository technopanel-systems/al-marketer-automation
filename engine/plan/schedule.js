// Scheduler — pure, deterministic. Decides WHEN each approved deliverable happens in the 12-week plan.
const WEEKS = 12;

export const monthOfWeek = (week) => (week <= 4 ? 1 : week <= 8 ? 2 : 3);
const MONTH_RANGE = { 1: [1, 4], 2: [5, 8], 3: [9, 12] };

function overridesFor(rules, d) {
  return rules.timing.overrides.filter((o) => o.target === d.targetId || o.target === d.serviceId || o.target === d.id);
}

function baseWindow(rules, d) {
  const stages = rules.timing.stages;
  if (d.stage === 'strategic') {
    if (d.kind === 'conditional') return { ...stages.strategic.conditional[d.phase] };
    const order = stages.strategic.week1Order.indexOf(d.id);
    return { ...stages.strategic.fixed.P1, slot: order >= 0 ? order + 1 : 9 };
  }
  const cfg = stages[d.stage]?.[d.phase];
  if (!cfg) throw new Error(`No timing rule for stage "${d.stage}" in phase ${d.phase}`);
  const win = { ...cfg };
  for (const o of overridesFor(rules, d)) {
    const specific = o[d.phase]?.[d.stage];
    if (specific) Object.assign(win, specific);
  }
  return win;
}

/**
 * @param {object} p
 * @param {object} p.scope  from resolveScope()
 * @param {object} p.rules  from loadRules()
 */
export function buildSchedule({ scope, rules }) {
  const flags = [];
  const flag = (level, code, message, extra = {}) => flags.push({ level, code, message, ...extra });
  const items = [];
  const afterMonth3 = [];
  const placed = new Map(); // deliverable id → first instance

  const byTargetStage = (targetId, stage) => items.filter((i) => i.targetId === targetId && i.stage === stage);
  const serviceStage = (serviceId, stage) => items.filter((i) => i.serviceId === serviceId && i.stage === stage);

  const stageRank = { strategic: 0, research: 1, plan: 2, execution: 3, monitoring: 4, optimization: 5, report: 5 };
  const ordered = [...scope.deliverables].sort(
    (a, b) => stageRank[a.stage] - stageRank[b.stage] || (a.phase === b.phase ? 0 : a.phase === 'P1' ? -1 : 1) || a.sortOrder - b.sortOrder,
  );
  // Automation waits for email execution, so place email first when both exist.
  ordered.sort((a, b) => (a.stage === b.stage && a.stage === 'execution' ? (a.serviceId === 'svc.marketing_automation') - (b.serviceId === 'svc.marketing_automation') : 0));

  const push = (d, instance, start, end, slot, rule) => {
    const item = {
      deliverableId: d.id,
      instance,
      targetId: d.targetId,
      serviceId: d.serviceId,
      nameEn: d.nameEn,
      nameAr: d.nameAr,
      stage: d.stage,
      kind: d.kind,
      phase: d.phase,
      mandatory: d.mandatory,
      problemIds: d.problemIds,
      sortOrder: d.sortOrder,
      startWeek: start,
      endWeek: end,
      slot,
      rule,
    };
    if (start > WEEKS) {
      afterMonth3.push({ ...item, reason: 'starts after week 12' });
      flag('warn', 'after_month_3', `"${d.id}" does not fit in the 3 months — listed as "continues after month 3"`, { deliverableId: d.id });
      return null;
    }
    if (end > WEEKS) {
      item.endWeek = WEEKS;
      item.continuesAfterMonth3 = true;
      flag('warn', 'continues_after_month_3', `"${d.id}" continues after week 12`, { deliverableId: d.id });
    }
    items.push(item);
    if (!placed.has(d.id)) placed.set(d.id, item);
    return item;
  };

  for (const d of ordered) {
    const win = baseWindow(rules, d);
    const rules_ = [];
    let start = win.start;
    let end = win.end;

    // Explicit catalog dependencies.
    for (const dep of d.dependsOn || []) {
      const pred = placed.get(dep);
      if (pred && start < pred.endWeek) {
        start = pred.endWeek;
        end = Math.max(end ?? start, start);
        rules_.push(`after ${dep}`);
      }
    }

    // Stage order inside the same target: nothing before its research/plan; monitoring after execution starts.
    if (['execution', 'monitoring', 'optimization', 'report'].includes(d.stage)) {
      const plans = byTargetStage(d.targetId, 'plan');
      const planEnd = Math.max(0, ...plans.map((p) => p.endWeek));
      if (start !== undefined && start <= planEnd && d.stage === 'execution') {
        start = planEnd + 1;
        end = Math.max(end, start);
        rules_.push('after the plan');
      }
    }
    if (d.stage === 'monitoring') {
      const execStart = Math.min(99, ...byTargetStage(d.targetId, 'execution').map((e) => e.startWeek));
      if (execStart === 99) flag('error', 'monitoring_without_execution', `"${d.id}" has no execution to monitor`, { deliverableId: d.id });
      else if (start <= execStart) {
        start = execStart + 1;
        end = Math.max(end, start);
        rules_.push('after execution starts');
      }
    }

    // Service-specific timing rules.
    for (const o of overridesFor(rules, d)) {
      if (o.after && d.stage === o.after.stage) {
        const other = serviceStage(o.after.target, o.after.stage);
        if (other.length) {
          const otherStart = Math.min(...other.map((x) => x.startWeek));
          if (start <= otherStart) {
            start = otherStart + 1;
            end = Math.max(end, start);
            rules_.push(`after ${o.after.target} ${o.after.stage}`);
          }
        }
      }
    }

    if (win.weeks) {
      // Fixed delivery weeks (optimisation reports, periodic reports).
      const execution = byTargetStage(d.targetId, 'execution');
      const firstExec = Math.min(99, ...execution.map((e) => e.startWeek));
      const lastExecEnd = Math.max(0, ...execution.map((e) => e.endWeek));
      let weeks = win.weeks.filter((w) => monthOfWeek(w) > 1 || d.stage !== 'optimization');
      if (d.stage === 'optimization' || d.stage === 'report') weeks = weeks.filter((w) => w > firstExec);
      const monitoring = byTargetStage(d.targetId, 'monitoring');
      if (d.stage === 'optimization' && monitoring.length) weeks = weeks.filter((w) => w >= Math.min(...monitoring.map((m) => m.startWeek)));
      for (const o of overridesFor(rules, d)) {
        if (o.minGapAfterExecution && o.minGapAfterExecution.stage === d.stage) weeks = weeks.filter((w) => w >= lastExecEnd + o.minGapAfterExecution.weeks);
      }
      if (weeks.length === 0) {
        push(d, 1, WEEKS + 1, WEEKS + 1, win.slot, 'no allowed week inside the 3 months');
      } else {
        weeks.forEach((w, i) => push(d, i + 1, w, w, win.slot, ['default weeks', ...rules_].join('; ')));
      }
      continue;
    }

    const first = push(d, 1, start, end, win.slot, ['default window', ...rules_].join('; '));
    if (first && d.stage === 'execution' && d.recurring) {
      for (let m = monthOfWeek(first.endWeek) + 1; m <= 3; m++) {
        const [ms, me] = MONTH_RANGE[m];
        push(d, m - monthOfWeek(first.startWeek) + 1, ms, me, win.slot, 'recurring monthly');
      }
    }
  }

  // Capacity: distinct targets executing in the same week.
  const max = rules.settings.maxParallelExecutionTargetsPerWeek;
  for (let w = 1; w <= WEEKS; w++) {
    const active = new Set(items.filter((i) => i.stage === 'execution' && i.startWeek <= w && i.endWeek >= w).map((i) => i.targetId));
    if (max && active.size > max) flag('warn', 'capacity', `Week ${w} has ${active.size} services executing in parallel (limit ${max})`, { week: w });
  }

  const sortItems = (list) => [...list].sort((a, b) => a.startWeek - b.startWeek || a.slot - b.slot || a.sortOrder - b.sortOrder || a.instance - b.instance);
  const sorted = sortItems(items);

  // Month map = what the client receives each month (by delivery week). Week plan = what is being worked on in weeks 1–4.
  const months = { 1: [], 2: [], 3: [] };
  for (const i of sorted) months[monthOfWeek(i.endWeek)].push(i);
  const weeks = { 1: [], 2: [], 3: [], 4: [] };
  for (const i of sorted) for (let w = i.startWeek; w <= Math.min(i.endWeek, 4); w++) weeks[w].push(i);

  return { items: sorted, months, weeks, afterMonth3: sortItems(afterMonth3), flags };
}
