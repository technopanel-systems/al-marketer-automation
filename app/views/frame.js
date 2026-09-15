// The client workspace: header with the one next move, the stage line, the page, and a side panel with
// everything that needs a person for this proposal plus the live activity log.
import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { esc, attr, icon, txt, domainOf, shortTime } from '../ui/html.js';
import { stageBar, button, linkButton, status } from '../ui/components.js';
import { primaryMove, taskMove } from '../ui/moves.js';
import { stepById, STAGES } from '../../pipeline/steps.js';
import { load } from '../../pipeline/client.js';

export function moveControl(move, { size = '' } = {}) {
  if (!move) return '';
  if (move.working) return `<span class="btn btn-secondary is-busy${size ? ` btn-${size}` : ''}" aria-live="polite">${icon('loader-circle')}<span>Working</span></span>`;
  if (move.done) return status('Complete', 'done');
  const kind = move.tone === 'bad' ? 'danger' : move.tone === 'you' ? 'primary' : 'secondary';
  if (move.post) return `<form method="post" action="${attr(move.post.action)}" class="inline-form">${Object.entries(move.post.fields).map(([k, v]) => `<input type="hidden" name="${attr(k)}" value="${attr(v)}">`).join('')}<button class="btn btn-${kind}${size ? ` btn-${size}` : ''}">${esc(move.label)}</button></form>`;
  if (move.href) return linkButton(move.label, move.href, { kind, size });
  return `<span class="muted">${esc(move.label)}</span>`;
}

// The last lines of the persistent activity log (logs/jobs.log), newest last.
export function activityLines(p, max = 40) {
  if (!existsSync(p.jobLog)) return [];
  const size = statSync(p.jobLog).size;
  const len = Math.min(size, 96_000);
  const buf = Buffer.alloc(len);
  const fd = openSync(p.jobLog, 'r');
  readSync(fd, buf, 0, len, size - len);
  closeSync(fd);
  return buf
    .toString('utf8')
    .split('\n')
    .filter((l) => l.startsWith('['))
    .slice(-max)
    .map((l) => {
      const m = l.match(/^\[([^\]]+)\]\s+(?:([a-z0-9-]+):\s)?(.*)$/);
      if (!m) return { at: '', step: '', text: l };
      const step = stepById(m[2]);
      return { at: m[1], step: step ? step.label : m[2] || '', text: m[3] };
    });
}

export const activityList = (lines) =>
  lines.length
    ? `<ol class="activity" data-activity>${lines.map((l) => `<li><time datetime="${attr(l.at)}">${esc(shortTime(l.at))}</time><span class="act-step">${esc(l.step)}</span><span class="act-text">${txt(l.text)}</span></li>`).join('')}</ol>`
    : '<p class="muted small" data-activity-empty>Nothing has run yet.</p>';

export function clientFrame({ slug, p, state, stage, body, msg = '', job }) {
  const intake = load(p.intake, {});
  const move = primaryMove(slug, state, { running: job?.running });
  const tasks = state.tasks.map((t) => ({ t, m: taskMove(slug, t) })).filter((x) => x.m);
  const meta = [
    intake.website ? `<a href="${attr(/^https?:/.test(intake.website) ? intake.website : `https://${intake.website}`)}" target="_blank" rel="noopener">${esc(domainOf(intake.website))}</a>` : '<span>No website</span>',
    intake.market ? `<span>${esc(intake.market)}</span>` : '',
    intake.presentedTo ? `<span>For ${txt(intake.presentedTo)}</span>` : '',
  ].filter(Boolean).join('<span class="sep" aria-hidden="true"></span>');
  const cover = intake.displayName && intake.displayName !== intake.name ? intake.displayName : '';
  const stageLabel = STAGES.find((s) => s.id === stage)?.label || '';
  return `<header class="client-header">
    <div class="client-id">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Proposals</a>${icon('chevron-right', { size: 14 })}<span>${stageLabel ? esc(stageLabel) : 'Overview'}</span></nav>
      <h1>${txt(cover || intake.name)}${cover ? ` ${txt(intake.name, 'span', 'h1-sub')}` : ''}</h1>
      <div class="page-meta">${meta}</div>
    </div>
    <div class="client-move" data-primary-move>${move?.detail && !move.done ? `<p class="move-detail">${esc(move.detail)}</p>` : ''}${moveControl(move)}</div>
  </header>
  ${stageBar(slug, state, stage)}
  <div class="workspace">
    <div class="workspace-main">${msg}${body}</div>
    <aside class="workspace-aside" aria-label="This proposal">
      <section class="panel">
        <h2 class="panel-title">Needs you${tasks.length ? ` <span class="count">${tasks.length}</span>` : ''}</h2>
        ${tasks.length ? `<ul class="task-list">${tasks.map(({ t, m }) => `<li class="task task-${attr(m.tone)}">${m.post ? `<form method="post" action="${attr(m.post.action)}">${Object.entries(m.post.fields).map(([k, v]) => `<input type="hidden" name="${attr(k)}" value="${attr(v)}">`).join('')}<button class="task-link">` : `<a class="task-link" href="${attr(m.href)}">`}<span class="task-label">${esc(m.label)}</span><span class="task-detail">${esc(m.detail)}</span>${m.post ? '</button></form>' : '</a>'}</li>`).join('')}</ul>` : '<p class="muted small">Nothing right now.</p>'}
      </section>
      <section class="panel">
        <h2 class="panel-title">Activity ${job?.running ? status('Working', 'working') : ''}</h2>
        ${activityList(activityLines(p, 30))}
        <a class="small" href="/c/${attr(slug)}/activity">Full activity log</a>
      </section>
    </aside>
  </div>`;
}
