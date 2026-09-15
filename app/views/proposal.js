// Proposal stage: the designed slides, automated reviews, the fact check, language review, change requests and approval.
// Delivery stage: the approved files and marking the proposal as sent.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esc, attr, icon, txt, ar, fileUrl, shortTime } from '../ui/html.js';
import { section, status, button, linkButton, field, empty, note, table } from '../ui/components.js';
import { listVersions, sourceLabel } from '../../pipeline/versions.js';
import { usageSummary, usd } from '../../pipeline/usage.js';
import { duration, relTime } from '../ui/html.js';
import { stepList } from './research.js';
import { load } from '../../pipeline/client.js';
import { sentFile, gate3Blockers } from '../../pipeline/gates.js';
import { factEvidence } from '../../pipeline/fact-evidence.js';
import { SECTION_LABELS } from './editor.js';

const FACT_WARN = new Set(['no_evidence', 'unknown_evidence', 'number_not_in_evidence', 'weak_match']);
const PART_NAMES = { cards: 'card', facts: 'fact', stats: 'number', items: 'item', rows: 'row' };
// "brand.cards[0].text" → "Brand and market · card 1 · text"
const factLabel = (path) => path.replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`).split('.').map((part, n) => part.replace(/^[a-z]+/, (w) => (n === 0 ? SECTION_LABELS[w] : PART_NAMES[w]) || w)).join(' · ');

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

// The chat with the AI editor, the slide editor link, a full rewrite, and every earlier version to go back to.
function changePanel(slug, p, { g3, suggestions, job }) {
  const chat = load(p.chat, { messages: [] }).messages;
  const busy = (job?.side || []).includes('Edit with AI');
  const msg = (m) => {
    if (m.role === 'you') return `<div class="msg msg-you">${txt(m.text, 'span')}<span class="meta">You · ${esc(relTime(m.at))}</span></div>`;
    if (m.error) return `<div class="msg msg-ai"><span class="text-bad">Could not make the change: ${esc(m.error)}</span><span class="meta">AI editor · ${esc(relTime(m.at))}</span></div>`;
    return `<div class="msg msg-ai">${esc(m.text)}${m.notDone?.length ? `<div class="small text-warn">${m.notDone.map(esc).join('<br>')}</div>` : ''}<span class="meta">AI editor · ${m.changes ? `${m.changes} text change${m.changes === 1 ? '' : 's'} · saved as version ${esc(m.version)}` : 'no change'}${m.costUsd ? ` · ${usd(m.costUsd)}` : ''} · ${esc(relTime(m.at))}</span></div>`;
  };
  const versions = listVersions(p).reverse();
  return `<div class="change-grid">
    <div>
      <h3 class="h3">${icon('sparkles', { size: 16 })} Ask the AI to change something</h3>
      <div class="chat" data-chat>${chat.length ? chat.slice(-20).map(msg).join('') : '<p class="muted small">For example: «خلي عنوان المشاكل أقصر», "make the cover promise mention Riyadh", "use Saudi wording on the solutions slide". The AI changes only that, keeps everything else, and the slides are redesigned.</p>'}${busy ? '<div class="msg msg-ai"><span class="live-dot"><span class="status status-working"><span class="dot dot-working" aria-hidden="true"></span><span>Working on your request…</span></span></span></div>' : ''}</div>
      <form method="post" action="/c/${attr(slug)}/proposal" data-track-dirty>
        <div class="field"><label for="instruction" class="sr-only">What should change</label><textarea id="instruction" name="instruction" rows="3" dir="auto" placeholder="What should change? Arabic or English."${busy ? ' disabled' : ''}></textarea></div>
        <div class="form-actions">${button(busy ? 'Working…' : 'Send', { value: 'ask', kind: 'primary', iconName: 'send', disabled: busy })}${suggestions ? `<button type="button" class="btn btn-quiet" data-fill="instruction" data-value="${attr(JSON.parse(suggestions))}">Use the language review's suggestions</button>` : ''}</div>
      </form>
    </div>
    <div>
      <h3 class="h3">${icon('pencil', { size: 16 })} Edit it yourself</h3>
      <p class="small muted">Every text on the slides as a field, next to the slide pictures. No code, and lengths are limited so nothing overflows.</p>
      <div class="form-actions">${linkButton('Edit slide text', `/c/${slug}/proposal/edit`, { kind: 'secondary', iconName: 'pencil' })}</div>
      <details class="inline-details"><summary>Rewrite the whole proposal with notes</summary>
        <form method="post" action="/c/${attr(slug)}/proposal" data-track-dirty>
          ${field('Notes for the writer', `<textarea name="revision" id="revision" rows="3" dir="auto">${esc(g3.revisionNotes || '')}</textarea>`, { id: 'revision', help: 'The AI writes every section again with these notes (uses Opus; takes a few minutes). Names, scope and timing stay as approved.' })}
          <div class="form-actions">${button('Rewrite with these notes', { value: 'revise', kind: 'secondary', iconName: 'refresh-cw', confirm: 'Rewrite the whole proposal? The current text is kept as a version you can restore.' })}</div>
        </form>
      </details>
      <h3 class="h3" id="versions">${icon('history', { size: 16 })} Versions</h3>
      ${versions.length ? `<ol class="versions">${versions.slice(0, 12).map((v, i) => `<li><span class="mono small">v${esc(v.n)}</span><span class="small">${esc(sourceLabel(v.source))}${v.note ? ` <span class="muted">— ${txt(String(v.note).slice(0, 80))}</span>` : ''}<span class="cell-sub">${esc(relTime(v.at))}</span></span>${i === 0 ? '<span class="tag">current</span>' : `<form method="post" action="/c/${attr(slug)}/proposal" class="inline-form">${button('Restore', { value: `restore:${v.n}`, kind: 'quiet', size: 'sm', iconName: 'undo-2', confirm: `Go back to version ${v.n}? The current text is kept as a version too.` })}</form>`}</li>`).join('')}</ol>` : '<p class="muted small">Versions appear once the text is written or edited.</p>'}
    </div>
  </div>`;
}

export function proposalPage({ slug, p, state, job = null }) {
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
  ${lr?.issues?.length ? section({ title: 'Language review', count: lr.issues.length, intro: 'Advisory suggestions from a second reader.', body: table(['Where', 'Text', 'Issue', 'Suggestion'], lr.issues.map((i) => `<tr><td class="small">${esc(factLabel(i.section || ''))}</td><td>${ar(i.quote)}</td><td class="small">${esc(i.issue)}</td><td>${ar(i.suggestion)}</td></tr>`)), collapsible: true, open: false }) : ''}
  ${section({ id: 'change', title: 'Change the proposal', intro: 'After the PDF is made: ask the AI, or edit the slide text yourself. Every change is kept as a version; the reviews and slide design run again after each one.', body: changePanel(slug, p, { g3, suggestions, job }) })}`;
}

