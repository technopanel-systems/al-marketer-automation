// Which Claude model each AI step uses, how much it thinks, and what it falls back to — in one table to review.
// - model: haiku (fast, simple extraction) · sonnet (research, checking, editing) · opus (judgement and long writing)
// - effort: passed to claude --effort (low | medium | high); null keeps Claude Code's default for that model
// - fallback: tried once, with the same prompt and the problems found, after the main model fails twice
//   (time-out, error or an answer that fails the checks). Never on a login problem. Never Fable.
export const MODELS = {
  notes: { model: 'haiku', effort: 'low', fallback: 'sonnet', why: 'Short notes: copy facts with exact quotes. Cheap and fast; Sonnet takes over if the quotes keep failing.' },
  'notes-long': { model: 'sonnet', effort: 'medium', fallback: 'opus', why: 'Several meeting reports or long notes: more text to match to the right source.' },
  competitors: { model: 'sonnet', effort: 'medium', fallback: null, why: 'Web search plus judging whether a company is really the same kind of business. Optional step: when it fails the team adds competitors.' },
  research: { model: 'sonnet', effort: 'medium', fallback: 'opus', why: 'Three teams read many pages and cite quotes. Opus retries a team whose answer keeps failing verification.' },
  'business-analyst': { model: 'sonnet', effort: 'medium', fallback: 'opus', why: 'Reads business signals and pages; every citation is checked by code.' },
  diagnose: { model: 'opus', effort: 'high', fallback: 'sonnet', why: 'The main judgement of the proposal: finding the binding constraint across all evidence. Sonnet only if Opus fails twice; the team approves every problem at Gate 1.' },
  review: { model: 'sonnet', effort: 'medium', fallback: 'opus', why: 'An independent sceptic on a different model from the diagnosis, so it does not share the same blind spots.' },
  write: { model: 'opus', effort: null, fallback: 'sonnet', why: 'Long persuasive Arabic that must pass the content checks. Sonnet only if Opus fails twice; the team approves at Gate 3.' },
  'language-review': { model: 'sonnet', effort: 'low', fallback: null, why: 'Reads the finished Arabic for clarity and dialect; advisory only.' },
  edit: { model: 'sonnet', effort: 'medium', fallback: 'opus', why: 'Applies a change asked in the chat to the whole proposal text.' },
  report: { model: 'opus', effort: null, fallback: 'sonnet', why: 'Internal strategy analysis across everything collected.' },
};

// "research-business-pass1" → the research row; unknown names get no defaults.
export function modelFor(step) {
  const name = String(step || '');
  const key = Object.keys(MODELS).sort((a, b) => b.length - a.length).find((k) => name === k || name.startsWith(`${k}-`));
  const row = key ? MODELS[key] : null;
  return row ? { model: row.model, effort: row.effort, fallback: row.fallback } : {};
}
