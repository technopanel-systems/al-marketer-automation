// Builds the proposal deck HTML (one self-contained file used for both the PDF and the web version).
// Input: a DeckModel (see render/README.md). Layout decisions are deterministic: section order is fixed
// (Blueprint p.62) and long sections are split into extra slides instead of shrinking text (p.65).
import { readFileSync, existsSync } from 'node:fs';
import qrcode from 'qrcode-generator';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(RENDER_DIR, '..');

export const SECTION_ORDER = ['cover', 'business', 'brand', 'problems', 'impact', 'solutions', 'expected', 'map', 'weeks', 'kpis', 'tracking'];
export const EYEBROWS = {
  cover: 'عرض فني',
  business: 'ما فهمناه عن البيزنس والعروض',
  brand: 'ما فهمناه عن البراند والسوق',
  problems: 'المشاكل الأساسية',
  impact: 'أثر المشاكل',
  solutions: 'الحلول المقترحة',
  expected: 'الأثر المتوقع للحلول',
  map: 'خارطة تسليمات 3 شهور',
  weeks: 'خطة أول 4 أسابيع',
  kpis: 'مؤشرات القياس',
  tracking: 'المتابعة الحية والتحسين',
  summary: 'الخلاصة',
  digital: 'الحضور الرقمي',
  audit: 'فحص الموقع',
  next: 'الخطوات الجاية',
  cta: 'تواصل معنا',
};
export const IMPACT_ICONS = {
  awareness: 'eye', trust: 'shield-check', demand: 'trending-up', conversion: 'target', retention: 'repeat',
  operations: 'settings', revenue: 'circle-dollar-sign', scalability: 'rocket', brand_value: 'gem', customer_experience: 'heart-handshake',
};

