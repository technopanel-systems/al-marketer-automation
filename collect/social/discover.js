// Finding a brand's page when no link is known or the known one is dead — without login and without search engines
// (they block scripts after a couple of queries). Cheap, polite checks first (docs/research/social-fallbacks.md §2):
//   1. handle variations from the website name and the brand's other handles, checked with existence probes
//   2. LinkedIn's guest company typeahead (exact names), slug guesses verified against the page title
// Every candidate's own page must link the brand website to be used automatically; otherwise it is only suggested.
import { tiktokExists, linkedInCompanies, parseSnapchatProfile, parseTikTokCreatorEmbed } from './routes.js';
import { parseLinkedInCompanyHtml } from './public.js';
import { profileConfidence, domainOf } from '../../engine/social/identity.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url, fetchImpl) => fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });

// Deterministic handle guesses, most likely first, at most `max`.
export function handleVariations({ website = '', handles = [], max = 4 } = {}) {
  const root = domainOf(website).split('.')[0].replace(/[^a-z0-9_.-]/g, '');
  const seeds = [...new Set([...handles.map((h) => String(h).toLowerCase().replace(/^@/, '')).filter(Boolean), root].filter((x) => x && x.length >= 3))];
  const out = [];
  const push = (h) => {
    const clean = h.replace(/[^a-z0-9_.]/g, '');
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean);
  };
  for (const s of seeds) push(s);
  for (const s of seeds) for (const suffix of ['ksa', 'sa', 'co', 'eg', 'official', '_ksa']) push(`${s.replace(/(ksa|sa|co|eg|official)$/, '')}${suffix}`);
  return out.slice(0, max);
}

export const linkedInSlugGuesses = (name = '', website = '') => {
  const words = String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(company|co|ltd|llc|inc|group|est)\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  const root = domainOf(website).split('.')[0];
  const glued = root.replace(/-/g, '');
  return [...new Set([words.join('-'), words.join(''), root, glued, glued && `${glued}sa`, glued && `${glued}ksa`, glued && `${glued}co`].filter((x) => x && x.length >= 3))].slice(0, 6);
};

async function probe(platform, handle, fetchImpl) {
  if (platform === 'tiktok') {
    if (!(await tiktokExists(handle, { fetchImpl }))) return null;
    const res = await get(`https://www.tiktok.com/embed/@${handle}`, fetchImpl);
    const c = res.ok ? parseTikTokCreatorEmbed(await res.text(), handle) : null;
    const link = String(c?.profile.bio || '').match(/https?:\/\/[^\s]+/)?.[0] || null;
    return { url: `https://www.tiktok.com/@${handle}`, name: c?.profile.name || null, website: link, followers: c?.profile.followers ?? null };
  }
  if (platform === 'x') {
    const res = await get(`https://api.fxtwitter.com/${handle}`, fetchImpl);
    if (!res.ok) return null;
    const u = (await res.json().catch(() => null))?.user;
    return u ? { url: `https://x.com/${u.screen_name || handle}`, name: u.name || null, website: u.website?.url || null, followers: u.followers ?? null } : null;
  }
  if (platform === 'snapchat') {
    const res = await get(`https://www.snapchat.com/add/${handle}`, fetchImpl);
    if (!res.ok) return null;
    const parsed = parseSnapchatProfile(await res.text());
    return parsed ? { url: `https://www.snapchat.com/add/${handle}`, name: parsed.profile.name, website: parsed.profile.website, followers: parsed.profile.followers } : null;
  }
  if (platform === 'youtube') {
    const res = await get(`https://www.youtube.com/@${handle}`, fetchImpl);
    return res.ok ? { url: `https://www.youtube.com/@${handle}` } : null;
  }
  return null;
}

async function linkedInCandidate(brand, fetchImpl, paceMs) {
  const names = await linkedInCompanies(brand.names[0], { fetchImpl }).catch(() => []);
  const exact = names.find((c) => brand.names.some((n) => c.name.toLowerCase().includes(String(n).toLowerCase())));
  for (const slug of linkedInSlugGuesses(exact?.name || brand.names[0], brand.website)) {
    await pause(paceMs);
    const res = await get(`https://www.linkedin.com/company/${slug}`, fetchImpl).catch(() => null);
    if (!res?.ok) continue;
    const parsed = parseLinkedInCompanyHtml(await res.text());
    if (parsed.profile.followers === null) continue;
    return { url: `https://www.linkedin.com/company/${slug}`, name: parsed.profile.name, website: parsed.profile.website, followers: parsed.profile.followers, exactTypeaheadName: Boolean(exact && parsed.profile.name === exact.name) };
  }
  return null;
}

/**
 * brand: { names: [..], website, handles: [..] }; platforms: which ones to look for.
 * → [{ platform, url, level, score, reasons }] — only candidates that exist; "confirmed" ones link the brand website.
 */
export async function discoverProfiles(brand, platforms, { fetchImpl = fetch, paceMs = 2500, log = () => {} } = {}) {
  const found = [];
  const guesses = handleVariations({ website: brand.website, handles: brand.handles || [] });
  for (const platform of platforms) {
    let candidate = null;
    try {
      if (platform === 'linkedin') candidate = await linkedInCandidate(brand, fetchImpl, paceMs);
      else {
        for (const handle of guesses) {
          await pause(paceMs);
          candidate = await probe(platform, handle, fetchImpl).catch(() => null);
          if (candidate) {
            candidate.handle = handle;
            break;
          }
        }
      }
    } catch (e) {
      log(`  looking for ${platform}: ${e.message}`);
    }
    if (!candidate) continue;
    const confidence = profileConfidence({ brand, candidate: { name: candidate.name, handle: candidate.handle || candidate.url.split('/').pop(), website: candidate.website, links: [], followers: candidate.followers, exactTypeaheadName: candidate.exactTypeaheadName }, foundVia: 'discovery' });
    if (confidence.level === 'reject' && !candidate.name) confidence.level = 'weak'; // an existing handle without a name to compare stays a suggestion
    if (confidence.level !== 'reject') found.push({ platform, url: candidate.url, ...confidence });
    log(`  ${platform}: found ${candidate.url} (${confidence.level})`);
  }
  return found;
}