function internalReport(slug, p, state) {
  const st = state.steps.report;
  const has = existsSync(join(p.internalDir, 'internal-report.pdf'));
  const data = load(join(p.internalDir, 'internal-report.json'), null);
  const actions = has ? `<div class="btn-row">${linkButton('Open the report', fileUrl(slug, 'output/internal/internal-report.html'), { kind: 'primary', iconName: 'file-text', external: true })}${linkButton('Download PDF', `${fileUrl(slug, 'output/internal/internal-report.pdf')}?download`, { iconName: 'download' })}</div>` : '';
  const line = st.state === 'running' ? '<span class="live-dot"><span class="status status-working"><span class="dot dot-working" aria-hidden="true"></span><span>Writing the report now (a few minutes)</span></span></span><span class="working-bar"></span>' : st.state === 'blocked' ? '<p class="muted">Written automatically once the proposal is approved.</p>' : '';
  const summary = data?.analysis?.executiveSummary ? `<p class="small" style="margin-top:10px"><b>In one line:</b> ${txt(data.analysis.executiveSummary.engagementIsAbout)}</p>` : '';
  return `${line}${actions}${summary}${stepList(slug, state, ['report'], { back: 'delivery' })}`;
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
  const usage = usageSummary(p);
  const usageTable = usage.total.runs
    ? `${table(['Step', ['Runs', 'num'], ['Time', 'num'], ['Claude usage', 'num']], [...usage.steps.map((u) => `<tr><td>${esc(u.label)} <span class="muted small">${esc(u.models.join(', '))}</span>${u.failed ? ` <span class="tag tag-quiet">${u.failed} failed</span>` : ''}</td><td class="num">${u.runs}</td><td class="num">${esc(duration(u.durationMs))}</td><td class="num">${usd(u.costUsd)}${u.unknownCost ? '<abbr title="Some runs did not report a cost">*</abbr>' : ''}</td></tr>`), `<tr class="row-summary"><td>Total for this proposal</td><td class="num">${usage.total.runs}</td><td class="num">${esc(duration(usage.total.durationMs))}</td><td class="num"><b>${usd(usage.total.costUsd)}</b></td></tr>`])}
      <p class="small muted table-note">Measured from each Claude run's own report (not estimated), including failed attempts and chat edits. On the Claude subscription this is the equivalent API value of the usage, not a bill.</p>`
    : empty('No Claude runs recorded for this proposal yet.');
  return `${!approved && !sent ? note('The proposal is not approved yet. Approve it on the Proposal page first.', 'info') : ''}
  ${section({ title: 'Approved files', body: files.length ? table(['Version', 'Files'], files) : empty('No approved files yet.') })}
  ${section({ id: 'report', title: 'Internal strategy report', intro: 'For the Al-Marketer team only, never sent: the analysis behind the proposal, SWOT, competitors, risks and questions for the next meeting. Written in English after the proposal is approved.', body: internalReport(slug, p, state) })}
  ${section({ id: 'usage', title: 'What this proposal cost in Claude usage', count: usage.total.runs ? usd(usage.total.costUsd) : null, body: usageTable })}
  ${section({ title: 'Send', body: sent
    ? `${note(`Marked as sent on ${esc(shortTime(sent.sentAt))} (version ${esc(sent.version)}).${sent.note ? ` Note: ${txt(sent.note)}` : ''}`, 'ok')}`
    : approved
      ? `<form method="post" action="/c/${attr(slug)}/delivery"><p>Send the files yourself (email, WhatsApp, meeting), then record it here.</p>${field('How it was sent (optional)', '<input type="text" name="sentnote" dir="auto" placeholder="e.g. sent by WhatsApp to the marketing manager">')}<div class="form-actions">${button('Mark as sent', { value: 'sent', kind: 'primary', iconName: 'send' })}</div></form>`
      : empty('Available after the proposal is approved.') })}`;
}
