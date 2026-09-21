// Builds the zip to give to a tester or a new computer:  npm run package
// (npm run package:full makes a complete copy instead: proposals, REF and keys included; see fullPackage below.)
// - Only files committed to git are packed (so never .env.local, API-KEYS.txt, clients/, node_modules/, runtime/,
//   downloaded tools): commit first, then run this.
// - REF/ is left out: the Blueprint PDF and finished client proposals, which the app does not need to run.
// - Before writing the zip, every packed file is checked against the key values saved on this computer (.env.local,
//   API-KEYS.txt) and against common key formats. A match stops the build; only the key NAME and file are shown.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { makeZip, readZip } from './zip.js';
import { RETIRED_KEYS } from '../app/settings.js';
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

// ---------- full copy (npm run package:full) ----------
// Everything in the project folder as it is on this computer (proposals, REF, keys, catalog reports), except what each
// computer makes for itself (Node.js, components, downloads), the git history (so the copy cannot push to the owner's
// backup) and the retired Instagram/Meta keys (unused, and a Facebook token opens the owner's business assets).
export const FULL_SKIP = [/^\.git\//, /^node_modules\//, /^runtime\//, /^dist\//, /^tools\//, /^clients\/_trash\//, /^samples\/out\//, /^spikes\/output\//, /^tmp\//, /^\.claude\/settings\.local\.json$/, /^setup-report\.txt$/, /\.log$/];

export function listProjectFiles(root, dir = '') {
  const out = [];
  for (const d of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${d.name}` : d.name;
    if (d.isSymbolicLink()) continue;
    if (d.isDirectory()) {
      if (!FULL_SKIP.some((re) => re.test(`${rel}/`))) out.push(...listProjectFiles(root, rel));
    } else if (d.isFile() && !FULL_SKIP.some((re) => re.test(rel))) out.push(rel);
  }
  return out;
}

export function withoutRetiredKeys(text, retired = Object.keys(RETIRED_KEYS)) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.split(/\r?\n/).filter((line) => !retired.some((n) => new RegExp(`^\\s*${n}\\s*=`).test(line))).join(eol);
}

export function packageInfo({ date, commit, proposals, keys }) {
  return [
    `AL-MARKETER - FULL COPY (made ${date} from version ${commit})`,
    '',
    'A complete copy of the Al-Marketer system as it is on the owner\'s computer:',
    `- Proposals (${proposals.length}): ${proposals.join(', ') || 'none'} - in the "clients" folder, with all files.`,
    `- Keys (${keys.length}): ${keys.join(', ') || 'none'} - already saved, they work at once (Settings & keys).`,
    '- The catalog, rules, reference files (REF) and everything the app uses.',
    '',
    'Not included, SETUP.cmd makes them for this computer: Node.js, the app components, the browser, yt-dlp.',
    'Not included on purpose: the owner\'s GitHub history, and unused Instagram/Meta keys.',
    '',
    'Claude: sign in with YOUR OWN Claude account (Pro or Max) when SETUP.cmd asks (step 5).',
    'This copy works on its own from then on: proposals made here are not synced with the owner\'s computer.',
    '',
    'PRIVATE: this zip holds the owner\'s keys and client proposals. Do not share it further.',
    'Next: open START-HERE.txt.',
    '',
  ].join('\r\n');
}

function fullPackage() {
  const commit = git(['rev-parse', '--short', 'HEAD']).toString().trim();
  const date = new Date().toISOString().slice(0, 10);
  const files = listProjectFiles(ROOT);
  const entries = files.map((rel) => {
    let data = readFileSync(join(ROOT, rel));
    if (rel === '.env.local' || rel === 'API-KEYS.txt') data = Buffer.from(withoutRetiredKeys(data.toString('utf8')), 'utf8');
    return { name: `Al-Marketer/${rel}`, data, mtime: statSync(join(ROOT, rel)).mtime };
  });
  const proposals = existsSync(join(ROOT, 'clients')) ? readdirSync(join(ROOT, 'clients'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(ROOT, 'clients', d.name, 'intake.json'))).map((d) => d.name) : [];
  const envFile = join(ROOT, '.env.local');
  const keys = existsSync(envFile) ? Object.entries(parseEnv(readFileSync(envFile, 'utf8'))).filter(([k, v]) => /^[A-Z][A-Z0-9_]+$/.test(k) && v && !(k in RETIRED_KEYS)).map(([k]) => k) : [];
  entries.push({ name: 'Al-Marketer/PACKAGE-INFO.txt', data: Buffer.from(packageInfo({ date, commit, proposals, keys }), 'utf8') });
  const zipBuf = makeZip(entries);
  const back = readZip(zipBuf);
  if (back.length !== entries.length || back.some((e) => !e.ok)) throw new Error('The zip did not read back correctly');
  if (back.some((e) => /(^|\/)(\.env\.local|API-KEYS\.txt)$/.test(e.name) && Object.keys(RETIRED_KEYS).some((n) => new RegExp(`^\\s*${n}\\s*=`, 'm').test(e.data.toString('utf8'))))) throw new Error('A retired key is still in the copy');
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const zip = join(ROOT, 'dist', `Al-Marketer-FULL-${date}-${commit}.zip`);
  writeFileSync(zip, zipBuf);
  console.log(`Full copy ready: ${zip} (${(zipBuf.length / 1024 / 1024).toFixed(1)} MB, ${entries.length} files).`);
  console.log(`Proposals: ${proposals.join(', ') || 'none'}. Keys: ${keys.join(', ') || 'none'} (values included, never shown here).`);
  console.log('Left out: .git, node_modules, runtime, tools, dist, and the retired Instagram/Meta keys.');
  return { zip, date, name: `Al-Marketer FULL copy (${date}).zip` };
}

function copyToDesktop(zip, name) {
  // The real Desktop folder (it may be inside OneDrive).
  let desktop = join(os.homedir(), 'Desktop');
  try {
    desktop = execFileSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { windowsHide: true }).toString().trim() || desktop;
  } catch {}
  if (!existsSync(desktop)) return;
  copyFileSync(zip, join(desktop, name));
  console.log(`Copied to the Desktop: ${join(desktop, name)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--full')) {
  const r = fullPackage();
  if (process.argv.includes('--desktop')) copyToDesktop(r.zip, r.name);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
  if (process.argv.includes('--desktop')) copyToDesktop(zip, `Al-Marketer for testing (${stamp}).zip`);
}
