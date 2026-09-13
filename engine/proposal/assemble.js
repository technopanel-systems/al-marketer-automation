// Assembles the DeckModel the renderer needs from: AI-written free-text slots (content.json)
// + deterministic plan data (scope, schedule, KPIs). Names, months, weeks and KPIs always come from code.
import { monthOfWeek } from '../plan/schedule.js';

export const SERVICE_ICONS = {
  'svc.product_portfolio_management': 'package',
  'svc.brand_management': 'gem',
  'svc.marketing_management': 'compass',
  'svc.social_media_management': 'message-circle',
  'svc.website_management': 'globe',
  'svc.performance_marketing': 'megaphone',
  'svc.email_marketing': 'mail',
  'svc.marketing_automation': 'workflow',
  'svc.influencer_marketing': 'users',
  'svc.media_production': 'camera',
};

export const EXPECTED_NOTE = 'ده الأثر المتوقع، مش ضمان نتيجة — هنقيسه ونحسّن عليه بالدليل.';
export const TRACKING_PILLARS = [
  { title: 'لوحة متابعة حية', text: 'على Notion وحسب النطاق: المؤشرات، أرقام الأداء، تقدّم التنفيذ، وأهم الملاحظات.' },
  { title: 'مراجعة أداء دورية', text: 'ثلاثة أسئلة كل مرة: إيه اللي حصل؟ ليه حصل؟ وإيه اللي هنغيّره؟' },
  { title: 'تحسين مبني على دليل', text: 'دليل ← استنتاج ← قرار معتمد ← تنفيذ محدّث ← بيانات جديدة.' },
];
export const FOUNDATION_WHY = 'ثلاث تسليمات ثابتة في كل تعاقد وبالترتيب ده: نفهم بنبيع إيه، نثبّت البراند، وبعدين نرسم الاستراتيجية.';

const weekLabel = (start, end) => (start === end ? `أسبوع ${start}` : `أسابيع ${start}–${end}`);
const startLabel = (phase) => (phase === 'P1' ? 'يبدأ في الشهر الأول' : 'يبدأ في الشهر الثاني');

