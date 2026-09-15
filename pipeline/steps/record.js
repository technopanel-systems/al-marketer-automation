// Record step (code): merges verified facts into the Client Information Record, works out readiness and language,
// and lists what is still unknown as questions for the team. Answers become human evidence (H###).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TEAMS, ALL_FIELDS, FIELD_TEAM, REQUIRED_FIELDS, READINESS_KEYS, OPERATIONS, RECORD_SECTIONS } from '../../ai/fields.js';
import { load, save, loadSources, loadChecks, sourceText, addTextSource } from '../client.js';
import { arabicRatio } from '../../engine/util/text.js';

const CONF_RANK = { high: 0, medium: 1, low: 2 };
const CITE_RANK = { human: 0, notes: 1, check: 2, page: 3 };

export const answersFile = (p) => join(p.recordDir, 'answers.json');

export function questionCatalog() {
  return {
    ...Object.fromEntries(Object.entries(REQUIRED_FIELDS).map(([field, q]) => [`field:${field}`, { id: `field:${field}`, kind: 'field', field, blocking: true, en: q.en, ar: q.ar, team: FIELD_TEAM[field] }])),
    language: { id: 'language', kind: 'language', blocking: true, en: 'Which language should the proposal be in? (Arabic or English)', ar: 'العرض يكون بأي لغة؟', options: ['ar', 'en'] },
    ...Object.fromEntries(Object.entries(READINESS_KEYS).map(([key, label]) => [`readiness:${key}`, { id: `readiness:${key}`, kind: 'readiness', key, blocking: false, en: `${label}?`, options: ['yes', 'no', 'unknown'] }])),
  };
}

// Saves one answer; a free-text answer to a field question also becomes quotable human evidence.
export function saveAnswer(p, questionId, answer) {
  const q = questionCatalog()[questionId];
  const answers = load(answersFile(p), {});
  const value = String(answer ?? '').trim();
  const entry = { answer: value, at: new Date().toISOString() };
  if (q?.kind === 'field' && value && value.toLowerCase() !== 'unknown') {
    const src = addTextSource(p, { kind: 'human', title: `Answer: ${q.en}`, text: `Question: ${q.en}\nAnswer from the Al-Marketer team: ${value}` });
    entry.evidenceId = src.id;
  }
  answers[questionId] = entry;
  save(answersFile(p), answers);
  return entry;
}

export function detectLanguage(p) {
  const sources = loadSources(p).filter((s) => (s.kind === 'website' || s.kind === 'social') && s.status === 'ok');
  const text = sources.map((s) => (sourceText(p, s.id) || '').split('---').slice(1).join(' ').slice(0, 6000)).join('\n');
  if (text.replace(/\s/g, '').length < 200) return { value: 'unclear', ratio: null, basis: 'not enough website or social text' };
  const ratio = arabicRatio(text);
  return { value: ratio >= 0.6 ? 'ar' : ratio <= 0.3 ? 'en' : 'unclear', ratio: Math.round(ratio * 100) / 100, basis: `${sources.length} captured page(s)` };
}

