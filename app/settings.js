// Settings & keys: the free keys the system can use, saved in .env.local on this computer. Values are never shown,
// logged or sent anywhere except to the service they belong to when the team clicks "Test".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export const KEYS = [
  {
    name: 'PAGESPEED_API_KEY',
    label: 'Google PageSpeed',
    need: 'Recommended',
    free: 'Free',
    does: 'Google speed, SEO and accessibility scores in the website audit. Without it Google often refuses (its shared limit) and only the load time measured on this computer is used.',
    steps: ['Open console.cloud.google.com and sign in with any Google account.', 'Create a project (any name).', 'APIs & Services → Library → "PageSpeed Insights API" → Enable.', 'APIs & Services → Credentials → Create credentials → API key, then copy it.'],
    link: 'https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com',
  },
  {
    name: 'YOUTUBE_API_KEY',
    label: 'YouTube Data API',
    need: 'Optional',
    free: 'Free daily quota',
    does: 'Exact YouTube channel and video numbers. Without it YouTube is still read (with yt-dlp), more slowly.',
    steps: ['In the same Google Cloud project: APIs & Services → Library → "YouTube Data API v3" → Enable.', 'Use the same API key as PageSpeed, or create a second one.'],
    link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  {
    name: 'SERPAPI_KEY',
    label: 'SerpApi (Google results backup)',
    need: 'Optional',
    free: 'Free plan: 250 searches a month',
    does: 'Google search results when Google asks the browser to verify the visitor. About 3 to 5 searches a proposal, only for the searches the browser could not read. Without it those searches stay "could not read".',
    steps: ['Sign up at serpapi.com (free plan, no card).', 'Dashboard → "Your Private API Key" → copy it.'],
    link: 'https://serpapi.com/manage-api-key',
  },
  {
    name: 'APIFY_TOKEN',
    label: 'Apify (last fallback)',
    need: 'Optional',
    free: 'Free plan: $5 of usage a month',
    does: 'Last try for an Instagram, Facebook, LinkedIn, TikTok or Snapchat page that nothing else could read. Used only on the free plan, at most $0.12 a page and $0.30 a proposal, keeping $0.50 in reserve; otherwise skipped.',
    steps: ['Sign up at apify.com (free plan).', 'Console → Settings → API & Integrations → copy the Personal API token.'],
    link: 'https://console.apify.com/settings/integrations',
  },
  {
    name: 'NOTION_TOKEN',
    label: 'Notion (catalog editing)',
    need: 'Only for "Update from Notion"',
    free: 'Free',
    does: 'Pulls the service catalog from Notion on the Catalog & rules page. Proposals never need it.',
    steps: ['Open notion.so/profile/integrations → New integration (internal) → copy the secret.', 'In Notion, open the catalog page → ••• → Connections → add the integration.'],
    link: 'https://www.notion.so/profile/integrations',
  },
];

// Keys earlier versions asked for; nothing reads them any more.
export const RETIRED_KEYS = {
  META_ACCESS_TOKEN: 'Instagram official API: it needed a Meta developer app, a business login and a new token every 60 days. Instagram is now read without any account.',
  IG_BUSINESS_ACCOUNT_ID: 'Part of the retired Instagram official API.',
  META_GRAPH_VERSION: 'Part of the retired Instagram official API.',
};

const KEY_NAMES = new Set(KEYS.map((k) => k.name));
const envFile = (root) => join(root, '.env.local');
const cleanValue = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');

// Names saved in .env.local with a value (never the values).
export function savedKeyNames(root) {
  const file = envFile(root);
  if (!existsSync(file)) return [];
  return Object.entries(parseEnv(readFileSync(file, 'utf8'))).filter(([, v]) => cleanValue(v)).map(([k]) => k);
}

// active: the running app can use it · saved: in the file, not loaded yet · missing
export function keyStatus(root, env = process.env) {
  const saved = new Set(savedKeyNames(root));
  return KEYS.map((k) => ({ name: k.name, state: cleanValue(env[k.name]) ? 'active' : saved.has(k.name) ? 'saved' : 'missing' }));
}

export const retiredKeysSaved = (root) => savedKeyNames(root).filter((k) => k in RETIRED_KEYS);

function rewrite(root, change) {
  const file = envFile(root);
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const next = change(lines).filter((l, i, all) => l !== '' || i < all.length - 1);
  writeFileSync(file, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}
const lineKey = (line) => (line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/) || [])[1] || null;

