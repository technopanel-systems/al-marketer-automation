// Settings & keys: keys are saved to .env.local without ever being shown; retired keys can be removed; tests never
// echo the key back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KEYS, keyStatus, saveKeys, removeKeys, importKeyFile, retiredKeysSaved, testKey, savedKeyNames } from '../../app/settings.js';
import { settingsPage } from '../../app/views/settings.js';

const root = mkdtempSync(join(tmpdir(), 'alm-settings-'));
after(() => rmSync(root, { recursive: true, force: true }));
const SECRET = 'AIzaSyTESTKEY-1234567890abcdef';

test('saving keeps other lines, replaces the same key, is usable at once, and skips blanks and junk', () => {
  writeFileSync(join(root, '.env.local'), 'NOTION_TOKEN=ntn_old_value_123456\nMETA_ACCESS_TOKEN=EAAB-old-token-value\nOTHER=1\n');
  const env = {};
  const r = saveKeys(root, { PAGESPEED_API_KEY: ` ${SECRET} `, NOTION_TOKEN: 'ntn_new_value_654321', YOUTUBE_API_KEY: '', APIFY_TOKEN: 'has spaces in it', NOT_A_KEY: 'x'.repeat(20) }, env);
  assert.deepEqual(r.saved.sort(), ['NOTION_TOKEN', 'PAGESPEED_API_KEY']);
  assert.deepEqual(r.rejected, ['APIFY_TOKEN']);
  assert.equal(env.PAGESPEED_API_KEY, SECRET);
  const file = readFileSync(join(root, '.env.local'), 'utf8');
  assert.match(file, /^OTHER=1$/m);
  assert.equal(file.match(/NOTION_TOKEN=/g).length, 1);
  assert.match(file, /NOTION_TOKEN=ntn_new_value_654321/);
  assert.doesNotMatch(file, /NOT_A_KEY/);

  const status = Object.fromEntries(keyStatus(root, env).map((s) => [s.name, s.state]));
  assert.equal(status.PAGESPEED_API_KEY, 'active');
  assert.equal(status.NOTION_TOKEN, 'active');
  assert.equal(status.YOUTUBE_API_KEY, 'missing');
  assert.equal(keyStatus(root, {}).find((s) => s.name === 'NOTION_TOKEN').state, 'saved', 'in the file but not loaded yet');
  assert.deepEqual(retiredKeysSaved(root), ['META_ACCESS_TOKEN']);
});

test('removing a key and the retired keys; nothing else is touched', () => {
  const env = { META_ACCESS_TOKEN: 'x', PAGESPEED_API_KEY: SECRET };
  assert.deepEqual(removeKeys(root, ['META_ACCESS_TOKEN', 'IG_BUSINESS_ACCOUNT_ID', 'OTHER'], env), ['META_ACCESS_TOKEN']);
  assert.equal(env.META_ACCESS_TOKEN, undefined);
  assert.deepEqual(retiredKeysSaved(root), []);
  assert.ok(savedKeyNames(root).includes('OTHER'), 'a line the settings page does not own stays');
  removeKeys(root, ['PAGESPEED_API_KEY'], env);
  assert.equal(env.PAGESPEED_API_KEY, undefined);
  assert.ok(!savedKeyNames(root).includes('PAGESPEED_API_KEY'));
});

test('importing API-KEYS.txt takes only filled-in keys the system uses', () => {
  writeFileSync(join(root, 'API-KEYS.txt'), '# instructions\nPAGESPEED_API_KEY=\nYOUTUBE_API_KEY = AIzaYouTubeKey0987654321\nMETA_ACCESS_TOKEN=EAAB-something\n  # APIFY_TOKEN=commented\n');
  const env = {};
  const r = importKeyFile(root, env);
  assert.deepEqual(r.saved, ['YOUTUBE_API_KEY']);
  assert.deepEqual(r.ignored, ['META_ACCESS_TOKEN']);
  assert.equal(env.YOUTUBE_API_KEY, 'AIzaYouTubeKey0987654321');
  assert.equal(importKeyFile(mkdtempSync(join(tmpdir(), 'alm-nokeys-'))).found, false);
});

test('testing a key reports the service answer without the key itself', async () => {
  const calls = [];
  const fake = (status, body) => async (url, init) => {
    calls.push({ url: String(url), init });
    return { status, json: async () => body };
  };
  const bad = await testKey('YOUTUBE_API_KEY', SECRET, { fetchImpl: fake(400, { error: { message: `API key not valid: ${SECRET}` } }) });
  assert.equal(bad.ok, false);
  assert.ok(!bad.text.includes(SECRET), 'the key is never echoed back');
  assert.match(bad.text, /API key not valid/);
  assert.equal((await testKey('APIFY_TOKEN', 'apify_api_x', { fetchImpl: fake(200, { data: { isPaying: true } }) })).ok, false, 'a paid Apify plan is refused');
  assert.equal((await testKey('APIFY_TOKEN', 'apify_api_x', { fetchImpl: fake(200, { data: { isPaying: false } }) })).ok, true);
  assert.match(calls.at(-1).init.headers.authorization, /^Bearer /);
  assert.match((await testKey('NOTION_TOKEN', 'ntn_x', { fetchImpl: fake(200, { name: 'Catalog bot' }) })).text, /Catalog bot/);
  assert.equal((await testKey('NOTION_TOKEN', '')).text, 'Not set.');
  const offline = await testKey('PAGESPEED_API_KEY', SECRET, { fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.match(offline.text, /network error/);
});

test('the page lists every key with its status and never a value', () => {
  const html = settingsPage({ status: KEYS.map((k, i) => ({ name: k.name, state: i === 0 ? 'active' : 'missing' })), retired: ['META_ACCESS_TOKEN'], keyFile: true, tools: { chromium: true, ytdlp: false }, agency: { website: 'https://www.al-marketer.com', whatsapp: '+966', socials: {} } });
  for (const k of KEYS) assert.ok(html.includes(k.name));
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /value="[^"]{8,}"[^>]*type="password"|type="password"[^>]*value="[^"]{8,}"/);
  assert.match(html, /Keys the system no longer uses/);
  assert.match(html, /Import from API-KEYS\.txt/);
  assert.match(html, /claude-|haiku|sonnet|opus/);
});
