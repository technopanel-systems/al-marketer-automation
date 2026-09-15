// Is this profile really the brand's? Decided by code from what the profile itself shows (its website link, name,
// handle), never by AI. Real cases from 2026-09-15: an AI-suggested Facebook page belonged to another company
// (Saudi Cladding for Dalcobond); a LinkedIn slug belonged to a Dubai company that links alucopanel.net, not
// alucopanel.sa. Links the brand publishes itself, or that a person entered, are trusted.

const SOCIAL_HOSTS = /(^|\.)(instagram|facebook|fb|x|twitter|tiktok|snapchat|youtube|youtu|linkedin|linktr|linktree|calendly|wa|whatsapp|bit|t|telegram|threads|pinterest|google|goo|apple|play|bio|beacons|lnk)\.[a-z.]+$/;

export const domainOf = (u) => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
// "alucopanel.sa" and "www.alucopanel.sa" match; "shop.brand.com" matches "brand.com".
const sameSite = (a, b) => Boolean(a && b) && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\b(company|co|ltd|llc|group|official|ksa|sa|eg|inc|factory|est)\b|شركة|مصنع|مؤسسة/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const tokens = (s) => new Set(normalize(s).split(' ').filter((t) => t.length > 1));
function dice(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((t) => B.has(t)).length;
  // A name written without spaces ("DalcoBond" vs "Dalco Bond") still counts.
  const glued = normalize(a).replace(/ /g, '') && normalize(a).replace(/ /g, '') === normalize(b).replace(/ /g, '') ? 1 : 0;
  return Math.max((2 * inter) / (A.size + B.size), glued);
}

/**
 * brand: { names: [..], website }   candidate: { name, handle, links: [..], website, followers, postsTotal, exactTypeaheadName }
 * foundVia: intake | team | website | sameAs | confirmed_profile_link | ai | discovery | search
 * → { level: confirmed | likely | weak | reject, score, reasons }
 */
export function profileConfidence({ brand, candidate, foundVia }) {
  if (['intake', 'team', 'website', 'sameAs', 'confirmed_profile_link'].includes(foundVia)) return { level: 'confirmed', score: 1, reasons: [`linked by ${foundVia === 'intake' || foundVia === 'team' ? 'the team' : foundVia === 'website' ? "the brand's website" : foundVia}`] };
  const reasons = [];
  const site = domainOf(brand.website);
  const links = [...new Set([candidate.website, ...(candidate.links || [])].filter(Boolean).map(domainOf).filter(Boolean))];
  if (site && links.some((d) => sameSite(d, site))) return { level: 'confirmed', score: 0.95, reasons: ['the profile links the brand website'] };
  const names = (brand.names || []).filter(Boolean);
  const nameSim = names.length && candidate.name ? Math.max(...names.map((n) => dice(n, candidate.name))) : 0;
  const root = site.split('.')[0].replace(/[^a-z0-9]/g, '');
  const handle = String(candidate.handle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const handleSim = root && handle && (handle.includes(root) || root.includes(handle)) ? 1 : 0;
  const otherSite = links.filter((d) => !SOCIAL_HOSTS.test(d) && !(site && sameSite(d, site)));
  const active = (candidate.followers ?? 0) > 0;
  let score = 0.5 * nameSim + 0.25 * handleSim + 0.1 * (active ? 1 : 0) + 0.15 * (candidate.exactTypeaheadName ? 1 : 0);
  if (nameSim) reasons.push(`name ${Math.round(nameSim * 100)}% similar`);
  if (handleSim) reasons.push('handle matches the website name');
  if (otherSite.length && site) {
    score -= 0.4;
    reasons.push(`the profile links a different website (${otherSite[0]})`);
  }
  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const level = score >= 0.75 ? 'likely' : score >= 0.45 ? 'weak' : 'reject';
  if (level === 'reject' && !reasons.length) reasons.push('nothing on the profile connects it to the brand');
  return { level, score, reasons };
}