// Saves the given keys (blank values are skipped) and makes them usable at once, without a restart.
export function saveKeys(root, values, env = process.env) {
  const saved = [];
  const rejected = [];
  const entries = Object.entries(values).filter(([k, v]) => KEY_NAMES.has(k) && cleanValue(v));
  for (const [k, raw] of entries) {
    const v = cleanValue(raw);
    if (!/^[\x21-\x7e]{8,500}$/.test(v)) rejected.push(k);
    else saved.push([k, v]);
  }
  if (saved.length) {
    rewrite(root, (lines) => [...lines.filter((l) => !saved.some(([k]) => lineKey(l) === k)), ...saved.map(([k, v]) => `${k}=${v}`)]);
    for (const [k, v] of saved) env[k] = v;
  }
  return { saved: saved.map(([k]) => k), rejected };
}

export function removeKeys(root, names, env = process.env) {
  const drop = new Set(names.filter((n) => KEY_NAMES.has(n) || n in RETIRED_KEYS));
  if (!drop.size || !existsSync(envFile(root))) return [];
  const before = savedKeyNames(root);
  rewrite(root, (lines) => lines.filter((l) => !drop.has(lineKey(l))));
  for (const n of drop) delete env[n];
  return before.filter((n) => drop.has(n));
}

// Reads the filled-in KEY=value lines of API-KEYS.txt (the file with the instructions) into .env.local.
export function importKeyFile(root, env = process.env) {
  const file = join(root, 'API-KEYS.txt');
  if (!existsSync(file)) return { found: false, saved: [], ignored: [], rejected: [] };
  const values = {};
  const ignored = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\S.*)$/);
    if (!m) continue;
    if (KEY_NAMES.has(m[1])) values[m[1]] = m[2];
    else ignored.push(m[1]);
  }
  return { found: true, ...saveKeys(root, values, env), ignored };
}

// Asks the service whether the key works. The answer never includes the key.
export async function testKey(name, value, { fetchImpl = fetch } = {}) {
  const v = cleanValue(value);
  if (!v) return { ok: false, text: 'Not set.' };
  const get = async (url, init = {}) => {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs || 30_000) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const googleError = (body, status) => body?.error?.message ? `Google says: ${String(body.error.message).replace(v, '…').slice(0, 200)}` : `Google answered ${status}.`;
  try {
    if (name === 'PAGESPEED_API_KEY') {
      const r = await get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent('https://example.com/')}&strategy=mobile&category=seo&key=${encodeURIComponent(v)}`, { timeoutMs: 90_000 });
      return r.status === 200 ? { ok: true, text: 'Works: Google returned scores for a test page.' } : { ok: false, text: googleError(r.body, r.status) };
    }
    if (name === 'YOUTUBE_API_KEY') {
      const r = await get(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=YouTube&key=${encodeURIComponent(v)}`);
      return r.status === 200 ? { ok: true, text: 'Works: YouTube answered.' } : { ok: false, text: googleError(r.body, r.status) };
    }
    if (name === 'SERPAPI_KEY') {
      // The account endpoint does not use a search.
      const r = await get(`https://serpapi.com/account.json?api_key=${encodeURIComponent(v)}`);
      if (r.status !== 200 || r.body?.error) return { ok: false, text: `SerpApi answered ${r.status}: the key was not accepted.` };
      const left = r.body?.total_searches_left ?? r.body?.plan_searches_left;
      return { ok: true, text: `Works: ${String(r.body?.plan_name || 'plan').slice(0, 40)}${left !== undefined ? `, ${left} searches left this month` : ''}.` };
    }
    if (name === 'APIFY_TOKEN') {
      const r = await get('https://api.apify.com/v2/users/me', { headers: { authorization: `Bearer ${v}` } });
      if (r.status !== 200) return { ok: false, text: `Apify answered ${r.status}: the token was not accepted.` };
      const paying = r.body?.data?.isPaying;
      return paying === false ? { ok: true, text: 'Works: free plan, so the system may use it as a last fallback.' } : { ok: false, text: 'The token works, but the account is not on the free plan, so the system will not use it (extra charges would be possible).' };
    }
    if (name === 'NOTION_TOKEN') {
      const r = await get('https://api.notion.com/v1/users/me', { headers: { authorization: `Bearer ${v}`, 'notion-version': '2022-06-28' } });
      return r.status === 200 ? { ok: true, text: `Works: connected as "${String(r.body?.name || 'the integration').slice(0, 60)}".` } : { ok: false, text: `Notion answered ${r.status}: the token was not accepted.` };
    }
    return { ok: false, text: 'This key has no test.' };
  } catch (e) {
    return { ok: false, text: `Could not reach the service (${e.name === 'TimeoutError' ? 'no answer in time' : 'network error'}).` };
  }
}
