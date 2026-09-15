// Internal strategy report (Opus, after the proposal is approved; never sent to the client).
// The AI writes the analysis parts in English (Arabic quotes kept with a gloss); code builds the data sections and
// removes any evidence id that does not exist. It never adds services, deliverables, timelines, KPI targets or numbers.
import { runAiStep } from '../runner.js';
import { EVIDENCE_RULES } from '../prompts.js';
import { recordText } from '../../pipeline/steps/record.js';
import { load, loadSources, loadChecks } from '../../pipeline/client.js';
import { join } from 'node:path';

const s = (max) => ({ type: 'string', maxLength: max });
const ev = { type: 'array', maxItems: 5, items: { type: 'string', pattern: '^[ENHK][0-9]{3}$' } };
const arr = (items, max) => ({ type: 'array', maxItems: max, items });
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const level = { enum: ['low', 'medium', 'high'] };
const label = { enum: ['fact', 'inference'] };

export const AREAS = ['positioning', 'customer understanding', 'website first screen', 'product or service pages', 'conversion path', 'trust and proof', 'content', 'after-purchase and repeat', 'messaging and voice', 'price clarity', 'tracking', 'campaigns and launches', 'paid ads', 'search visibility', 'local listing', 'markets and language'];

export const reportSchema = obj({
  executiveSummary: obj({
    engagementIsAbout: s(300),
    topInsights: arr(obj({ title: s(120), what: s(400), why: s(400), soWhat: s(400), evidence: ev }), 3),
    biggestOpportunity: s(400),
    biggestRisk: s(400),
    confirmAtNextMeeting: arr(s(200), 4),
  }),
  strategicFrame: obj({
    clientInOneSentence: s(300),
    category: s(160),
    idealCustomer: s(300),
    statedVsRealProblem: s(500),
    howTheyMakeMoney: s(300),
    problemSizeFrequency: { enum: ['big and frequent', 'big and rare', 'small and frequent', 'small and rare', 'unknown'] },
    implication: s(400),
  }),
  currentState: obj({
    areas: arr(obj({ area: { enum: AREAS }, rating: { enum: ['strong', 'weak', 'unknown'] }, note: s(260), evidence: ev }), 16),
    shape: s(500),
    alreadyDoneWell: arr(s(220), 5),
    stuckItems: arr(s(220), 5),
  }),
  customerInsight: obj({
    themes: arr(obj({ kind: { enum: ['job', 'pain', 'trigger', 'objection', 'switching force', 'alternative'] }, text: s(300), confidence: level, quotes: arr(obj({ arabic: s(250), gloss: s(250), evidenceId: { type: 'string', pattern: '^[ENHK][0-9]{3}$' } }), 3) }), 10),
  }),
  competitive: obj({
    sharedClaims: arr(s(160), 6),
    whereCompetitorsWin: arr(obj({ competitor: s(80), text: s(300), evidence: ev }), 6),
    whiteSpace: arr(obj({ text: s(300), label }), 5),
    positioningAxes: obj({ x: s(60), y: s(60) }),
    placements: arr(obj({ brand: s(80), x: { enum: ['low', 'mid', 'high', 'unknown'] }, y: { enum: ['low', 'mid', 'high', 'unknown'] } }), 8),
  }),
  swot: obj({
    strengths: arr(obj({ text: s(260), label, evidence: ev }), 6),
    weaknesses: arr(obj({ text: s(260), label, evidence: ev }), 6),
    opportunities: arr(obj({ text: s(260), label, evidence: ev }), 6),
    threats: arr(obj({ text: s(260), label, evidence: ev }), 6),
    push: arr(s(260), 3),
    fixFirst: arr(s(260), 3),
    defend: arr(s(260), 3),
    exposed: arr(s(260), 3),
  }),
  offerFunnel: obj({
    levers: arr(obj({ lever: { enum: ['dream outcome', 'likelihood of success', 'time to result', 'effort to buy'] }, score: { anyOf: [{ type: 'integer', minimum: 1, maximum: 10 }, { type: 'null' }] }, reason: s(300) }), 4),
    missingOfferParts: arr(s(200), 6),
    journey: s(500),
    bindingConstraint: s(400),
  }),
  measurement: obj({ tracked: arr(s(160), 8), unknown: arr(s(160), 8), verifiedShare: s(200) }),
  risks: arr(obj({ risk: s(260), kind: { enum: ['delivery', 'market', 'data', 'platform dependency'] }, likelihood: level, damage: level, mitigation: s(300) }), 8),
  outsideScope: arr(obj({ text: s(300), evidence: ev }), 6),
  nextMeeting: arr(obj({ question: s(260), why: s(260), unblocks: s(200), impact: level }), 10),
});

