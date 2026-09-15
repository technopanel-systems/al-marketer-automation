// The brief: the few things a person gives the system (new proposal, and editing it later). Designed to type as little as
// possible: the website finds the profiles and logo, the market and industry are pick lists, competitors are rows,
// constraints are chips, readiness is Yes / No / Don't know, and a meeting report can be attached as a file.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { esc, attr, icon, txt, fileUrl } from '../ui/html.js';
import { field, select, button, note, segmented, chipChoices, combo, platformMark, clientMark } from '../ui/components.js';
import { loadBenchmarks } from '../../pipeline/social.js';
import { classifySocialUrl } from '../../collect/social.js';
import { load } from '../../pipeline/client.js';
import { READINESS_KEYS } from '../../ai/fields.js';
import { cleanWebsite, cleanLinks } from '../../engine/util/url.js';
import { ACCEPTED_FILES } from '../../collect/files.js';

export const MARKETS = ['Saudi Arabia', 'Egypt', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Jordan', 'GCC', 'Saudi Arabia and Egypt', 'MENA'];
export const TITLES = ['', 'م.', 'أ.', 'د.', 'Mr.', 'Ms.', 'Dr.', 'Eng.'];
export const CONSTRAINTS = [
  ['limited_budget', 'Limited budget'],
  ['two_brands', 'More than one brand name'],
  ['no_designer', 'No in-house designer'],
  ['no_marketing_team', 'No marketing team'],
  ['seasonal', 'Seasonal business'],
  ['b2b_only', 'Sells to businesses only (B2B)'],
  ['bilingual', 'Needs Arabic and English'],
  ['fast_start', 'Needs results fast'],
  ['new_brand', 'New brand / not launched yet'],
  ['approvals', 'Slow internal approvals'],
];
const industryOptions = () => Object.entries(loadBenchmarks().industries).map(([k, v]) => [k, v.en]);

const splitPresentedTo = (v = '') => {
  const s = String(v).trim();
  const title = TITLES.filter(Boolean).find((t) => s.startsWith(`${t} `) || s === t);
  return title ? [title, s.slice(title.length).trim()] : ['', s];
};
const competitorRows = (text = '') => String(text).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((r) => r.some(Boolean));

export function notesFiles(p) {
  if (!p || !existsSync(p.filesDir)) return [];
  return readdirSync(p.filesDir)
    .filter((f) => !f.endsWith('.extracted.txt'))
    .map((f) => {
      const textFile = join(p.filesDir, `${f}.extracted.txt`);
      return { name: f, size: statSync(join(p.filesDir, f)).size, chars: existsSync(textFile) ? readFileSync(textFile, 'utf8').length : 0 };
    });
}

function readinessGrid(values = {}) {
  return `<dl class="readiness">${Object.entries(READINESS_KEYS).map(([key, label]) => {
    const now = values[key] || {};
    return `<dt>${esc(label)}</dt><dd>${segmented(`readiness_${key}`, [['yes', 'Yes', 'done'], ['no', 'No', 'bad'], ['unknown', "Don't know", 'neutral']], now.value || 'unknown', { label })}</dd>${now.source && now.source !== 'you' ? `<span class="src">From ${esc(now.source)}${now.quote ? `: ${txt(`«${now.quote}»`)}` : ''}</span>` : ''}`;
  }).join('')}</dl>`;
}

function socialsFound(socials = []) {
  const rows = socials.map((u) => {
    const hit = classifySocialUrl(cleanWebsite(u) || u);
    return `<li>${`<input type="checkbox" name="socials_pick" value="${attr(u)}" checked aria-label="Use ${attr(u)}">`}${platformMark(hit?.platform, { size: 18 })}<a class="url" href="${attr(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a><span class="tag tag-quiet">${esc(hit?.name || 'link')}</span></li>`;
  });
  return `<ul class="found" data-found>${rows.join('')}</ul>`;
}

function logoBlock({ slug, p }) {
  const info = p ? load(p.logoInfo, null) : null;
  const current = p && existsSync(p.logo) ? `${fileUrl(slug, 'brand/logo.png')}?v=${Math.round(statSync(p.logo).mtimeMs)}` : '';
  return `<div class="field"><span class="label">Client logo</span>
    <div data-logo-choices>${current ? `<label class="logo-pick"><input type="radio" name="logo_choice" value="keep" checked> ${clientMark({ logoUrl: current })}<span class="small">Current logo<br><span class="muted">${esc(info?.source || '')}</span></span></label>` : ''}</div>
    <div class="field-row">
      <label class="check small"><input type="radio" name="logo_choice" value="none"${current ? '' : ' checked'}> ${current ? 'Remove the logo' : 'No logo for now'}</label>
      <label class="check small"><input type="radio" name="logo_choice" value="upload"> Upload a logo</label>
    </div>
    <input type="file" name="logo_file" accept=".png,.jpg,.jpeg,.svg,.webp" aria-label="Logo file">
    <p class="help">Use "Find profiles and logo" to pick one from the website. PNG or SVG with a clear background looks best.</p>
  </div>`;
}

function briefFields({ intake = {}, notes = '', isNew = false, slug = '', p = null, readiness = {}, error = '' }) {
  const [title, person] = splitPresentedTo(intake.presentedTo && intake.presentedTo !== intake.name ? intake.presentedTo : '');
  const rows = competitorRows(intake.competitors);
  const compRow = (r = []) => `<div class="row" data-row>
      <input type="text" name="comp_name" value="${attr(r[0] || '')}" dir="auto" placeholder="Name" aria-label="Competitor name">
      <input type="text" name="comp_website" value="${attr(r[1] || '')}" inputmode="url" placeholder="website.com" aria-label="Competitor website">
      <input type="text" name="comp_link" value="${attr(r.slice(2).join(' ') || '')}" inputmode="url" placeholder="instagram.com/… (optional)" aria-label="Competitor profile link">
      <button type="button" class="btn btn-quiet btn-sm btn-icon" data-row-remove aria-label="Remove this competitor">${icon('x', { size: 14 })}</button>
    </div>`;
  const files = notesFiles(p);
  return `<div class="form-grid">
  <div class="form-col">
    <fieldset class="group"><legend>${icon('building-2')} Client</legend>
      ${field('Client name', `<input type="text" name="name" value="${attr(intake.name || '')}" required dir="auto" autocomplete="off"${isNew ? ' autofocus' : ' readonly'}>`, { help: isNew ? 'As the client writes it, Arabic or English.' : 'The name cannot be changed after creation.' })}
      <div class="field-row">
        ${field('Name on the cover', `<input type="text" name="displayName" value="${attr(intake.displayName && intake.displayName !== intake.name ? intake.displayName : '')}" dir="auto" placeholder="Same as the client name">`)}
        <div class="field"><label for="presented-person">Presented to</label><div class="input-with-button">${select('presented_title', TITLES.map((t) => [t, t || 'Title']), title, 'aria-label="Title" style="width:96px;flex:none"')}<input type="text" id="presented-person" name="presented_person" value="${attr(person)}" dir="auto" placeholder="e.g. سامح"></div></div>
      </div>
    </fieldset>

    <fieldset class="group"><legend>${platformMark('google_maps', { mono: true })} Online presence</legend>
      <div class="field"><label for="website">Website</label>
        <div class="input-with-button"><input type="text" id="website" name="website" value="${attr((intake.website || '').replace(/^https:\/\//, ''))}" inputmode="url" autocomplete="off" placeholder="example.com" data-website>
        <button type="button" class="btn btn-secondary" data-presence>${icon('scan-search')}<span>Find profiles and logo</span></button></div>
        <p class="help">No need for https:// or www. The button reads the website and lists its social profiles and logo; tick what is right.</p>
        <p class="field-error" data-presence-error hidden></p>
      </div>
      <div data-presence-result>${intake.socials?.length ? socialsFound(intake.socials) : '<ul class="found" data-found></ul>'}</div>
      ${field('Other profile links', `<textarea name="socials_more" rows="2" placeholder="Paste any profile the website does not link to, one per line"></textarea>`, { help: 'Company pages on LinkedIn, Instagram, TikTok, Facebook, X, YouTube, Snapchat. The research also finds missing ones on its own.' })}
      ${logoBlock({ slug, p })}
    </fieldset>

    <fieldset class="group"><legend>${icon('map-pin')} Market</legend>
      <div class="field-row">
        ${field('Market or country', combo('market', intake.market || '', MARKETS, { placeholder: 'Type or pick', extra: 'data-market' }))}
        ${field('Industry', select('industry', industryOptions(), intake.industry || 'general'), { help: 'Sets the social media reference ranges.' })}
      </div>
      <div class="field"><span class="label">Competitors you already know <span class="muted small">(optional)</span></span>
        <div class="rows-editor" data-rows>${(rows.length ? rows : [[]]).map(compRow).join('')}</div>
        <div><button type="button" class="btn btn-quiet btn-sm" data-row-add>${icon('plus', { size: 14 })}<span>Add another</span></button></div>
        <p class="help">The AI also looks for competitors; you confirm its suggestions.</p>
      </div>
      <div class="field"><span class="label">Known constraints</span>
        ${chipChoices('constraint_tags', CONSTRAINTS, intake.constraintTags || [], { label: 'Known constraints' })}
        <textarea name="constraints_note" rows="2" dir="auto" placeholder="Anything else the proposal must respect" aria-label="Other constraints">${esc(intake.constraintsNote ?? (intake.constraintTags ? '' : intake.constraints || ''))}</textarea>
      </div>
    </fieldset>
  </div>

  <div class="form-col">
    <fieldset class="group"><legend>${icon('notebook-pen')} Meeting notes</legend>
      <div class="field"><label for="notes">Notes</label><textarea id="notes" name="notes" class="notes" dir="auto" rows="14" placeholder="Goals, products, budget, what they tried, anything the client said. Arabic or English.">${esc(notes)}</textarea></div>
      <div class="field drop" data-drop><label for="notes-files">${icon('paperclip', { size: 14 })} Attach a meeting report</label>
        <input type="file" id="notes-files" name="notes_files" multiple accept="${ACCEPTED_FILES.join(',')}">
        <p class="help">Word (.docx), PDF, .txt or .md, up to 15 MB each. The text is read by code and used like the notes, with quotes checked against it.</p>
        ${files.length ? `<ul class="files">${files.map((f) => `<li>${icon('file-text', { size: 16 })}<a class="grow" href="${fileUrl(slug, `inputs/files/${f.name}`)}" target="_blank">${esc(f.name)}</a><span class="muted small nowrap">${f.chars.toLocaleString('en-US')} characters</span><label class="check small"><input type="checkbox" name="remove_file" value="${attr(f.name)}"> Remove</label></li>`).join('')}</ul>` : ''}
      </div>
    </fieldset>
    <fieldset class="group"><legend>${icon('clipboard-check')} Client readiness</legend>
      <p class="help" style="margin:-4px 0 10px">Affects when ads and other services can start. Filled from the notes when they say so; change anything here.</p>
      ${readinessGrid(readiness)}
    </fieldset>
    ${error ? note(esc(error), 'bad') : ''}
  </div>
</div>`;
}

export function newClient({ msg = '', values = {} } = {}) {
  return `<header class="page-header"><div class="page-heading"><h1>New proposal</h1><div class="page-meta">Only the minimum. The system researches the website, social media and competitors on its own.</div></div></header>
  ${msg}
  <form method="post" action="/new" enctype="multipart/form-data" data-track-dirty>
    ${briefFields({ intake: values, notes: values.notes || '', isNew: true, readiness: values.readiness || {} })}
    <div class="form-bar"><span class="small muted">Research starts right away; you can edit the brief later.</span><div class="btn-row"><a class="btn btn-quiet" href="/">Cancel</a>${button('Create and start research', { name: '', kind: 'primary', iconName: 'arrow-right' })}</div></div>
  </form>`;
}

export function briefPage({ slug, p, intake }) {
  const notes = existsSync(p.notes) ? readFileSync(p.notes, 'utf8') : '';
  const record = load(p.readiness, {});
  const answers = load(join(p.recordDir, 'answers.json'), {});
  const readiness = Object.fromEntries(Object.keys(READINESS_KEYS).map((k) => {
    const a = answers[`readiness:${k}`]?.answer;
    return [k, a ? { value: a, source: 'you' } : record[k] ? { value: record[k].value, source: record[k].source, quote: record[k].quote } : { value: 'unknown' }];
  }));
  return `<form method="post" action="/c/${attr(slug)}/brief" enctype="multipart/form-data" data-track-dirty>
    ${briefFields({ intake, notes, slug, p, readiness })}
    <div class="form-bar"><span class="small muted">Changing the website, profiles or notes re-runs the research that used them; later approvals re-open.</span>${button('Save brief', { name: '', kind: 'primary', iconName: 'check' })}</div>
  </form>`;
}

// Form → intake. Accepts either the v3 fields or the older plain ones (the command line and old tests use those).
export function briefFromForm(b, intake = {}) {
  const name = intake.name || (b.get('name') || '').trim();
  const title = (b.get('presented_title') || '').trim();
  const person = b.has('presented_person') ? (b.get('presented_person') || '').trim() : (b.get('presentedTo') || '').trim();
  const presentedTo = person ? `${title ? `${title} ` : ''}${person}` : name;
  const picked = b.getAll('socials_pick');
  const socials = [...new Set(cleanLinks([...picked, ...String(b.get('socials_more') ?? '').split(/\s+/), ...String(b.get('socials') ?? '').split(/\s+/)]).filter((u) => classifySocialUrl(u)))];
  const compNames = b.getAll('comp_name');
  const competitors = compNames.length
    ? compNames.map((n, i) => [n.trim(), cleanWebsite(b.getAll('comp_website')[i]).replace(/^https:\/\//, ''), cleanLinks(b.getAll('comp_link')[i] || '').join(' ')]).filter((r) => r[0] || r[1]).map((r) => r.filter(Boolean).join(' | ')).join('\n')
    : b.get('competitors') || '';
  const tags = b.getAll('constraint_tags').filter((t) => CONSTRAINTS.some(([k]) => k === t));
  const note = (b.get('constraints_note') ?? b.get('constraints') ?? '').trim();
  const labels = tags.map((t) => CONSTRAINTS.find(([k]) => k === t)[1]);
  return {
    ...intake,
    name,
    displayName: (b.get('displayName') || '').trim() || name,
    presentedTo,
    website: cleanWebsite(b.get('website')),
    socials,
    market: (b.get('market') || '').trim(),
    industry: b.get('industry') || 'general',
    competitors,
    constraintTags: tags,
    constraintsNote: note,
    constraints: [...labels, note].filter(Boolean).join('\n'),
  };
}

export { note };
