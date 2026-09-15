// Reusable interface pieces. One vocabulary for states everywhere, one button style, one status style (dot + plain text).
import { esc, attr, icon, txt } from './html.js';
import { STAGES, stepById } from '../../pipeline/steps.js';
import { PLATFORM_PATHS, PLATFORM_COLORS } from './platform-icons.js';

// Step / task / approval states → plain words and a tone (the dot colour).
const STEP_STATE = {
  done: ['Done', 'done'],
  approved: ['Approved', 'done'],
  not_used: ['Skipped', 'neutral'],
  running: ['Working', 'working'],
  pending: ['Ready', 'neutral'],
  stale: ['Out of date, runs again', 'warn'],
  failed: ['Failed', 'bad'],
  waiting: ['Claude could not run', 'bad'],
  blocked: ['Waiting', 'neutral'],
  open: ['Needs you', 'you'],
};
export function stepStateText(st) {
  if (!st) return ['', 'neutral'];
  if (st.state === 'failed' && st.interrupted) return ['Interrupted', 'bad'];
  if (st.state === 'open' && st.kind === 'gate') return ['Needs your approval', 'you'];
  if (st.state === 'blocked' && st.waitingFor?.length) return [`Waiting for ${st.waitingFor.map((id) => lower(stepById(id)?.label || id)).join(' and ')}`, 'neutral'];
  return STEP_STATE[st.state] || [st.state, 'neutral'];
}
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const STAGE_STATE = { done: 'Done', working: 'Working', 'needs-you': 'Needs you', ready: 'Ready', 'in-progress': 'In progress', waiting: 'Not started', skipped: 'Skipped' };
const STAGE_TONE = { done: 'done', working: 'working', 'needs-you': 'you', ready: 'neutral', 'in-progress': 'working', waiting: 'neutral', skipped: 'neutral' };
export const stageStateText = (state) => [STAGE_STATE[state] || state, STAGE_TONE[state] || 'neutral'];

export const dot = (tone) => `<span class="dot dot-${attr(tone)}" aria-hidden="true"></span>`;
export function status(label, tone, { attrs = '' } = {}) {
  return `<span class="status status-${attr(tone)}"${attrs}>${dot(tone)}<span>${esc(label)}</span></span>`;
}
export const stepStatus = (st) => {
  const [label, tone] = stepStateText(st);
  return status(label, tone, { attrs: ` data-step-state="${attr(st.id)}"` });
};

// Buttons: primary (the one next move), secondary, quiet. Links styled as buttons use the same classes.
export function button(label, { name = 'action', value = '', kind = 'secondary', size = '', iconName = '', confirm = '', disabled = false, type = 'submit', extra = '' } = {}) {
  return `<button type="${type}" class="btn btn-${kind}${size ? ` btn-${size}` : ''}"${name && type === 'submit' ? ` name="${attr(name)}" value="${attr(value)}"` : ''}${confirm ? ` data-confirm="${attr(confirm)}"` : ''}${disabled ? ' disabled' : ''}${extra ? ` ${extra}` : ''}>${iconName ? icon(iconName) : ''}<span>${esc(label)}</span></button>`;
}
export function linkButton(label, href, { kind = 'secondary', size = '', iconName = '', external = false } = {}) {
  return `<a class="btn btn-${kind}${size ? ` btn-${size}` : ''}" href="${attr(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${iconName ? icon(iconName) : ''}<span>${esc(label)}</span>${external ? icon('external-link', { size: 14 }) : ''}</a>`;
}
// A one-button form (runs a step, skips it, etc.).
export function actionForm(action, label, { fields = {}, ...opts } = {}) {
  return `<form method="post" action="${attr(action)}" class="inline-form">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${attr(k)}" value="${attr(v)}">`).join('')}${button(label, { name: '', ...opts })}</form>`;
}
// A small menu of less frequent actions behind a "more" button (closes on Escape or a click elsewhere).
export function menu(label, items, { iconName = 'ellipsis', text = '' } = {}) {
  return `<details class="menu"><summary class="btn btn-quiet btn-sm${text ? '' : ' btn-icon'}" aria-label="${attr(label)}" title="${attr(label)}">${icon(iconName)}${text ? `<span>${esc(text)}</span>` : ''}</summary><div class="menu-list">${items.join('')}</div></details>`;
}

export function pageHeader({ title, titleAr = '', meta = '', actions = '', crumbs = '' }) {
  return `<header class="page-header">
  <div class="page-heading">${crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>` : ''}<h1>${txt(title)}${titleAr ? ` ${txt(titleAr, 'span', 'h1-sub')}` : ''}</h1>${meta ? `<div class="page-meta">${meta}</div>` : ''}</div>
  ${actions ? `<div class="page-actions">${actions}</div>` : ''}
</header>`;
}

