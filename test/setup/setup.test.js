// Setting up a new computer: finding Claude Code, the checklist a tester sees, and the package that must never carry
// a key or a client folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findClaude } from '../../ai/claude-bin.js';
import { runChecks, formatChecks } from '../../setup/doctor.js';
import { parseTar, findSecrets, savedKeyValues } from '../../setup/make-package.js';

const root = mkdtempSync(join(tmpdir(), 'alm-setup-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('Claude Code is found on PATH, in the official install folder right after installing, or reported missing', () => {
  const has = (list) => (f) => list.includes(f);
  const win = { platform: 'win32' };
  assert.equal(findClaude({ PATH: 'C:\\a;C:\\bin' }, { ...win, exists: has(['C:\\bin\\claude.exe']) }).bin, 'C:\\bin\\claude.exe');
  const fresh = findClaude({ PATH: 'C:\\a', USERPROFILE: 'C:\\Users\\sam' }, { ...win, exists: has(['C:\\Users\\sam\\.local\\bin\\claude.exe']) });
  assert.deepEqual(fresh, { bin: 'C:\\Users\\sam\\.local\\bin\\claude.exe', how: 'installed folder' }, 'PATH not refreshed yet after a fresh install');
  assert.equal(findClaude({ PATH: 'C:\\npm', USERPROFILE: 'C:\\Users\\sam' }, { ...win, exists: has(['C:\\npm\\claude.cmd']) }).how, 'npm-only');
  assert.equal(findClaude({ PATH: '', USERPROFILE: 'C:\\Users\\sam' }, { ...win, exists: () => false }).how, 'missing');
  assert.equal(findClaude({ ALM_CLAUDE_BIN: 'fake' }, win).bin, 'fake');
});

// A fake Claude CLI: --version, auth status --json and a -p answer, by scenario.
const fakeClaude = (status, answer = { result: 'OK', is_error: false, duration_ms: 2100 }) => async (bin, args) => {
  if (args[0] === '--version') return { stdout: '2.1.278 (Claude Code)\n', stderr: '' };
  if (args[0] === 'auth') return { stdout: JSON.stringify(status), stderr: '' };
  if (args[0] === '-p') return { stdout: JSON.stringify(answer), stderr: '' };
  return { stdout: '', stderr: 'unknown' };
};
const env = (extra = {}) => ({ ALM_CLAUDE_BIN: 'claude-test', PATH: '', ...extra });
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));
const fetchOk = async () => ({ status: 204 });

test('the checklist: signed in with a paid plan and a working answer is ready; each problem comes with its fix', async () => {
  const ok = byId(await runChecks({ env: env(), root, claudeTest: true, fetchImpl: fetchOk, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', email: 'someone@example.com' }) }));
  assert.equal(ok.claude.status, 'ok');
  assert.equal(ok.login.status, 'ok');
  assert.equal(ok.login.detail, 'Max plan');
  assert.equal(ok['claude-test'].status, 'ok');
  assert.equal(ok.internet.status, 'ok');
  assert.doesNotMatch(JSON.stringify(ok), /someone@example\.com/, 'the email address is never shown or written');

  const out = byId(await runChecks({ env: env(), root, fetchImpl: fetchOk, runImpl: fakeClaude({ loggedIn: false }) }));
  assert.equal(out.login.status, 'fail');
  assert.match(out.login.fix, /claude auth login/);

  const free = byId(await runChecks({ env: env(), root, fetchImpl: fetchOk, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'free' }) }));
  assert.equal(free.login.status, 'fail');
  assert.match(free.login.fix, /paid plan/);

  const api = byId(await runChecks({ env: env({ ANTHROPIC_API_KEY: 'x' }), root, fetchImpl: fetchOk, runImpl: fakeClaude({ loggedIn: true, authMethod: 'console_api_key' }) }));
  assert.equal(api.login.status, 'warn', 'billed per request, not the subscription');
  assert.equal(api.apikey.status, 'warn');

  const broken = byId(await runChecks({ env: env(), root, claudeTest: true, fetchImpl: fetchOk, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'pro' }, { is_error: true, result: 'Invalid API key' }) }));
  assert.equal(broken['claude-test'].status, 'fail');

  const missing = byId(await runChecks({ env: { PATH: '', USERPROFILE: root, LOCALAPPDATA: root }, root, quick: true, runImpl: fakeClaude({}) }));
  if (process.platform === 'win32') {
    assert.equal(missing.claude.status, 'fail');
    assert.match(missing.claude.fix, /SETUP\.cmd|install\.ps1/);
  }
  assert.ok(!missing.internet, 'the quick check before each start does not use the network');

  const offline = byId(await runChecks({ env: env(), root, fetchImpl: async () => { throw new TypeError('fetch failed'); }, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) }));
  assert.equal(offline.internet.status, 'fail');
});

