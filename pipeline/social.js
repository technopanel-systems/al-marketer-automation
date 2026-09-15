// Social media audit for a client and its competitors: who is compared, which profiles, how each is captured,
// and the scorecard + evidence checks the diagnosis reads. Numbers come from code (engine/social/metrics.js), never AI.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { load, save, loadSources, addTextSource, upsertCheck, loadChecks } from './client.js';
import { classifySocialUrl } from '../collect/social.js';
import { capturePage } from '../collect/capture.js';
import { captureWithFallbacks } from '../collect/social/chain.js';
import { discoverProfiles } from '../collect/social/discover.js';
import { buildScorecard, scorecardChecks, PLATFORM_NAMES } from '../engine/social/metrics.js';
import { readJson } from '../engine/util/data.js';
import { ROOT } from '../engine/catalog/store.js';

export const AUDIT_PLATFORMS = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'snapchat'];
export { PLATFORM_NAMES };

export const loadBenchmarks = (root = ROOT) => readJson(join(root, 'rules', 'social-benchmarks.json'));

// auto = the system captures public pages alone, no login · assisted = an employee browses in the research browser (fallback)
// manual = the team types numbers. Set ALM_SOCIAL_ASSISTED=1 to use the research browser for LinkedIn/Facebook/X/Instagram instead.
export function captureMethod(platform, env = process.env) {
  if (env.ALM_SOCIAL_ASSISTED === '1' && ['linkedin', 'facebook', 'x', 'instagram'].includes(platform)) return 'assisted';
  return 'auto';
}