export function section({ id = '', title, count = null, intro = '', actions = '', body, tone = '', collapsible = false, open = true }) {
  const head = `<h2>${esc(title)}${count !== null ? ` <span class="count">${esc(count)}</span>` : ''}</h2>${actions ? `<div class="section-actions">${actions}</div>` : ''}`;
  if (collapsible) return `<details class="section${tone ? ` section-${tone}` : ''}"${id ? ` id="${attr(id)}"` : ''}${open ? ' open' : ''}><summary class="section-head">${icon('chevron-right', { size: 16 })}${head}</summary>${intro ? `<p class="section-intro">${intro}</p>` : ''}<div class="section-body">${body}</div></details>`;
  return `<section class="section${tone ? ` section-${tone}` : ''}"${id ? ` id="${attr(id)}"` : ''}><div class="section-head">${head}</div>${intro ? `<p class="section-intro">${intro}</p>` : ''}<div class="section-body">${body}</div></section>`;
}

export const empty = (text, action = '') => `<div class="empty"><p>${text}</p>${action}</div>`;
export const note = (html, tone = 'info', iconName = '') => `<div class="note note-${tone}" role="${tone === 'bad' ? 'alert' : 'status'}">${icon(iconName || { info: 'info', ok: 'check', warn: 'triangle-alert', bad: 'circle-alert' }[tone] || 'info')}<div>${html}</div></div>`;
export const flash = (msg, kind = 'info') => (msg ? note(esc(msg), { ok: 'ok', info: 'info', warn: 'warn', bad: 'bad' }[kind] || 'info') : '');

let fieldId = 0;
export function field(label, control, { help = '', id = '' } = {}) {
  const fid = id || `f${++fieldId}`;
  const withId = control.replace(/^<(input|select|textarea)\b/, `<$1 id="${fid}"`);
  return `<div class="field"><label for="${fid}">${esc(label)}</label>${withId}${help ? `<p class="help">${help}</p>` : ''}</div>`;
}
export const select = (name, options, value, extra = '') => `<select name="${attr(name)}"${extra ? ` ${extra}` : ''}>${options.map(([v, l]) => `<option value="${attr(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

