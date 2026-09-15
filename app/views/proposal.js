// Proposal stage: the designed slides, automated reviews, the fact check, language review, change requests and approval.
// Delivery stage: the approved files and marking the proposal as sent.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esc, attr, icon, txt, ar, fileUrl, shortTime } from '../ui/html.js';
import { section, status, button, linkButton, field, empty, note, table } from '../ui/components.js';
import { stepList } from './research.js';
import { load } from '../../pipeline/client.js';
import { sentFile, gate3Blockers } from '../../pipeline/gates.js';
import { factEvidence } from '../../pipeline/fact-evidence.js';

const FACT_WARN = new Set(['no_evidence', 'unknown_evidence', 'number_not_in_evidence', 'weak_match']);
const SECTION_NAMES = { business: 'Business', brand: 'Brand', cards: 'card', facts: 'fact', stats: 'number', problems: 'Problems', items: 'item' };
const factLabel = (path) => path.replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`).split('.').map((part) => part.replace(/^[a-z]+/, (w) => SECTION_NAMES[w] || w)).join(' · ');

function factCheck(slug, p, content) {
  const facts = factEvidence(p, content);
  if (!facts.length) return empty('No statements about the client to compare.');
  const needsLook = (f) => f.flags.some((x) => FACT_WARN.has(x.code));
  const flagged = facts.filter(needsLook);
  const ev = (e) => {
    const link = e.kind === 'check' || e.kind === 'missing' ? `<span class="mono small">${esc(e.id)}</span>` : `<a class="mono small" href="${fileUrl(slug, `evidence/pages/${e.id}.txt`)}" target="_blank">${esc(e.id)}</a>`;
    return `<div class="fact-ev">${link} <span class="small">${txt(e.title || e.kind)}</span>${e.url && /^https?:/.test(e.url) ? ` <a href="${attr(e.url)}" target="_blank" rel="noopener" aria-label="Open source">${icon('external-link', { size: 12 })}</a>` : ''}${e.lines.map((l) => `<div class="quote">${txt(l.text)}${l.quote ? `<div class="small muted">${txt(`«${l.quote}»`)}</div>` : ''}</div>`).join('')}</div>`;
  };
  const rows = [...flagged, ...facts.filter((f) => !needsLook(f))].map((f) => `<tr class="${needsLook(f) ? 'row-warn' : ''}" data-flagged="${needsLook(f) ? 'yes' : 'no'}"><td><div class="small muted">${esc(factLabel(f.path))}</div>${txt(f.text, 'div')}${f.flags.length ? `<div class="flags">${f.flags.map((x) => status(x.message, FACT_WARN.has(x.code) ? 'warn' : 'neutral')).join('')}</div>` : ''}</td><td>${f.evidence.map(ev).join('') || '<span class="muted">No evidence cited</span>'}</td></tr>`);
  return `<p class="small">${facts.length} statements${flagged.length ? `, <b>${flagged.length} need a closer look</b> (shown first)` : ''}. The automated reviews confirm the evidence exists; you confirm it says the same thing.</p>
  ${flagged.length && facts.length > flagged.length ? `<label class="check small"><input type="checkbox" data-filter-flagged> Show only the ${flagged.length} that need a closer look</label>` : ''}
  ${table(['In the proposal', 'Evidence it cites'], rows, { cls: 'table-facts' })}`;
}

export function proposalPage({ slug, p, state }) {
  const steps = stepList(slug, state, ['write', 'check', 'render'], { back: 'proposal' });
  const report = load(join(p.draftDir, 'render-report.json'), null);
  if (!report) return `${section({ title: 'Progress', body: steps })}${section({ title: 'Proposal', body: empty(state.steps.write.state === 'running' ? 'The Arabic text is being written now. The automated reviews and slide design run right after, at the same time.' : 'The proposal is written and designed as soon as the scope is approved.') })}`;
  const review = load(p.review, null);
  const g3 = load(p.gate3, {});
  const approved = state.steps.gate3.state === 'approved';
  const failing = review ? [...review.contentChecks.filter((c) => c.level === 'error' && !c.ok), ...review.scopeChecks.filter((c) => !c.ok)] : [];
  const warnings = review ? review.contentChecks.filter((c) => c.level === 'warning' && !c.ok) : [];
  const lr = review?.languageReview;
  const content = load(p.content, {});
  const blockers = approved ? [] : gate3Blockers(p, { gateState: state.steps.gate3.state });
  const previews = report.previews || [];

  const viewer = previews.length
    ? `<div class="viewer" data-viewer>
        <div class="viewer-stage"><img data-viewer-main src="${fileUrl(slug, previews[0])}" alt="Slide 1 of ${previews.length}" width="1600" height="900"></div>
        <ol class="viewer-thumbs" aria-label="Slides">${previews.map((f, i) => `<li><button type="button" data-viewer-thumb="${fileUrl(slug, f)}" data-index="${i + 1}" aria-label="Show slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}><img src="${fileUrl(slug, f)}" alt="" width="160" height="90"><span>${i + 1}</span></button></li>`).join('')}</ol>
      </div>`
    : empty('No slide previews.');

  const reviewSummary = `<ul class="checklist">
    <li>${status(report.ok ? 'Layout checks pass' : `Layout: ${report.issues?.length || 0} issue(s)`, report.ok ? 'done' : 'bad')}${report.issues?.length ? `<div class="small">${report.issues.map((i) => `Slide ${i.slide} (${esc(i.section)}): ${esc(i.type)} ${txt(i.text || '')}`).join('<br>')}</div>` : ''}</li>
    <li>${status(report.fontsLoaded ? 'Fonts embedded' : 'Fonts did not load', report.fontsLoaded ? 'done' : 'bad')}</li>
    <li>${status(failing.length ? `${failing.length} blocking review issue(s)` : 'Content, scope, numbers, names and guarantee checks pass', failing.length ? 'bad' : 'done')}${failing.length ? `<div class="small">${failing.map((c) => `<b>${esc(c.id)}</b> ${esc(c.message)}`).join('<br>')}</div>` : ''}</li>
    ${warnings.length ? `<li>${status(`${warnings.length} warning(s)`, 'warn')}<div class="small">${warnings.map((c) => `<b>${esc(c.id)}</b> ${esc(c.message)}`).join('<br>')}</div></li>` : ''}
    <li>${lr ? status(`Language: clarity ${lr.clarityForNonMarketer}/5, dialect ${lr.dialectConsistent ? 'consistent' : 'mixed'}`, lr.clarityForNonMarketer >= 4 && lr.dialectConsistent ? 'done' : 'warn') : review?.languageError ? status(`Language review did not run: ${review.languageError}`, 'warn') : status('Language review pending', 'neutral')}</li>
  </ul>`;

  const suggestions = lr?.issues?.length ? JSON.stringify(lr.issues.map((i) => `- «${i.quote}» → ${i.suggestion}`).join('\n')) : '';
  const approvePanel = `<form method="post" action="/c/${attr(slug)}/proposal" class="approve-panel">
    <h2 class="h3">Approve</h2>
    <p class="small muted">Approving saves the final PDF and web file with a version number. The system never sends anything.</p>
    ${blockers.length ? note(blockers.map(esc).join('<br>'), 'warn') : ''}
    ${approved ? note(`Approved as version ${esc(g3.version)}.`, 'ok') : `<label class="check"><input type="checkbox" name="factsChecked" value="yes" required> I compared every statement in the fact check with its evidence</label>`}
    ${approved ? '' : button('Approve proposal', { value: 'approve', kind: 'primary', disabled: blockers.length > 0, confirm: 'Approve this proposal as final?' })}
  </form>`;

  return `${section({ title: 'Progress', body: steps, collapsible: true, open: !approved && state.running.length > 0 })}
  <div class="proposal-top">
    <div class="proposal-slides">${section({ title: 'Slides', count: previews.length, actions: `${linkButton('Open web version', fileUrl(slug, 'output/draft/proposal-draft.html'), { size: 'sm', external: true })}${linkButton('Open PDF', fileUrl(slug, 'output/draft/proposal-draft.pdf'), { size: 'sm', external: true })}`, body: viewer })}</div>
    <div class="proposal-side">${section({ title: 'Automated reviews', body: reviewSummary })}${approvePanel}</div>
  </div>
  ${section({ id: 'facts', title: 'Fact check', intro: 'Every statement about the client, next to the evidence it cites. Compare them before approving.', body: factCheck(slug, p, content) })}
  ${lr?.issues?.length ? section({ title: 'Language review', count: lr.issues.length, intro: 'Advisory suggestions from a second reader.', body: table(['Where', 'Text', 'Issue', 'Suggestion'], lr.issues.map((i) => `<tr><td class="small">${esc(i.section)}</td><td>${ar(i.quote)}</td><td class="small">${esc(i.issue)}</td><td>${ar(i.suggestion)}</td></tr>`)), collapsible: true, open: false }) : ''}
  ${section({ id: 'changes', title: 'Ask for changes', intro: 'Describe what to change. The text is rewritten, reviewed and redesigned; names, scope and timing stay as approved.', body: `<form method="post" action="/c/${attr(slug)}/proposal" data-track-dirty>
      ${field('What should change', `<textarea name="revision" id="revision" rows="4" dir="auto">${esc(g3.revisionNotes || '')}</textarea>`, { id: 'revision', help: 'For example: «خلي العناوين أقصر», or "mention the Saudi launch more clearly".' })}
      <div class="form-actions">${button('Rewrite with these notes', { value: 'revise', kind: 'secondary', iconName: 'refresh-cw' })}${suggestions ? `<button type="button" class="btn btn-quiet" data-fill="revision" data-value="${attr(JSON.parse(suggestions))}">Use the language review's suggestions</button>` : ''}</div>
    </form>` })}
  ${section({ title: 'Edit the text directly', collapsible: true, open: false, intro: 'For small fixes. The reviews and design run again after saving. Names, the map, weeks and KPIs are not in this text; they come from the approved scope.', body: `<form method="post" action="/c/${attr(slug)}/proposal" data-track-dirty><textarea class="code" name="content" rows="24" spellcheck="false" aria-label="Proposal text (JSON)">${esc(JSON.stringify(content, null, 2))}</textarea><div class="form-actions">${button('Save text and redesign', { value: 'save-content' })}</div></form>` })}`;
}

export function deliveryPage({ slug, p, state }) {
  const g3 = load(p.gate3, {});
  const sent = load(sentFile(p), null);
  const approved = state.steps.gate3.state === 'approved';
  const versions = existsSync(p.outputDir) ? readdirSync(p.outputDir).filter((f) => /-proposal-v\d+\.(pdf|html)$/.test(f)).sort() : [];
  const byVersion = {};
  for (const f of versions) {
    const v = Number(f.match(/-v(\d+)\./)[1]);
    (byVersion[v] ||= []).push(f);
  }
  const files = Object.entries(byVersion).sort((a, b) => b[0] - a[0]).map(([v, list]) => `<tr><td>Version ${esc(v)}${Number(v) === Number(g3.version) ? ' <span class="tag">current</span>' : ''}</td><td><div class="btn-row">${list.map((f) => linkButton(f.endsWith('.pdf') ? 'Download PDF' : 'Download web file', `${fileUrl(slug, `output/${f}`)}?download`, { size: 'sm', iconName: 'download' })).join('')}</div></td></tr>`);
  return `${!approved && !sent ? note('The proposal is not approved yet. Approve it on the Proposal page first.', 'info') : ''}
  ${section({ title: 'Approved files', body: files.length ? table(['Version', 'Files'], files) : empty('No approved files yet.') })}
  ${section({ title: 'Send', body: sent
    ? `${note(`Marked as sent on ${esc(shortTime(sent.sentAt))} (version ${esc(sent.version)}).${sent.note ? ` Note: ${txt(sent.note)}` : ''}`, 'ok')}`
    : approved
      ? `<form method="post" action="/c/${attr(slug)}/delivery"><p>Send the files yourself (email, WhatsApp, meeting), then record it here.</p>${field('How it was sent (optional)', '<input type="text" name="sentnote" dir="auto" placeholder="e.g. sent by WhatsApp to the marketing manager">')}<div class="form-actions">${button('Mark as sent', { value: 'sent', kind: 'primary', iconName: 'send' })}</div></form>`
      : empty('Available after the proposal is approved.') })}`;
}
