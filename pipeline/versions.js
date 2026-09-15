// Every version of the proposal text is kept (proposal/versions/NNN.json): written by the AI, edited in the slide
// editor, changed through the chat, or restored. Any change can be undone by restoring an earlier version.
// Applying a text makes it the writing step's result, so reviews and slide design run again on it.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { load, save } from './client.js';
import { recordStepResult, outputHash } from './steps.js';
import { hashOf } from '../engine/util/data.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const SOURCES = { write: 'Written by the AI', editor: 'Edited in the slide editor', chat: 'Changed through the AI chat', restore: 'Restored an earlier version', json: 'Edited as raw text' };
export const sourceLabel = (s) => SOURCES[s] || s;

const textOnly = (content) => {
  const { _meta, ...text } = content || {};
  return text;
};

export function listVersions(p) {
  if (!existsSync(p.versionsDir)) return [];
  return readdirSync(p.versionsDir)
    .filter((f) => /^\d{3,}\.json$/.test(f))
    .sort()
    .map((f) => {
      const v = load(join(p.versionsDir, f), {});
      return { n: Number(f.slice(0, -5)), source: v.source, note: v.note || '', at: v.at, hash: v.hash };
    });
}

export const loadVersion = (p, n) => load(join(p.versionsDir, `${String(n).padStart(3, '0')}.json`), null);

// Keeps a copy of this text unless the latest version already is exactly this text.
export function snapshot(p, content, { source = 'write', note = '' } = {}) {
  if (!content) return null;
  const hash = hashOf(textOnly(content));
  const versions = listVersions(p);
  const last = versions.at(-1);
  if (last?.hash === hash) return last.n;
  mkdirSync(p.versionsDir, { recursive: true });
  const n = (last?.n || 0) + 1;
  save(join(p.versionsDir, `${String(n).padStart(3, '0')}.json`), { n, source, note: String(note).slice(0, 500), at: new Date().toISOString(), hash, content });
  return n;
}

// Checks edited text against the writer's limits (the same the AI works under). Returns readable problems.
export function validateContent(content, schema) {
  const validate = ajv.compile(schema);
  if (validate(textOnly(content))) return [];
  // Only what a person can cause by editing text: too long, empty, or too few lines. Older texts written before a
  // schema change keep their structure; that is not the editor's to judge.
  const personal = validate.errors.filter((e) => ['maxLength', 'minLength', 'minItems', 'maxItems'].includes(e.keyword));
  return personal.slice(0, 12).map((e) => {
    const where = e.instancePath.replace(/^\//, '').replace(/\/(\d+)/g, (_, i) => ` ${Number(i) + 1}`).replace(/\//g, ' › ') || 'text';
    if (e.keyword === 'maxLength') return `${where}: too long (at most ${e.params.limit} characters)`;
    if (e.keyword === 'minLength') return `${where}: cannot be empty`;
    if (e.keyword === 'minItems') return `${where}: needs at least ${e.params.limit} item(s)`;
    return `${where}: ${e.message}`;
  });
}

// Makes a text the proposal text: keeps the previous one as a version, saves, and lets reviews and design run again.
export function applyContent(p, content, { source, note = '', summary = '' }) {
  const current = load(p.content, null);
  if (current) snapshot(p, current, { source: current._meta?.source || 'write', note: current._meta?.note || '' });
  const next = { ...content, _meta: { ...(current?._meta || {}), ...(content._meta || {}), source, note, editedAt: new Date().toISOString() } };
  save(p.content, next);
  const n = snapshot(p, next, { source, note });
  recordStepResult(p, 'write', { state: 'done', outputHash: outputHash(p, 'write'), summary: summary || sourceLabel(source), finishedAt: new Date().toISOString() });
  return n;
}

export function restoreVersion(p, n) {
  const v = loadVersion(p, n);
  if (!v?.content) throw new Error(`Version ${n} does not exist.`);
  return applyContent(p, v.content, { source: 'restore', note: `version ${n}`, summary: `restored version ${n}` });
}
