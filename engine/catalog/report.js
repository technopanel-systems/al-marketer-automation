// Builds catalog/reports/catalog-report.html: the catalog, validation results, Blueprint differences,
// and the draft rule tables waiting for one-time approval.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexCatalog, sortRows } from './model.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ar = (text) => `<span dir="rtl" lang="ar">${esc(text)}</span>`;
const yesNo = (b) => (b ? 'yes' : 'no');

function readJson(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

export function renderCatalogReport({ root, catalog, meta, validation, mismatches, lastPull }) {
  const idx = indexCatalog(catalog);
  const problemTypes = readJson(root, 'rules/problem-types.json');
  const timing = readJson(root, 'rules/timing.json');
  const kpis = readJson(root, 'rules/kpis.json');
  const impact = readJson(root, 'rules/impact-and-dependencies.json');
  const nameOf = (id) => {
    const hit = idx.byId.get(id);
    return hit ? `${esc(hit.row.nameEn)} · ${ar(hit.row.nameAr)}` : esc(id);
  };

  const active = (rows) => sortRows(rows.filter((r) => r.active));
  const counts = { services: active(catalog.services).length, offerings: active(catalog.offerings).length, deliverables: active(catalog.deliverables).length };
  const capLabel = (c, min) => (c === null ? '<span class="pill warn">blank → excluded</span>' : c < min ? `<span class="pill warn">${c} → excluded</span>` : `<span class="pill ok">${c}</span>`);
  const minCap = impact.settings.capabilityMinimumToInclude;

  const deliverableRows = (parentId) =>
    active(idx.deliverablesByParent.get(parentId) || [])
      .map(
        (d) => `<tr><td class="mono">${esc(d.id)}</td><td>${esc(d.nameEn)}</td><td>${ar(d.nameAr)}</td><td>${d.kind === 'conditional' ? '<span class="pill warn">conditional</span>' : 'fixed'}</td><td>${esc(d.stage)}</td><td>${yesNo(d.recurring)}</td><td>${yesNo(d.visual)}</td></tr>`,
      )
      .join('');

  const tree = active(catalog.services)
    .map((s) => {
      const offs = active(idx.offeringsByService.get(s.id) || []);
      const body = offs.length
        ? offs.map((o) => `<tr class="sub"><td colspan="7">Offering: <b>${esc(o.nameEn)}</b> · ${ar(o.nameAr)} <span class="mono">${esc(o.id)}</span></td></tr>${deliverableRows(o.id)}`).join('')
        : deliverableRows(s.id);
      return `<section class="card">
        <h3>${esc(s.nameEn)} · ${ar(s.nameAr)} ${s.strategic ? '<span class="pill brand">strategic — every contract</span>' : ''}</h3>
        <p class="muted"><span class="mono">${esc(s.id)}</span> · model ${offs.length ? 'A (service → offerings → deliverables)' : 'B (service → deliverables)'} · capability ${capLabel(s.capability, minCap)}${s.notionName ? ` · Notion name: ${ar(s.notionName)}` : ''}</p>
        ${s.descriptionAr ? `<p>${ar(s.descriptionAr)}</p>` : ''}
        <table><thead><tr><th>ID</th><th>Deliverable</th><th>الاسم</th><th>Kind</th><th>Stage</th><th>Repeats monthly</th><th>Visual</th></tr></thead><tbody>${body}</tbody></table>
      </section>`;
    })
    .join('');

  const list = (items, cls) => (items.length ? `<ul class="${cls}">${items.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="ok-text">None.</p>');
  const mismatchList = mismatches.length
    ? `<table><thead><tr><th>Type</th><th>Where</th><th>What</th></tr></thead><tbody>${mismatches
        .map((m) => `<tr><td>${m.level === 'fix' ? '<span class="pill warn">fix in Notion</span>' : '<span class="pill">info</span>'}</td><td class="mono">${esc(m.where)}</td><td>${esc(m.message)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="ok-text">No differences found.</p>';

  const problemTable = `<table><thead><tr><th>Type</th><th>Meaning</th><th>النوع</th><th>Justifies</th><th>Evidence needed</th></tr></thead><tbody>${problemTypes.types
    .map(
      (t) => `<tr><td class="mono">${esc(t.id)}</td><td><b>${esc(t.labelEn)}</b><br><span class="muted">${esc(t.definition)}</span></td><td>${ar(t.labelAr)}</td><td>${t.justifies.length ? t.justifies.map(nameOf).join('<br>') : '<span class="muted">nothing (shown to you)</span>'}</td><td>${esc(problemTypes.evidenceKinds[t.evidence] || t.evidence)}</td></tr>`,
    )
    .join('')}</tbody></table>`;

  const timingTable = `<table><thead><tr><th>Stage</th><th>Month-1 start (P1)</th><th>Month-2 start (P2)</th></tr></thead><tbody>${timing.stageDefaults
    .map((r) => `<tr><td>${esc(r.stage)}${r.kind ? ` (${esc(r.kind)})` : ''}</td><td>${esc(r.P1)}</td><td>${esc(r.P2)}</td></tr>`)
    .join('')}</tbody></table>
    <h4>Special cases</h4><table><tbody>${timing.overrides.map((o) => `<tr><td>${nameOf(o.target)}</td><td>${esc(o.rule)}</td></tr>`).join('')}</tbody></table>
    <h4>Hard rules</h4>${list(timing.hardRules, '')}`;

  const kpiTable = `<table><thead><tr><th>Scope</th><th>KPI</th><th>المؤشر</th><th>Needs</th></tr></thead><tbody>${kpis.kpis
    .flatMap((k) => k.items.map((it, i) => `<tr><td>${i === 0 ? nameOf(k.target) : ''}</td><td>${esc(it.en)}</td><td>${ar(it.ar)}</td><td class="muted">${esc(it.needs)}</td></tr>`))
    .join('')}</tbody></table>`;

  const pullBlock = lastPull
    ? `<p><b>Last catalog update:</b> ${esc(lastPull.summary)}</p>${lastPull.problems?.length ? `<h4>Needs attention</h4>${list(lastPull.problems, 'warn-list')}` : ''}`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Al-Marketer — Catalog &amp; Rules Report</title>
<style>
  :root { --brand:#EF4423; --ink:#070808; --cream:#FCF6D6; --grey:#909194; }
  body { margin:0; font-family: "Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif; color:var(--ink); background:#faf8f2; }
  header { background:var(--ink); color:var(--cream); padding:28px 40px; }
  header h1 { margin:0 0 6px; font-size:26px; } header p { margin:0; color:#d9d3b5; }
  main { max-width:1180px; margin:0 auto; padding:24px 40px 80px; }
  h2 { border-bottom:3px solid var(--brand); padding-bottom:6px; margin-top:40px; }
  .stats { display:flex; gap:16px; flex-wrap:wrap; } .stat { background:#fff; border-radius:14px; padding:14px 20px; min-width:150px; box-shadow:0 1px 3px #0001; }
  .stat b { display:block; font-size:30px; color:var(--brand); }
  .card { background:#fff; border-radius:14px; padding:16px 20px; margin:14px 0; box-shadow:0 1px 3px #0001; }
  .card h3 { margin:0 0 4px; }
  table { width:100%; border-collapse:collapse; margin:8px 0; font-size:14px; }
  th, td { text-align:left; padding:7px 8px; border-bottom:1px solid #eee; vertical-align:top; }
  th { background:#f3efe0; font-weight:600; }
  tr.sub td { background:#fbf7e6; }
  [dir=rtl] { font-family:"Noto Sans Arabic","Segoe UI",Tahoma,sans-serif; unicode-bidi:isolate; }
  .mono { font-family:Consolas, monospace; font-size:12px; color:#555; }
  .muted { color:#6b6b6b; font-size:13px; }
  .pill { display:inline-block; padding:1px 8px; border-radius:99px; background:#eee; font-size:12px; }
  .pill.ok { background:#e3f4e6; } .pill.warn { background:#fde2d9; color:#9b2a0e; } .pill.brand { background:var(--brand); color:#fff; }
  .ok-text { color:#1d7a35; } .warn-list li, .err li { color:#9b2a0e; }
  .approve { background:var(--cream); border-left:6px solid var(--brand); padding:12px 16px; border-radius:8px; }
</style></head>
<body>
<header><h1>Al-Marketer — Service Catalog &amp; Rules</h1>
<p>The engine reads only this local catalog. Notion is the editing surface. Source: ${esc(meta?.source ?? 'n/a')} · updated ${esc(meta?.updatedAt ?? 'n/a')} · content hash ${esc((meta?.contentHash ?? '').slice(0, 12))}</p></header>
<main>
  <div class="stats">
    <div class="stat"><b>${counts.services}</b>services</div>
    <div class="stat"><b>${counts.offerings}</b>offerings</div>
    <div class="stat"><b>${counts.deliverables}</b>deliverables</div>
    <div class="stat"><b>${validation.errors.length}</b>errors</div>
    <div class="stat"><b>${mismatches.filter((m) => m.level === 'fix').length}</b>Blueprint differences to fix</div>
  </div>
  ${pullBlock}

  <h2>1. Validation</h2>
  ${validation.errors.length ? `<ul class="err">${validation.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="ok-text">The catalog passes every check.</p>'}
  ${validation.warnings.length ? `<h4>Warnings</h4>${list(validation.warnings, 'warn-list')}` : ''}

  <h2>2. Differences between the catalog and the Blueprint</h2>
  ${mismatchList}

  <h2>3. The catalog</h2>
  <p class="muted">Services with capability below ${minCap} or blank are left out of proposals unless you opt in at Gate 2. Arabic names for deliverables follow the Blueprint wording with the service added for clarity in the 3-month map — please review.</p>
  ${tree}

  <h2>4. Rule tables — for your one-time approval</h2>
  <div class="approve">These are drafts. After you approve them, plain code uses them to pick services, deliverables and weeks. The AI never makes these decisions.</div>
  <h3>4a. Problem types → what each one justifies</h3>
  ${problemTable}
  <h3>4b. Timing</h3>
  ${timingTable}
  <h3>4c. KPIs by scope</h3>
  <p class="muted">${esc(kpis.rule)}</p>
  ${kpiTable}
  <h3>4d. Impact categories and dependencies (from the Blueprint)</h3>
  <p>${impact.impactCategories.map((c) => `${esc(c.en)} · ${ar(c.ar)}`).join(' &nbsp;|&nbsp; ')}</p>
  <table><thead><tr><th>Before</th><th>After</th><th>Source</th></tr></thead><tbody>${impact.dependencies
    .map((d) => `<tr><td>${d.before.startsWith('del.') ? nameOf(d.before) : esc(d.before)}</td><td>${d.after.startsWith('del.') ? nameOf(d.after) : esc(d.after)}</td><td class="muted">${esc(d.source)}</td></tr>`)
    .join('')}</tbody></table>
  <h3>4e. Settings</h3>
  <table><tbody>${Object.entries(impact.settings).map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
</main></body></html>
`;
}
