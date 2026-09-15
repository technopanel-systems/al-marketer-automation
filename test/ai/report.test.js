// Internal strategy report: the AI analysis is checked by code (unknown evidence ids removed) and laid out with the
// data sections built from saved files. Fed with a saved answer instead of Claude.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-report-'));
process.env.ALM_CLIENTS_DIR = root;
process.env.ALM_AI_MODE = 'files';
const { clientPaths, addTextSource, upsertCheck, save } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { runReportStep, reportSchema } = await import('../../ai/steps/report.js');
const { buildReportHtml } = await import('../../render/report.js');
after(() => rmSync(root, { recursive: true, force: true }));

const analysis = (e, k) => ({
  executiveSummary: { engagementIsAbout: 'Turning a quiet LinkedIn presence into enquiries.', topInsights: [{ title: 'Posting stopped 111 days ago', what: 'No LinkedIn post since May.', why: 'No content owner.', soWhat: 'Month 1 content matters most.', evidence: [k, 'K999'] }], biggestOpportunity: 'Competitors post weekly.', biggestRisk: 'Two brand names confuse buyers.', confirmAtNextMeeting: ['Who approves posts?'] },
  strategicFrame: { clientInOneSentence: 'An aluminium facade maker in Riyadh.', category: 'B2B building materials', idealCustomer: 'Contractors', statedVsRealProblem: 'Asked for followers; needs enquiries.', howTheyMakeMoney: 'Project contracts', problemSizeFrequency: 'big and rare', implication: 'Long sales cycle; trust matters.' },
  currentState: { areas: [{ area: 'content', rating: 'weak', note: 'Stopped posting.', evidence: [k] }, { area: 'paid ads', rating: 'unknown', note: 'Not visible.', evidence: [] }], shape: 'Strong products, weak visibility.', alreadyDoneWell: ['Clear product pages'], stuckItems: [] },
  customerInsight: { themes: [{ kind: 'pain', text: 'Delays on site.', confidence: 'medium', quotes: [{ arabic: 'التوريد متأخر دايمًا', gloss: 'Supply is always late', evidenceId: e }] }] },
  competitive: { sharedClaims: ['Best quality'], whereCompetitorsWin: [{ competitor: 'Magico', text: 'Posts 4.8 times a week.', evidence: [k] }], whiteSpace: [{ text: 'Nobody shows finished projects on TikTok.', label: 'inference' }], positioningAxes: { x: 'Price', y: 'Specialisation' }, placements: [{ brand: 'ALUVI', x: 'mid', y: 'high' }, { brand: 'Magico', x: 'unknown', y: 'mid' }] },
  swot: { strengths: [{ text: 'Factory in Riyadh', label: 'fact', evidence: [e] }], weaknesses: [], opportunities: [], threats: [], push: [], fixFirst: ['Unify the name'], defend: [], exposed: [] },
  offerFunnel: { levers: [{ lever: 'effort to buy', score: 4, reason: 'Catalogue only as PDF.' }, { lever: 'time to result', score: null, reason: 'Unknown.' }], missingOfferParts: ['Prices'], journey: 'Website → phone call.', bindingConstraint: 'No enquiry form.' },
  measurement: { tracked: [], unknown: ['Lead volume'], verifiedShare: 'About half.' },
  risks: [{ risk: 'Slow approvals', kind: 'delivery', likelihood: 'high', damage: 'medium', mitigation: 'Agree an approver.' }],
  outsideScope: [{ text: 'No ERP for quotes', evidence: [] }],
  nextMeeting: [{ question: 'How many enquiries a month today?', why: 'Baseline', unblocks: 'KPI targets', impact: 'high' }],
});

test('the report keeps real evidence ids, removes invented ones, and lays out every section with the data tables', async () => {
  createClient({ slug: 'r', name: 'ALUVI', website: 'https://m-alshareef.com', market: 'Saudi Arabia', notes: 'التوريد متأخر دايمًا' });
  const p = clientPaths('r');
  const e = addTextSource(p, { kind: 'website', url: 'https://m-alshareef.com', title: 'Home', text: 'Factory in Riyadh' }).id;
  const k = upsertCheck(p, { key: 'social:client:linkedin:last', question: 'LinkedIn last post', result: 'value', value: '111 days ago' }).id;
  save(p.record, { sections: {}, factCount: 0 });
  mkdirSync(p.aiRequestsDir, { recursive: true });
  writeFileSync(join(p.aiRequestsDir, 'report.answer.json'), JSON.stringify(analysis(e, k)));
  const plan = { scope: { groups: [{ serviceId: 'svc.brand_management', nameEn: 'Brand Management', nameAr: 'إدارة البراند', mandatory: true, phase: 'P1', problemIds: ['P1'] }], excluded: [] }, kpis: [{ nameEn: 'Brand Management', startWeek: 1, items: [{ en: 'Brand guide delivered' }] }] };
  const problems = [{ id: 'P1', title_ar: 'هوية البراند مشتتة', statement_ar: 'اسمين', problemType: 'brand_identity_inconsistent', severity: 3, evidence: [{ evidenceId: e }], review: { verdict: 'confirmed' } }];
  const r = await runReportStep(p, { intake: { name: 'ALUVI', website: 'https://m-alshareef.com' }, plan, problems, rejected: [] });
  assert.deepEqual(r.removedEvidence, ['K999'], 'an id that does not exist is removed and reported');
  assert.deepEqual(r.analysis.executiveSummary.topInsights[0].evidence, [k]);
  assert.equal(r.analysis.customerInsight.themes[0].quotes[0].evidenceId, e);

  const html = buildReportHtml({ intake: { name: 'ALUVI', displayName: 'ALUVI <b>', website: 'https://m-alshareef.com', market: 'Saudi Arabia' }, analysis: r.analysis, removedEvidence: r.removedEvidence, problems, rejected: [{ id: 'P2', title_ar: 'مشكلة مرفوضة', review: { reason: 'brand claim only' } }], plan, scorecard: null, competitors: [{ name: 'Magico', status: 'confirmed', website: 'https://magico-sa.com' }], readiness: { ad_budget: { value: 'no' } }, sources: [{ id: e, kind: 'website', title: 'Home', fetchedAt: new Date().toISOString() }], usage: { steps: [{ label: 'Diagnosis', runs: 1, costUsd: 0.65 }], total: { runs: 1, costUsd: 0.65 } }, gate3: { version: 1 }, sent: false, generatedAt: new Date().toISOString() });
  for (const title of ['Executive summary', 'Strategic frame', 'Current state', 'Customer insight', 'Competitive landscape', 'SWOT and what it means', 'Offer and purchase journey', 'Measurement and readiness', 'Risks', 'Outside the approved scope', 'Next meeting', 'Appendix']) assert.match(html, new RegExp(`</span>${title}</h2>`), title);
  assert.match(html, /INTERNAL — NOT FOR THE CLIENT/);
  assert.match(html, /ALUVI &lt;b&gt;/, 'text is escaped');
  assert.match(html, /<span dir="rtl" lang="ar" class="ar">التوريد متأخر دايمًا<\/span>/);
  assert.match(html, /Not enough evidence to place: Magico/);
  assert.match(html, /\$0\.65/);
  assert.match(html, /1 evidence id\(s\) that do not exist/);
  assert.ok(reportSchema.properties.nextMeeting);
});
