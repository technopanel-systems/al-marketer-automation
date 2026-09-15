// Diagnosis stage: each problem next to its evidence and the independent reviewer's opinion, the team's decision,
// problems the team adds, and the approval.
import { existsSync } from 'node:fs';
import { esc, attr, icon, txt, ar } from '../ui/html.js';
import { section, status, button, field, select, segmented, empty, note, kv } from '../ui/components.js';
import { stepList, businessNeeds } from './research.js';
import { scorecardTables } from './social.js';
import { load, loadChecks, checkText } from '../../pipeline/client.js';
import { gate1Problems, addedProblems } from '../../pipeline/gates.js';
import { loadBusinessOps } from '../../ai/steps/business-analyst.js';

const VERDICT = { confirmed: ['Reviewer: confirmed', 'done'], needs_review: ['Reviewer: needs your review', 'warn'], rejected: ['Reviewer: rejected', 'bad'] };
const SEVERITY = [[3, '3 · blocks sales or growth now'], [2, '2 · clearly reduces results'], [1, '1 · smaller effect']];

function evidenceItems(prob, checks) {
  return prob.evidence
    .map((e) => {
      if (e.kind === 'check') {
        const c = checks.find((x) => x.id === e.evidenceId);
        return `<li class="ev ev-check"><span class="mono small">${esc(e.evidenceId)}</span> ${c ? `${esc(c.question)}: <b>${txt(c.result === 'value' ? c.value : c.result === 'present' ? 'yes' : c.result === 'absent' ? 'no' : c.result)}</b>${c.detail ? `<div class="small muted">${txt(c.detail)}</div>` : ''}` : '<span class="muted">check not found</span>'}</li>`;
      }
      return `<li class="ev"><span class="mono small">${esc(e.evidenceId)}</span> ${txt(`«${e.quote}»`, 'span', 'quote-inline')}</li>`;
    })
    .join('');
}

