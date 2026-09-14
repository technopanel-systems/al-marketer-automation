// Page renderers for the Control Center.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../engine/catalog/store.js';
import { clientPaths, listClients, load, loadSources, loadChecks, checkText } from '../pipeline/client.js';
import { computeState, STEPS, BLUEPRINT_STATUSES } from '../pipeline/steps.js';
import { engineContext, planFromDisk } from '../pipeline/run.js';
import { gate1Problems, sentFile, addedProblems, gate3Blockers } from '../pipeline/gates.js';
import { factEvidence } from '../pipeline/fact-evidence.js';
import { loadCompetitors, socialTasks, auditBrands, loadCapture, loadBenchmarks, AUDIT_PLATFORMS, PLATFORM_NAMES } from '../pipeline/social.js';
import { TEAMS, READINESS_KEYS } from '../ai/fields.js';
import { esc, ar, attr, chip, field } from './html.js';

const fileUrl = (slug, rel) => `/c/${slug}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;
const runButton = (slug, label, { step = '', back = '', cls = '', confirmText = '' } = {}) =>
  `<form method="post" action="/c/${attr(slug)}/run" style="display:inline"><input type="hidden" name="step" value="${attr(step)}"><input type="hidden" name="back" value="${attr(back)}"><button class="btn ${cls}" data-disable-while-running ${confirmText ? `data-confirm="${attr(confirmText)}"` : ''}>${esc(label)}</button></form>`;
const statusBadge = (s) => `<span class="chip gate">${esc(BLUEPRINT_STATUSES[s]?.en || s)}</span> ${ar(BLUEPRINT_STATUSES[s]?.ar || '')}`;

// ---------- dashboard ----------
export function dashboard(jobs) {
  const ctx = engineContext();
  const rows = listClients()
    .map((slug) => {
      const p = clientPaths(slug);
      const intake = load(p.intake);
      const st = computeState(slug, ctx);
      const job = jobs.get(slug);
      return `<tr><td><a href="/c/${slug}"><b>${esc(intake.name)}</b></a><div class="small muted">${esc(intake.website || 'no website')}</div></td><td>${statusBadge(st.blueprintStatus)}</td><td>${job?.running ? '<span class="chip run">Working…</span>' : nextActionShort(st)}</td><td class="small muted">${esc((intake.createdAt || '').slice(0, 10))}</td></tr>`;
    })
    .join('');
  return `<h1>Clients</h1><p class="muted">Every proposal moves through the Blueprint statuses. Nothing is ever sent to a client by the system.</p>
  ${rows ? `<table><tr><th>Client</th><th>Status</th><th>Next</th><th>Created</th></tr>${rows}</table>` : `<div class="card next"><h3>No clients yet</h3><p>Start with <a href="/new">+ New client</a>: name, website, social links and your meeting notes.</p></div>`}`;
}

function nextActionShort(st) {
  const s = st.steps;
  if (st.needsInput && s.record.state === 'done') return '<span class="chip warn">Answer questions</span>';
  if (st.socialNeedsInput) return '<span class="chip warn">Social media audit needs you</span>';
  const next = st.nextStep;
  if (!next) return '<span class="chip ok">Complete</span>';
  const step = s[next];
  if (step.kind === 'gate') return `<span class="chip gate">${esc(STEPS.find((x) => x.id === next).label)}</span>`;
  if (step.state === 'failed') return `<span class="chip bad">Failed: ${esc(next)}</span>`;
  if (step.state === 'waiting') return `<span class="chip warn">Waiting for AI answer (${esc(next)})</span>`;
  return `<span class="chip todo">Continue: ${esc(STEPS.find((x) => x.id === next).label)}</span>`;
}

// ---------- overview ----------
export function overview({ slug, p, state, job, msg }) {
  const intake = load(p.intake);
  const steps = STEPS.map((s, i) => {
    const st = state.steps[s.id];
    const rerun = s.kind !== 'gate' && ['done', 'stale', 'failed', 'waiting', 'pending'].includes(st.state) ? runButton(slug, st.state === 'done' ? 'Re-run' : 'Run', { step: s.id, cls: 'ghost small', confirmText: s.kind === 'ai' && st.state === 'done' ? 'Run this AI step again? It uses Claude usage and everything after it will need re-running.' : '' }) : '';
    return `<li><span class="n">${i + 1}</span><span><b>${esc(s.label)}</b>${s.model ? ` <span class="small muted">· ${s.model}</span>` : ''}<div class="sum">${esc(st.summary || st.error || '')}${st.requestFile ? `<br>Fallback request: <span class="mono">${esc(st.requestFile)}</span>` : ''}</div></span>${chip(st.state)}<span>${rerun}</span></li>`;
  }).join('');
  return `${msg}
  <div class="row" style="justify-content:space-between"><div class="big-status">Status: ${statusBadge(state.blueprintStatus)}</div><div class="small muted" id="jobstate"></div></div>
  ${nextCard(slug, state, job)}
  <div class="grid2">
    <div class="card"><h3>Pipeline</h3><ul class="steps">${steps}</ul></div>
    <div>
      <div class="card"><h3>Activity</h3><pre class="log" id="joblog">${esc((job?.log || []).join('\n') || 'No job has run since the Control Center started.')}</pre></div>
      <div class="card"><details><summary>Client details (edit)</summary>
      <form method="post" action="/c/${slug}/intake">
        ${field('Name on the cover', `<input type="text" name="displayName" value="${attr(intake.displayName || intake.name)}">`)}
        ${field('Presented to', `<input type="text" name="presentedTo" value="${attr(intake.presentedTo || '')}">`)}
        ${field('Website', `<input type="text" name="website" value="${attr(intake.website || '')}">`)}
        ${field('Social links (one per line)', `<textarea name="socials">${esc((intake.socials || []).join('\n'))}</textarea>`)}
        ${field('Market / country', `<input type="text" name="market" value="${attr(intake.market || '')}">`)}
        ${field('Industry (for social media benchmarks)', industrySelect(intake.industry || 'general'))}
        ${field('Competitors you know (one per line: Name | website | social links)', `<textarea name="competitors" dir="auto">${esc(intake.competitors || '')}</textarea>`)}
        ${field('Known constraints', `<textarea name="constraints">${esc(intake.constraints || '')}</textarea>`)}
        ${field('Meeting notes', `<textarea class="big" name="notes" dir="auto">${esc(existsSync(p.notes) ? readFileSync(p.notes, 'utf8') : '')}</textarea>`)}
        <button class="btn">Save details</button>
      </form></details></div>
    </div>
  </div>`;
}

function nextCard(slug, state, job) {
  const s = state.steps;
  const card = (title, text, action = '') => `<div class="card next"><h3>${title}</h3><p>${text}</p>${action}</div>`;
  if (job?.running) return card('Working…', 'The system is working on this client. This page refreshes by itself when the job finishes. You can close it and come back later.');
  const next = state.nextStep;
  if (!next) return card('Complete ✔', 'The proposal was approved and marked as sent.');
  if (s.record.state === 'done' && state.needsInput) return card('Your answers are needed', 'Some important information could not be found. Answer the questions (or mark them unknown) to continue.', `<a class="btn brandbtn" href="/c/${slug}/questions">Answer questions</a>`);
  if (state.socialNeedsInput) return card('The social media audit needs you', `${state.social.competitorsToReview ? `Confirm or reject ${state.social.competitorsToReview} competitor(s) the AI found. ` : ''}${state.social.waiting ? `${state.social.waiting} profile(s) need a capture in the research browser, or mark them as not on that platform.` : ''}`, `<a class="btn brandbtn" href="/c/${slug}/social">Open the social media audit</a>`);
  if (next === 'gate1') return card('Gate 1 — review the diagnosis', 'Confirm, edit or reject each problem. Only confirmed problems go into the proposal.', `<a class="btn brandbtn" href="/c/${slug}/gate1">Review diagnosis</a>`);
  if (next === 'gate2') return card('Gate 2 — approve the commercial scope', 'The rule engine picked services, deliverables and timing from your catalog. Adjust and approve.', `<a class="btn brandbtn" href="/c/${slug}/gate2">Review scope</a>`);
  if (next === 'gate3') return card('Gate 3 — review the finished proposal', 'Read the slides, check the automated reviews, then approve or ask for changes.', `<a class="btn brandbtn" href="/c/${slug}/gate3">Review proposal</a>`);
  if (next === 'sent') return card('Approved — send it yourself', 'Download the PDF or web file, send it to the client, then mark it as sent.', `<a class="btn brandbtn" href="/c/${slug}/gate3">Files &amp; mark as sent</a>`);
  const st = s[next];
  if (st.state === 'failed') return card(`A step failed: ${esc(st.label)}`, esc(st.error || ''), runButton(slug, 'Try again', { step: next, cls: 'brandbtn' }));
  if (st.state === 'waiting') return card(`Waiting for an AI answer: ${esc(st.label)}`, `${esc(st.error || '')}<br><br>Open Claude Code in this folder and type <b>/run-step</b> — it answers the saved request and continues.`, runButton(slug, 'Check again', { step: next, cls: 'brandbtn' }));
  return card('Ready to continue', `Next: <b>${esc(st.label)}</b>. The system will keep going until it needs you.`, runButton(slug, 'Continue', { cls: 'brandbtn' }));
}

// ---------- questions ----------
export function questions({ slug, p, msg }) {
  const q = load(p.questions, { questions: [] });
  const checks = loadChecks(p);
  const fieldQs = q.questions.filter((x) => x.kind === 'field' || x.kind === 'language');
  // Every readiness item is shown with its current value, so the team can correct what the notes or checks concluded.
  const readinessNow = load(p.readiness, {});
  const answers = load(join(p.recordDir, 'answers.json'), {});
  const readinessQs = Object.entries(READINESS_KEYS).map(([key, label]) => ({ id: `readiness:${key}`, kind: 'readiness', en: `${label}?`, options: ['yes', 'no', 'unknown'], answer: answers[`readiness:${key}`]?.answer ?? null, current: readinessNow[key] }));
  const manual = checks.filter((c) => c.manual);
  const qInput = (x) =>
    x.options
      ? `<select name="q:${attr(x.id)}"><option value="">—</option>${x.options.map((o) => `<option ${x.answer === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : `<textarea name="q:${attr(x.id)}" dir="auto" placeholder="Type the answer, or type unknown">${esc(x.answer || '')}</textarea>`;
  return `${msg}<h1>Questions for you</h1><p class="muted">The research could not prove these from the evidence. Your answers are saved as evidence from the Al-Marketer team. Type <b>unknown</b> if nobody knows.</p>
  <form method="post" action="/c/${slug}/questions">
  <h2>Important information ${q.needsInput ? '<span class="chip warn">needed to continue</span>' : '<span class="chip ok">complete</span>'}</h2>
  ${fieldQs.length ? fieldQs.map((x) => `<div class="card">${field(`${x.en}${x.answered ? ' ✔' : ''}`, qInput(x), x.ar ? ar(x.ar) : '')}</div>`).join('') : '<p class="muted">Nothing missing.</p>'}
  <h2>Client readiness <span class="small muted">(optional — affects timing of ads and other services)</span></h2>
  <div class="grid3">${readinessQs.map((x) => `<div class="card">${field(x.en, qInput(x), x.current ? `Now: <b>${esc(x.current.value)}</b>${x.current.source ? ` (from ${esc(x.current.source)}${x.current.quote ? `: «${esc(x.current.quote)}»` : ''})` : ''}` : '')}</div>`).join('')}</div>
  <h2>Manual checks <span class="small muted">(no free API — open the link, look, record what you saw)</span></h2>
  <table><tr><th>Check</th><th>Result</th><th>What you saw</th></tr>${manual
    .map((c) => `<tr><td>${esc(c.question)}${c.url ? `<div><a href="${attr(c.url)}" target="_blank" rel="noopener">Open ↗</a></div>` : ''}</td><td><select name="check:${attr(c.key)}"><option value="">${c.result === 'unknown' ? 'not checked' : esc(c.result)}</option><option value="present">yes / found</option><option value="absent">no / not found</option><option value="value">see note</option></select></td><td><input type="text" name="checkvalue:${attr(c.key)}" value="${attr(c.value || '')}" dir="auto"></td></tr>`)
    .join('')}</table>
  <div class="row" style="margin-top:16px"><button class="btn ghost" name="action" value="save">Save</button><button class="btn brandbtn" name="action" value="continue" data-disable-while-running>Save &amp; continue</button></div>
  </form>`;
}

// ---------- evidence ----------
export function evidence({ slug, p, msg }) {
  const sources = loadSources(p);
  const checks = loadChecks(p);
  const summary = load(join(p.evidenceDir, 'collect-summary.json'), null);
  const shots = sources.flatMap((s) => [s.screenshot, s.mobileScreenshot].filter(Boolean).map((f) => ({ f, s })));
  return `${msg}<h1>Evidence</h1><p class="muted">Everything the AI is allowed to use. Quotes in the research and diagnosis are checked against these saved texts.</p>
  ${shots.length ? `<div class="card"><h3>Screenshots</h3><div class="shots">${shots.map(({ f, s }) => `<a href="${fileUrl(slug, f)}" target="_blank"><img src="${fileUrl(slug, f)}" title="${attr(s.id)} ${attr(s.url)}"></a>`).join('')}</div></div>` : ''}
  ${summary?.pageSpeed?.ok ? `<div class="card"><h3>Google PageSpeed (mobile)</h3><p>Performance ${summary.pageSpeed.scores.performance}/100 · SEO ${summary.pageSpeed.scores.seo}/100 · Accessibility ${summary.pageSpeed.scores.accessibility}/100</p></div>` : ''}
  <h2>Sources</h2><table><tr><th>ID</th><th>Kind</th><th>Page</th><th>Status</th><th>Text</th></tr>${sources
    .map((s) => `<tr><td class="mono">${s.id}</td><td>${esc(s.kind)}${s.platform ? ` · ${esc(s.platform)}` : ''}</td><td>${s.url && /^https?:/.test(s.url) ? `<a href="${attr(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>` : esc(s.title || s.url)}</td><td>${chip(s.status === 'ok' ? 'done' : 'failed').replace('Done', 'ok').replace('Failed', esc(s.status))}</td><td><a href="${fileUrl(slug, `evidence/pages/${s.id}.txt`)}" target="_blank">${s.chars} chars</a></td></tr>`)
    .join('')}</table>
  <h2>Checks</h2><table><tr><th>ID</th><th>Result</th></tr>${checks.map((c) => `<tr><td class="mono">${c.id}</td><td>${esc(checkText(c).slice(c.id.length + 3))}</td></tr>`).join('')}</table>`;
}

// ---------- record ----------
export function record({ slug, p, msg }) {
  const rec = load(p.record, null);
  if (!rec) return `${msg}<p>The record is built after research.</p>`;
  const readiness = load(p.readiness, {});
  const sections = Object.entries(rec.sections)
    .map(([team, fields]) => `<div class="card"><h3>${esc(TEAMS[team].label)} ${ar(TEAMS[team].labelAr)}</h3><table>${Object.entries(fields)
      .map(([f, list]) => `<tr><td style="width:180px" class="small"><b>${esc(f)}</b></td><td>${list.length ? list.map((x) => `<div dir="rtl" class="ar">${esc(x.value)} <span class="mono muted" dir="ltr">${esc(x.evidenceId)}</span></div>${x.quote ? `<div class="quote small ar" dir="auto">«${esc(x.quote)}»</div>` : ''}`).join('') : '<span class="muted">unknown</span>'}</td></tr>`)
      .join('')}</table></div>`)
    .join('');
  return `${msg}<h1>Client Information Record</h1><p class="muted">${rec.factCount} verified facts · ${rec.fieldsFilled}/${rec.fieldsTotal} fields · proposal language: <b>${esc(rec.language.value)}</b> (${esc(rec.language.source || '')})</p>
  <div class="card"><h3>Readiness</h3><div class="kv">${Object.entries(readiness).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v.value)}${v.source ? ` <span class="muted small">(${esc(v.source)})</span>` : ''}</div>`).join('')}</div></div>
  ${sections}`;
}

// ---------- gate 1 ----------
export function gate1({ slug, p, state, ctx, msg }) {
  const diagnosis = load(p.diagnosis, null);
  if (!diagnosis?.problems) return `${msg}<p>The diagnosis is not ready yet.</p>`;
  const g = load(p.gate1, { decisions: {}, dialect: 'egyptian' });
  const checks = loadChecks(p);
  const types = ctx.rules.problemTypes.types;
  const approved = state.steps.gate1.state === 'approved';
  const errors = gate1Problems(p);
  const cards = diagnosis.problems
    .map((prob) => {
      const d = g.decisions[prob.id] || {};
      const decision = d.decision || (prob.review?.verdict === 'confirmed' ? 'confirmed' : prob.review?.verdict === 'rejected' ? 'rejected' : 'pending');
      const ev = prob.evidence
        .map((e) => (e.kind === 'check' ? `<div class="quote small">${esc(checkText(checks.find((c) => c.id === e.evidenceId) || { id: e.evidenceId, question: '', result: 'unknown', at: '' }))}</div>` : `<div class="quote small ar" dir="auto"><span class="mono" dir="ltr">${esc(e.evidenceId)}</span> «${esc(e.quote)}»</div>`))
        .join('');
      const rv = prob.review;
      return `<div class="card problem ${decision}">
        <div class="row" style="justify-content:space-between"><h3>${prob.id} · ${ar(d.title_ar || prob.title_ar)}</h3><span>${rv ? chip(rv.verdict === 'confirmed' ? 'done' : rv.verdict === 'rejected' ? 'failed' : 'stale').replace(/>[^<]+</, `>Reviewer: ${rv.verdict.replace('_', ' ')}<`) : ''} ${prob.evidenceStatus === 'verified' ? '<span class="chip ok">evidence verified</span>' : '<span class="chip bad">no verified evidence</span>'}</span></div>
        <p class="ar" dir="rtl">${esc(d.statement_ar || prob.statement_ar)}</p>
        ${ev}
        ${prob.flags?.length ? `<div class="flash warn small">${prob.flags.map(esc).join(' · ')}</div>` : ''}
        ${rv ? `<p class="small muted">Independent reviewer: ${esc(rv.reason)}</p>` : ''}
        <p class="small muted">Impact: ${prob.impacts.map((i) => `<b>${esc(i.category)}</b> — <span dir="rtl" class="ar">${esc(i.explanation_ar)}</span>`).join(' · ')}</p>
        <div class="grid3">
          ${field('Decision', `<select name="decision_${prob.id}"><option value="pending" ${decision === 'pending' ? 'selected' : ''}>— decide —</option><option value="confirmed" ${decision === 'confirmed' ? 'selected' : ''}>Confirm — goes into the proposal</option><option value="rejected" ${decision === 'rejected' ? 'selected' : ''}>Reject</option></select>`)}
          ${field('Problem type (decides the service)', `<select name="type_${prob.id}">${types.map((t) => `<option value="${t.id}" ${(d.problemType || prob.problemType) === t.id ? 'selected' : ''}>${esc(t.labelEn)}</option>`).join('')}</select>`)}
          ${field('Severity', `<select name="severity_${prob.id}">${[3, 2, 1].map((n) => `<option value="${n}" ${Number(d.severity || prob.severity) === n ? 'selected' : ''}>${n} — ${['', 'smaller effect', 'clearly reduces results', 'blocks sales or growth'][n]}</option>`).join('')}</select>`)}
        </div>
        <details><summary class="small">Edit wording or add your confirmation note</summary>
          ${field('Title (Arabic)', `<input type="text" name="title_${prob.id}" dir="rtl" value="${attr(d.title_ar || prob.title_ar)}">`)}
          ${field('Statement (Arabic)', `<textarea name="statement_${prob.id}" dir="rtl">${esc(d.statement_ar || prob.statement_ar)}</textarea>`)}
          ${field('Your note (required to confirm a problem without verified evidence)', `<input type="text" name="note_${prob.id}" dir="auto" value="${attr(d.note || '')}">`)}
        </details>
      </div>`;
    })
    .join('');
  return `${msg}<h1>Gate 1 — Diagnosis review</h1>
  <p class="muted">Blueprint rule: evidence before problem, problem before solution. The problem type you confirm decides which catalog service the rule engine proposes — the AI never picks services.</p>
  ${approved ? '<div class="flash ok">Approved. Editing and saving again will require re-approval.</div>' : ''}
  ${diagnosis.observations?.length ? `<div class="card"><h3>Observations (not problems)</h3><ul dir="rtl">${diagnosis.observations.map((o) => `<li class="ar" dir="rtl">${esc(o.text)}</li>`).join('')}</ul></div>` : ''}
  ${diagnosis.missingInfo?.length ? `<div class="card"><h3>Information the diagnosis is missing</h3><ul>${diagnosis.missingInfo.map((o) => `<li dir="auto">${esc(o.question)} <span class="muted small">— ${esc(o.why)}</span></li>`).join('')}</ul><p class="small muted">If you know any of these, add them in Questions or the meeting notes and re-run from the record step.</p></div>` : ''}
  ${existsSync(p.scorecard) ? `<details class="card"><summary><b>Social media scorecard</b> — the numbers the diagnosis could cite (Social media tab)</summary>${scorecardTables(load(p.scorecard, null), { compact: true })}</details>` : ''}
  <form method="post" action="/c/${slug}/gate1">
  ${cards}
  ${addedProblems(g).map((a) => `<div class="card problem confirmed"><div class="row" style="justify-content:space-between"><h3>${a.id} · ${ar(a.title_ar)}</h3><span class="chip">added by the team</span></div><p class="ar" dir="rtl">${esc(a.statement_ar)}</p><p class="small muted">Type: ${esc(a.problemType)} · severity ${a.severity} · note: <span dir="auto">${esc((g.added.find((x) => x.id === a.id) || {}).note)}</span></p><input type="hidden" name="decision_${a.id}" value="confirmed"><button class="btn ghost small" name="action" value="remove-added:${a.id}">Remove</button></div>`).join('')}
  ${load(p.record, null)?.language?.value === 'en' ? '<div class="flash warn">This client looks English-speaking (website or your answer). Version 1 writes proposals in Arabic only. If the client needs an English proposal, use this research, diagnosis and plan and write it by hand.</div>' : ''}
  <div class="card">${field('Arabic style for this proposal', `<select name="dialect">${[['egyptian', 'Egyptian business Arabic (default)'], ['saudi', 'Saudi-friendly white Arabic'], ['msa', 'Simple Modern Standard Arabic']].map(([v, l]) => `<option value="${v}" ${g.dialect === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
  ${errors.length && !approved ? `<div class="flash warn small">Before approving: ${errors.map(esc).join(' · ')}</div>` : ''}
  <div class="row"><button class="btn ghost" name="action" value="save">Save</button><button class="btn okbtn" name="action" value="approve" data-confirm="Approve the diagnosis? Confirmed problems go into the proposal.">Approve diagnosis →</button></div>
  </form>
  <details class="card"><summary>Add a problem the AI missed</summary>
  <form method="post" action="/c/${slug}/gate1">
    <div class="grid2">${field('Title (Arabic)', '<input type="text" name="new_title" dir="rtl">')}${field('Problem type (decides the service)', `<select name="new_type">${types.map((t) => `<option value="${t.id}">${esc(t.labelEn)}</option>`).join('')}</select>`)}</div>
    ${field('Statement (Arabic)', '<textarea name="new_statement" dir="rtl"></textarea>')}
    <div class="grid3">${field('Severity', '<select name="new_severity"><option value="3">3 — blocks sales or growth</option><option value="2" selected>2 — clearly reduces results</option><option value="1">1 — smaller effect</option></select>')}${field('Main impact', `<select name="new_impact">${ctx.rules.impactCategories.map((c) => `<option value="${c.id}">${esc(c.en)}</option>`).join('')}</select>`)}${field('How do you know? (required)', '<input type="text" name="new_note" dir="auto">')}</div>
    <button class="btn" name="action" value="add-problem">Add problem</button>
  </form></details>`;
}

// ---------- gate 2 ----------
export function gate2({ slug, p, state, ctx, msg }) {
  const plan = planFromDisk(p);
  if (!plan) return `${msg}<p>The scope is built after Gate 1 is approved.</p>`;
  const g = load(p.gate2, { optIn: [], remove: [], add: [], phase: {} });
  const approved = state.steps.gate2.state === 'approved';
  const planState = state.steps.plan.state;
  const problems = [...load(p.diagnosis, { problems: [] }).problems, ...addedProblems(load(p.gate1, {}))];
  const titleOf = (id) => problems.find((x) => x.id === id)?.title_ar || id;
  const { scope, schedule, kpis, checks } = plan;
  const groups = scope.groups
    .map((grp) => `<div class="card"><div class="row" style="justify-content:space-between"><h3>${esc(grp.nameEn)} · ${ar(grp.nameAr)}</h3><span>${grp.mandatory ? '<span class="chip">strategic — every contract</span>' : `<span class="chip todo">rank #${grp.rank} · score ${grp.score}</span>`}</span></div>
      ${grp.display === 'offerings' ? `<p class="small">Offerings only: ${grp.targets.map((t) => `${esc(t.nameEn)} ${ar(t.nameAr)}`).join(' · ')}</p>` : ''}
      <p class="small muted">Because of: ${grp.problemIds.length ? grp.problemIds.map((id) => `${id} ${ar(titleOf(id))}`).join(' · ') : 'mandatory foundation (Blueprint: every contract)'}</p>
      <div class="row small">Deliverables: ${scope.deliverables.filter((d) => d.serviceId === grp.serviceId).map((d) => `<span class="chip">${esc(d.nameEn)}${d.kind === 'conditional' ? ' (conditional)' : ''}</span>`).join(' ')}</div>
      ${grp.mandatory ? '' : `<div class="row" style="margin-top:10px"><label class="small"><input type="checkbox" name="remove" value="${attr(grp.serviceId)}" ${g.remove.includes(grp.serviceId) ? 'checked' : ''}> Remove from scope</label>
      <label class="small">Start: <select name="phase:${attr(grp.serviceId)}"><option value="">automatic (${grp.phase === 'P1' ? 'month 1' : 'month 2'})</option><option value="P1" ${g.phase[grp.serviceId] === 'P1' ? 'selected' : ''}>month 1</option><option value="P2" ${g.phase[grp.serviceId] === 'P2' ? 'selected' : ''}>month 2</option></select></label></div>`}
    </div>`)
    .join('');
  const excluded = scope.excluded
    .map((e) => `<div class="card excluded"><label><input type="checkbox" name="optin" value="${attr(e.serviceId)}" ${g.optIn.includes(e.serviceId) ? 'checked' : ''}> <b>Opt in:</b> ${esc(e.nameEn)} ${ar(e.nameAr)}</label><p class="small muted">${e.reason === 'low_capability' ? `Capability ${e.capability ?? 'blank'} (below ${ctx.rules.settings.capabilityMinimumToInclude}) — excluded by default.` : 'Removed by you.'} Needed for: ${e.problemIds.map((id) => `${id} ${ar(titleOf(id))}`).join(' · ')}</p></div>`)
    .join('');
  const removed = g.remove.filter((id) => !scope.groups.some((x) => x.serviceId === id) && !scope.excluded.some((x) => x.serviceId === id));
  const targets = [...ctx.catalog.services.filter((s) => s.active && !s.strategic), ...ctx.catalog.offerings.filter((o) => o.active), ...ctx.catalog.deliverables.filter((d) => d.active && d.kind === 'conditional')];
  const confirmed = scope.problems.map((x) => x.id);
  const month = (m) => `<div class="card"><h3>Month ${m}</h3><ul>${[...new Map(schedule.months[m].map((i) => [i.deliverableId, i])).values()].map((i) => `<li><span class="ar" dir="rtl">${esc(i.nameAr)}</span> <span class="small muted">W${i.startWeek}${i.endWeek !== i.startWeek ? `–${i.endWeek}` : ''}</span></li>`).join('')}</ul></div>`;
  const week = (w) => `<div class="card"><h3>Week ${w}</h3><ul>${[...new Map(schedule.weeks[w].map((i) => [i.deliverableId, i.nameAr])).values()].map((n) => `<li class="ar" dir="rtl">${esc(n)}</li>`).join('')}</ul></div>`;
  const flags = [...scope.flags, ...schedule.flags];
  return `${msg}<h1>Gate 2 — Commercial scope</h1>
  <p class="muted">Chosen by the rule engine from your approved problems and the catalog (no AI). ${approved ? '<b>Approved.</b>' : ''} Plan status: ${chip(planState)}</p>
  ${flags.length ? `<div class="flash warn small">${flags.map((f) => esc(f.message)).join('<br>')}</div>` : ''}
  <form method="post" action="/c/${slug}/gate2">
  <h2>Scope</h2>${groups}
  ${excluded ? `<h2>Needed but excluded</h2>${excluded}` : ''}
  ${removed.length ? `<p class="small">Removed: ${removed.map(esc).join(', ')} <span class="muted">(untick below to restore)</span> ${removed.map((id) => `<input type="hidden" name="remove" value="${attr(id)}">`).join('')}</p>` : ''}
  ${(g.add || []).length ? `<h2>Added by you</h2>${g.add.map((a, i) => `<div class="card"><b>${esc(a.targetId)}</b> — ${esc(a.reason || '')} ${a.problemIds?.length ? `(for ${a.problemIds.join(', ')})` : ''} <label class="small"><input type="checkbox" name="dropadd_${i}"> remove this addition</label></div>`).join('')}` : ''}
  <details class="card"><summary>Add something from the catalog</summary>
    ${field('Service / offering / conditional deliverable', `<select name="add_target"><option value="">—</option>${targets.map((t) => `<option value="${attr(t.id)}">${esc(t.nameEn)} — ${esc(t.nameAr)}</option>`).join('')}</select>`)}
    ${field('For which confirmed problem(s)?', `<select name="add_problems" multiple size="4">${confirmed.map((id) => `<option value="${id}">${id} ${esc(titleOf(id))}</option>`).join('')}</select>`, 'Blueprint: no solution without a problem. If it is not linked to a problem, give a reason.')}
    ${field('Reason', `<input type="text" name="add_reason">`)}
  </details>
  <h2>3-month deliverables map</h2><div class="months">${month(1)}${month(2)}${month(3)}</div>
  ${schedule.afterMonth3.length ? `<p class="small">Continues after month 3: ${schedule.afterMonth3.map((i) => esc(i.nameEn)).join(', ')}</p>` : ''}
  <h2>First 4 weeks</h2><div class="weeks">${week(1)}${week(2)}${week(3)}${week(4)}</div>
  <h2>KPIs</h2><table><tr><th>Scope</th><th>From</th><th>KPIs</th></tr>${kpis.map((k) => `<tr><td>${esc(k.nameEn)}</td><td>week ${k.startWeek}</td><td>${k.items.map((i) => esc(i.en)).join(' · ')}</td></tr>`).join('')}</table>
  <h2>Automated scope checks</h2><ul>${checks.map((c) => `<li>${c.ok ? '✔' : '✖'} <b>${c.id}</b> ${esc(c.message)}</li>`).join('')}</ul>
  <div class="row"><button class="btn ghost" name="action" value="save" data-disable-while-running>Save &amp; recalculate</button><button class="btn okbtn" name="action" value="approve" data-disable-while-running data-confirm="Approve this commercial scope? The proposal will be written from it.">Approve scope →</button></div>
  </form>`;
}

// ---------- gate 3 ----------
const FACT_WARN = new Set(['no_evidence', 'unknown_evidence', 'number_not_in_evidence', 'weak_match']);
const SECTION_NAMES = { business: 'Business', brand: 'Brand', cards: 'card', facts: 'fact', stats: 'number', problems: 'Problems', items: 'item' };
const factLabel = (path) => path.replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`).split('.').map((part) => part.replace(/^[a-z]+/, (w) => SECTION_NAMES[w] || w)).join(' · ');

// Every statement about the client with the evidence it cites — the approver compares meaning, which no automated check does.
function factCheckCard(slug, p, content) {
  const facts = factEvidence(p, content);
  if (!facts.length) return '';
  const needsLook = (f) => f.flags.some((x) => FACT_WARN.has(x.code));
  const sorted = [...facts.filter(needsLook), ...facts.filter((f) => !needsLook(f))];
  const flagged = facts.filter(needsLook).length;
  const evidenceHtml = (e) => {
    const link = e.kind === 'check' || e.kind === 'missing' ? `<span class="mono">${esc(e.id)}</span>` : `<a class="mono" href="${fileUrl(slug, `evidence/pages/${e.id}.txt`)}" target="_blank">${esc(e.id)}</a>`;
    const ext = e.url && /^https?:/.test(e.url) ? ` <a href="${attr(e.url)}" target="_blank" rel="noopener">↗</a>` : '';
    return `<div class="small">${link} ${esc(e.title || e.kind)}${ext}</div>${e.lines.map((l) => `<div class="quote small"><div dir="rtl" class="ar">${esc(l.text)}</div>${l.quote ? `<div dir="auto" class="muted">«${esc(l.quote)}»</div>` : ''}</div>`).join('')}`;
  };
  return `<div class="card"><h3>Fact check — compare before approving</h3>
  <p class="small muted">Every statement about the client in this proposal, next to the evidence it cites. The automated reviews only confirm that the evidence exists — you confirm it says the same thing. ${facts.length} statements${flagged ? ` · <b>${flagged} need a closer look</b>` : ''}.</p>
  <table class="facts"><tr><th>In the proposal</th><th>Evidence it cites</th></tr>${sorted.map((f) => `<tr class="${needsLook(f) ? 'flagged' : ''}"><td><div class="small muted">${esc(factLabel(f.path))}</div><div class="ar" dir="rtl">${esc(f.text)}</div>${f.flags.map((x) => `<span class="chip ${FACT_WARN.has(x.code) ? 'warn' : 'muted'}">${esc(x.message)}</span>`).join(' ')}</td><td>${f.evidence.map(evidenceHtml).join('') || '<span class="muted">none</span>'}</td></tr>`).join('')}</table></div>`;
}

export function gate3({ slug, p, state, msg }) {
  const report = load(join(p.draftDir, 'render-report.json'), null);
  const review = load(p.review, null);
  const g3 = load(p.gate3, {});
  const sent = load(sentFile(p), null);
  const approved = state.steps.gate3.state === 'approved';
  if (!report) return `${msg}<h1>Gate 3 — Proposal</h1><p>The proposal is written and designed after Gate 2 is approved.</p>${state.steps.write.state === 'running' || state.steps.render.state === 'running' ? '<p>Working on it now…</p>' : ''}<pre class="log" id="joblog"></pre>`;
  const failing = review ? [...review.contentChecks.filter((c) => c.level === 'error' && !c.ok), ...review.scopeChecks.filter((c) => !c.ok)] : [];
  const warnings = review ? review.contentChecks.filter((c) => c.level === 'warning' && !c.ok) : [];
  const lr = review?.languageReview;
  const content = load(p.content, {});
  const blockers = approved ? [] : gate3Blockers(p, { gateState: state.steps.gate3.state });
  return `${msg}<h1>Gate 3 — Map &amp; proposal</h1>
  ${sent ? `<div class="flash ok">Sent on ${esc(sent.sentAt.slice(0, 10))} (version ${esc(sent.version)}).</div>` : approved ? `<div class="flash ok">Approved — version ${esc(g3.version)}.</div>` : ''}
  <div class="row">
    <a class="btn" href="${fileUrl(slug, 'output/draft/proposal-draft.html')}" target="_blank">Open web version ↗</a>
    <a class="btn ghost" href="${fileUrl(slug, 'output/draft/proposal-draft.pdf')}" target="_blank">Open PDF ↗</a>
    ${g3.version ? `<a class="btn ghost" href="${fileUrl(slug, g3.pdf)}?download">Download approved PDF v${esc(g3.version)}</a><a class="btn ghost" href="${fileUrl(slug, g3.html)}?download">Download approved web file</a>` : ''}
  </div>
  <p class="small muted">${report.slides.length} slides · layout checks ${report.ok ? 'pass' : 'have issues'} · fonts ${report.fontsLoaded ? 'embedded' : 'NOT loaded'}</p>
  <div class="slides">${report.previews.map((f) => `<a href="${fileUrl(slug, f)}" target="_blank"><img src="${fileUrl(slug, f)}" loading="lazy"></a>`).join('')}</div>
  <h2>Automated reviews</h2>
  ${failing.length ? `<div class="flash bad">${failing.map((c) => `<b>${c.id}</b> ${esc(c.message)}`).join('<br>')}</div>` : '<div class="flash ok">All blocking checks pass (content, scope, language rules, numbers, guarantees, names).</div>'}
  ${warnings.length ? `<div class="flash warn small">${warnings.map((c) => `<b>${c.id}</b> ${esc(c.message)}`).join('<br>')}</div>` : ''}
  ${report.issues?.length ? `<div class="flash warn small">Layout: ${report.issues.map((i) => `slide ${i.slide} ${esc(i.type)} ${esc(i.text || '')}`).join('<br>')}</div>` : ''}
  ${factCheckCard(slug, p, content)}
  ${lr ? `<div class="card"><h3>Language review (advisory, Sonnet)</h3><p>Clarity for a non-marketer: <b>${lr.clarityForNonMarketer}/5</b> · dialect consistent: <b>${lr.dialectConsistent ? 'yes' : 'no'}</b></p>${lr.issues.length ? `<table><tr><th>Where</th><th>Text</th><th>Issue</th><th>Suggestion</th></tr>${lr.issues.map((i) => `<tr><td class="small">${esc(i.section)}</td><td class="ar" dir="rtl">${esc(i.quote)}</td><td class="small">${esc(i.issue)}</td><td class="ar" dir="rtl">${esc(i.suggestion)}</td></tr>`).join('')}</table>` : '<p>No issues reported.</p>'}</div>` : review?.languageError ? `<div class="flash warn small">Language review did not run: ${esc(review.languageError)}</div>` : ''}
  <div class="grid2">
    <form class="card" method="post" action="/c/${slug}/gate3"><h3>Ask for changes</h3><p class="small muted">Write what to change (e.g. «خلي العنوان أقصر»، "mention the Saudi test more clearly"). The AI rewrites, checks and redesigns; names, scope and timing stay as approved.</p>
      <textarea name="revision" id="revision" dir="auto">${esc(g3.revisionNotes || '')}</textarea>${lr?.issues?.length ? `<button type="button" class="btn ghost small" style="margin-top:8px" onclick="document.getElementById('revision').value = ${attr(JSON.stringify(lr.issues.map((i) => `- «${i.quote}» → ${i.suggestion}`).join('\n')))}">Use the language reviewer's suggestions</button>` : ''}<div class="row" style="margin-top:8px"><button class="btn" name="action" value="revise" data-disable-while-running>Rewrite with these notes</button></div></form>
    <form class="card" method="post" action="/c/${slug}/gate3"><h3>Approve</h3><p class="small muted">Approving saves the final PDF and web file with a version number. The system never sends anything — you send it.</p>
      ${blockers.length ? `<div class="flash warn small">${blockers.map(esc).join('<br>')}</div>` : ''}
      ${approved ? '' : '<label class="small check"><input type="checkbox" name="factsChecked" value="yes" required> I compared every fact in the fact check with its evidence</label>'}
      <button class="btn okbtn" name="action" value="approve" ${blockers.length || approved ? 'disabled' : ''} data-confirm="Approve this proposal as final?">Approve proposal ✔</button>
      ${approved && !sent ? `<hr><input type="text" name="sentnote" placeholder="optional note (e.g. sent by WhatsApp to the client)"><div class="row" style="margin-top:8px"><button class="btn brandbtn" name="action" value="sent">Mark as sent</button></div>` : ''}
    </form>
  </div>
  <details class="card"><summary>Edit the text directly (advanced)</summary><p class="small muted">Edit the JSON text and save; the automated reviews and design run again. Names, map, weeks and KPIs are not in this text — they come from the approved scope.</p>
  <form method="post" action="/c/${slug}/gate3"><textarea class="code" name="content">${esc(JSON.stringify(content, null, 2))}</textarea><div class="row" style="margin-top:8px"><button class="btn" name="action" value="save-content" data-disable-while-running>Save text &amp; redesign</button></div></form></details>`;
}

// ---------- other pages ----------
export function newClient() {
  return `<h1>New client</h1><p class="muted">Only the minimum — the system researches the rest (Blueprint: least input, widest research).</p>
  <form method="post" action="/new" class="card">
    <div class="grid2">
      <div>
        ${field('Client name *', '<input type="text" name="name" required>')}
        ${field('Name as it should appear on the cover', '<input type="text" name="displayName">', 'Leave empty to use the client name.')}
        ${field('Presented to', '<input type="text" name="presentedTo" dir="auto">', 'e.g. م. سامح — Hijab Store')}
        ${field('Website', '<input type="text" name="website" placeholder="https://…">')}
        ${field('Social links (one per line)', '<textarea name="socials" placeholder="https://instagram.com/…"></textarea>')}
        ${field('Market / country', '<input type="text" name="market" placeholder="e.g. Saudi Arabia">')}
        ${field('Industry (for social media benchmarks)', industrySelect('general'))}
        ${field('Competitors you already know (optional, one per line)', '<textarea name="competitors" dir="auto" placeholder="Name | website | social links"></textarea>', 'The AI also looks for competitors; you confirm its suggestions on the Social media tab.')}
        ${field('Known constraints', '<textarea name="constraints" dir="auto"></textarea>')}
      </div>
      <div>${field('Meeting notes', '<textarea class="big" name="notes" dir="auto" style="min-height:480px" placeholder="Paste your notes from the meeting — Arabic or English."></textarea>', 'Goals, products, budget, what they tried, constraints, anything the client said.')}</div>
    </div>
    <button class="btn brandbtn">Create &amp; start research</button>
  </form>`;
}

export function catalogPage(msg, kind) {
  const source = load(join(ROOT, 'catalog', 'notion-source.json'), {});
  const doc = load(join(ROOT, 'catalog', 'catalog.json'), { meta: {} });
  return `${msg ? `<div class="flash ${esc(kind)}"><pre style="white-space:pre-wrap;margin:0">${esc(msg)}</pre></div>` : ''}<h1>Catalog &amp; rules</h1>
  <div class="card"><p>The proposal engine reads only the <b>local catalog</b> (<span class="mono">catalog/catalog.json</span>, also as CSV in <span class="mono">catalog/csv/</span>). Notion is where you edit it.</p>
  <p class="small muted">Last update: ${esc(doc.meta.updatedAt || '')} · source: ${esc(doc.meta.source || '')} · ${doc.services?.length || 0} services, ${doc.offerings?.length || 0} offerings, ${doc.deliverables?.length || 0} deliverables</p>
  <form method="post" action="/catalog/run" class="row"><button class="btn" name="action" value="pull">Update from Notion</button><button class="btn ghost" name="action" value="import">Import edited CSV files</button><button class="btn ghost" name="action" value="export">Export CSV files</button>${source.notionPage ? `<a class="btn ghost" href="${attr(source.notionPage)}" target="_blank" rel="noopener">Open Notion catalog ↗</a>` : ''}<a class="btn ghost" href="/catalog/report" target="_blank">Full catalog &amp; rules report ↗</a></form></div>
  <div class="card"><h3>Rule tables</h3><p class="small">The engine decides with these files in <span class="mono">rules/</span>: problem types → services, timing, KPIs, dependencies and settings. They are shown in the full report.</p></div>`;
}

export function help() {
  const file = join(ROOT, 'docs', 'how-to-use.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : 'See docs/how-to-use.md';
  return `<h1>How to use</h1><div class="card"><pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(text)}</pre></div>`;
}

// ---------- social media audit ----------
const TASK_STATE = { captured: ['Captured', 'ok'], todo: ['To capture', 'warn'], failed: ['Could not capture', 'bad'], skipped: ['Skipped', 'muted'], not_found: ['Not on this platform', 'muted'] };
const METHOD_LABEL = { auto: 'Automatic (no login)', assisted: 'You browse in the research browser — the app records', manual: 'Type the numbers' };
const STATUS_LABEL = { active: ['Active', 'ok'], irregular: ['Irregular', 'warn'], inactive: ['Inactive', 'bad'], no_posts: ['No posts', 'bad'], unknown: ['Unknown', 'muted'] };
const num = (n, suffix = '') => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('en-US')}${suffix}`);
const refRange = (b, unit = '') => (!b ? '—' : b.low === b.high ? `${b.low}${unit}` : `${b.low}–${b.high}${unit}`);

function industrySelect(value) {
  const industries = loadBenchmarks().industries;
  return `<select name="industry">${Object.entries(industries).map(([k, v]) => `<option value="${attr(k)}" ${k === value ? 'selected' : ''}>${esc(v.en)}</option>`).join('')}</select>`;
}

export function scorecardTables(scorecard, { compact = false, tasks = null } = {}) {
  if (!scorecard?.platforms?.length) return '<p class="muted">No social media data captured yet.</p>';
  const tables = scorecard.platforms.map((pl) => {
    const rows = pl.rows.filter((r) => !compact || r.role === 'client' || r.metrics);
    const cells = (r) =>
      r.metrics
        ? `<td>${num(r.metrics.followers)}</td><td>${num(r.metrics.postsPerWeek)}${r.metrics.partial ? '*' : ''}</td><td>${r.metrics.lastPostDate ? `${esc(r.metrics.lastPostDate)} <span class="muted small">(${r.metrics.daysSinceLastPost} d)</span>` : '—'}</td><td>${num(r.metrics.avgInteractions)}</td><td>${num(r.metrics.engagementRate, '%')}</td><td><span class="chip ${STATUS_LABEL[r.metrics.status]?.[1] || 'muted'}">${esc(STATUS_LABEL[r.metrics.status]?.[0] || r.metrics.status)}</span></td>`
        : `<td colspan="6" class="muted small">${esc(TASK_STATE[r.state]?.[0] || (tasks && !tasks.some((x) => x.brandId === r.brandId && x.platform === pl.platform) ? 'No profile known' : 'Not captured'))}</td>`;
    const med = pl.competitorMedian;
    const bench = pl.benchmark.postsPerWeek || pl.benchmark.engagementRate;
    return `<h4 style="margin:14px 0 6px">${esc(pl.name)}</h4><div style="overflow-x:auto"><table><tr><th>Brand</th><th>Followers</th><th>Posts / week (90 days)</th><th>Last post</th><th>Avg interactions / post</th><th>Engagement (by followers)</th><th>Status</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.name)} ${r.role === 'client' ? '<span class="chip gate">client</span>' : ''}${r.edited ? ' <span class="chip muted">reviewed</span>' : ''}</td>${cells(r)}</tr>`).join('')}
      ${med ? `<tr class="muted"><td>Competitors' median (${med.brands})</td><td>${num(med.followers)}</td><td>${num(med.postsPerWeek)}</td><td>—</td><td>${num(med.avgInteractions)}</td><td>${num(med.engagementRate, '%')}</td><td></td></tr>` : ''}
      ${bench ? `<tr class="muted small"><td>Reference (${esc(scorecard.industry)})</td><td></td><td>${refRange(pl.benchmark.postsPerWeek)}</td><td></td><td></td><td>${refRange(pl.benchmark.engagementRate, '%')}</td><td>${esc([pl.benchmark.postsPerWeek?.source, pl.benchmark.engagementRate?.source].filter(Boolean).join(' · '))}</td></tr>` : ''}
      </table></div>`;
  });
  return `${tables.join('')}<p class="small muted">Numbers are computed by code from captured posts. * = the capture covered less than 90 days. Engagement = average likes + comments + shares per post ÷ followers; public benchmarks use different definitions, so treat them as a reference range.</p>`;
}

export function social({ slug, p, state, msg }) {
  const intake = load(p.intake, {});
  const comps = loadCompetitors(p);
  const t = socialTasks(p, intake);
  const scorecard = load(p.scorecard, null);
  const s = state.steps;
  const brands = auditBrands(p, intake);
  const knownPlatforms = new Set(t.tasks.filter((x) => x.brandId === 'client').map((x) => x.platform));
  const missingClient = ['linkedin', 'instagram', 'tiktok', 'facebook', 'snapchat', 'x', 'youtube'].filter((pl) => !knownPlatforms.has(pl));
  const btn = (action, label, cls = 'ghost small') => `<button class="btn ${cls}" name="action" value="${attr(action)}" data-disable-while-running>${esc(label)}</button>`;
  const decisionSelect = (c) => `<select name="status_${attr(c.id)}">${c.status === 'proposed' ? '<option value="">— decide —</option>' : ''}<option value="confirmed" ${c.status === 'confirmed' ? 'selected' : ''}>Compare with this competitor</option><option value="rejected" ${c.status === 'rejected' ? 'selected' : ''}>Not a competitor</option></select>`;

  const taskRow = (x) => {
    const key = `${x.brandId}:${x.platform}`;
    const actions = [];
    if (['todo', 'failed'].includes(x.state) && x.method === 'auto') actions.push(btn(`capture-auto:${key}`, 'Capture now', 'small'));
    else if (x.state === 'failed' && x.autoAvailable) actions.push(btn(`capture-auto:${key}`, 'Try automatic again'));
    if (x.method === 'assisted' && x.state !== 'not_found') actions.push(btn(`capture-assisted:${key}`, x.state === 'captured' ? 'Capture again in browser' : 'Capture in research browser', x.state === 'captured' ? 'ghost small' : 'small brandbtn'));
    actions.push(`<a class="btn ghost small" href="/c/${slug}/social/capture?b=${encodeURIComponent(x.brandId)}&pl=${encodeURIComponent(x.platform)}">${x.state === 'captured' ? 'Review numbers' : 'Type numbers'}</a>`);
    if (['skipped', 'not_found'].includes(x.state)) actions.push(btn(`task:${key}:clear`, 'Undo'));
    else {
      actions.push(btn(`task:${key}:not_found`, 'Not on this platform'));
      actions.push(btn(`task:${key}:skipped`, 'Skip'));
    }
    const detail = x.posts !== null ? `<div class="small muted">${x.posts} posts · ${esc(String(x.capturedAt || '').slice(0, 10))}${x.edited ? ' · reviewed' : ''}</div>` : '';
    const error = x.error ? `<div class="small" style="color:var(--bad)">${esc(x.error)}</div>` : '';
    const link = x.url ? `<a href="${attr(x.url)}" target="_blank" rel="noopener">${esc(x.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '—';
    return `<tr><td>${esc(x.brandName)} ${x.role === 'client' ? '<span class="chip gate">client</span>' : ''}</td><td>${esc(PLATFORM_NAMES[x.platform])}</td><td class="small">${link}</td><td class="small">${esc(METHOD_LABEL[x.method])}</td><td><span class="chip ${TASK_STATE[x.state][1]}">${TASK_STATE[x.state][0]}</span>${detail}${error}</td><td><div class="row" style="gap:6px;flex-wrap:wrap">${actions.join('')}</div></td></tr>`;
  };

  const competitorRow = (c) => {
    const found = c.found?.length ? `<div class="small muted">Found on their website: ${c.found.map((u) => esc(u.replace(/^https?:\/\/(www\.)?/, ''))).join(', ')}</div>` : '';
    const source = c.source === 'ai' ? `Suggested by AI${c.confidence ? ` · ${esc(c.confidence)} confidence` : ''}` : 'Added by the team';
    return `<tr><td><input type="text" name="name_${attr(c.id)}" value="${attr(c.name)}" dir="auto"><div class="small muted">${source}</div></td><td><input type="text" name="website_${attr(c.id)}" value="${attr(c.website || '')}"></td><td><textarea name="socials_${attr(c.id)}" style="min-height:70px">${esc((c.socials || []).join('\n'))}</textarea>${found}</td><td class="small" dir="auto">${esc(c.reason || '')}</td><td>${decisionSelect(c)}</td></tr>`;
  };

  const waitingText = [t.competitorsToReview ? `${t.competitorsToReview} competitor(s) to confirm` : '', t.waiting ? `${t.waiting} capture(s) waiting for you` : ''].filter(Boolean).join(' · ');

  return `${msg}<h1>Social media audit</h1>
  <p class="muted">The client and its competitors are compared on the same numbers — posting rhythm, engagement and formats over the last 90 days. The numbers are computed by code; the diagnosis can only cite them.</p>
  <div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
    <div>Competitor search: ${s.competitors.state === 'not_used' ? '<span class="chip todo">Not run yet</span>' : chip(s.competitors.state)} &nbsp; Audit: ${s.social.state === 'not_used' ? '<span class="chip todo">Not run yet</span>' : chip(s.social.state)}${waitingText ? ` &nbsp; <b>${waitingText}</b>` : ''}</div>
    <div class="row" style="gap:6px">${runButton(slug, 'Find competitors again', { step: 'competitors', back: 'social', cls: 'ghost small' })}${runButton(slug, 'Update the audit', { step: 'social', back: 'social', cls: 'small' })}${!t.needsInput && s.social.state === 'done' ? runButton(slug, 'Continue pipeline', { back: 'social', cls: 'brandbtn small' }) : ''}</div>
  </div></div>

  <form class="card" method="post" action="/c/${slug}/social"><h3>1 · Competitors</h3>
    <p class="small muted">Competitors you listed are compared automatically. The AI's suggestions are compared only after you confirm them.</p>
    ${comps.list.length ? `<div style="overflow-x:auto"><table><tr><th>Competitor</th><th>Website</th><th>Profiles (one per line)</th><th>Why</th><th>Decision</th></tr>${comps.list.map(competitorRow).join('')}</table></div>` : '<p>No competitors yet.</p>'}
    <div class="grid3" style="margin-top:10px">${field('Add a competitor', '<input type="text" name="new_name" placeholder="Name" dir="auto">')}${field('Website', '<input type="text" name="new_website" placeholder="example.com">')}${field('Profiles', '<input type="text" name="new_socials" placeholder="linkedin.com/company/… instagram.com/…">')}</div>
    <div class="row" style="gap:8px">${btn('save-competitors', 'Save competitors', 'brandbtn')}</div>
    <hr><div class="row" style="gap:8px;align-items:end">${field('Industry (sets the reference ranges)', industrySelect(intake.industry || 'general'))}${btn('industry', 'Save industry')}</div>
  </form>

  <form class="card" method="post" action="/c/${slug}/social"><h3>2 · Capture the profiles</h3>
    <p class="small muted"><b>Research browser:</b> a separate Chrome window with its own profile, logged into the agency's research accounts — never a personal account. The first time on each platform, log in there once. Open a profile, scroll at normal speed until the panel says 3 months are covered, then press <b>Done — save</b>. Nothing is posted, liked or followed.</p>
    ${t.tasks.length ? `<div style="overflow-x:auto"><table><tr><th>Brand</th><th>Platform</th><th>Profile</th><th>How</th><th>State</th><th></th></tr>${t.tasks.map(taskRow).join('')}</table></div>` : `<p class="muted">No profiles known yet. Add the client's and competitors' profiles below.</p>`}
    ${missingClient.length ? `<p class="small muted">No ${missingClient.map((x) => PLATFORM_NAMES[x]).join(', ')} profile known for ${esc(intake.displayName || intake.name)}. If they have one, add it below — or leave it: an absent account is a finding too.</p>` : ''}
    <div class="row" style="gap:8px;align-items:end;flex-wrap:wrap"><label class="field"><span class="lbl">Add or fix a profile for</span><select name="profile_brand">${brands.map((b) => `<option value="${attr(b.id)}">${esc(b.name)}</option>`).join('')}</select></label><label class="field" style="flex:1;min-width:260px"><span class="lbl">Profile link</span><input type="text" name="profile_url" placeholder="https://www.linkedin.com/company/…"></label>${btn('add-profile', 'Add profile')}</div>
  </form>

  <div class="card"><h3>3 · Scorecard</h3>${scorecardTables(scorecard, { tasks: t.tasks })}</div>`;
}

export function socialCapture({ slug, p, brandId, platform }) {
  const intake = load(p.intake, {});
  const brand = auditBrands(p, intake).find((b) => b.id === brandId);
  if (!brand || !AUDIT_PLATFORMS.includes(platform)) return '<p>Not found.</p>';
  const cap = loadCapture(p, brandId, platform) || { posts: [], profile: {} };
  const rows = [...cap.posts, ...Array.from({ length: cap.posts.length ? 6 : 12 }, () => ({}))];
  const types = ['video', 'image', 'carousel', 'text', 'document', 'article', 'other'];
  const cellNum = (name, v) => `<input type="number" min="0" name="${name}" value="${v ?? ''}" style="width:90px">`;
  const intro = cap.method ? `Captured ${esc(String(cap.capturedAt || '').slice(0, 16).replace('T', ' '))} by ${esc(cap.method)}.` : 'Nothing captured yet — type what you see on the profile.';
  const row = (r, i) => `<tr><td><input type="hidden" name="id_${i}" value="${attr(r.id || '')}"><input type="date" name="date_${i}" value="${attr(r.date ? String(r.date).slice(0, 10) : '')}"></td><td><select name="type_${i}">${types.map((x) => `<option ${x === (r.type || 'image') ? 'selected' : ''}>${x}</option>`).join('')}</select></td><td>${cellNum(`likes_${i}`, r.likes)}</td><td>${cellNum(`comments_${i}`, r.comments)}</td><td>${cellNum(`shares_${i}`, r.shares)}</td><td>${cellNum(`views_${i}`, r.views)}</td><td><input type="text" name="caption_${i}" value="${attr(String(r.caption || '').slice(0, 300))}" dir="auto"></td><td><input type="text" name="link_${i}" value="${attr(r.url || '')}"></td><td>${r.id ? `<input type="checkbox" name="remove_${i}" value="1">` : ''}</td></tr>`;
  return `<h1>${esc(brand.name)} · ${esc(PLATFORM_NAMES[platform])} — review numbers</h1>
  <p class="muted">${intro} Fix anything that looks wrong, add posts that were missed, and remove rows that are not posts. Saved numbers are marked "reviewed by the team".</p>
  ${(cap.shots || []).length ? `<div class="shots">${cap.shots.map((f) => `<a href="${fileUrl(slug, f)}" target="_blank"><img src="${fileUrl(slug, f)}"></a>`).join('')}</div>` : ''}
  <form method="post" action="/c/${slug}/socialcapture" class="card">
    <input type="hidden" name="b" value="${attr(brandId)}"><input type="hidden" name="pl" value="${attr(platform)}">
    <div class="grid3">${field('Followers', cellNum('followers', cap.profile?.followers))}${field('Posts in total (if shown)', cellNum('postsTotal', cap.profile?.postsTotal))}${field('Profile link', `<input type="text" name="url" value="${attr(cap.url || '')}">`)}</div>
    <div style="overflow-x:auto"><table><tr><th>Date</th><th>Type</th><th>Likes / reactions</th><th>Comments</th><th>Shares / reposts</th><th>Views</th><th>Caption (first words)</th><th>Link</th><th>Remove</th></tr>
    ${rows.map(row).join('')}
    </table></div><input type="hidden" name="rows" value="${rows.length}">
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn brandbtn">Save numbers</button><a class="btn ghost" href="/c/${slug}/social">Back</a></div>
  </form>`;
}
