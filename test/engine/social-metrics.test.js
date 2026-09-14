import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformMetrics, buildScorecard, scorecardChecks, median, interactions } from '../../engine/social/metrics.js';

const benchmarks = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'rules', 'social-benchmarks.json'), 'utf8'));
const now = '2026-09-14T12:00:00Z';
const daysAgo = (d) => new Date(Date.parse(now) - d * 86_400_000).toISOString();
const post = (d, extra = {}) => ({ id: `p${d}`, date: daysAgo(d), type: 'image', likes: 10, comments: 2, shares: 0, ...extra });

test('posting rhythm counts only posts inside the 90-day window and reports days since the last post', () => {
  const m = platformMetrics({ capturedAt: now, profile: { followers: 1000 }, posts: [post(3), post(10), post(40), post(89), post(120), post(200)] });
  assert.equal(m.postsInWindow, 4);
  assert.equal(m.postsPerWeek, 0.3); // 4 posts / (90/7) weeks
  assert.equal(m.daysSinceLastPost, 3);
  assert.equal(m.lastPostDate, '2026-09-11');
  assert.equal(m.partial, false);
  assert.equal(m.status, 'irregular');
});

test('a capture cut off at the method limit is measured over the period it covers and marked partial', () => {
  const posts = Array.from({ length: 30 }, (_, i) => post(i));
  const m = platformMetrics({ capturedAt: now, profile: { followers: 5000 }, posts, limit: 30 });
  assert.equal(m.partial, true);
  assert.equal(m.coverageDays, 29);
  assert.ok(m.postsPerWeek > 7, `expected daily posting, got ${m.postsPerWeek}`);
  assert.equal(m.status, 'active');
});

test('engagement is by followers, only from posts that have numbers; views are averaged separately', () => {
  const m = platformMetrics({ capturedAt: now, profile: { followers: 2000 }, posts: [post(1, { likes: 30, comments: 10, shares: 0, views: 1000 }), post(2, { likes: 10, comments: 0, shares: 0, views: 3000 }), post(3, { likes: null, comments: null, shares: null })] });
  assert.equal(m.avgInteractions, 25);
  assert.equal(m.engagementRate, 1.25);
  assert.equal(m.avgViews, 2000);
  assert.equal(m.bestPost.interactions, 40);
  assert.equal(m.worstPost.interactions, 10);
});

test('inactive and empty accounts are classified, and unknown numbers stay unknown', () => {
  const inactive = platformMetrics({ capturedAt: now, profile: { followers: 34 }, posts: [post(75), post(3000, { likes: 13, comments: 2 })] });
  assert.equal(inactive.status, 'inactive');
  assert.equal(inactive.avgInteractions, 12, 'only the post inside the window counts');
  assert.equal(platformMetrics({ capturedAt: now, profile: { followers: 34 }, posts: [post(3000)] }).engagementRate, null, 'no recent posts → no engagement rate');
  const empty = platformMetrics({ capturedAt: now, profile: {}, posts: [] });
  assert.equal(empty.status, 'no_posts');
  assert.equal(empty.engagementRate, null);
  assert.equal(empty.followers, null);
  assert.equal(interactions({ likes: null, comments: undefined }), null);
  assert.equal(median([3, 1, 2, null]), 2);
});

test('scorecard compares the client with the competitors\' median and the industry reference, and turns it into checks', () => {
  const brands = [{ id: 'client', name: 'Technopanel', role: 'client' }, { id: 'c1', name: 'Rival A', role: 'competitor' }, { id: 'c2', name: 'Rival B', role: 'competitor' }, { id: 'c3', name: 'Rival C', role: 'competitor' }];
  const cap = (brandId, posts, followers) => ({ brandId, platform: 'linkedin', url: `https://www.linkedin.com/company/${brandId}/`, method: 'assisted', status: 'ok', capturedAt: now, profile: { followers }, posts });
  const captures = [
    cap('client', [post(12), post(50)], 2093),
    cap('c1', Array.from({ length: 26 }, (_, i) => post(i * 3, { likes: 40 })), 9000),
    cap('c2', Array.from({ length: 13 }, (_, i) => post(i * 6, { likes: 20 })), 4000),
  ];
  const sc = buildScorecard({ brands, captures, statuses: { 'c3:linkedin': 'not_found' }, benchmarks, industry: 'manufacturing', now });
  const li = sc.platforms.find((x) => x.platform === 'linkedin');
  assert.equal(li.rows.find((r) => r.brandId === 'client').metrics.postsPerWeek, 0.2);
  assert.equal(li.competitorMedian.brands, 2);
  assert.equal(li.competitorMedian.postsPerWeek, 1.5);
  assert.equal(li.benchmark.engagementRate.low, 4.0);
  assert.equal(li.rows.find((r) => r.brandId === 'c3').state, 'not_found');

  const checks = scorecardChecks(sc);
  const cadence = checks.find((c) => c.key === 'social:client:linkedin:cadence');
  assert.match(cadence.value, /0\.2 posts\/week \(2 posts\); last post 12 days ago/);
  assert.match(cadence.detail, /Reference: 2–5 posts\/week/);
  assert.match(cadence.detail, /Rival A 2\/week, Rival B 1\/week/); // 26 and 13 posts in 90 days
  assert.ok(checks.some((c) => c.key === 'social:c3:linkedin:presence' && c.result === 'absent'));
  assert.ok(checks.some((c) => c.key === 'social:client:linkedin:followers' && c.value === '2,093'));
  // The same input always gives the same checks (stable keys, no randomness).
  assert.deepEqual(scorecardChecks(buildScorecard({ brands, captures, statuses: { 'c3:linkedin': 'not_found' }, benchmarks, industry: 'manufacturing', now })), checks);
});
