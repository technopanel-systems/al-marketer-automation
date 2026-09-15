// Competitors & social stage: which brands are compared, each profile's capture, the scorecard, and the numbers editor.
import { esc, attr, icon, txt, num, fileUrl, domainOf, shortTime } from '../ui/html.js';
import { section, status, button, linkButton, actionForm, field, select, empty, note, table, stepStatus } from '../ui/components.js';
import { stepList } from './research.js';
import { load } from '../../pipeline/client.js';
import { loadCompetitors, socialTasks, auditBrands, loadCapture, loadBenchmarks, AUDIT_PLATFORMS, PLATFORM_NAMES } from '../../pipeline/social.js';

const CAPTURE_STATE = { captured: ['Captured', 'done'], todo: ['To capture', 'neutral'], failed: ['Could not read', 'bad'], skipped: ['Skipped', 'neutral'], not_found: ['Not on this platform', 'neutral'] };
const HEALTH = { active: ['Active', 'done'], irregular: ['Irregular', 'warn'], inactive: ['Inactive', 'bad'], no_posts: ['No posts', 'bad'], unknown: ['Unknown', 'neutral'] };
const range = (b, unit = '') => (!b ? '—' : b.low === b.high ? `${b.low}${unit}` : `${b.low}–${b.high}${unit}`);

export function scorecardTables(scorecard, { tasks = null, compact = false } = {}) {
  if (!scorecard?.platforms?.length) return empty('No social media numbers yet. They appear once profiles are captured.');
  const blocks = scorecard.platforms.map((pl) => {
    const rows = pl.rows
      .filter((r) => !compact || r.role === 'client' || r.metrics)
      .map((r) => {
        const name = `${txt(r.name)}${r.role === 'client' ? ' <span class="tag">client</span>' : ''}${r.edited ? ' <span class="tag tag-quiet">reviewed</span>' : ''}`;
        if (!r.metrics) return `<tr><td>${name}</td><td colspan="6" class="muted small">${esc(CAPTURE_STATE[r.state]?.[0] || (tasks && !tasks.some((x) => x.brandId === r.brandId && x.platform === pl.platform) ? 'No profile known' : 'Not captured'))}</td></tr>`;
        const m = r.metrics;
        const [h, tone] = HEALTH[m.status] || [m.status, 'neutral'];
        return `<tr><td>${name}</td><td class="num">${num(m.followers)}</td><td class="num">${num(m.postsPerWeek)}${m.partial ? '<abbr title="The capture covers less than 90 days">*</abbr>' : ''}</td><td class="nowrap">${m.lastPostDate ? `${esc(m.lastPostDate)} <span class="muted small">${m.daysSinceLastPost} d</span>` : '—'}</td><td class="num">${num(m.avgInteractions)}</td><td class="num">${num(m.engagementRate, '%')}</td><td>${status(h, tone)}</td></tr>`;
      });
    const med = pl.competitorMedian;
    if (med) rows.push(`<tr class="row-summary"><td>Competitors' median (${med.brands})</td><td class="num">${num(med.followers)}</td><td class="num">${num(med.postsPerWeek)}</td><td>—</td><td class="num">${num(med.avgInteractions)}</td><td class="num">${num(med.engagementRate, '%')}</td><td></td></tr>`);
    const bench = pl.benchmark.postsPerWeek || pl.benchmark.engagementRate;
    if (bench) rows.push(`<tr class="row-reference"><td>Reference (${esc(scorecard.industry)})</td><td></td><td class="num">${range(pl.benchmark.postsPerWeek)}</td><td></td><td></td><td class="num">${range(pl.benchmark.engagementRate, '%')}</td><td></td></tr>`);
    const sources = [pl.benchmark.postsPerWeek?.source, pl.benchmark.engagementRate?.source].filter(Boolean);
    return `<h3 class="h3">${esc(pl.name)}</h3>${table(['Brand', ['Followers', 'num'], ['Posts a week', 'num'], 'Last post', ['Interactions per post', 'num'], ['Engagement', 'num'], 'Activity'], rows, { cls: 'table-score' })}${sources.length ? `<p class="small muted table-note">Reference: ${esc([...new Set(sources)].join(' · '))}</p>` : ''}`;
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
    return `<tr class="${x.state === 'failed' ? 'row-bad' : ''}"><td><b>${esc(PLATFORM_NAMES[x.platform])}</b><div class="small">${txt(x.brandName)}${x.role === 'client' ? ' <span class="tag">client</span>' : ''}</div></td><td class="small">${x.url ? `<a href="${attr(x.url)}" target="_blank" rel="noopener">${esc(x.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '—'}</td><td>${status(label, tone)}<div class="small muted">${detail}</div>${x.error ? `<div class="small text-bad">${esc(x.error)}</div>` : ''}</td><td><div class="btn-row">${acts.join('')}</div></td></tr>`;
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
          ${field('Profile link', '<input type="url" name="profile_url" placeholder="https://www.linkedin.com/company/…">')}
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
