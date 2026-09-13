// Rule engine tests against the real catalog and approved rules: every Blueprint rule the code enforces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogAndRules, checkRulesAgainstCatalog } from '../../engine/rules/load.js';
import { buildPlan } from '../../engine/plan/build.js';

const { catalog, rules } = loadCatalogAndRules();
const P = (id, type, severity = 2) => ({ id, type, severity });
const plan = (problems, extra = {}) => buildPlan({ catalog, rules, problems, readiness: extra.readiness || {}, gate2: extra.gate2 || {} });
const failed = (r) => r.checks.filter((c) => !c.ok);
const targetIds = (r) => r.scope.groups.flatMap((g) => g.targets.map((t) => t.id));
const items = (r, id) => r.schedule.items.filter((i) => i.deliverableId === id);

test('rules only reference active catalog items', () => {
  assert.deepEqual(checkRulesAgainstCatalog(rules, catalog), []);
});

test('no problems → exactly the 3 strategic services, week 1 in fixed order, all checks pass', () => {
  const r = plan([]);
  assert.deepEqual(targetIds(r), ['svc.product_portfolio_management', 'svc.brand_management', 'svc.marketing_management']);
  assert.deepEqual(r.schedule.weeks[1].map((i) => i.deliverableId), ['del.product_portfolio_master_sheet', 'del.brand_book_documentation', 'del.marketing_strategy_map']);
  assert.ok(!r.scope.deliverables.some((d) => d.id === 'del.loyalty_journey_transformation'), 'conditional deliverable not activated without a problem');
  assert.deepEqual(failed(r), []);
});

test('rule 05: choosing one offering activates only its deliverables (no sideways expansion)', () => {
  const r = plan([P('P1', 'low_search_visibility')]);
  assert.ok(targetIds(r).includes('off.seo'));
  assert.ok(!targetIds(r).includes('off.website_building'));
  assert.ok(r.scope.deliverables.every((d) => d.targetId !== 'off.website_building'));
  assert.equal(r.scope.groups.find((g) => g.serviceId === 'svc.website_management').display, 'offerings');
  assert.deepEqual(failed(r), []);
});

test('rule 04: when every offering is justified the full service name is used and all fixed deliverables appear', () => {
  const r = plan([P('P1', 'low_search_visibility'), P('P2', 'weak_conversion_path')]);
  const g = r.scope.groups.find((x) => x.serviceId === 'svc.website_management');
  assert.equal(g.display, 'service');
  const expected = catalog.deliverables.filter((d) => ['off.seo', 'off.website_building'].includes(d.parentId)).map((d) => d.id).sort();
  assert.deepEqual(r.scope.deliverables.filter((d) => d.serviceId === 'svc.website_management').map((d) => d.id).sort(), expected);
});

test('conditional deliverable is activated only by a justifying problem type', () => {
  const r = plan([P('P1', 'no_post_purchase_journey', 3)]);
  const loyalty = r.scope.deliverables.find((d) => d.id === 'del.loyalty_journey_transformation');
  assert.ok(loyalty);
  assert.deepEqual(loyalty.problemIds, ['P1']);
  assert.deepEqual(items(r, 'del.loyalty_journey_transformation').map((i) => [i.startWeek, i.endWeek]), [[5, 6]]);
  assert.deepEqual(failed(r), []);
});

test('capability 0–1 or blank is excluded by default and its problem leaves the client proposal', () => {
  const r = plan([P('P1', 'low_third_party_reach'), P('P2', 'insufficient_visual_assets')]);
  assert.deepEqual(r.scope.excluded.map((e) => e.id).sort(), ['svc.influencer_marketing', 'svc.media_production']);
  assert.deepEqual(r.scope.problems.map((p) => p.status), ['excluded_low_capability', 'excluded_low_capability']);
  assert.deepEqual(failed(r), []);
});

test('Gate 2 opt-in brings a low-capability service back, scheduled in month 2 for influencer marketing', () => {
  const r = plan([P('P1', 'low_third_party_reach')], { gate2: { optIn: ['svc.influencer_marketing'] } });
  const g = r.scope.groups.find((x) => x.serviceId === 'svc.influencer_marketing');
  assert.equal(g.phase, 'P2');
  const exec = items(r, 'del.influencer_campaign_execution')[0];
  assert.ok(exec.startWeek >= 6);
  const report = items(r, 'del.influencer_campaign_performance_report')[0];
  assert.ok(report.startWeek >= exec.endWeek + 2);
  assert.deepEqual(failed(r), []);
});

test('capability 2 is included without opt-in (Performance Marketing)', () => {
  const r = plan([P('P1', 'paid_meta_gap')]);
  assert.ok(targetIds(r).includes('off.meta_ads'));
});

test('rule 14/Q14: at most 2 extra services start in month 1, ranked by severity', () => {
  const r = plan([P('P1', 'low_search_visibility', 1), P('P2', 'paid_meta_gap', 3), P('P3', 'social_irregular', 2), P('P4', 'paid_search_gap', 3)]);
  const nonStrategic = r.scope.groups.filter((g) => !g.mandatory);
  assert.equal(nonStrategic.filter((g) => g.phase === 'P1').length, 2);
  assert.equal(r.scope.groups.find((g) => g.serviceId === 'svc.performance_marketing').phase, 'P1', 'highest score first');
  assert.equal(r.scope.groups.find((g) => g.serviceId === 'svc.website_management').phase, 'P2');
  assert.deepEqual(failed(r), []);
});

