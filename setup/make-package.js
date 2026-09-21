// Builds the zip to give to a tester or a new computer:  npm run package
// - Only files committed to git are packed (so never .env.local, API-KEYS.txt, clients/, node_modules/, runtime/,
//   downloaded tools): commit first, then run this.
// - REF/ is left out: the Blueprint PDF and finished client proposals, which the app does not need to run.
// - Before writing the zip, every packed file is checked against the key values saved on this computer (.env.local,
//   API-KEYS.txt) and against common key formats. A match stops the build; only the key NAME and file are shown.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXCLUDE = ['REF'];
const KEY_FORMATS = [
  ['Notion token', /\b(ntn|secret)_[A-Za-z0-9]{30,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Apify token', /\bapify_api_[A-Za-z0-9]{30,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{30,}/],
  ['Meta token', /\bEAA[A-Za-z0-9]{80,}/],
  ['GitHub token', /\bgh[pous]_[A-Za-z0-9]{30,}/],
  ['SerpApi key', /\b(serpapi|api_key)[=:]\s*[a-f0-9]{64}\b/i],
];
const BINARY = /\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|otf|zip|exe)$/i;

// Reads a tar stream (what `git archive --format=tar` writes): [{ path, data }].
export function parseTar(buf) {
  const out = [];
  let pos = 0;
  let longPath = null;
  while (pos + 512 <= buf.length) {
    const h = buf.subarray(pos, pos + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(345, 500);
    const data = buf.subarray(pos + 512, pos + 512 + size);
    if (type === 'x') {
      const m = data.toString('utf8').match(/\d+ path=([^\n]*)\n/);
      longPath = m ? m[1] : null;
    } else if (type === '0' || type === '\0') {
      out.push({ path: longPath || (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100)), data });
      longPath = null;
    } else longPath = null;
    pos += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

// Saved key values on this computer (never printed): KEY=VALUE lines of .env.local and API-KEYS.txt.
export function savedKeyValues(root = ROOT) {
  const values = [];
  for (const f of ['.env.local', 'API-KEYS.txt']) {
    const file = join(root, f);
    if (!existsSync(file)) continue;
    for (const [name, value] of Object.entries(parseEnv(readFileSync(file, 'utf8').replace(/^\s*#.*$/gm, '')))) {
      const v = String(value || '').trim();
      if (/^[A-Z][A-Z0-9_]+$/.test(name) && v.length >= 12 && !/^(your|paste|xxx|<)/i.test(v)) values.push({ name, value: v });
    }
  }
  return values;
}

export function findSecrets(entries, values = []) {
  const hits = [];
  for (const { path, data } of entries) {
    if (BINARY.test(path)) continue;
    const text = data.toString('utf8');
    for (const { name, value } of values) if (text.includes(value)) hits.push({ path, what: `the saved value of ${name}` });
    for (const [what, re] of KEY_FORMATS) if (re.test(text)) hits.push({ path, what: `something that looks like a ${what}` });
  }
  return hits;
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024, ...opts });

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pathspec = ['--', '.', ...EXCLUDE.map((p) => `:(exclude)${p}`)];
  const changed = git(['status', '--porcelain', '--untracked-files=no']).toString().trim().split('\n').filter(Boolean);
  if (changed.length) console.log(`Note: ${changed.length} changed file(s) are not committed and are NOT in the package:\n${changed.map((l) => `  ${l}`).join('\n')}\n`);
  const commit = git(['rev-parse', '--short', 'HEAD']).toString().trim();
  const entries = parseTar(git(['archive', '--format=tar', 'HEAD', ...pathspec]));
  const hits = findSecrets(entries, savedKeyValues());
  if (hits.length) {
    console.log('STOPPED: the package would contain a key. Remove it from these files, commit, and run again:');
    for (const h of hits) console.log(`  ${h.path}: ${h.what}`);
    process.exit(1);
  }
  if (entries.some((e) => /^(clients|node_modules|runtime|REF)\//.test(e.path) || /(^|\/)(\.env\.local|API-KEYS\.txt)$/.test(e.path))) {
    console.log('STOPPED: private folders or key files were found in the package.');
    process.exit(1);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const zip = join(ROOT, 'dist', `Al-Marketer-${stamp}-${commit}.zip`);
  git(['archive', '--format=zip', '--prefix=Al-Marketer/', '-o', zip, 'HEAD', ...pathspec]);
  const mb = (statSync(zip).size / 1024 / 1024).toFixed(1);
  console.log(`Package ready: ${zip} (${mb} MB, ${entries.length} files, commit ${commit}).`);
  console.log(`Checked: no saved key value and no key-like text in any file; REF/, clients/, keys and downloads left out.`);
  // The real Desktop folder (it may be inside OneDrive).
  let desktop = join(os.homedir(), 'Desktop');
  try {
    desktop = execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { windowsHide: true }).toString().trim() || desktop;
  } catch {}
  if (process.argv.includes('--desktop') && existsSync(desktop)) {
    const copy = join(desktop, `Al-Marketer for testing (${stamp}).zip`);
    copyFileSync(zip, copy);
    console.log(`Copied to the Desktop: ${copy}`);
  }
}
