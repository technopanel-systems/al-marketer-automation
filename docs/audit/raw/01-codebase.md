# Codebase Audit — Dead Code, Untested Code, Fragile Patterns

Read-only audit of every file in the module map, cross-referenced against the 14-file test suite
(`test/ai/runner.test.js`, `test/catalog/{cli,csv,merge,notion,validate}.test.js`, `test/collect/collect.test.js`,
`test/engine/{plan,text,content-checks}.test.js`, `test/pipeline/pipeline.test.js`, `test/render/deck.test.js`).
Every claim below was verified by reading the actual file (line numbers refer to the file as it stood at audit time)
or by running a one-line reproduction (noted where done). Severity key: **breaks silently** (wrong output, no error),
**breaks loudly** (throws/crashes, easy to notice), **cosmetic** (dead code / style / low-risk gap).

---

## 1. `ai/` — headless Claude runner, prompts, AI steps

### Module-wide untested-code finding (applies to `ai/evidence.js`, `ai/steps/notes.js`, `ai/steps/research.js`, `ai/steps/diagnose.js`, `ai/steps/write.js`)
Verified directly in `test/pipeline/pipeline.test.js`: every AI step in the pipeline is bypassed with a `fakeAiDone(stepId)` helper (lines 30-33) that marks a step "done" in status tracking without calling the real step function. Concretely:
- Line 52: `notes.json` is hand-written literal JSON, then `fakeAiDone('notes')` (line 53) — **`runNotesStep` in `ai/steps/notes.js` is never called.**
- Lines 54-56: `business.json`/`brand.json`/`channels.json`/`summary.json` are hand-written, then `fakeAiDone('research')` — **`runResearchStep` in `ai/steps/research.js` is never called.**
- Lines 80-93: `diagnosis.json` is hand-crafted, then `fakeAiDone('diagnose')` and `fakeAiDone('review')` — **`runDiagnoseStep` and `runReviewStep` in `ai/steps/diagnose.js` are never called.**
- Lines 131-134: `content.json` is copied from `samples/hijab-store/content.json` and saved directly, then `fakeAiDone('write')` — **`runWriteStep` in `ai/steps/write.js` is never called.**
- A repo-wide grep for `verifyCitation|evidencePacket|checksPacket` inside `test/` returns **zero matches** — `ai/evidence.js` (which implements the constitutional rule "code verifies quotes") has **no automated test at all**, direct or indirect.
- Only `runLanguageReview` and `writerContext` (from `ai/steps/write.js`) are exercised for real, via the files-mode fallback answer at pipeline.test.js line 136, because the `check` step (not `write`) calls them from `pipeline/run.js`.

Severity: **breaks silently** — the single riskiest area of the codebase per the project's own constitutional rules (AI never decides, code verifies quotes) is precisely the area with zero automated regression coverage. A regression in citation verification, schema construction, or prompt assembly would not be caught by `npm test`.

### `ai/runner.js`
- Line 72: `looksLikeAuthProblem = (text) => /(invalid api key|please run \/login|not logged in|authentication_failed|oauth token|401 unauthorized)/i.test(text)` — fragile textual match against the Claude Code CLI's own error/stderr text. If a future CLI version rewords its auth error message, this silently fails to classify the failure as an auth problem, so the fallback-to-files-mode path (line 180-183) never triggers and the step just fails with a generic `AiStepError` instead of guiding the operator to `/login`. **Breaks silently.** Confirmed by reading; not covered by `test/ai/runner.test.js`'s `'auth failure'` test beyond the exact strings the test's fake CLI emits.
- Line 87: `writeRequest` is exported but a repo-wide grep shows it is only ever called from within `ai/runner.js` itself (lines 140, 148, 181) — never imported by any other module or test. **Cosmetic** (dead export, though the function itself is live code reached internally).
- Line 67: `child.stdin.on('error', () => {})` — an intentional-looking but literally empty catch to avoid an unhandled EPIPE crash; any real stdin-write error is silently discarded with no log. **Cosmetic** (defensible pattern, but matches the "silent catch" pattern the audit asked to flag).
- Line 25: `MAX_ARGS_CHARS = 30000` and line 123 default `timeoutMs = 20 * 60_000` — hard-coded magic numbers (documented with a comment for the first). **Cosmetic.**

### `ai/steps/notes.js`
- Line 78: `export const hasNotes = (p) => loadSources(p).some((s) => s.kind === 'notes');` — grep across the whole repo (excluding this file and tests) shows **zero importers**. **Dead code, cosmetic.**

### `ai/steps/write.js`
- Line 171: `export const hasContent = (p) => existsSync(p.content);` — grep shows **zero importers** anywhere else. **Dead code, cosmetic.**
- Exported schema builders `contentSchema`, `languageSchema`, and the `ICONS` array (lines 12, 18, 144) are used only inside this file; no other module or test imports them. **Cosmetic** (dead exports; not necessarily wrong, just unused surface).
- Line 128 (`writerContext`): `outOfScopeNames` is computed from `catalog.services`/`catalog.offerings` filtered by `r.active && !inScope.has(r.id)` — deliverables are not included, so a deliverable name that is out of scope could still slip past the "don't name out-of-scope things" content check that consumes `outOfScopeNames`. Not verified against a failing test (no test exercises this), so flagged as **cosmetic/untested** rather than confirmed-broken.

