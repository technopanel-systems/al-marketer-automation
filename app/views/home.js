// Home: what needs a person across every proposal, then all proposals with their stage progress.
import { esc, attr, icon, txt, domainOf, relTime } from '../ui/html.js';
import { pageHeader, linkButton, status, stageStateText, empty, table } from '../ui/components.js';
import { taskMove, nowText } from '../ui/moves.js';
import { moveControl, removeMenu, removalText, keepButton } from './frame.js';
import { STAGES } from '../../pipeline/steps.js';
import { clientPaths, load } from '../../pipeline/client.js';
import { pendingRemoval } from '../jobs.js';

export function home({ clients, archived = 0, msg = '' }) {
  const needs = clients
    .filter((c) => !c.removal)
    .flatMap((c) => c.state.tasks.filter((t) => t.blocking).map((t) => ({ c, t, m: taskMove(c.slug, t) })))
    .filter((x) => x.m);
  const counts = {
    total: clients.length,
    needs: new Set(needs.map((x) => x.c.slug)).size,
    working: clients.filter((c) => c.job.running || c.state.running.length).length,
    sent: clients.filter((c) => c.state.blueprintStatus === 'sent').length,
  };
  const summary = clients.length ? `${counts.total} proposal${counts.total === 1 ? '' : 's'} · ${counts.needs} need${counts.needs === 1 ? 's' : ''} you · ${counts.working} working · ${counts.sent} sent` : '';

  const needsList = needs.length
    ? `<ul class="needs">${needs
        .map(({ c, t, m }) => `<li class="need need-${attr(m.tone)}">
          <span class="need-dot">${status('', m.tone === 'bad' ? 'bad' : 'you')}</span>
          <a class="need-client" href="/c/${attr(c.slug)}">${txt(c.cover || c.name)}</a>
          <span class="need-what"><b>${esc(m.label)}</b><span class="muted">${esc(m.detail)}</span></span>
          <span class="need-stage muted">${esc(STAGES.find((s) => s.id === t.stage)?.label || '')}</span>
          <span class="need-go">${moveControl({ ...m, tone: m.tone === 'bad' ? 'bad' : 'neutral' }, { size: 'sm' })}</span>
        </li>`)
        .join('')}</ul>`
    : empty('Nothing needs you right now. Work in progress is listed below and continues on its own.');

  const rows = clients.map((c) => {
    const progress = STAGES.map((s) => {
      const st = c.state.stages.find((x) => x.id === s.id);
      const [label, tone] = stageStateText(st.state);
      return `<span class="bar bar-${attr(tone)}" title="${attr(`${s.label}: ${label}`)}"></span>`;
    }).join('');
    const current = c.state.stages.find((s) => ['needs-you', 'working'].includes(s.state)) || c.state.stages.find((s) => !['done', 'skipped'].includes(s.state)) || c.state.stages[c.state.stages.length - 1];
    const [curLabel, curTone] = stageStateText(c.job.running && current.state !== 'needs-you' ? 'working' : current.state);
    const now = c.removal ? status(removalText(c.removal), 'warn') : txt(nowText(c.state));
    return `<tr>
      <td><a class="row-title" href="/c/${attr(c.slug)}">${txt(c.cover || c.name)}</a><div class="muted small">${c.cover && c.cover !== c.name ? `${txt(c.name)} · ` : ''}${esc(c.website ? domainOf(c.website) : 'No website')}</div></td>
      <td><div class="progress" aria-label="Stage progress">${progress}</div><div class="small">${esc(current.label)}: ${status(curLabel, curTone)}</div></td>
      <td class="small">${now}</td>
      <td class="small muted nowrap">${esc(relTime(c.updatedAt))}</td>
      <td class="cell-actions">${c.removal ? keepButton(c.slug) : removeMenu(c.slug, c.cover || c.name)}</td>
    </tr>`;
  });

  return `${pageHeader({ title: 'Proposals', meta: esc(summary), actions: linkButton('New proposal', '/new', { kind: 'primary', iconName: 'plus' }) })}
  ${msg}
  <section class="section" aria-labelledby="needs-title"><div class="section-head"><h2 id="needs-title">Needs you${needs.length ? ` <span class="count">${needs.length}</span>` : ''}</h2></div>${needsList}</section>
  <section class="section" aria-labelledby="all-title"><div class="section-head"><h2 id="all-title">All proposals</h2>${archived ? `<div class="section-actions"><a class="small" href="/archive">Archived (${archived})</a></div>` : ''}</div>
  ${clients.length ? table(['Client', 'Stage', 'Now', ['Updated', 'nowrap'], ['Actions', 'th-actions']], rows, { cls: 'table-clients' }) : empty('No proposals yet. Start with a client name, website, social links and your meeting notes.', linkButton('New proposal', '/new', { kind: 'primary', iconName: 'plus' }))}
  </section>`;
}

// Everything Home needs about one client, in one pass.
export function clientSummary(slug, { computeState, ctx, jobInfo }) {
  const p = clientPaths(slug);
  const intake = load(p.intake, {});
  const state = computeState(slug, ctx);
  const history = load(p.status, { history: [] }).history || [];
  return { slug, name: intake.name || slug, cover: intake.displayName || '', website: intake.website || '', state, job: jobInfo(slug), removal: pendingRemoval(slug), updatedAt: history.length ? history[history.length - 1].at : intake.createdAt };
}
