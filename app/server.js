#!/usr/bin/env node
// Al-Marketer Control Center — a local web app (http://localhost:4317). Nothing is hosted; everything stays on this PC.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { loadLocalEnv } from '../engine/util/env.js';
import { ROOT } from '../engine/catalog/store.js';
import { clientPaths, listClients, load, save, upsertCheck, writeNotes } from '../pipeline/client.js';
import { computeState, requestStepRun, skipStep, recordStepResult, outputHash, stepById, STAGES } from '../pipeline/steps.js';
import { runStep, engineContext, planFromDisk, chatEdit } from '../pipeline/run.js';
import { bus } from '../pipeline/events.js';
import { createClient } from '../pipeline/cli.js';
import { saveAnswer } from '../pipeline/steps/record.js';
import { saveGate1, approveGate1, addGate1Problem, removeGate1Problem, saveGate2Edits, approveGate2, requestRevision, approveGate3, markSent } from '../pipeline/gates.js';
import { socialTasks, saveCompetitorReview, loadCompetitors, setBrandProfile, setTaskStatus, saveCapture, loadCapture, profileHandle, captureTasks, dismissCandidate, loadCandidates, PLATFORM_NAMES, AUDIT_PLATFORMS } from '../pipeline/social.js';
import { openResearchBrowser } from '../collect/social/browser.js';
import { assistedCapture } from '../collect/social/assisted.js';
import { layout, esc, shortTime, themeFromCookie } from './ui/html.js';
import { parseMultipart, boundaryOf } from './multipart.js';
import { applyBriefInputs } from '../pipeline/brief.js';
import { findPresence } from '../collect/presence.js';
import { saveClientLogo } from '../collect/logo.js';
import { flash, stageStateText, stepStateText, platformMark } from './ui/components.js';
import { focusStage, primaryMove } from './ui/moves.js';
import { kick, sideJob, jobInfo, removeClient, keepClient, pendingRemoval, finishPendingRemoval } from './jobs.js';
import { ARCHIVE_DIR, listArchived, restoreArchived, deleteArchived, validArchiveId, emptyTrash } from '../pipeline/archive.js';
import { clientFrame, moveControl } from './views/frame.js';
import { home, clientSummary } from './views/home.js';
import { newClient, briefPage, briefFromForm } from './views/brief.js';
import { researchPage, evidencePage, recordPage } from './views/research.js';
import { socialPage, captureEditor } from './views/social.js';
import { diagnosisPage } from './views/diagnosis.js';
import { scopePage } from './views/scope.js';
import { proposalPage, deliveryPage } from './views/proposal.js';
import { activityPage, catalogPage, helpPage } from './views/misc.js';
import { archivePage } from './views/archive.js';
import { editorPage, contentFromForm } from './views/editor.js';
import { applyContent, restoreVersion, validateContent } from '../pipeline/versions.js';
import { contentSchema } from '../ai/steps/write.js';

loadLocalEnv();

const PORT = Number(process.env.ALM_PORT || 4317);
const HOST = '127.0.0.1';

// ---------- request helpers ----------
// Form bodies: URL-encoded, or multipart when the form uploads files (then b.files lists them).
async function readBody(req) {
  const multipart = /multipart\/form-data/i.test(req.headers['content-type'] || '');
  const limit = multipart ? 80_000_000 : 5_000_000;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error(multipart ? 'The upload is larger than 80 MB.' : 'Request too large');
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  if (multipart) {
    const { fields, files } = parseMultipart(buf, boundaryOf(req.headers['content-type']));
    fields.files = files;
    return fields;
  }
  const b = new URLSearchParams(buf.toString('utf8'));
  b.files = [];
  return b;
}