### `ai/steps/research.js` and `ai/steps/diagnose.js`
- Exported schema builders `researchSchema`, `diagnosisSchema`, `reviewSchema` (lines 24, 8, 119 respectively) are, like `contentSchema`, used only within their own file. **Cosmetic** (dead exports).
- `ai/steps/diagnose.js` line 52: `if (type?.evidence === 'client_data' && !verified.some((v) => v.kind === 'notes' || v.kind === 'human')) flags.push(...)` — this flag is computed but (per the untested-code finding above) never exercised end-to-end by any test, since `runDiagnoseStep` itself is never called by the suite. **Untested.**

### `ai/evidence.js`
- Line 36: `/^K\d{3}$/.test(evidenceId)` hard-codes exactly 3 digits for check ids; a 1000th check (`K1000`) would silently fail this match and be treated as a page/notes/human evidence id lookup instead, producing `evidence ... does not exist` rather than a clear "check id out of range" error. **Cosmetic** (extremely unlikely in practice — the catalog and rules are small).
- Line 17: `if (limit < 500) break;` inside `evidencePacket` — once the running total leaves less than 500 chars of budget, the loop stops entirely rather than skipping just the current source and trying smaller ones later in rank order; a low-priority source that would fit in the remaining budget can be silently dropped. **Cosmetic** (minor budget-allocation edge case, not a correctness bug for citations already included).
- No test coverage at all (see module-wide finding above).

### `ai/fields.js`, `ai/prompts.js`
- No dead exports found — `TEAMS`, `ALL_FIELDS`, `FIELD_TEAM`, `REQUIRED_FIELDS`, `READINESS_KEYS` are all consumed by `pipeline/steps/record.js`, `ai/steps/notes.js`, `ai/steps/research.js`, or `app/pages.js` (verified via grep). `SYSTEM`, `EVIDENCE_RULES`, `DIALECTS`, `WRITING_RULES` are all consumed within `ai/steps/*.js`. No fragile patterns found (pure data).

---

## 2. `app/` — Control Center (local web app)

No test file anywhere targets `app/server.js`, `app/pages.js`, or `app/html.js` — every finding below is **untested** in addition to any severity noted.

### `app/pages.js`
- Fragile string-surgery on generated HTML instead of parameterizing the helper:
  - `chip(s.status === 'ok' ? 'done' : 'failed').replace('Done', 'ok').replace('Failed', esc(s.status))` — patches `chip()`'s rendered label text by matching the literal English words "Done"/"Failed". If `STATE_LABEL.done`/`STATE_LABEL.failed` in `app/html.js` are ever reworded, `.replace()` silently no-ops (no error) and the row shows the wrong label instead of the real source status. **Breaks silently.**
  - A second instance uses `chip(...).replace(/>[^<]+</, '>Reviewer: ${rv.verdict}...<')` — same anti-pattern: a regex patch on `chip()`'s markup shape; if `chip()`'s HTML structure changes, the injected reviewer text can silently be dropped or land in the wrong place. **Breaks silently.**
- No other dead exports found — `dashboard`, `overview`, `questions`, `evidence`, `record`, `gate1`, `gate2`, `gate3`, `newClient`, `catalogPage`, `help` are all wired into `app/server.js`'s router (confirmed by the server import list).

### `app/server.js`
- Line 177: `if (b.has('notes')) (await import('../pipeline/client.js')).writeNotes(p, b.get('notes'));` — a dynamic `import()` inside a request handler while every other function from the same module (`load`, `save`, `clientPaths`, etc.) is imported statically at the top of the file. **Cosmetic** (inconsistent style, not a bug — works correctly, just avoidably wasteful per request).
- The in-memory `jobs` Map (job tracking) is never pruned of finished/old entries — unbounded growth over a long-running server process. **Cosmetic** (low practical impact given this is a local single-operator tool).
- Single-instance handling is **correctly implemented**, not a bug: the server explicitly listens for `EADDRINUSE` and, on a second launch, opens the browser to the already-running instance instead of crashing (verified by reading the `server.on('error', ...)` handler). Noted only because the audit explicitly asked to check for single-instance assumptions — this one is handled deliberately and well.
- Line 280: `spawn('cmd', ['/c', 'start', '', ...])` to open the default browser — hard-coded Windows-only command with no non-Windows fallback. Consistent with this project's Windows-only convention (per CLAUDE.md), so likely intentional, but is a literal Windows-only path/behavior as the audit asked to flag. **Cosmetic.**
- `serveFile`'s path-traversal guard (`resolve(...)` + `startsWith(base + sep)`) reads correctly on inspection but has no test proving it holds under edge cases (e.g. symlinks, trailing-slash tricks). **Untested, breaks-silently risk if it regresses.**

### `app/html.js`
- `STATE_LABEL` is exported but a grep shows it is only ever consumed inside this same file, by `chip()`. **Dead export, cosmetic.**

---

## 3. `collect/` — website & social evidence capture

### `collect/capture.js`
- Line 110 (approx.): the `LOGIN_WALL_SIGNS` classification branch runs with **no length guard**, unlike the `BLOCK_SIGNS` branch immediately above it which requires `data.text.length < 3000`. `sample` is `${title}\n${text.slice(0, 3000)}`, so any legitimate long page whose first 3000 characters happen to contain a phrase like "log in to continue" (a blog post, an FAQ, an unrelated banner) gets the whole page wrongly tagged `status: 'login_wall'` even though it loaded with real content. **Breaks silently.** Not covered by `test/collect/collect.test.js`'s fixture, which never reaches this branch.
- `collectVitals`: LCP/CLS are read after a hard-coded `setTimeout(..., 1200)` regardless of actual page-load completion; on a slow page the true Largest Contentful Paint can occur after the 1200 ms window closes, silently under-reporting load time with no signal that the measurement window was too short. **Breaks silently** (magic-number timeout feeding a "good/bad" performance rating downstream in `site.js`).
- A genuinely empty `catch { /* older engines */ }` around `PerformanceObserver` setup swallows **any** error, not just "observer type unsupported." **Cosmetic-to-breaks-silently** (only matters if a real bug hides behind it).
- Several more `.catch(() => {})` / `.catch(() => null)` sites (`waitForLoadState('networkidle')`, the scroll `evaluate`, the vitals evaluate, `ctx.close()`) are documented best-effort steps whose failure looks identical to "page is just fast" — defensible but genuinely silent. **Cosmetic to breaks-silently.**
- Several more hard-coded magic numbers with no configuration knob: `timeoutMs = 45_000`, `12_000` networkidle timeout, `800`ms settle delay, `900`px/`120`ms scroll step, JPEG `quality: 62`. **Cosmetic.**
- The two fragile classification branches above (login-wall false positive, vitals timing window) are both **untested** — the collect fixture used by `test/collect/collect.test.js` never triggers either branch.

