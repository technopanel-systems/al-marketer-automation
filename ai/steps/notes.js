// Meeting-notes step: goals, constraints, facts and client readiness from the team's notes and attached meeting reports —
// each with a verbatim quote from the source it came from. Haiku for short notes; Sonnet when there is a report or long notes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runAiStep } from '../runner.js';
import { SYSTEM, EVIDENCE_RULES } from '../prompts.js';
import { ALL_FIELDS, READINESS_KEYS } from '../fields.js';
import { addTextSource, loadSources, save } from '../../pipeline/client.js';
import { verifyCitation } from '../evidence.js';

const quoteProp = { type: 'string', maxLength: 300 };

export const notesSchema = (sourceIds = ['N001']) => ({
  type: 'object',
  additionalProperties: false,
  required: ['facts', 'readiness', 'languageHint'],
  properties: {
    facts: {
      type: 'array',
      maxItems: 60,
      items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'quote', ...(sourceIds.length > 1 ? ['sourceId'] : [])], properties: { field: { enum: Object.keys(ALL_FIELDS) }, value: { type: 'string', maxLength: 400 }, quote: quoteProp, sourceId: { enum: sourceIds } } },
    },
    readiness: {
      type: 'array',
      maxItems: 10,
      items: { type: 'object', additionalProperties: false, required: ['key', 'value', 'quote', ...(sourceIds.length > 1 ? ['sourceId'] : [])], properties: { key: { enum: Object.keys(READINESS_KEYS) }, value: { enum: ['yes', 'no'] }, quote: quoteProp, sourceId: { enum: sourceIds } } },
    },
    languageHint: { enum: ['ar', 'en', 'unclear'] },
  },
});

// The notes box and every attached report's extracted text (inputs/files/*.extracted.txt).
export function notesTexts(p) {
  const out = [];
  const notes = existsSync(p.notes) ? readFileSync(p.notes, 'utf8').trim() : '';
  if (notes) out.push({ url: 'inputs/meeting-notes.md', title: 'Meeting notes', text: notes });
  if (p.filesDir && existsSync(p.filesDir)) {
    for (const f of readdirSync(p.filesDir).filter((x) => x.endsWith('.extracted.txt')).sort()) {
      const text = readFileSync(join(p.filesDir, f), 'utf8').trim();
      const original = f.replace(/\.extracted\.txt$/, '');
      if (text) out.push({ url: `inputs/files/${original}`, title: `Meeting report: ${original}`, text });
    }
  }
  return out;
}

export async function runNotesStep(p, intake, { logFile } = {}) {
  const texts = notesTexts(p);
  if (!texts.length) {
    const empty = { facts: [], readiness: [], languageHint: 'unclear', rejected: [], notesSourceId: null, sourceIds: [], skipped: 'no meeting notes' };
    save(`${p.researchDir}/notes.json`, empty);
    return empty;
  }
  const sources = texts.map((t) => addTextSource(p, { kind: 'notes', url: t.url, title: t.title, text: t.text }));
  const src = sources[0];
  const ids = sources.map((s) => s.id);
  const totalChars = texts.reduce((n, t) => n + t.text.length, 0);
  const model = texts.length > 1 || totalChars > 8000 ? 'sonnet' : 'haiku';
  const prompt = `${EVIDENCE_RULES}

<task>
Read the Al-Marketer team's meeting notes${texts.length > 1 ? ' and meeting reports' : ''} about the client "${intake.name}" and extract:
1. facts: things they state about the client's business, brand, channels, goals and constraints. Use the field list. value = a short Arabic summary; quote = verbatim words; sourceId = the id of the evidence block the quote is copied from.
2. readiness: only when the notes clearly say yes or no about a readiness item. If the notes say the client does not know, or it is not decided, leave that item out.
3. languageHint: the language the client mainly uses with customers, if the notes say it; else "unclear".
Skip anything the notes do not say. Do not repeat the same fact.
</task>

<fields>
${Object.entries(ALL_FIELDS).map(([k, v]) => `${k}: ${v}`).join('\n')}
</fields>

<readiness_keys>
${Object.entries(READINESS_KEYS).map(([k, v]) => `${k}: ${v}`).join('\n')}
</readiness_keys>

${sources.map((s, i) => `<evidence id="${s.id}" kind="notes" title="${texts[i].title.replace(/"/g, "'")}">
${texts[i].text}
</evidence>`).join('\n\n')}`;

  const cache = new Map();
  // The quote must be in the cited source; if the AI named the wrong block but the words are in another one, that one counts.
  const citedIn = (f) => [f.sourceId, ...ids.filter((id) => id !== f.sourceId)].find((id) => ids.includes(id) && verifyCitation(p, { evidenceId: id, quote: f.quote }, cache).ok) || null;
  const check = (out) => {
    const bad = [...out.facts, ...out.readiness].filter((f) => !citedIn(f));
    return bad.length > out.facts.length / 2 + 1 ? [`${bad.length} quotes are not verbatim from the notes — copy the exact words`] : [];
  };
  const { output } = await runAiStep({ step: 'notes', model, effort: 'low', systemPrompt: SYSTEM.notes, prompt, schema: notesSchema(ids), check, logFile, requestsDir: p.aiRequestsDir });
  const keep = (f) => Boolean(citedIn(f));
  const result = {
    notesSourceId: src.id,
    sourceIds: ids,
    model,
    facts: output.facts.filter(keep).map(({ sourceId, ...f }) => ({ ...f, evidenceId: citedIn({ sourceId, ...f }), confidence: 'high', source: 'notes' })),
    readiness: output.readiness.filter(keep).map(({ sourceId, ...r }) => ({ ...r, evidenceId: citedIn({ sourceId, ...r }) })),
    languageHint: output.languageHint,
    rejected: [...output.facts, ...output.readiness].filter((f) => !keep(f)).map((f) => ({ ...f, reason: 'quote not found in notes' })),
  };
  save(`${p.researchDir}/notes.json`, result);
  return result;
}

export const hasNotes = (p) => loadSources(p).some((s) => s.kind === 'notes');
