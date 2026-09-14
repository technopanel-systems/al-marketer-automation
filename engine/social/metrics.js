// Social media numbers are computed here, by code — never by AI (constitutional rule 1).
// Input: normalized captures (one brand × one platform). Output: metrics, a scorecard across brands, and checks.

export const PLATFORM_NAMES = { linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', x: 'X', youtube: 'YouTube', snapchat: 'Snapchat' };
const DAY = 86_400_000;

const round = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function interactions(post) {
  const parts = [post.likes, post.comments, post.shares].map(num);
  return parts.every((x) => x === null) ? null : parts.reduce((s, x) => s + (x || 0), 0);
}

/**
 * Metrics for one captured brand × platform.
 * - postsPerWeek counts posts inside the window; when the capture does not reach back to the window start and was cut off
 *   at the method's limit, the rate is computed over the period actually covered and marked partial.
 * - engagementRate is by followers (the only rate computable from public data), in percent.
 */
export function platformMetrics(capture, { now = new Date(), windowDays = 90, inactiveAfterDays = 60 } = {}) {
  const ref = new Date(capture.capturedAt || now).getTime();
  const dated = (capture.posts || []).filter((p) => p.date && !Number.isNaN(Date.parse(p.date))).map((p) => ({ ...p, t: Date.parse(p.date) }));
  dated.sort((a, b) => b.t - a.t);
  const followers = num(capture.profile?.followers);
  const windowStart = ref - windowDays * DAY;
  const inWindow = dated.filter((p) => p.t >= windowStart && p.t <= ref + DAY);
  const oldest = dated.length ? dated[dated.length - 1].t : null;
  const cutOff = capture.limit ? (capture.posts || []).length >= capture.limit : false;
  const coverageDays = cutOff && oldest !== null && oldest > windowStart ? Math.max(1, (ref - oldest) / DAY) : windowDays;
  const partial = coverageDays < windowDays;
  const lastPost = dated[0] || null;
  const daysSinceLastPost = lastPost ? Math.max(0, Math.floor((ref - lastPost.t) / DAY)) : null;
  // Engagement describes current performance: only posts inside the window count (old posts would flatter an inactive account).
  const sample = inWindow;
  const withInteractions = sample.filter((p) => interactions(p) !== null);
  const avgInteractions = withInteractions.length ? withInteractions.reduce((s, p) => s + interactions(p), 0) / withInteractions.length : null;
  const withViews = sample.filter((p) => num(p.views) !== null);
  const avgViews = withViews.length ? withViews.reduce((s, p) => s + p.views, 0) / withViews.length : null;
  const formatMix = {};
  for (const p of inWindow) formatMix[p.type || 'other'] = (formatMix[p.type || 'other'] || 0) + 1;
  const ranked = withInteractions.slice().sort((a, b) => interactions(b) - interactions(a));
  const brief = (p) => (p ? { id: p.id, url: p.url || null, date: new Date(p.t).toISOString().slice(0, 10), interactions: interactions(p), views: num(p.views), caption: String(p.caption || '').slice(0, 120) } : null);
  // No readable posts is only 'no posts' when the account itself shows none; otherwise the rhythm is unknown, not zero.
  const unreadable = !dated.length && ((capture.posts || []).length > 0 || num(capture.profile?.postsTotal) > 0);
  const postsPerWeek = dated.length ? inWindow.length / (coverageDays / 7) : unreadable ? null : 0;
  let status;
  if (unreadable) status = 'unknown';
  else if (!(capture.posts || []).length) status = 'no_posts';
  else if (!dated.length) status = 'unknown';
  else if (daysSinceLastPost > inactiveAfterDays) status = 'inactive';
  else if (postsPerWeek < 1) status = 'irregular';
  else status = 'active';
  return {
    followers,
    postsTotal: num(capture.profile?.postsTotal),
    postsInWindow: inWindow.length,
    postsCaptured: (capture.posts || []).length,
    coverageDays: Math.round(coverageDays),
    partial,
    postsPerWeek: round(postsPerWeek, 1),
    daysSinceLastPost,
    lastPostDate: lastPost ? new Date(lastPost.t).toISOString().slice(0, 10) : null,
    formatMix,
    avgInteractions: round(avgInteractions, 0),
    avgViews: round(avgViews, 0),
    engagementRate: avgInteractions !== null && followers ? round((avgInteractions / followers) * 100, 2) : null,
    bestPost: brief(ranked[0]),
    worstPost: ranked.length > 1 ? brief(ranked[ranked.length - 1]) : null,
    status,
  };
}

function benchmarkFor(benchmarks, platform, industry) {
  const b = benchmarks?.platforms?.[platform];
  if (!b) return { postsPerWeek: null, engagementRate: null };
  const er = b.engagementRate ? b.engagementRate[industry] || b.engagementRate.general || null : null;
  return { postsPerWeek: b.postsPerWeek || null, engagementRate: er };
}

/**
 * brands: [{ id, name, role: 'client'|'competitor' }]
 * captures: normalized captures; statuses: { 'brandId:platform': 'not_found'|'skipped' } decided by the team.
 */
export function buildScorecard({ brands, captures, statuses = {}, benchmarks, industry = 'general', now = new Date() }) {
  const windowDays = benchmarks?.windowDays || 90;
  const inactiveAfterDays = benchmarks?.inactiveAfterDays || 60;
  const platforms = [...new Set([...captures.map((c) => c.platform), ...Object.keys(statuses).map((k) => k.split(':')[1])])].sort((a, b) => Object.keys(PLATFORM_NAMES).indexOf(a) - Object.keys(PLATFORM_NAMES).indexOf(b));
  return {
    industry,
    windowDays,
    platforms: platforms.map((platform) => {
      const rows = brands.map((brand) => {
        const capture = captures.find((c) => c.brandId === brand.id && c.platform === platform && ['ok', 'partial'].includes(c.status));
        const decided = statuses[`${brand.id}:${platform}`];
        if (capture && !decided) return { brandId: brand.id, name: brand.name, role: brand.role, state: 'captured', method: capture.method, url: capture.url, capturedAt: capture.capturedAt, edited: Boolean(capture.edited), metrics: platformMetrics(capture, { now, windowDays, inactiveAfterDays }) };
        return { brandId: brand.id, name: brand.name, role: brand.role, state: decided || 'missing', metrics: null };
      });
      const competitors = rows.filter((r) => r.role === 'competitor' && r.metrics);
      const client = rows.find((r) => r.role === 'client');
      const competitorMedian = competitors.length
        ? {
            brands: competitors.length,
            followers: median(competitors.map((r) => r.metrics.followers)),
            postsPerWeek: round(median(competitors.map((r) => r.metrics.postsPerWeek)), 1),
            avgInteractions: round(median(competitors.map((r) => r.metrics.avgInteractions)), 0),
            engagementRate: round(median(competitors.map((r) => r.metrics.engagementRate)), 2),
          }
        : null;
      return { platform, name: PLATFORM_NAMES[platform] || platform, rows, competitorMedian, benchmark: benchmarkFor(benchmarks, platform, industry), clientState: client?.state || 'missing' };
    }),
  };
}

const fmt = (n) => (n === null || n === undefined ? 'unknown' : Number(n).toLocaleString('en-US'));
const range = (b, unit = '') => (b.low === b.high ? `${b.low}${unit}` : `${b.low}–${b.high}${unit}`);

/**
 * Deterministic checks (evidence the diagnosis can cite) from a scorecard.
 * Returns [{ key, question, url, result, value, detail }] — keys are stable so re-running updates the same check id.
 */
export function scorecardChecks(scorecard) {
  const checks = [];
  for (const pl of scorecard.platforms) {
    const others = (row) => pl.rows.filter((r) => r.brandId !== row.brandId && r.metrics);
    for (const row of pl.rows) {
      const base = `social:${row.brandId}:${pl.platform}`;
      const who = `${row.name} · ${pl.name}`;
      if (row.state === 'not_found') {
        checks.push({ key: `${base}:presence`, question: `${who} account`, url: '', result: 'absent', value: '', detail: 'The team looked for this account and did not find one' });
        continue;
      }
      if (!row.metrics) continue;
      const m = row.metrics;
      const how = `captured ${String(row.capturedAt || '').slice(0, 10)} by ${row.method}${row.edited ? ' (numbers reviewed by the team)' : ''}`;
      const peers = others(row).map((r) => `${r.name} ${fmt(r.metrics.postsPerWeek)}/week`).join(', ');
      const bench = pl.benchmark.postsPerWeek ? `Reference: ${range(pl.benchmark.postsPerWeek)} posts/week (${pl.benchmark.postsPerWeek.source}).` : '';
      checks.push({
        key: `${base}:cadence`,
        question: `${who} posting rhythm (last ${scorecard.windowDays} days)`,
        url: row.url || '',
        result: 'value',
        value: m.lastPostDate ? `${fmt(m.postsPerWeek)} posts/week (${m.postsInWindow} posts${m.partial ? `, covering the last ${m.coverageDays} days only` : ''}); last post ${m.daysSinceLastPost} days ago (${m.lastPostDate})` : `${m.status === 'unknown' ? `posts could not be read (${m.postsCaptured} captured${m.postsTotal ? `, the account shows ${fmt(m.postsTotal)}` : ''}) — rhythm unknown` : 'no posts on the account'}`,
        detail: [bench, peers ? `Others: ${peers}.` : '', how].filter(Boolean).join(' '),
      });
      if (m.avgInteractions !== null) {
        const erBench = pl.benchmark.engagementRate ? `Reference engagement rate: ${range(pl.benchmark.engagementRate, '%')} (${pl.benchmark.engagementRate.source}; definitions differ between sources).` : '';
        const peerEr = others(row).filter((r) => r.metrics.engagementRate !== null).map((r) => `${r.name} ${r.metrics.engagementRate}%`).join(', ');
        checks.push({
          key: `${base}:engagement`,
          question: `${who} engagement per post (last ${scorecard.windowDays} days)`,
          url: row.url || '',
          result: 'value',
          value: `${fmt(m.avgInteractions)} interactions per post on average${m.engagementRate !== null ? `; ${m.engagementRate}% of ${fmt(m.followers)} followers` : ''}${m.avgViews !== null ? `; ${fmt(m.avgViews)} views per post` : ''}`,
          detail: [erBench, peerEr ? `Others: ${peerEr}.` : '', how].filter(Boolean).join(' '),
        });
      }
      if (Object.keys(m.formatMix).length) {
        checks.push({ key: `${base}:formats`, question: `${who} content formats (last ${scorecard.windowDays} days)`, url: row.url || '', result: 'value', value: Object.entries(m.formatMix).map(([k, v]) => `${k} ${v}`).join(', '), detail: how });
      }
      if (m.followers !== null) {
        checks.push({ key: `${base}:followers`, question: `${who} followers`, url: row.url || '', result: 'value', value: fmt(m.followers), detail: how });
      }
    }
  }
  return checks;
}