### `collect/site.js`
- Country-detection regex: `(intake.market||'').match(/(sa|saudi|السعودية)/i)` / `/(eg|egypt|مصر)/i` with **no word boundaries** — any market string that merely contains the bare substring "sa" (e.g. "**USA**", "Kansas") or "eg" is misclassified, feeding a wrong country code straight into the generated Meta Ad Library manual-check URL with no error surfaced. **Breaks silently.** Not covered by any test.
- `pickInternalPages`'s hint-matching condition gates text-based matching for *any* hint on the link's path not matching specifically `PAGE_HINTS[0]`'s pattern (the product hint), rather than its own — a convoluted, order-dependent construction; reordering `PAGE_HINTS` in the future would silently change classification behavior. Only the `product`/`about` hint kinds are exercised by the test; `shipping`/`returns`/`contact`/`faq` are untested. **Breaks silently, fragile + partly untested.**
- `captureRequested`'s SSRF-style guard (blocking `localhost`, `127.`, `10.`, `192.168.`, `172.16-31.`, `0.`, `::1`) matches only the **literal hostname string**, with no DNS resolution — a public domain name that resolves to a private/internal IP (DNS rebinding) would pass this check, and this function is fed URLs the AI itself proposes (`requestedUrls` in `ai/steps/research.js`), i.e. attacker-influenceable input reaching a Playwright navigation. **Breaks silently** (security-relevant gap, no test coverage at all for this function).
- Large swaths of `runCollect` (the "no website" branch, `blocked`/`login_wall`/`failed` branches, all social-profile capture, the manual-checks preservation logic, the PageSpeed branch) are untested — only the "happy path" (reachable website, Zid detected, WhatsApp link present) is exercised by `test/collect/collect.test.js`. **Untested**, and several of these paths intersect with the fragile patterns above.

### `collect/social.js`
- The hand-maintained `PLATFORMS` regex table has no fallback/logging if a real platform changes its URL shape — a drift would silently make `classifySocialUrl` return `null` (profile treated as "not found") or misclassify a link. **Breaks silently.**
- Only Instagram, TikTok, and Facebook's sharer-exclusion are exercised by the test; Snapchat, X, YouTube, LinkedIn, Pinterest, WhatsApp, Google Maps classification are entirely **untested**.

### `collect/tech.js`
- `fingerprints()` lazily parses `rules/tech-fingerprints.json` and caches it in a module-level variable — confirmed this file **is** the loader for that rules file (resolving the open question the engine/rules fork raised about whether `tech-fingerprints.json` is dead data — it is not). Read-only, idempotent global cache; not a correctness risk. **Cosmetic.**
- Only `zid`, `meta_pixel` (present), and `tiktok_pixel` (absent) are exercised by the test; other fingerprints in the rules file (ga4, gtm, snap_pixel, google_ads_tag, whatsapp_link, newsletter_form, etc.) are **untested**, though the detection logic itself is simple and shared, so risk is low.

---

## 4. `engine/catalog/` — catalog source of truth, Notion sync, CSV import/export

### `engine/catalog/mismatch.js`
- Line 86: `const pattern = new RegExp(\`\\b${bad.text...}\\b\`, 'i')` used to detect forbidden names (e.g. the constitutional "never write الميديا باينج" rule from `rules/blueprint-catalog.json`'s `forbiddenNames`). **Verified by direct reproduction**: `new RegExp('\\bالدعاية الممولة\\b','i').test('الدعاية الممولة')` returns `false` even for an exact self-match, because JavaScript's `\b` word boundary is defined via ASCII `\w`, and Arabic letters are never "word" characters under that definition. **This is a real, reproduced bug: the catalog-side backstop for the forbidden-Arabic-name rule can never fire.** **Breaks silently.** No dedicated test file (`test/catalog/mismatch.test.js` does not exist); only indirectly reached via `cli.test.js`'s `import-csv` flow, which asserts on exit code only, not on mismatch content.

### `engine/catalog/notion-bootstrap.js`
- Entire file (`bootstrapNotion`, `findParentPage`, `createContainer`, `createDatabase`, `relation`) has **zero test coverage** — the riskiest, most side-effectful code path (creates real Notion pages/databases) has no automated safety net; only reachable via `npm run catalog:bootstrap-notion` against a live workspace.
- `createContainer`'s `try { ... } catch { return client.request('POST', '/pages', body(parent)); }` swallows **any** error from the first page-creation attempt (not just "can't create at workspace level") and silently retries a different way — a genuine auth/network error on the first call produces a confusing second failure instead of a clear root cause. **Breaks silently.**

### `engine/catalog/cli.js`
- `cmdWaitNotionAccess` and `cmdBootstrapNotion` have **no test coverage**.
- The polling loop for `cmdWaitNotionAccess` uses a hard-coded `30_000`ms interval and a default 180-minute timeout, both magic numbers. **Cosmetic.**
- `explainNotionError`'s 401 and 404/`object_not_found` branches are never exercised by any test (only the `missing_token` branch is). **Untested.**
- No cross-process locking around `saveCatalog`/`writeFileAtomic`, which write to the single fixed path `catalog/catalog.json`. The individual write is atomic (temp file + rename), but two concurrent `npm run catalog:*` invocations (e.g. `pull-notion` and `import-csv` run at the same time) can both read the same file, and whichever finishes last silently wins, discarding the other's changes. **Breaks silently** under concurrent catalog-editing use — undocumented and unenforced single-process assumption.

### `engine/catalog/csv.js`
- `parseCsv`'s quote handling only special-cases a `"` at the very start of a field; a malformed-but-plausible input like `"abc"def` (trailing text after a closing quote) is not rejected — it silently concatenates to `abcdef` with no error, unlike a strict RFC 4180 parser. **Breaks silently** for this specific hand-edit mistake (low real-world likelihood since Excel/Sheets exports won't produce it); untested by `csv.test.js`, which covers unclosed quotes but not this case.

