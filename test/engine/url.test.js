import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWebsite, bareWebsite, cleanLinks } from '../../engine/util/url.js';

test('a website can be typed with or without https:// and www', () => {
  assert.equal(cleanWebsite('example.com'), 'https://example.com');
  assert.equal(cleanWebsite('www.Example.com/'), 'https://www.example.com');
  assert.equal(cleanWebsite('  http://example.com/ar/  '), 'http://example.com/ar');
  assert.equal(cleanWebsite('https://m-alshareef.com/#top'), 'https://m-alshareef.com');
  assert.equal(cleanWebsite('shop.example.com.sa/products?id=2'), 'https://shop.example.com.sa/products?id=2');
  assert.equal(cleanWebsite('//cdn.example.com'), 'https://cdn.example.com');
});

test('things that are not websites are refused', () => {
  for (const bad of ['', '   ', 'hello', 'mailto:a@b.com', 'javascript:alert(1)', 'ftp://example.com', 'localhost', 'http://', 'مصنع']) assert.equal(cleanWebsite(bad), '', bad);
});

test('bare form for display, and pasted lists are cleaned and de-duplicated', () => {
  assert.equal(bareWebsite('https://www.al-marketer.com/'), 'al-marketer.com');
  assert.deepEqual(cleanLinks('instagram.com/brand, https://instagram.com/brand\ntiktok.com/@brand  nonsense'), ['https://instagram.com/brand', 'https://tiktok.com/@brand']);
  assert.deepEqual(cleanLinks(['linkedin.com/company/x/', '']), ['https://linkedin.com/company/x']);
});
