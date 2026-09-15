// HTML building blocks for the Control Center: escaping, bidirectional text, icons, formatting and the page shell.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../engine/catalog/store.js';

const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escMap[c]);
export const attr = esc;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const isArabic = (v) => ARABIC.test(String(v ?? ''));
// Text that may be Arabic or English: isolated, with its own direction and font.
export const txt = (v, tag = 'span', cls = '') => `<${tag} dir="auto" class="bidi${isArabic(v) ? ' ar' : ''}${cls ? ` ${cls}` : ''}">${esc(v)}</${tag}>`;
export const ar = (v, tag = 'span', cls = '') => `<${tag} dir="rtl" lang="ar" class="ar${cls ? ` ${cls}` : ''}">${esc(v)}</${tag}>`;

// Lucide icons (lucide-static), inlined so they inherit the text colour.
const iconCache = new Map();
export function icon(name, { size = 16, label = '' } = {}) {
  if (!iconCache.has(name)) {
    const file = join(ROOT, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const inner = (raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1] || '';
    iconCache.set(name, inner.replace(/\s+/g, ' ').trim());
  }
  const a11y = label ? `role="img" aria-label="${attr(label)}"` : 'aria-hidden="true"';
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${iconCache.get(name)}</svg>`;
}

export const num = (n, suffix = '') => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${Number(n).toLocaleString('en-US')}${suffix}`);
export const fileUrl = (slug, rel) => `/c/${slug}/files/${String(rel).split('/').map(encodeURIComponent).join('/')}`;
export const domainOf = (url) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
};

export function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3)} ${time}`;
}

export function relTime(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const duration = (ms) => (!ms ? '' : ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);

const NAV = [
  { href: '/', id: 'home', label: 'Proposals', icon: 'layout-list' },
  { href: '/new', id: 'new', label: 'New proposal', icon: 'plus' },
  { href: '/archive', id: 'archive', label: 'Archived', icon: 'archive' },
  { href: '/catalog', id: 'catalog', label: 'Catalog & rules', icon: 'library' },
  { href: '/settings', id: 'settings', label: 'Settings & keys', icon: 'settings-2' },
  { href: '/help', id: 'help', label: 'How to use', icon: 'circle-help' },
];
export const THEMES = ['light', 'dark', 'system'];
export const themeFromCookie = (cookie = '') => {
  const m = String(cookie).match(/(?:^|;\s*)alm_theme=(light|dark|system)/);
  return m ? m[1] : 'system';
};

/**
 * The page shell: sidebar navigation, the page itself, and live updates.
 * live: { slug } subscribes the page to one client's events; { slug: '*' } to every client.
 * theme: 'light' | 'dark' | 'system' (from the alm_theme cookie, so the page never flashes the wrong theme).
 */
export function layout({ title, body, nav = 'home', needsYou = 0, live = null, wide = false, theme = 'system' }) {
  const links = NAV.map((n) => `<a href="${n.href}" class="nav-link${n.id === nav ? ' is-current' : ''}"${n.id === nav ? ' aria-current="page"' : ''}>${icon(n.icon, { size: 18 })}<span>${n.label}</span>${n.id === 'home' && needsYou ? `<span class="nav-count" title="${needsYou} item(s) need you">${needsYou}</span>` : ''}</a>`).join('');
  const themeBtn = (id, label, iconName) => `<button type="button" data-theme-set="${id}" aria-pressed="${theme === id}" title="${label} theme">${icon(iconName, { size: 14 })}<span class="sr-only">${label}</span></button>`;
  return `<!doctype html>
<html lang="en"${theme !== 'system' ? ` data-theme="${theme}"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Al-Marketer</title>
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="/static/brand-fonts.css"><link rel="stylesheet" href="/static/app.css"><link rel="icon" href="/static/favicon.png">
</head><body${live ? ` data-live="${attr(live.slug || '*')}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
<div class="app">
  <aside class="sidebar" aria-label="Main navigation">
    <a class="brand" href="/" aria-label="Al-Marketer proposals"><img src="/static/logo-light.png" alt="Al-Marketer" width="136" height="29"></a>
    <nav class="nav">${links}</nav>
    <div class="sidebar-foot">
      <div class="theme-switch" role="group" aria-label="Theme">${themeBtn('light', 'Light', 'sun')}${themeBtn('dark', 'Dark', 'moon')}${themeBtn('system', 'System', 'monitor')}</div>
      <p class="foot-text">Runs on this computer. Nothing is sent to clients by the system.</p>
    </div>
  </aside>
  <main id="main" class="main${wide ? ' main-wide' : ''}">${body}</main>
</div>
<div class="live-bar" id="live-bar" hidden><span>New results are ready.</span><button type="button" class="btn btn-sm" data-reload>Refresh</button></div>
<script src="/static/app.js" defer></script>
</body></html>`;
}
