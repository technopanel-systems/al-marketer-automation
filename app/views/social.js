// Competitors & social stage: which brands are compared, each profile's capture, the scorecard, and the numbers editor.
import { esc, attr, icon, txt, num, fileUrl, domainOf, shortTime } from '../ui/html.js';
import { section, status, button, linkButton, actionForm, field, select, empty, note, table, stepStatus, grade, minibar, numCell, platformMark } from '../ui/components.js';
import { stepList } from './research.js';
import { load } from '../../pipeline/client.js';
import { loadCompetitors, socialTasks, auditBrands, loadCapture, loadBenchmarks, AUDIT_PLATFORMS, PLATFORM_NAMES } from '../../pipeline/social.js';

const CAPTURE_STATE = { captured: ['Captured', 'done'], todo: ['To capture', 'neutral'], failed: ['Could not read', 'bad'], skipped: ['Skipped', 'neutral'], not_found: ['Not on this platform', 'neutral'] };
const HEALTH = { active: ['Active', 'good'], irregular: ['Irregular', 'mid'], inactive: ['Inactive', 'weak'], no_posts: ['No posts', 'weak'], unknown: ['Unknown', 'na'] };

// Where a value sits against a reference range (or, without one, against the competitors' median).
export function gradeVs(value, { range = null, median = null } = {}) {
  if (value === null || value === undefined) return null;
  if (range && Number.isFinite(range.low) && Number.isFinite(range.high)) {
    if (value < range.low) return ['Below range', 'weak'];
    if (value > range.high) return ['Above range', 'good'];
    return ['In range', 'good'];
  }
  if (Number.isFinite(median) && median > 0) {
    const r = value / median;
    return r >= 1 ? ['At or above rivals', 'good'] : r >= 0.5 ? ['Below rivals', 'mid'] : ['Far below rivals', 'weak'];
  }
  return null;
}
export const recency = (days) => (days === null || days === undefined ? null : days <= 7 ? ['This week', 'good'] : days <= 30 ? [`${days} days ago`, 'mid'] : [`${days} days ago`, 'weak']);
const range = (b, unit = '') => (!b ? '—' : b.low === b.high ? `${b.low}${unit}` : `${b.low}–${b.high}${unit}`);

