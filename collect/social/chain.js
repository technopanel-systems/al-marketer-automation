// One capture = the platform's free routes in order until one gives numbers, then (only if enabled) Apify.
// Answers stop the chain (the account does not exist, is private, or belongs to someone else); failures try the next
// route (blocked, login wall, layout changed, posts hidden). A page's ownership is checked by code on every success.
import { captureLinkedInPublic, captureFacebookPublic, captureXPublic, captureInstagramPublic } from './public.js';
import { captureTikTok, captureYouTube } from './auto.js';
import { captureSnapchatPublic, captureTikTokEmbeds, captureInstagramEmbed, captureFacebookPage, tiktokExists, xExists } from './routes.js';
import { CaptureError, TRY_NEXT, bestError } from './errors.js';
import { apifyFallback } from './apify.js';
import { profileConfidence } from '../../engine/social/identity.js';

const handleOf = (url) => {
  try {
    return (new URL(url).pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '');
  } catch {
    return '';
  }
};

// Route lists per platform. Each route: { name, run(url, { env }) → capture }.
export const ROUTES = {
  linkedin: [{ name: 'LinkedIn public page', run: (url) => captureLinkedInPublic(url) }],
  instagram: [
    { name: 'Instagram public page', run: (url) => captureInstagramPublic(url) },
    { name: 'Instagram profile embed', run: (url) => captureInstagramEmbed(url) },
  ],
  facebook: [
    { name: 'Facebook Page Plugin', run: (url) => captureFacebookPublic(url) },
    { name: 'Facebook page', run: (url) => captureFacebookPage(url) },
  ],
  x: [
    {
      name: 'X via FxEmbed',
      run: async (url) => {
        try {
          return await captureXPublic(url);
        } catch (e) {
          // A second, official opinion before saying an account does not exist.
          if (e.code === 'not_found' && (await xExists(handleOf(url)).catch(() => null)) === true) throw new CaptureError('parse_failed', 'The X account exists, but the public data service could not read it this time');
          throw e;
        }
      },
    },
  ],
  tiktok: [
    {
      name: 'TikTok via yt-dlp',
      run: async (url) => {
        // yt-dlp reports a missing account like one of its glitches; TikTok's oEmbed tells them apart first.
        if ((await tiktokExists(handleOf(url)).catch(() => null)) === false) throw new CaptureError('not_found', 'This TikTok account was not found. Correct the link, or mark it as not on this platform.');
        try {
          return await captureTikTok(url);
        } catch (e) {
          throw e.code ? e : new CaptureError('parse_failed', e.message);
        }
      },
    },
    { name: 'TikTok public embeds', run: (url) => captureTikTokEmbeds(url) },
  ],
  youtube: [{ name: 'YouTube', run: (url, { env }) => captureYouTube(url, { apiKey: env.YOUTUBE_API_KEY }) }],
  snapchat: [{ name: 'Snapchat public profile', run: (url) => captureSnapchatPublic(url) }],
};

/**
 * identity: { brand: { names, website }, foundVia } — when given, a page that belongs to someone else is refused.
 * Returns a capture ({ ..., routes: [...] }) or throws the most telling CaptureError.
 */
export async function captureWithFallbacks(platform, url, { env = process.env, routes = ROUTES, identity = null, apify = apifyFallback, ledger = { spentUsd: 0 }, log = () => {} } = {}) {
  const tried = [];
  const errors = [];
  let partial = null;
  for (const route of (routes[platform] || []).filter((r) => !r.when || r.when(env))) {
    try {
      const cap = await route.run(url, { env });
      tried.push({ route: route.name, ok: true });
      return checked(cap, { identity, tried });
    } catch (e) {
      tried.push({ route: route.name, ok: false, code: e.code || 'error', message: String(e.message).slice(0, 200) });
      errors.push(e);
      if (e.code === 'posts_hidden' && e.capture) partial = e.capture;
      if (!TRY_NEXT.has(e.code) && e.code !== undefined) break;
      log(`  ${route.name}: ${e.message} — trying another way`);
    }
  }
  const best = bestError(errors);
  if (!['not_found', 'private', 'wrong_page'].includes(best.code)) {
    const viaApify = await apify(platform, url, { env, ledger, log });
    if (viaApify) return checked(viaApify, { identity, tried: [...tried, { route: 'Apify', ok: true }] });
  }
  // Followers without posts (posts hidden from logged-out visitors) is still a result.
  if (partial) return checked(partial, { identity, tried });
  best.routes = tried;
  throw best;
}

function checked(cap, { identity, tried }) {
  cap.routes = tried;
  if (!identity) return cap;
  const candidate = { name: cap.profile?.name, handle: handleOf(cap.url), website: cap.profile?.website || null, links: [...(cap.profile?.links || []), ...String(cap.profile?.bio || '').match(/https?:\/\/[^\s]+/g) || []], followers: cap.profile?.followers ?? null };
  const result = profileConfidence({ brand: identity.brand, candidate, foundVia: identity.foundVia });
  cap.identity = { ...result, foundVia: identity.foundVia };
  if (result.level === 'reject') {
    const err = new CaptureError('wrong_page', `This page does not look like ${identity.brand.names[0]}'s: ${result.reasons.join('; ')}. Correct the link or skip this profile.`, { identity: cap.identity, profileName: cap.profile?.name || null });
    err.routes = tried;
    throw err;
  }
  return cap;
}
