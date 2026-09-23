// "Is Claude up to date, and which model does what?" — one double-click on UPDATE-CLAUDE.cmd.
// Updates the Claude Code program when a newer one exists, then says which model does each job.
// The system never names a model version: each step asks for haiku / sonnet / opus (ai/models.js) and Claude Code
// answers with the newest model of that family, so a new Opus or Sonnet is used as soon as Claude Code knows it.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findClaude } from '../ai/claude-bin.js';
import { MODELS } from '../ai/models.js';
import { readRuns } from '../pipeline/usage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = [
  ['opus', 'Opus', 'the deep thinking'],
  ['sonnet', 'Sonnet', 'the daily work'],
  ['haiku', 'Haiku', 'the quick reading'],
];
const JOBS = {
  notes: 'Meeting notes',
  'notes-long': 'Long meeting notes',
  competitors: 'Competitor search',
  research: 'Research teams',
  'business-analyst': 'Business analyst',
  diagnose: 'Diagnosis',
  review: 'Independent review',
  write: 'Writing the proposal',
  'language-review': 'Language review',
  edit: 'Edits asked in the chat',
  report: 'Internal report',
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
  if (after && before && after !== before) return { status: 'updated', line: `Updated: ${before} -> ${after}` };
  if (/unknown command|unrecognized|not a valid|did you mean/i.test(text)) return { status: 'auto', line: `This Claude Code keeps itself up to date (version ${after || before || 'unknown'}).` };
  if (failed) return { status: 'failed', line: `Could not update now (version ${after || before || 'unknown'}). Internet problem, or Claude was open. Try again later.` };
  return { status: 'current', line: `Already the newest version (${after || before || 'unknown'}).` };
}

// Per family: which jobs ask for it, and the real model that last answered on this computer.
export function modelReport(runs = [], models = MODELS) {
  const seen = new Map();
  for (const r of runs) {
    const family = String(r?.model || '');
    const id = (Array.isArray(r?.models) ? r.models : []).find((m) => String(m).includes(family));
    const at = String(r?.at || '');
    if (!id || !at) continue;
    if (!seen.has(family) || at > seen.get(family).at) seen.set(family, { id, at });
  }
  return FAMILIES.map(([family, label, what]) => ({
    family,
    label,
    what,
    jobs: Object.entries(models).filter(([, row]) => row.model === family).map(([step]) => JOBS[step] || step),
    last: seen.get(family) || null,
  }));
}

function clientRunLogs(root = ROOT) {
  const dir = process.env.ALM_CLIENTS_DIR || join(root, 'clients');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name, 'logs', 'runs.jsonl'))
    .filter((f) => existsSync(f));
}

async function main() {
  const env = cleanEnv(process.env);
  const out = (s = '') => console.log(s);
  out('');
  out('  CLAUDE: UPDATE AND MODELS');
  out('  =========================');
  out('');

  const claude = findClaude(process.env);
  if (claude.how === 'missing' || claude.how === 'npm-only') {
    out('  Claude Code is not installed the way this system needs it.');
    out('  -> Close this window and double-click SETUP.cmd in this folder. It installs Claude Code and signs you in.');
    process.exitCode = 1;
    return;
  }

  const before = parseVersion((await run(claude.bin, ['--version'], { env })).stdout);
  out(`  Program version now: ${before || 'unknown'}`);
  out('  Looking for a newer version...');
  const upd = await run(claude.bin, ['update'], { timeoutMs: 300_000, env });
  const after = parseVersion((await run(claude.bin, ['--version'], { env })).stdout) || before;
  const result = updateOutcome({ before, after, output: `${upd.stdout}\n${upd.stderr}`, failed: Boolean(upd.error) });
  out(`  ${result.line}`);
  out('');

  const auth = await run(claude.bin, ['auth', 'status', '--json'], { env });
  let status = null;
  try {
    status = JSON.parse(auth.stdout);
  } catch {}
  if (status?.loggedIn) out(`  Signed in to your Claude account${status.subscriptionType ? ` (${status.subscriptionType} plan)` : ''}.`);
  else out('  NOT signed in. -> Double-click SETUP.cmd; it signs you in again.');
  out('');

  const runs = clientRunLogs().flatMap((f) => readRuns(f));
  out('  WHICH MODEL DOES WHAT');
  out('  The system asks for a family, never a version number, so a newer model is used by itself.');
  out('');
  for (const row of modelReport(runs)) {
    out(`  ${row.label.padEnd(7)}(${row.what}): ${row.jobs.join(', ')}`);
    out(`         last answered by ${row.last ? `${row.last.id}  (${row.last.at.slice(0, 10)})` : 'nothing yet on this computer'}`);
  }
  out('');
  out('  Nothing to change: when a newer Opus, Sonnet or Haiku comes out, this system uses it on the next run.');
  out('');
}

if (process.argv[1]?.endsWith('update-claude.js')) await main();
