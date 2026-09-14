# Audit: English (LTR) proposal support

Read-only audit. No repo files modified except this one.

## Summary of the big picture

The deterministic layer (catalog, plan engine) is **already substantially bilingual** —
this is the single most important finding and changes the estimate a lot:

- `catalog/catalog.json` already has `nameEn` **and** `nameAr` on every service, offering
  and deliverable (`engine/catalog/store.js` schema; confirmed in `catalog.json` — e.g.
  `"nameEn": "Product Portfolio Management"` next to `"nameAr"`).
- `rules/kpis.json` KPI item text is already bilingual: every item has both `"en"` and
  `"ar"` strings (e.g. `"en": "% of offers with price, tier and segment defined"` /
  `"ar": "نسبة العروض..."`).
- `engine/plan/schedule.js`, `engine/plan/kpis.js`, `engine/scope/resolve.js` already carry
  **both** `nameEn` and `nameAr` through every plan object (targets, deliverables, KPI
  entries) — nothing is lost, the English string is sitting right next to the Arabic one
  at every step of the deterministic engine.
- `pipeline/steps/record.js` already detects site language (`detectLanguage`) using a
  script-ratio function that is **not** Arabic-specific, and already asks a blocking
  "Arabic or English?" question when detection is unclear, and already stores
  `record.language.value` as `'ar'|'en'`.
- `engine/util/text.js`'s quote-normalization/verification is already script-agnostic and
  needs no changes for English.

**What's actually hard-coded to Arabic is concentrated in three places**: the deck
renderer's CSS/markup (RTL layout + Arabic-only UI microcopy), `engine/proposal/assemble.js`
(the file that turns plan objects into the DeckModel — it hard-codes `.nameAr`/`.ar`
instead of picking based on language, and bakes ~10 Arabic UI strings directly into code),
and the AI writer prompt/system text (`ai/prompts.js`, `ai/steps/write.js`), which is
Egyptian/Saudi/MSA-Arabic-only by design. `record.language` is a **dead end today** —
nothing downstream reads it.

---

## File-by-file findings

### `render/deck.js`

Already reusable:
- `esc()`, `icon()`, `dataUri()/asset()`, `chunk()/cardChunks()`, the whole slide-shell/section
  pipeline, and `buildDeck()`'s composition logic are layout-language-neutral — they just
  assemble whatever strings/arrays the DeckModel gives them.
- `titleHtml()`'s `[[accent]]` bracket parsing is script-neutral.