### `engine/catalog/notion.js`
- Retry logic hard-codes `attempt < 5` and `500 * 2 ** attempt` backoff with no override outside tests. **Cosmetic.**
- `fetchNotionCatalog` (the 3-table loop wrapper used by `cli.js`) has no direct unit test of its own, only `fetchTable`/`createNotionClient` are tested. **Untested**, low risk (thin wrapper).

### `engine/catalog/merge.js`
- Line ~100-103: the "capability is not a whole number, rounded" branch has no test feeding a non-integer capability value from Notion. **Untested.**
- `resolveOne`: when an offering/deliverable is linked to multiple parents in Notion, the code silently uses the first (Notion API array order, not guaranteed stable) and only logs a soft warning string rather than raising a hard error. **Breaks silently**, untested.
- All other exports (`mergeNotion`, `englishPart`, `arabicPart`, `nameKey`) are used and well covered by `merge.test.js`.

### `engine/catalog/model.js`
- All exports are used (transitively via `validate.test.js`/`merge.test.js`/`cli.test.js`); `slugify`'s Unicode-diacritic-stripping regex has no direct unit test. **Untested.**

### `engine/catalog/store.js`
- The `catch { /* unreadable existing file: overwrite */ }` in the load path is a documented, intentional silent catch, but no test proves that recovery path actually fires against a corrupted `catalog.json`. **Untested.**
- `writeFileAtomic`'s temp filename includes `process.pid`, which protects against cross-process collisions on the same file but not against the *same* process calling it twice concurrently for the same path before the first rename completes (e.g., via `Promise.all`) — currently not done anywhere in the code paths read, so theoretical only. **Cosmetic.**

