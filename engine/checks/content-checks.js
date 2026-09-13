// Automated "Content" and "Language" reviews (Blueprint p.52) over AI-written proposal text.
// Results: { id, level: 'error' | 'warning', ok, message }. Errors block the proposal; warnings are shown at Gate 3.
import { arabicRatio, extractNumbers, wordCount } from '../util/text.js';

export const GUARANTEE_PATTERNS = [/نضمن/, /نضمنلك/, /مضمون/, /حتم[اًا]/, /بكل تأكيد هن/, /100\s*%/, /١٠٠\s*٪/, /\bguarantee/i];
export const FORBIDDEN_NAMES = [/media\s*buying/i, /الدعاية الممولة/, /الميديا باينج/, /ميديا باينج/];
export const LEAK_PATTERNS = [/\b[EKNHF]\d{3}\b/, /\bP\d{1,2}\b/, /\b(svc|off|del)\.[a-z_]+/, /confidence|capability|needs[_ ]review|evidenceId/i, /notion\.(so|site)|app\.notion\.com/i, /\[\[|\]\]/];
export const JARGON = ['ROAS', 'CTR', 'CPC', 'CPA', 'CPL', 'KPI', 'KPIs', 'SEO', 'UX', 'UI', 'CRO', 'LCP', 'funnel', 'فانل', 'بيكسل', 'Pixel'];
export const PLATFORM_TERMS = ['Instagram', 'Facebook', 'TikTok', 'Snapchat', 'WhatsApp', 'YouTube', 'LinkedIn', 'Google', 'Google Maps', 'Meta', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Zid', 'Salla', 'Shopify', 'WooCommerce', 'Notion', 'SEO', 'X', 'Pinterest', 'Amazon', 'Noon', 'Tabby', 'Tamara'];

const SKIP_KEYS = new Set(['problemId', 'icon', 'category', 'basedOn']);

// All AI-written strings with their path. Title fields keep [[accent]] markers; they are removed for most checks.
export function collectTexts(content) {
  const out = [];
  const walk = (value, path) => {
    if (typeof value === 'string') out.push({ path, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(content, '');
  return out;
}

const plain = (s) => String(s).replace(/\[\[|\]\]/g, '');

/**
 * @param {object} o
 * @param {object} o.content          writer output
 * @param {string[]} o.problemIds     problems that must appear in the proposal (in order)
 * @param {Set<number>} o.allowedNumbers   numbers present in approved data
 * @param {Set<number>} o.humanNumbers     numbers the client or team provided (only these may appear in "expected")
 * @param {string[]} o.outOfScopeNames     catalog service names that are NOT in the approved scope
 * @param {string[]} o.latinTerms          Latin words allowed in Arabic text (client name, platforms…)
 * @param {Set<string>} o.knownEvidenceIds
 * @param {'ar'|'en'} o.language
 */
export function runContentChecks(o) {
  const { content, problemIds, allowedNumbers, humanNumbers = new Set(), outOfScopeNames = [], latinTerms = [], knownEvidenceIds = new Set(), language = 'ar' } = o;
  const results = [];
  const add = (id, level, ok, message) => results.push({ id, level, ok: Boolean(ok), message });
  const texts = collectTexts(content);

  // C2 / C3 — every confirmed problem appears once in problems, impact, solutions and expected; nothing extra.
  const coverage = [
    ['C2', 'problems', content.problems?.items],
    ['C3a', 'impact', content.impact?.items],
    ['C3b', 'solutions', content.solutions?.items],
    ['C3c', 'expected', content.expected?.rows],
  ];
  for (const [id, section, list] of coverage) {
    const got = (list || []).map((x) => x.problemId);
    const missing = problemIds.filter((p) => !got.includes(p));
    const extra = got.filter((p) => !problemIds.includes(p));
    const dupes = got.filter((p, i) => got.indexOf(p) !== i);
    add(id, 'error', !missing.length && !extra.length && !dupes.length, missing.length || extra.length || dupes.length ? `${section}: missing ${missing.join(', ') || '—'}; not approved ${extra.join(', ') || '—'}; repeated ${dupes.join(', ') || '—'}` : `${section} covers every approved problem exactly once`);
  }

  // C4 — forbidden names and services that are not in the approved scope.
  const forbidden = texts.filter((t) => FORBIDDEN_NAMES.some((re) => re.test(t.text)));
  const outOfScope = texts.flatMap((t) => outOfScopeNames.filter((n) => n.length > 5 && plain(t.text).includes(n)).map((n) => `${t.path}: «${n}»`));
  add('C4', 'error', !forbidden.length && !outOfScope.length, forbidden.length || outOfScope.length ? `Forbidden or out-of-scope names: ${[...forbidden.map((t) => t.path), ...outOfScope].join(' · ')}` : 'No forbidden or out-of-scope service names');

  // C5 — no guarantees.
  const guarantees = texts.filter((t) => GUARANTEE_PATTERNS.some((re) => re.test(t.text)));
  add('C5', 'error', !guarantees.length, guarantees.length ? `Guarantee wording in: ${guarantees.map((t) => `${t.path} «${plain(t.text).slice(0, 60)}»`).join(' · ')}` : 'No guarantees of results');

  // C6 — numbers only from approved data; "expected" only with numbers the client or team gave.
  const badNumbers = [];
  for (const t of texts) {
    for (const n of extractNumbers(plain(t.text))) {
      const allowed = t.path.startsWith('expected.rows') ? humanNumbers.has(n) : allowedNumbers.has(n);
      if (!allowed) badNumbers.push(`${t.path}: ${n}`);
    }
  }
  add('C6', 'error', !badNumbers.length, badNumbers.length ? `Numbers not found in approved data: ${badNumbers.slice(0, 12).join(' · ')}` : 'Every number comes from approved data');

  // C7 — cited evidence ids exist.
  const cited = [];
  const walkBased = (v) => {
    if (Array.isArray(v)) v.forEach(walkBased);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) k === 'basedOn' ? cited.push(...(x || [])) : walkBased(x);
  };
  walkBased(content);
  const unknownIds = [...new Set(cited.filter((id) => !knownEvidenceIds.has(id)))];
  add('C7', 'error', !unknownIds.length, unknownIds.length ? `Cites unknown evidence: ${unknownIds.join(', ')}` : `Facts in sections 02–03 cite ${new Set(cited).size} evidence item(s)`);

  // C8 — written in the proposal language.
  if (language === 'ar') {
    const all = texts.map((t) => plain(t.text)).join('\n');
    const ratio = arabicRatio(all, latinTerms);
    const weakSections = texts.filter((t) => plain(t.text).length > 40 && arabicRatio(plain(t.text), latinTerms) < 0.6).map((t) => t.path);
    add('C8', 'error', ratio >= 0.8 && weakSections.length <= 2, `Arabic share ${Math.round(ratio * 100)}%${weakSections.length ? `; mostly non-Arabic: ${weakSections.slice(0, 5).join(', ')}` : ''}`);
  }

  // C9 — no internal data.
  const leaks = texts.filter((t) => LEAK_PATTERNS.some((re) => re.test(t.path.endsWith('title') ? plain(t.text) : t.text)));
  add('C9', 'error', !leaks.length, leaks.length ? `Internal ids or markers in: ${leaks.map((t) => `${t.path} «${t.text.slice(0, 50)}»`).join(' · ')}` : 'No internal ids, scores or links');

  // C10 — jargon should be explained (warning; the language reviewer confirms).
  const jargon = [...new Set(texts.flatMap((t) => JARGON.filter((j) => new RegExp(`(^|[^A-Za-z])${j}([^A-Za-z]|$)`).test(t.text))))];
  add('C10', 'warning', !jargon.length, jargon.length ? `Technical terms used (make sure each is explained once): ${jargon.join(', ')}` : 'No unexplained technical terms detected');

  // Language rules — title length and card text length (warnings).
  const titles = texts.filter((t) => /\.title$/.test(t.path));
  const longTitles = titles.filter((t) => wordCount(t.text) > 10 || wordCount(t.text) < 2).map((t) => `${t.path} (${wordCount(t.text)} words)`);
  add('L1', 'warning', !longTitles.length, longTitles.length ? `Titles outside 2–10 words: ${longTitles.join(', ')}` : 'Titles are 2–10 words');
  const accentless = [...new Set(titles.filter((t) => !/\[\[.+\]\]/.test(t.text) && !/items|cards|rows/.test(t.path)).map((t) => t.path))];
  add('L2', 'warning', !accentless.length, accentless.length ? `Titles without a highlighted part: ${accentless.join(', ')}` : 'Every section title highlights its key words');
  const longCards = texts.filter((t) => /(items|cards|rows)\[\d+\]\.(text|why|current|expected)$/.test(t.path) && plain(t.text).length > 190).map((t) => t.path);
  add('L3', 'warning', !longCards.length, longCards.length ? `Card text longer than ~2 lines: ${longCards.join(', ')}` : 'Card texts are short');

  return results;
}
