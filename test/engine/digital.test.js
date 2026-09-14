import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScorecard } from '../../engine/social/metrics.js';
import { digitalModel } from '../../engine/proposal/digital.js';
import { buildDeck } from '../../render/deck.js';
import { loadCatalogAndRules } from '../../engine/rules/load.js';
import { buildPlan } from '../../engine/plan/build.js';
import { assembleDeck } from '../../engine/proposal/assemble.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const benchmarks = JSON.parse(readFileSync(join(root, 'rules', 'social-benchmarks.json'), 'utf8'));
const now = '2026-09-14T12:00:00Z';
const daysAgo = (d) => new Date(Date.parse(now) - d * 86_400_000).toISOString();
const post = (d, extra = {}) => ({ id: `p${d}`, date: daysAgo(d), type: 'image', likes: 10, comments: 2, shares: 0, ...extra });
const brands = [{ id: 'client', name: 'Technopanel', role: 'client' }, { id: 'c1', name: 'Rival A', role: 'competitor' }, { id: 'c2', name: 'Rival B', role: 'competitor' }];
const cap = (brandId, platform, posts, followers) => ({ brandId, platform, url: `https://example.com/${platform}/${brandId}`, method: 'test', status: 'ok', capturedAt: now, profile: { followers }, posts });

function scorecard() {
  return buildScorecard({
    brands,
    captures: [
      cap('client', 'tiktok', [post(66), post(80)], 460),
      cap('c1', 'tiktok', Array.from({ length: 20 }, (_, i) => post(i * 4, { likes: 50 })), 12000),
      cap('client', 'linkedin', [post(12), post(50)], 2093),
      cap('c1', 'linkedin', Array.from({ length: 26 }, (_, i) => post(i * 3, { likes: 40 })), 9000),
      cap('c2', 'linkedin', Array.from({ length: 13 }, (_, i) => post(i * 6, { likes: 20 })), 4000),
      cap('c1', 'instagram', Array.from({ length: 30 }, (_, i) => post(i * 2)), 30000),
      cap('c2', 'youtube', [post(400)], 100),
    ],
    statuses: { 'client:instagram': 'not_found' },
    benchmarks,
    industry: 'manufacturing',
    now,
  });
}

test('digital slide model: code picks the comparable platforms, LinkedIn first, and copies the scorecard numbers', () => {
  const d = digitalModel(scorecard());
  // YouTube has no client row with numbers and the client was never marked absent there -> not shown.
  assert.deepEqual(d.platforms.map((x) => x.platform), ['linkedin', 'tiktok', 'instagram']);
  const li = d.platforms[0];
  assert.equal(li.status, 'irregular');
  assert.equal(li.client.followers, 2093);
  assert.equal(li.competitors.brands, 2);
  assert.equal(li.competitors.postsPerWeek, 1.5);
  assert.equal(li.referencePostsPerWeek, '2–5');
  assert.equal(d.platforms[1].statusAr, 'متوقف عن النشر');
  // Instagram: client not on the platform while a competitor is -> shown last, without client numbers.
  assert.equal(d.platforms[2].client, null);
  assert.equal(d.platforms[2].status, 'not_found');
  assert.equal(digitalModel(scorecard(), { max: 1 }).platforms.length, 1);
  assert.equal(digitalModel(null), null);
  assert.equal(digitalModel({ windowDays: 90, platforms: [] }), null);
});

test('the digital slide sits in the brand section and is left out when there is no social audit', () => {
  const sample = join(root, 'samples', 'hijab-store');
  const input = JSON.parse(readFileSync(join(sample, 'plan-input.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(sample, 'content.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });

  const without = buildDeck(assembleDeck({ client: input.client, content, plan }), {});
  assert.equal((without.html.match(/class="card digital-card/g) || []).length, 0);

  const withSocial = buildDeck(assembleDeck({ client: input.client, content, plan, scorecard: scorecard() }), {});
  assert.equal(withSocial.slides.length, without.slides.length + 1);
  assert.equal((withSocial.html.match(/class="card digital-card/g) || []).length, 3);
  const brandCount = (deck) => deck.slides.filter((x) => x.section === 'brand').length;
  assert.equal(brandCount(withSocial), brandCount(without) + 1);
  assert.deepEqual([...new Set(withSocial.slides.map((x) => x.section))], [...new Set(without.slides.map((x) => x.section))]);
  assert.ok(withSocial.html.includes('2,093'));
});
