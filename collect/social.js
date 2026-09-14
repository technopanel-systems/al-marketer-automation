// Finds and normalises social profile links.

export const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', re: /^(?:www\.)?instagram\.com$/i, skip: /^\/(p|reel|reels|explore|stories|accounts|share)\b/i },
  { id: 'tiktok', name: 'TikTok', re: /^(?:www\.|m\.)?tiktok\.com$/i, skip: /^\/(tag|music|discover|video)\b/i, need: /^\/@/ },
  { id: 'facebook', name: 'Facebook', re: /^(?:www\.|m\.|web\.|ar-ar\.)?facebook\.com$|^fb\.com$|^fb\.me$/i, skip: /^\/(sharer|share|dialog|plugins|tr|events|groups|watch)\b/i },
  { id: 'x', name: 'X (Twitter)', re: /^(?:www\.)?(twitter|x)\.com$/i, skip: /^\/(intent|share|hashtag|search|i)\b/i },
  { id: 'snapchat', name: 'Snapchat', re: /^(?:www\.)?snapchat\.com$/i, skip: /^\/(discover|spotlight)\b/i },
  { id: 'youtube', name: 'YouTube', re: /^(?:www\.|m\.)?youtube\.com$|^youtu\.be$/i, skip: /^\/(watch|embed|shorts|results)\b/i },
  { id: 'linkedin', name: 'LinkedIn', re: /^(?:[a-z]{2,3}\.)?linkedin\.com$/i, skip: /^\/(share|feed|shareArticle)\b/i },
  { id: 'pinterest', name: 'Pinterest', re: /^(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+$/i, skip: /^\/pin\//i },
  { id: 'whatsapp', name: 'WhatsApp', re: /^(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)$/i },
  { id: 'google_maps', name: 'Google Maps', re: /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.)?google\.[a-z.]+)$/i, need: /^\/maps|^\/[A-Za-z0-9]+$/ },
];

export function classifySocialUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  for (const p of PLATFORMS) {
    if (!p.re.test(host)) continue;
    if (p.id === 'google_maps' && !(host.startsWith('maps.') || /^\/maps/.test(url.pathname))) return null;
    if (p.skip && p.skip.test(url.pathname)) return null;
    if (p.need && !p.need.test(url.pathname)) return null;
    if (p.id !== 'whatsapp' && p.id !== 'google_maps' && (url.pathname === '/' || url.pathname === '')) return null;
    url.hash = '';
    const profileId = p.id === 'facebook' && url.pathname === '/profile.php' ? url.searchParams.get('id') : null;
    if (profileId) url.search = `?id=${profileId}`;
    else if (p.id !== 'whatsapp' && p.id !== 'google_maps') url.search = '';
    const clean = url.toString().replace(/\/$/, '');
    return { platform: p.id, name: p.name, url: clean };
  }
  return null;
}

// Keeps the first link per platform, preferring links given by the user.
export function pickSocialProfiles(userLinks = [], foundLinks = []) {
  const out = new Map();
  for (const [source, list] of [['intake', userLinks], ['website', foundLinks]]) {
    for (const raw of list) {
      const hit = classifySocialUrl(raw);
      if (hit && !out.has(hit.platform)) out.set(hit.platform, { ...hit, source });
    }
  }
  return [...out.values()];
}