// Saves the chosen logo in the background (downloading and drawing it takes a few seconds).
function logoJob(slug, p, logo) {
  if (!logo) return;
  sideJob(slug, 'Client logo', async (log) => {
    const info = await saveClientLogo(p, logo);
    log(`saved (${info.width}×${info.height}, ${info.tone} logo, from ${info.source})`);
  });
}
const send = (res, status, body, type = 'text/html; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const redirect = (res, to) => {
  res.writeHead(303, { location: to });
  res.end();
};
const withMsg = (to, message, kind = 'ok') => {
  const [path, hash = ''] = to.split('#');
  return `${path}${path.includes('?') ? '&' : '?'}kind=${kind}&msg=${encodeURIComponent(message)}${hash ? `#${hash}` : ''}`;
};
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serveFile(res, baseDir, rel, { download = false, cache = false } = {}) {
  const base = resolve(baseDir);
  const file = resolve(base, normalize(decodeURIComponent(rel)));
  if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  const headers = { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': cache ? 'max-age=86400' : 'no-store' };
  if (download) headers['content-disposition'] = `attachment; filename="${file.split(sep).pop()}"`;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

const validSlug = (s) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) && listClients().includes(s);

function allClients(ctx) {
  return listClients()
    .filter((slug) => existsSync(clientPaths(slug).intake))
    .map((slug) => clientSummary(slug, { computeState, ctx, jobInfo }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
const needsYouCount = (clients) => clients.reduce((n, c) => n + (c.removal ? 0 : c.state.tasks.filter((t) => t.blocking).length), 0);

// Live updates: step changes and activity lines, filtered to one client (or all for Home).
function events(req, res, slug) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  const match = (e) => slug === '*' || e.slug === slug;
  const onState = (e) => match(e) && res.write(`event: state\ndata: ${JSON.stringify({ slug: e.slug, step: e.step })}\n\n`);
  const onLog = (e) => {
    if (!match(e)) return;
    const m = String(e.line).match(/^([a-z0-9-]+):\s(.*)$/);
    const step = m && stepById(m[1]);
    res.write(`event: log\ndata: ${JSON.stringify({ slug: e.slug, time: shortTime(new Date(e.at).toISOString()), at: new Date(e.at).toISOString(), step: step ? step.label : m ? m[1] : '', text: step || m ? m[2] : e.line })}\n\n`);
  };
  bus.on('state', onState);
  bus.on('log', onLog);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    bus.off('state', onState);
    bus.off('log', onLog);
    clearInterval(ping);
  });
}

// Compact state for the page to update itself without reloading.
function liveState(slug, ctx) {
  const state = computeState(slug, ctx);
  const job = jobInfo(slug);
  return {
    stages: Object.fromEntries(state.stages.map((s) => [s.id, stageStateText(s.state)])),
    steps: Object.fromEntries(Object.values(state.steps).map((s) => [s.id, [...stepStateText(s), s.state]])),
    signature: Object.values(state.steps).map((s) => `${s.id}:${s.state}:${s.outputHash || ''}`).join('|'),
    move: moveControl(primaryMove(slug, state, { running: job.running })),
    tasks: state.tasks.filter((t) => t.blocking).length,
    running: job.running || state.running.length > 0,
  };
}

let catalogResult = null;

// ---------- routes ----------
async function handle(req, res) {
  req.theme = themeFromCookie(req.headers.cookie);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const msg = flash(url.searchParams.get('msg'), url.searchParams.get('kind') || 'info');

  if (path.startsWith('/static/')) {
    const rel = path.slice(8);
    if (rel === 'logo-dark.png') return serveFile(res, join(ROOT, 'render', 'assets', 'brand'), 'logo-en-dark.png', { cache: true });
    if (rel === 'logo-light.png') return serveFile(res, join(ROOT, 'render', 'assets', 'brand'), 'logo-en-white.png', { cache: true });
    if (rel === 'brand-fonts.css') return serveFile(res, join(ROOT, 'render', 'assets'), 'fonts.css', { cache: true });
    if (rel.startsWith('fonts/')) return serveFile(res, join(ROOT, 'render', 'assets', 'fonts'), rel.slice(6), { cache: true });
    return serveFile(res, join(ROOT, 'app', 'static'), rel);
  }
  if (path === '/events') return events(req, res, url.searchParams.get('slug') || '*');

  if (req.method === 'GET' && path === '/') {
    const clients = allClients(engineContext());
    return send(res, 200, layout({ theme: req.theme, title: 'Proposals', nav: 'home', needsYou: needsYouCount(clients), live: { slug: '*' }, body: home({ clients, archived: listArchived().length, msg }) }));
  }
  if (req.method === 'GET' && path === '/archive') {
    const clients = allClients(engineContext());
    return send(res, 200, layout({ theme: req.theme, title: 'Archived proposals', nav: 'archive', needsYou: needsYouCount(clients), body: archivePage({ archived: listArchived(), msg }) }));
  }
  const arch = path.match(/^\/archive\/([a-z0-9-]+--\d{8}-\d{6})\/(restore|delete|files)(?:\/(.*))?$/);
  if (arch) {
    const [, id, what, rest = ''] = arch;
    if (!validArchiveId(id)) return send(res, 404, layout({ theme: req.theme, title: 'Not found', nav: 'archive', body: flash('That archived proposal does not exist.', 'bad') }));
    if (what === 'files' && req.method === 'GET') return serveFile(res, join(ARCHIVE_DIR, id), rest, { download: url.searchParams.has('download') });
    if (req.method !== 'POST') return redirect(res, '/archive');
    const name = (() => {
      const a = listArchived().find((x) => x.id === id);
      return a ? a.displayName || a.name : id;
    })();
    try {
      if (what === 'restore') {
        const slug = restoreArchived(id);
        kick(slug);
        return redirect(res, withMsg(`/c/${slug}`, `Restored "${name}"${slug !== id.split('--')[0] ? ` as ${slug}, because a newer proposal uses the old folder name` : ''}.`));
      }
      deleteArchived(id);
      return redirect(res, withMsg('/archive', `Deleted "${name}".`));
    } catch (e) {
      return redirect(res, withMsg('/archive', e.message, 'bad'));
    }
  }
  if (path === '/help') return send(res, 200, layout({ theme: req.theme, title: 'How to use', nav: 'help', body: helpPage() }));
  if (path === '/catalog' && req.method === 'GET') {
    const out = url.searchParams.has('done') ? catalogResult : null;
    return send(res, 200, layout({ theme: req.theme, title: 'Catalog & rules', nav: 'catalog', body: catalogPage({ msg, output: out?.text || '', kind: out?.ok ? 'ok' : 'bad' }) }));
  }
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
    catalogResult = { ok: out.code === 0, text: out.text.slice(-4000) };
    return redirect(res, withMsg('/catalog?done=1', out.code === 0 ? 'Done. The result is shown below.' : 'That did not work. The details are shown below; the catalog was not changed.', out.code === 0 ? 'ok' : 'bad'));
  }
  if (path === '/new' && req.method === 'GET') return send(res, 200, layout({ theme: req.theme, title: 'New proposal', nav: 'new', body: newClient({ msg }) }));
  if (path === '/new' && req.method === 'POST') {
    const b = await readBody(req);
    const { notes: _ignored, ...values } = { ...briefFromForm(b), notes: b.get('notes') || '' };
    if (!values.name) return send(res, 400, layout({ theme: req.theme, title: 'New proposal', nav: 'new', body: newClient({ msg: flash('Enter the client name.', 'bad'), values: { ...values, notes: b.get('notes') || '' } }) }));
    let slug;
    try {
      slug = createClient({ ...values, notes: b.get('notes') || '' });
    } catch (e) {
      return send(res, 400, layout({ theme: req.theme, title: 'New proposal', nav: 'new', body: newClient({ msg: flash(e.message, 'bad'), values: { ...values, notes: b.get('notes') || '' } }) }));
    }
    const p = clientPaths(slug);
    const r = await applyBriefInputs(p, b, b.files);
    logoJob(slug, p, r.logo);
    kick(slug);
    const extra = [r.saved.length ? `${r.saved.length} meeting report${r.saved.length === 1 ? '' : 's'} attached.` : '', r.errors.length ? `Not attached: ${r.errors.join(' ')}` : ''].filter(Boolean).join(' ');
    return redirect(res, withMsg(`/c/${slug}/research`, `Created. The website audit and meeting notes have started; this page updates as work finishes.${extra ? ` ${extra}` : ''}`, r.errors.length ? 'warn' : 'ok'));
  }
  if (path === '/api/presence' && req.method === 'GET') {
    try {
      const found = await findPresence(url.searchParams.get('website') || '');
      found.socials = found.socials.map((x) => ({ ...x, mark: platformMark(x.platform, { size: 18 }) }));
      return send(res, 200, JSON.stringify(found), 'application/json');
    } catch (e) {
      return send(res, 422, JSON.stringify({ error: e.message }), 'application/json');
    }
  }

  const api = path.match(/^\/api\/c\/([a-z0-9-]+)\/state$/);
  if (api) {
    if (!validSlug(api[1])) return send(res, 404, '{}', 'application/json');
    return send(res, 200, JSON.stringify(liveState(api[1], engineContext())), 'application/json');
  }

  const m = path.match(/^\/c\/([a-z0-9-]+)(?:\/([a-z0-9]+))?(?:\/(.*))?$/);
  if (!m) return send(res, 404, layout({ theme: req.theme, title: 'Not found', body: flash('That page does not exist.', 'bad') }));
  const [, slug, tab = '', rest = ''] = m;
  if (!validSlug(slug)) return send(res, 404, layout({ theme: req.theme, title: 'Not found', body: flash('That proposal does not exist.', 'bad') }));
  const p = clientPaths(slug);
  if (tab === 'files' && req.method === 'GET') return serveFile(res, p.dir, rest, { download: url.searchParams.has('download') });

  if (req.method === 'POST') return handlePost(req, res, slug, p, tab);

  // Old links (v1 tabs) still work.
  const legacy = { questions: 'research#questions', gate1: 'diagnosis', gate2: 'scope', gate3: 'proposal', overview: '' }[tab];
  if (legacy !== undefined) return redirect(res, `/c/${slug}/${legacy}`);
  const ctx = engineContext();
  const state = computeState(slug, ctx);
  if (!tab) return redirect(res, `/c/${slug}/${focusStage(state)}${url.search}`);

  const views = {
    brief: ['brief', () => briefPage({ slug, p, intake: load(p.intake, {}) })],
    research: ['research', () => researchPage({ slug, p, state })],
    evidence: ['research', () => evidencePage({ slug, p })],
    record: ['research', () => recordPage({ p })],
    social: ['social', () => (rest === 'capture' ? captureEditor({ slug, p, brandId: url.searchParams.get('b'), platform: url.searchParams.get('pl') }) : socialPage({ slug, p, state }))],
    diagnosis: ['diagnosis', () => diagnosisPage({ slug, p, state, ctx })],
    scope: ['scope', () => scopePage({ slug, p, state, ctx })],
    proposal: ['proposal', () => (rest === 'edit' ? editorPage({ slug, p, state }) : proposalPage({ slug, p, state, job: jobInfo(slug) }))],
    delivery: ['delivery', () => deliveryPage({ slug, p, state })],
    activity: ['', () => activityPage({ p })],
  };
  const view = views[tab];
  if (!view) return send(res, 404, layout({ theme: req.theme, title: 'Not found', body: flash('That page does not exist.', 'bad') }));
  const intake = load(p.intake, {});
  const [stage, render] = view;
  const subpage = { evidence: 'Evidence', record: 'Client record', activity: 'Activity' }[tab];
  const body = clientFrame({ slug, p, state, stage, job: jobInfo(slug), removal: pendingRemoval(slug), msg, body: `${subpage ? `<p class="subpage-back"><a href="/c/${slug}/${stage || focusStage(state)}">Back to ${esc(STAGES.find((s) => s.id === (stage || focusStage(state)))?.label || 'the proposal')}</a></p>` : ''}${render()}` });
  const clients = allClients(ctx);
  return send(res, 200, layout({ theme: req.theme, title: `${intake.displayName || intake.name} · ${subpage || STAGES.find((s) => s.id === stage)?.label || ''}`, nav: 'home', needsYou: needsYouCount(clients), live: { slug }, body }));
}

