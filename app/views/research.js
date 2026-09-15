// Research stage: the parallel research tracks, the team's input (competitors, questions, optional answers),
// what the research found, and the evidence behind it.
import { join } from 'node:path';
import { esc, attr, icon, txt, ar, fileUrl, domainOf, shortTime, duration } from '../ui/html.js';
import { section, stepStatus, actionForm, button, field, select, segmented, empty, note, table, kv, status } from '../ui/components.js';
import { load, loadSources, loadChecks } from '../../pipeline/client.js';
import { STEPS } from '../../pipeline/steps.js';
import { loadCompetitors } from '../../pipeline/social.js';
import { TEAMS, READINESS_KEYS } from '../../ai/fields.js';

// A list of steps with their state, summary, timing and (in "Advanced") a way to run them again.
export function stepList(slug, state, ids, { back = '' } = {}) {
  const rows = ids.map((id) => {
    const st = state.steps[id];
    const step = STEPS.find((s) => s.id === id);
    const time = st.state === 'running' ? `started ${shortTime(st.startedAt)}` : st.finishedAt ? `${shortTime(st.finishedAt)}${st.durationMs ? ` · ${duration(st.durationMs)}` : ''}` : '';
    const detail = st.state === 'failed' || st.state === 'waiting' ? `<span class="text-bad">${esc(st.error || '')}</span>` : esc(st.summary || '');
    const canRun = ['done', 'stale', 'failed', 'waiting', 'not_used', 'pending'].includes(st.state);
    const run = canRun ? actionForm(`/c/${slug}/run`, st.state === 'failed' || st.state === 'waiting' ? 'Try again' : 'Run again', { fields: { step: id, back }, kind: st.state === 'failed' ? 'danger' : 'quiet', size: 'sm', confirm: step.kind === 'ai' && st.state === 'done' ? `Run "${step.label}" again? It uses your Claude plan, and later steps that used it will run again too.` : '' }) : '';
    const model = step.kind === 'ai' && step.model ? `<span class="model-tag" title="Claude model">${esc(st.lastModel || step.model)}</span>` : '';
    return `<li class="track track-${attr(st.state)}"><div class="track-main"><span class="track-name">${esc(step.label)}${model}</span><span class="track-detail">${detail}</span></div><div class="track-state">${stepStatus(st)}<span class="muted small">${esc(time)}</span>${st.state === 'running' ? '<span class="working-bar" aria-hidden="true"></span>' : ''}</div><div class="track-run">${run}</div></li>`;
  });
  return `<ol class="tracks">${rows.join('')}</ol>`;
}

function competitorsForm(slug, p, state) {
  const doc = loadCompetitors(p);
  const task = state.steps['confirm-competitors'];
  const search = state.steps.competitors;
  if (search.state === 'not_used') return empty('Competitor comparison is skipped for this proposal.', actionForm(`/c/${slug}/run`, 'Search for competitors', { fields: { step: 'competitors', back: 'research' }, kind: 'secondary', size: 'sm' }));
  if (!doc.list.length && search.state !== 'done') return empty(search.state === 'running' ? 'The AI is searching for competitors now. You can confirm them here as soon as it finishes, while the rest of the research continues.' : 'Competitor search starts after the website audit and meeting notes.');
  const cards = doc.list.map((c) => {
    const decision = c.status === 'proposed' ? '' : c.status;
    const who = c.source === 'ai' ? `Suggested by the AI${c.confidence ? `, ${esc(c.confidence)} confidence` : ''}` : 'Added by the team';
    return `<li class="comp${c.status === 'proposed' ? ' comp-open' : ''}">
      <div class="comp-head">
        <div class="comp-id"><span class="comp-name">${txt(c.name)}</span>${c.website ? `<a class="small" href="${attr(c.website)}" target="_blank" rel="noopener">${esc(domainOf(c.website))} ${icon('external-link', { size: 12 })}</a>` : '<span class="small muted">No website</span>'}<span class="small muted">${who}</span></div>
        ${segmented(`status_${c.id}`, [['confirmed', 'Compare', 'done'], ['rejected', 'Not a competitor', 'neutral']], decision, { label: `Decision for ${c.name}` })}
      </div>
      ${c.reason ? `<p class="comp-reason">${txt(c.reason)}</p>` : ''}
      ${c.found?.length || c.socials?.length ? `<p class="small muted">Profiles: ${[...new Set([...(c.socials || []), ...(c.found || [])])].slice(0, 6).map((u) => esc(u.replace(/^https?:\/\/(www\.)?/, ''))).join(' · ')}</p>` : ''}
      <details class="inline-details"><summary>Edit name, website or profiles</summary>
        <div class="field-row">${field('Name', `<input type="text" name="name_${attr(c.id)}" value="${attr(c.name)}" dir="auto">`)}${field('Website', `<input type="text" name="website_${attr(c.id)}" value="${attr(c.website || '')}">`)}</div>
        ${field('Profile links', `<textarea name="socials_${attr(c.id)}" rows="3">${esc((c.socials || []).join('\n'))}</textarea>`, { help: 'One per line. Their website is also searched for profile links.' })}
      </details>
    </li>`;
  });
  const open = task.state === 'open' ? task.count : 0;
  return `<form method="post" action="/c/${attr(slug)}/competitors" data-track-dirty>
    ${open ? note(`<b>${open} competitor${open === 1 ? '' : 's'} to decide.</b> Only competitors you mark <b>Compare</b> are captured and compared. The rest of the research keeps running meanwhile.`, 'warn', 'flag') : ''}
    <ul class="comps">${cards.join('')}</ul>
    <details class="inline-details"><summary>Add a competitor the AI missed</summary>
      <div class="field-row">${field('Name', '<input type="text" name="new_name" dir="auto">')}${field('Website', '<input type="text" name="new_website" placeholder="example.com">')}</div>
      ${field('Profile links', '<input type="text" name="new_socials" placeholder="linkedin.com/company/… instagram.com/…">')}
    </details>
    <div class="form-actions">${button('Save decisions', { value: 'save-competitors', kind: open ? 'primary' : 'secondary' })}</div>
  </form>
  <div class="row-actions">${actionForm(`/c/${slug}/run`, 'Search again', { fields: { step: 'competitors', back: 'research' }, kind: 'quiet', size: 'sm', confirm: 'Search for competitors again? It uses your Claude plan; decisions you made are kept.' })}${actionForm(`/c/${slug}/skip`, 'Skip competitor comparison', { fields: { step: 'competitors' }, kind: 'quiet', size: 'sm', confirm: 'Skip the competitor comparison for this proposal? The diagnosis will not compare the client with competitors.' })}</div>`;
}

