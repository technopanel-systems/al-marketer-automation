// One client folder = single source of truth. Paths, JSON helpers and the evidence store (E pages, K checks, N notes, H human answers).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../engine/catalog/store.js';
import { readJson, writeJson, writeText, sha256 } from '../engine/util/data.js';

export const CLIENTS_DIR = process.env.ALM_CLIENTS_DIR || join(ROOT, 'clients');

export function slugify(name) {
  const ascii = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || `client-${Date.now().toString(36)}`;
}

export function clientPaths(slug) {
  const dir = join(CLIENTS_DIR, slug);
  return {
    dir,
    intake: join(dir, 'intake.json'),
    notes: join(dir, 'inputs', 'meeting-notes.md'),
    inputsDir: join(dir, 'inputs'),
    status: join(dir, 'status.json'),
    evidenceDir: join(dir, 'evidence'),
    sources: join(dir, 'evidence', 'sources.json'),
    checks: join(dir, 'evidence', 'checks.json'),
    pagesDir: join(dir, 'evidence', 'pages'),
    shotsDir: join(dir, 'evidence', 'shots'),
    auditsDir: join(dir, 'evidence', 'audits'),
    researchDir: join(dir, 'research'),
    recordDir: join(dir, 'record'),
    record: join(dir, 'record', 'client-record.json'),
    questions: join(dir, 'record', 'open-questions.json'),
    readiness: join(dir, 'record', 'readiness.json'),
    diagnosis: join(dir, 'diagnosis', 'problems.json'),
    gate1: join(dir, 'gates', 'gate1.json'),
    gate2: join(dir, 'gates', 'gate2.json'),
    gate3: join(dir, 'gates', 'gate3.json'),
    scope: join(dir, 'scope', 'recommendation.json'),
    planDir: join(dir, 'plan'),
    content: join(dir, 'proposal', 'content.json'),
    review: join(dir, 'proposal', 'review.json'),
    outputDir: join(dir, 'output'),
    draftDir: join(dir, 'output', 'draft'),
    aiRequestsDir: join(dir, 'ai-requests'),
    socialDir: join(dir, 'social'),
    competitors: join(dir, 'social', 'competitors.json'),
    competitorsAi: join(dir, 'social', 'competitors-ai.json'),
    capturesDir: join(dir, 'social', 'captures'),
    socialStatus: join(dir, 'social', 'task-status.json'),
    socialTasks: join(dir, 'social', 'tasks.json'),
    scorecard: join(dir, 'social', 'scorecard.json'),
    socialShotsDir: join(dir, 'evidence', 'shots', 'social'),
    runLog: join(dir, 'logs', 'runs.jsonl'),
    jobLog: join(dir, 'logs', 'jobs.log'),
  };
}

export function listClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(CLIENTS_DIR, d.name, 'intake.json')))
    .map((d) => d.name)
    .sort();
}

export const load = (file, fallback) => readJson(file, fallback);
export const save = (file, value) => writeJson(file, value);

// ---------- evidence store ----------
function nextId(prefix, items) {
  const max = items.filter((i) => i.id.startsWith(prefix)).reduce((m, i) => Math.max(m, Number(i.id.slice(1))), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function loadSources(p) {
  return load(p.sources, []);
}
export function loadChecks(p) {
  return load(p.checks, []);
}

// kind: website | social | requested | notes | human | file
export function addTextSource(p, { kind, url = '', title = '', platform = null, status = 'ok', text = '', screenshot = null, mobileScreenshot = null, extra = {} }) {
  const sources = loadSources(p);
  const prefix = kind === 'notes' || kind === 'file' ? 'N' : kind === 'human' ? 'H' : 'E';
  const existing = url && kind !== 'human' ? sources.find((s) => s.url === url && s.kind === kind) : null;
  const id = existing ? existing.id : nextId(prefix, sources);
  mkdirSync(p.pagesDir, { recursive: true });
  writeText(join(p.pagesDir, `${id}.txt`), text);
  const record = { id, kind, url, title, platform, status, fetchedAt: new Date().toISOString(), chars: text.length, sha256: sha256(text), screenshot, mobileScreenshot, ...extra };
  const next = existing ? sources.map((s) => (s.id === id ? record : s)) : [...sources, record];
  save(p.sources, next);
  return record;
}

export function sourceText(p, id) {
  const file = join(p.pagesDir, `${id}.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

// result: present | absent | value | blocked | unknown ; by: code | you
export function upsertCheck(p, check) {
  const checks = loadChecks(p);
  const existing = checks.find((c) => c.key === check.key);
  const id = existing ? existing.id : nextId('K', checks);
  const record = { id, at: new Date().toISOString(), by: 'code', ...existing, ...check, id };
  save(p.checks, existing ? checks.map((c) => (c.id === id ? record : c)) : [...checks, record]);
  return record;
}

export function checkText(c) {
  const result = c.result === 'value' ? c.value : c.result === 'present' ? 'YES — found' : c.result === 'absent' ? 'NO — not found' : c.result.toUpperCase();
  return `${c.id} · ${c.question}: ${result}${c.detail ? ` (${c.detail})` : ''} [checked by ${c.by === 'you' ? 'the Al-Marketer team' : 'automated check'} on ${c.at.slice(0, 10)}${c.url ? `, ${c.url}` : ''}]`;
}

export function writeNotes(p, notesText) {
  mkdirSync(p.inputsDir, { recursive: true });
  writeFileSync(p.notes, notesText || '', 'utf8');
}