export const REPORT_RULES = `<internal_report_rules>
- Audience: Al-Marketer's team, in English. Arabic quotes stay in Arabic, each with a short English gloss.
- Every insight follows What (the data) → Why (the cause or customer psychology) → So what (the implication for this engagement).
- Titles state the insight, not the topic: "Sales stop at the Instagram DM", not "Channels".
- Zero invented numbers. When important data is missing, say "Data not available" and add a next-meeting question.
- Keep facts and inferences separate (label them). Never add services, deliverables, timelines or KPI targets beyond the approved scope given below; you may refer to them, never change them.
- Every opportunity names its mechanism (why it would work). Name uncomfortable findings plainly. Say "nothing to add" rather than padding.
- Next-meeting questions: ranked by impact; include questions that could prove our diagnosis wrong; unknown numbers the client can give come first; never leading questions.
- Evidence ids must be ids that appear in the material below (E###, N###, H###, K###).
</internal_report_rules>`;

// Everything the analyst may use, as compact text.
export function reportMaterial(p, { intake, plan, problems, rejected, content }) {
  const scorecard = load(p.scorecard, null);
  const competitors = load(p.competitors, { list: [] }).list;
  const checks = loadChecks(p);
  const readiness = load(p.readiness, {});
  const diagnosis = load(p.diagnosis, { observations: [], missingInfo: [] });
  const score = scorecard?.platforms?.map((pl) => `${pl.name}: ${pl.rows.filter((r) => r.metrics).map((r) => `${r.name}${r.role === 'client' ? ' (client)' : ''} followers ${r.metrics.followers ?? '?'}, posts/week ${r.metrics.postsPerWeek ?? '?'}, last post ${r.metrics.lastPostDate || '?'}, engagement ${r.metrics.engagementRate ?? '?'}% [${r.checkId || ''}]`).join('; ')}`).join('\n') || 'no social scorecard';
  return `<client name="${intake.name}" cover="${intake.displayName || intake.name}" website="${intake.website || ''}" market="${intake.market || ''}" industry="${intake.industry || ''}" constraints="${String(intake.constraints || '').replace(/"/g, "'")}" />

<client_information_record>
${recordText(load(p.record, { sections: {} }))}
</client_information_record>

<checks note="measured by code or recorded by the team">
${checks.slice(0, 120).map((c) => `${c.id} ${c.question}: ${c.result === 'value' ? c.value : c.result}${c.detail ? ` (${String(c.detail).slice(0, 120)})` : ''}`).join('\n')}
</checks>

<social_scorecard>
${score}
</social_scorecard>

<competitors>
${competitors.map((c) => `${c.name} (${c.status}${c.website ? `, ${c.website}` : ''})${c.reason ? `: ${c.reason}` : ''}`).join('\n') || 'none'}
</competitors>

<readiness>
${Object.entries(readiness).map(([k, v]) => `${k}: ${v?.value ?? v}`).join('\n') || 'unknown'}
</readiness>

<approved_problems>
${problems.map((x) => `${x.id} [severity ${x.severity}, ${x.problemType}] ${x.title_ar}: ${x.statement_ar} | evidence: ${x.evidence.map((e) => e.evidenceId).join(', ')} | reviewer: ${x.review?.verdict || 'n/a'} — ${x.review?.reason || ''}`).join('\n')}
</approved_problems>

<rejected_or_undecided_problems>
${rejected.map((x) => `${x.id} ${x.title_ar} | reviewer: ${x.review?.verdict || 'n/a'} — ${x.review?.reason || ''}`).join('\n') || 'none'}
</rejected_or_undecided_problems>

<observations_and_missing_information>
${[...(diagnosis.observations || []).map((o) => `observation: ${o.text}`), ...(diagnosis.missingInfo || []).map((m) => `missing: ${m.question} (${m.why})`)].join('\n') || 'none'}
</observations_and_missing_information>

<approved_scope note="decided by the rule engine and approved; do not change">
${plan.scope.groups.map((g) => `${g.nameEn} (${g.mandatory ? 'foundation' : g.phase === 'P1' ? 'month 1' : 'month 2'}) for ${g.problemIds.join(', ') || 'every contract'}`).join('\n')}
Needed but left out: ${plan.scope.excluded.map((e) => `${e.nameEn} (${e.reason})`).join(', ') || 'none'}
KPIs: ${plan.kpis.map((k) => `${k.nameEn}: ${k.items.map((i) => i.en).join(' / ')}`).join(' | ')}
</approved_scope>

<business_analyst note="business model and internal observations from the business layer">
${(() => {
  const ops = load(join(p.researchDir, 'business-ops.json'), null);
  if (!ops) return 'not available';
  return [`business model: ${ops.businessModel.label} (${ops.businessModel.confidence})`, ...ops.facts.map((f) => `${f.field}: ${f.value} [${f.evidenceId}]`), ...ops.observations.map((o) => `${o.kind || 'observation'} (${o.affects || o.area}): ${o.text_en} [${o.evidence.map((e) => e.evidenceId).join(', ')}]`)].join('\n');
})()}
</business_analyst>

<proposal_promise>
${content?.cover ? `${content.cover.subtitle} — ${content.cover.lead}` : ''}
</proposal_promise>`;
}