### `engine/catalog/report.js`
- `renderCatalogReport` has no direct unit test (`report.test.js` doesn't exist); only indirectly invoked via `cli.test.js`'s `import-csv`, and never asserted against for content (Arabic RTL wrapping, capability-label thresholds, HTML-escaping correctness). **Untested.**
- Confirmed correctly and consistently escapes interpolated catalog text via `esc()` — no injection issue found in the parts read.
- Confirmed this file's HTML row-rendering for deliverables does not need to special-case a `null` deliverable id from Blueprint data — that null-id handling lives in `mismatch.js`'s `checkDeliverables` (see below), not here, and is handled gracefully there (see item under `rules/blueprint-catalog.json`).

### `engine/catalog/validate.js`
- Thoroughly tested; one untested branch found: the `notionSeen` duplicate-Notion-page-id check has no test forcing two catalog rows to share one Notion page id. **Untested.**

### `catalog/catalog.json` / `catalog/notion-source.json`
- Structurally consistent per the existing `validate.test.js` assertion (10 services, 7 offerings, 50 deliverables, exactly 3 strategic services). No additional structural issues found.
- `rules/blueprint-catalog.json` line 39 (and its duplicate lower in the file) contains a deliverable entry with `"id": null` for "Comments & Messages Management" under two different offerings. **Verified this is handled gracefully, not a bug**: `engine/catalog/mismatch.js`'s `checkDeliverables` (lines 21-26) explicitly checks `if (!exp.id) { fix(...); continue; }` and reports it as an intentional "Blueprint lists a deliverable the catalog doesn't have yet" fix item, exactly as the file's own header comment intends. **Cosmetic/by-design, verified safe.**

---

## 5. `engine/checks/`, `engine/plan/`, `engine/proposal/`, `engine/rules/`, `engine/scope/`, `engine/util/`, `rules/*.json`

### `engine/scope/resolve.js` (constitutional: decides which services/deliverables are sold)
Note: contrary to an initial assumption, this file **is** exercised — `test/engine/plan.test.js` drives `resolveScope` extensively and indirectly through `buildPlan` (Gate-2 add/remove/opt-in, capability exclusion, readiness overrides, "every problem type produces a passing plan"). Specific untested branches within it:
- The Gate-2 "add a specific deliverable directly" path (`add.targetId` is a `del.*` id rather than a service/offering) — no test ever adds a deliverable id this way. **Untested, breaks-silently risk.**
- Adding a whole *service* (not an offering) via `gate2.add` when it has active offerings, and the `catalog_missing` error flag inside both the `gate2.add` loop and the main `problems` loop — none of these are triggered by any existing test. **Untested.**
- Line ~33: `idx.byId.get(hit.row.serviceId).row` implicitly assumes any non-service target hit always has a `serviceId` — true today for offerings, but nothing in the code enforces this invariant if the catalog shape ever changes (e.g. a deliverable parented directly to another deliverable). **Cosmetic** (correct today, latent trap).

### `engine/checks/scope-checks.js`
- `docs/plan.md` documents automated checks "S1...S14" but this file implements only S1-S7 and S9-S13 — **S8 and S14 are not in this file**. Verified their invariants are actually enforced elsewhere: S8 ("confirmed problem needs verified quote/check/team note") lives in `pipeline/gates.js`'s `gate1Problems`; S14 ("gate hash = input/output hash") lives in `pipeline/steps.js`'s state-hash comparisons. So the invariants exist, but an auditor reading only this file's numbered list would wrongly conclude S8/S14 are missing entirely. **Cosmetic** (documentation/numbering gap, not a functional defect).
- The S6 "conditional without justification" check uses `?.reasons.some(...)`; if the target lookup returns `undefined`, this silently resolves to `false` (treated as "not justified") rather than surfacing a lookup failure. No test constructs this state. **Untested, breaks-silently.**

### `engine/checks/content-checks.js`
- `LEAK_PATTERNS`: `/\b[EKNHF]\d{3}\b/` is meant to catch leaked evidence ids, but (a) includes `F`, which is not part of the real evidence-id alphabet (`^[ENHK][0-9]{3}$`, per `ai/evidence.js`), and (b) does **not** include `T` — the prefix `pipeline/gates.js` actually uses for team-added Gate-1 problem ids (`` `T${...}` ``). A leaked `T3` id would not be caught by this leak check. **Breaks silently**, untested (no test exercises a `T\d` leak).
- Line ~101 (jargon detection, check C10): builds a regex from raw `JARGON` array entries with **no metacharacter escaping** (`new RegExp('(^|[^A-Za-z])'+j+'([^A-Za-z]|$)')`), unlike `engine/util/text.js`'s `arabicRatio`, which correctly escapes its equivalent user-supplied terms. Works today only because current `JARGON` entries are plain alphanumeric; a future entry containing `.`, `+`, `(` etc. would silently build a broken/overly-permissive regex. **Breaks silently** (latent, inconsistent pattern within the same codebase).
- The four `warning`-level checks (C10 jargon, L1 title length, L2 accent markers, L3 long card text) are never exercised at all by `content-checks.test.js`, which only asserts on `level === 'error'` results. **Untested** (advisory-only, so a defect here wouldn't block a bad proposal from being flagged, but no test would catch a regression either).
- `collectTexts`, `GUARANTEE_PATTERNS`, `FORBIDDEN_NAMES`, `LEAK_PATTERNS`, `JARGON` are exported but used only inside this file (verified via repo-wide grep); `PLATFORM_TERMS` from the same file is genuinely used elsewhere (`ai/steps/write.js`), so it is not dead. **Cosmetic** (dead exports, four of five).

### `engine/plan/schedule.js`
- `WEEKS = 12` is hard-coded in this file and never actually read from `rules/timing.json`'s own `calendar.weeks: 12` field, despite that file documenting itself as the engine's authoritative timing source. If `timing.json`'s calendar value were ever changed, `schedule.js` would keep silently using 12. **Breaks silently** (single-source-of-truth violation, currently latent since both values agree).
- The strategic-deliverable slot fallback hard-codes `9` with no named constant or comment on why 9; harmless today (only 3 strategic deliverables exist and all are listed in `week1Order`), but a 4th strategic deliverable added without updating `week1Order` would silently land at slot 9. **Cosmetic today, breaks-silently in a hypothetical future state.**
- A second `.sort()` pass (nudging `svc.marketing_automation` later within the `execution` stage) relies on `Array.prototype.sort` being a *stable* sort to not disturb the first pass's ordering — true in modern V8/Node, but undocumented as an assumption. **Cosmetic.**
- The defensive `if (!cfg) throw new Error(...)` for a missing timing-rule stage/phase combination is never actually triggered by any test. **Untested** (breaks loudly if hit, which is the safe failure mode — just unverified).

### `engine/proposal/assemble.js`
- `category: problemsView.find(...)?.impacts?.[0]?.category || impactText.get(id).category` — `impactText` is built from the AI writer's `content.impact.items`, whose JSON Schema (`ai/steps/write.js`'s `contentSchema`) does **not** include a `category` field at all. So `impactText.get(id).category` is always `undefined`; this fallback expression is effectively dead/wrong and would only be reached if `problemsView` is missing a matching entry — which is exactly what happens in `test/render/deck.test.js` (calls `assembleDeck` with no `problemsView`, defaulting to `[]`), yet the test never inspects `category`, so the silently-`undefined` result goes unverified. **Breaks silently**, untested in the sense that matters (nothing checks the actual value).
- `EXPECTED_NOTE`, `TRACKING_PILLARS`, `FOUNDATION_WHY`, `SERVICE_ICONS` are exported but consumed only within this file. **Cosmetic** (dead exports).
- The icon-selection fallback chain (`k.targetId.startsWith('del.') ? 'repeat' : SERVICE_ICONS[...] || 'gauge'`) has an untested "unknown serviceId → gauge" branch, currently unreachable unless the catalog adds an 11th service without updating `SERVICE_ICONS`. **Cosmetic**, silent visual regression only if triggered (wrong icon, not a crash).

### `engine/rules/load.js`
- `checkRulesAgainstCatalog` is exported and used **only** by `test/engine/plan.test.js` — a repo-wide grep confirms no production call site (not in `pipeline/run.js`'s `engineContext()`, not in `engine/catalog/cli.js`, not in `app/server.js`). This means editing `rules/*.json` or the catalog (via Notion pull, CSV import, or a hand edit) has **no automatic consistency check** at edit time or at pipeline-run time — an inconsistency (e.g. a problem type's `justifies` pointing at a since-deactivated catalog id) is only caught reactively, inside `resolveScope`, when a real client's diagnosis happens to hit that exact problem type, and manifests as a `catalog_missing` plan-check flag rather than a clear upfront validation error. **Breaks silently** in the sense that the intended proactive guard is not wired into any production code path.
- `checkRulesAgainstCatalog` validates `problemTypes.justifies`, `kpis.kpis[].target`, `timing.overrides[].target`, and `timing.stages.strategic.week1Order` against the catalog, but does **not** validate `impact-and-dependencies.json`'s `dependencies[].before`/`after` fields the same way. **Cosmetic** (coverage gap in the validator; the practical risk is lower because `engine/checks/scope-checks.js`'s S10 separately checks the *effect* of dependencies at plan-build time via a different mechanism).

