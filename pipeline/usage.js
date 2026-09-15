// Claude usage for one proposal, measured — not estimated — from each headless run's own report (logs/runs.jsonl):
// cost as reported by Claude Code (total_cost_usd), time and tokens, grouped by pipeline step. Failed attempts count too.
// On a Claude subscription this cost is the API-equivalent value of the usage, not an amount that is billed.
import { existsSync, readFileSync } from 'node:fs';

// Run log step names → the pipeline step (and label) they belong to.
const GROUPS = [
  [/^notes/, 'notes', 'Meeting notes'],
  [/^research-/, 'research', 'Research teams'],
  [/^competitors/, 'competitors', 'Competitor search'],
  [/^diagnose/, 'diagnose', 'Diagnosis'],
  [/^review/, 'review', 'Independent review'],
  [/^write|^revise/, 'write', 'Writing the proposal'],
  [/^language-review|^check/, 'check', 'Language review'],
  [/^edit/, 'edit', 'Edits asked in the chat'],
  [/^report/, 'report', 'Internal report'],
  [/^business-analyst/, 'business-analyst', 'Business analyst'],
  [/^presence|^business|^social-read/, 'research', 'Research teams'],
];
const groupOf = (step) => GROUPS.find(([re]) => re.test(step)) || [null, step, step];

export function readRuns(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.mode !== 'files');
}

// The models that answered a pipeline step since a time, in order ("haiku → sonnet" when the fallback took over).
export function modelsUsed(p, stepId, sinceIso) {
  const used = readRuns(p.runLog).filter((r) => groupOf(String(r.step || ''))[1] === stepId && String(r.at || '') >= sinceIso && r.model && !r.fallbackTo);
  const answered = used.filter((r) => r.valid);
  return [...new Set((answered.length ? answered : used).map((r) => r.model))];
}

export function usageSummary(p) {
  const runs = readRuns(p.runLog);
  const steps = new Map();
  for (const r of runs) {
    const [, id, label] = groupOf(String(r.step || ''));
    const s = steps.get(id) || { id, label, runs: 0, failed: 0, durationMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, models: new Set(), unknownCost: 0, lastAt: '' };
    s.runs++;
    if (r.error || r.valid === false) s.failed++;
    s.durationMs += r.durationMs || 0;
    if (typeof r.costUsdEstimate === 'number') s.costUsd += r.costUsdEstimate;
    else s.unknownCost++;
    s.inputTokens += r.inputTokens || 0;
    s.outputTokens += r.outputTokens || 0;
    if (r.model) s.models.add(r.model);
    if (String(r.at || '') > s.lastAt) s.lastAt = r.at;
    steps.set(id, s);
  }
  const list = [...steps.values()].map((s) => ({ ...s, models: [...s.models], costUsd: round(s.costUsd) }));
  const total = list.reduce((t, s) => ({ runs: t.runs + s.runs, failed: t.failed + s.failed, durationMs: t.durationMs + s.durationMs, costUsd: t.costUsd + s.costUsd, inputTokens: t.inputTokens + s.inputTokens, outputTokens: t.outputTokens + s.outputTokens, unknownCost: t.unknownCost + s.unknownCost }), { runs: 0, failed: 0, durationMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, unknownCost: 0 });
  return { steps: list, total: { ...total, costUsd: round(total.costUsd) } };
}

const round = (n) => Math.round(n * 100) / 100;
export const usd = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
