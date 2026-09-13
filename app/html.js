// Tiny HTML helpers and the shared page layout for the Control Center.

const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escMap[c]);
export const ar = (v) => `<span dir="rtl" class="ar">${esc(v)}</span>`;
export const attr = (v) => esc(v);

export const STATE_LABEL = {
  done: ['Done', 'ok'],
  approved: ['Approved', 'ok'],
  running: ['Running…', 'run'],
  pending: ['Ready to run', 'todo'],
  stale: ['Needs re-run (inputs changed)', 'warn'],
  failed: ['Failed', 'bad'],
  waiting: ['Waiting for AI answer', 'warn'],
  blocked: ['Waiting for earlier steps', 'muted'],
  open: ['Waiting for your approval', 'gate'],
};

export function chip(state) {
  const [label, cls] = STATE_LABEL[state] || [state, 'muted'];
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

export function layout({ title, body, slug = null, active = '', refreshWhileRunning = false }) {
  const tabs = slug
    ? `<nav class="tabs">${[
        ['', 'Overview'],
        ['questions', 'Questions'],
        ['evidence', 'Evidence'],
        ['record', 'Client record'],
        ['gate1', 'Gate 1 · Diagnosis'],
        ['gate2', 'Gate 2 · Scope'],
        ['gate3', 'Gate 3 · Proposal'],
      ]
        .map(([k, label]) => `<a class="${active === k ? 'on' : ''}" href="/c/${attr(slug)}${k ? `/${k}` : ''}">${label}</a>`)
        .join('')}</nav>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Al-Marketer Control Center</title>
<link rel="stylesheet" href="/static/app.css">
</head><body>
<header class="top"><a class="brand" href="/"><img src="/static/logo.png" alt=""><span>Control Center</span></a>
<div class="toplinks"><a href="/new" class="btn small brandbtn">+ New client</a><a href="/catalog">Catalog &amp; rules</a><a href="/help">How to use</a></div></header>
${slug ? `<div class="subhead"><a href="/">All clients</a> / <b>${esc(title)}</b></div>${tabs}` : ''}
<main>${body}</main>
<script src="/static/app.js"></script>
${refreshWhileRunning ? `<script>watchJob(${JSON.stringify(slug)});</script>` : ''}
</body></html>`;
}

export const field = (label, input, help = '') => `<label class="field"><span class="lbl">${esc(label)}</span>${input}${help ? `<span class="help">${help}</span>` : ''}</label>`;
export const flash = (msg, kind = 'info') => (msg ? `<div class="flash ${kind}">${esc(msg)}</div>` : '');