export function assembleDeck({ client, content, plan, problemsView = [] }) {
  const { scope, schedule, kpis } = plan;
  const problemsInProposal = scope.problems.filter((p) => p.status === 'in_proposal');
  const inProposalIds = new Set(problemsInProposal.map((p) => p.id));
  const byProblem = (list) => new Map((list || []).filter((x) => inProposalIds.has(x.problemId)).map((x) => [x.problemId, x]));
  const problemText = byProblem(content.problems.items);
  const impactText = byProblem(content.impact.items);
  const solutionText = byProblem(content.solutions.items);
  const expectedText = byProblem(content.expected.rows);
  const order = problemsInProposal.map((p) => p.id).filter((id) => problemText.has(id));

  const targetsById = new Map(scope.groups.flatMap((g) => g.targets.map((t) => [t.id, { ...t, group: g }])));
  const conditionalFor = (problemId) => scope.deliverables.filter((d) => d.kind === 'conditional' && d.problemIds.includes(problemId));

  const solutionItems = order.map((id) => {
    const info = scope.problems.find((p) => p.id === id);
    const targets = info.targetIds.map((tid) => targetsById.get(tid)).filter(Boolean);
    const groups = [...new Map(targets.map((t) => [t.group.serviceId, t.group])).values()];
    const serviceName = groups
      .map((g) => (g.display === 'service' ? g.nameAr : g.targets.filter((t) => targets.some((x) => x.id === t.id)).map((t) => t.nameAr).join(' + ')))
      .join(' + ');
    const offeringNames = [
      ...groups.filter((g) => g.display === 'service' && g.targets.length > 1).flatMap((g) => g.targets.map((t) => t.nameAr)),
      ...conditionalFor(id).map((d) => d.nameAr),
    ];
    const phases = groups.map((g) => g.phase);
    return {
      problemId: id,
      problem: problemText.get(id).title,
      serviceName,
      offeringNames,
      why: solutionText.get(id)?.why || '',
      startLabel: startLabel(phases.includes('P1') ? 'P1' : 'P2'),
    };
  });
  // Rule 12: strategic services with no linked problem still answer "why is this here?"
  const foundationWithoutProblem = scope.groups.filter((g) => g.mandatory && g.problemIds.length === 0);
  if (foundationWithoutProblem.length) {
    solutionItems.push({
      problemId: null,
      problem: 'الأساس الاستراتيجي',
      serviceName: foundationWithoutProblem.map((g) => g.nameAr).join(' + '),
      offeringNames: [],
      why: FOUNDATION_WHY,
      startLabel: 'الأسبوع الأول',
    });
  }

  const months = { 1: [], 2: [], 3: [] };
  for (const m of [1, 2, 3]) {
    const seen = new Set();
    for (const i of schedule.months[m]) {
      if (seen.has(i.deliverableId)) continue;
      seen.add(i.deliverableId);
      months[m].push({ id: i.deliverableId, name: i.nameAr, weeks: weekLabel(i.startWeek, i.endWeek), strategic: i.stage === 'strategic' });
    }
  }

  const weekTitles = content.weeks.weekTitles || [];
  const weeks = [1, 2, 3, 4].map((w) => ({
    title: weekTitles[w - 1] || `الأسبوع ${w}`,
    items: [...new Map(schedule.weeks[w].map((i) => [i.deliverableId, i.nameAr])).values()],
  }));

  return {
    client,
    cover: {
      eyebrow: content.cover.eyebrow || 'عرض فني',
      clientDisplay: client.displayName,
      accent: content.cover.accent || '',
      subtitle: content.cover.subtitle,
      lead: content.cover.lead,
      presentedTo: client.presentedTo,
    },
    business: {
      title: content.business.title,
      intro: content.business.intro,
      cardsLabel: 'الموجود بالفعل',
      cards: content.business.cards,
      highlight: content.business.highlight ? { label: content.business.highlightLabel || 'الهدف الحالي', text: content.business.highlight } : null,
    },
    brand: {
      title: content.brand.title,
      intro: content.brand.intro,
      factsLabel: content.brand.factsLabel || '',
      facts: (content.brand.facts || []).map((f) => (typeof f === 'string' ? f : f.text)),
      stats: content.brand.stats || [],
      cards: content.brand.cards || [],
      note: content.brand.note || '',
    },
    problems: {
      title: content.problems.title,
      intro: content.problems.intro,
      items: order.map((id) => ({ problemId: id, ...problemText.get(id) })),
    },
    impact: {
      title: content.impact.title,
      intro: content.impact.intro,
      // The impact category comes from the approved diagnosis (code), not from the writer.
      items: order.filter((id) => impactText.has(id)).map((id) => ({ problemId: id, ...impactText.get(id), category: problemsView.find((x) => x.id === id)?.impacts?.[0]?.category || impactText.get(id).category, problem: problemText.get(id).title })),
    },
    solutions: { title: content.solutions.title, intro: content.solutions.intro, items: solutionItems },
    expected: {
      title: content.expected.title,
      intro: content.expected.intro,
      rows: order.filter((id) => expectedText.has(id)).map((id) => ({ problemId: id, ...expectedText.get(id) })),
      note: EXPECTED_NOTE,
    },
    map: {
      title: content.map.title,
      intro: content.map.intro,
      months,
      afterMonth3: [...new Map(schedule.afterMonth3.map((i) => [i.deliverableId, i.nameAr])).values()],
    },
    weeks: { title: content.weeks.title, intro: content.weeks.intro, weeks, note: content.weeks.note || '' },
    kpis: {
      title: content.kpis.title,
      intro: content.kpis.intro,
      groups: kpis.map((k) => ({
        targetId: k.targetId,
        name: k.nameAr,
        icon: k.targetId.startsWith('del.') ? 'repeat' : SERVICE_ICONS[scope.groups.find((g) => g.targets.some((t) => t.id === k.targetId))?.serviceId] || 'gauge',
        items: k.items.map((i) => i.ar),
        from: `من الأسبوع ${k.startWeek} · الشهر ${monthOfWeek(k.startWeek)}`,
      })),
      note: '',
    },
    tracking: {
      title: content.tracking.title,
      intro: content.tracking.intro,
      pillars: TRACKING_PILLARS,
      principle: { label: 'القاعدة اللي هنمشي بيها طول المشروع', lines: content.tracking.principleLines, footRight: `الماركتير × ${client.displayName}`, footLeft: client.year || String(new Date().getFullYear()) },
    },
  };
}
