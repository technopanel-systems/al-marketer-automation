// Human gates. Gate 1: diagnosis. Gate 2: commercial scope. Gate 3: map & proposal. Then "sent".
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load, save, addTextSource } from './client.js';
import { sha256 } from '../engine/util/data.js';

export const sentFile = (p) => join(p.dir, 'gates', 'sent.json');

// Problems as the team approved them (their edits applied), in diagnosis order.
export function confirmedProblems(p) {
  const diagnosis = load(p.diagnosis, { problems: [] });
  const gate1 = load(p.gate1, { decisions: {} });
  return [...diagnosis.problems, ...addedProblems(gate1)]
    .filter((prob) => gate1.decisions[prob.id]?.decision === 'confirmed')
    .map((prob) => {
      const d = gate1.decisions[prob.id];
      const evidence = [...prob.evidence];
      if (d.confirmationEvidenceId) evidence.push({ evidenceId: d.confirmationEvidenceId, quote: d.note, kind: 'human' });
      return { ...prob, problemType: d.problemType || prob.problemType, severity: Number(d.severity || prob.severity), title_ar: d.title_ar || prob.title_ar, statement_ar: d.statement_ar || prob.statement_ar, evidence };
    });
}

/**
 * decisions: { P1: { decision: 'confirmed'|'rejected'|'pending', problemType, severity, title_ar, statement_ar, note } }
 * Saving never approves; approveGate1 checks the rules.
 */
// Problems the team adds at Gate 1 (the AI missed them). They need a note saying how the team knows.
export function addedProblems(gate1) {
  return (gate1.added || []).map((a) => ({
    id: a.id,
    key: a.id,
    title_ar: a.title_ar,
    statement_ar: a.statement_ar,
    problemType: a.problemType,
    severity: Number(a.severity),
    impacts: [{ category: a.impactCategory || 'conversion', explanation_ar: a.impact_ar || a.statement_ar }],
    evidence: a.confirmationEvidenceId ? [{ evidenceId: a.confirmationEvidenceId, quote: a.note, kind: 'human' }] : [],
    evidenceStatus: a.confirmationEvidenceId ? 'verified' : 'unverified',
    flags: [],
    addedByTeam: true,
    review: null,
  }));
}

export function addGate1Problem(p, problem) {
  const current = load(p.gate1, { decisions: {} });
  const added = [...(current.added || [])];
  const id = `T${added.reduce((m, a) => Math.max(m, Number(a.id.slice(1))), 0) + 1}`;
  added.push({ ...problem, id });
  save(p.gate1, { ...current, added, decisions: { ...current.decisions, [id]: { decision: 'confirmed', note: problem.note } }, approved: false, approvedAt: null });
  return id;
}

export function removeGate1Problem(p, id) {
  const current = load(p.gate1, { decisions: {} });
  const decisions = { ...current.decisions };
  delete decisions[id];
  save(p.gate1, { ...current, added: (current.added || []).filter((a) => a.id !== id), decisions, approved: false, approvedAt: null });
}

export function saveGate1(p, { decisions, dialect }) {
  const current = load(p.gate1, { decisions: {} });
  const next = { ...current, decisions: { ...current.decisions }, dialect: dialect || current.dialect || 'egyptian', approved: false, approvedAt: null, savedAt: new Date().toISOString() };
  for (const [id, d] of Object.entries(decisions || {})) {
    const prev = next.decisions[id] || {};
    const merged = { ...prev, ...d };
    if (d.note !== undefined && d.note !== prev.note) merged.confirmationEvidenceId = null;
    next.decisions[id] = merged;
  }
  save(p.gate1, next);
  return next;
}

export function gate1Problems(p) {
  const diagnosis = load(p.diagnosis, { problems: [] });
  const gate1 = load(p.gate1, { decisions: {} });
  const errors = [];
  for (const a of gate1.added || []) if (!(a.note || '').trim()) errors.push(`${a.id}: added problems need a note saying how you know`);
  for (const prob of diagnosis.problems) {
    const d = gate1.decisions[prob.id];
    if (!d || !['confirmed', 'rejected'].includes(d.decision)) errors.push(`${prob.id}: confirm or reject it`);
    else if (d.decision === 'confirmed' && prob.evidenceStatus !== 'verified' && !(d.note || '').trim()) errors.push(`${prob.id}: has no verified evidence — add a short note saying how you know this is true, or reject it`);
  }
  return errors;
}

