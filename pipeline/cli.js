#!/usr/bin/env node
// Command line for the pipeline (also used by the Claude Code fallback skills).
//   node pipeline/cli.js new <slug> --name "..." [--website ...] [--social url]... [--market ...] [--notes file] [--presented-to ...]
//   node pipeline/cli.js status <slug>
//   node pipeline/cli.js run <slug> [step]          (no step = run until the next gate / question)
//   node pipeline/cli.js answer <slug> <questionId> <answer>
//   node pipeline/cli.js check-answer <slug> <checkKey> <present|absent|value> [value text]
//   node pipeline/cli.js gate1 <slug> <decisions.json> [--approve]
//   node pipeline/cli.js gate2 <slug> [edits.json] [--approve]
//   node pipeline/cli.js gate3 <slug> --approve | --revise "notes"
//   node pipeline/cli.js sent <slug> [note]
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { clientPaths, load, save, writeNotes, upsertCheck, listClients, slugify } from './client.js';
import { computeState } from './steps.js';
import { runStep, runAuto, engineContext, planFromDisk } from './run.js';
import { saveAnswer } from './steps/record.js';
import { saveGate1, approveGate1, addGate1Problem, saveGate2Edits, approveGate2, requestRevision, approveGate3, markSent } from './gates.js';

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith('--') ? true : (i++, next);
      if (key === 'social') (flags.social ||= []).push(value);
      else flags[key] = value;
    } else flags._.push(a);
  }
  return flags;
}

export function createClient({ slug, name, website = '', socials = [], market = '', constraints = '', notes = '', presentedTo = '', displayName = '' }) {
  const s = slug || slugify(name);
  const p = clientPaths(s);
  if (existsSync(p.intake)) throw new Error(`Client "${s}" already exists`);
  mkdirSync(p.dir, { recursive: true });
  save(p.intake, { name, displayName: displayName || name, presentedTo: presentedTo || name, website, socials, market, constraints, createdAt: new Date().toISOString() });
  writeNotes(p, notes);
  return s;
}

function printState(slug) {
  const st = computeState(slug, engineContext());
  console.log(`${slug} — ${st.blueprintStatus}${st.needsInput ? ' (needs input)' : ''}`);
  for (const [id, s] of Object.entries(st.steps)) console.log(`  ${s.state.padEnd(9)} ${id.padEnd(9)} ${s.summary || s.error || ''}`);
}

async function main() {
  const [cmd, slug, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  const log = (m) => console.log(`  · ${m}`);
  switch (cmd) {
    case 'list':
      for (const c of listClients()) printState(c);
      return 0;
    case 'new': {
      const notes = f.notes ? readFileSync(resolve(f.notes), 'utf8') : '';
      const s = createClient({ slug, name: f.name || slug, website: f.website || '', socials: f.social || [], market: f.market || '', constraints: f.constraints || '', notes, presentedTo: f['presented-to'] || '', displayName: f['display-name'] || '' });
      console.log(`Created clients/${s}`);
      return 0;
    }
    case 'status':
      printState(slug);
      return 0;
    case 'run': {
      if (f._[0]) {
        const r = await runStep(slug, f._[0], { log });
        printState(slug);
        return r.ok ? 0 : 1;
      }
      const r = await runAuto(slug, { log });
      console.log(`Stopped: ${r.reason}${r.stoppedAt ? ` (${r.stoppedAt})` : ''}${r.error ? ` — ${r.error}` : ''}`);
      printState(slug);
      return r.reason === 'failed' ? 1 : 0;
    }
    case 'answer':
      saveAnswer(clientPaths(slug), f._[0], f._.slice(1).join(' '));
      console.log('Saved. Run the record step again.');
      return 0;
    case 'check-answer': {
      const [key, result, ...value] = f._;
      const p = clientPaths(slug);
      const existing = load(p.checks, []).find((c) => c.key === key);
      if (!existing) throw new Error(`No check with key ${key}`);
      upsertCheck(p, { key, result, value: value.join(' '), by: 'you', at: new Date().toISOString() });
      console.log('Saved.');
      return 0;
    }
    case 'gate1': {
      const p = clientPaths(slug);
      if (f._[0]) {
        const input = JSON.parse(readFileSync(resolve(f._[0]), 'utf8'));
        saveGate1(p, input);
        for (const a of input.add || []) console.log(`Added ${addGate1Problem(p, a)}`);
      }
      if (f.approve) {
        const st = computeState(slug, engineContext());
        const r = approveGate1(p, st.steps.review.outputHash);
        console.log(r.ok ? 'Gate 1 approved.' : `Not approved:\n  ${r.errors.join('\n  ')}`);
        return r.ok ? 0 : 1;
      }
      return 0;
    }
    case 'gate2': {
      const p = clientPaths(slug);
      if (f._[0]) saveGate2Edits(p, JSON.parse(readFileSync(resolve(f._[0]), 'utf8')));
      if (f.approve) {
        const ctx = engineContext();
        const st = computeState(slug, ctx);
        if (st.steps.plan.state !== 'done') await runStep(slug, 'plan', { log, ctx });
        const plan = planFromDisk(p);
        const r = approveGate2(p, computeState(slug, ctx).steps.plan.outputHash, plan.ok);
        console.log(r.ok ? 'Gate 2 approved.' : `Not approved:\n  ${r.errors.join('\n  ')}`);
        return r.ok ? 0 : 1;
      }
      return 0;
    }
    case 'gate3': {
      const p = clientPaths(slug);
      if (f.revise) {
        requestRevision(p, f.revise);
        console.log('Revision requested; run the pipeline again to rewrite.');
        return 0;
      }
      if (f.approve) {
        const st = computeState(slug, engineContext());
        const r = approveGate3(p, { renderHash: st.steps.render.outputHash, draftPdf: `${p.draftDir}/proposal-draft.pdf`, draftHtml: `${p.draftDir}/proposal-draft.html`, slug, checksOk: load(p.review, {}).ok });
        console.log(r.ok ? `Gate 3 approved — version ${r.version}: ${r.pdf}` : `Not approved:\n  ${r.errors.join('\n  ')}`);
        return r.ok ? 0 : 1;
      }
      return 0;
    }
    case 'sent': {
      const r = markSent(clientPaths(slug), f._.join(' '));
      console.log(r.ok ? 'Marked as sent.' : r.errors.join('\n'));
      return r.ok ? 0 : 1;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'));
      return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => (process.exitCode = code))
    .catch((e) => {
      console.error(e.stack || e.message);
      process.exitCode = 1;
    });
}