// ---------- helpers ----------
const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escMap[c]);
const LATIN_RUN = /[A-Za-z0-9][A-Za-z0-9 .,&%+/\-–:×'’]*[A-Za-z0-9%]|[A-Za-z0-9]/g;

// Escapes text and isolates Latin words / numbers so they render correctly inside Arabic.
export function t(text) {
  const s = String(text ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(LATIN_RUN)) {
    out += esc(s.slice(last, m.index)) + `<bdi class="lat">${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

const iconCache = new Map();
export function icon(name) {
  if (!name) return '';
  if (!iconCache.has(name)) {
    const file = join(ROOT, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    const fallback = join(ROOT, 'node_modules', 'lucide-static', 'icons', 'sparkles.svg');
    const svg = readFileSync(existsSync(file) ? file : fallback, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s(width|height)="24"/g, '')
      .trim();
    iconCache.set(name, svg);
  }
  return `<span class="icon">${iconCache.get(name)}</span>`;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const dataUriCache = new Map();
function dataUri(file) {
  if (!dataUriCache.has(file)) dataUriCache.set(file, `data:${MIME[extname(file)]};base64,${readFileSync(file).toString('base64')}`);
  return dataUriCache.get(file);
}
const asset = (rel) => dataUri(join(RENDER_DIR, 'assets', rel));

function fontsCss() {
  return readFileSync(join(RENDER_DIR, 'assets', 'fonts.css'), 'utf8').replace(/url\((fonts\/[^)]+)\)/g, (_, rel) => `url(${asset(rel)})`);
}

const chunk = (list, sizes) => {
  // sizes(n) → array of chunk sizes that add up to n
  const out = [];
  let i = 0;
  for (const size of sizes(list.length)) {
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out.filter((c) => c.length);
};
// Fewest slides possible, spread evenly (larger chunks first): max 3 → 4 = 2+2, 5 = 3+2, 7 = 3+2+2; max 4 → 6 = 3+3
export const cardChunks = (maxPerSlide = 3) => (n) => {
  if (n <= maxPerSlide) return [n];
  const slides = Math.ceil(n / maxPerSlide);
  const base = Math.floor(n / slides);
  return Array.from({ length: slides }, (_, i) => base + (i < n % slides ? 1 : 0));
};

// ---------- slide shells ----------
function shell({ section, tone = 'light', glows = [], body, extraClass = '' }) {
  return {
    section,
    tone,
    html: (num) => `<section class="slide ${tone === 'dark' ? 'dark' : ''} ${extraClass}" data-section="${section}">
  ${glows.map((g) => `<div class="glow ${g}"></div>`).join('')}
  ${section !== 'cover' ? `<div class="eyebrow"><span>${t(EYEBROWS[section])}</span></div>` : ''}
  ${body}
  ${section !== 'cover' ? `<div class="footer"><span class="num">${num}</span><span class="flogo" role="img" aria-label="AL-MARKETER"></span></div>` : ''}
</section>`,
  };
}

const head = (title, intro) => `<div class="head ${intro ? '' : 'single'}"><h2 class="title">${title}</h2>${intro ? `<p class="intro">${t(intro)}</p>` : ''}</div>`;
// "accent" words: the model may mark part of a title with [[...]] to color it
const titleHtml = (s) => {
  const str = String(s ?? '');
  const parts = str.split(/\[\[|\]\]/);
  return parts.map((p, i) => (i % 2 ? `<span class="accent">${t(p)}</span>` : t(p))).join('');
};

// ---------- sections ----------
function coverSlide(m, compact = false) {
  const c = m.cover;
  const isLatin = /^[\x20-\x7E]+$/.test(c.clientDisplay || '');
  return shell({
    section: 'cover',
    tone: 'dark',
    extraClass: compact ? 'cover compact' : 'cover',
    body: `<div class="art" style="background-image:url(${asset('brand/cover-art.jpg')})"></div>
  <div class="brands">
    <img class="logo" src="${asset('brand/logo-ar-white.png')}" alt="الماركتير">
    ${c.logo ? `<span class="brands-x" aria-hidden="true">×</span><span class="client-logo ${c.logo.tone === 'light' ? 'on-dark' : 'on-light'}"><img src="${c.logo.dataUri}" alt="${esc(c.clientDisplay)}"></span>` : ''}
  </div>
  <div class="content">
    <span class="pill"><span>${t(c.eyebrow || EYEBROWS.cover)}</span></span>
    <h1 class="client ${isLatin ? '' : 'ar'}">${t(c.clientDisplay)}</h1>
    ${c.accent ? `<p class="accent-line">${t(c.accent)}</p>` : ''}
    ${c.subtitle ? `<p class="subtitle">${t(c.subtitle)}</p>` : ''}
    ${c.lead ? `<p class="lead">${t(c.lead)}</p>` : ''}
  </div>
  <div class="to"><div class="small">عرض فني مقدم إلى</div><div class="name">${t(c.presentedTo)}</div></div>`,
  });
}

function businessSlides(m, variant = 'one') {
  const b = m.business;
  const cols = Math.min(Math.max(b.cards.length, 1), 5);
  if (variant === 'split' && b.cards.length > 3) {
    const cardsHtml = (list) => `<div class="grid cols-${list.length}">${list.map((c) => `<div class="card">${icon(c.icon)}<h3 class="card-title">${t(c.title)}</h3><p class="card-text">${t(c.text)}</p></div>`).join('')}</div>`;
    return [
      shell({ section: 'business', body: `${head(titleHtml(b.title), b.intro)}${b.cardsLabel ? `<div class="label" style="margin:-14px 0 16px">${t(b.cardsLabel)}</div>` : ''}${cardsHtml(b.cards.slice(0, 3))}` }),
      shell({ section: 'business', body: `${head(titleHtml(b.title), null)}${cardsHtml(b.cards.slice(3))}${b.highlight ? `<div class="bar"><span class="label">${t(b.highlight.label)}</span><span class="text">${t(b.highlight.text)}</span></div>` : ''}` }),
    ];
  }
  return [
    shell({
      section: 'business',
      body: `${head(titleHtml(b.title), b.intro)}
  ${b.cardsLabel ? `<div class="label" style="margin:-14px 0 16px">${t(b.cardsLabel)}</div>` : ''}
  <div class="grid cols-${cols}">${b.cards.map((c) => `<div class="card">${icon(c.icon)}<h3 class="card-title">${t(c.title)}</h3><p class="card-text">${t(c.text)}</p></div>`).join('')}</div>
  ${b.highlight ? `<div class="bar"><span class="label">${t(b.highlight.label)}</span><span class="text">${t(b.highlight.text)}</span></div>` : ''}`,
    }),
  ];
}

function brandSlides(m, variant = 'one') {
  const b = m.brand;
  const stats = b.stats || [];
  const statsHtml = stats.length ? `<div class="stats" style="grid-template-columns:repeat(${stats.length},1fr);margin-top:auto">${stats.map((s) => `<div class="stat"><div class="value">${t(s.value)}</div><div class="text">${t(s.text)}</div></div>`).join('')}</div>` : '';
  const cardHtml = (c, i, wide) => `<div class="card ${i === 1 ? 'soft' : ''}">${c.icon ? icon(c.icon) : ''}<h3 class="card-title" style="${wide ? 'font-size:30px' : ''}">${t(c.title)}</h3><p class="card-text">${t(c.text)}</p>${c.chips?.length ? `<div class="chips" style="margin-top:16px">${c.chips.map((x) => `<span class="chip plain"><span>${t(x)}</span></span>`).join('')}</div>` : ''}</div>`;
  if (variant === 'split') {
    return [
      shell({
        section: 'brand',
        body: `${head(titleHtml(b.title), b.intro)}
  ${b.factsLabel ? `<div class="label" style="margin:-14px 0 16px">${t(b.factsLabel)}</div>` : ''}
  ${b.facts?.length ? `<div class="chips big-chips">${b.facts.map((f) => `<span class="chip"><span>${t(f)}</span></span>`).join('')}</div>` : ''}
  ${statsHtml}`,
      }),
      shell({
        section: 'brand',
        body: `${head(titleHtml(b.titleContinued || b.title), null)}
  <div class="grid cols-${Math.max(1, (b.cards || []).length)}">${(b.cards || []).map((c, i) => cardHtml(c, i, true)).join('')}</div>
  ${b.note ? `<div class="note">${t(b.note)}</div>` : ''}`,
      }),
    ];
  }
  return [
    shell({
      section: 'brand',
      body: `<div class="split">
    <div class="stack">
      <h2 class="title">${titleHtml(b.title)}</h2>
      ${b.intro ? `<p class="intro">${t(b.intro)}</p>` : ''}
      ${b.factsLabel ? `<div class="label">${t(b.factsLabel)}</div>` : ''}
      ${b.facts?.length ? `<div class="chips">${b.facts.map((f) => `<span class="chip"><span>${t(f)}</span></span>`).join('')}</div>` : ''}
      ${stats.length ? `<div class="stats cols-${stats.length}" style="grid-template-columns:repeat(${stats.length},1fr);margin-top:auto">${stats.map((s) => `<div class="stat"><div class="value">${t(s.value)}</div><div class="text">${t(s.text)}</div></div>`).join('')}</div>` : ''}
    </div>
    <div class="stack">
      ${(b.cards || []).map((c, i) => `<div class="card ${i === 1 ? 'soft' : ''}">${c.icon ? icon(c.icon) : ''}<h3 class="card-title">${t(c.title)}</h3><p class="card-text">${t(c.text)}</p>${c.chips?.length ? `<div class="chips" style="margin-top:16px">${c.chips.map((x) => `<span class="chip plain"><span>${t(x)}</span></span>`).join('')}</div>` : ''}</div>`).join('')}
      ${b.note ? `<div class="note">${t(b.note)}</div>` : ''}
    </div>
  </div>`,
    }),
  ];
}

function problemSlides(m, maxPerSlide, variant = 'columns') {
  const p = m.problems;
  const chunks = chunk(p.items.map((x, i) => ({ ...x, n: i + 1 })), cardChunks(maxPerSlide));
  if (variant === 'rows') {
    return chunks.map((items, ci) =>
      shell({
        section: 'problems',
        tone: 'dark',
        glows: ['tr', 'bl'],
        body: `${head(titleHtml(ci === 0 ? p.title : p.titleContinued || p.title), ci === 0 ? p.intro : null)}
  <div class="prob-rows">${items
    .map(
      (x) => `<div class="card prob-row">
      <span class="num-badge">${String(x.n).padStart(2, '0')}</span>
      <div><h3 class="card-title">${t(x.title)}</h3><p class="card-text">${t(x.text)}</p></div>
      <div class="side">${x.points?.length ? `<div class="chips">${x.points.map((c) => `<span class="chip plain"><span>${t(c)}</span></span>`).join('')}</div>` : ''}${x.highlight ? `<div class="quote-line">${t(x.highlight)}</div>` : ''}</div>
    </div>`,
    )
    .join('')}</div>`,
      }),
    );
  }
  return chunks.map((items, ci) =>
    shell({
      section: 'problems',
      tone: 'dark',
      glows: ['tr', 'bl'],
      body: `${head(titleHtml(ci === 0 ? p.title : p.titleContinued || p.title), ci === 0 ? p.intro : null)}
  <div class="grid cols-${items.length}" style="flex:1;min-height:0">${items
    .map(
      (x) => `<div class="card" style="display:flex;flex-direction:column">
      <div class="rule"><span class="num-badge">${String(x.n).padStart(2, '0')}</span></div>
      <h3 class="card-title" style="font-size:${items.length >= 3 ? 27 : 32}px">${t(x.title)}</h3>
      <p class="card-text">${t(x.text)}</p>
      ${x.points?.length ? `<div class="chips" style="margin-top:18px">${x.points.map((c) => `<span class="chip plain"><span>${t(c)}</span></span>`).join('')}</div>` : ''}
      ${x.highlight ? `<div class="quote-line" style="margin-top:auto;padding-top:0;font-size:${items.length >= 3 ? 20 : 23}px">${t(x.highlight)}</div>` : ''}
    </div>`,
    )
    .join('')}</div>`,
    }),
  );
}

function impactSlides(m, maxPerSlide) {
  const p = m.impact;
  return chunk(p.items, cardChunks(maxPerSlide)).map((items, ci) =>
    shell({
      section: 'impact',
      body: `${head(titleHtml(p.title), ci === 0 ? p.intro : null)}
  <div class="grid cols-${items.length}">${items
    .map((x, i) => `<div class="card impact-card ${i === 1 && items.length === 3 ? 'soft' : ''}">${icon(IMPACT_ICONS[x.category] || 'target')}<h3 class="card-title">${t(x.title)}</h3><p class="card-text">${t(x.text)}</p>${x.problem ? `<p class="small problem-ref"><span class="label">المشكلة: </span>${t(x.problem)}</p>` : ''}</div>`)
    .join('')}</div>`,
    }),
  );
}

function solutionSlides(m, maxPerSlide) {
  const s = m.solutions;
  return chunk(s.items, cardChunks(maxPerSlide)).map((items, ci) =>
    shell({
      section: 'solutions',
      tone: 'dark',
      glows: ['tl'],
      body: `${head(titleHtml(s.title), ci === 0 ? s.intro : null)}
  <div class="grid cols-${items.length} solution-grid">${items
    .map(
      (x) => `<div class="card" style="display:flex;flex-direction:column">
      <div class="cell-label">المشكلة</div>
      <p class="card-text" style="font-size:19px;margin-bottom:22px">${t(x.problem)}</p>
      <div class="cell-label">الحل</div>
      <h3 class="service-name">${t(x.serviceName)}</h3>
      ${x.offeringNames?.length ? `<p class="service-sub">${x.offeringNames.map(t).join(' · ')}</p>` : ''}
      <p class="card-text">${t(x.why)}</p>
      ${x.startLabel ? `<div style="margin-top:auto;padding-top:18px"><span class="tag">${t(x.startLabel)}</span></div>` : ''}
    </div>`,
    )
    .join('')}</div>`,
    }),
  );
}

function expectedSlides(m, maxPerSlide, compact = false) {
  const e = m.expected;
  return chunk(e.rows, (n) => (n <= maxPerSlide ? [n] : cardChunks(maxPerSlide)(n))).map((rows, ci) =>
    shell({
      section: 'expected',
      extraClass: compact ? 'compact' : '',
      body: `${head(titleHtml(e.title), ci === 0 ? e.intro : null)}
  <div class="row-cards">${rows
    .map(
      (r) => `<div class="row-card">
      <div class="cell"><div class="cell-label">${t(r.area)} · الوضع الحالي</div><div class="card-text" style="color:inherit;font-size:20px">${t(r.current)}</div></div>
      <div class="arrow">←</div>
      <div class="cell to"><div class="cell-label">الوضع المتوقع</div><div class="card-text" style="color:inherit;font-size:20px;font-weight:600">${t(r.expected)}</div></div>
    </div>`,
    )
    .join('')}</div>
  ${e.note ? `<div class="note">${t(e.note)}</div>` : ''}`,
    }),
  );
}

function mapSlides(m, maxItemsPerMonth) {
  const mp = m.map;
  const monthTitles = { 1: 'الشهر الأول', 2: 'الشهر الثاني', 3: 'الشهر الثالث' };
  const renderMonth = (n, items, extra = '') => `<div class="month ${n === 1 ? 'first' : ''}"><h3><span class="n">0${n}</span><span>${monthTitles[n]}${extra}</span></h3>${items
    .map((i) => `<div class="m-item ${i.strategic ? 'strategic' : ''}"><span>${t(i.name)}</span><span class="wk">${t(i.weeks)}</span></div>`)
    .join('')}</div>`;
  const tooLong = [1, 2, 3].some((n) => (mp.months[n] || []).length > maxItemsPerMonth);
  const after = mp.afterMonth3?.length ? `<div class="after3">يستمر بعد الشهر الثالث: ${mp.afterMonth3.map(t).join('، ')}</div>` : '';
  if (!tooLong) {
    return [
      shell({
        section: 'map',
        tone: 'dark',
        glows: ['tl'],
        body: `${head(titleHtml(mp.title), mp.intro)}<div class="months">${[1, 2, 3].map((n) => renderMonth(n, mp.months[n] || [])).join('')}</div>${after}`,
      }),
    ];
  }
  // Long plans: split every month into columns of maxItemsPerMonth, three columns per slide.
  const columns = [];
  for (const n of [1, 2, 3]) {
    const items = mp.months[n] || [];
    const parts = Math.max(1, Math.ceil(items.length / maxItemsPerMonth));
    for (let p = 0; p < parts; p++) columns.push({ n, items: items.slice(p * maxItemsPerMonth, (p + 1) * maxItemsPerMonth), part: parts > 1 ? ` <span class="wk" style="font-size:16px">(${p + 1}/${parts})</span>` : '' });
  }
  const slides = [];
  for (let i = 0; i < columns.length; i += 3) {
    const cols = columns.slice(i, i + 3);
    const last = i + 3 >= columns.length;
    slides.push(
      shell({
        section: 'map',
        tone: 'dark',
        glows: ['tl'],
        body: `${head(titleHtml(mp.title), i === 0 ? mp.intro : null)}<div class="months" style="grid-template-columns:repeat(3,1fr)">${cols.map((c) => renderMonth(c.n, c.items, c.part)).join('')}</div>${last ? after : ''}`,
      }),
    );
  }
  return slides;
}

function weekSlides(m, maxItemsPerWeek) {
  const w = m.weeks;
  const tooLong = w.weeks.some((x) => x.items.length > maxItemsPerWeek);
  const renderWeeks = (list, offset) => `<div class="timeline">${list.map((x, i) => `<span class="tl-point ${offset + i === 0 ? 'active' : ''}"><i></i>WEEK 0${offset + i + 1}</span>`).join('')}</div>
  <div class="weeks" style="grid-template-columns:repeat(${list.length},1fr)">${list
    .map(
      (x, i) => `<div class="week ${offset + i === 0 ? 'first' : ''} ${offset + i === 3 ? 'last' : ''}"><h3>${t(x.title)}</h3><ul>${x.items.map((it) => `<li><span>${t(it)}</span></li>`).join('')}</ul>${x.deliver ? `<div class="deliver"><div class="label">التسليم</div><div class="text">${t(x.deliver)}</div></div>` : ''}</div>`,
    )
    .join('')}</div>`;
  const note = w.note ? `<div class="note" style="margin-top:18px">${t(w.note)}</div>` : '';
  if (!tooLong) return [shell({ section: 'weeks', body: `${head(titleHtml(w.title), w.intro)}${renderWeeks(w.weeks, 0)}${note}` })];
  return [
    shell({ section: 'weeks', body: `${head(titleHtml(w.title), w.intro)}${renderWeeks(w.weeks.slice(0, 2), 0)}` }),
    shell({ section: 'weeks', body: `${head(titleHtml(w.title), null)}${renderWeeks(w.weeks.slice(2), 2)}${note}` }),
  ];
}

// Digital presence vs competitors: numbers computed by code from the social media audit.
function digitalSlides(m) {
  const d = m.digital;
  if (!d?.platforms?.length) return [];
  const n = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US'));
  const anyComp = d.platforms.some((p) => p.competitors);
  // Four cards are narrow: shorter labels keep every row on one line.
  const L = d.platforms.length >= 4 ? { perWeek: 'منشورات/أسبوع', last: 'آخر منشور', avg: 'تفاعل/منشور', followers: 'المتابعين' } : { perWeek: 'منشورات في الأسبوع', last: 'آخر منشور', avg: 'متوسط التفاعل للمنشور', followers: 'المتابعين' };
  const card = (p, i) => {
    const c = p.client;
    const comp = p.competitors;
    const cols = comp ? 'with-comp' : '';
    const row = (label, client, other) => `<span class="d-label"><span>${t(label)}</span></span><span class="d-value"><span>${t(client)}</span></span>${comp ? `<span class="d-value comp"><span>${t(other)}</span></span>` : ''}`;
    const body = c
      ? `<div class="d-table ${cols}">${comp ? `<span class="d-col"></span><span class="d-col">${t(m.client?.displayName || 'البراند')}</span><span class="d-col">${t('المنافسين')}</span>` : ''}${[
          row(L.perWeek, n(c.postsPerWeek), n(comp?.postsPerWeek)),
          row(L.last, c.daysSinceLastPost === null ? '—' : `من ${n(c.daysSinceLastPost)} يوم`, '—'),
          row(L.avg, n(c.avgInteractions), n(comp?.avgInteractions)),
          row(L.followers, n(c.followers), n(comp?.followers)),
        ].join('')}</div>`
      : `<p class="d-absent">${t(`مفيش حساب للبراند هنا، والمنافسين بينشروا ${n(comp?.postsPerWeek)} منشور في الأسبوع.`)}</p>`;
    return `<div class="card digital-card ${i === 1 ? 'soft' : ''}"><div class="d-head"><h3>${t(p.name)}</h3><span class="d-status ${esc(p.status)}">${t(p.statusAr)}</span></div>${body}${p.referencePostsPerWeek ? `<div class="d-ref">${t(`المعدل المرجعي: ${p.referencePostsPerWeek} منشور في الأسبوع`)}</div>` : ''}</div>`;
  };
  return [
    shell({
      section: 'brand',
      body: `${head(titleHtml(d.title), d.intro)}
  <div class="grid digital-grid cols-${d.platforms.length}">${d.platforms.map(card).join('')}</div>
  ${anyComp ? `<div class="d-foot">${t(d.note)}</div>` : ''}`,
    }),
  ];
}

function summarySlides(m) {
  const s = m.summary;
  if (!s) return [];
  return [
    shell({
      section: 'summary',
      body: `${head(titleHtml(s.title), s.intro)}
  <div class="summary-grid">
    <div class="card sum-card"><div class="label">${t(s.findingsLabel)}</div><ol class="sum-list">${s.findings.map((f, i) => `<li><span class="sum-n">${String(i + 1).padStart(2, '0')}</span><span>${t(f)}</span></li>`).join('')}</ol></div>
    <div class="card sum-card soft"><div class="label">${t(s.actionsLabel)}</div><ul class="sum-actions">${s.actions.map((a) => `<li><span class="sum-name">${t(a.name)}</span><span class="sum-when">${t(a.when)}</span></li>`).join('')}</ul></div>
  </div>
  ${s.start ? `<div class="note"><span class="label">${t(s.startLabel)}: </span>${t(s.start)}</div>` : ''}`,
    }),
  ];
}

const AUDIT_STATUS = { good: ['circle-check', 'سليم'], needs: ['circle-alert', 'محتاج تحسين'], poor: ['circle-x', 'ضعيف'] };
function auditSlides(m) {
  const a = m.audit;
  if (!a) return [];
  return [
    shell({
      section: 'audit',
      body: `${head(titleHtml(a.title), a.intro)}
  <div class="grid cols-${a.groups.length} audit-grid">${a.groups.map((g) => `<div class="card audit-card"><h3 class="audit-title">${icon(g.icon)}<span>${t(g.title)}</span></h3><ul class="audit-rows">${g.items.map((i) => `<li class="audit-row ${i.status}"><span class="audit-label">${t(i.label)}</span><span class="audit-value">${t(i.value)}</span><span class="audit-mark" title="${AUDIT_STATUS[i.status][1]}">${icon(AUDIT_STATUS[i.status][0])}</span></li>`).join('')}</ul></div>`).join('')}</div>
  <div class="d-foot">${t(a.note)}</div>`,
    }),
  ];
}

function nextSlides(m) {
  const n = m.next;
  if (!n) return [];
  return [
    shell({
      section: 'next',
      body: `${head(titleHtml(n.title), n.intro)}
  <div class="next-steps">${n.steps.map((s, i) => `<div class="card next-step ${i === 2 ? 'soft' : ''}"><span class="num-badge">${String(i + 1).padStart(2, '0')}</span><h3 class="card-title">${t(s.title)}</h3><p class="card-text">${t(s.text)}</p></div>`).join('')}</div>
  ${n.asks.length ? `<div class="note asks"><span class="label">${t(n.asksLabel)}:</span><span class="asks-list">${n.asks.map((x) => `<span class="chip plain"><span>${t(x)}</span></span>`).join('')}</span></div>` : ''}`,
    }),
  ];
}

// A QR code as inline SVG (dark modules on a transparent background).
export function qrSvg(text, size = 220) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg class="qr" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="#070808"/></svg>`;
}

// Closing slide: the call to action with Al-Marketer's contact details (from rules/agency.json) and a WhatsApp QR code.
function ctaSlides(m) {
  const c = m.cta;
  if (!c) return [];
  const row = (iconName, label, value, href, wide = false) => `<a class="cta-row${wide ? ' wide' : ''}" href="${esc(href)}">${icon(iconName)}<span class="cta-label">${t(label)}</span><span class="cta-value"><bdi class="lat">${esc(value)}</bdi></span></a>`;
  return [
    shell({
      section: 'cta',
      tone: 'dark',
      glows: ['tl', 'br'],
      body: `<div class="cta-grid">
    <div class="cta-main">
      <h2 class="title">${titleHtml(c.title)}</h2>
      <p class="intro">${t(c.text)}</p>
      <a class="cta-button" href="${esc(c.whatsappUrl)}">${icon('calendar-check')}<span>${t(c.button)}</span></a>
      <div class="cta-rows">
        ${row('message-circle', 'واتساب', c.whatsappDisplay, c.whatsappUrl)}
        ${row('globe', 'الموقع', c.websiteDisplay, c.website)}
        ${c.email ? row('mail', 'البريد', c.email, `mailto:${c.email}`, true) : ''}
      </div>
    </div>
    <div class="cta-side">
      <div class="qr-card">${qrSvg(c.whatsappUrl)}<span>${t('امسح الكود وكلمنا على واتساب')}</span></div>
      <div class="cta-brands"><img src="${asset('brand/logo-ar-white.png')}" alt="الماركتير">${c.clientLogo ? `<span class="brands-x" aria-hidden="true">×</span><span class="client-logo ${c.clientLogo.tone === 'light' ? 'on-dark' : 'on-light'}"><img src="${c.clientLogo.dataUri}" alt=""></span>` : ''}</div>
      ${c.handle ? `<a class="cta-handle" href="${esc(c.socialUrl || c.website)}"><bdi class="lat">${esc(c.handle)}</bdi></a>` : ''}
    </div>
  </div>`,
    }),
  ];
}

function kpiSlides(m, maxPerSlide) {
  const k = m.kpis;
  const chunks = chunk(k.groups, (n) => {
    if (n <= maxPerSlide) return [n];
    const sizes = [];
    for (let left = n; left > 0; left -= maxPerSlide) sizes.push(Math.min(maxPerSlide, left));
    return sizes;
  });
  return chunks.map((groups, ci) =>
    shell({
      section: 'kpis',
      body: `${head(titleHtml(k.title), ci === 0 ? k.intro : null)}
  <div class="grid cols-${groups.length}">${groups
    .map((g, i) => `<div class="card kpi-card ${i === 2 ? 'soft' : ''}"><h3>${icon(g.icon)}<span>${t(g.name)}</span></h3><ul>${g.items.map((it) => `<li><span>${t(it)}</span></li>`).join('')}</ul>${g.from ? `<div class="from">${t(g.from)}</div>` : ''}</div>`)
    .join('')}</div>
  ${ci === chunks.length - 1 && k.note ? `<div class="note">${t(k.note)}</div>` : ''}`,
    }),
  );
}

function trackingSlides(m, compact = false) {
  const tr = m.tracking;
  return [
    shell({
      section: 'tracking',
      tone: 'dark',
      glows: ['tl', 'br'],
      extraClass: compact ? 'compact' : '',
      body: `<div class="split" style="grid-template-columns:1.1fr .9fr;gap:56px">
    <div class="stack" style="gap:22px">
      <h2 class="title">${titleHtml(tr.title)}</h2>
      ${tr.intro ? `<p class="intro">${t(tr.intro)}</p>` : ''}
      <div class="pillars">${tr.pillars.map((p, i) => `<div class="pillar"><span class="n">0${i + 1}</span><div><h3>${t(p.title)}</h3><p>${t(p.text)}</p></div></div>`).join('')}</div>
    </div>
    <div class="principle">
      <img src="${asset('brand/mark-white.png')}" alt="">
      <div class="p-label">${t(tr.principle.label)}</div>
      <div class="p-lines">${tr.principle.lines.map(t).join('<br>')}</div>
      <div class="p-foot"><span>${t(tr.principle.footRight || '')}</span><span>${t(tr.principle.footLeft || '')}</span></div>
    </div>
  </div>`,
    }),
  ];
}

export const DEFAULT_LAYOUT = { coverCompact: false, business: 'one', brand: 'one', problemsVariant: 'columns', expectedCompact: false, trackingCompact: false, problems: 3, impact: 4, solutions: 4, expected: 4, mapItems: 11, weekItems: 6, kpis: 4 };

export function buildDeck(model, layout = {}) {
  const L = { ...DEFAULT_LAYOUT, ...layout };
  const slides = [
    coverSlide(model, L.coverCompact),
    ...summarySlides(model),
    ...businessSlides(model, L.business),
    ...brandSlides(model, L.brand),
    ...digitalSlides(model),
    ...auditSlides(model),
    ...problemSlides(model, L.problems, L.problemsVariant),
    ...impactSlides(model, L.impact),
    ...solutionSlides(model, L.solutions),
    ...expectedSlides(model, L.expected, L.expectedCompact),
    ...mapSlides(model, L.mapItems),
    ...weekSlides(model, L.weekItems),
    ...kpiSlides(model, L.kpis),
    ...trackingSlides(model, L.trackingCompact),
    ...nextSlides(model),
    ...ctaSlides(model),
  ];
  const total = slides.length;
  const pad = (n) => String(n).padStart(2, '0');
  const body = slides.map((s, i) => s.html(`${pad(i + 1)} / ${pad(total)}`)).join('\n');
  const css = readFileSync(join(RENDER_DIR, 'styles.css'), 'utf8');
  const title = `${model.cover.clientDisplay} — عرض فني من الماركتير`;
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${fontsCss()}</style>
<style>${css}</style>
<style>
@media screen { body.web .deck { width: 1600px; margin: 0 auto; } }
.footer .flogo { display:block; width:170px; height:26px; background:url(${asset('brand/logo-en-dark.png')}) no-repeat right center / contain; opacity:.72; }
.dark .footer .flogo { background-image:url(${asset('brand/logo-en-white.png')}); opacity:.5; }
</style>
</head>
<body>
<div class="deck">
${body}
</div>
<script>
// Web version: scale slides to the window width (ignored when printing).
(function () {
  if (!document.body.classList.contains('web')) return;
  var deck = document.querySelector('.deck');
  function fit() { var s = Math.min(1, (window.innerWidth - 32) / 1600); deck.style.transform = 'scale(' + s + ')'; deck.style.height = (deck.scrollHeight * s) + 'px'; }
  window.addEventListener('resize', fit); fit();
})();
</script>
</body>
</html>`;
  return { html, slides: slides.map((s, i) => ({ index: i + 1, section: s.section, tone: s.tone })) };
}
