import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardChunks, buildDeck } from '../../render/deck.js';
import { loadCatalogAndRules } from '../../engine/rules/load.js';
import { buildPlan } from '../../engine/plan/build.js';
import { assembleDeck } from '../../engine/proposal/assemble.js';

const sample = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples', 'hijab-store');

test('cards are spread over the fewest slides, evenly, larger chunks first', () => {
  const sizes = (max, n) => cardChunks(max)(n).join('+');
  assert.equal(sizes(3, 3), '3');
  assert.equal(sizes(3, 4), '2+2');
  assert.equal(sizes(3, 5), '3+2');
  assert.equal(sizes(3, 7), '3+2+2');
  assert.equal(sizes(4, 4), '4');
  assert.equal(sizes(4, 6), '3+3');
  for (const max of [1, 2, 3, 4]) for (let n = 1; n <= 12; n++) {
    const parts = cardChunks(max)(n);
    assert.equal(parts.reduce((a, b) => a + b, 0), n);
    assert.ok(parts.every((x) => x >= 1 && x <= max));
    assert.equal(parts.length, Math.ceil(n / max));
  }
});

test('the deck follows the Blueprint section order and never hides an item', () => {
  const input = JSON.parse(readFileSync(join(sample, 'plan-input.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(sample, 'content.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  const model = assembleDeck({ client: input.client, content, plan });
  // v2: the executive summary opens and next steps close; both are built by code around the 11 Blueprint sections.
  const order = ['cover', 'summary', 'business', 'brand', 'problems', 'impact', 'solutions', 'expected', 'map', 'weeks', 'kpis', 'tracking', 'next'];
  for (const layout of [{}, { problems: 1, impact: 1, solutions: 1, expected: 1, brand: 'split', problemsVariant: 'rows' }]) {
    const deck = buildDeck(model, layout);
    const sections = [...new Set(deck.slides.map((s) => s.section))];
    assert.deepEqual(sections, order);
    const count = (cls) => (deck.html.match(new RegExp(`class="card ${cls}`, 'g')) || []).length;
    assert.equal(count('impact-card'), model.impact.items.length);
  }
});

test('the client logo sits next to the Al-Marketer logo on the cover, and the deck closes with the contact slide', async () => {
  const { ctaModel, formatPhone } = await import('../../engine/proposal/cta.js');
  const input = JSON.parse(readFileSync(join(sample, 'plan-input.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(sample, 'content.json'), 'utf8'));
  const agency = JSON.parse(readFileSync(join(sample, '..', '..', 'rules', 'agency.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  const logo = { dataUri: 'data:image/png;base64,iVBORw0KGgo=', tone: 'light' };
  const model = assembleDeck({ client: { ...input.client, logo }, content, plan, agency });
  const deck = buildDeck(model);
  assert.equal(deck.slides.at(-1).section, 'cta', 'the call to action is the last slide');
  const cover = deck.html.slice(deck.html.indexOf('data-section="cover"'), deck.html.indexOf('data-section="summary"'));
  assert.match(cover, /class="client-logo on-dark"/, 'a light logo gets a dark box');
  assert.doesNotMatch(cover, /class="sun"|class="mascot"/, 'the cover art is one flattened picture');
  const cta = deck.html.slice(deck.html.indexOf('data-section="cta"'));
  assert.match(cta, /href="https:\/\/wa\.me\/966543348930\?text=/);
  assert.match(cta, /siteservicerequest@al-marketer\.com/);
  assert.match(cta, /<svg class="qr"/);
  assert.equal(formatPhone('+966543348930'), '+966 54 334 8930');
  assert.equal(ctaModel({}, {}), null, 'no contact details, no slide');
  assert.equal(buildDeck(assembleDeck({ client: input.client, content, plan })).slides.at(-1).section, 'next', 'without agency details the deck ends with next steps');
});
