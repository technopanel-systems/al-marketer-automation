// Slide text editor: every text on the slides as a labeled field, grouped by section next to that section's slide
// pictures. Limits come from the writer's schema (the same the AI works under), so nothing can overflow a slide.
// Names, the 3-month map, weeks and KPIs are not text fields: they come from the approved scope.
import { esc, attr, icon, fileUrl } from '../ui/html.js';
import { section, button, linkButton, select, empty, note } from '../ui/components.js';
import { load } from '../../pipeline/client.js';
import { join } from 'node:path';
import { contentSchema, ICONS } from '../../ai/steps/write.js';

export const SECTION_LABELS = { cover: 'Cover', business: 'Business and offers', brand: 'Brand and market', problems: 'Problems', impact: 'Impact of the problems', solutions: 'Solutions', expected: 'Expected impact', map: '3-month map', weeks: 'First 4 weeks', kpis: 'KPIs', tracking: 'Tracking and improvement' };
const LABELS = { eyebrow: 'Label above the name', accent: 'Accent line (coloured)', subtitle: 'Promise line', lead: 'Short sentence', title: 'Title', intro: 'Intro', cards: 'Cards', text: 'Text', highlightLabel: 'Highlight label', highlight: 'Highlight', factsLabel: 'Facts label', facts: 'Facts', stats: 'Numbers', value: 'Number', cards_title: 'Card title', chips: 'Tags', note: 'Note', items: 'Items', points: 'Points', why: 'Why this solution fits', rows: 'Rows', area: 'Area', current: 'Now', expected: 'Expected', weekTitles: 'Week titles', principleLines: 'Principle lines', icon: 'Icon' };
const SKIP = new Set(['basedOn', 'problemId', '_meta']);
const label = (key) => LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const itemName = (key) => ({ cards: 'Card', facts: 'Fact', stats: 'Number', items: 'Item', rows: 'Row', points: 'Point', chips: 'Tag', weekTitles: 'Week', principleLines: 'Line' })[key] || 'Item';

function textControl(path, schema, value, key) {
  const max = schema.maxLength || 300;
  const name = `f:${path}`;
  const common = `name="${attr(name)}" maxlength="${max}" dir="rtl" lang="ar" data-count`;
  const control = max > 90 ? `<textarea ${common} rows="${max > 180 ? 3 : 2}">${esc(value ?? '')}</textarea>` : `<input type="text" ${common} value="${attr(value ?? '')}">`;
  return `<div class="field"><label>${esc(label(key))} <span class="muted small" data-counter>${String(value ?? '').length}/${max}</span></label>${control}${key === 'title' ? '<p class="help">Words inside [[double brackets]] are coloured on the slide.</p>' : ''}</div>`;
}

function fields(schema, value, path, key, ctx) {
  if (SKIP.has(key)) return '';
  if (schema.enum && key === 'icon') return `<div class="field"><label>${esc(label(key))}</label>${select(`f:${path}`, ICONS.map((i) => [i, i]), value)}</div>`;
  if (schema.type === 'string') return textControl(path, schema, value, key);
  if (schema.type === 'array') {
    const list = Array.isArray(value) ? value : [];
    if (schema.items.type === 'string') {
      const max = schema.maxItems || list.length;
      const rows = Array.from({ length: Math.max(list.length, Math.min(max, list.length + 1)) }, (_, i) => list[i] ?? '');
      return `<div class="field"><span class="label">${esc(label(key))}</span><div class="editor-grid">${rows.map((v, i) => `<input type="text" name="${attr(`f:${path}.${i}`)}" value="${attr(v)}" maxlength="${schema.items.maxLength || 120}" dir="rtl" lang="ar" aria-label="${attr(`${itemName(key)} ${i + 1}`)}" placeholder="${i >= list.length ? 'Add one (optional)' : ''}">`).join('')}</div>${schema.minItems ? `<p class="help">At least ${schema.minItems}.</p>` : '<p class="help">Leave a line empty to remove it.</p>'}</div>`;
    }
    return list.map((item, i) => {
      const problem = item.problemId ? ctx.problems.find((x) => x.id === item.problemId) : null;
      return `<details class="editor-block" open><summary>${esc(itemName(key))} ${i + 1}${problem ? ` <span class="muted small">— <span dir="rtl" lang="ar">${esc(problem.title_ar)}</span></span>` : ''}</summary>${Object.entries(schema.items.properties).map(([k, s]) => fields(s, item[k], `${path}.${i}.${k}`, k, ctx)).join('')}</details>`;
    }).join('');
  }
  if (schema.type === 'object') return Object.entries(schema.properties).map(([k, s]) => fields(s, value?.[k], path ? `${path}.${k}` : k, k, ctx)).join('');
  return '';
}

