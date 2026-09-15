// Archived proposals: out of the list, nothing runs, files kept. Restore puts one back; delete removes it from this computer.
import { esc, attr, txt, domainOf, shortTime, relTime } from '../ui/html.js';
import { pageHeader, linkButton, actionForm, status, empty, table } from '../ui/components.js';
import { BLUEPRINT_STATUSES } from '../../pipeline/steps.js';

const archiveFileUrl = (id, file) => `/archive/${id}/files/output/${encodeURIComponent(file)}`;

export function archivePage({ archived, msg = '' }) {
  const rows = archived.map((a) => {
    const name = a.displayName || a.name;
    const reached = BLUEPRINT_STATUSES[a.status]?.en || '';
    const files = a.files.length
      ? `<div class="btn-row">${a.files.map((f) => linkButton(f.endsWith('.pdf') ? `PDF v${a.version}` : `Web file v${a.version}`, `${archiveFileUrl(a.id, f)}?download`, { size: 'sm', kind: 'quiet', iconName: 'download' })).join('')}</div>`
      : '<span class="muted">No approved files</span>';
    return `<tr>
      <td><span class="row-title">${txt(name)}</span><div class="muted small">${a.displayName && a.displayName !== a.name ? `${txt(a.name)} · ` : ''}${esc(a.website ? domainOf(a.website) : 'No website')}</div></td>
      <td class="small">${reached ? status(reached, ['approved', 'sent'].includes(a.status) ? 'done' : 'neutral') : '<span class="muted">Unknown</span>'}</td>
      <td class="small nowrap"><time datetime="${attr(a.archivedAt)}" title="${attr(shortTime(a.archivedAt))}">${esc(relTime(a.archivedAt))}</time></td>
      <td class="small">${files}</td>
      <td class="cell-actions"><div class="btn-row">
        ${actionForm(`/archive/${a.id}/restore`, 'Restore', { size: 'sm', iconName: 'archive-restore' })}
        ${actionForm(`/archive/${a.id}/delete`, 'Delete', { size: 'sm', kind: 'danger', iconName: 'trash-2', confirm: `Delete "${name}" permanently?\n\nIts research, evidence, answers and proposal files are removed from this computer. This cannot be undone.` })}
      </div></td>
    </tr>`;
  });
  return `${pageHeader({
    title: 'Archived proposals',
    meta: esc(archived.length ? `${archived.length} archived · nothing runs for them, and their files are kept` : 'Nothing runs for archived proposals, and their files are kept'),
    crumbs: '<a href="/">Proposals</a>',
  })}
  ${msg}
  ${archived.length
    ? table(['Client', 'Reached', ['Archived', 'nowrap'], 'Final files', ['Actions', 'th-actions']], rows, { cls: 'table-clients' })
    : empty('Nothing is archived. To take a proposal out of the list without losing it, open its menu (the … button) and choose Archive.', linkButton('Back to proposals', '/'))}
  <p class="muted small archive-help">A new proposal for the same customer starts fresh and does not touch an archived one. Restoring a proposal whose name is taken again adds a number to its folder name.</p>`;
}
