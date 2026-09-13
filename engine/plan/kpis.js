// KPI picker — pure, deterministic. KPIs appear only for approved scope, from the week measurement can start.

export function pickKpis({ scope, schedule, rules }) {
  const selectedTargets = new Set(scope.groups.flatMap((g) => g.targets.map((t) => t.id)));
  const includedDeliverables = new Set(scope.deliverables.map((d) => d.id));
  const out = [];
  for (const group of rules.kpis.kpis) {
    const target = group.target;
    const isDeliverable = target.startsWith('del.');
    if (isDeliverable ? !includedDeliverables.has(target) : !selectedTargets.has(target)) continue;
    const related = schedule.items.filter((i) => (isDeliverable ? i.deliverableId === target : i.targetId === target));
    const monitoring = related.filter((i) => i.stage === 'monitoring');
    const execution = related.filter((i) => i.stage === 'execution');
    // Measured from the dashboard week; without a dashboard, from the first execution; otherwise from delivery.
    const startWeek = monitoring.length
      ? Math.min(...monitoring.map((m) => m.startWeek))
      : execution.length
        ? Math.min(...execution.map((e) => e.startWeek))
        : related.length
          ? Math.min(...related.map((i) => i.endWeek))
          : null;
    if (startWeek === null) continue;
    const nameSource = isDeliverable ? scope.deliverables.find((d) => d.id === target) : scope.groups.flatMap((g) => g.targets).find((t) => t.id === target);
    out.push({ targetId: target, nameEn: nameSource.nameEn, nameAr: nameSource.nameAr, startWeek, basedOn: monitoring.length ? 'monitoring dashboard' : execution.length ? 'execution start' : 'deliverable completion', items: group.items, note: group.note || null });
  }
  return out;
}