const withScheme = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
export const domainOf = (url) => {
  try {
    return new URL(withScheme(String(url || '').trim())).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const looksLikeUrl = (t) => /^https?:\/\//i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t);

export function splitUrls(text) {
  return String(text || '')
    .split(/[\s|,،]+/)
    .map((t) => t.trim())
    .filter(looksLikeUrl)
    .map(withScheme);
}

// "Alucopanel | alucopanel.com | instagram.com/alucopanel" → { name, website, socials }
export function parseCompetitorLine(line) {
  const parts = String(line || '').split(/\s*\|\s*|\s+/).filter(Boolean);
  const urls = parts.filter(looksLikeUrl).map(withScheme);
  const socials = urls.filter((u) => classifySocialUrl(u));
  const website = urls.find((u) => !classifySocialUrl(u)) || '';
  const name = String(line || '')
    .split(/\s*\|\s*/)
    .map((x) => x.split(/\s+/).filter((t) => !looksLikeUrl(t)).join(' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[-–:،,\s]+|[-–:،,\s]+$/g, '');
  const handle = socials.length ? (new URL(socials[0]).pathname.split('/').filter(Boolean).pop() || '').replace(/^@/, '') : '';
  return { name: name || domainOf(website) || handle, website, socials };
}

export const parseTeamCompetitors = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCompetitorLine)
    .filter((c) => c.name || c.website);

export const loadCompetitors = (p) => load(p.competitors, { list: [], reviewed: true });
const findSame = (list, c) => list.find((x) => (c.website && domainOf(x.website) && domainOf(x.website) === domainOf(c.website)) || (nameKey(c.name) && nameKey(x.name) === nameKey(c.name)));
const nextCompetitorId = (list) => `c${list.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0) + 1}`;

// Competitors the team typed at intake are always in (confirmed); decisions on AI proposals are kept.
export function syncTeamCompetitors(p, intake) {
  const doc = loadCompetitors(p);
  for (const t of parseTeamCompetitors(intake.competitors)) {
    const hit = findSame(doc.list, t);
    if (hit) {
      // The team also listing an AI proposal confirms it; a later "reject" on the Social tab is respected.
      if (hit.status === 'proposed') hit.status = 'confirmed';
      if (!hit.website && t.website) hit.website = t.website;
      hit.socials = [...new Set([...(hit.socials || []), ...t.socials])];
    } else doc.list.push({ id: nextCompetitorId(doc.list), ...t, source: 'team', status: 'confirmed', reason: '' });
  }
  save(p.competitors, doc);
  return doc;
}

export function addAiCompetitors(p, proposals, { clientWebsite = '' } = {}) {
  const doc = loadCompetitors(p);
  let added = 0;
  for (const c of proposals) {
    if (!c.name && !c.website) continue;
    if (clientWebsite && c.website && domainOf(c.website) === domainOf(clientWebsite)) continue;
    if (findSame(doc.list, c)) continue;
    doc.list.push({ id: nextCompetitorId(doc.list), name: c.name, website: c.website || '', socials: (c.socials || []).filter((u) => classifySocialUrl(u)), source: 'ai', status: 'proposed', reason: c.reason || '', confidence: c.confidence || '' });
    added++;
  }
  if (added) doc.reviewed = false;
  save(p.competitors, doc);
  return added;
}

export function saveCompetitorReview(p, { decisions = {}, add = null } = {}) {
  const doc = loadCompetitors(p);
  for (const c of doc.list) {
    const d = decisions[c.id];
    if (!d) continue;
    if (['confirmed', 'rejected'].includes(d.status)) c.status = d.status;
    if (typeof d.name === 'string' && d.name.trim()) c.name = d.name.trim();
    if (typeof d.website === 'string') c.website = d.website.trim() ? withScheme(d.website.trim()) : '';
    if (typeof d.socials === 'string') c.socials = splitUrls(d.socials).filter((u) => classifySocialUrl(u));
  }
  if (add && (add.name || add.website)) {
    const parsed = parseCompetitorLine([add.name, add.website, add.socials].filter(Boolean).join(' | '));
    if (parsed.name && !findSame(doc.list, parsed)) doc.list.push({ id: nextCompetitorId(doc.list), ...parsed, source: 'team', status: 'confirmed', reason: '' });
  }
  doc.reviewed = !doc.list.some((c) => c.status === 'proposed');
  doc.reviewedAt = new Date().toISOString();
  save(p.competitors, doc);
  return doc;
}

export function auditBrands(p, intake) {
  return [{ id: 'client', name: intake.displayName || intake.name, role: 'client' }, ...loadCompetitors(p).list.filter((c) => c.status === 'confirmed').map((c) => ({ id: c.id, name: c.name, role: 'competitor' }))];
}

// The profile's own page for a link that points inside it (…/company/x/posts → …/company/x, …/@brand/video/1 → …/@brand).
export function profileRoot(platform, url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (platform === 'facebook' && parts[0] === 'profile.php') return url;
    const prefixed = { linkedin: ['company', 'showcase', 'school', 'in'], youtube: ['channel', 'c', 'user'], snapchat: ['add'] }[platform] || [];
    const keep = platform === 'facebook' && ['pages', 'people'].includes(parts[0]) ? 3 : prefixed.includes(parts[0]) ? 2 : 1;
    if (parts.length <= keep) return url;
    u.pathname = `/${parts.slice(0, keep).join('/')}`;
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

// One profile per brand per platform. LinkedIn company pages win over personal profiles.
function pickProfiles(urls) {
  const out = {};
  for (const raw of urls) {
    const hit = classifySocialUrl(withScheme(String(raw || '').trim()));
    if (!hit || !AUDIT_PLATFORMS.includes(hit.platform)) continue;
    const url = profileRoot(hit.platform, hit.url);
    const cur = out[hit.platform];
    if (!cur || (hit.platform === 'linkedin' && /\/company\//.test(url) && !/\/company\//.test(cur))) out[hit.platform] = url;
  }
  return out;
}

const extraFile = (p) => join(p.socialDir, 'profiles-extra.json');
export function setBrandProfile(p, brandId, url) {
  const hit = classifySocialUrl(withScheme(String(url || '').trim()));
  if (!hit || !AUDIT_PLATFORMS.includes(hit.platform)) return null;
  const extra = load(extraFile(p), {});
  const clean = { ...hit, url: profileRoot(hit.platform, hit.url) };
  extra[brandId] = { ...(extra[brandId] || {}), [hit.platform]: clean.url };
  save(extraFile(p), extra);
  return clean;
}

export function brandProfiles(p, intake) {
  const extra = load(extraFile(p), {});
  const out = {};
  const clientUrls = [...(intake.socials || []), ...loadSources(p).filter((s) => s.kind === 'social' || (s.kind === 'requested' && s.platform)).map((s) => s.url)];
  out.client = { ...pickProfiles(clientUrls), ...(extra.client || {}) };
  for (const c of loadCompetitors(p).list.filter((x) => x.status === 'confirmed')) out[c.id] = { ...pickProfiles([...(c.socials || []), ...(c.found || [])]), ...(extra[c.id] || {}) };
  return out;
}

const captureFile = (p, brandId, platform) => join(p.capturesDir, `${brandId}__${platform}.json`);
export const loadCapture = (p, brandId, platform) => load(captureFile(p, brandId, platform), null);
export const saveCapture = (p, capture) => save(captureFile(p, capture.brandId, capture.platform), capture);
export function loadCaptures(p) {
  if (!existsSync(p.capturesDir)) return [];
  return readdirSync(p.capturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => load(join(p.capturesDir, f), null))
    .filter(Boolean);
}

export function setTaskStatus(p, brandId, platform, status) {
  const all = load(p.socialStatus, {});
  const key = `${brandId}:${platform}`;
  if (status) all[key] = { status, at: new Date().toISOString() };
  else delete all[key];
  save(p.socialStatus, all);
}

export function socialTasks(p, intake, env = process.env) {
  const profiles = brandProfiles(p, intake);
  const statuses = load(p.socialStatus, {});
  const tasks = [];
  for (const b of auditBrands(p, intake)) {
    for (const platform of AUDIT_PLATFORMS) {
      const url = profiles[b.id]?.[platform] || null;
      const cap = loadCapture(p, b.id, platform);
      const decided = statuses[`${b.id}:${platform}`]?.status || null;
      if (!url && !cap && !decided) continue;
      const method = captureMethod(platform, env);
      // not_found is an answer (the platform says the account does not exist), not a failure to fix.
      const failed = cap && !['ok', 'partial', 'not_found'].includes(cap.status);
      tasks.push({
        brandId: b.id,
        brandName: b.name,
        role: b.role,
        platform,
        url: url || cap?.url || null,
        method: failed && method === 'auto' ? 'assisted' : method,
        autoAvailable: method === 'auto',
        state: decided || (cap ? (cap.status === 'not_found' ? 'not_found_checked' : cap.status === 'wrong_page' ? 'wrong_page' : failed ? 'failed' : 'captured') : 'todo'),
        identity: cap?.identity || null,
        routes: cap?.routes || null,
        retryAfter: cap?.retryAfter || null,
        capturedAt: cap?.capturedAt || null,
        captureMethod: cap?.method || null,
        posts: cap?.posts?.length ?? null,
        error: cap?.error || null,
        edited: Boolean(cap?.edited),
      });
    }
  }
  const competitors = loadCompetitors(p);
  const waiting = tasks.filter((t) => (t.state === 'todo' && t.method !== 'auto') || t.state === 'failed' || t.state === 'wrong_page');
  const toReview = competitors.list.filter((c) => c.status === 'proposed').length;
  return { tasks, waiting: waiting.length, competitorsToReview: toReview, needsInput: waiting.length > 0 || toReview > 0 };
}

// Readable evidence text for one capture — quotes from captions are verified against this text like any page.
export function captureText(c, brandName) {
  const pr = c.profile || {};
  const lines = [
    `Platform: ${PLATFORM_NAMES[c.platform] || c.platform} · Brand: ${brandName} · ${c.url || ''}`,
    `Captured: ${c.capturedAt} · Method: ${c.method}${c.edited ? ' · numbers reviewed by the team' : ''}`,
    `Followers: ${pr.followers ?? 'unknown'} · Posts in total: ${pr.postsTotal ?? 'unknown'}${pr.bio ? ` · Bio: ${String(pr.bio).replace(/\s+/g, ' ')}` : ''}`,
  ];
  for (const post of (c.posts || []).slice(0, 20)) {
    lines.push(`POST ${post.date ? post.date.slice(0, 10) : 'date unknown'} · ${post.type || 'other'} · likes ${post.likes ?? '?'} · comments ${post.comments ?? '?'} · shares ${post.shares ?? '?'} · views ${post.views ?? '?'}${post.url ? ` · ${post.url}` : ''}`);
    if (post.caption) lines.push(`  «${String(post.caption).replace(/\s+/g, ' ').slice(0, 280)}»`);
  }
  return lines.join('\n');
}

// Every platform: its free routes in order, the ownership check, and Apify last (only when enabled). See collect/social/chain.js.
export const defaultCollectors = Object.fromEntries(AUDIT_PLATFORMS.map((platform) => [platform, (url, options = {}) => captureWithFallbacks(platform, url, options)]));

// Where a profile link came from decides whether its page must prove it belongs to the brand.
export function profileSource(p, intake, brandId, platform, url) {
  const key = (u) => String(profileRoot(platform, withScheme(String(u || '').trim())) || '').toLowerCase().replace(/^https?:\/\/(www\.|m\.|[a-z]{2}\.)?/, '').replace(/\/+$/, '');
  const target = key(url);
  const has = (list) => (list || []).some((u) => key(u) === target);
  const extra = load(extraFile(p), {});
  if (Object.values(extra[brandId] || {}).some((u) => key(u) === target)) return 'team';
  if (brandId === 'client') {
    if (has(intake.socials)) return 'intake';
    const src = loadSources(p).find((s) => (s.kind === 'social' || s.kind === 'requested') && key(s.url) === target);
    return src?.kind === 'social' && src.foundVia !== 'intake' ? 'website' : src?.requestedBy ? 'ai' : 'website';
  }
  const c = loadCompetitors(p).list.find((x) => x.id === brandId);
  if (!c) return 'ai';
  if (has(c.found)) return 'website';
  return c.source === 'team' ? 'team' : 'ai';
}

export function identityFor(p, intake, t) {
  const c = t.brandId === 'client' ? null : loadCompetitors(p).list.find((x) => x.id === t.brandId);
  const brand = t.brandId === 'client' ? { names: [intake.name, intake.displayName].filter(Boolean), website: intake.website || '' } : { names: [c?.name].filter(Boolean), website: c?.website || '' };
  return { brand, foundVia: profileSource(p, intake, t.brandId, t.platform, t.url) };
}

export async function discoverSocialLinks(website) {
  const browser = await chromium.launch();
  try {
    const cap = await capturePage(browser, withScheme(website), { screenshots: false, timeoutMs: 35_000 });
    return [...new Set((cap.links || []).map((l) => l.href).filter((h) => classifySocialUrl(h)))];
  } finally {
    await browser.close();
  }
}

/**
 * The "social" pipeline step: finds competitors' profiles on their websites, runs automatic captures, and turns every
 * capture into a scorecard, quotable evidence and checks. Captures that need a person are listed as tasks.
 */
export async function runSocialStep(p, intake, { log = () => {}, env = process.env, collectors = defaultCollectors, discover = discoverSocialLinks, benchmarks = loadBenchmarks(), now = new Date(), paceMs = 4000 } = {}) {
  syncTeamCompetitors(p, intake);
  const doc = loadCompetitors(p);
  for (const c of doc.list.filter((x) => x.status === 'confirmed' && x.website && !x.discoveredAt)) {
    log(`Looking for ${c.name}'s social profiles on ${domainOf(c.website)}`);
    try {
      c.found = await discover(c.website);
    } catch (e) {
      c.found = [];
      log(`  could not open the website: ${e.message}`);
    }
    c.discoveredAt = new Date().toISOString();
  }
  save(p.competitors, doc);

  await captureTasks(p, socialTasks(p, intake, env).tasks.filter((x) => x.state === 'todo' && x.method === 'auto'), { log, env, collectors, paceMs });

  const brands = auditBrands(p, intake);
  const names = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const captures = loadCaptures(p).filter((c) => names[c.brandId]);
  const statuses = Object.fromEntries(Object.entries(load(p.socialStatus, {})).filter(([k]) => names[k.split(':')[0]]).map(([k, v]) => [k, v.status]));
  const scorecard = buildScorecard({ brands, captures, statuses, benchmarks, industry: intake.industry || 'general', now });

  // Captured posts become evidence only while they are in the scorecard (not skipped, not marked absent).
  const usable = captures.filter((x) => ['ok', 'partial'].includes(x.status) && !statuses[`${x.brandId}:${x.platform}`]);
  const current = new Set();
  for (const c of usable) {
    const src = addTextSource(p, { kind: 'social-data', platform: c.platform, url: c.url, title: `${names[c.brandId]} · ${PLATFORM_NAMES[c.platform]} posts`, text: captureText(c, names[c.brandId]) });
    current.add(src.id);
    const row = scorecard.platforms.find((x) => x.platform === c.platform)?.rows.find((r) => r.brandId === c.brandId);
    if (row) row.evidenceId = src.id;
  }
  // Posts of captures that were deleted, skipped, marked absent or belong to a dropped competitor must never reach the AI.
  const stale = loadSources(p).filter((s) => s.kind === 'social-data' && !current.has(s.id));
  if (stale.length) {
    save(p.sources, loadSources(p).filter((s) => !stale.some((x) => x.id === s.id)));
    for (const s of stale) rmSync(join(p.pagesDir, `${s.id}.txt`), { force: true });
    log(`Removed ${stale.length} out-of-date social media evidence file(s)`);
  }
  // Social checks of brands that are no longer compared are removed, then the current ones are written.
  const wanted = scorecardChecks(scorecard);
  const wantedKeys = new Set(wanted.map((c) => c.key));
  const kept = loadChecks(p).filter((c) => !String(c.key || '').startsWith('social:') || wantedKeys.has(c.key));
  save(p.checks, kept);
  scorecard.checks = wanted.map((c) => {
    const rec = upsertCheck(p, { ...c, by: 'code' });
    return { key: c.key, id: rec.id };
  });
  scorecard.createdAt = new Date().toISOString();
  save(p.scorecard, scorecard);
  const tasks = socialTasks(p, intake, env);
  save(p.socialTasks, tasks);
  return { brands: brands.length, captured: usable.length, waiting: tasks.waiting, competitorsToReview: tasks.competitorsToReview, needsInput: tasks.needsInput };
}

// The account name inside a profile link (used to match the right account in platform data).
export function profileHandle(platform, url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (platform === 'linkedin') return parts[0] === 'company' ? parts[1] || '' : parts[1] || parts[0] || '';
    return String(parts[0] || '').replace(/^@/, '');
  } catch {
    return '';
  }
}

// Captures each automatic task in turn, at a human pace between profiles on the same platform.
export async function captureTasks(p, tasks, { log = () => {}, env = process.env, collectors = defaultCollectors, paceMs = 4000, intake = load(p.intake, {}), ledger = { spentUsd: 0 } } = {}) {
  let lastPlatform = null;
  let captured = 0;
  let failed = 0;
  for (const t of tasks) {
    if (!collectors[t.platform]) continue;
    if (lastPlatform === t.platform && paceMs) await new Promise((r) => setTimeout(r, paceMs));
    lastPlatform = t.platform;
    log(`Capturing ${t.brandName} · ${PLATFORM_NAMES[t.platform]} automatically`);
    try {
      const cap = await collectors[t.platform](t.url, { env, identity: identityFor(p, intake, t), ledger, log });
      saveCapture(p, { ...cap, brandId: t.brandId, brandName: t.brandName, role: t.role });
      log(`  ${cap.posts.length} posts, ${cap.profile?.followers ?? 'unknown'} followers${cap.rhythmUnknown ? ' (posts hidden from logged-out visitors)' : ''}${cap.identity && cap.identity.level !== 'confirmed' ? ` · page not confirmed as the brand's (${cap.identity.reasons.join('; ')})` : ''}`);
      captured++;
    } catch (e) {
      const status = ['not_found', 'wrong_page'].includes(e.code) ? e.code : 'failed';
      saveCapture(p, { brandId: t.brandId, brandName: t.brandName, role: t.role, platform: t.platform, url: t.url, method: 'auto', status, code: e.code || null, capturedAt: new Date().toISOString(), profile: e.profileName ? { name: e.profileName } : {}, posts: [], error: String(e.message).slice(0, 300), routes: e.routes || null, identity: e.identity || null, retryAfter: e.retryAfterMs ? new Date(Date.now() + e.retryAfterMs).toISOString() : null });
      log(`  ${status === 'not_found' ? 'not on this platform' : status === 'wrong_page' ? 'wrong page' : 'could not capture automatically'}: ${e.message}`);
      if (status === 'failed') failed++;
    }
  }
  return { captured, failed, apifyUsd: ledger.spentUsd };
}

// Every profile link known for the client, grouped by platform (intake, website links, links the team added).
// A LinkedIn personal profile next to the company page is not a second brand account, so only company pages count there.
export function clientAccounts(p, intake) {
  const extra = load(extraFile(p), {}).client || {};
  const urls = [...(intake.socials || []), ...loadSources(p).filter((s) => s.kind === 'social' || (s.kind === 'requested' && s.platform)).map((s) => s.url), ...Object.values(extra)];
  const byPlatform = {};
  for (const raw of urls) {
    const hit = classifySocialUrl(withScheme(String(raw || '').trim()));
    if (!hit || !AUDIT_PLATFORMS.includes(hit.platform)) continue;
    if (hit.platform === 'linkedin' && !/\/(company|showcase)\//.test(hit.url)) continue;
    const url = profileRoot(hit.platform, hit.url);
    const key = url.toLowerCase().replace(/^https?:\/\/(www\.|[a-z]{2}\.)?/, '').replace(/\/+$/, '');
    (byPlatform[hit.platform] ||= new Map()).set(key, url);
  }
  return Object.fromEntries(Object.entries(byPlatform).map(([pl, m]) => [pl, [...m.values()]]));
}

// Step "Client social profiles": captures the client's own profiles as soon as the website audit has found them,
// and records a check when the brand runs more than one account on a platform (split presence is a brand finding).
export const candidatesFile = (p) => join(p.socialDir, 'candidates.json');
export const loadCandidates = (p) => load(candidatesFile(p), { client: [], dismissed: [] });
export function dismissCandidate(p, url) {
  const doc = loadCandidates(p);
  doc.client = doc.client.filter((c) => c.url !== url);
  doc.dismissed = [...new Set([...(doc.dismissed || []), url])];
  save(candidatesFile(p), doc);
}

// Looks for the client's pages on platforms with no working link (none given, or the link's account does not exist).
// A page that links the client's website is added and captured; other matches are suggested to the team.
export async function findMissingClientProfiles(p, intake, { log = () => {}, discover = discoverProfiles, env = process.env } = {}) {
  if (!intake.website || env.ALM_NO_DISCOVERY === '1') return [];
  const tasks = socialTasks(p, intake, env).tasks.filter((x) => x.brandId === 'client');
  const statuses = load(p.socialStatus, {});
  const working = new Set(tasks.filter((t) => !['not_found_checked', 'wrong_page'].includes(t.state)).map((t) => t.platform));
  const missing = AUDIT_PLATFORMS.filter((pl) => !working.has(pl) && !statuses[`client:${pl}`] && pl !== 'instagram' && pl !== 'facebook');
  if (!missing.length) return [];
  const handles = tasks.map((t) => profileHandle(t.platform, t.url)).filter(Boolean);
  log(`Looking for the client's ${missing.map((pl) => PLATFORM_NAMES[pl]).join(', ')} page(s)`);
  const found = await discover({ names: [intake.name, intake.displayName].filter(Boolean), website: intake.website, handles }, missing, { log });
  const doc = loadCandidates(p);
  const added = [];
  for (const c of found) {
    if ((doc.dismissed || []).includes(c.url)) continue;
    if (c.level === 'confirmed') {
      setBrandProfile(p, 'client', c.url);
      added.push(c);
    } else if (!doc.client.some((x) => x.url === c.url)) doc.client.push({ ...c, at: new Date().toISOString() });
  }
  save(candidatesFile(p), doc);
  return added;
}

export async function runProfilesStep(p, intake, { log = () => {}, env = process.env, collectors = defaultCollectors, paceMs = 4000, discover = discoverProfiles } = {}) {
  const tasks = socialTasks(p, intake, env).tasks.filter((x) => x.brandId === 'client');
  const result = await captureTasks(p, tasks.filter((x) => x.state === 'todo' && x.method === 'auto'), { log, env, collectors, paceMs });
  const added = await findMissingClientProfiles(p, intake, { log, discover, env }).catch((e) => (log(`  could not look for missing pages: ${e.message}`), []));
  if (added.length) {
    const fresh = socialTasks(p, intake, env).tasks.filter((x) => x.brandId === 'client' && x.state === 'todo' && x.method === 'auto');
    const more = await captureTasks(p, fresh, { log, env, collectors, paceMs });
    result.captured += more.captured;
    result.failed += more.failed;
  }
  const accounts = clientAccounts(p, intake);
  const name = intake.displayName || intake.name;
  const duplicates = Object.entries(accounts).filter(([, list]) => list.length > 1);
  const keep = new Set(duplicates.map(([pl]) => `social_accounts_${pl}`));
  save(p.checks, loadChecks(p).filter((c) => !String(c.key || '').startsWith('social_accounts_') || keep.has(c.key)));
  for (const [platform, list] of duplicates) {
    upsertCheck(p, { key: `social_accounts_${platform}`, question: `${name} has more than one ${PLATFORM_NAMES[platform]} account`, url: list[0], result: 'value', value: `${list.length} accounts: ${list.join(' , ')}`, detail: 'Found in the links given at intake, on the website or added by the team', by: 'code' });
    log(`${PLATFORM_NAMES[platform]}: ${list.length} separate accounts found for the brand`);
  }
  const after = socialTasks(p, intake, env).tasks.filter((x) => x.brandId === 'client');
  const summary = { platforms: after.map((t) => ({ platform: t.platform, url: t.url, state: t.state })), accounts, duplicates: duplicates.map(([pl, list]) => ({ platform: pl, accounts: list })), captured: result.captured, failed: result.failed, discovered: added.map((c) => c.url), suggested: loadCandidates(p).client.map((c) => c.url), updatedAt: new Date().toISOString() };
  save(p.clientProfiles, summary);
  return summary;
}
