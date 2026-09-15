// Scope & plan stage: the services the rule engine chose from the approved problems, the 3-month map, the first
// four weeks, KPIs and scope checks, with the team's adjustments and the approval.
import { esc, attr, txt, ar } from '../ui/html.js';
import { section, status, button, field, select, empty, note, table } from '../ui/components.js';
import { stepList } from './research.js';
import { load } from '../../pipeline/client.js';
import { planFromDisk } from '../../pipeline/run.js';
import { addedProblems } from '../../pipeline/gates.js';

export function scopePage({ slug, p, state, ctx }) {
  const steps = stepList(slug, state, ['plan'], { back: 'scope' });
  const plan = planFromDisk(p);
  if (!plan) return `${section({ title: 'Scope and plan', body: empty('The scope is built by the rule engine as soon as the diagnosis is approved.') })}`;
  const g = load(p.gate2, { optIn: [], remove: [], add: [], phase: {} });
  const approved = state.steps.gate2.state === 'approved';
  const problems = [...load(p.diagnosis, { problems: [] }).problems, ...addedProblems(load(p.gate1, {}))];
  const titleOf = (id) => problems.find((x) => x.id === id)?.title_ar || id;
  const { scope, schedule, kpis, checks } = plan;
  const failing = checks.filter((c) => !c.ok);

  const groups = scope.groups.map((grp) => `<article class="service">
    <header class="service-head"><h3>${esc(grp.nameEn)} ${ar(grp.nameAr, 'span', 'muted')}</h3>${grp.mandatory ? status('In every contract', 'neutral') : status(`Rank ${grp.rank} · score ${grp.score}`, 'working')}</header>
    ${grp.display === 'offerings' ? `<p class="small">Offerings only: ${grp.targets.map((t) => `${esc(t.nameEn)} ${ar(t.nameAr, 'span', 'muted')}`).join(' · ')}</p>` : ''}
    <p class="small"><span class="muted">Because of:</span> ${grp.problemIds.length ? grp.problemIds.map((id) => `<span class="mono">${esc(id)}</span> ${ar(titleOf(id))}`).join(' · ') : 'the foundation every contract includes'}</p>
    <ul class="chips">${scope.deliverables.filter((d) => d.serviceId === grp.serviceId).map((d) => `<li>${esc(d.nameEn)}${d.kind === 'conditional' ? ' <span class="muted small">conditional</span>' : ''}</li>`).join('')}</ul>
    ${grp.mandatory ? '' : `<div class="service-edit"><label class="check"><input type="checkbox" name="remove" value="${attr(grp.serviceId)}"${g.remove.includes(grp.serviceId) ? ' checked' : ''}> Remove from scope</label>${field('Starts', select(`phase:${grp.serviceId}`, [['', `Automatic (${grp.phase === 'P1' ? 'month 1' : 'month 2'})`], ['P1', 'Month 1'], ['P2', 'Month 2']], g.phase[grp.serviceId] || ''))}</div>`}
  </article>`);

  const excluded = scope.excluded.map((e) => `<li class="excluded"><label class="check"><input type="checkbox" name="optin" value="${attr(e.serviceId)}"${g.optIn.includes(e.serviceId) ? ' checked' : ''}> <b>Include ${esc(e.nameEn)}</b> ${ar(e.nameAr, 'span', 'muted')}</label><p class="small muted">${e.reason === 'low_capability' ? `Capability ${e.capability ?? 'not set'} is below ${ctx.rules.settings.capabilityMinimumToInclude}, so it is left out unless you include it.` : 'Removed by you.'} Needed for: ${e.problemIds.map((id) => `<span class="mono">${esc(id)}</span> ${ar(titleOf(id))}`).join(' · ')}</p></li>`);
  const removed = g.remove.filter((id) => !scope.groups.some((x) => x.serviceId === id) && !scope.excluded.some((x) => x.serviceId === id));
  const targets = [...ctx.catalog.services.filter((s) => s.active && !s.strategic), ...ctx.catalog.offerings.filter((o) => o.active), ...ctx.catalog.deliverables.filter((d) => d.active && d.kind === 'conditional')];
  const unique = (list) => [...new Map(list.map((i) => [i.deliverableId, i])).values()];
  const month = (m) => `<div class="month"><h4 class="h4">Month ${m}</h4><ul>${unique(schedule.months[m]).map((i) => `<li>${ar(i.nameAr)} <span class="small muted nowrap">W${i.startWeek}${i.endWeek !== i.startWeek ? `–${i.endWeek}` : ''}</span></li>`).join('') || '<li class="muted">Nothing starts</li>'}</ul></div>`;
  const week = (w) => `<div class="month"><h4 class="h4">Week ${w}</h4><ul>${unique(schedule.weeks[w]).map((i) => `<li>${ar(i.nameAr)}</li>`).join('') || '<li class="muted">No new work</li>'}</ul></div>`;
  const flags = [...scope.flags, ...schedule.flags];

  return `${section({ title: 'Progress', body: steps, collapsible: true, open: false })}
  ${approved ? note('Approved. Saving changes re-opens the approval and the proposal is written again.', 'ok') : ''}
  ${flags.length ? note(flags.map((f) => esc(f.message)).join('<br>'), 'warn') : ''}
  <form method="post" action="/c/${attr(slug)}/scope" data-track-dirty>
    ${section({ title: 'Services', count: scope.groups.length, intro: 'Chosen by the rule engine from the approved problems and your catalog. No AI decides scope.', body: `<div class="services">${groups.join('')}</div>` })}
    ${excluded.length ? section({ title: 'Needed but left out', count: excluded.length, body: `<ul class="plain-list">${excluded.join('')}</ul>` }) : ''}
    ${removed.length ? `<p class="small">Removed: ${removed.map(esc).join(', ')}. Untick them in the list above to restore. ${removed.map((id) => `<input type="hidden" name="remove" value="${attr(id)}">`).join('')}</p>` : ''}
    ${(g.add || []).length ? section({ title: 'Added by you', body: `<ul class="plain-list">${g.add.map((a, i) => `<li><b>${esc(a.targetId)}</b> ${esc(a.reason || '')}${a.problemIds?.length ? ` <span class="small muted">for ${a.problemIds.map(esc).join(', ')}</span>` : ''} <label class="check small"><input type="checkbox" name="dropadd_${i}"> Remove this addition</label></li>`).join('')}</ul>` }) : ''}
    ${section({ title: 'Add something from the catalog', collapsible: true, open: false, body: `
      ${field('Service, offering or conditional deliverable', select('add_target', [['', 'Choose…'], ...targets.map((t) => [t.id, `${t.nameEn} — ${t.nameAr}`])], ''))}
      ${field('For which confirmed problems?', `<select name="add_problems" multiple size="4">${scope.problems.map((x) => `<option value="${attr(x.id)}">${esc(x.id)} ${esc(titleOf(x.id))}</option>`).join('')}</select>`, { help: 'No solution without a problem. If it is not linked to a problem, give a reason.' })}
      ${field('Reason', '<input type="text" name="add_reason" dir="auto">')}` })}
    ${section({ title: '3-month map', body: `<div class="months">${month(1)}${month(2)}${month(3)}</div>${schedule.afterMonth3.length ? `<p class="small muted">Continues after month 3: ${schedule.afterMonth3.map((i) => esc(i.nameEn)).join(', ')}</p>` : ''}` })}
    ${section({ title: 'First 4 weeks', body: `<div class="months months-4">${week(1)}${week(2)}${week(3)}${week(4)}</div>` })}
    ${section({ title: 'KPIs', body: table(['Service', ['From', 'nowrap'], 'KPIs'], kpis.map((k) => `<tr><td>${esc(k.nameEn)}</td><td class="nowrap">Week ${k.startWeek}</td><td>${k.items.map((i) => esc(i.en)).join(' · ')}</td></tr>`)) })}
    ${section({ title: failing.length ? `Scope checks: ${failing.length} failing` : `Scope checks: all ${checks.length} pass`, tone: failing.length ? 'bad' : '', collapsible: true, open: failing.length > 0, body: `<ul class="checklist">${checks.map((c) => `<li>${status(c.ok ? 'Pass' : 'Fail', c.ok ? 'done' : 'bad')} <span class="mono small">${esc(c.id)}</span> ${esc(c.message)}</li>`).join('')}</ul>` })}
    <div class="approve-bar${approved ? ' is-static' : ''}" role="region" aria-label="Approve scope">
      <div class="approve-info"><p class="small muted">Saving recalculates the map, weeks and KPIs. Approving starts writing and designing the proposal.</p></div>
      <div class="btn-row">${button('Save and recalculate', { value: 'save' })}${approved ? status('Approved', 'done') : button('Approve scope', { value: 'approve', kind: 'primary', confirm: 'Approve this scope? The proposal will be written from it.', disabled: failing.length > 0 })}</div>
    </div>
  </form>`;
}
