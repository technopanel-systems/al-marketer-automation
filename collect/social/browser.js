// The research browser: the PC's own Chrome (or Edge) with a dedicated profile that stays logged into the agency's
// research accounts. It is started as a normal browser (not a Playwright-launched one, which sites flag as automated)
// and the app only listens to it over the DevTools protocol while a person browses.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

export const researchProfileDir = () => process.env.ALM_BROWSER_PROFILE || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'AlMarketer', 'research-browser');
const PORT = () => Number(process.env.ALM_BROWSER_PORT || 9333);

export function findBrowser() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.ALM_BROWSER,
    join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((f) => existsSync(f)) || null;
}

async function reachable(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

let connection = null;

export async function openResearchBrowser({ port = PORT(), profileDir = researchProfileDir(), exe = findBrowser() } = {}) {
  if (connection?.isConnected()) return connection;
  if (!(await reachable(port))) {
    if (!exe) throw new Error('Chrome or Edge was not found on this PC');
    mkdirSync(profileDir, { recursive: true });
    const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--start-maximized', 'about:blank'], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    for (let i = 0; i < 40 && !(await reachable(port)); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await reachable(port))) throw new Error('The research browser did not start (is another program using port ' + port + '?)');
  }
  connection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  connection.on('disconnected', () => {
    connection = null;
  });
  return connection;
}

export const researchBrowserRunning = () => reachable(PORT());