function questionsForm(slug, p, state) {
  const q = load(p.questions, { questions: [], needsInput: false });
  const important = q.questions.filter((x) => x.kind === 'field' || x.kind === 'language');
  if (state.steps.record.state !== 'done' && !important.length) return empty('Questions appear when the client record is built, only if the research could not find something important.');
  if (!important.length) return `<p class="muted">The research found everything important. Nothing to answer.</p>`;
  const input = (x) => (x.options ? select(`q:${x.id}`, [['', 'Choose…'], ...x.options.map((o) => [o, o])], x.answer || '') : `<textarea name="q:${attr(x.id)}" rows="2" dir="auto" placeholder="Type the answer, or unknown">${esc(x.answer || '')}</textarea>`);
  return `<form method="post" action="/c/${attr(slug)}/questions" data-track-dirty>
    <ol class="questions">${important.map((x) => `<li class="question${x.answered ? ' is-answered' : ''}">${field(x.en, input(x), { help: `${x.ar ? ar(x.ar) : ''}${x.answered ? ' · answered' : ''}` })}</li>`).join('')}</ol>
    <p class="small muted">Answers are saved as evidence from the Al-Marketer team. Type <b>unknown</b> when nobody knows; the diagnosis then treats it as unknown.</p>
    <div class="form-actions">${button('Save answers', { value: 'save', kind: q.needsInput ? 'primary' : 'secondary' })}</div>
  </form>`;
}

function optionalForm(slug, p) {
  const manual = loadChecks(p).filter((c) => c.manual);
  if (!manual.length) return `<p class="muted">Nothing to answer by hand. Client readiness is on the <a href="/c/${attr(slug)}/brief">Brief</a>.</p>`;
  const manualRows = manual.map((c) => `<tr><td>${esc(c.question)}${c.url ? ` <a href="${attr(c.url)}" target="_blank" rel="noopener" class="small">Open ${icon('external-link', { size: 12 })}</a>` : ''}</td><td>${select(`check:${c.key}`, [['', c.result === 'unknown' ? 'Not checked' : `Keep: ${c.result}`], ['present', 'Yes, found'], ['absent', 'No, not found'], ['value', 'See note']], '', `aria-label="${attr(c.question)}"`)}</td><td><input type="text" name="checkvalue:${attr(c.key)}" value="${attr(c.value || '')}" dir="auto" aria-label="What you saw"></td></tr>`);
  return `<form method="post" action="/c/${attr(slug)}/questions" data-track-dirty>
    <p class="small muted">Open the link, look, and record what you saw. Client readiness is on the <a href="/c/${attr(slug)}/brief">Brief</a>.</p>
    ${table(['Check', 'Result', 'What you saw'], manualRows)}
    <div class="form-actions">${button('Save answers', { value: 'save', kind: 'secondary' })}</div>
  </form>`;
}

