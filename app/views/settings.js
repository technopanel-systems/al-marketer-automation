// Settings & keys: which free keys are set (never their values), how to get each one, the Claude model used by each
// step, the tools on this computer and the agency contacts used on the closing slide.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { esc, attr, icon } from '../ui/html.js';
import { pageHeader, section, button, actionForm, note, kv, table, grade } from '../ui/components.js';
import { KEYS, RETIRED_KEYS } from '../settings.js';
import { MODELS } from '../../ai/models.js';

const STATE = { active: ['Set', 'good'], saved: ['Saved — restart to use', 'warn'], missing: ['Not set', 'na'] };

function keysForm(status, { retired, keyFile }) {
  const byName = new Map(status.map((s) => [s.name, s.state]));
  const rows = KEYS.map((k) => {
    const [label, tone] = STATE[byName.get(k.name)] || STATE.missing;
    const set = byName.get(k.name) !== 'missing';
    return `<tr>
      <td><span class="row-title">${esc(k.label)}</span><span class="cell-sub mono">${esc(k.name)}</span><span class="cell-sub">${esc(k.need)} · ${esc(k.free)}</span></td>
      <td class="small">${esc(k.does)}<details class="inline-details"><summary>How to get it</summary><ol class="small">${k.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><a href="${attr(k.link)}" target="_blank" rel="noopener" class="small">Open the page ${icon('external-link', { size: 12 })}</a></details></td>
      <td class="nowrap">${grade(label, tone)}</td>
      <td><input type="password" name="key:${attr(k.name)}" autocomplete="off" spellcheck="false" placeholder="${set ? 'Paste a new key to replace' : 'Paste the key'}" aria-label="${attr(k.label)} key"></td>
      <td class="cell-actions"><div class="btn-row">${set ? `${button('Test', { value: `test:${k.name}`, size: 'sm', kind: 'quiet' })}${button('Remove', { value: `remove:${k.name}`, size: 'sm', kind: 'quiet', confirm: `Remove ${k.name} from this computer?` })}` : ''}</div></td>
    </tr>`;
  });
  return `<form method="post" action="/settings" autocomplete="off" data-track-dirty>
    ${table(['Key', 'What it does', 'Status', 'New key', ['', 'th-actions']], rows)}
    <div class="form-actions">${button('Save keys', { value: 'save', kind: 'primary' })}${keyFile ? button('Import from API-KEYS.txt', { value: 'import', kind: 'secondary' }) : ''}</div>
    <p class="small muted">Keys are saved in <span class="mono">.env.local</span> on this computer, which is never uploaded or committed. A saved key is used at once; the page never shows it again. Leave a box empty to keep the current key.</p>
  </form>
  ${retired.length ? note(`<b>Keys the system no longer uses:</b> ${retired.map((n) => `<span class="mono">${esc(n)}</span>`).join(', ')}. ${esc(RETIRED_KEYS[retired[0]])} ${actionForm('/settings', 'Remove them', { fields: { action: 'remove-retired' }, size: 'sm', kind: 'secondary' })}`, 'warn') : ''}`;
}

const modelsTable = () => table(['Step', 'Model', 'Thinking', 'If it fails twice', 'Why'], Object.entries(MODELS).map(([id, m]) => `<tr><td class="nowrap"><span class="mono small">${esc(id)}</span></td><td><span class="model-tag">${esc(m.model)}</span></td><td class="small">${esc(m.effort || 'default')}</td><td class="small">${m.fallback ? `<span class="model-tag">${esc(m.fallback)}</span>` : '<span class="muted">stops</span>'}</td><td class="small">${esc(m.why)}</td></tr>`));

export function settingsPage({ status, retired = [], keyFile = false, tools = {}, agency = {}, msg = '' }) {
  const yes = (ok, text) => `${grade(ok ? 'Found' : 'Missing', ok ? 'good' : 'bad')} <span class="small muted">${esc(text)}</span>`;
  const socials = Object.entries(agency.socials || {}).map(([k, v]) => `<a href="${attr(v)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(' · ');
  return `${pageHeader({ title: 'Settings & keys', meta: esc(`${status.filter((s) => s.state === 'active').length} of ${KEYS.length} optional keys set · all free`) })}
  ${msg}
  ${section({ id: 'keys', title: 'Free keys', intro: 'None of these is required: every proposal works without them. Each one makes a part more complete. The Claude login is separate (Claude Code on this computer).', body: keysForm(status, { retired, keyFile }) })}
  ${section({ id: 'models', title: 'Claude model for each step', intro: 'Edited in ai/models.js. Fable is never used. Every answer is checked by code before it is kept.', body: modelsTable(), collapsible: true, open: false })}
  ${section({ id: 'tools', title: 'Tools on this computer', body: kv([
    ['Chromium (browser for audits)', yes(tools.chromium, tools.chromium ? 'installed with Playwright' : 'run: npx playwright install chromium')],
    ['yt-dlp (TikTok and YouTube)', yes(tools.ytdlp, tools.ytdlp ? 'tools/yt-dlp.exe' : 'download yt-dlp.exe into the tools folder')],
    ['Claude Code', `<span class="small">Runs in the background with your subscription login. If a step says Claude could not run, open a terminal, type <span class="mono">claude</span>, then <span class="mono">/login</span>.</span>`],
  ]), collapsible: true, open: false })}
  ${section({ id: 'agency', title: 'Agency contacts on the closing slide', intro: 'Taken from rules/agency.json.', body: kv([
    ['Website', agency.website ? `<a href="${attr(agency.website)}" target="_blank" rel="noopener">${esc(agency.website)}</a>` : '—'],
    ['WhatsApp', esc(agency.whatsapp || '—')],
    ['Email', esc(agency.email || '—')],
    ['Social', socials || '—'],
    ['Button text', `<span dir="rtl" class="ar">${esc(agency.cta?.buttonAr || '')}</span>`],
  ]), collapsible: true, open: false })}`;
}

export const toolsOnComputer = (root, { chromiumPath = '', ytdlpPath = '' } = {}) => ({ chromium: Boolean(chromiumPath && existsSync(chromiumPath)), ytdlp: Boolean(ytdlpPath && existsSync(ytdlpPath)), keyFile: existsSync(join(root, 'API-KEYS.txt')) });
