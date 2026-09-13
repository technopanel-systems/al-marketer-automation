#!/usr/bin/env node
// Al-Marketer Control Center — a local web app (http://localhost:4317). Nothing is hosted; everything stays on this PC.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { ROOT } from '../engine/catalog/store.js';
import { clientPaths, listClients, load, upsertCheck } from '../pipeline/client.js';
import { computeState } from '../pipeline/steps.js';
import { runAuto, runStep, engineContext, planFromDisk } from '../pipeline/run.js';
import { createClient } from '../pipeline/cli.js';
import { saveAnswer } from '../pipeline/steps/record.js';
import { saveGate1, approveGate1, addGate1Problem, removeGate1Problem, saveGate2Edits, approveGate2, requestRevision, approveGate3, markSent } from '../pipeline/gates.js';
import { save } from '../pipeline/client.js';
import { layout, esc, flash } from './html.js';
import * as pages from './pages.js';

const PORT = Number(process.env.ALM_PORT || 4317);
const HOST = '127.0.0.1';

// ---------- jobs (one at a time per client) ----------
const jobs = new Map();
function startJob(slug, label, fn) {
  const current = jobs.get(slug);
  if (current?.running) return false;
  const job = { running: true, label, log: [], startedAt: new Date().toISOString(), result: '' };
  jobs.set(slug, job);
  const log = (m) => {
    job.log.push(`${new Date().toLocaleTimeString()}  ${m}`);
    if (job.log.length > 400) job.log.shift();
  };
  Promise.resolve()
    .then(() => fn(log))
    .then((r) => {
      job.result = r?.reason ? `${r.reason}${r.stoppedAt ? ` (${r.stoppedAt})` : ''}${r.error ? ` — ${r.error}` : ''}` : r?.ok === false ? `failed — ${r.error}` : 'finished';
    })
    .catch((e) => {
      job.result = `error — ${e.message}`;
      log(`ERROR ${e.stack || e.message}`);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    });
  return true;
}
const continueJob = (slug) => startJob(slug, 'Continue pipeline', (log) => runAuto(slug, { log }));

// ---------- request helpers ----------
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 5_000_000) throw new Error('Request too large');
    chunks.push(c);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