function findings(slug, p) {
  const rec = load(p.record, null);
  if (!rec) return empty('Findings appear when the research teams finish.');
  const teams = Object.entries(rec.sections).map(([team, fields]) => {
    const filled = Object.entries(fields).filter(([, list]) => list.length);
    const label = (f) => f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const rows = filled.slice(0, 5).map(([f, list]) => [label(f), list.slice(0, 2).map((x) => txt(x.value)).join('<br>')]);
    return `<div class="finding"><h3 class="h3">${esc(TEAMS[team].label)} <span class="muted small">${filled.length}/${Object.keys(fields).length} fields</span></h3>${rows.length ? kv(rows) : '<p class="muted small">Nothing verified yet.</p>'}</div>`;
  });
  const summary = load(join(p.evidenceDir, 'collect-summary.json'), null);
  const profiles = load(p.clientProfiles, null);
  const facts = [
    ['Verified facts', `${rec.factCount} (${rec.fieldsFilled}/${rec.fieldsTotal} fields)`],
    ['Proposal language', esc(rec.language?.value || '')],
    summary?.pageSpeed?.ok ? ['Google PageSpeed (mobile)', `Performance ${summary.pageSpeed.scores.performance} · SEO ${summary.pageSpeed.scores.seo} · Accessibility ${summary.pageSpeed.scores.accessibility}`] : null,
    profiles ? ['Social profiles', profiles.platforms.length ? profiles.platforms.map((x) => esc(x.platform)).join(', ') : 'none found'] : null,
    profiles?.duplicates?.length ? ['More than one account', profiles.duplicates.map((d) => `${esc(d.platform)}: ${d.accounts.length}`).join(' · ')] : null,
  ];
  return `${kv(facts)}<div class="findings">${teams.join('')}</div><p class="row-actions"><a href="/c/${attr(slug)}/record">Full client record</a><a href="/c/${attr(slug)}/evidence">All evidence</a></p>`;
}

export function researchPage({ slug, p, state }) {
  const ids = ['collect', 'notes', 'profiles', 'competitors', 'research', 'record'];
  const compOpen = state.steps['confirm-competitors'].state === 'open';
  const qOpen = state.steps['answer-questions'].state === 'open';
  const optional = state.tasks.find((t) => t.id === 'optional-input');
  // What needs the person comes first; progress and results follow.
  const competitors = section({ id: 'competitors', title: compOpen ? 'Decide on competitors' : 'Competitors', count: compOpen ? state.steps['confirm-competitors'].count : null, tone: compOpen ? 'you' : '', intro: 'The AI suggests direct competitors from web search. Nothing is compared until you confirm it.', body: competitorsForm(slug, p, state) });
  const questions = section({ id: 'questions', title: qOpen ? 'Answer important questions' : 'Important questions', count: qOpen ? state.steps['answer-questions'].count : null, tone: qOpen ? 'you' : '', body: questionsForm(slug, p, state) });
  const progress = section({ id: 'progress', title: 'Progress', intro: 'These run at the same time where they can. You can decide on competitors while the research teams are still working.', body: stepList(slug, state, ids, { back: 'research' }) });
  return `<nav class="subnav" aria-label="On this page">${compOpen ? '<a href="#competitors">Competitors <span class="count count-you">' + state.steps['confirm-competitors'].count + '</span></a>' : ''}${qOpen ? '<a href="#questions">Questions <span class="count count-you">' + state.steps['answer-questions'].count + '</span></a>' : ''}<a href="#progress">Progress</a>${compOpen ? '' : '<a href="#competitors">Competitors</a>'}${qOpen ? '' : '<a href="#questions">Questions</a>'}<a href="#findings">Findings</a><a href="#optional">Manual checks</a></nav>
  ${compOpen ? competitors : ''}${qOpen ? questions : ''}
  ${progress}
  ${compOpen ? '' : competitors}${qOpen ? '' : questions}
  ${section({ id: 'findings', title: 'What the research found', body: findings(slug, p) })}
  ${section({ id: 'optional', title: 'Manual checks', count: optional ? optional.count : null, intro: 'Checks the system could not do by itself. They never hold anything up.', body: load(p.record, null) ? optionalForm(slug, p) : empty('Available after the client record is built.'), collapsible: true, open: false })}`;
}

