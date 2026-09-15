// Apify as a FALLBACK ONLY (docs/research/apify.md): used when every free route failed, only with APIFY_TOKEN set, only on
// the free plan (credit runs out → blocked, never billed), with a spending cap per run, per proposal and a monthly
// reserve. Any problem → null (skip, move on); it never blocks the pipeline. Code picks the actor and input, not AI.

const API = 'https://api.apify.com/v2';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const handle = (url) => {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
  } catch {
    return '';
  }
};
const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const iso = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// platform → actor steps. expect = billable events per run (for the estimate before running).
export const APIFY_PLAN = {
  instagram: [{ actor: 'apify~instagram-profile-scraper', input: (u) => ({ usernames: [handle(u)] }), expect: { profile: 1 } }],
  facebook: [
    { actor: 'apify~facebook-pages-scraper', input: (u) => ({ startUrls: [{ url: u }] }), expect: { 'apify-default-dataset-item': 1 } },
    { actor: 'apify~facebook-posts-scraper', input: (u, limit) => ({ startUrls: [{ url: u }], resultsLimit: limit }), expect: (limit) => ({ 'actor-start': 1, post: limit }) },
  ],
  linkedin: [
    { actor: 'harvestapi~linkedin-company', input: (u) => ({ companies: [u] }), expect: { 'apify-actor-start': 1, 'apify-default-dataset-item': 1 } },
    { actor: 'harvestapi~linkedin-company-posts', input: (u, limit) => ({ targetUrls: [u], maxPosts: limit }), expect: (limit) => ({ 'apify-actor-start': 1, post: limit }) },
  ],
  tiktok: [{ actor: 'clockworks~tiktok-profile-scraper', input: (u, limit) => ({ profiles: [handle(u)], resultsPerPage: limit, profileSorting: 'latest' }), expect: (limit) => ({ result: limit }) }],
  snapchat: [{ actor: 'tri_angle~snapchat-scraper', input: (u) => ({ profilesInput: [u] }), expect: { start: 1, profile: 1 } }],
};

// Actor output → our capture shape. A missing number stays null; nothing is invented.
export const MAPPERS = {
  instagram: (url, [r]) => {
    const it = r.items[0] || {};
    return { profile: { name: it.fullName || null, followers: n(it.followersCount), postsTotal: n(it.postsCount) }, posts: (it.latestPosts || []).map((x) => ({ id: String(x.id || x.shortCode), url: x.url || null, date: iso(x.timestamp), type: x.type === 'Video' ? 'video' : x.type === 'Sidecar' ? 'carousel' : 'image', caption: String(x.caption || '').slice(0, 300) || null, likes: n(x.likesCount), comments: n(x.commentsCount), shares: null, views: n(x.videoViewCount) })) };
  },
  facebook: (url, [page, posts]) => {
    const it = page.items[0] || {};
    return { profile: { name: it.title || null, followers: n(it.followers) }, posts: (posts?.items || []).map((x) => ({ id: String(x.postId || x.url || x.time), url: x.url || null, date: iso(x.time), type: x.isVideo ? 'video' : 'other', caption: String(x.text || '').slice(0, 300) || null, likes: n(x.likes), comments: n(x.comments), shares: n(x.shares), views: n(x.viewsCount) })) };
  },
  linkedin: (url, [company, posts]) => {
    const it = company.items[0] || {};
    return { profile: { name: it.name || null, followers: n(it.followerCount) }, posts: (posts?.items || []).map((x) => ({ id: String(x.id || x.linkedinUrl), url: x.linkedinUrl || null, date: iso(x.postedAt?.date || x.postedAt?.timestamp), type: 'other', caption: String(x.content || '').slice(0, 300) || null, likes: n(x.engagement?.likes), comments: n(x.engagement?.comments), shares: n(x.engagement?.shares), views: null })) };
  },
  tiktok: (url, [r]) => {
    const author = r.items[0]?.authorMeta || {};
    return { profile: { name: author.nickName || author.name || null, followers: n(author.fans), postsTotal: n(author.video), totalLikes: n(author.heart) }, posts: r.items.filter((x) => x.id).map((x) => ({ id: String(x.id), url: x.webVideoUrl || null, date: iso(x.createTimeISO || x.createTime), type: 'video', caption: String(x.text || '').slice(0, 300) || null, likes: n(x.diggCount), comments: n(x.commentCount), shares: n(x.shareCount), views: n(x.playCount) })) };
  },
  snapchat: (url, [r]) => {
    const it = r.items[0] || {};
    return { profile: { name: it.name || it.title || null, followers: n(it.subscribers) }, posts: (it.spotlights || []).map((x, i) => ({ id: String(x.id || i), url: x.url || null, date: iso(x.snaps?.[0]?.timestamp || x.timestamp), type: 'video', caption: null, likes: null, comments: null, shares: null, views: n(x.views) })) };
  },
};

