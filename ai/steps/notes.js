// Meeting-notes step (Haiku): goals, constraints, facts and client readiness from the team's notes — each with a verbatim quote.
import { existsSync, readFileSync } from 'node:fs';
import { runAiStep } from '../runner.js';
import { SYSTEM, EVIDENCE_RULES } from '../prompts.js';
import { ALL_FIELDS, READINESS_KEYS } from '../fields.js';
import { addTextSource, loadSources, save } from '../../pipeline/client.js';
import { verifyCitation } from '../evidence.js';

const quoteProp = { type: 'string', maxLength: 300 };

export const notesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['facts', 'readiness', 'languageHint'],
  properties: {
    facts: {
      type: 'array',
      maxItems: 40,
      items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'quote'], properties: { field: { enum: Object.keys(ALL_FIELDS) }, value: { type: 'string', maxLength: 400 }, quote: quoteProp } },
    },
    readiness: {
      type: 'array',
      maxItems: 10,
      items: { type: 'object', additionalProperties: false, required: ['key', 'value', 'quote'], properties: { key: { enum: Object.keys(READINESS_KEYS) }, value: { enum: ['yes', 'no'] }, quote: quoteProp } },
    },
    languageHint: { enum: ['ar', 'en', 'unclear'] },
  },
};

export async function runNotesStep(p, intake, { logFile } = {}) {
  const notes = existsSync(p.notes) ? readFileSync(p.notes, 'utf8').trim() : '';
  if (!notes) {
    const empty = { facts: [], readiness: [], languageHint: 'unclear', rejected: [], notesSourceId: null, skipped: 'no meeting notes' };
    save(`${p.researchDir}/notes.json`, empty);
    return empty;
  }
  const src = addTextSource(p, { kind: 'notes', url: 'inputs/meeting-notes.md', title: 'Meeting notes', text: notes });
  const prompt = `${EVIDENCE_RULES}

<task>
Read the Al-Marketer team's meeting notes about the client "${intake.name}" and extract:
1. facts: things the notes state about the client's business, brand, channels, goals and constraints. Use the field list. value = a short Arabic summary; quote = verbatim words from the notes.
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

<evidence id="${src.id}" kind="notes">
${notes}
</evidence>`;

  const cache = new Map();
  const check = (out) => {
    const bad = [...out.facts, ...out.readiness].filter((f) => !verifyCitation(p, { evidenceId: src.id, quote: f.quote }, cache).ok);
    return bad.length > out.facts.length / 2 + 1 ? [`${bad.length} quotes are not verbatim from the notes — copy the exact words`] : [];
  };
  const { output } = await runAiStep({ step: 'notes', model: 'haiku', effort: 'low', systemPrompt: SYSTEM.notes, prompt, schema: notesSchema, check, logFile, requestsDir: p.aiRequestsDir });
  const keep = (f) => verifyCitation(p, { evidenceId: src.id, quote: f.quote }, cache).ok;
  const result = {
    notesSourceId: src.id,
    facts: output.facts.filter(keep).map((f) => ({ ...f, evidenceId: src.id, confidence: 'high', source: 'notes' })),
    readiness: output.readiness.filter(keep).map((r) => ({ ...r, evidenceId: src.id })),
    languageHint: output.languageHint,
    rejected: [...output.facts, ...output.readiness].filter((f) => !keep(f)).map((f) => ({ ...f, reason: 'quote not found in notes' })),
  };
  save(`${p.researchDir}/notes.json`, result);
  return result;
}

export const hasNotes = (p) => loadSources(p).some((s) => s.kind === 'notes');