const CHECK_GROUPS = [
  ['Website', (c) => /^website_|^tech_platform$/.test(c.key)],
  ['Search basics (SEO)', (c) => /^seo_/.test(c.key)],
  ['Speed', (c) => /^perf_|^psi_/.test(c.key)],
  ['Measurement and contact', (c) => /^tech_/.test(c.key)],
  ['Social profiles', (c) => /^social_/.test(c.key)],
  ['Social media numbers', (c) => /^social:/.test(c.key)],
  ['Manual checks', (c) => c.manual],
];
const checkResult = (c) => (c.result === 'present' ? status('Yes', 'done') : c.result === 'absent' ? status('No', 'warn') : c.result === 'unknown' ? status('Unknown', 'neutral') : c.result === 'blocked' ? status('Blocked', 'bad') : txt(c.value || ''));

export function evidencePage({ slug, p }) {
  const sources = loadSources(p);
  const checks = loadChecks(p);
  const shots = sources.flatMap((s) => [s.screenshot, s.mobileScreenshot].filter(Boolean).map((f, i) => ({ f, s, mobile: i === 1 })));
  const used = new Set();
  const groups = CHECK_GROUPS.map(([title, test]) => {
    const list = checks.filter((c) => !used.has(c.id) && test(c));
    list.forEach((c) => used.add(c.id));
    return [title, list];
  });
  const rest = checks.filter((c) => !used.has(c.id));
  if (rest.length) groups.push(['Other', rest]);
  const checkRows = groups.filter(([, list]) => list.length).map(([title, list]) => `<h3 class="h3">${esc(title)} <span class="muted small">${list.length}</span></h3>${table([['ID', 'nowrap'], 'Check', 'Result', ['Checked', 'nowrap']], list.map((c) => `<tr><td class="mono small">${esc(c.id)}</td><td>${esc(c.question)}${c.detail ? `<div class="small muted">${txt(c.detail)}</div>` : ''}</td><td>${checkResult(c)}</td><td class="small muted nowrap">${c.by === 'you' ? 'by the team' : 'automatic'}<br>${esc(String(c.at || '').slice(0, 10))}</td></tr>`), { cls: 'table-checks' })}`).join('');
  return `${section({ title: 'Screenshots', count: shots.length, body: shots.length ? `<ul class="gallery">${shots.map(({ f, s, mobile }) => `<li><a href="${fileUrl(slug, f)}" target="_blank"><img src="${fileUrl(slug, f)}" alt="${attr(`${s.title || s.url}${mobile ? ' (mobile)' : ''}`)}" loading="lazy" width="320" height="200"></a><span class="small">${txt(s.title || domainOf(s.url))}${mobile ? ' · mobile' : ''}</span></li>`).join('')}</ul>` : empty('No screenshots yet.') })}
  ${section({ title: 'Sources', count: sources.length, intro: 'Everything the AI may quote. Quotes in the research and diagnosis are checked word for word against these saved texts.', body: sources.length ? table([['ID', 'nowrap'], 'Kind', 'Page', 'Saved text'], sources.map((s) => `<tr><td class="mono small">${esc(s.id)}</td><td class="small nowrap">${esc(s.kind)}${s.platform ? ` · ${esc(s.platform)}` : ''}</td><td>${s.url && /^https?:/.test(s.url) ? `<a href="${attr(s.url)}" target="_blank" rel="noopener">${txt(s.title || s.url)}</a>` : txt(s.title || s.url)}${s.status !== 'ok' ? ` ${status(s.status, 'bad')}` : ''}</td><td class="small nowrap"><a href="${fileUrl(slug, `evidence/pages/${s.id}.txt`)}" target="_blank">${Number(s.chars).toLocaleString('en-US')} characters</a></td></tr>`)) : empty('No sources yet.') })}
  ${section({ title: 'Checks', count: checks.length, intro: 'Facts measured by code or recorded by the team. The diagnosis cites them by ID.', body: checks.length ? checkRows : empty('No checks yet.') })}`;
}

export function recordPage({ p }) {
  const rec = load(p.record, null);
  if (!rec) return empty('The client record is built after the research teams finish.');
  const sections = Object.entries(rec.sections).map(([team, fields]) => section({
    title: TEAMS[team].label,
    body: table(['Field', 'Verified facts'], Object.entries(fields).map(([f, list]) => `<tr><td class="small" style="width:30%">${esc(TEAMS[team].fields[f] || f)}</td><td>${list.length ? list.map((x) => `<div class="fact">${txt(x.value)} <span class="mono small muted">${esc(x.evidenceId)}</span>${x.quote ? `<div class="quote">${txt(`«${x.quote}»`)}</div>` : ''}</div>`).join('') : '<span class="muted">unknown</span>'}</td></tr>`)),
  }));
  return `<p class="muted">${rec.factCount} verified facts · ${rec.fieldsFilled} of ${rec.fieldsTotal} fields · proposal language: ${esc(rec.language?.value || '')}</p>${sections.join('')}`;
}