### `engine/util/data.js`
- `stableStringify` is exported but used only internally by `hashOf` in the same file; no external importer. **Cosmetic** (dead export).
- `writeText`'s atomic-write pattern (`${file}.tmp-${process.pid}-${random}` then `renameSync`) protects against two different Node processes racing on separate tmp names, but does **not** protect against two processes finishing at different times and both renaming to the *same* final path — last writer wins, silently, with no lock. This is exactly the "single Control Center server instance" concern the project's own design leans on but does not enforce in this low-level utility. **Breaks silently** (no crash, a write can be silently lost if two processes ever touch the same client file concurrently).

### `engine/util/text.js`
- `scriptCounts` and `MIN_QUOTE_CHARS` are exported but used only internally (by `arabicRatio` and `verifyQuote` respectively); `text.test.js` never imports either directly. **Cosmetic** (dead exports from the outside, exercised only indirectly).
- `BIDI_MARKS` (a regex embedding literal invisible Unicode formatting characters) is critical to `normalizeForMatch`'s ability to match citations against real scraped web content, which frequently contains bidi control characters — yet no test in `text.test.js` explicitly exercises a quote containing an LRM/RLM/zero-width character. **Untested**, correctness-critical.
- `extractNumbers`'s thousands-separator collapse, `/(\d)[,٬](\d{3})/g`, only correctly collapses a **single** comma group per number. Walking through `"1,200,000"` by hand: the first match consumes `"1,200"` → `"1200"`, but the replace scan continues from after that match in the *original* string, where the leading digit needed to match the second `,000` was already consumed by the first match — so the result becomes `"1200,000"` and `extractNumbers` yields two separate numbers (`1200` and `0`) instead of one (`1200000`). **Untested** (no test uses a number with two or more comma groups) and, if triggered in production, would **silently weaken the anti-hallucination "numbers must come from approved data" check** (`engine/checks/content-checks.js`'s number check, consumed via `ai/steps/write.js`'s `allowedNumbers`) for any client fact quoting a number ≥ 1,000,000 in standard comma format. **Breaks silently.**

### `rules/*.json`
- `rules/tech-fingerprints.json`: confirmed **not** dead data — loaded by `collect/tech.js`'s `fingerprints()` (see §3 above). Resolves an open question raised while reading this file in isolation.
- `rules/blueprint-catalog.json`'s `"id": null` deliverable entries: confirmed handled gracefully by `engine/catalog/mismatch.js` (see §4 above), not a bug.

---

## 6. `pipeline/` — orchestration, gates, client state

### `pipeline/client.js`
- `nextId(prefix, items)` (evidence/check id generator) computes `max(existing ids) + 1` via a plain read of the in-memory `items` array, and callers (`addTextSource`, `upsertCheck`) then `save()` the whole file back — a classic read-modify-write race with **no locking**. Two processes touching the same client folder at once (the Control Center web server plus a concurrent `node pipeline/cli.js` invocation, or two browser tabs double-submitting) can both compute the same next id, and the second `save()` silently clobbers the first record with no error. **Breaks silently.** This is precisely the "single client running at a time" assumption the project relies on without enforcing it anywhere in code.
- `CLIENTS_DIR = process.env.ALM_CLIENTS_DIR || join(ROOT, 'clients')` is a single shared, module-level directory tree with no per-run isolation by default — confirms the race above is real for the default configuration, not just a theoretical multi-tenant scenario.
- `checkText`'s `c.at.slice(0, 10)` assumes `at` is always a full ISO date string; a hand-edited or malformed check record with a missing/short `at` would throw. **Breaks loudly** if triggered (safe failure mode, but untested).
- `slugify`'s fallback `` `client-${Date.now().toString(36)}` `` for empty/symbol-only names has no uniqueness check against existing client folders before use (unlike `createClient`, which does check `existsSync(p.intake)`). **Cosmetic** (very low real-world likelihood).

### `pipeline/gates.js`
- `approveGate3`'s version numbering re-derives the next version by regex-parsing existing output filenames in the directory (`f.match(/-v(\d+)\.pdf$/)`), then computes `max(...) + 1` — the same read-then-write race as above: two near-simultaneous Gate-3 approvals (e.g. an accidental double submit through the web UI) can both compute the same version number, and the second `copyFileSync` silently overwrites the first version's already-"approved and versioned" PDF/HTML output, with no uniqueness check or lock. **Breaks silently** — notable because Gate 3 is the constitutional final human-approval checkpoint before anything is considered client-ready.
- `approveGate3`'s `checksOk` parameter is a caller-supplied boolean with no independent re-verification inside this function; both current call sites (`pipeline/cli.js`, `app/server.js`) correctly derive it from `load(p.review, {}).ok` on disk, so it is not currently bypassable — but nothing in `gates.js` itself would stop a future caller from passing `checksOk: true` unconditionally. **Cosmetic** (defense-in-depth gap, not exploitable via existing call sites).
- `gate1Problems` does not factor in the independent AI reviewer's `verdict` at all when computing which problems are gate-eligible — a team can confirm a problem the reviewer explicitly rejected, provided a note or verified evidence exists. Read as an intentional "human overrides AI" design choice per the Blueprint, not a defect. **Cosmetic** (design note).

