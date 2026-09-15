// Research step (Sonnet): three teams read saved evidence and fill the Client Information Record with cited facts.
// Pass 1 may ask for more URLs (WebSearch for discovery only); code captures them; pass 2 reads the new evidence.
import { join } from 'node:path';
import { runAiStep } from '../runner.js';
import { SYSTEM, EVIDENCE_RULES, TEAM_LENSES } from '../prompts.js';
import { TEAMS, REQUIRED_FIELDS } from '../fields.js';
import { evidencePacket, checksPacket, verifyCitation } from '../evidence.js';
import { captureRequested } from '../../collect/site.js';
import { save } from '../../pipeline/client.js';

const factSchema = (fields) => ({
  type: 'object',
  additionalProperties: false,
  required: ['field', 'value', 'evidenceId', 'quote', 'confidence'],
  properties: {
    field: { enum: fields },
    value: { type: 'string', minLength: 2, maxLength: 400 },
    evidenceId: { type: 'string', pattern: '^[ENHK][0-9]{3}$' },
    quote: { type: 'string', maxLength: 300 },
    confidence: { enum: ['high', 'medium', 'low'] },
  },
});

export function researchSchema(team, { allowRequests }) {
  const fields = Object.keys(TEAMS[team].fields);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['facts', 'unknown'],
    properties: {
      facts: { type: 'array', maxItems: 45, items: factSchema(fields) },
      unknown: { type: 'array', maxItems: fields.length, items: { type: 'object', additionalProperties: false, required: ['field', 'reason'], properties: { field: { enum: fields }, reason: { type: 'string', maxLength: 200 } } } },
    },
  };
  if (allowRequests) {
    schema.required.push('requestedUrls');
    schema.properties.requestedUrls = { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['url', 'reason'], properties: { url: { type: 'string', pattern: '^https?://' }, reason: { type: 'string', maxLength: 200 } } } };
  }
  return schema;
}

const TEAM_SOURCES = { business: ['website', 'notes', 'human', 'requested', 'file'], brand: ['website', 'social', 'notes', 'human', 'requested', 'file'], channels: ['website', 'social', 'notes', 'human', 'requested', 'file'] };

function teamPrompt(team, intake, packet, checks, { pass, missing }) {
  const t = TEAMS[team];
  return `${EVIDENCE_RULES}

${TEAM_LENSES[team] || ''}

<task>
You are the "${t.label}" research team for the client "${intake.name}" (market: ${intake.market || 'not given'}).
Fill as many of your fields as the evidence allows. One fact = one field + one short Arabic value + one citation. Several facts per field are fine when they add information.
For every field the evidence does not cover, add it to "unknown" with a one-line reason.
${pass === 1 ? `You may use WebSearch ONLY to discover public pages worth saving as evidence (the brand's official social profiles, store pages on marketplaces, Google Maps listing, press). Put up to 4 such URLs in "requestedUrls" with a reason. Request a URL ONLY if you are confident it belongs to this exact client (same name AND matching details such as country, products or website); many brands share similar names — when unsure, request nothing. The system will capture them and ask you again. Do not cite search results.` : `This is pass 2: new evidence was captured. ${missing.length ? `Try hard to fill these still-missing important fields: ${missing.join(', ')}.` : ''}`}
</task>

<client>
name: ${intake.name}
website: ${intake.website || 'none given'}
socials given: ${(intake.socials || []).join(', ') || 'none'}
market: ${intake.market || 'not given'}
known constraints: ${intake.constraints || 'none given'}
</client>

<fields>
${Object.entries(t.fields).map(([k, v]) => `${k}${REQUIRED_FIELDS[k] ? ' (important)' : ''}: ${v}`).join('\n')}
</fields>

${checks}

${packet}`;
}

function verifyFacts(p, facts, cache) {
  const kept = [];
  const rejected = [];
  for (const f of facts) {
    const v = verifyCitation(p, f, cache);
    if (v.ok) kept.push({ ...f, citation: v.kind });
    else rejected.push({ ...f, reason: v.reason });
  }
  return { kept, rejected };
}

const qualityCheck = (p, cache) => (out) => {
  const { rejected } = verifyFacts(p, out.facts, cache);
  if (out.facts.length >= 4 && rejected.length > out.facts.length / 3) {
    return [`${rejected.length} of ${out.facts.length} citations failed verification (e.g. ${rejected.slice(0, 3).map((r) => r.reason).join('; ')}). Copy quotes exactly from the evidence text, or use a K### check id with an empty quote.`];
  }
  return [];
};

