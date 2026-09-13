import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, verifyQuote, arabicRatio, extractNumbers, toWesternDigits, wordCount } from '../../engine/util/text.js';

test('normalises Arabic letter variants, diacritics, tatweel, digits and spacing', () => {
  assert.equal(normalizeForMatch('إدارةُ  البـــراند ٢٨ منتجًا'), normalizeForMatch('ادارة البراند 28 منتجا'));
  assert.equal(normalizeForMatch('مكتبة «المحتوى»، والصور.'), 'مكتبه المحتوي والصور');
});

test('verifies quotes present in the source and rejects invented or too-short quotes', () => {
  const page = 'Hijab Store براند مصري متخصص في الملابس المحتشمة، وعنده حاليًا حوالي ٢٨ منتج.';
  assert.equal(verifyQuote('متخصص في الملابس المحتشمة', page).ok, true);
  assert.equal(verifyQuote('حوالي 28 منتج', page).ok, true);
  assert.equal(verifyQuote('عنده 40 منتج', page).ok, false);
  assert.equal(verifyQuote('براند', page).ok, false);
  assert.equal(verifyQuote('Hijab Store براند ... حوالي ٢٨ منتج', page).ok, true);
  assert.equal(verifyQuote('حوالي ٢٨ منتج ... Hijab Store براند', page).ok, false, 'parts must be in order');
});

test('Arabic ratio ignores allowed Latin brand terms and URLs', () => {
  assert.ok(arabicRatio('نبدأ بحملات Meta Ads على منتجات Hijab Store', ['Meta Ads', 'Hijab Store']) > 0.99);
  assert.ok(arabicRatio('We will run Meta campaigns') < 0.1);
});

test('extracts numbers including ranges and Arabic-Indic digits', () => {
  assert.deepEqual(extractNumbers('من ٥–٦ منتجات و 1,200 زيارة و3.5%'), [5, 6, 1200, 3.5]);
  assert.equal(toWesternDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(wordCount('عندنا [[تحديين رئيسيين]]'), 3);
});
