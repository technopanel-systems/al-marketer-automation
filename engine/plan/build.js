// One call from confirmed problems to scope + schedule + KPIs + checks.
import { resolveScope } from '../scope/resolve.js';
import { buildSchedule } from './schedule.js';
import { pickKpis } from './kpis.js';
import { runScopeChecks } from '../checks/scope-checks.js';

export function buildPlan({ catalog, rules, problems, readiness, gate2 }) {
  const scope = resolveScope({ catalog, rules, problems, readiness, gate2 });
  const schedule = buildSchedule({ scope, rules });
  const kpis = pickKpis({ scope, schedule, rules });
  const checks = runScopeChecks({ catalog, rules, scope, schedule, kpis });
  const errors = [...scope.flags, ...schedule.flags].filter((f) => f.level === 'error');
  return { scope, schedule, kpis, checks, ok: errors.length === 0 && checks.every((c) => c.ok) };
}
