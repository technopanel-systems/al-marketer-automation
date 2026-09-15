// The client workspace: header with the one next move, the stage line, what needs the person first, the page,
// and a side panel with the live activity log (newest on top).
import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { esc, attr, icon, txt, domainOf, shortTime, fileUrl } from '../ui/html.js';
import { stageBar, linkButton, status, actionForm, note, clientMark } from '../ui/components.js';
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

const deleteConfirm = (name) => `Delete "${name}" permanently?\n\nIts research, evidence, answers and proposal files are removed from this computer. This cannot be undone.\n\nTo take it out of the list and keep it, choose Archive instead.`;

// Archive (reversible) and delete (permanent) for one proposal — visible, labeled buttons.
export function removeButtons(slug, name, { size = 'sm' } = {}) {
  return `<div class="btn-row">${actionForm(`/c/${slug}/archive`, 'Archive', { kind: 'quiet', size, iconName: 'archive', extra: `title="Archive: out of the list, files kept, can be restored"` })}${actionForm(`/c/${slug}/delete`, 'Delete', { kind: 'quiet btn-danger', size, iconName: 'trash-2', confirm: deleteConfirm(name), extra: 'data-danger' })}</div>`;
}

// Shown while an archive/delete request waits for running work to finish.
export const removalText = (removal) => `${removal.action === 'archive' ? 'Archiving' : 'Deleting'} when the running work finishes`;
export const keepButton = (slug) => actionForm(`/c/${slug}/keep`, 'Keep it', { size: 'sm', iconName: 'undo-2' });

export const logoUrl = (slug, p) => (existsSync(p.logo) ? `${fileUrl(slug, 'brand/logo.png')}?v=${Math.round(statSync(p.logo).mtimeMs)}` : '');

// The last lines of the persistent activity log (logs/jobs.log), newest first.
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
    .reverse()
    .map((l) => {
      const m = l.match(/^\[([^\]]+)\]\s+(?:([a-z0-9-]+):\s)?(.*)$/);
      if (!m) return { at: '', step: '', text: l };
      const step = stepById(m[2]);
      return { at: m[1], step: step ? step.label : m[2] || '', text: m[3] };
    });
}

export const activityList = (lines) =>
  lines.length
    ? `<ol class="activity" data-activity reversed>${lines.map((l) => `<li><time datetime="${attr(l.at)}">${esc(shortTime(l.at))}</time><span class="act-step">${esc(l.step)}</span><span class="act-text">${txt(l.text)}</span></li>`).join('')}</ol>`
    : '<p class="muted small" data-activity-empty>Nothing has run yet.</p>';

// Cards for everything waiting on a person for this proposal — the first thing on every stage page.
export function actionCards(slug, state) {
  const moves = state.tasks.filter((t) => t.blocking || t.type === 'failed' || t.type === 'waiting').map((t) => ({ t, m: taskMove(slug, t) })).filter((x) => x.m);
  if (!moves.length) return '';
  return `<section class="actions-first" aria-label="Needs you">${moves.map(({ t, m }) => {
    const stage = STAGES.find((s) => s.id === t.stage)?.label || '';
    const control = m.post
      ? `<form method="post" action="${attr(m.post.action)}" class="inline-form">${Object.entries(m.post.fields).map(([k, v]) => `<input type="hidden" name="${attr(k)}" value="${attr(v)}">`).join('')}<button class="btn btn-${m.tone === 'bad' ? 'danger' : 'primary'} btn-sm">${esc(m.label)}</button></form>`
      : `<a class="btn btn-primary btn-sm" href="${attr(m.href)}" data-go>${esc(m.label)}</a>`;
    return `<div class="action-card${m.tone === 'bad' ? ' tone-bad' : ''}">${icon(m.tone === 'bad' ? 'circle-alert' : 'hand', { size: 20 }).replace('class="i"', 'class="i i-lead"')}<div><b>${esc(m.label)}</b><span class="muted">${esc(m.detail)}${stage ? ` · ${esc(stage)}` : ''}</span></div>${control}</div>`;
  }).join('')}</section>`;
}

export function clientFrame({ slug, p, state, stage, body, msg = '', job, removal = null }) {
  const intake = load(p.intake, {});
  const move = primaryMove(slug, state, { running: job?.running });
  const meta = [
    intake.website ? `<a href="${attr(/^https?:/.test(intake.website) ? intake.website : `https://${intake.website}`)}" target="_blank" rel="noopener">${esc(domainOf(intake.website))}</a>` : '<span>No website</span>',
    intake.market ? `<span>${esc(intake.market)}</span>` : '',
    intake.presentedTo ? `<span>For ${txt(intake.presentedTo)}</span>` : '',
  ].filter(Boolean).join('<span class="sep" aria-hidden="true"></span>');
  const cover = intake.displayName && intake.displayName !== intake.name ? intake.displayName : '';
  const stageLabel = STAGES.find((s) => s.id === stage)?.label || '';
  const name = cover || intake.name || slug;
  return `<header class="client-header">
    <div class="client-id">
      ${clientMark({ logoUrl: logoUrl(slug, p), name })}
      <div>
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Proposals</a>${icon('chevron-right', { size: 14 })}<span>${stageLabel ? esc(stageLabel) : 'Overview'}</span></nav>
        <h1>${txt(name)}${cover ? ` ${txt(intake.name, 'span', 'h1-sub')}` : ''}</h1>
        <div class="page-meta">${meta}</div>
      </div>
    </div>
    <div class="client-actions">
      <div class="client-move" data-primary-move>${move?.detail && !move.done && !state.tasks.some((t) => t.blocking) ? `<p class="move-detail">${esc(move.detail)}</p>` : ''}${moveControl(move)}</div>
      ${removal ? '' : `<div class="header-tools">${removeButtons(slug, name)}</div>`}
    </div>
  </header>
  ${removal ? note(`<div class="note-row"><span><b>${esc(removalText(removal))}.</b> Nothing new starts for this proposal.</span>${keepButton(slug)}</div>`, 'warn', removal.action === 'archive' ? 'archive' : 'trash-2') : ''}
  ${stageBar(slug, state, stage)}
  <div class="workspace">
    <div class="workspace-main">${msg}${removal ? '' : actionCards(slug, state)}${body}</div>
    <aside class="workspace-aside" aria-label="Activity">
      <section class="panel">
        <h2 class="panel-title">Activity <span data-live-indicator>${job?.running ? `<span class="live-dot">${status('Working', 'working')}</span>` : ''}</span></h2>
        ${activityList(activityLines(p, 40))}
        <a class="small" href="/c/${attr(slug)}/activity">Full activity log</a>
      </section>
    </aside>
  </div>`;
}
