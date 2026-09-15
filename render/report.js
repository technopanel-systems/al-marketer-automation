// Internal strategy report → one self-contained HTML file and an A4 PDF (English, Al-Marketer brand). Never sent to clients.
// Code builds the data sections (scorecard, scope, checks, evidence, Claude usage); the AI analysis fills the rest.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIR = dirname(fileURLToPath(import.meta.url));
const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escMap[c]);
const ar = (v) => `<span dir="rtl" lang="ar" class="ar">${esc(v)}</span>`;
const auto = (v) => (/[؀-ۿ]/.test(String(v || '')) ? ar(v) : esc(v));
const evs = (list) => (list?.length ? ` <span class="ev">${list.map(esc).join(' · ')}</span>` : '');
const lab = (l) => (l ? ` <span class="lab lab-${esc(l)}">${esc(l)}</span>` : '');
const chip = (text, tone) => `<span class="chip chip-${esc(tone)}">${esc(text)}</span>`;
const list = (items, fn = (x) => auto(x)) => (items?.length ? `<ul>${items.map((x) => `<li>${fn(x)}</li>`).join('')}</ul>` : '<p class="muted">Nothing to add.</p>');
const section = (n, title, body, sub = '') => `<section class="sec"><h2><span class="n">${String(n).padStart(2, '0')}</span>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`;
const asset = (rel, type) => `data:${type};base64,${readFileSync(join(DIR, 'assets', rel)).toString('base64')}`;
const fontsCss = () => readFileSync(join(DIR, 'assets', 'fonts.css'), 'utf8').replace(/url\((fonts\/[^)]+)\)/g, (_, rel) => `url(${asset(rel, 'font/woff2')})`);
const TONE = { strong: 'good', weak: 'bad', unknown: 'na', high: 'bad', medium: 'mid', low: 'good' };
const usd = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function buildReportHtml(d) {
  const a = d.analysis;
  const name = d.intake.displayName || d.intake.name;
  const es = a.executiveSummary;
  const sf = a.strategicFrame;
  const cs = a.currentState;
  const swotBox = (title, items, tone) => `<div class="swot-box swot-${tone}"><h4>${esc(title)}</h4>${list(items, (x) => `${auto(x.text)}${lab(x.label)}${evs(x.evidence)}`)}</div>`;
  const grid = (x, y) => {
    const cells = ['high', 'mid', 'low'].map((yy) => ['low', 'mid', 'high'].map((xx) => `<div class="cell">${a.competitive.placements.filter((p) => p.x === xx && p.y === yy).map((p) => `<span class="brand${p.brand === d.intake.name || p.brand === name ? ' client' : ''}">${auto(p.brand)}</span>`).join('')}</div>`).join('')).join('');
    const unplaced = a.competitive.placements.filter((p) => p.x === 'unknown' || p.y === 'unknown');
    return `<div class="map"><div class="map-y">${esc(y)} ↑</div><div class="map-grid">${cells}</div><div class="map-x">${esc(x)} →</div></div>${unplaced.length ? `<p class="muted small">Not enough evidence to place: ${unplaced.map((p) => auto(p.brand)).join(', ')}</p>` : ''}`;
  };
  const scoreTables = (d.scorecard?.platforms || []).map((pl) => {
    const rows = pl.rows.filter((r) => r.metrics);
    if (!rows.length) return '';
    return `<h4>${esc(pl.name)}</h4><table><thead><tr><th>Brand</th><th class="num">Followers</th><th class="num">Posts / week</th><th>Last post</th><th class="num">Engagement</th><th>Activity</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.role === 'client' ? 'client' : ''}"><td>${auto(r.name)}${r.role === 'client' ? ' <span class="lab lab-client">client</span>' : ''}</td><td class="num">${esc(r.metrics.followers?.toLocaleString('en-US') ?? '—')}</td><td class="num">${esc(r.metrics.postsPerWeek ?? '—')}</td><td>${esc(r.metrics.lastPostDate || '—')}</td><td class="num">${r.metrics.engagementRate ?? '—'}${r.metrics.engagementRate !== null && r.metrics.engagementRate !== undefined ? '%' : ''}</td><td>${esc(r.metrics.status)}</td></tr>`).join('')}</tbody></table>`;
  }).join('');

  const body = [
    section(1, 'Executive summary', `<p class="lead">${auto(es.engagementIsAbout)}</p>
      <div class="insights">${es.topInsights.map((i, n) => `<div class="insight"><div class="insight-n">${n + 1}</div><div><h3>${auto(i.title)}</h3><p><b>What:</b> ${auto(i.what)}</p><p><b>Why:</b> ${auto(i.why)}</p><p><b>So what:</b> ${auto(i.soWhat)}${evs(i.evidence)}</p></div></div>`).join('')}</div>
      <div class="two"><div class="callout good"><h4>Biggest opportunity</h4><p>${auto(es.biggestOpportunity)}</p></div><div class="callout bad"><h4>Biggest risk</h4><p>${auto(es.biggestRisk)}</p></div></div>
      <h4>Confirm at the next meeting</h4>${list(es.confirmAtNextMeeting)}`),
    section(2, 'Strategic frame', `<dl class="kv">${[['The client in one sentence', sf.clientInOneSentence], ['Category', sf.category], ['Ideal customer', sf.idealCustomer], ['Stated ask vs real problem', sf.statedVsRealProblem], ['How they make money', sf.howTheyMakeMoney], ['Problem size × frequency', `${sf.problemSizeFrequency} — ${sf.implication}`]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${auto(v)}</dd>`).join('')}</dl>`),
    section(3, 'Current state', `<table><thead><tr><th>Area</th><th>Rating</th><th>Note</th></tr></thead><tbody>${cs.areas.map((x) => `<tr><td>${esc(x.area)}</td><td>${chip(x.rating, TONE[x.rating])}</td><td>${auto(x.note)}${evs(x.evidence)}</td></tr>`).join('')}</tbody></table>
      <p><b>Shape:</b> ${auto(cs.shape)}</p><div class="two"><div><h4>Already done well</h4>${list(cs.alreadyDoneWell)}</div><div><h4>Stuck</h4>${list(cs.stuckItems)}</div></div>`),
    section(4, 'Customer insight', a.customerInsight.themes.length ? a.customerInsight.themes.map((t) => `<div class="theme"><div class="theme-head">${chip(t.kind, 'na')} ${chip(`${t.confidence} confidence`, TONE[t.confidence] === 'bad' ? 'good' : TONE[t.confidence] === 'good' ? 'mid' : 'mid')}</div><p>${auto(t.text)}</p>${t.quotes.map((q) => `<blockquote>${ar(q.arabic)}<span class="gloss">${esc(q.gloss)}${q.evidenceId ? ` · ${esc(q.evidenceId)}` : ''}</span></blockquote>`).join('')}</div>`).join('') : '<p class="muted">Data not available.</p>'),
    section(5, 'Competitive landscape', `${scoreTables || '<p class="muted">No social numbers were captured.</p>'}
      <h4>Compared brands</h4>${list(d.competitors, (c) => `${auto(c.name)} <span class="muted">(${esc(c.status)}${c.website ? `, ${esc(c.website.replace(/^https?:\/\//, ''))}` : ''})</span>`)}
      <div class="two"><div><h4>Claims everyone makes (the minimum, not a difference)</h4>${list(a.competitive.sharedClaims)}</div><div><h4>White space</h4>${list(a.competitive.whiteSpace, (x) => `${auto(x.text)}${lab(x.label)}`)}</div></div>
      <h4>Where competitors genuinely win</h4>${list(a.competitive.whereCompetitorsWin, (x) => `<b>${auto(x.competitor)}:</b> ${auto(x.text)}${evs(x.evidence)}`)}
      <h4>Positioning map</h4>${grid(a.competitive.positioningAxes.x, a.competitive.positioningAxes.y)}`),
    section(6, 'SWOT and what it means', `<div class="swot">${swotBox('Strengths', a.swot.strengths, 'good')}${swotBox('Weaknesses', a.swot.weaknesses, 'bad')}${swotBox('Opportunities', a.swot.opportunities, 'blue')}${swotBox('Threats', a.swot.threats, 'mid')}</div>
      <div class="two"><div><h4>Push (strength × opportunity)</h4>${list(a.swot.push)}<h4>Defend (strength × threat)</h4>${list(a.swot.defend)}</div><div><h4>Fix first (weakness × opportunity)</h4>${list(a.swot.fixFirst)}<h4>Exposed (weakness × threat)</h4>${list(a.swot.exposed)}</div></div>`),
    section(7, 'Offer and purchase journey', `<table><thead><tr><th>Value lever</th><th>Score</th><th>Why</th></tr></thead><tbody>${a.offerFunnel.levers.map((l) => `<tr><td>${esc(l.lever)}</td><td>${l.score === null ? chip('unknown', 'na') : `<span class="bar"><span style="width:${l.score * 10}%"></span></span> ${l.score}/10`}</td><td>${auto(l.reason)}</td></tr>`).join('')}</tbody></table>
      <p><b>Journey:</b> ${auto(a.offerFunnel.journey)}</p><p><b>Binding constraint:</b> ${auto(a.offerFunnel.bindingConstraint)}</p><h4>Missing parts of the offer</h4>${list(a.offerFunnel.missingOfferParts)}`),
    section(8, 'Measurement and readiness', `<div class="two"><div><h4>Tracked</h4>${list(a.measurement.tracked)}</div><div><h4>Unknown</h4>${list(a.measurement.unknown)}</div></div><p><b>How much we could verify:</b> ${auto(a.measurement.verifiedShare)}</p>
      <h4>Client readiness</h4><table><tbody>${Object.entries(d.readiness || {}).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td>${chip(v?.value ?? v ?? 'unknown', (v?.value ?? v) === 'yes' ? 'good' : (v?.value ?? v) === 'no' ? 'bad' : 'na')}</td></tr>`).join('') || '<tr><td class="muted">Unknown</td></tr>'}</tbody></table>`),
    section(9, 'Risks', a.risks.length ? `<table><thead><tr><th>Risk</th><th>Kind</th><th>Likelihood</th><th>Damage</th><th>Mitigation (team to decide)</th></tr></thead><tbody>${a.risks.map((r) => `<tr><td>${auto(r.risk)}</td><td>${esc(r.kind)}</td><td>${chip(r.likelihood, TONE[r.likelihood])}</td><td>${chip(r.damage, TONE[r.damage])}</td><td>${auto(r.mitigation)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing to add.</p>'),
    section(10, 'Outside the approved scope', list(a.outsideScope, (x) => `${auto(x.text)}${evs(x.evidence)}`), 'Observations only. Nothing here is offered; services come from the catalog through the rule engine.'),
    section(11, 'Next meeting', a.nextMeeting.length ? `<ol class="questions">${a.nextMeeting.map((q) => `<li><div>${chip(q.impact, TONE[q.impact])} <b>${auto(q.question)}</b></div><div class="muted small">Why: ${auto(q.why)} · Unblocks: ${auto(q.unblocks)}</div></li>`).join('')}</ol>` : '<p class="muted">Nothing to add.</p>'),
    section(12, 'Appendix', `<h4>Approved problems</h4><table><thead><tr><th>ID</th><th>Problem</th><th>Type</th><th>Severity</th><th>Reviewer</th></tr></thead><tbody>${d.problems.map((x) => `<tr><td>${esc(x.id)}</td><td>${ar(x.title_ar)}</td><td>${esc(x.problemType)}</td><td class="num">${esc(x.severity)}</td><td>${esc(x.review?.verdict || 'added by the team')}</td></tr>`).join('')}</tbody></table>
      ${d.rejected.length ? `<h4>Rejected or left out</h4><table><tbody>${d.rejected.map((x) => `<tr><td>${esc(x.id)}</td><td>${ar(x.title_ar)}</td><td class="small">${auto(x.review?.reason || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      <h4>Approved scope</h4><table><thead><tr><th>Service</th><th>Starts</th><th>For problems</th></tr></thead><tbody>${d.plan.scope.groups.map((g) => `<tr><td>${esc(g.nameEn)} ${ar(g.nameAr)}</td><td>${g.mandatory ? 'Foundation' : g.phase === 'P1' ? 'Month 1' : 'Month 2'}</td><td>${esc(g.problemIds.join(', ') || 'every contract')}</td></tr>`).join('')}</tbody></table>
      <h4>KPIs</h4>${list(d.plan.kpis, (k) => `<b>${esc(k.nameEn)}</b> (from week ${esc(k.startWeek)}): ${k.items.map((i) => esc(i.en)).join(' · ')}`)}
      <h4>Evidence</h4><table class="small"><thead><tr><th>ID</th><th>Kind</th><th>Source</th><th>Saved</th></tr></thead><tbody>${d.sources.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.kind)}${s.platform ? ` · ${esc(s.platform)}` : ''}</td><td>${auto(s.title || s.url)}</td><td>${esc(fmtDate(s.fetchedAt))}</td></tr>`).join('')}</tbody></table>
      ${d.removedEvidence?.length ? `<p class="muted small">The analysis cited ${d.removedEvidence.length} evidence id(s) that do not exist; they were removed: ${d.removedEvidence.map(esc).join(', ')}.</p>` : ''}
      <h4>Claude usage for this proposal</h4><table><thead><tr><th>Step</th><th class="num">Runs</th><th class="num">Usage</th></tr></thead><tbody>${d.usage.steps.map((u) => `<tr><td>${esc(u.label)}</td><td class="num">${u.runs}</td><td class="num">${usd(u.costUsd)}</td></tr>`).join('')}<tr class="total"><td>Total</td><td class="num">${d.usage.total.runs}</td><td class="num">${usd(d.usage.total.costUsd)}</td></tr></tbody></table>
      <p class="muted small">Measured from each Claude run's own report. On the subscription this is the equivalent API value, not a bill.</p>`),
  ].join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — Internal strategy report</title>
<style>${fontsCss()}</style>
<style>
@page { size: A4; margin: 16mm 14mm 18mm; }
:root { --ink:#070808; --cream:#FCF6D4; --brand:#EF4625; --muted:#5E5C57; --line:#E7E2D6; --paper:#FFFDF7; --good:#1E7544; --bad:#B9362A; --mid:#8F5F00; --blue:#2458C9; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.55 'Manrope', 'Noto Sans Arabic', sans-serif; color: var(--ink); background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ar { font-family: 'Noto Sans Arabic', sans-serif; unicode-bidi: isolate; }
.page { max-width: 880px; margin: 0 auto; padding: 24px; }
header.top { background: var(--ink); color: var(--cream); border-radius: 14px; padding: 26px 28px; position: relative; overflow: hidden; margin-bottom: 18px; }
header.top::after { content: ''; position: absolute; right: -80px; top: -120px; width: 320px; height: 320px; border-radius: 50%; background: radial-gradient(circle, rgba(239,70,37,.45), transparent 70%); }
header.top img { height: 26px; }
header.top h1 { font-size: 24pt; margin: 14px 0 4px; line-height: 1.15; }
header.top .meta { color: #B4AF9C; font-size: 10pt; }
.badge { display: inline-block; margin-top: 10px; padding: 3px 10px; border-radius: 99px; background: var(--brand); color: var(--ink); font-weight: 800; font-size: 9pt; }
.sec { break-inside: auto; margin: 0 0 16px; padding-top: 6px; border-top: 2px solid var(--ink); }
.sec h2 { display: flex; align-items: baseline; gap: 10px; font-size: 15pt; margin: 8px 0 8px; break-after: avoid; }
.sec h2 .n { color: var(--brand); font-size: 11pt; font-weight: 800; }
h3 { font-size: 11.5pt; margin: 0 0 4px; }
h4 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 12px 0 4px; break-after: avoid; }
p { margin: 0 0 6px; }
.sub, .muted { color: var(--muted); }
.small { font-size: 9pt; }
.lead { font-size: 12.5pt; font-weight: 600; }
ul, ol { margin: 0 0 6px; padding-left: 18px; }
li { margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 9.5pt; break-inside: auto; }
th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); border-bottom: 1.5px solid var(--ink); padding: 5px 6px; }
td { border-bottom: 1px solid var(--line); padding: 5px 6px; vertical-align: top; }
tr { break-inside: avoid; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.client td { background: #FDEBE4; }
tr.total td { font-weight: 800; border-top: 1.5px solid var(--ink); }
.ev { font-size: 8pt; color: var(--muted); font-family: ui-monospace, Consolas, monospace; }
.lab { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; padding: 0 5px; border-radius: 3px; border: 1px solid var(--line); color: var(--muted); }
.lab-inference { color: var(--mid); border-color: #EBD5A6; }
.lab-client { color: var(--brand); border-color: #F6C4B4; }
.chip { display: inline-block; padding: 0 7px; border-radius: 99px; font-size: 8.5pt; font-weight: 700; border: 1px solid var(--line); white-space: nowrap; }
.chip-good { color: var(--good); background: #E6F2EA; border-color: #BFDDC9; }
.chip-bad { color: var(--bad); background: #FBEAE7; border-color: #EFC1BA; }
.chip-mid { color: var(--mid); background: #FBF1DC; border-color: #EBD5A6; }
.chip-na { color: var(--muted); background: #F3F0E8; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.insights { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
.insight { display: grid; grid-template-columns: 30px 1fr; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; break-inside: avoid; }
.insight-n { width: 26px; height: 26px; border-radius: 50%; background: var(--brand); color: var(--ink); font-weight: 800; display: grid; place-items: center; }
.callout { padding: 10px 12px; border-radius: 10px; break-inside: avoid; }
.callout.good { background: #E6F2EA; } .callout.bad { background: #FBEAE7; }
.callout h4 { margin-top: 0; }
.kv { display: grid; grid-template-columns: 190px 1fr; gap: 6px 14px; margin: 0; }
.kv dt { color: var(--muted); font-weight: 700; font-size: 9.5pt; } .kv dd { margin: 0; }
.theme { padding: 8px 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
blockquote { margin: 4px 0; padding: 4px 10px; border-left: 3px solid var(--brand); background: #FBF8EE; }
blockquote .ar { display: block; text-align: right; font-size: 11pt; }
.gloss { display: block; font-size: 9pt; color: var(--muted); }
.swot { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.swot-box { border-radius: 10px; padding: 8px 12px; break-inside: avoid; }
.swot-good { background: #E6F2EA; } .swot-bad { background: #FBEAE7; } .swot-blue { background: #E8EFFC; } .swot-mid { background: #FBF1DC; }
.swot-box h4 { margin-top: 2px; color: var(--ink); }
.bar { display: inline-block; width: 70px; height: 7px; border-radius: 4px; background: #F1ECDD; vertical-align: middle; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--brand); }
.map { display: grid; grid-template-columns: 28px 1fr; grid-template-rows: 1fr auto; gap: 4px; max-width: 520px; }
.map-y { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 8.5pt; color: var(--muted); text-align: center; }
.map-grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 64px); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.cell { border: 1px dashed var(--line); padding: 4px; display: flex; flex-wrap: wrap; gap: 3px; align-content: flex-start; }
.brand { font-size: 8.5pt; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: #F3F0E8; }
.brand.client { background: var(--brand); color: var(--ink); }
.map-x { grid-column: 2; font-size: 8.5pt; color: var(--muted); text-align: center; }
.questions li { margin-bottom: 7px; break-inside: avoid; }
footer { margin-top: 16px; font-size: 8.5pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
@media screen { body { background: #F6F3E8; } .page { background: #fff; margin: 24px auto; border-radius: 16px; box-shadow: 0 10px 30px rgba(7,8,8,.08); } }
@media print { .page { padding: 0; max-width: none; } }
</style></head><body><div class="page">
<header class="top"><img src="${asset('brand/logo-en-white.png', 'image/png')}" alt="AL-MARKETER"><h1>${auto(name)} — internal strategy report</h1>
<div class="meta">${esc(d.intake.website ? d.intake.website.replace(/^https?:\/\//, '') : 'no website')} · ${esc(d.intake.market || '')} · generated ${esc(fmtDate(d.generatedAt))}${d.gate3?.version ? ` · proposal version ${esc(d.gate3.version)} approved` : ''}${d.sent ? ' · sent' : ''}</div>
<span class="badge">INTERNAL — NOT FOR THE CLIENT</span></header>
${body}
<footer>Built by the Al-Marketer proposal system from saved evidence. Facts cite evidence ids; items labelled "inference" are reasoning, not facts. Services, timing and KPIs come from the approved scope.</footer>
</div></body></html>`;
}

export async function renderReport(html, { htmlPath, pdfPath }) {
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8px sans-serif;color:#908c80;padding:0 14mm;display:flex;justify-content:space-between"><span>Al-Marketer · internal strategy report</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  } finally {
    await browser.close();
  }
}
