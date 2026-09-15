// Page ownership, decided by code. Cases are the real wrong pages found on 2026-09-15.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileConfidence } from '../../engine/social/identity.js';

const dalcobond = { names: ['Dalcobond', 'دالكوبوند'], website: 'https://dalcobond.com' };

test('a profile that links the brand website is confirmed; links the brand or the team gave are trusted', () => {
  assert.equal(profileConfidence({ brand: dalcobond, candidate: { name: 'Dalco Bond', handle: 'dalcobond1', links: ['https://www.dalcobond.com/', 'https://instagram.com/dalcobond'] }, foundVia: 'ai' }).level, 'confirmed');
  assert.equal(profileConfidence({ brand: dalcobond, candidate: { name: 'Anything' }, foundVia: 'website' }).level, 'confirmed');
  assert.equal(profileConfidence({ brand: dalcobond, candidate: {}, foundVia: 'team' }).level, 'confirmed');
});

test("another company's page is rejected: different name, or a link to a different website", () => {
  const saudiCladding = profileConfidence({ brand: dalcobond, candidate: { name: 'سعودى كلادينج - Saudi Cladding', handle: 'Saudi.Cladding', links: [], followers: 8100 }, foundVia: 'ai' });
  assert.equal(saudiCladding.level, 'reject', JSON.stringify(saudiCladding));
  const alucopanelDubai = profileConfidence({ brand: { names: ['Alucopanel'], website: 'https://alucopanel.sa' }, candidate: { name: 'ALUCOPANEL', handle: 'alucopanel', links: ['https://alucopanel.net'], followers: 578 }, foundVia: 'ai' });
  assert.notEqual(alucopanelDubai.level, 'confirmed');
  assert.notEqual(alucopanelDubai.level, 'likely', 'a same-name company with another website is never "likely"');
  assert.match(alucopanelDubai.reasons.join(' '), /different website \(alucopanel\.net\)/);
});

test('a matching name and handle without a website link is likely, not confirmed; social links do not count as another website', () => {
  const r = profileConfidence({ brand: { names: ['Al-Marketer', 'الماركتير'], website: 'https://www.al-marketer.com' }, candidate: { name: 'Al-Marketer الماركتير', handle: 'almarketersa', links: ['https://calendly.com/almarketersa/30min', 'https://www.instagram.com/almarketerksa'], followers: 255, exactTypeaheadName: true }, foundVia: 'discovery' });
  assert.equal(r.level, 'likely', JSON.stringify(r));
  assert.ok(!r.reasons.some((x) => /different website/.test(x)));
});