export function runRecordStep(p, intake) {
  const notes = load(join(p.researchDir, 'notes.json'), { facts: [], readiness: [], languageHint: 'unclear' });
  const answers = load(answersFile(p), {});
  const facts = [...notes.facts.map((f) => ({ ...f, citation: 'notes' }))];
  for (const team of Object.keys(TEAMS)) {
    const file = join(p.researchDir, `${team}.json`);
    if (existsSync(file)) facts.push(...load(file).facts.map((f) => ({ ...f, team })));
  }
  // Human answers to field questions are the strongest evidence.
  for (const [id, a] of Object.entries(answers)) {
    if (!id.startsWith('field:') || !a.evidenceId) continue;
    facts.push({ field: id.slice(6), value: a.answer, evidenceId: a.evidenceId, quote: a.answer.slice(0, 250), confidence: 'high', citation: 'human', team: FIELD_TEAM[id.slice(6)] });
  }
  facts.forEach((f, i) => (f.id = `F${String(i + 1).padStart(3, '0')}`));

  const byField = {};
  for (const f of facts) (byField[f.field] ||= []).push(f);
  for (const list of Object.values(byField)) list.sort((a, b) => CITE_RANK[a.citation] - CITE_RANK[b.citation] || CONF_RANK[a.confidence] - CONF_RANK[b.confidence]);

  const sections = Object.fromEntries(
    Object.entries(TEAMS).map(([team, t]) => [team, Object.fromEntries(Object.keys(t.fields).map((field) => [field, byField[field] || []]))]),
  );
  // The business analyst's verified facts form their own section; its business-model finding fills an empty business_model.
  const ops = load(join(p.researchDir, 'business-ops.json'), null);
  if (ops) {
    const opsFacts = ops.facts.map((f, i) => ({ ...f, id: `B${String(i + 1).padStart(3, '0')}`, team: 'operations', citation: f.evidenceId?.[0] === 'K' ? 'check' : 'page' }));
    sections.operations = Object.fromEntries(Object.keys(OPERATIONS.fields).map((field) => [field, opsFacts.filter((f) => f.field === field)]));
    if (!sections.business.business_model.length && ops.businessModel.label !== 'unknown' && ops.businessModel.evidence.length) {
      const e = ops.businessModel.evidence[0];
      sections.business.business_model.push({ id: 'B000', field: 'business_model', value: ops.businessModel.label.replace(/_/g, ' '), evidenceId: e.evidenceId, quote: e.quote || '', confidence: ops.businessModel.confidence, citation: 'business-analyst', team: 'business' });
      byField.business_model = sections.business.business_model;
    }
  }

  // Readiness: team answer > meeting notes > automated checks.
  const checks = loadChecks(p);
  const check = (key) => checks.find((c) => c.key === key);
  const readiness = Object.fromEntries(Object.keys(READINESS_KEYS).map((k) => [k, { value: 'unknown', source: null }]));
  const tracking = ['tech_meta_pixel', 'tech_ga4', 'tech_gtm', 'tech_tiktok_pixel', 'tech_snap_pixel'].map(check).filter(Boolean);
  if (tracking.length) {
    const present = tracking.filter((c) => c.result === 'present');
    readiness.tracking_installed = present.length ? { value: 'yes', source: 'check', evidenceId: present[0].id } : { value: 'no', source: 'check', evidenceId: tracking[0].id };
  }
  for (const r of notes.readiness || []) readiness[r.key] = { value: r.value, source: 'notes', evidenceId: r.evidenceId, quote: r.quote };
  for (const [id, a] of Object.entries(answers)) {
    if (id.startsWith('readiness:') && ['yes', 'no', 'unknown'].includes(a.answer)) readiness[id.slice(10)] = { value: a.answer, source: 'human', at: a.at };
  }

  const detected = detectLanguage(p);
  const language = answers.language && ['ar', 'en'].includes(answers.language.answer)
    ? { value: answers.language.answer, source: 'human' }
    : detected.value !== 'unclear'
      ? { ...detected, source: 'website' }
      : notes.languageHint && notes.languageHint !== 'unclear'
        ? { value: notes.languageHint, source: 'notes' }
        : { ...detected, source: 'website' };

  const catalog = questionCatalog();
  const questions = [];
  for (const field of Object.keys(REQUIRED_FIELDS)) {
    if ((byField[field] || []).length) continue;
    const q = catalog[`field:${field}`];
    questions.push({ ...q, answered: Boolean(answers[q.id]), answer: answers[q.id]?.answer ?? null });
  }
  if (language.value === 'unclear') questions.push({ ...catalog.language, answered: Boolean(answers.language), answer: answers.language?.answer ?? null });
  for (const [key, r] of Object.entries(readiness)) {
    if (r.value === 'unknown' || r.source === 'notes' || r.source === 'check') questions.push({ ...catalog[`readiness:${key}`], answered: Boolean(answers[`readiness:${key}`]), answer: answers[`readiness:${key}`]?.answer ?? null });
  }
  const manualOpen = checks.filter((c) => c.manual && c.result === 'unknown').map((c) => ({ id: `check:${c.key}`, kind: 'check', blocking: false, checkId: c.id, en: c.question, url: c.url, answered: false }));
  const allQuestions = [...questions, ...manualOpen];
  const needsInput = allQuestions.some((q) => q.blocking && !q.answered);

  const record = {
    client: { name: intake.name, website: intake.website || null, market: intake.market || null, socials: intake.socials || [] },
    language,
    sections,
    factCount: facts.length,
    fieldsFilled: Object.keys(byField).length,
    fieldsTotal: Object.keys(ALL_FIELDS).length,
  };
  save(p.record, record);
  save(p.readiness, readiness);
  save(p.questions, { needsInput, questions: allQuestions });
  return { needsInput, open: allQuestions.filter((q) => !q.answered).length, facts: facts.length };
}

// Compact text of verified facts for later prompts.
export function recordText(record) {
  const lines = [];
  for (const [team, fields] of Object.entries(record.sections)) {
    lines.push(`## ${(RECORD_SECTIONS[team] || { label: team }).label}`);
    for (const [field, list] of Object.entries(fields)) {
      if (!list.length) {
        lines.push(`- ${field}: UNKNOWN`);
        continue;
      }
      for (const f of list.slice(0, 4)) lines.push(`- ${field}: ${f.value} [${f.evidenceId}${f.quote ? ` «${f.quote.slice(0, 160)}»` : ''}]`);
    }
  }
  return lines.join('\n');
}
