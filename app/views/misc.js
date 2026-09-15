// Smaller pages: full activity log, catalog & rules, how to use.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc, attr, icon } from '../ui/html.js';
import { pageHeader, section, button, linkButton, note, kv } from '../ui/components.js';
import { activityLines, activityList } from './frame.js';
import { ROOT } from '../../engine/catalog/store.js';
import { load } from '../../pipeline/client.js';

export const activityPage = ({ p }) => section({ title: 'Activity', intro: 'Everything the system did for this proposal, newest at the bottom. Kept across restarts.', body: activityList(activityLines(p, 400)) });

export function catalogPage({ msg = '', output = '', kind = 'info' }) {
  const source = load(join(ROOT, 'catalog', 'notion-source.json'), {});
  const doc = load(join(ROOT, 'catalog', 'catalog.json'), { meta: {} });
  return `${pageHeader({ title: 'Catalog & rules', meta: 'Services, offerings and deliverables the rule engine may propose. Nothing outside this catalog is ever proposed.' })}
  ${msg}
  ${output ? section({ title: 'Last result', tone: kind === 'bad' ? 'bad' : '', body: `<pre class="output">${esc(output)}</pre>` }) : ''}
  ${section({ title: 'Local catalog', intro: 'The engine reads only the local catalog (catalog/catalog.json, also as CSV files in catalog/csv). Edit in Notion or in the CSV files, then bring the changes in here.', body: `${kv([
    ['Last update', esc(doc.meta.updatedAt ? new Date(doc.meta.updatedAt).toLocaleString('en-GB') : 'unknown')],
    ['Source', esc(doc.meta.source || 'unknown')],
    ['Contents', `${doc.services?.length || 0} services · ${doc.offerings?.length || 0} offerings · ${doc.deliverables?.length || 0} deliverables`],
  ])}
    <form method="post" action="/catalog/run" class="btn-row">${button('Update from Notion', { value: 'pull', kind: 'primary', iconName: 'refresh-cw' })}${button('Import edited CSV files', { value: 'import' })}${button('Export CSV files', { value: 'export' })}</form>
    <div class="btn-row">${source.notionPage ? linkButton('Open the Notion catalog', source.notionPage, { kind: 'quiet', external: true }) : ''}${linkButton('Full catalog and rules report', '/catalog/report', { kind: 'quiet', external: true })}</div>` })}
  ${section({ title: 'Rule tables', body: '<p>The engine decides with the files in <span class="mono">rules/</span>: which problem types justify which services, timing, KPIs, dependencies and settings. They are listed in the full report.</p>' })}`;
}

export function helpPage() {
  const file = join(ROOT, 'docs', 'how-to-use.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : 'See docs/how-to-use.md in the project folder.';
  const blocks = text.split(/\n(?=[A-Z0-9][A-Z0-9 &()—\-.,'/]+\n|\d+[a-z]?\.\s+[A-Z])/);
  return `${pageHeader({ title: 'How to use', meta: 'The same guide is in docs/how-to-use.md, and HOW-TO-START-AND-TEST.txt covers restarting and testing.' })}
  <article class="prose">${blocks.map((b) => `<pre class="guide">${esc(b.trim())}</pre>`).join('')}</article>`;
}

export { note, icon, attr };