// Radio buttons styled as a segmented control (keyboard and screen-reader friendly).
export function segmented(name, options, value, { label = '' } = {}) {
  return `<fieldset class="segmented"${label ? ` aria-label="${attr(label)}"` : ''}>${options.map(([v, l, tone]) => `<label class="seg${tone ? ` seg-${tone}` : ''}"><input type="radio" name="${attr(name)}" value="${attr(v)}"${String(v) === String(value) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</fieldset>`;
}

// The proposal line: seven stages with their state; the current page is marked.
export function stageBar(slug, state, current) {
  const items = STAGES.map((stage, i) => {
    const s = state.stages.find((x) => x.id === stage.id);
    const [label, tone] = stageStateText(s.state);
    return `<li class="stage stage-${tone}${stage.id === current ? ' is-current' : ''}" data-stage-state="${attr(stage.id)}"><a href="/c/${attr(slug)}/${stage.id}"${stage.id === current ? ' aria-current="page"' : ''}><span class="stage-node" aria-hidden="true">${s.state === 'done' ? icon('check', { size: 12 }) : i + 1}</span><span class="stage-text"><span class="stage-name">${esc(stage.label)}</span><span class="stage-state">${esc(label)}</span></span></a></li>`;
  }).join('');
  return `<nav class="stagebar" aria-label="Proposal stages"><ol>${items}</ol></nav>`;
}

export const kv = (rows) => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
export const table = (head, rows, { cls = '' } = {}) => `<div class="table-wrap"><table class="table${cls ? ` ${cls}` : ''}"><thead><tr>${head.map((h) => (Array.isArray(h) ? `<th class="${attr(h[1])}">${esc(h[0])}</th>` : `<th>${esc(h)}</th>`)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

// ---------- v3 pieces ----------

// A grade chip: the word carries the meaning, the colour only supports it. tone: good | mid | weak | na
export const grade = (label, tone = 'na', { title = '' } = {}) => `<span class="grade grade-${attr(tone)}"${title ? ` title="${attr(title)}"` : ''}>${esc(label)}</span>`;

// A number with a small bar relative to the largest value in its column (the client's bar in brand orange).
export function minibar(value, max, { client = false, text = null } = {}) {
  const w = value && max ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return `<span class="minibar"><span>${text ?? esc(compactNum(value))}</span><span class="minibar-track" aria-hidden="true"><span class="minibar-fill${client ? ' is-client' : ''}" style="--w:${w}%"></span></span></span>`;
}

// 12,400 → "12.4K" (the exact number stays in the title).
export function compactNum(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
export const numCell = (n, suffix = '') => (n === null || n === undefined || Number.isNaN(Number(n)) ? '<span class="muted">—</span>' : `<span title="${attr(Number(n).toLocaleString('en-US'))}${attr(suffix)}">${esc(compactNum(n))}${esc(suffix)}</span>`);

// Platform logo (Simple Icons path) in its brand colour, or in the text colour with mono: true.
export function platformMark(platform, { size = 16, mono = false, label = '' } = {}) {
  const d = PLATFORM_PATHS[platform];
  if (!d) return icon('globe', { size });
  const fill = mono || ['x', 'tiktok', 'snapchat'].includes(platform) ? 'currentColor' : PLATFORM_COLORS[platform];
  return `<svg class="pmark" width="${size}" height="${size}" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${attr(label)}"` : 'aria-hidden="true"'}><path fill="${fill}" d="${d}"/></svg>`;
}

// The client's logo if one is saved, else the first letter of its name.
export function clientMark({ logoUrl = '', name = '' } = {}, { small = false } = {}) {
  if (logoUrl) return `<span class="client-logo${small ? ' client-logo-sm' : ''}"><img src="${attr(logoUrl)}" alt="" loading="lazy"></span>`;
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="client-initial${small ? ' client-logo-sm' : ''}" aria-hidden="true">${esc(letter)}</span>`;
}

export const stat = (label, value, iconName, tone = '') => `<div class="stat${tone ? ` stat-${tone}` : ''}">${icon(iconName, { size: 22 })}<div><b>${esc(value)}</b><span>${esc(label)}</span></div></div>`;

// Tick boxes shown as chips. options: [value, label]
export const chipChoices = (name, options, selected = [], { label = '' } = {}) =>
  `<fieldset class="chip-choices"${label ? ` aria-label="${attr(label)}"` : ''}>${options.map(([v, l]) => `<label class="chip-choice"><input type="checkbox" name="${attr(name)}" value="${attr(v)}"${selected.includes(v) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</fieldset>`;

// A type-to-search text box with suggestions (native datalist: suggestions and free text both work).
let listId = 0;
export function combo(name, value, suggestions, { placeholder = '', dir = 'auto', extra = '' } = {}) {
  const id = `dl${++listId}`;
  return `<input type="text" name="${attr(name)}" value="${attr(value || '')}" list="${id}" dir="${dir}" autocomplete="off"${placeholder ? ` placeholder="${attr(placeholder)}"` : ''}${extra ? ` ${extra}` : ''}><datalist id="${id}">${suggestions.map((s) => `<option value="${attr(s)}"></option>`).join('')}</datalist>`;
}
