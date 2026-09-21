// Where the Claude Code CLI is. The official Windows installer puts claude.exe in %USERPROFILE%\.local\bin and WinGet
// in %LOCALAPPDATA%\Microsoft\WinGet\Links; right after a fresh install that folder may not be on PATH yet for an app
// that was already open, so those places are checked by name. An npm install gives only claude.cmd, which cannot be
// started without a shell: the official installer is the supported way.
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';

export function findClaude(env = process.env, { exists = existsSync, platform = process.platform } = {}) {
  if (env.ALM_CLAUDE_BIN) return { bin: env.ALM_CLAUDE_BIN, how: 'ALM_CLAUDE_BIN' };
  if (platform !== 'win32') return { bin: 'claude', how: 'PATH' };
  const dirs = String(env.PATH || env.Path || '').split(delimiter).filter(Boolean);
  const onPath = dirs.map((d) => join(d, 'claude.exe')).find((f) => exists(f));
  if (onPath) return { bin: onPath, how: 'PATH' };
  const known = [env.USERPROFILE && join(env.USERPROFILE, '.local', 'bin', 'claude.exe'), env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'claude.exe')].filter(Boolean).find((f) => exists(f));
  if (known) return { bin: known, how: 'installed folder' };
  const npmShim = dirs.map((d) => join(d, 'claude.cmd')).find((f) => exists(f));
  return { bin: 'claude', how: npmShim ? 'npm-only' : 'missing', npmShim: npmShim || null };
}
