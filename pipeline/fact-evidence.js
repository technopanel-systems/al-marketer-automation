// Gate 3 fact check: every client-facing statement that cites evidence, shown next to that evidence.
// The automated reviews only confirm that cited evidence ids exist; this lets the approver compare the meaning,
// and flags statements whose evidence looks unrelated or does not contain their numbers.
import { load, loadSources, loadChecks, checkText, sourceText } from './client.js';
import { normalizeForMatch, extractNumbers } from '../engine/util/text.js';

const STOP_WORDS = new Set(['في', 'من', 'على', 'مع', 'عن', 'الى', 'الي', 'او', 'ده', 'دي', 'اللي', 'كل', 'بس', 'هو', 'هي', 'انه', 'ان', 'لكن', 'كمان', 'عشان', 'the', 'and', 'for', 'with', 'from', 'our', 'your']);

const words = (text) => normalizeForMatch(text).split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

// Share of the statement's content words that also appear in the evidence text (0–1).
export function overlapScore(statement, evidence) {
  const s = [...new Set(words(statement))];
  if (!s.length) return 1;
  const e = new Set(words(evidence));
  return s.filter((w) => e.has(w) || [...e].some((x) => x.length >= 4 && (x.includes(w) || w.includes(x)))).length / s.length;
}

// Walks the written content and returns every object that carries `basedOn`, with a readable path.
export function factStatements(content) {
  const out = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.basedOn)) {
      const text = [node.title, node.value, node.text, ...(node.chips || [])].filter(Boolean).join(' — ');
      out.push({ path, text, basedOn: node.basedOn });
    }
    for (const [k, v] of Object.entries(node)) if (k !== '_meta' && k !== 'basedOn') walk(v, path ? `${path}.${k}` : k);
  };
  walk(content, '');
  return out;
}

function recordFactsByEvidence(record) {
  const map = new Map();
  for (const fields of Object.values(record?.sections || {})) {
    for (const facts of Object.values(fields)) {
      for (const f of facts) {
        if (!f.evidenceId) continue;
        if (!map.has(f.evidenceId)) map.set(f.evidenceId, []);
        map.get(f.evidenceId).push(f);
      }
    }
  }
  return map;
}

// Picks up to `max` record facts that together cover the most words of the statement, so every claim in it
// (e.g. "free shipping" and "1–2 days") gets its own evidence line.
function pickFacts(statement, facts, max = 4) {
  const target = new Set(words(statement));
  const covered = new Set();
  const chosen = [];
  const pool = facts.map((f) => ({ f, w: new Set(words(`${f.value} ${f.quote || ''}`)) }));
  while (chosen.length < max) {
    let best = null;
    let bestGain = 0;
    for (const item of pool) {
      if (chosen.includes(item.f)) continue;
      const gain = [...target].filter((w) => !covered.has(w) && [...item.w].some((x) => x === w || (x.length >= 4 && (x.includes(w) || w.includes(x))))).length;
      if (gain > bestGain) [best, bestGain] = [item, gain];
    }
    if (!best) break;
    chosen.push(best.f);
    for (const w of target) if ([...best.w].some((x) => x === w || (x.length >= 4 && (x.includes(w) || w.includes(x))))) covered.add(w);
  }
  return chosen;
}

// Best-matching lines of a source text for a statement (used when no record fact cites that source).
function bestLines(statement, text, n = 2) {
  const lines = String(text || '').split(/\n|(?<=[.!؟?])\s+/).map((l) => l.trim()).filter((l) => l.length >= 12 && l.length <= 400);
  return lines.map((l) => ({ l, s: overlapScore(statement, l) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.l);
}

/**
 * @returns {Array<{ path, text, evidence: Array<{ id, kind, title, url, lines: Array<{ text, quote }>, found: boolean }>, flags: Array<{ code, message }> }>}
 */
export function factEvidence(p, content) {
  const record = load(p.record, { sections: {} });
  const sources = new Map(loadSources(p).map((s) => [s.id, s]));
  const checks = new Map(loadChecks(p).map((c) => [c.id, c]));
  const factsBySource = recordFactsByEvidence(record);
  return factStatements(content).map((st) => {
    const evidence = st.basedOn.map((id) => {
      if (checks.has(id)) return { id, kind: 'check', title: checks.get(id).question, url: checks.get(id).url || null, lines: [{ text: checkText(checks.get(id)), quote: '' }], found: true, fullText: checkText(checks.get(id)) };
      const src = sources.get(id);
      if (!src) return { id, kind: 'missing', title: 'Evidence not found', url: null, lines: [], found: false, fullText: '' };
      const facts = pickFacts(st.text, factsBySource.get(id) || []);
      const text = sourceText(p, id) || '';
      const lines = facts.length ? facts.map((f) => ({ text: f.value, quote: f.quote || '' })) : bestLines(st.text, text).map((l) => ({ text: l, quote: '' }));
      return { id, kind: src.kind, title: src.title || src.platform || src.kind, url: src.url || null, lines, found: true, fullText: `${text}\n${(factsBySource.get(id) || []).map((f) => `${f.value} ${f.quote || ''}`).join('\n')}` };
    });
    const flags = [];
    if (!evidence.length) flags.push({ code: 'no_evidence', message: 'No evidence cited' });
    if (evidence.some((e) => !e.found)) flags.push({ code: 'unknown_evidence', message: `Cites evidence that does not exist: ${evidence.filter((e) => !e.found).map((e) => e.id).join(', ')}` });
    if (evidence.length && evidence.every((e) => e.kind === 'notes' || e.kind === 'human')) flags.push({ code: 'notes_only', message: 'Based only on meeting notes or team answers — confirm it is still true' });
    const allText = evidence.map((e) => e.fullText).join('\n');
    const evidenceNumbers = new Set(extractNumbers(allText));
    const missingNumbers = [...new Set(extractNumbers(st.text))].filter((n) => !evidenceNumbers.has(n));
    if (missingNumbers.length) flags.push({ code: 'number_not_in_evidence', message: `Number(s) not found in its own evidence: ${missingNumbers.join(', ')}` });
    // Check results are short English lines written by code, so word overlap says nothing about them.
    const pageText = evidence.filter((e) => e.found && e.kind !== 'check').map((e) => e.fullText).join('\n');
    if (pageText && overlapScore(st.text, pageText) < 0.34) flags.push({ code: 'weak_match', message: 'Its evidence shares few words with it — compare carefully' });
    return { path: st.path, text: st.text, evidence: evidence.map(({ fullText, ...e }) => e), flags };
  });
}