export function diagnosisPage({ slug, p, state, ctx }) {
  const steps = stepList(slug, state, ['diagnose', 'review'], { back: 'diagnosis' });
  const diagnosis = load(p.diagnosis, null);
  if (!diagnosis?.problems) return `${section({ title: 'Progress', body: steps })}${section({ title: 'Problems', body: empty(state.steps.diagnose.state === 'running' ? 'The diagnosis is being written now, with an independent review after it.' : 'The diagnosis starts when the research, competitor capture and important questions are done.') })}`;
  const g = load(p.gate1, { decisions: {}, dialect: 'egyptian' });
  const checks = loadChecks(p);
  const types = ctx.rules.problemTypes.types;
  const approved = state.steps.gate1.state === 'approved';
  const errors = gate1Problems(p);
  const added = addedProblems(g);
  const counts = { confirmed: 0, needs_review: 0, rejected: 0 };
  for (const prob of diagnosis.problems) if (prob.review?.verdict) counts[prob.review.verdict] = (counts[prob.review.verdict] || 0) + 1;

  const cards = diagnosis.problems.map((prob) => {
    const d = g.decisions[prob.id] || {};
    const decision = d.decision || (prob.review?.verdict === 'confirmed' ? 'confirmed' : prob.review?.verdict === 'rejected' ? 'rejected' : 'pending');
    const [vLabel, vTone] = VERDICT[prob.review?.verdict] || ['Not reviewed', 'neutral'];
    return `<article class="problem problem-${attr(decision)}" id="${attr(prob.id)}">
      <header class="problem-head">
        <span class="problem-id mono">${esc(prob.id)}</span>
        <h3>${ar(d.title_ar || prob.title_ar)}</h3>
        <div class="problem-tags">${status(vLabel, vTone)}${prob.evidenceStatus === 'verified' ? status('Evidence verified', 'done') : status('No verified evidence', 'bad')}</div>
      </header>
      <div class="problem-body">
        <div class="problem-text">
          ${ar(d.statement_ar || prob.statement_ar, 'p', 'statement')}
          ${prob.impacts?.length ? `<p class="small muted">Impact: ${prob.impacts.map((i) => `<b>${esc(i.category)}</b> ${ar(i.explanation_ar)}`).join(' · ')}</p>` : ''}
          ${prob.review?.reason ? `<p class="small"><span class="muted">Reviewer:</span> ${txt(prob.review.reason)}</p>` : ''}
          ${prob.flags?.length ? note(prob.flags.map(esc).join('<br>'), 'warn') : ''}
        </div>
        <div class="problem-evidence"><h4 class="h4">Evidence</h4><ul class="evs">${evidenceItems(prob, checks) || '<li class="muted">None</li>'}</ul></div>
      </div>
      <footer class="problem-controls">
        ${segmented(`decision_${prob.id}`, [['confirmed', 'Confirm', 'done'], ['rejected', 'Reject', 'bad'], ['pending', 'Decide later', 'neutral']], decision, { label: `Decision for ${prob.id}` })}
        <div class="field-row">
          ${field('Problem type (decides the service)', select(`type_${prob.id}`, types.map((t) => [t.id, t.labelEn]), d.problemType || prob.problemType))}
          ${field('Severity', select(`severity_${prob.id}`, SEVERITY, Number(d.severity || prob.severity)))}
        </div>
        <details class="inline-details"><summary>Edit wording or add a note</summary>
          ${field('Title (Arabic)', `<input type="text" name="title_${attr(prob.id)}" dir="rtl" lang="ar" value="${attr(d.title_ar || prob.title_ar)}">`)}
          ${field('Statement (Arabic)', `<textarea name="statement_${attr(prob.id)}" dir="rtl" lang="ar" rows="3">${esc(d.statement_ar || prob.statement_ar)}</textarea>`)}
          ${field('Your note', `<input type="text" name="note_${attr(prob.id)}" dir="auto" value="${attr(d.note || '')}">`, { help: 'Required to confirm a problem without verified evidence: how do you know?' })}
        </details>
      </footer>
    </article>`;
  });

  const addedCards = added.map((a) => `<article class="problem problem-confirmed"><header class="problem-head"><span class="problem-id mono">${esc(a.id)}</span><h3>${ar(a.title_ar)}</h3><div class="problem-tags">${status('Added by the team', 'neutral')}</div></header>
    <div class="problem-body"><div class="problem-text">${ar(a.statement_ar, 'p', 'statement')}<p class="small muted">${esc(a.problemType)} · severity ${a.severity} · note: ${txt((g.added || []).find((x) => x.id === a.id)?.note || '')}</p></div></div>
    <footer class="problem-controls"><input type="hidden" name="decision_${attr(a.id)}" value="confirmed">${button('Remove', { value: `remove-added:${a.id}`, kind: 'quiet', size: 'sm' })}</footer></article>`);

  const side = [
    diagnosis.observations?.length ? section({ title: 'Observations', intro: 'Noticed, but not problems for the proposal.', body: `<ul class="plain-list">${diagnosis.observations.map((o) => `<li>${txt(o.text)}</li>`).join('')}</ul>`, collapsible: true, open: false }) : '',
    diagnosis.missingInfo?.length ? section({ title: 'What the diagnosis could not know', body: `<ul class="plain-list">${diagnosis.missingInfo.map((o) => `<li>${txt(o.question)} <span class="small muted">${txt(o.why)}</span></li>`).join('')}</ul><p class="small muted">If you know any of these, add them to the meeting notes in the brief or answer them under Research; the diagnosis then runs again.</p>`, collapsible: true, open: false }) : '',
    existsSync(p.scorecard) ? section({ title: 'Social media numbers', body: scorecardTables(load(p.scorecard, null), { compact: true }), collapsible: true, open: false }) : '',
    loadBusinessOps(p)?.observations?.length ? section({ title: 'Business needs and risks (internal)', intro: 'What the business analyst found about how the client operates, including matters marketing services do not cover. Nothing is sold from these; they help the team prepare for the meeting.', body: businessNeeds(loadBusinessOps(p).observations), collapsible: true, open: false }) : '',
  ].join('');

  return `${section({ title: 'Progress', body: steps, collapsible: true, open: false })}
  ${approved ? note('Approved. Saving changes again re-opens the approval and the steps after it.', 'ok') : ''}
  <form method="post" action="/c/${attr(slug)}/diagnosis" data-track-dirty>
    ${section({ title: 'Problems', count: diagnosis.problems.length + added.length, intro: `The problem type you confirm decides which catalog service the rule engine proposes; the AI never picks services. Reviewer: ${counts.confirmed} confirmed, ${counts.needs_review || 0} to review, ${counts.rejected || 0} rejected.`, body: `<div class="problems">${cards.join('')}${addedCards.join('')}</div>` })}
    ${load(p.record, null)?.language?.value === 'en' ? note('This client looks English-speaking. Proposals are written in Arabic only for now; for an English proposal, use this research and plan and write it by hand.', 'warn') : ''}
    <div class="approve-bar${approved ? ' is-static' : ''}" role="region" aria-label="Approve diagnosis">
      <div class="approve-info">${field('Arabic style', select('dialect', [['egyptian', 'Egyptian business Arabic'], ['saudi', 'Saudi-friendly white Arabic'], ['msa', 'Simple Modern Standard Arabic']], g.dialect || 'egyptian'))}${errors.length && !approved ? `<p class="small text-warn">${errors.map(esc).join(' · ')}</p>` : ''}</div>
      <div class="btn-row">${button('Save', { value: 'save' })}${approved ? status('Approved', 'done') : button('Approve diagnosis', { value: 'approve', kind: 'primary', confirm: 'Approve the diagnosis? Confirmed problems go into the proposal.' })}</div>
    </div>
  </form>
  ${section({ title: 'Add a problem the AI missed', collapsible: true, open: false, body: `<form method="post" action="/c/${attr(slug)}/diagnosis">
      <div class="field-row">${field('Title (Arabic)', '<input type="text" name="new_title" dir="rtl" lang="ar" required>')}${field('Problem type', select('new_type', types.map((t) => [t.id, t.labelEn]), types[0]?.id))}</div>
      ${field('Statement (Arabic)', '<textarea name="new_statement" dir="rtl" lang="ar" rows="3"></textarea>')}
      <div class="field-row">${field('Severity', select('new_severity', SEVERITY, 2))}${field('Main impact', select('new_impact', ctx.rules.impactCategories.map((c) => [c.id, c.en]), 'conversion'))}</div>
      ${field('How do you know?', '<input type="text" name="new_note" dir="auto" required>', { help: 'Your note becomes the evidence for this problem.' })}
      <div class="form-actions">${button('Add problem', { value: 'add-problem' })}</div>
    </form>` })}
  ${side}`;
}