const send = (res, status, body, type = 'text/html; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const redirect = (res, to) => {
  res.writeHead(303, { location: to });
  res.end();
};
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function serveFile(res, baseDir, rel, { download = false } = {}) {
  const base = resolve(baseDir);
  const file = resolve(base, normalize(decodeURIComponent(rel)));
  if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  const headers = { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (download) headers['content-disposition'] = `attachment; filename="${file.split(sep).pop()}"`;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

const validSlug = (s) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) && listClients().includes(s);

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const msg = url.searchParams.get('msg');
  const kind = url.searchParams.get('kind') || 'info';

  if (path.startsWith('/static/')) {
    if (path === '/static/logo.png') return serveFile(res, join(ROOT, 'render', 'assets', 'brand'), 'logo-en-white.png');
    return serveFile(res, join(ROOT, 'app', 'static'), path.slice(8));
  }
  if (path === '/' && req.method === 'GET') return send(res, 200, layout({ title: 'Clients', body: pages.dashboard(jobs) + flash(msg, kind) }));
  if (path === '/help') return send(res, 200, layout({ title: 'How to use', body: pages.help() }));
  if (path === '/catalog' && req.method === 'GET') return send(res, 200, layout({ title: 'Catalog & rules', body: pages.catalogPage(msg, kind) }));
  if (path === '/catalog/report') return serveFile(res, join(ROOT, 'catalog', 'reports'), 'catalog-report.html');
  if (path === '/catalog/run' && req.method === 'POST') {
    const body = await readBody(req);
    const cmd = { pull: 'pull-notion', import: 'import-csv', export: 'export-csv' }[body.get('action')];
    if (!cmd) return redirect(res, '/catalog');
    const out = await new Promise((done) => {
      const child = spawn(process.execPath, [join(ROOT, 'engine', 'catalog', 'cli.js'), cmd], { cwd: ROOT, windowsHide: true });
      let text = '';
      child.stdout.on('data', (d) => (text += d));
      child.stderr.on('data', (d) => (text += d));
      child.on('close', (code) => done({ code, text }));
    });
    return redirect(res, `/catalog?kind=${out.code === 0 ? 'ok' : 'bad'}&msg=${encodeURIComponent(out.text.slice(-1200))}`);
  }
  if (path === '/new' && req.method === 'GET') return send(res, 200, layout({ title: 'New client', body: pages.newClient() }));
  if (path === '/new' && req.method === 'POST') {
    const b = await readBody(req);
    const name = (b.get('name') || '').trim();
    if (!name) return redirect(res, '/new');
    try {
      const slug = createClient({
        slug: (b.get('slug') || '').trim() || undefined,
        name,
        displayName: b.get('displayName') || name,
        presentedTo: b.get('presentedTo') || name,
        website: (b.get('website') || '').trim(),
        socials: (b.get('socials') || '').split(/\s+/).filter((s) => /^https?:\/\//.test(s)),
        market: b.get('market') || '',
        constraints: b.get('constraints') || '',
        notes: b.get('notes') || '',
      });
      continueJob(slug);
      return redirect(res, `/c/${slug}?msg=${encodeURIComponent('Client created — collecting evidence and researching now. You can close this page; come back when the status changes.')}`);
    } catch (e) {
      return send(res, 400, layout({ title: 'New client', body: flash(e.message, 'bad') + pages.newClient() }));
    }
  }

  if (path.startsWith('/api/c/')) {
    const [, , , slug, what] = path.split('/');
    if (!validSlug(slug)) return send(res, 404, '{}', 'application/json');
    if (what === 'job') {
      const job = jobs.get(slug) || { running: false, log: [] };
      return send(res, 200, JSON.stringify(job), 'application/json');
    }
    if (what === 'state') return send(res, 200, JSON.stringify(computeState(slug, engineContext())), 'application/json');
  }

  const m = path.match(/^\/c\/([a-z0-9-]+)(?:\/([a-z0-9]+))?(?:\/(.*))?$/);
  if (m) {
    const [, slug, tab = '', rest = ''] = m;
    if (!validSlug(slug)) return send(res, 404, layout({ title: 'Not found', body: '<p>Client not found.</p>' }));
    const p = clientPaths(slug);
    const back = (t, message, k = 'ok') => redirect(res, `/c/${slug}${t ? `/${t}` : ''}?kind=${k}&msg=${encodeURIComponent(message)}`);

    if (tab === 'files' && req.method === 'GET') return serveFile(res, p.dir, rest, { download: url.searchParams.has('download') });

    if (req.method === 'POST') {
      const b = await readBody(req);
      const action = b.get('action');
      if (tab === 'run') {
        const step = b.get('step');
        const started = step ? startJob(slug, `Run step: ${step}`, (log) => runStep(slug, step, { log })) : continueJob(slug);
        return back(b.get('back') || '', started ? 'Started. The page refreshes when it finishes.' : 'A job is already running for this client.', started ? 'info' : 'warn');
      }
      if (tab === 'questions') {
        for (const [k, v] of b.entries()) {
          if (k.startsWith('q:') && v.trim()) saveAnswer(p, k.slice(2), v.trim());
          if (k.startsWith('check:') && v) {
            const key = k.slice(6);
            const value = (b.get(`checkvalue:${key}`) || '').trim();
            upsertCheck(p, { key, result: v, value, by: 'you', manual: true, at: new Date().toISOString() });
          }
        }
        if (action === 'continue') continueJob(slug);
        return back('questions', action === 'continue' ? 'Answers saved — updating the client record and continuing.' : 'Answers saved.');
      }
      if (tab === 'intake') {
        const intake = load(p.intake);
        const next = { ...intake, displayName: b.get('displayName') || intake.displayName, presentedTo: b.get('presentedTo') || intake.presentedTo, website: (b.get('website') || '').trim(), socials: (b.get('socials') || '').split(/\s+/).filter((s) => /^https?:\/\//.test(s)), market: b.get('market') || '', constraints: b.get('constraints') || '' };
        save(p.intake, next);
        if (b.has('notes')) (await import('../pipeline/client.js')).writeNotes(p, b.get('notes'));
        return back('', 'Client details saved. Steps that depend on them are now marked for re-run.');
      }
      if (tab === 'gate1' && action === 'add-problem') {
        const title = (b.get('new_title') || '').trim();
        const note = (b.get('new_note') || '').trim();
        if (!title || !note) return back('gate1', 'A new problem needs a title and a note saying how you know.', 'bad');
        const id = addGate1Problem(p, { title_ar: title, statement_ar: (b.get('new_statement') || title).trim(), problemType: b.get('new_type'), severity: Number(b.get('new_severity') || 2), impactCategory: b.get('new_impact') || 'conversion', note });
        return back('gate1', `Added ${id}. Approve the diagnosis when ready.`);
      }
      if (tab === 'gate1' && action && action.startsWith('remove-added:')) {
        removeGate1Problem(p, action.slice(13));
        return back('gate1', 'Removed.');
      }
      if (tab === 'gate1') {
        const diagnosis = load(p.diagnosis, { problems: [] });
        const decisions = {};
        for (const prob of diagnosis.problems) {
          decisions[prob.id] = {
            decision: b.get(`decision_${prob.id}`) || 'pending',
            problemType: b.get(`type_${prob.id}`) || prob.problemType,
            severity: Number(b.get(`severity_${prob.id}`) || prob.severity),
            title_ar: b.get(`title_${prob.id}`) || prob.title_ar,
            statement_ar: b.get(`statement_${prob.id}`) || prob.statement_ar,
            note: b.get(`note_${prob.id}`) || '',
          };
        }
        saveGate1(p, { decisions, dialect: b.get('dialect') || 'egyptian' });
        if (action === 'approve') {
          const st = computeState(slug, engineContext());
          const r = approveGate1(p, st.steps.review.outputHash);
          if (!r.ok) return back('gate1', r.errors.join(' · '), 'bad');
          continueJob(slug);
          return back('gate2', 'Diagnosis approved. Building the scope and 3-month plan…');
        }
        return back('gate1', 'Saved (not approved yet).');
      }
      if (tab === 'gate2') {
        const current = load(p.gate2, { optIn: [], remove: [], add: [], phase: {} });
        const phase = {};
        for (const [k, v] of b.entries()) if (k.startsWith('phase:') && v) phase[k.slice(6)] = v;
        let add = [...(current.add || [])].filter((_, i) => !b.has(`dropadd_${i}`));
        if (b.get('add_target')) add.push({ targetId: b.get('add_target'), problemIds: b.getAll('add_problems'), reason: (b.get('add_reason') || '').trim() });
        saveGate2Edits(p, { optIn: b.getAll('optin'), remove: b.getAll('remove'), add, phase });
        if (action === 'approve') {
          const ctx = engineContext();
          await runStep(slug, 'plan', { ctx });
          const st = computeState(slug, ctx);
          const r = approveGate2(p, st.steps.plan.outputHash, planFromDisk(p).ok);
          if (!r.ok) return back('gate2', r.errors.join(' · '), 'bad');
          continueJob(slug);
          return back('gate3', 'Scope approved. Writing and designing the proposal — this takes several minutes.');
        }
        startJob(slug, 'Update plan', (log) => runStep(slug, 'plan', { log }));
        return back('gate2', 'Saved — the plan is being recalculated.');
      }
      if (tab === 'gate3') {
        if (action === 'revise') {
          requestRevision(p, b.get('revision') || '');
          continueJob(slug);
          return back('gate3', 'Revision requested — rewriting, checking and redesigning now.');
        }
        if (action === 'save-content') {
          try {
            const content = JSON.parse(b.get('content') || '');
            save(p.content, content);
            startJob(slug, 'Re-check and re-render edited text', async (log) => {
              const ctx = engineContext();
              await runStep(slug, 'check', { log, ctx });
              return runStep(slug, 'render', { log, ctx });
            });
            return back('gate3', 'Text saved — checking and redesigning.');
          } catch (e) {
            return back('gate3', `Not saved: ${e.message}`, 'bad');
          }
        }
        if (action === 'approve') {
          const st = computeState(slug, engineContext());
          const r = approveGate3(p, { renderHash: st.steps.render.outputHash, draftPdf: join(p.draftDir, 'proposal-draft.pdf'), draftHtml: join(p.draftDir, 'proposal-draft.html'), slug, checksOk: load(p.review, {}).ok });
          return r.ok ? back('gate3', `Approved — final files saved as version ${r.version}.`) : back('gate3', r.errors.join(' · '), 'bad');
        }
        if (action === 'sent') {
          const r = markSent(p, b.get('sentnote') || '');
          return r.ok ? back('', 'Marked as sent.') : back('gate3', r.errors.join(' · '), 'bad');
        }
      }
      return back(tab, 'Unknown action', 'bad');
    }

    const ctx = engineContext();
    const state = computeState(slug, ctx);
    const job = jobs.get(slug);
    const common = { slug, p, state, ctx, job, msg: flash(msg, kind) };
    const render = { '': pages.overview, questions: pages.questions, evidence: pages.evidence, record: pages.record, gate1: pages.gate1, gate2: pages.gate2, gate3: pages.gate3 }[tab];
    if (!render) return send(res, 404, layout({ title: 'Not found', body: '<p>Page not found.</p>' }));
    const intake = load(p.intake);
    return send(res, 200, layout({ title: intake.name, slug, active: tab, body: render(common), refreshWhileRunning: true }));
  }
  return send(res, 404, layout({ title: 'Not found', body: '<p>Page not found.</p>' }));
}

function openBrowser() {
  if (process.env.ALM_NO_BROWSER) return;
  spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, 500, layout({ title: 'Error', body: `<div class="flash bad">Something went wrong: ${esc(e.message)}</div><pre class="log">${esc(e.stack)}</pre>` }));
  });
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`The Control Center is already running — opening http://localhost:${PORT}`);
    openBrowser();
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`Al-Marketer Control Center: http://localhost:${PORT}  (keep this window open; close it to stop)`);
  openBrowser();
});