export async function runResearchStep(p, intake, { logFile, log = () => {} } = {}) {
  const cache = new Map();
  const teams = Object.keys(TEAMS);
  const checks = checksPacket(p);
  const results = {};

  log('Research pass 1 (3 teams in parallel)');
  const pass1 = await Promise.all(
    teams.map((team) =>
      runAiStep({
        step: `research-${team}-pass1`,
        systemPrompt: SYSTEM.research,
        prompt: teamPrompt(team, intake, evidencePacket(p, { kinds: TEAM_SOURCES[team] }).text, checks, { pass: 1, missing: [] }),
        schema: researchSchema(team, { allowRequests: true }),
        tools: ['WebSearch'],
        check: qualityCheck(p, cache),
        logFile,
        requestsDir: p.aiRequestsDir,
      }),
    ),
  );
  teams.forEach((team, i) => (results[team] = { pass1: pass1[i].output }));

  const requested = [...new Set(teams.flatMap((team) => (results[team].pass1.requestedUrls || []).map((r) => r.url)))];
  const newSources = requested.length ? await captureRequested(p, requested, { log, max: 6 }) : [];
  const usableNew = newSources.filter((s) => s.status === 'ok' || s.kind === 'social');

  for (const team of teams) {
    const { kept } = verifyFacts(p, results[team].pass1.facts, cache);
    const filled = new Set(kept.map((f) => f.field));
    results[team].missing = Object.keys(TEAMS[team].fields).filter((f) => REQUIRED_FIELDS[f] && !filled.has(f));
  }

  if (usableNew.length) {
    log(`Research pass 2 with ${usableNew.length} new page(s)`);
    const pass2Teams = teams.filter((team) => results[team].missing.length || (results[team].pass1.requestedUrls || []).length);
    const pass2 = await Promise.all(
      pass2Teams.map((team) =>
        runAiStep({
          step: `research-${team}-pass2`,
          systemPrompt: SYSTEM.research,
          prompt: teamPrompt(team, intake, evidencePacket(p, { kinds: TEAM_SOURCES[team] }).text, checks, { pass: 2, missing: results[team].missing }),
          schema: researchSchema(team, { allowRequests: false }),
          check: qualityCheck(p, cache),
          logFile,
          requestsDir: p.aiRequestsDir,
        }),
      ),
    );
    pass2Teams.forEach((team, i) => (results[team].pass2 = pass2[i].output));
  }

  const summary = { capturedUrls: newSources.map((s) => ({ id: s.id, url: s.url, status: s.status })), teams: {} };
  for (const team of teams) {
    const all = [...results[team].pass1.facts, ...(results[team].pass2?.facts || [])];
    const seen = new Set();
    const unique = all.filter((f) => {
      const key = `${f.field}|${f.evidenceId}|${f.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const { kept, rejected } = verifyFacts(p, unique, cache);
    const filled = new Set(kept.map((f) => f.field));
    const unknown = [...(results[team].pass2?.unknown || results[team].pass1.unknown)].filter((u) => !filled.has(u.field));
    const out = { team, facts: kept, rejected, unknown, requestedUrls: results[team].pass1.requestedUrls || [] };
    save(join(p.researchDir, `${team}.json`), out);
    summary.teams[team] = { facts: kept.length, rejected: rejected.length, unknown: unknown.length };
  }
  save(join(p.researchDir, 'summary.json'), summary);
  return summary;
}