test('a folder still inside the zip, or inside OneDrive, is named; the summary counts what must be fixed', async () => {
  const inZip = byId(await runChecks({ env: env(), root: 'C:\\Users\\sam\\AppData\\Local\\Temp\\Temp1_Al-Marketer.zip\\Al-Marketer', quick: true, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) }));
  assert.equal(inZip.folder.status, 'fail');
  assert.match(inZip.folder.fix, /Extract All/);
  const onedrive = byId(await runChecks({ env: env(), root: 'C:\\Users\\sam\\OneDrive\\Desktop\\Al-Marketer', quick: true, runImpl: fakeClaude({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) }));
  assert.equal(onedrive.folder.status, 'warn');
  const text = formatChecks([{ label: 'A', status: 'ok', detail: '' }, { label: 'B', status: 'fail', detail: 'x', fix: 'do y' }]);
  assert.match(text, /\[FAIL\] B - x\n {7}-> do y/);
  assert.match(text, /1 problem\(s\) must be fixed/);
  assert.equal(formatChecks([{ label: 'A', status: 'ok' }], { problemsOnly: true }), 'Everything is ready.');
});

// A minimal tar file like `git archive --format=tar` writes.
function tar(files) {
  const blocks = [];
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const h = Buffer.alloc(512);
    h.write(name, 0);
    h.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    h.write('0', 156);
    h.write('ustar', 257);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

test('the package: a saved key value or key-like text in any file stops it; only names are reported', () => {
  // Built here so this test file itself never contains key-like text (the package check reads it too).
  const fakeNotion = `${'ntn'}_${'A1b2'.repeat(10)}`;
  const entries = parseTar(tar({ 'README.md': 'hello', 'docs/x.md': `token: ${fakeNotion}`, 'app/y.js': 'const k = "my-own-secret-value-123";', 'img.png': 'AIza' + 'x'.repeat(35) }));
  assert.deepEqual(entries.map((e) => e.path), ['README.md', 'docs/x.md', 'app/y.js', 'img.png']);
  const hits = findSecrets(entries, [{ name: 'PAGESPEED_API_KEY', value: 'my-own-secret-value-123' }]);
  assert.deepEqual(hits.map((h) => [h.path, h.what]), [['docs/x.md', 'something that looks like a Notion token'], ['app/y.js', 'the saved value of PAGESPEED_API_KEY']]);
  assert.ok(!JSON.stringify(hits).includes('my-own-secret-value-123'), 'the value itself is never shown');

  writeFileSync(join(root, '.env.local'), 'PAGESPEED_API_KEY=my-own-secret-value-123\nSHORT=abc\n');
  writeFileSync(join(root, 'API-KEYS.txt'), '# Paste each key right after the = sign\nYOUTUBE_API_KEY=\n- Paste each key right after the = sign, like this\n');
  assert.deepEqual(savedKeyValues(root).map((v) => v.name), ['PAGESPEED_API_KEY'], 'empty keys, short values and instruction lines are not keys');
});