async function handlePost(req, res, slug, p, tab) {
  const b = await readBody(req);
  const action = b.get('action') || '';
  const back = (to, message, kind = 'ok') => redirect(res, withMsg(`/c/${slug}/${to}`, message, kind));

  if (tab === 'archive' || tab === 'delete') {
    const intake = load(p.intake, {});
    const name = intake.displayName || intake.name || slug;
    const r = removeClient(slug, tab);
    if (!r.ok) return back('', r.error, 'bad');
    const done = tab === 'archive' ? 'archived' : 'deleted';
    if (r.pending) return redirect(res, withMsg('/', `"${name}" will be ${done} as soon as its running work finishes. Nothing new starts for it.`, 'info'));
    return redirect(res, withMsg('/', tab === 'archive' ? `Archived "${name}". It is under Archived, ready to restore; a new proposal for this customer starts fresh.` : `Deleted "${name}".`));
  }
  if (tab === 'keep') {
    return keepClient(slug) ? back('', 'Kept. Work on this proposal continues.') : back('', 'Nothing was waiting to be archived or deleted.', 'info');
  }

  if (tab === 'run') {
    const step = b.get('step');
    if (step) {
      if (!stepById(step)) return back('', 'Unknown step.', 'bad');
      requestStepRun(p, step);
    }
    const how = kick(slug);
    const to = b.get('back') || (step ? stepById(step).stage : '');
    return back(to, step ? `${stepById(step).label} will run ${how === 'nudged' ? 'as soon as the current work allows' : 'now'}. Later steps that used it follow automatically.` : 'Continuing. Everything that can run is starting.', 'info');
  }
  if (tab === 'skip') {
    const step = b.get('step');
    try {
      skipStep(p, step);
    } catch (e) {
      return back('research', e.message, 'bad');
    }
    kick(slug);
    return back('research#competitors', 'Skipped. The diagnosis will go ahead without it.', 'info');
  }
  if (tab === 'brief') {
    const intake = load(p.intake, {});
    save(p.intake, briefFromForm(b, intake));
    if (b.has('notes')) writeNotes(p, b.get('notes'));
    const r = await applyBriefInputs(p, b, b.files);
    logoJob(slug, p, r.logo);
    kick(slug);
    const extra = [r.saved.length ? `${r.saved.length} meeting report${r.saved.length === 1 ? '' : 's'} attached.` : '', r.logo ? 'The logo is being prepared.' : '', r.errors.length ? `Not attached: ${r.errors.join(' ')}` : ''].filter(Boolean).join(' ');
    return back('brief', `Brief saved. Anything that used the changed details runs again on its own.${extra ? ` ${extra}` : ''}`, r.errors.length ? 'warn' : 'ok');
  }
  if (tab === 'questions') {
    let saved = 0;
    for (const [k, v] of b.entries()) {
      if (k.startsWith('q:') && v.trim()) {
        saveAnswer(p, k.slice(2), v.trim());
        saved++;
      }
      if (k.startsWith('check:') && v) {
        const key = k.slice(6);
        upsertCheck(p, { key, result: v, value: (b.get(`checkvalue:${key}`) || '').trim(), by: 'you', manual: true, at: new Date().toISOString() });
        saved++;
      }
    }
    kick(slug);
    return back('research#questions', saved ? `Saved ${saved} answer${saved === 1 ? '' : 's'}. The client record updates and work continues.` : 'Nothing to save: no answers were filled in.', saved ? 'ok' : 'warn');
  }
  if (tab === 'competitors') {
    const decisions = {};
    for (const c of loadCompetitors(p).list) decisions[c.id] = { status: b.get(`status_${c.id}`) || '', name: b.get(`name_${c.id}`) ?? undefined, website: b.get(`website_${c.id}`) ?? undefined, socials: b.get(`socials_${c.id}`) ?? undefined };
    const doc = saveCompetitorReview(p, { decisions, add: { name: (b.get('new_name') || '').trim(), website: (b.get('new_website') || '').trim(), socials: (b.get('new_socials') || '').trim() } });
    const left = doc.list.filter((c) => c.status === 'proposed').length;
    kick(slug);
    return back('research#competitors', left ? `Saved. ${left} suggestion${left === 1 ? '' : 's'} still need a decision.` : 'Saved. Confirmed competitors are being captured now.', left ? 'warn' : 'ok');
  }
  if (tab === 'social') {
    const intake = load(p.intake, {});
    if (action === 'industry') {
      save(p.intake, { ...intake, industry: b.get('industry') || 'general' });
      kick(slug);
      return back('social', 'Industry saved. The reference ranges update.');
    }
    if (action.startsWith('dismiss:')) {
      dismissCandidate(p, action.slice(8));
      return back('social#suggested', 'Noted: that page is not used.');
    }
    if (action === 'add-profile') {
      if (loadCandidates(p).client.some((c) => c.url === b.get('profile_url'))) dismissCandidate(p, b.get('profile_url'));
      const hit = setBrandProfile(p, b.get('profile_brand') || 'client', b.get('profile_url') || '');
      if (!hit) return back('social#captures', 'That link is not a LinkedIn, Instagram, TikTok, Facebook, X, YouTube or Snapchat profile.', 'bad');
      kick(slug);
      return back('social#captures', `${hit.name} profile added. It is captured automatically.`);
    }
    const [kindOf, brandId, platform, value] = action.split(':');
    const task = socialTasks(p, intake).tasks.find((t) => t.brandId === brandId && t.platform === platform);
    if (kindOf === 'task' && AUDIT_PLATFORMS.includes(platform)) {
      setTaskStatus(p, brandId, platform, value === 'clear' ? null : value);
      kick(slug);
      return back('social#captures', value === 'clear' ? 'Undone.' : value === 'not_found' ? 'Recorded: no account on this platform.' : 'Skipped.');
    }
    if (kindOf === 'capture-auto' && task?.url) {
      sideJob(slug, `Capture ${task.brandName} · ${PLATFORM_NAMES[platform]}`, async (log) => {
        setTaskStatus(p, brandId, platform, null);
        await captureTasks(p, [task], { log, env: process.env, intake, paceMs: 0 });
      });
      return back('social#captures', 'Capturing now. The table updates when it finishes.', 'info');
    }
    if (kindOf === 'capture-assisted' && task?.url) {
      sideJob(slug, `Research browser: ${task.brandName} · ${PLATFORM_NAMES[platform]}`, async (log) => {
        log('Opening the research browser. Look for the Chrome window with the Al-Marketer panel.');
        const browser = await openResearchBrowser();
        const r = await assistedCapture({ browser, platform, url: task.url, brandName: task.brandName, handle: profileHandle(platform, task.url), shotsDir: p.socialShotsDir, fileBase: `${brandId}__${platform}`, log });
        const rel = (f) => f.slice(p.dir.length + 1).replace(/\\/g, '/');
        if (r.action === 'done' && r.capture) {
          saveCapture(p, { ...r.capture, shots: r.capture.shots.map(rel), brandId, brandName: task.brandName, role: task.role });
          setTaskStatus(p, brandId, platform, null);
          log(`saved ${r.capture.posts.length} posts`);
        } else if (r.action === 'not_found') {
          setTaskStatus(p, brandId, platform, 'not_found');
          log('marked as not on this platform');
        } else log(`${r.action === 'timeout' ? 'timed out' : 'cancelled'}, nothing saved`);
      });
      return back('social#captures', 'The research browser is opening. Browse the profile there and press "Done — save" on the Al-Marketer panel.', 'info');
    }
    return back('social#captures', 'Nothing to do for that button. Is the profile link missing?', 'warn');
  }
  if (tab === 'socialcapture') {
    const brandId = b.get('b');
    const platform = b.get('pl');
    if (!AUDIT_PLATFORMS.includes(platform)) return back('social', 'Unknown platform.', 'bad');
    const intake = load(p.intake, {});
    const task = socialTasks(p, intake).tasks.find((t) => t.brandId === brandId && t.platform === platform);
    const existing = loadCapture(p, brandId, platform);
    const n = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Math.max(0, Number(v)));
    const posts = [];
    for (let i = 0; i < Number(b.get('rows') || 0); i++) {
      if (b.get(`remove_${i}`)) continue;
      const post = { id: b.get(`id_${i}`) || '', url: (b.get(`link_${i}`) || '').trim() || null, date: b.get(`date_${i}`) ? new Date(`${b.get(`date_${i}`)}T12:00:00Z`).toISOString() : null, type: b.get(`type_${i}`) || 'other', caption: (b.get(`caption_${i}`) || '').trim() || null, likes: n(b.get(`likes_${i}`)), comments: n(b.get(`comments_${i}`)), shares: n(b.get(`shares_${i}`)), views: n(b.get(`views_${i}`)) };
      if (!post.date && [post.likes, post.comments, post.shares, post.views].every((x) => x === null)) continue;
      const old = existing?.posts?.find((x) => x.id === post.id);
      if (old && old.date && post.date && old.date.slice(0, 10) === post.date.slice(0, 10)) post.date = old.date;
      if (!post.id) post.id = `team-${i}-${post.date ? post.date.slice(0, 10) : 'undated'}`;
      posts.push(post);
    }
    const followers = n(b.get('followers'));
    const capture = { ...(existing || {}), brandId, brandName: task?.brandName || existing?.brandName || brandId, role: task?.role || existing?.role || 'competitor', platform, url: (b.get('url') || '').trim() || existing?.url || task?.url || '', method: existing?.method && existing.status !== 'failed' ? existing.method : 'typed by the team', status: posts.length || followers !== null ? 'ok' : 'partial', capturedAt: existing?.status === 'failed' || !existing ? new Date().toISOString() : existing.capturedAt, profile: { ...(existing?.profile || {}), followers, postsTotal: n(b.get('postsTotal')) }, posts, limit: null, edited: true, error: undefined };
    saveCapture(p, capture);
    setTaskStatus(p, brandId, platform, null);
    kick(slug);
    return back('social#captures', `Numbers saved for ${capture.brandName} · ${PLATFORM_NAMES[platform]}. The scorecard updates.`);
  }
  if (tab === 'diagnosis') {
    if (action === 'add-problem') {
      const title = (b.get('new_title') || '').trim();
      const note = (b.get('new_note') || '').trim();
      if (!title || !note) return back('diagnosis', 'A new problem needs a title and a note saying how you know.', 'bad');
      const id = addGate1Problem(p, { title_ar: title, statement_ar: (b.get('new_statement') || title).trim(), problemType: b.get('new_type'), severity: Number(b.get('new_severity') || 2), impactCategory: b.get('new_impact') || 'conversion', note });
      return back(`diagnosis#${id}`, `Added ${id}.`);
    }
    if (action.startsWith('remove-added:')) {
      removeGate1Problem(p, action.slice(13));
      return back('diagnosis', 'Removed.');
    }
    const diagnosis = load(p.diagnosis, { problems: [] });
    const decisions = {};
    for (const prob of diagnosis.problems) {
      decisions[prob.id] = { decision: b.get(`decision_${prob.id}`) || 'pending', problemType: b.get(`type_${prob.id}`) || prob.problemType, severity: Number(b.get(`severity_${prob.id}`) || prob.severity), title_ar: b.get(`title_${prob.id}`) || prob.title_ar, statement_ar: b.get(`statement_${prob.id}`) || prob.statement_ar, note: b.get(`note_${prob.id}`) || '' };
    }
    saveGate1(p, { decisions, dialect: b.get('dialect') || 'egyptian' });
    if (action === 'approve') {
      const st = computeState(slug, engineContext());
      const r = approveGate1(p, st.steps.review.outputHash);
      if (!r.ok) return back('diagnosis', `Not approved: ${r.errors.join(' · ')}`, 'bad');
      kick(slug);
      return back('scope', 'Diagnosis approved. The rule engine is building the scope and 3-month plan.');
    }
    return back('diagnosis', 'Saved. Not approved yet.');
  }
  if (tab === 'scope') {
    const current = load(p.gate2, { optIn: [], remove: [], add: [], phase: {} });
    const phase = {};
    for (const [k, v] of b.entries()) if (k.startsWith('phase:') && v) phase[k.slice(6)] = v;
    const add = [...(current.add || [])].filter((_, i) => !b.has(`dropadd_${i}`));
    if (b.get('add_target')) add.push({ targetId: b.get('add_target'), problemIds: b.getAll('add_problems'), reason: (b.get('add_reason') || '').trim() });
    saveGate2Edits(p, { optIn: b.getAll('optin'), remove: b.getAll('remove'), add, phase });
    if (action === 'approve') {
      const ctx = engineContext();
      const before = computeState(slug, ctx);
      if (before.steps.plan.state === 'running') return back('scope', 'The plan is being recalculated. Approve again in a moment.', 'warn');
      if (before.steps.plan.state !== 'done') await runStep(slug, 'plan', { ctx });
      const st = computeState(slug, ctx);
      const r = approveGate2(p, st.steps.plan.outputHash, planFromDisk(p).ok);
      if (!r.ok) return back('scope', `Not approved: ${r.errors.join(' · ')}`, 'bad');
      kick(slug);
      return back('proposal', 'Scope approved. The proposal is being written; reviews and slide design follow.');
    }
    kick(slug);
    return back('scope', 'Saved. The plan is recalculated now.');
  }
  if (tab === 'proposal') {
    if (action === 'revise') {
      const notes = (b.get('revision') || '').trim();
      if (!notes) return back('proposal#changes', 'Write what should change first.', 'warn');
      requestRevision(p, notes);
      kick(slug);
      return back('proposal', 'Change request saved. The text is being rewritten, then reviewed and redesigned.', 'info');
    }
    if (action === 'ask') {
      const instruction = (b.get('instruction') || '').trim();
      if (!instruction) return back('proposal#change', 'Write what should change first.', 'warn');
      if (!existsSync(p.content)) return back('proposal', 'The proposal is not written yet.', 'warn');
      const started = sideJob(slug, 'Edit with AI', (log) => chatEdit(p, instruction, { log }));
      return back('proposal#change', started ? 'Working on it. The answer appears here, then the slides are redesigned.' : 'The AI is still working on the previous request.', started ? 'info' : 'warn');
    }
    if (action === 'save-slides') {
      const content = load(p.content, null);
      if (!content) return back('proposal', 'The proposal is not written yet.', 'warn');
      const next = contentFromForm(content, b);
      const problems = validateContent(next, contentSchema(content._meta?.problemIds || (content.problems?.items || []).map((x) => x.problemId)));
      if (problems.length) return back('proposal/edit', `Not saved: ${problems.join(' · ')}`, 'bad');
      const n = applyContent(p, next, { source: 'editor', summary: 'text edited in the slide editor' });
      kick(slug);
      return back('proposal', `Saved as version ${n}. Reviews and slide design run again now.`, 'info');
    }
    if (action.startsWith('restore:')) {
      try {
        const n = restoreVersion(p, Number(action.slice(8)));
        kick(slug);
        return back('proposal#versions', `Version ${action.slice(8)} restored (saved as version ${n}). Reviews and slide design run again now.`, 'info');
      } catch (e) {
        return back('proposal#versions', e.message, 'bad');
      }
    }
    if (action === 'save-content') {
      let parsed;
      try {
        parsed = JSON.parse(b.get('content') || '');
      } catch (e) {
        return back('proposal', `Not saved: the text is not valid JSON (${e.message}).`, 'bad');
      }
      // The edited text becomes the writing step's result, so reviews and design run on it (the AI does not rewrite it).
      applyContent(p, parsed, { source: 'json', summary: 'text edited by the team' });
      kick(slug);
      return back('proposal', 'Text saved. Reviews and slide design run again now.', 'info');
    }
    if (action === 'approve') {
      const st = computeState(slug, engineContext());
      const r = approveGate3(p, { renderHash: st.steps.render.outputHash, slug, gateState: st.steps.gate3.state, factsChecked: b.get('factsChecked') === 'yes' });
      return r.ok ? back('delivery', `Approved. Final files saved as version ${r.version}.`) : back('proposal', `Not approved: ${r.errors.join(' · ')}`, 'bad');
    }
  }
  if (tab === 'delivery' && action === 'sent') {
    const r = markSent(p, b.get('sentnote') || '');
    return r.ok ? back('delivery', 'Marked as sent.') : back('delivery', r.errors.join(' · '), 'bad');
  }
  return back('', 'That action is not available.', 'bad');
}

// Work that was ready (or interrupted and retried) continues on its own when the Control Center starts.
function resumeReadyWork() {
  emptyTrash();
  // An archive/delete that was waiting when the Control Center closed happens now (nothing is running yet).
  for (const slug of listClients()) if (pendingRemoval(slug)) finishPendingRemoval(slug);
  if (process.env.ALM_NO_RESUME) return;
  const ctx = engineContext();
  for (const slug of listClients()) {
    try {
      if (existsSync(clientPaths(slug).intake) && computeState(slug, ctx).ready.length) kick(slug);
    } catch (e) {
      console.error(`Could not check ${slug}: ${e.message}`);
    }
  }
}

function openBrowser() {
  if (process.env.ALM_NO_BROWSER) return;
  spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, 500, layout({ theme: req.theme, title: 'Error', body: `${flash(`Something went wrong: ${e.message}`, 'bad')}<pre class="output">${esc(e.stack)}</pre>` }));
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, 'app', 'server.js')) {
  const server = createServer();
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
    resumeReadyWork();
  });
}