export function scorecardTables(scorecard, { tasks = null, compact = false } = {}) {
  if (!scorecard?.platforms?.length) return empty('No social media numbers yet. They appear once profiles are captured.');
  const blocks = scorecard.platforms.map((pl) => {
    const withMetrics = pl.rows.filter((r) => r.metrics);
    const maxFollowers = Math.max(0, ...withMetrics.map((r) => r.metrics.followers || 0));
    const maxInteractions = Math.max(0, ...withMetrics.map((r) => r.metrics.avgInteractions || 0));
    const med = pl.competitorMedian;
    const cell = (g) => (g ? `<span class="cell-sub">${grade(g[0], g[1])}</span>` : '');
    const missing = [];
    const rows = pl.rows
      .filter((r) => {
        if (r.metrics) return true;
        if (r.role !== 'client') {
          missing.push(`${r.name} (${(CAPTURE_STATE[r.state]?.[0] || (tasks && !tasks.some((x) => x.brandId === r.brandId && x.platform === pl.platform) ? 'no profile known' : 'not captured')).toLowerCase()})`);
          return false;
        }
        return true;
      })
      .map((r) => {
        const client = r.role === 'client';
        const name = `<b>${txt(r.name)}</b>${client ? ' <span class="tag tag-brand">client</span>' : ''}${r.edited ? ' <span class="tag tag-quiet">reviewed</span>' : ''}`;
        if (!r.metrics) return `<tr class="row-client"><td>${name}</td><td colspan="5" class="muted small">${esc(CAPTURE_STATE[r.state]?.[0] || (tasks && !tasks.some((x) => x.brandId === r.brandId && x.platform === pl.platform) ? 'No profile known — an account that does not exist is a finding too' : 'Not captured'))}</td></tr>`;
        const m = r.metrics;
        const [h, tone] = HEALTH[m.status] || [m.status, 'na'];
        const last = recency(m.daysSinceLastPost);
        return `<tr class="${client ? 'row-client' : ''}">
          <td class="brand-cell">${name}<span class="cell-sub">${grade(h, tone)}</span></td>
          <td class="num">${minibar(m.followers, maxFollowers, { client, text: numCell(m.followers) })}</td>
          <td class="num"><b>${numCell(m.postsPerWeek)}</b>${m.partial ? '<abbr title="The capture covers less than 90 days">*</abbr>' : ''}${client ? cell(gradeVs(m.postsPerWeek, { range: pl.benchmark.postsPerWeek, median: med?.postsPerWeek })) : ''}</td>
          <td class="nowrap">${m.lastPostDate ? `<span class="tabular">${esc(m.lastPostDate)}</span><span class="cell-sub">${last ? grade(last[0], last[1]) : ''}</span>` : '<span class="muted">—</span>'}</td>
          <td class="num">${minibar(m.avgInteractions, maxInteractions, { client, text: numCell(m.avgInteractions) })}</td>
          <td class="num"><b>${numCell(m.engagementRate, '%')}</b>${client ? cell(gradeVs(m.engagementRate, { range: pl.benchmark.engagementRate, median: med?.engagementRate })) : ''}</td>
        </tr>`;
      });
    if (med) rows.push(`<tr class="row-summary"><td>Competitors' median <span class="muted small">(${med.brands})</span></td><td class="num">${numCell(med.followers)}</td><td class="num">${numCell(med.postsPerWeek)}</td><td><span class="muted">—</span></td><td class="num">${numCell(med.avgInteractions)}</td><td class="num">${numCell(med.engagementRate, '%')}</td></tr>`);
    const bench = pl.benchmark.postsPerWeek || pl.benchmark.engagementRate;
    if (bench) rows.push(`<tr class="row-reference"><td>Industry reference</td><td></td><td class="num">${range(pl.benchmark.postsPerWeek)}</td><td></td><td></td><td class="num">${range(pl.benchmark.engagementRate, '%')}</td></tr>`);
    const sources = [pl.benchmark.postsPerWeek?.source, pl.benchmark.engagementRate?.source].filter(Boolean);
    const foot = [missing.length ? `Not in the comparison: ${missing.map(esc).join(' · ')}.` : '', sources.length ? `Reference: ${esc([...new Set(sources)].join(' · '))}` : ''].filter(Boolean);
    return `<h3 class="h3">${platformMark(pl.platform, { size: 18 })} ${esc(pl.name)}</h3>${table(['Brand', ['Followers', 'num'], ['Posts / week', 'num'], 'Last post', ['Interactions', 'num'], ['Engagement', 'num']], rows, { cls: 'table-score' })}${foot.length ? `<p class="small muted table-note">${foot.join('<br>')}</p>` : ''}`;
  });
  return `${blocks.join('')}<p class="small muted">Computed by code from captured posts over the last 90 days. * = the capture covers a shorter period. Engagement = average likes, comments and shares per post divided by followers; public references define it differently, so read them as a range.</p>`;
}

