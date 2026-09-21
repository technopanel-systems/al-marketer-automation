// Checks that this computer can run the Al-Marketer Control Center, in plain words, with the fix for each problem.
//   node tools/doctor.js                 full check (setup runs this)
//   node tools/doctor.js --quick         fast check before each start: no network, no Claude test; prints problems only
//   node tools/doctor.js --claude-test   also asks Claude (Haiku) to reply "OK": proves headless runs work
//   node tools/doctor.js --report FILE   also writes the result to FILE (no email address or key is ever written)
// Exit code 1 when something required is missing.
import { existsSync, statfsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { findClaude } from '../ai/claude-bin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GB = 1024 ** 3;
const SUBSCRIPTIONS = new Set(['pro', 'max', 'team', 'enterprise']);
const INSTALL_CLAUDE = 'Double-click SETUP.cmd again (it installs Claude Code), or in PowerShell: irm https://claude.ai/install.ps1 | iex';

const run = (bin, args, { timeoutMs = 20_000, env = process.env } = {}) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, env, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });

// Without the variables of a Claude Code session this may be started from, the CLI behaves as it does for the app.
const cleanEnv = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^CLAUDE_?CODE|^CLAUDECODE$|^CLAUDE_PID$/.test(k)));

export async function runChecks({ quick = false, claudeTest = false, env = process.env, root = ROOT, fetchImpl = fetch, runImpl = run } = {}) {
  const out = [];
  const add = (id, label, status, detail = '', fix = '') => out.push({ id, label, status, detail, fix });

  // Windows and the machine.
  const build = Number(String(os.release()).split('.')[2] || 0);
  if (process.platform !== 'win32') add('windows', 'Windows 10 or 11', 'warn', `this is ${process.platform}; the system is made for Windows`);
  else add('windows', 'Windows 10 or 11', build >= 17763 ? 'ok' : 'fail', `build ${build}`, build >= 17763 ? '' : 'Windows 10 version 1809 or newer is needed (Settings > Windows Update).');
  const ram = os.totalmem() / GB;
  add('memory', 'Memory (RAM)', ram >= 7.5 ? 'ok' : ram >= 3.5 ? 'warn' : 'fail', `${ram.toFixed(1)} GB`, ram >= 7.5 ? '' : '8 GB is recommended; with 4 GB close other programs while it works.');
  try {
    const s = statfsSync(root);
    const free = (s.bavail * s.bsize) / GB;
    add('disk', 'Free disk space', free >= 3 ? 'ok' : free >= 1.5 ? 'warn' : 'fail', `${free.toFixed(1)} GB free`, free >= 3 ? '' : 'Free some space: the setup needs about 1.5 GB (Node.js, the browser, the components).');
  } catch {}

  // The folder: extracted from the zip, and not synced by OneDrive (thousands of small files).
  const inZip = /\\(Temp|Temporary Internet Files)\\.*\.zip/i.test(root) || /\.zip\\/i.test(root);
  if (inZip) add('folder', 'Project folder', 'fail', root, 'The zip was opened, not extracted. Close this window, right-click the zip > Extract All..., then open the extracted folder and run SETUP.cmd.');
  else if (/\\OneDrive[^\\]*\\/i.test(root)) add('folder', 'Project folder', 'warn', root, 'The folder is inside OneDrive, which slows everything down. Move it to C:\\Al-Marketer and run SETUP.cmd there.');
  else add('folder', 'Project folder', 'ok', root);

  // Node.js and the components.
  const major = Number(process.versions.node.split('.')[0]);
  add('node', 'Node.js 24 or newer', major >= 24 ? 'ok' : 'fail', `v${process.versions.node}${process.execPath.startsWith(join(root, 'runtime')) ? ' (inside the project folder)' : ''}`, major >= 24 ? '' : 'Run SETUP.cmd: it puts Node.js 24 inside the project folder.');
  const modules = existsSync(join(root, 'node_modules', 'playwright')) && existsSync(join(root, 'node_modules', 'ajv'));
  add('components', 'App components', modules ? 'ok' : 'fail', modules ? 'installed' : 'not installed', modules ? '' : 'Run SETUP.cmd (it installs them; needs internet, a few minutes).');
  if (modules) {
    try {
      const { chromium } = await import('playwright');
      const exe = chromium.executablePath();
      add('chromium', 'Browser for website checks and slides', existsSync(exe) ? 'ok' : 'fail', existsSync(exe) ? 'installed' : 'not downloaded', existsSync(exe) ? '' : 'Run SETUP.cmd (it downloads the browser, about 150 MB).');
    } catch (e) {
      add('chromium', 'Browser for website checks and slides', 'fail', String(e.message).split('\n')[0], 'Run SETUP.cmd.');
    }
  }
  const edge = ['ProgramFiles(x86)', 'ProgramFiles'].map((k) => env[k] && join(env[k], 'Microsoft', 'Edge', 'Application', 'msedge.exe')).find((f) => f && existsSync(f));
  add('edge', 'Microsoft Edge (Google search)', edge ? 'ok' : 'warn', edge ? 'installed' : 'not found', edge ? '' : 'Google search needs Edge (it comes with Windows). Without it, add the free SerpApi key on Settings & keys.');
  add('ytdlp', 'TikTok/YouTube reader (yt-dlp)', existsSync(join(root, 'tools', 'yt-dlp.exe')) ? 'ok' : 'warn', existsSync(join(root, 'tools', 'yt-dlp.exe')) ? 'installed' : 'not downloaded', existsSync(join(root, 'tools', 'yt-dlp.exe')) ? '' : 'It downloads by itself on the next start. Without it, TikTok and YouTube numbers can be typed by hand.');

  if (!quick) {
    try {
      const res = await fetchImpl('https://www.google.com/generate_204', { method: 'GET', signal: AbortSignal.timeout(10_000) });
      add('internet', 'Internet', res.status < 500 ? 'ok' : 'fail', `answered ${res.status}`);
    } catch (e) {
      add('internet', 'Internet', 'fail', 'no answer', 'Connect to the internet (research, Claude and the downloads need it).');
    }
  }

  // Claude Code: installed (official build), signed in with a subscription, and working without a window.
  const claude = findClaude(env);
  if (claude.how === 'missing') add('claude', 'Claude Code installed', 'fail', 'not found', INSTALL_CLAUDE);
  else if (claude.how === 'npm-only') add('claude', 'Claude Code installed', 'fail', 'only the npm version was found; the app needs the official Windows build', INSTALL_CLAUDE);
  else {
    const v = await runImpl(claude.bin, ['--version'], { env: cleanEnv(env) });
    const version = (v.stdout.match(/\d+\.\d+\.\d+/) || [])[0];
    add('claude', 'Claude Code installed', version ? 'ok' : 'fail', version ? `version ${version}` : `could not start: ${String(v.error?.message || v.stderr).split('\n')[0].slice(0, 120)}`, version ? '' : INSTALL_CLAUDE);
    if (version) {
      const s = await runImpl(claude.bin, ['auth', 'status', '--json'], { env: cleanEnv(env) });
      let st = null;
      try {
        st = JSON.parse(s.stdout);
      } catch {}
      if (!st?.loggedIn) add('login', 'Signed in to Claude', 'fail', 'not signed in', 'Double-click SETUP.cmd again and sign in when the browser opens, or open PowerShell and type: claude auth login');
      else if (st.authMethod !== 'claude.ai') add('login', 'Signed in to Claude', 'warn', `signed in with ${st.authMethod || 'an API key'}: usage is billed per request, not covered by a subscription`, 'Sign in with a Claude Pro or Max account instead: claude auth logout, then claude auth login --claudeai');
      else if (!SUBSCRIPTIONS.has(String(st.subscriptionType || '').toLowerCase())) add('login', 'Signed in to Claude', 'fail', `plan: ${st.subscriptionType || 'free'}`, 'Claude Code needs a paid plan (Pro works for testing, Max for daily use): claude.ai/upgrade');
      else add('login', 'Signed in to Claude', 'ok', `${String(st.subscriptionType).replace(/^./, (c) => c.toUpperCase())} plan`);
      if (env.ANTHROPIC_API_KEY) add('apikey', 'No Anthropic API key in use', 'warn', 'ANTHROPIC_API_KEY is set on this computer', 'Claude Code may bill that key instead of the subscription. Remove it from the Windows environment variables unless that is intended.');
      if (claudeTest && st?.loggedIn) {
        const t = await runImpl(claude.bin, ['-p', 'Reply with the single word OK.', '--model', 'haiku', '--output-format', 'json', '--no-session-persistence', '--setting-sources', '', '--tools', ''], { timeoutMs: 120_000, env: cleanEnv(env) });
        let r = null;
        try {
          r = JSON.parse(t.stdout);
        } catch {}
        const ok = r && !r.is_error && /ok/i.test(String(r.result || ''));
        add('claude-test', 'Claude answers without a window', ok ? 'ok' : 'fail', ok ? `answered in ${Math.round((r.duration_ms || 0) / 1000)} s` : String(r?.result || t.error?.message || t.stderr || 'no answer').split('\n')[0].slice(0, 160), ok ? '' : 'Open PowerShell, type claude, finish any first-start questions, type /exit, then run SETUP.cmd again.');
      }
    }
  }
  return out;
}

const MARK = { ok: '[ OK ]', warn: '[WARN]', fail: '[FAIL]' };
export function formatChecks(checks, { problemsOnly = false } = {}) {
  const lines = checks.filter((c) => !problemsOnly || c.status !== 'ok').map((c) => `${MARK[c.status]} ${c.label}${c.detail ? ` - ${c.detail}` : ''}${c.fix ? `\n       -> ${c.fix}` : ''}`);
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const summary = fails ? `${fails} problem(s) must be fixed before using the system.` : warns ? `Ready. ${warns} optional item(s) above.` : 'Everything is ready.';
  return `${lines.join('\n')}${lines.length ? '\n' : ''}${summary}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const checks = await runChecks({ quick, claudeTest: args.includes('--claude-test') });
  const text = formatChecks(checks, { problemsOnly: quick });
  if (!quick || checks.some((c) => c.status !== 'ok')) console.log(text);
  const report = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
  if (report) writeFileSync(report, `Al-Marketer setup check - ${new Date().toISOString()}\n${os.version?.() || ''} ${os.arch()}\n\n${formatChecks(checks)}\n`);
  process.exitCode = checks.some((c) => c.status === 'fail') ? 1 : 0;
}