export function editorPage({ slug, p, state }) {
  const content = load(p.content, null);
  if (!content) return empty('The slide text can be edited once the proposal is written.');
  const problemIds = content._meta?.problemIds || (content.problems?.items || []).map((x) => x.problemId);
  const schema = contentSchema(problemIds);
  const report = load(join(p.draftDir, 'render-report.json'), null);
  const problems = load(p.diagnosis, { problems: [] }).problems;
  const ctx = { problems };
  const thumbs = (sectionId) => (report?.slides || []).map((s, i) => ({ ...s, file: report.previews?.[i] })).filter((s) => s.section === sectionId && s.file);
  const blocks = Object.entries(schema.properties).map(([key, s]) => {
    const pics = thumbs(key);
    return section({
      id: `edit-${key}`,
      title: SECTION_LABELS[key] || key,
      collapsible: true,
      open: key === 'cover',
      body: `<div class="editor-section">${pics.length ? `<div class="editor-thumbs">${pics.map((x) => `<a href="${fileUrl(slug, x.file)}" target="_blank"><img src="${fileUrl(slug, x.file)}" alt="Slide ${x.index}" width="320" height="180" loading="lazy"></a>`).join('')}</div>` : ''}<div>${fields(s, content[key], key, key, ctx)}</div></div>`,
    });
  });
  const running = state.running.some((id) => ['write', 'check', 'render'].includes(id));
  return `<p class="subpage-back"><a href="/c/${attr(slug)}/proposal">${icon('arrow-left', { size: 14 })} Back to the proposal</a></p>
  ${running ? note('The proposal is being written, reviewed or designed right now. Wait until it finishes before editing, or your changes may be replaced.', 'warn') : ''}
  <form method="post" action="/c/${attr(slug)}/proposal" data-track-dirty>
    ${blocks.join('')}
    <div class="form-bar"><span class="small muted">Saving keeps the current text as a version (undo any time), then the reviews and slide design run again.</span><div class="btn-row">${linkButton('Cancel', `/c/${slug}/proposal`, { kind: 'quiet' })}${button('Save and redesign', { value: 'save-slides', kind: 'primary', iconName: 'check' })}</div></div>
  </form>`;
}

// Form → proposal text: every "f:path" field is written into a copy of the current text; empty optional list lines are dropped.
export function contentFromForm(content, b) {
  const next = JSON.parse(JSON.stringify(content));
  const lists = new Set();
  for (const [name, raw] of b.entries()) {
    if (!name.startsWith('f:')) continue;
    const parts = name.slice(2).split('.');
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      if (node[key] === undefined) node[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      node = node[key];
    }
    const last = /^\d+$/.test(parts.at(-1)) ? Number(parts.at(-1)) : parts.at(-1);
    node[last] = String(raw).replace(/\r\n/g, '\n').trim();
    if (typeof last === 'number') lists.add(parts.slice(0, -1).join('.'));
  }
  for (const path of lists) {
    const parts = path.split('.');
    let node = next;
    for (const part of parts.slice(0, -1)) node = node[/^\d+$/.test(part) ? Number(part) : part];
    const key = parts.at(-1);
    if (Array.isArray(node[key]) && node[key].every((x) => typeof x === 'string')) node[key] = node[key].filter((x) => x);
  }
  return next;
}
