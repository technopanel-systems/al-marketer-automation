// "Is Claude up to date, and which model is it using?" — one double-click on UPDATE-CLAUDE.cmd.
// Updates the Claude Code program, then asks Claude itself, live, which model answers for each job and prints the
// real version (for example claude-opus-5-5). The system never names a version anywhere: each step asks for
// haiku / sonnet / opus (ai/models.js) and Claude Code answers with the newest model of that family, so a new
// Opus or Sonnet is used on the next run by itself.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findClaude } from '../ai/claude-bin.js';
import { MODELS } from '../ai/models.js';
import { readRuns } from '../pipeline/usage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 63;
const FAMILIES = [
  ['opus', 'Thinking'],
  ['sonnet', 'Working'],
  ['haiku', 'Reading'],
];
// Short job names, so each line stays on one row in a small black window.
const JOBS = {
  notes: 'meeting notes',
  'notes-long': 'long notes',
  competitors: 'competitors',
  research: 'research',
  'business-analyst': 'business',
  diagnose: 'diagnosis',
  review: 'review',
  write: 'writing',
  'language-review': 'language',
  edit: 'edits',
  report: 'report',
};

const run = (bin, args, { timeoutMs = 30_000, env = process.env } = {}) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, env, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });

// Without the variables of a Claude Code session this may be started from, the CLI behaves as it does for the app.
const cleanEnv = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^CLAUDE_?CODE|^CLAUDECODE$|^CLAUDE_PID$/.test(k)));

export const parseVersion = (text) => (/(\d+\.\d+\.\d+)/.exec(String(text || '')) || ['', ''])[1];

// What `claude update` did, judged by the version before and after — not by the wording of the message.
export function updateOutcome({ before = '', after = '', output = '', failed = false } = {}) {
  const text = String(output || '');
  const now = after || before || 'unknown';
  if (after && before && after !== before) return { status: 'updated', line: `Updated: ${before} -> ${after}. Now the newest.` };
  if (/unknown command|unrecognized|not a valid|did you mean/i.test(text)) return { status: 'auto', line: `Version ${now} - this one keeps itself up to date.` };
  if (failed) return { status: 'failed', line: `Version ${now} - could not check for a newer one just now.` };
  return { status: 'current', line: `Version ${now} - already the newest.` };
}

// The real model id inside one headless answer, for the family that was asked (a run may also use a small helper model).
export function pickModelId(parsed, family) {
  const ids = parsed?.modelUsage ? Object.keys(parsed.modelUsage) : [];
  return ids.find((m) => String(m).includes(family)) || '';
}

// The jobs each family does, from ai/models.js: the first few, then "+N more".
export function jobsFor(family, models = MODELS, max = 2) {
  const all = Object.entries(models).filter(([, row]) => row.model === family).map(([step]) => JOBS[step] || step);
  return all.length > max ? `${all.slice(0, max).join(', ')} +${all.length - max}` : all.join(', ');
}

// The model that last answered for each family on this computer (used when Claude cannot be asked right now).
export function lastAnswered(runs = []) {
  const seen = new Map();
  for (const r of runs) {
    const family = String(r?.model || '');
    const id = (Array.isArray(r?.models) ? r.models : []).find((m) => String(m).includes(family));
    const at = String(r?.at || '');
    if (!id || !at) continue;
    if (!seen.has(family) || at > seen.get(family).at) seen.set(family, { id, at });
  }
  return Object.fromEntries(seen);
}

export const modelLine = (label, id, jobs) => `   ${label.padEnd(10)}${String(id).padEnd(28)}${jobs}`.trimEnd();

// The last block of the window: one clear answer, or a short numbered list of what to do.
export function verdictBlock(issues = []) {
  const bar = '  '.concat('='.repeat(WIDTH));
  if (!issues.length) return [bar, '   ALL GOOD - nothing to do. Close this window.', bar];
  return [bar, `   ${issues.length} THING${issues.length > 1 ? 'S' : ''} TO DO:`, ...issues.map((t, i) => `   ${i + 1}. ${t}`), bar];
}

function clientRunLogs(root = ROOT) {
  const dir = process.env.ALM_CLIENTS_DIR || join(root, 'clients');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name, 'logs', 'runs.jsonl'))
    .filter((f) => existsSync(f));
}

// One very short question per family, only to learn which model answers today.
async function askWhichModel(bin, family, env) {
  const args = ['-p', 'OK', '--model', family, '--output-format', 'json', '--system-prompt', 'Reply with the single word OK.',
    '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--tools', ''];
  const r = await run(bin, args, { timeoutMs: 150_000, env });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {}
  const text = `${r.stdout}\n${r.stderr}\n${parsed?.result || ''}`;
  return { id: pickModelId(parsed, family), limit: /usage limit|rate limit/i.test(text) };
}