### `pipeline/steps.js`
- `fileModified` (exported) and `STEP_IDS` (exported) — grep across the whole repo, excluding this file and its own test, finds **zero references** to either. **Dead code, cosmetic.**
- `recordStepResult`'s history retention (`.slice(-300)`) is an undocumented magic number with no test asserting the trim behavior. **Cosmetic.**
- `blueprintStatus`'s long if/else chain mapping step states to a human-readable status string depends on exact `if`-ordering (e.g. `sent` must be checked before `gate3`, `render` before `write`/`check`). Adding a new step to `STEPS` without inserting a correctly-ordered branch here would silently produce a plausible-but-wrong status rather than crashing. **Breaks silently** — a latent trap for future maintenance, not a live defect today.
- The `'blocked'` state and the hash-mismatch branch of `'stale'` (beyond the two triggers `pipeline.test.js` already covers — Gate-2 edits and revision requests) are not independently unit-tested. **Cosmetic** (partial coverage).

### `pipeline/run.js`
- `runStep`'s failure path (the `catch (e)` block distinguishing `AiPendingError`/`AiAuthError` from generic failures) is never exercised by any test — `pipeline.test.js` only drives successful `runStep` calls. Code reads correctly on inspection (always records `e.message`, never silently drops it). **Untested**, not a confirmed defect.
- `runAuto`'s guard-loop escape hatch (`for (let guard = 0; guard < STEPS.length + 2; guard++) ... return { stoppedAt: null, reason: 'guard' }`) — defensive against a future infinite loop — is never triggered by any test. **Untested**, correct defensive pattern.
- `RUNNERS[stepId](...)` dispatch (string-keyed against `STEPS`) has no static assertion tying the two lists together: if a future step id is added to `STEPS` without a matching `RUNNERS` entry, the resulting `TypeError: ... is not a function` is caught by the surrounding try/catch and recorded as an ordinary step failure — the real cause (a missing `RUNNERS` entry, a configuration bug) is masked as a mundane runtime failure. **Breaks silently** in the sense that the wrong class of error is reported to the operator; currently correct because the two lists are manually kept in sync.

### `pipeline/steps/record.js`
- `detectLanguage`'s source-text extraction, `text.split('---').slice(1).join(' ')`, assumes every captured source `.txt` file uses `---` as a metadata/body delimiter; a source without that separator yields `[].join(' ')` = `''`, silently discarding all of that source's text from language detection with no warning. **Breaks silently** (fragile coupling to an assumed text format from the collectors, which are a separate module).
- `runRecordStep` silently skips a team's facts entirely if `p.researchDir/${team}.json` doesn't exist for that team, with no "team X never ran" marker recorded anywhere for later debugging. Matches the codebase's general "unknown stays unknown" philosophy, so likely intentional. **Cosmetic.**
- The `CITE_RANK`/`CONF_RANK` sort maps include a `'check'` key that, on inspection of every code path that sets `citation` on a research fact, is never actually produced (checks feed `readiness`, not `facts`) — a latent dead branch in the rank map, not currently reachable. **Cosmetic.**
- The manual-check open-question path (`checks.filter(c => c.manual && c.result === 'unknown')`) is never exercised by `pipeline.test.js`. **Untested.**

### `pipeline/cli.js`
- Confirmed via `package.json`: this file is **not** wrapped by any `npm run` script (only `catalog:*` and `plan:preview` exist), but it is the project's own documented primary CLI entry point (per its header comment and `README.md`), invoked directly as `node pipeline/cli.js ...`. It is genuinely live, user-facing code — not dead — but it has **no automated test of its own command-dispatch/argument-parsing logic**; `pipeline.test.js` imports only `createClient` from it directly, never exercising `main()` or `parseFlags()`.
- `parseFlags`'s hand-rolled parser treats any token immediately following a flag that doesn't start with `--` as that flag's value — so a boolean flag immediately followed by a positional argument (e.g. `gate1 slug --approve foo.json`) would incorrectly consume `foo.json` as `--approve`'s value rather than as a separate positional. **Breaks silently** if ever invoked this way; current documented usage always puts `--approve`/`--revise` last, so real-world risk is low, but the parser itself has no test and no such guard.
- The `gate2 --approve` case runs the plan step once if not already done (`await runStep(slug, 'plan', {...})`) but **never checks `res.ok`** before proceeding to call `planFromDisk(p)` and `approveGate2(...)` — if the plan rebuild fails, the CLI silently proceeds to approve against a stale or `null` plan rather than surfacing the plan failure to the operator. **Breaks silently.**
- The `default` case's "help text" is generated by re-reading and slicing the first 12 lines of the CLI's own source file via `readFileSync(new URL(import.meta.url), ...)` — if the header comment block is ever edited to a different length, the printed usage text silently truncates or overflows with no error. **Cosmetic** (affects only help text).

---

## 7. `render/` — slide design system, PDF + web renderer