Hard-coded to Arabic/RTL:
- `EYEBROWS` (lines 12–24): 11 section eyebrow labels are Arabic string literals baked into
  code, not content — e.g. `cover: 'عرض فني'`, `map: 'خارطة تسليمات 3 شهور'`. These are
  deterministic labels (correctly, per constitutional rule 1 — not the AI's job), so an
  English deck needs an `EYEBROWS_EN` (or `EYEBROWS[lang]`) dictionary, not an AI translation.
- `t()` (lines 36–45) isolates **Latin** runs inside a string with `<bdi class="lat">` — this
  assumes the base text is Arabic (RTL) and Latin words are the foreign-script exception. For
  an English deck the base text is Latin/LTR; if an Arabic-script client/brand name ever needs
  to sit inside English text, the isolation needs to run in the *other* direction (isolate the
  Arabic run inside the Latin flow), or simply be skipped since the base script now matches the
  fallback logic. `t()` needs a language-aware branch (or a second regex for the reverse case).
- `coverSlide()` line 132: `<div class="to"><div class="small">عرض فني مقدم إلى</div>` — Arabic
  literal baked directly into the section function (not from content, not from EYEBROWS).
- `impactSlides()` line 249: `<span class="label">المشكلة: </span>` literal.
- `solutionSlides()` lines 266/268: `<div class="cell-label">المشكلة</div>` / `الحل` literals.
- `expectedSlides()` lines 290/292: `· الوضع الحالي` / `الوضع المتوقع` literals.
- `mapSlides()` line 303: `monthTitles = { 1: 'الشهر الأول', 2: 'الشهر الثاني', 3: 'الشهر الثالث' }`
  and line 308: `يستمر بعد الشهر الثالث:` literal, plus the Arabic list separator `، `
  (should be `, ` in English).
- `weekSlides()` line 348: `التسليم` (deliver) label literal. Note `WEEK 0${n}` (line 345) is
  already Latin/uppercase and needs no change.
- `buildDeck()` line 425: `title = ... — عرض فني من الماركتير` literal in the `<title>` tag.
- `buildDeck()` line 427: `<html lang="ar" dir="rtl">` hard-coded — trivial to parametrize but
  is the flag that the whole CSS mirroring work (below) hangs off.
- `coverSlide()` line 117 `isLatin` heuristic (regex test for ASCII) to pick a font-size/class
  for the client name — this logic already anticipates mixed-script client names and should
  generalize to English mode with only a rename, not new logic.

### `render/styles.css`

Already reusable:
- The palette, card system, grid/flex column counts, spacing scale, typography sizes, and all
  `dark`/`soft`/`compact` tone variants are script-neutral and need no change.
- `bdi.lat { font-family: 'Manrope', sans-serif; unicode-bidi: isolate; }` — reusable as-is for
  isolating a Latin run; a mirror-image rule (isolating an Arabic run inside Latin flow) would
  reuse the same mechanism.
- The comment on line 3 already documents the rule "no letter-spacing and no justify on Arabic
  text" — correctly scoped as an Arabic-only constraint, so it doesn't need removing for English,
  just needs to not apply when `dir=ltr` (letter-spacing/justify are both fine in English and
  arguably desirable in places like `.footer .num` which already uses `letter-spacing: .18em`,
  `.tl-point` `letter-spacing: .08em` — these already assume Latin text, i.e. already "just work"
  in English).

Hard-coded to Arabic/RTL (all *physical* `left`/`right`/`margin-left`/`padding-right` etc.,
27 occurrences across ~15 rules):
- `.eyebrow { top: 58px; right: 96px; }` + `.eyebrow::after { order: 2 }` — positions the eyebrow
  label at the top-right and puts the trailing rule *after* the text visually via flex `order`,
  both RTL-specific.
- `.footer { left: 96px; right: 96px; direction: ltr; }` — footer is explicitly forced `ltr`
  today (correct: page numbers/logo should stay LTR even in an RTL deck) — for an LTR deck this
  override becomes redundant but harmless; no change needed here specifically.
- `.head { grid-template-columns: 1.3fr .7fr; }` with implicit RTL reading order (title block
  reads right-to-left in the grid) — needs verification per section, not just a flip of the ratio.
- `.bar .label { padding-left: 34px; border-left: 1px solid ...; }`, `.quote-line { border-right:
  4px solid ...; padding-right: 22px; }`, `.cell-label`/`.row-card` — decorative left/right borders
  used as "leading edge" accents; these must mirror to the *other* side in LTR, not simply reuse
  the same property name.
- `.cover .mascot { left: 90px; }`, `.cover .logo { right: 96px; }`, `.cover .content { right:
  96px; text-align: right; }`, `.cover .to { right: 96px; text-align: right; }`, `.cover .lead {
  margin-left: auto; }` — the entire cover slide is absolutely positioned assuming RTL reading
  (headline block anchored right, mascot anchored left as the "background" element). This is the
  most bespoke section and needs the most manual mirroring/re-composition, not a mechanical flip.
- `.row-card .arrow` renders a literal `←` character (in `deck.js` line 291, not CSS) meaning
  "before → after" reads right-to-left; an LTR deck needs `→` instead — this is a **content
  character**, not a mirror-able icon, so it must be branched by language, not auto-flipped by CSS.
- `.timeline::before`, `.tl-point { padding-left: 14px; justify-self: start; }` — `justify-self:
  start` already resolves correctly in a `dir="rtl"` vs `dir="ltr"` container in CSS Grid *if* the
  grid itself doesn't otherwise force a reading order, so this one may already "just work" once
  `dir` is flipped — needs a render test, not a rewrite.
- No CSS rule anywhere overrides Arabic-specific typographic behavior other than the documented
  "no letter-spacing/justify" comment — i.e. there's no separate hidden RTL assumption beyond
  physical positioning + the `←` character + eyebrow ordering.

**Recommended approach**: rather than write a parallel LTR stylesheet, convert the ~15 rules
using physical properties to CSS logical properties (`inset-inline-start/end`,
`padding-inline-start/end`, `border-inline-start/end`, `text-align: start/end`) so the existing
single stylesheet mirrors automatically off the `dir` attribute already set in `deck.js`. The
cover slide and the `←`/`→` arrow character remain manual per-language work regardless.

### `render/assets/fonts.css` and embedded fonts

- Embedded: Manrope (400/500/600/700/800, latin + latin-ext subsets) and Noto Sans Arabic
  (400/500/600/700/800, **arabic + latin + latin-ext subsets** — confirmed in `fonts.css`, e.g.
  the `/* latin */` `@font-face` blocks under `font-family: 'Noto Sans Arabic'`).
- Body stack is `font-family: 'Manrope', 'Noto Sans Arabic', sans-serif;` (styles.css line 27) —
  **Manrope alone is sufficient for a full English deck**: it has full Latin + Latin-Extended
  coverage (accented European characters, currency symbols, etc.) at every weight the deck uses.
  Noto Sans Arabic is only needed as a fallback for Arabic-script runs (e.g. an Arabic client
  name inside an otherwise-English deck) — and since Noto Sans Arabic *also* ships Latin glyphs,
  there is no visual inconsistency risk even in mixed text; both fonts render Latin at a visually
  similar (both are humanist sans, similar x-height) weight.
- **No new font files are needed.** This is a "verify only" item, not a build item: confirm the
  cover's `isLatin` branch (`deck.js` line 117) and `.cover .client.ar` CSS override still produce
  the intended headline size for a purely-English client name, and spot-check that no place in
  CSS references `'Noto Sans Arabic'` as the *first* choice for a class that would appear in
  English mode (checked: it never does — Manrope is always first in the stack).

### `ai/prompts.js`

- `SYSTEM.write`: `'You are the senior Arabic copywriter... in Egyptian business Arabic...'`
  — Arabic-only by design, not parameterized.
- `DIALECTS`: three entries, **all Arabic** (`egyptian`, `saudi`, `msa`) — there is no English
  entry and no generic "style" abstraction; the dialect concept itself is Arabic-specific
  (register/regional-flavor of Arabic). An English mode needs its own equivalent concept (e.g.
  a "voice" — warm business English vs. more formal international English) rather than reusing
  `DIALECTS`.
- `WRITING_RULES`: language-mixed already in one place (`Latin brand and platform names ... may
  stay in Latin letters; everything else in Arabic`) but otherwise Arabic-specific: forbidden
  guarantee words are Arabic (`نضمن، مضمون، مضمونة، حتمًا`, plus `100%`/`guarantee` already
  bilingual), and the forbidden-service-name rule bans the *Arabic* mistranslations of "Media
  Buying" (`الدعاية الممولة`, `الميديا باينج`) — an English writer would need the equivalent
  English-language rule (ban "Media Buying" itself, which is already partly covered in
  `content-checks.js`'s `FORBIDDEN_NAMES`, see below).
- `EVIDENCE_RULES` and `SYSTEM.notes/research/diagnose/review` are **already language-neutral**
  in the sense that nothing in their English wording assumes Arabic output — but `SYSTEM.diagnose`
  and its schema (`ai/steps/diagnose.js`, not in the requested file list but directly upstream of
  `write.js`) hard-code Arabic-suffixed field names (`title_ar`, `statement_ar`, `explanation_ar`
  — confirmed at `ai/steps/diagnose.js` lines 23–32). This matters for the estimate: see the
  design-decision flag below on whether internal diagnosis stays Arabic.

An "English writer" system prompt needs: (1) a new `SYSTEM.write` variant, (2) a replacement for
`DIALECTS` (a "voice" set, however small), (3) an `WRITING_RULES`-equivalent in English with an
English-specific forbidden-guarantee-word list and an English-specific out-of-scope-name rule,
and (4) a **new English style-example** `content.json` (see next file) — none of this exists today.

### `ai/steps/write.js`

- `contentSchema()` (lines 18–64): the JSON Schema itself is **entirely language-neutral** —
  it's field names, array shapes, `minLength`/`maxLength` character counts. Nothing in the shape
  assumes Arabic; it only needs different *content* to produce an English deck. The one caveat:
  the `maxLength` values were tuned by eye against Arabic prose density and will likely need
  re-tuning for English (Arabic is comparatively compact per character versus English for the
  same idea), which only surfaces during testing.
- `writerContext()` (lines 67–80): language-neutral — pulls numbers/evidence ids/out-of-scope
  names generically; `latinWords` (line 77) already anticipates a majority-Arabic document with a
  Latin-word allowlist — for English mode this would need to become an "Arabic-word allowlist"
  concept (client names in Arabic script, etc.) mirrored, not new logic.
- `solutionsText()` (lines 82–93): **hard-coded to Arabic** — pulls `t.group.nameAr` / `t.nameAr`
  and `d.nameAr` (lines 87–88) even though the plan objects already carry `nameEn` right next to
  it (confirmed in `engine/plan/schedule.js`/`engine/scope/resolve.js` above). This is a
  one-line-per-callsite fix once a `language` parameter is threaded in, not new plumbing.
- `runWriteStep()` prompt (lines 100–133): the task/system instructions are English *prose about
  writing Arabic* — e.g. `Write the Arabic text for Al-Marketer's technical proposal to "..."`
  (line 105) and reads `${x.title_ar}`/`${x.statement_ar}`/`${i.explanation_ar}` from
  `problemsView` (line 120), i.e. it depends on the diagnosis step's Arabic-suffixed fields as
  its factual input regardless of what language it's asked to *write* in. This is actually good
  news: the writer's job is already "read structured Arabic facts, produce fresh prose" (not a
  copy/paste), so instructing it to read the same Arabic-titled `problemsView` but *write* English
  prose is architecturally sound and requires no diagnosis-step changes — **provided** the team
  is fine with Gate 1/Gate 2 internal review staying in Arabic even for an English-output client
  (flagged as a design decision below).
- `example` (line 98): loads `samples/hijab-store/content.json`, a **single Arabic-only style
  example**, hard-coded by path. An English mode needs an equivalent hand-written English example
  proposal (its own file, own content), not a translation of the Arabic one (translating would
  produce a translation-flavored voice, not natural English business prose — the constitutional
  intent of the style example is "match tone", which requires an actually-native example).
- `check()` (line 136): hard-codes `language: 'ar'` when calling `runContentChecks` — this needs
  to become `language: ctx.language` (or similar) once a language flows into `runWriteStep`.
- `languageSchema`/`runLanguageReview()` (lines 144–169): the review step is explicitly framed as
  reviewing "Arabic proposal text" (`SYSTEM.language`, and the prompt text `Review this Arabic
  proposal text`) — needs an English-review variant (or to become language-parameterized) if the
  language-consistency/dialect-review gate is to also cover English output.

### `engine/checks/content-checks.js`

- The function signature **already takes a `language` parameter** (`'ar'|'en'`, JSDoc line 37,
  destructured with a `'ar'` default on line 39) — this is exactly the hook the task asked about,
  and it already exists.
- However, only **one** check (`C8`, lines 89–94) actually branches on it, and only to *run* the
  Arabic-ratio check when `language === 'ar'`; when `language !== 'ar'` (i.e. today, if anyone
  passed `'en'`), **C8 silently does nothing** — there is no inverse "is this actually English"
  check yet. That's real missing logic, not just a config flip.
- `GUARANTEE_PATTERNS` (line 5) is already partly bilingual (`/\bguarantee\b/i` alongside the
  Arabic forms) — an English mode would want a few more common guarantee/certainty phrasings
  (e.g. "guaranteed results", "risk-free", "we promise") added, a small addition.
- `FORBIDDEN_NAMES` (line 6) already includes an English pattern (`/media\s*buying/i`) alongside
  the Arabic mistranslations — already halfway bilingual.
- `LEAK_PATTERNS` (line 7) is script-neutral (ids, `notion.so` links, `[[`/`]]` markers) — reusable
  as-is.
- `JARGON` (line 8) is already a mixed list (mostly English acronyms like ROAS/CTR plus two
  Arabic transliterations `فانل`/`بيكسل` that simply won't match English text) — reusable as-is,
  no change needed for English mode.
- `PLATFORM_TERMS` (line 9) is already all-Latin brand names — reusable as-is (used today as the
  Arabic-mode Latin allowlist; would become largely redundant, harmlessly, in English mode).
- Callers currently hard-code `language: 'ar'` at **two** call sites outside this file:
  `ai/steps/write.js` line 136 and `pipeline/run.js` line 91 — both need to pass the actual
  content/record language once one exists.
- **What an English-mode check needs, concretely**: a `latinRatio`/inverse check reusing the
  already-generic `scriptCounts()` from `engine/util/text.js` (it already counts Arabic vs. Latin
  letters symmetrically — see below), thresholded the opposite way, with an "allowed Arabic
  terms" allowlist (client's Arabic-script legal name, etc.) mirroring today's
  `allowedLatinTerms`. This is a small, mechanical addition given the utility function is already
  built.

### `engine/util/text.js`

- `normalizeForMatch()` (lines 16–30): already does Unicode NFKC normalization, strips bidi
  control marks, strips a broad Latin+Arabic punctuation class (including smart quotes
  `’‘“”«»`, em/en dashes, etc. — line 27), collapses whitespace, and lowercases. The
  Arabic-specific replacements (diacritics, tatweel, alef/ya/ta-marbuta variants, lines 19–25)
  are regexes scoped to Arabic Unicode ranges — they are **no-ops on English text**, so this
  function already produces a safe, generic normalization for English quotes with **zero
  changes needed**. Smart-quote and whitespace handling that an English quote-verification
  system would need is already present in the shared punctuation-stripping regex.
- `toWesternDigits()` (lines 9–13) is Arabic/Persian-digit-specific but harmless no-op for
  English source text (nothing to convert).
- `scriptCounts()`/`arabicRatio()` (lines 54–71) are **already bidirectional** — they count both
  Arabic and Latin letters and compute a ratio; `arabicRatio` just happens to report the Arabic
  share. Any English-mode script check (item above) is a thin wrapper over this existing function,
  not new counting logic.
- `verifyQuote()` (lines 35–52), `extractNumbers()` (lines 74–77), `wordCount()` (lines 79–81):
  all already script-neutral. **This entire file needs no changes for English support** beyond
  perhaps one new test case demonstrating an English quote round-trips correctly.

### `pipeline/steps/record.js`

- `detectLanguage()` (lines 37–43): **already fully generic** — it slices captured website/social
  text, computes `arabicRatio` (from `engine/util/text.js`, itself bidirectional), and classifies
  `ratio >= 0.6 → 'ar'`, `ratio <= 0.3 → 'en'`, else `'unclear'`. This already correctly detects
  an English-language client site today; no new logic needed here.
- `questionCatalog()` (line 17): the `language` question already exists (`'Which language should
  the proposal be in? (Arabic or English)'`, `options: ['ar', 'en']`) and is already wired as a
  blocking question when detection is unclear (line 98: `if (language.value === 'unclear')
  questions.push(...)`).
- `runRecordStep()` (lines 82–89): correctly prioritizes human answer > website detection > notes
  hint > detection fallback, and saves `record.language` onto the record (line 106–113).
- **The dead end**: nothing downstream reads `record.language.value`. Confirmed by search —
  `write.js`/`runWriteStep` takes a `dialect` param (Arabic-only concept) and never looks at
  `record.language`; `pipeline/run.js` hard-codes `language: 'ar'` when it calls the content
  checks (line 91) instead of reading the record; `render/deck.js` hard-codes `lang="ar"
  dir="rtl"`; `pipeline/gates.js`'s `saveGate1` only ever stores a Arabic `dialect`
  (`'egyptian'|'saudi'|'msa'`, defaulting to `'egyptian'`) with no English equivalent option.
  So today, a client whose site is detected/declared English still silently gets an all-Arabic,
  RTL proposal — the detection and the question are fully built, but nothing consumes the answer.

---

## Task breakdown and day estimates

| # | Workstream | Days | Reasoning |
|---|---|---|---|
| 1 | **Deck CSS: physical → logical properties + cover-slide/arrow manual mirroring** | 3–4 | ~15 CSS rules across the 11 section templates use physical `left`/`right`/`border-left`/`padding-right` etc.; converting to logical properties (`inset-inline-*`, `padding-inline-*`, `border-inline-*`, `text-align: start/end`) auto-mirrors most sections off the `dir` attribute already in `deck.js`. The cover slide (absolutely-positioned mascot/logo/headline block) and the `←`/`→` timeline-arrow character need hand mirroring, not a mechanical flip. Each of the 11 section templates then needs a visual pass in both directions (PDF print + web scroll) since CSS Grid/Flex reading order can still surprise with `dir` flipped. |
| 2 | **`deck.js` + `assemble.js` i18n layer**: `EYEBROWS`/label dictionaries per language, `t()` bidi-direction awareness, `assembleDeck()` picking `nameEn`/`en` vs `nameAr`/`ar` instead of hard-coding, translating ~12 baked-in Arabic UI strings (`EXPECTED_NOTE`, `TRACKING_PILLARS`, `FOUNDATION_WHY`, month names, "current/expected", "deliver", cover's "presented to", `، ` vs `, ` list separators, arrow character) | 1.5–2 | Mechanical but touches two files at ~10–15 call sites each; the deterministic bilingual data already exists in the plan objects (`nameEn`/`en` are already there), so this is wiring + a small translated-label dictionary, not new content generation. |
| 3 | **Fonts: verification only** | 0.25–0.5 | Manrope already has full Latin/Latin-Extended coverage at every weight used; Noto Sans Arabic's Latin subset is a safe fallback with no visual clash. No new font files needed — just confirm the cover's Latin/Arabic name-length branching still looks right for a pure-English client name. |
| 4 | **English writer prompt + `DIALECTS`-equivalent voice guide + English `WRITING_RULES` (forbidden guarantee/out-of-scope wording) + one hand-written English style-example `content.json`, tuned against a real or realistic English client** | 2.5–3.5 | Needs genuinely new authored content (not translation): a native-sounding English proposal example is the actual anchor for the writer's tone, per the existing "match tone... not its facts" instruction; also needs `contentSchema()`'s character-length limits re-tuned by eye for English prose density, discovered through iteration. |
| 5 | **Content checks: inverse script-ratio check (`latinRatio`, reusing the already-bidirectional `scriptCounts`), expand `GUARANTEE_PATTERNS` with a few more English phrasings, wire the `language` param through `write.js`'s `check()` and `pipeline/run.js`'s hard-coded `'ar'`** | 1–1.5 | Most of the primitive (`scriptCounts`) already exists; this is a new threshold check plus un-hard-coding two call sites. `FORBIDDEN_NAMES`/`LEAK_PATTERNS`/`JARGON`/`PLATFORM_TERMS` already need no changes. |
| 6 | **Wire `record.language` end-to-end**: pipeline/gate plumbing so a client's detected/declared language actually selects the writer variant, the check language, and the deck's `lang`/`dir`; add an English option next to `dialect` in `pipeline/gates.js`/Gate 1 UI | 1–1.5 | The detection and the question already exist and work; this is closing the "dead end" — routing one field through 3–4 modules that currently ignore it. |
| 7 | **End-to-end test with a fake English client + render QA** (PDF + self-contained web file, print pagination, font loading wait, RTL/LTR mix if the fake client has an Arabic legal name) | 1.5–2 | Exercises everything above together; this is where schema length limits, CSS mirroring gaps, and prompt tone issues actually surface — budget iteration time, not just a single run. |
| **Total** | | **11–15 days** | |

Everything **not** listed above (`engine/util/text.js`, `pipeline/steps/record.js`'s detection
logic, the catalog's `nameEn` field, `rules/kpis.json`'s bilingual items, the plan engine's
`nameEn`/`nameAr` pass-through, the English brand-logo assets, `content-checks.js`'s
`language` parameter itself) needs **no changes** — that groundwork already exists and is the
reason the estimate isn't substantially larger.

---

## Genuinely uncertain — needs a design decision, not just work

1. **Does internal diagnosis (Gate 1/Gate 2) stay in Arabic even for an English-output client?**
   `ai/steps/diagnose.js` hard-codes Arabic-suffixed schema fields (`title_ar`, `statement_ar`,
   `explanation_ar`) and is not in scope of this audit's file list, but `write.js` reads exactly
   those fields as its factual input regardless of what language it's told to *write* in. If the
   Al-Marketer team is fine reviewing diagnosis internally in Arabic always (plausible — it's an
   Arabic-speaking agency) and only the client-facing writer output/deck needs to be English,
   **no changes to `diagnose.js` are needed** and the estimate above holds. If the team instead
   wants the diagnosis review screens themselves bilingual, add ~1–2 days (new schema fields or a
   parallel `_en` set, plus Gate 1/Gate 2 review UI changes in `app/pages.js`/`pipeline/gates.js`,
   not scoped in the estimate above).
2. **Does an English deck need different iconography or visual language?** The current Lucide
   icon set (`IMPACT_ICONS`, `SERVICE_ICONS`) is script-neutral (pictograms, not text) and should
   carry over unchanged — flagged only because it's a legitimate question, not because evidence
   suggests a problem.
3. **Does the mascot/cover design work unchanged?** The mascot image (`mascot.png`) has no visible
   text baked in and needs no variant. The cover **logo** already has an English variant on disk
   (`render/assets/brand/logo-en-white.png` / `logo-en-dark.png` — currently only used in the
   slide footer, not the cover) so swapping it into `coverSlide()` is a one-line change, not new
   asset work — but this should be confirmed with whoever owns the brand assets, since it wasn't
   designed for the cover's larger size. The `mark-white.png`/`mark-dark.png` symbol used in the
   tracking slide's principle box was not visually inspected for baked-in Arabic text and should
   be checked before assuming it's reusable as-is.
4. **What "voice" replaces `DIALECTS` for English?** Arabic dialect choice (Egyptian/Saudi/MSA)
   is a real regional-register decision the sales team currently makes per client; English has no
   obvious equivalent axis (a generic "professional English" may be entirely sufficient, or the
   team may want a Gulf-English vs. international-English distinction for tone). This changes
   whether workstream #4 needs one English style or several, and is a business decision, not an
   engineering one.
5. **Character-length budgets in `contentSchema()`** were tuned for Arabic; whether English needs
   materially different `maxLength` values (English often needs more characters to express the
   same idea) can only be confirmed empirically during workstream #7, not decided up front.

## Files referenced

- `C:\dev\al-marketer-automation\render\deck.js`
- `C:\dev\al-marketer-automation\render\styles.css`
- `C:\dev\al-marketer-automation\render\assets\fonts.css`
- `C:\dev\al-marketer-automation\render\assets\brand\` (logo-ar-*.png, logo-en-*.png, mark-*.png, mascot.png)
- `C:\dev\al-marketer-automation\ai\prompts.js`
- `C:\dev\al-marketer-automation\ai\steps\write.js`
- `C:\dev\al-marketer-automation\ai\steps\diagnose.js` (referenced for context — outside the requested file list)
- `C:\dev\al-marketer-automation\engine\checks\content-checks.js`
- `C:\dev\al-marketer-automation\engine\util\text.js`
- `C:\dev\al-marketer-automation\pipeline\steps\record.js`
- `C:\dev\al-marketer-automation\pipeline\run.js` (hard-coded `language: 'ar'` call site)
- `C:\dev\al-marketer-automation\pipeline\gates.js` (Arabic-only `dialect` field)
- `C:\dev\al-marketer-automation\engine\proposal\assemble.js` (DeckModel assembly — hard-codes `.nameAr`/`.ar` and ~10 Arabic UI strings)
- `C:\dev\al-marketer-automation\engine\plan\schedule.js`, `engine\plan\kpis.js`, `engine\scope\resolve.js` (confirm `nameEn`/`nameAr` already carried through)
- `C:\dev\al-marketer-automation\catalog\catalog.json` (confirm `nameEn` already present)
- `C:\dev\al-marketer-automation\rules\kpis.json` (confirm bilingual `en`/`ar` KPI text already present)