async function main() {
  const env = cleanEnv(process.env);
  const out = (s = '') => console.log(s);
  const rule = () => out('  '.concat('-'.repeat(WIDTH)));
  const bar = () => out('  '.concat('='.repeat(WIDTH)));
  const issues = [];
  const d = new Date();
  const today = `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;

  out('');
  bar();
  out(`   CLAUDE CHECK${' '.repeat(Math.max(1, WIDTH - 15 - today.length))}${today}`);
  bar();
  out('');

  const claude = findClaude(process.env);
  if (claude.how === 'missing' || claude.how === 'npm-only') {
    out('   Claude Code is not installed the way this system needs it.');
    out('');
    for (const line of verdictBlock(['Close this window and double-click SETUP.cmd in this folder.'])) out(line);
    out('');
    process.exitCode = 1;
    return;
  }

  out('   Working... about 30 seconds. Please wait.');
  out('   (it asks Claude three one-word questions: less than one cent)');

  const before = parseVersion((await run(claude.bin, ['--version'], { env })).stdout);
  const upd = await run(claude.bin, ['update'], { timeoutMs: 300_000, env });
  const after = parseVersion((await run(claude.bin, ['--version'], { env })).stdout) || before;
  const version = updateOutcome({ before, after, output: `${upd.stdout}\n${upd.stderr}`, failed: Boolean(upd.error) });

  const [auth, ...probes] = await Promise.all([
    run(claude.bin, ['auth', 'status', '--json'], { env }),
    ...FAMILIES.map(([family]) => askWhichModel(claude.bin, family, env)),
  ]);
  let status = null;
  try {
    status = JSON.parse(auth.stdout);
  } catch {}
  const live = Object.fromEntries(FAMILIES.map(([family], i) => [family, probes[i]]));
  const past = lastAnswered(clientRunLogs().flatMap((f) => readRuns(f)));

  out('');
  rule();
  out('   1. THE CLAUDE PROGRAM');
  rule();
  if (version.status === 'updated') out(`   [NEW] ${version.line}`);
  else if (version.status === 'failed') out(`   [!]   ${version.line}`);
  else out(`   [OK]  ${version.line}`);
  if (version.status === 'failed') issues.push('Check the internet, then double-click UPDATE-CLAUDE.cmd again.');
  out('');

  rule();
  out('   2. YOUR CLAUDE ACCOUNT');
  rule();
  const plan = String(status?.subscriptionType || '');
  if (!status?.loggedIn) {
    out('   [!]   NOT signed in.');
    issues.push('Double-click SETUP.cmd in this folder and sign in when the browser opens.');
  } else if (plan && !['pro', 'max', 'team', 'enterprise'].includes(plan.toLowerCase())) {
    out(`   [!]   Signed in, but on the ${plan} plan.`);
    issues.push('A paid Claude plan is needed (Pro or Max): https://claude.ai/upgrade');
  } else {
    out(`   [OK]  Signed in.${plan ? `  ${plan.toUpperCase()} plan.` : ''}`);
  }
  out('');

  rule();
  out('   3. THE MODELS IT IS USING RIGHT NOW');
  rule();
  let asked = false;
  let limited = false;
  for (const [family, label] of FAMILIES) {
    const now = live[family]?.id;
    limited = limited || Boolean(live[family]?.limit);
    if (now) asked = true;
    const id = now || past[family]?.id || '';
    out(modelLine(label, id || 'could not ask just now', jobsFor(family)));
    if (!now && past[family]?.id) out(`   ${' '.repeat(10)}(from your last run, ${past[family].at.slice(0, 10)})`);
  }
  out('');
  const changed = FAMILIES.filter(([f]) => live[f]?.id && past[f]?.id && live[f].id !== past[f].id);
  for (const [family, label] of changed) out(`   [NEW] ${label}: now ${live[family].id}, was ${past[family].id}.`);
  if (asked) out('   Claude picks these, not the system: a newer model is used by itself.');
  if (!asked && limited) issues.push('Your Claude plan hit its limit. Wait for it to reset and run this again.');
  else if (!asked) issues.push('Claude could not answer just now. Check the internet and run this again.');
  out('');

  for (const line of verdictBlock(issues)) out(line);
  out('');
}

if (process.argv[1]?.endsWith('update-claude.js')) await main();