test('rules 09/10: P1 prep in week 2, execution from week 3, dashboards after execution, no optimisation in month 1', () => {
  const r = plan([P('P1', 'paid_meta_gap', 3)]);
  assert.equal(items(r, 'del.meta_ads_research_analysis_report')[0].startWeek, 2);
  assert.equal(items(r, 'del.meta_ads_plan')[0].startWeek, 2);
  assert.equal(items(r, 'del.meta_ads_campaign_execution')[0].startWeek, 3);
  assert.ok(items(r, 'del.meta_ads_monitoring_dashboard')[0].startWeek > 3);
  assert.ok(items(r, 'del.meta_ads_optimization_reports').every((i) => i.startWeek > 4));
  assert.deepEqual(items(r, 'del.meta_ads_campaign_execution').map((i) => [i.startWeek, i.endWeek]), [[3, 4], [5, 8], [9, 12]], 'recurring execution repeats monthly');
});

test('website building override: build weeks 3–7, dashboard week 8, optimisation week 12', () => {
  const r = plan([P('P1', 'weak_conversion_path', 3)]);
  assert.deepEqual(items(r, 'del.website_building').map((i) => [i.startWeek, i.endWeek]), [[3, 7]]);
  assert.deepEqual(items(r, 'del.website_monitoring_dashboard').map((i) => i.startWeek), [8]);
  assert.deepEqual(items(r, 'del.website_optimization_reports').map((i) => i.startWeek), [12]);
});

test('automation workflows wait for email execution when both are selected', () => {
  const r = plan([P('P1', 'no_owned_audience_nurture', 3), P('P2', 'manual_lead_follow_up', 3)], { gate2: { optIn: ['svc.email_marketing', 'svc.marketing_automation'] } });
  const email = items(r, 'del.email_marketing_campaign_execution')[0];
  const workflows = items(r, 'del.implemented_marketing_automation_workflows')[0];
  assert.ok(workflows.startWeek > email.startWeek);
  assert.deepEqual(failed(r), []);
});

test('ads readiness: "no" moves the service to month 2, "unknown" is flagged', () => {
  const notReady = plan([P('P1', 'paid_meta_gap', 3)], { readiness: { tracking_installed: 'no', ad_account_access: 'yes' } });
  assert.equal(notReady.scope.groups.find((g) => g.serviceId === 'svc.performance_marketing').phase, 'P2');
  const unknown = plan([P('P1', 'paid_meta_gap', 3)]);
  assert.ok(unknown.scope.flags.some((f) => f.code === 'readiness_unconfirmed'));
});

test('unmapped and readiness-blocker problem types add no services', () => {
  const r = plan([P('P1', 'unmapped'), P('P2', 'measurement_missing')]);
  assert.equal(targetIds(r).length, 3);
  assert.deepEqual(r.scope.problems.map((p) => p.status), ['unmapped', 'readiness_blocker']);
});

test('Gate 2: strategic services cannot be removed; additions need a problem or a reason; removals drop the problem', () => {
  const r1 = plan([], { gate2: { remove: ['svc.brand_management'] } });
  assert.ok(r1.scope.flags.some((f) => f.code === 'cannot_remove_strategic'));
  assert.ok(targetIds(r1).includes('svc.brand_management'));
  const r2 = plan([], { gate2: { add: [{ targetId: 'off.seo' }] } });
  assert.ok(r2.scope.flags.some((f) => f.code === 'addition_without_reason'));
  const r3 = plan([P('P1', 'low_search_visibility')], { gate2: { remove: ['off.seo'] } });
  assert.equal(r3.scope.problems[0].status, 'removed_at_gate2');
  const r4 = plan([], { gate2: { add: [{ targetId: 'off.google_ads', reason: 'Client asked for search ads in the meeting' }] } });
  assert.ok(targetIds(r4).includes('off.google_ads'));
  assert.deepEqual(failed(r4), []);
});

test('unknown problem type is an error, not a silent guess', () => {
  const r = plan([P('P1', 'make_it_pop')]);
  assert.equal(r.ok, false);
  assert.ok(r.scope.flags.some((f) => f.code === 'invalid_problem_type'));
});

test('KPIs appear only for approved scope and never before measurement starts', () => {
  const r = plan([P('P1', 'paid_meta_gap', 3), P('P2', 'insufficient_visual_assets')]);
  const kpiTargets = r.kpis.map((k) => k.targetId);
  assert.ok(kpiTargets.includes('off.meta_ads'));
  assert.ok(!kpiTargets.includes('svc.media_production'));
  assert.equal(r.kpis.find((k) => k.targetId === 'off.meta_ads').startWeek, items(r, 'del.meta_ads_monitoring_dashboard')[0].startWeek);
});

test('every problem-type combination of the approved table produces a plan that passes all checks', () => {
  for (const type of rules.problemTypes.types) {
    const r = plan([P('P1', type.id, 3)], { gate2: { optIn: catalog.services.map((s) => s.id) }, readiness: { tracking_installed: 'yes', ad_account_access: 'yes' } });
    assert.deepEqual(failed(r), [], `type ${type.id}`);
  }
  const all = rules.problemTypes.types.map((t, i) => P(`P${i + 1}`, t.id, (i % 3) + 1));
  const r = plan(all, { gate2: { optIn: catalog.services.map((s) => s.id) }, readiness: { tracking_installed: 'yes', ad_account_access: 'yes' } });
  assert.deepEqual(failed(r), []);
});

test('deterministic: same input → identical output', () => {
  const input = [P('P1', 'paid_meta_gap', 3), P('P2', 'social_irregular', 2), P('P3', 'low_search_visibility', 1)];
  assert.equal(JSON.stringify(plan(input)), JSON.stringify(plan(input)));
});
