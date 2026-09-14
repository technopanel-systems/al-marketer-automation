// Builds evidence packets for AI prompts and verifies AI citations against saved evidence.
import { loadSources, loadChecks, sourceText, checkText } from '../pipeline/client.js';
import { verifyQuote } from '../engine/util/text.js';

const LIMITS = { website: 9000, social: 3500, 'social-data': 3500, requested: 7000, notes: 12000, human: 3000, file: 12000 };

// Wraps untrusted page text as data so instructions inside a scraped page are not followed.
export function evidencePacket(p, { kinds = null, totalChars = 70_000, ids = null } = {}) {
  const sources = loadSources(p).filter((s) => (!kinds || kinds.includes(s.kind)) && (!ids || ids.includes(s.id)));
  const blocks = [];
  let used = 0;
  // Notes and human answers first (most reliable), then home page, then the rest in id order.
  const rank = (s) => ({ notes: 0, human: 1, file: 1, website: s.page === 'home' ? 2 : 3, 'social-data': 3.5, social: 4, requested: 5 })[s.kind] ?? 6;
  for (const s of [...sources].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))) {
    const text = sourceText(p, s.id) || '';
    const limit = Math.min(LIMITS[s.kind] || 6000, Math.max(0, totalChars - used));
    if (limit < 500) break;
    const body = text.length > limit ? `${text.slice(0, limit)}\n[…truncated]` : text;
    used += body.length;
    blocks.push(`<evidence id="${s.id}" kind="${s.kind}"${s.platform ? ` platform="${s.platform}"` : ''} status="${s.status}" url="${s.url || ''}">\n${body}\n</evidence>`);
  }
  return { text: blocks.join('\n\n'), ids: sources.map((s) => s.id) };
}

export function checksPacket(p) {
  const checks = loadChecks(p);
  return checks.length ? `<checks>\n${checks.map(checkText).join('\n')}\n</checks>` : '<checks>none</checks>';
}

/**
 * Verifies one citation: page/notes/human evidence needs a verbatim quote; a check id needs no quote.
 * @returns {{ ok: boolean, reason?: string, kind?: string }}
 */
export function verifyCitation(p, { evidenceId, quote }, cache = new Map()) {
  if (!evidenceId) return { ok: false, reason: 'no evidence id' };
  if (/^K\d{3}$/.test(evidenceId)) {
    const check = loadChecks(p).find((c) => c.id === evidenceId);
    if (!check) return { ok: false, reason: `check ${evidenceId} does not exist` };
    if (check.result === 'unknown') return { ok: false, reason: `check ${evidenceId} has no result yet` };
    return { ok: true, kind: 'check' };
  }
  if (!cache.has(evidenceId)) cache.set(evidenceId, sourceText(p, evidenceId));
  const text = cache.get(evidenceId);
  if (text === null) return { ok: false, reason: `evidence ${evidenceId} does not exist` };
  const res = verifyQuote(quote, text);
  return res.ok ? { ok: true, kind: evidenceId[0] === 'N' ? 'notes' : evidenceId[0] === 'H' ? 'human' : 'page' } : { ok: false, reason: `${evidenceId}: ${res.reason}` };
}
