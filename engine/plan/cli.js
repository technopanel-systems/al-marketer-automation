#!/usr/bin/env node
// Plan preview: node engine/plan/cli.js preview <input.json> [out.html]
// input.json = { problems: [{id,type,severity}], readiness?: {}, gate2?: {} }
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../catalog/store.js';
import { loadCatalogAndRules } from '../rules/load.js';
import { buildPlan } from './build.js';
import { writeText } from '../util/data.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ar = (t) => `<span dir="rtl">${esc(t)}</span>`;

export function renderPlanPreview(result, input) {
  const { scope, schedule, kpis, checks } = result;
  const groups = scope.groups
    .map((g) => `<tr><td>${g.mandatory ? 'strategic' : `#${g.rank}`}</td><td><b>${esc(g.nameEn)}</b> · ${ar(g.nameAr)}${g.display === 'offerings' ? `<br><span class="m">${g.targets.map((t) => `${esc(t.nameEn)} · ${ar(t.nameAr)}`).join('<br>')}</span>` : ''}</td><td>${g.phase === 'P1' ? 'Month 1' : 'Month 2'}</td><td>${g.problemIds.join(', ') || '—'}</td><td>${g.score}</td></tr>`)
    .join('');
  const month = (m) => schedule.months[m].map((i) => `<li>${ar(i.nameAr)} <span class="m">${esc(i.nameEn)} · W${i.startWeek}${i.endWeek !== i.startWeek ? `–${i.endWeek}` : ''}</span></li>`).join('');
  const week = (w) => schedule.weeks[w].map((i) => `<li>${ar(i.nameAr)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Plan preview</title><style>
  body{font-family:"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;margin:0;background:#faf8f2;color:#070808}
  header{background:#070808;color:#FCF6D6;padding:20px 32px} main{padding:16px 32px;max-width:1200px}
  h2{border-bottom:3px solid #EF4423;padding-bottom:4px} table{border-collapse:collapse;width:100%;background:#fff}
  td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;vertical-align:top;font-size:14px} th{background:#f3efe0}
  .cols{display:grid;grid-template-columns:repeat(3,1fr);gap:12px} .cols4{grid-template-columns:repeat(4,1fr)}
  .card{background:#fff;border-radius:12px;padding:10px 14px} .m{color:#777;font-size:12px} .ok{color:#1d7a35} .bad{color:#b3261e}
  [dir=rtl]{unicode-bidi:isolate}</style></head><body>
  <header><h1>Plan preview — deterministic rule engine</h1><p>Problems in: ${esc(input.problems.map((p) => `${p.id} ${p.type} (sev ${p.severity})`).join(' · '))}</p></header><main>
  <h2>Scope</h2><table><tr><th>Rank</th><th>Service / offerings</th><th>Starts</th><th>Problems</th><th>Score</th></tr>${groups}</table>
  ${scope.excluded.length ? `<p><b>Needed but excluded:</b> ${scope.excluded.map((e) => `${esc(e.nameEn)} (${esc(e.reason)}, capability ${e.capability ?? 'blank'})`).join(' · ')}</p>` : ''}
  ${[...scope.flags, ...schedule.flags].length ? `<p><b>Flags:</b> ${[...scope.flags, ...schedule.flags].map((f) => esc(f.message)).join(' · ')}</p>` : ''}
  <h2>3-month deliverables map</h2><div class="cols">${[1, 2, 3].map((m) => `<div class="card"><h3>Month ${m}</h3><ul>${month(m)}</ul></div>`).join('')}</div>
  ${schedule.afterMonth3.length ? `<p><b>Continues after month 3:</b> ${schedule.afterMonth3.map((i) => esc(i.nameEn)).join(', ')}</p>` : ''}
  <h2>First 4 weeks</h2><div class="cols cols4">${[1, 2, 3, 4].map((w) => `<div class="card"><h3>Week ${w}</h3><ul>${week(w)}</ul></div>`).join('')}</div>
  <h2>KPIs</h2><table><tr><th>Scope</th><th>From week</th><th>KPIs</th></tr>${kpis.map((k) => `<tr><td>${esc(k.nameEn)} · ${ar(k.nameAr)}</td><td>W${k.startWeek}</td><td>${k.items.map((i) => ar(i.ar)).join('<br>')}</td></tr>`).join('')}</table>
  <h2>Automated scope checks</h2><ul>${checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔' : '✖'} ${c.id} — ${esc(c.message)}</li>`).join('')}</ul>
  </main></body></html>`;
}

async function main() {
  const [cmd, inputPath, outPath] = process.argv.slice(2);
  if (cmd !== 'preview' || !inputPath) {
    console.log('Usage: node engine/plan/cli.js preview <input.json> [out.html]');
    return 1;
  }
  const input = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const result = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  const out = resolve(outPath || join(ROOT, 'samples', 'out', 'plan-preview.html'));
  writeText(out, renderPlanPreview(result, input));
  console.log(`${result.ok ? 'All checks pass' : 'CHECKS FAILED'} · preview: ${out}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