export async function runReportStep(p, { intake, plan, problems, rejected, logFile }) {
  const content = load(p.content, null);
  const material = reportMaterial(p, { intake, plan, problems, rejected, content });
  const prompt = `${EVIDENCE_RULES}

${REPORT_RULES}

<task>
Write the analysis parts of Al-Marketer's internal strategy report for "${intake.name}". The proposal is approved; this report is for the team only (next meeting, delivery planning, risks). Use only the material below.
- executiveSummary: readable in 60 seconds.
- strategicFrame: the client in one sentence, category, ideal customer, the stated ask vs the real problem, how the business makes money, problem size × frequency (an inference) and what it implies.
- currentState: rate each coverage area strong / weak / unknown with a cited note; describe the shape of strengths and gaps; what is already done well; stuck items.
- customerInsight: jobs, pains, triggers, objections, switching forces, alternatives — only from the notes and evidence, with Arabic quotes and English glosses.
- competitive: claims everyone makes, where competitors genuinely win, white space, and a simple positioning map (two axes that matter here; place brands only where evidence allows).
- swot with its four crossings: push (strength × opportunity), fixFirst (weakness × opportunity), defend (strength × threat), exposed (weakness × threat).
- offerFunnel: score the four value levers 1–10 (null when unknown) with reasons, missing offer parts, the purchase journey and the binding constraint.
- measurement, risks (likelihood × damage, mitigation for the team to decide), outsideScope (business observations that match no approved service; observations only, never offers), nextMeeting questions ranked by impact.
</task>

${material}`;

  const known = new Set([...loadSources(p).map((x) => x.id), ...loadChecks(p).map((c) => c.id)]);
  const { output } = await runAiStep({ step: 'report', systemPrompt: 'You are the strategy lead at Al-Marketer, a marketing agency. You write sharp, honest internal analysis for the team from evidence only, and return only the requested JSON.', prompt, schema: reportSchema, logFile, requestsDir: p.aiRequestsDir, timeoutMs: 25 * 60_000 });
  const removed = [];
  // Evidence ids that do not exist are removed (and counted), never kept.
  const clean = JSON.parse(JSON.stringify(output), (key, value) => {
    if ((key === 'evidence' && Array.isArray(value)) || key === 'evidenceId') {
      const list = [].concat(value);
      const kept = list.filter((id) => known.has(id));
      removed.push(...list.filter((id) => !known.has(id)));
      return key === 'evidenceId' ? kept[0] || null : kept;
    }
    return value;
  });
  return { analysis: clean, removedEvidence: [...new Set(removed)], at: new Date().toISOString() };
}

export const reportPaths = (p) => ({ json: join(p.internalDir, 'internal-report.json'), html: join(p.internalDir, 'internal-report.html'), pdf: join(p.internalDir, 'internal-report.pdf') });