### `render/render.js`
- Confirmed **compliant** with CLAUDE.md's Arabic-rendering rule: `await page.evaluate(() => document.fonts.ready)` runs before `page.pdf()` is called, and `report.fontsLoaded` independently re-checks via `document.fonts.check(...)` for both Arabic and Latin fonts, feeding into `report.ok`. This is correctly implemented, not a violation.
- The retry/shrink loop that tries to fit slide content is hard-capped at `attempt <= 10` with no error raised if the limit is exhausted — it silently accepts the best-effort layout and writes the PDF anyway, with layout defects only visible if the caller separately checks `report.ok`/`report.issues`. **Breaks silently.**
- Page-count verification (`report.ok` requires `pdfPages === slides`) is computed via a fragile regex scanning the **raw PDF bytes as latin1 text** (`/\/Type\s*\/Page(?!s)/g`) rather than using a real PDF parser; if Chromium's output ever uses compressed object streams, this substring search would silently miscount pages and `report.ok` would be wrong. **Breaks silently.**
- `render/render.js` has **no dedicated test at all** — `test/render/deck.test.js` only imports `cardChunks`/`buildDeck` from `render/deck.js`. All PDF generation, the font-wait logic, the page-count regex, and the shrink-retry loop are completely unexercised by the automated suite. **Untested**, and given the two findings above, this is where a real regression is most likely to hide.

### `render/deck.js`
- `SECTION_ORDER` is exported but a repo-wide grep shows nothing imports it, including `deck.js` itself elsewhere in the file; `test/render/deck.test.js` hardcodes its own separate literal array of section names instead of importing this one, so the two lists could silently drift apart over time with no test to catch it. **Cosmetic** (dead export / fragile duplication).
- `icon()` silently falls back to a default `sparkles.svg` if the requested icon name doesn't resolve to a real file, rather than throwing — masks a potential schema/data mismatch (e.g. a service added to the catalog without a matching entry in `SERVICE_ICONS`) as a generic icon instead of a clear error. **Breaks silently** (low visual impact today).
- A couple of hard-coded numeric/Latin strings (`WEEK 0${...}`, `<span class="num">${num}</span>`) bypass the file's own `t()` bidi-isolation helper used everywhere else for Latin/numeric content — harmless today since the values are hard-coded, not user data, but inconsistent with the file's stated convention. **Cosmetic.**
- No `letter-spacing`/`text-align: justify` violations found in any inline style this file generates.

### `render/styles.css`
- Confirmed **compliant** with CLAUDE.md: `letter-spacing` appears only on `.footer .num` and `.tl-point`, both pure Latin/digit content; `text-align: justify` does not appear anywhere (only unrelated `justify-content`/`justify-self` flex properties). Verified as correct, not a finding.

### `render/cli.js`
- Thin dev-only sample-render wrapper with no test coverage; low severity given it's a manual design-preview tool, not part of the production pipeline. Confirmed genuinely live (documented in `README.md` as `node render/cli.js sample ...`), not dead code.

---

## Summary

Total findings: **≈66** across all files above.

- **Breaks silently** (≈33): the Arabic `\b` regex dead-on-arrival in `engine/catalog/mismatch.js`; the entire untested `ai/steps/*.js` + `ai/evidence.js` citation-verification path; the unlocked id/version-numbering races in `pipeline/client.js` and `pipeline/gates.js`'s `approveGate3`; `render/render.js`'s silent best-effort PDF write and fragile page-count regex; the country-detection substring bug and SSRF-gap in `collect/site.js`; the login-wall false-positive and vitals-timing window in `collect/capture.js`; the thousands-separator bug in `engine/util/text.js`'s `extractNumbers`; the `checkRulesAgainstCatalog` validator that never runs outside tests; the leak-pattern gap for `T`-prefixed ids in `content-checks.js`; the `gate2 --approve` CLI path that ignores a failed plan rebuild; and several more untested-but-plausible-looking Gate-2/scope-resolution branches.
- **Breaks loudly** (≈3): `pipeline/client.js`'s `checkText` on a malformed `at` field; `engine/plan/schedule.js`'s defensive throw for an unknown timing stage; `pipeline/cli.js`'s help-text self-introspection (cosmetic-adjacent but technically a truncation risk, not a crash — reclassified as cosmetic above).
- **Cosmetic** (≈30): dead exports (`hasNotes`, `hasContent`, `writeRequest`, `STATE_LABEL`, `fileModified`, `STEP_IDS`, `SECTION_ORDER`, `stableStringify`, `scriptCounts`, `MIN_QUOTE_CHARS`, several schema builders, several `assemble.js`/`content-checks.js` exports), hard-coded magic numbers throughout (timeouts, retry counts, slot fallbacks, history retention), Windows-only paths (all by design per CLAUDE.md), and a handful of intentional/documented silent catches.

**Top concern**: the project's own constitutional rule #3 ("Evidence before problem... code verifies quotes") is implemented entirely in `ai/evidence.js` and the `ai/steps/*.js` files — and every one of those files is **completely bypassed by the automated test suite** (`test/pipeline/pipeline.test.js` fakes every AI step's output rather than calling the real step functions), so there is currently zero regression protection for the exact mechanism the project depends on to keep AI from fabricating facts. The second-tier concern is the cluster of unlocked read-modify-write races (`pipeline/client.js`'s `nextId`, `pipeline/gates.js`'s `approveGate3` versioning, `engine/catalog/cli.js`'s catalog save, `engine/util/data.js`'s `writeText`) that all assume single-process/single-client access without enforcing it anywhere — consistent with the product's "one operator, one PC" design intent, but with no code-level guard if that assumption is ever violated (two browser tabs, a CLI run racing the web server, etc.).