export function approveGate1(p, diagnosisHash) {
  const errors = gate1Problems(p);
  if (errors.length) return { ok: false, errors };
  const gate1 = load(p.gate1, { decisions: {} });
  const diagnosis = load(p.diagnosis, { problems: [] });
  // A note confirming a problem becomes quotable human evidence.
  for (const prob of diagnosis.problems) {
    const d = gate1.decisions[prob.id];
    if (d?.decision === 'confirmed' && (d.note || '').trim() && !d.confirmationEvidenceId) {
      const src = addTextSource(p, { kind: 'human', title: `Team confirmation for ${prob.id}`, text: `The Al-Marketer team confirmed the problem "${prob.title_ar}": ${d.note.trim()}` });
      d.confirmationEvidenceId = src.id;
    }
  }
  for (const a of gate1.added || []) {
    if (!a.confirmationEvidenceId) {
      const src = addTextSource(p, { kind: 'human', title: `Problem added by the team: ${a.id}`, text: `The Al-Marketer team added the problem "${a.title_ar}": ${a.note.trim()}` });
      a.confirmationEvidenceId = src.id;
    }
  }
  save(p.gate1, { ...gate1, approved: true, approvedAt: new Date().toISOString(), diagnosisHash });
  return { ok: true };
}

// Gate 2 edits: { optIn: [], remove: [], add: [{targetId, problemIds, reason}], phase: {serviceId: 'P1'|'P2'} }
export function saveGate2Edits(p, edits) {
  const current = load(p.gate2, {});
  const next = { optIn: [], remove: [], add: [], phase: {}, ...current, ...edits, approved: false, approvedAt: null, approvedPlanHash: null, savedAt: new Date().toISOString() };
  save(p.gate2, next);
  return next;
}

export function approveGate2(p, planHash, planOk) {
  if (!planOk) return { ok: false, errors: ['The plan has failing checks — fix the scope before approving'] };
  const current = load(p.gate2, { optIn: [], remove: [], add: [], phase: {} });
  save(p.gate2, { ...current, approved: true, approvedAt: new Date().toISOString(), approvedPlanHash: planHash });
  return { ok: true };
}

export function requestRevision(p, notes) {
  const current = load(p.gate3, {});
  const history = [...(current.history || [])];
  if (current.revisionNotes) history.push({ notes: current.revisionNotes, at: current.requestedAt });
  save(p.gate3, { ...current, approved: false, revisionNotes: String(notes || '').trim(), requestedAt: new Date().toISOString(), history });
}

export function approveGate3(p, { renderHash, draftPdf, draftHtml, slug, checksOk }) {
  if (!checksOk) return { ok: false, errors: ['Automated reviews have errors — request changes or fix the content first'] };
  if (!existsSync(draftPdf) || !existsSync(draftHtml)) return { ok: false, errors: ['Render the proposal first'] };
  mkdirSync(p.outputDir, { recursive: true });
  const versions = readdirSync(p.outputDir).map((f) => Number((f.match(/-v(\d+)\.pdf$/) || [])[1] || 0));
  const version = Math.max(0, ...versions) + 1;
  const pdf = join(p.outputDir, `${slug}-proposal-v${version}.pdf`);
  const html = join(p.outputDir, `${slug}-proposal-v${version}.html`);
  copyFileSync(draftPdf, pdf);
  copyFileSync(draftHtml, html);
  const current = load(p.gate3, {});
  save(p.gate3, { ...current, approved: true, approvedAt: new Date().toISOString(), renderHash, version, pdf: `output/${slug}-proposal-v${version}.pdf`, html: `output/${slug}-proposal-v${version}.html`, pdfSha256: sha256(readFileSync(pdf)) });
  return { ok: true, version, pdf, html };
}

export function markSent(p, note) {
  const gate3 = load(p.gate3, {});
  if (!gate3.approved) return { ok: false, errors: ['Approve the proposal at Gate 3 first'] };
  save(sentFile(p), { sentAt: new Date().toISOString(), version: gate3.version, note: String(note || '') });
  return { ok: true };
}