async function api(path, token, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(75_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Apify answered ${res.status}${json?.error?.type ? ` (${json.error.type})` : ''}`);
  return json;
}

// Every check is a hard skip, never a wait or a retry.
export async function apifyBudget({ token, steps, limit, maxUsd, reserveUsd, proposalSpentUsd, proposalCapUsd, fetchImpl = fetch }) {
  const me = (await api('/users/me', token, { fetchImpl })).data;
  if (me?.isPaying !== false) return { skip: 'the Apify account is not on the free plan (extra charges would be possible), so it is not used' };
  const lim = (await api('/users/me/limits', token, { fetchImpl })).data;
  const remaining = Math.min(5, lim?.limits?.maxMonthlyUsageUsd ?? 5) - (lim?.current?.monthlyUsageUsd ?? 0);
  let estimate = 0;
  for (const s of steps) {
    const pricing = (await api(`/acts/${s.actor}`, null, { fetchImpl })).data?.pricingInfos?.at(-1) || {};
    if (pricing.pricingModel !== 'PAY_PER_EVENT') return { skip: `${s.actor} has an unexpected pricing model` };
    if ((pricing.minimalMaxTotalChargeUsd ?? 0) > maxUsd) return { skip: `${s.actor} needs a higher spending cap than allowed` };
    const events = typeof s.expect === 'function' ? s.expect(limit) : s.expect;
    const price = (e) => pricing.pricingPerEvent?.actorChargeEvents?.[e]?.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? pricing.pricingPerEvent?.actorChargeEvents?.[e]?.eventPriceUsd;
    s.capUsd = Object.entries(events).reduce((sum, [e, count]) => sum + (price(e) ?? Infinity) * count, 0);
    estimate += s.capUsd;
  }
  if (!(estimate <= maxUsd)) return { skip: `estimated $${Number.isFinite(estimate) ? estimate.toFixed(3) : '?'} is above the $${maxUsd} cap per profile` };
  if (remaining < reserveUsd + estimate) return { skip: `Apify credit is low ($${remaining.toFixed(2)} left this month)` };
  if (proposalSpentUsd + estimate > proposalCapUsd) return { skip: 'the Apify budget for this proposal is used up' };
  return { estimate };
}

async function runActor(token, actor, input, { capUsd, deadline, fetchImpl }) {
  const secs = Math.max(30, Math.floor((deadline - Date.now()) / 1000) - 20);
  const q = new URLSearchParams({ timeout: String(secs), maxTotalChargeUsd: capUsd.toFixed(4), restartOnError: 'false', waitForFinish: '60' });
  let run = (await api(`/acts/${actor}/runs?${q}`, token, { method: 'POST', body: input, fetchImpl })).data;
  while (!TERMINAL.has(run.status) && Date.now() < deadline) run = (await api(`/actor-runs/${run.id}?waitForFinish=60`, token, { fetchImpl })).data;
  if (!TERMINAL.has(run.status)) await api(`/actor-runs/${run.id}/abort`, token, { method: 'POST', fetchImpl }).catch(() => {});
  const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=1&format=json&limit=500`, token, { fetchImpl }).catch(() => []);
  return { runId: run.id, status: run.status, usd: run.usageTotalUsd ?? null, items: Array.isArray(items) ? items : [] };
}

export const apifyEnabled = (env = process.env) => Boolean(env.APIFY_TOKEN) && env.ALM_APIFY !== '0';

export async function apifyFallback(platform, url, { env = process.env, ledger = { spentUsd: 0 }, log = () => {}, limit = 20, timeoutMs = 240_000, fetchImpl = fetch } = {}) {
  const steps = APIFY_PLAN[platform];
  if (!apifyEnabled(env) || !steps) return null;
  const maxUsd = Number(env.ALM_APIFY_MAX_RUN_USD || 0.12);
  try {
    const plan = steps.map((s) => ({ ...s }));
    const guard = await apifyBudget({ token: env.APIFY_TOKEN, steps: plan, limit, maxUsd, reserveUsd: Number(env.ALM_APIFY_RESERVE_USD || 0.5), proposalSpentUsd: ledger.spentUsd, proposalCapUsd: Number(env.ALM_APIFY_MAX_PROPOSAL_USD || 0.3), fetchImpl });
    if (guard.skip) {
      log(`  Apify not used: ${guard.skip}`);
      return null;
    }
    const deadline = Date.now() + timeoutMs;
    const results = [];
    for (const s of plan) {
      const r = await runActor(env.APIFY_TOKEN, s.actor, s.input(url, limit), { capUsd: s.capUsd, deadline, fetchImpl });
      ledger.spentUsd += r.usd ?? s.capUsd;
      results.push({ actor: s.actor, ...r });
    }
    const mapped = MAPPERS[platform](url, results, limit);
    if (mapped.profile.followers === null && !mapped.posts.length) return null;
    const usd = results.reduce((sum, r) => sum + (r.usd || 0), 0);
    log(`  read through Apify (fallback, $${usd.toFixed(3)})`);
    return { platform, url, method: `fallback: Apify (${results.map((r) => r.actor.split('~')[1]).join(' + ')})`, status: 'ok', capturedAt: new Date().toISOString(), limit, ...mapped, source: { kind: 'apify', runs: results.map(({ actor, runId, status, usd: u }) => ({ actor, runId, status, usd: u })) }, note: 'Read through Apify because the free public routes failed.' };
  } catch (e) {
    log(`  Apify not used: ${String(e.message).slice(0, 160)}`);
    return null;
  }
}