function captureRows(slug, tasks) {
  return tasks.map((x) => {
    const key = `${x.brandId}:${x.platform}`;
    const [label, tone] = CAPTURE_STATE[x.state] || [x.state, 'neutral'];
    const acts = [];
    if (['todo', 'failed'].includes(x.state) && (x.method === 'auto' || x.autoAvailable)) acts.push(button(x.state === 'failed' ? 'Try again' : 'Capture now', { value: `capture-auto:${key}`, kind: x.state === 'failed' ? 'secondary' : 'quiet', size: 'sm' }));
    if (x.method === 'assisted' && x.state !== 'not_found') acts.push(button('Use research browser', { value: `capture-assisted:${key}`, kind: 'quiet', size: 'sm' }));
    acts.push(linkButton(x.state === 'captured' ? 'Review numbers' : 'Type numbers', `/c/${slug}/social/capture?b=${encodeURIComponent(x.brandId)}&pl=${encodeURIComponent(x.platform)}`, { kind: 'quiet', size: 'sm' }));
    if (['skipped', 'not_found'].includes(x.state)) acts.push(button('Undo', { value: `task:${key}:clear`, kind: 'quiet', size: 'sm' }));
    else acts.push(`<details class="menu"><summary class="btn btn-quiet btn-sm">More</summary><div class="menu-list">${button('Not on this platform', { value: `task:${key}:not_found`, kind: 'quiet', size: 'sm' })}${button('Skip this profile', { value: `task:${key}:skipped`, kind: 'quiet', size: 'sm' })}</div></details>`);
    const detail = x.posts !== null && x.state === 'captured' ? `${x.posts} posts · ${esc(shortTime(x.capturedAt))}${x.edited ? ' · reviewed' : ''}` : '';
    return `<tr class="${x.state === 'failed' ? 'row-bad' : x.role === 'client' ? 'row-client' : ''}"><td><div class="client-cell">${platformMark(x.platform, { size: 20 })}<div><b>${esc(PLATFORM_NAMES[x.platform])}</b><div class="small">${txt(x.brandName)}${x.role === 'client' ? ' <span class="tag tag-brand">client</span>' : ''}</div></div></div></td><td class="small">${x.url ? `<a href="${attr(x.url)}" target="_blank" rel="noopener">${esc(x.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '—'}</td><td>${status(label, tone)}<div class="small muted">${detail}</div>${x.error ? `<div class="small text-bad">${esc(x.error)}</div>` : ''}</td><td><div class="btn-row">${acts.join('')}</div></td></tr>`;
  });
}

export function socialPage({ slug, p, state }) {
  const intake = load(p.intake, {});
  const comps = loadCompetitors(p);
  const t = socialTasks(p, intake);
  const scorecard = load(p.scorecard, null);
  const profiles = load(p.clientProfiles, null);
  const confirmed = comps.list.filter((c) => c.status === 'confirmed');
  const brands = auditBrands(p, intake);
  const fix = state.steps['fix-captures'];
  const known = new Set(t.tasks.filter((x) => x.brandId === 'client').map((x) => x.platform));
  const missing = AUDIT_PLATFORMS.filter((pl) => !known.has(pl));
  const industries = Object.entries(loadBenchmarks().industries).map(([k, v]) => [k, v.en]);

  const compared = state.steps.competitors.state === 'not_used'
    ? empty('Competitor comparison is skipped for this proposal. Only the client\'s own profiles are measured.', actionForm(`/c/${slug}/run`, 'Search for competitors', { fields: { step: 'competitors', back: 'social' }, kind: 'secondary', size: 'sm' }))
    : `${state.steps['confirm-competitors'].state === 'open' ? note(`${state.steps['confirm-competitors'].count} AI suggestion(s) still need a decision. <a href="/c/${attr(slug)}/research#competitors">Decide on the Research page</a>.`, 'warn', 'flag') : ''}
       ${confirmed.length ? `<ul class="chips">${confirmed.map((c) => `<li>${txt(c.name)}${c.website ? ` <span class="muted small">${esc(domainOf(c.website))}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No competitors confirmed yet.</p>'}
       <p class="small"><a href="/c/${attr(slug)}/research#competitors">Change competitors</a></p>`;

  const duplicates = profiles?.duplicates?.length
    ? note(`<b>The brand runs more than one account:</b> ${profiles.duplicates.map((d) => `${esc(PLATFORM_NAMES[d.platform])} (${d.accounts.map((u) => `<a href="${attr(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a>`).join(', ')})`).join('; ')}. This is recorded as evidence for the diagnosis.`, 'warn', 'copy')
    : '';

  return `${section({ title: 'Progress', body: stepList(slug, state, ['profiles', 'social'], { back: 'social' }) })}
  ${section({ title: 'Compared brands', body: `${compared}${duplicates}` })}
  ${section({ id: 'captures', title: 'Profiles', count: fix.state === 'open' ? fix.count : null, tone: fix.state === 'open' ? 'you' : '', intro: 'Read automatically from public pages, without any login, at a slow pace. If a platform refuses, try again later, type the numbers, or skip the profile.', body: `<form method="post" action="/c/${attr(slug)}/social">${t.tasks.length ? table(['Profile', 'Link', 'State', ''], captureRows(slug, t.tasks), { cls: 'table-captures' }) : empty('No profiles known yet. Add links in the brief or below.')}</form>
      ${missing.length ? `<p class="small muted">No ${missing.map((x) => PLATFORM_NAMES[x]).join(', ')} profile known for the client. An account that does not exist is a finding too.</p>` : ''}
      <details class="inline-details"><summary>Add or correct a profile link</summary>
        <form method="post" action="/c/${attr(slug)}/social" class="field-row field-row-end">
          ${field('Brand', select('profile_brand', brands.map((b) => [b.id, b.name]), 'client'))}
          ${field('Profile link', '<input type="text" inputmode="url" name="profile_url" placeholder="linkedin.com/company/…">')}
          ${button('Add profile', { value: 'add-profile' })}
        </form>
      </details>` })}
  ${section({ title: 'Scorecard', intro: 'The numbers the diagnosis may quote.', actions: `<form method="post" action="/c/${attr(slug)}/social" class="inline-form field-inline"><label for="industry-select" class="small">Industry</label>${select('industry', industries, intake.industry || 'general', 'id="industry-select"')}${button('Update', { value: 'industry', size: 'sm' })}</form>`, body: scorecardTables(scorecard, { tasks: t.tasks }) })}`;
}

export function captureEditor({ slug, p, brandId, platform }) {
  const intake = load(p.intake, {});
  const brand = auditBrands(p, intake).find((b) => b.id === brandId);
  if (!brand || !AUDIT_PLATFORMS.includes(platform)) return empty('This profile is not part of the audit.');
  const cap = loadCapture(p, brandId, platform) || { posts: [], profile: {} };
  const rows = [...cap.posts, ...Array.from({ length: cap.posts.length ? 6 : 12 }, () => ({}))];
  const types = ['video', 'image', 'carousel', 'text', 'document', 'article', 'other'];
  const numIn = (name, v, label) => `<input type="number" min="0" inputmode="numeric" name="${attr(name)}" value="${attr(v ?? '')}" aria-label="${attr(label)}">`;
  const row = (r, i) => `<tr><td><input type="hidden" name="id_${i}" value="${attr(r.id || '')}"><input type="date" name="date_${i}" value="${attr(r.date ? String(r.date).slice(0, 10) : '')}" aria-label="Date"></td><td>${select(`type_${i}`, types.map((x) => [x, x]), r.type || 'image', 'aria-label="Type"')}</td><td class="num">${numIn(`likes_${i}`, r.likes, 'Likes')}</td><td class="num">${numIn(`comments_${i}`, r.comments, 'Comments')}</td><td class="num">${numIn(`shares_${i}`, r.shares, 'Shares')}</td><td class="num">${numIn(`views_${i}`, r.views, 'Views')}</td><td><input type="text" name="caption_${i}" value="${attr(String(r.caption || '').slice(0, 300))}" dir="auto" aria-label="Caption"></td><td><input type="url" name="link_${i}" value="${attr(r.url || '')}" aria-label="Link"></td><td>${r.id ? `<input type="checkbox" name="remove_${i}" value="1" aria-label="Remove this post">` : ''}</td></tr>`;
  return section({
    title: `${brand.name} · ${PLATFORM_NAMES[platform]}`,
    intro: `${cap.method ? `Captured ${esc(shortTime(cap.capturedAt))} by ${esc(cap.method)}.` : 'Nothing captured yet: type what you see on the profile.'} Correct anything wrong, add missed posts, and tick posts to remove. Saved numbers are marked as reviewed by the team.`,
    body: `${(cap.shots || []).length ? `<ul class="gallery">${cap.shots.map((f) => `<li><a href="${fileUrl(slug, f)}" target="_blank"><img src="${fileUrl(slug, f)}" alt="Capture screenshot" loading="lazy" width="320" height="200"></a></li>`).join('')}</ul>` : ''}
    <form method="post" action="/c/${attr(slug)}/socialcapture" data-track-dirty>
      <input type="hidden" name="b" value="${attr(brandId)}"><input type="hidden" name="pl" value="${attr(platform)}">
      <div class="field-row">${field('Followers', numIn('followers', cap.profile?.followers, 'Followers'))}${field('Posts in total (if shown)', numIn('postsTotal', cap.profile?.postsTotal, 'Posts in total'))}${field('Profile link', `<input type="url" name="url" value="${attr(cap.url || '')}">`)}</div>
      ${table(['Date', 'Type', ['Likes', 'num'], ['Comments', 'num'], ['Shares', 'num'], ['Views', 'num'], 'Caption', 'Link', 'Remove'], rows.map(row), { cls: 'table-editor' })}
      <input type="hidden" name="rows" value="${rows.length}">
      <div class="form-actions">${button('Save numbers', { name: '', kind: 'primary' })}<a class="btn btn-quiet" href="/c/${attr(slug)}/social#captures">Back to profiles</a></div>
    </form>`,
  });
}

export { stepStatus };
