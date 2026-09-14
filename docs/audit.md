# Audit — Al-Marketer Proposal System

_2026-09-14, **tested version.** Inputs:_

- _The 8 research files in `docs/audit/raw/` (written by Sonnet research agents)._
- _A first draft of this audit, written from those files and spot-checked against the code._
- _**Real tests of every blocker and every saving**, run on temporary copies of the clients and the code. The real clients, catalog, keys and app were never touched._

_The tests confirmed some findings, disproved others, and reversed three recommendations. Evidence is in `docs/audit/test-evidence/`; the method is in §12._

---

## 0. Do this first — 2 minutes, not a code issue

**Turn off "Help improve Claude"** at https://claude.ai/settings/data-privacy-controls, on the Max account the system runs on.

- **Why:** every AI step sends confidential client data through that account.
- **Consumer plans (Free, Pro, Max):** Anthropic trains on Claude Code data when the setting is on, and keeps it up to 5 years. It keeps it 30 days when the setting is off.
- **Commercial terms:** no training by default. Your plan is a consumer plan.
- **Source:** https://code.claude.com/docs/en/data-usage (retrieved 2026-09-14).
- This can't be tested from here; only you can see the setting.

---

## 1. Blockers — confirmed by real tests

### B1. False facts reach an approved proposal with every check green — CONFIRMED

**Test:**

1. In a copy of Hayaa Fashion, I changed two business cards the way a writer could plausibly get them wrong:
   - **Card 1:** "شحن مجاني لكل الطلبات" (free shipping on every order). The evidence says: "Free Shipping for orders above LE 5000" (E001).
   - **Card 2:** "فروعهم الـ3 في الإسكندرية" (their 3 branches in Alexandria). The evidence lists Cairo, Giza, Zagazig and Mansoura branches (E005).
2. I ran the real check step (including the Sonnet language review) and the real render.
3. I opened the real Control Center and clicked **Approve**.

**Result:**

- The Gate 3 page showed **"All blocking checks pass"** and "layout checks pass". Approval saved **version 1** with both false facts (`test-evidence/approved-with-false-facts-and-overlap.png`, bottom half).
- **Control test:** the same kind of edit with an invented large number ("47 branches") **was blocked** by the numbers check (C6). The number check works; nothing checks meaning.
- **Partial catch:** the advisory language reviewer flagged the Alexandria sentence, only because the intro on the same slide names the real branches. It did not flag free shipping. Its note doesn't block approval.

**Why:**

- Code verifies research quotes, but checks the client-facing sentences only for structure. Evidence ids only have to **exist**.
- Small numbers (3, 4, 12…) are always allowed because the plan uses them (`ai/steps/write.js:74`).
- The Gate 3 page shows no evidence next to the facts.

**Fix (≈1 day):**

- At Gate 3, show every fact-bearing card with the quotes of its evidence beside it.
- Flag cards backed only by notes or team answers, or with no quote.

**Optional (+0.5–1 day, one Sonnet call):** a "does this quote support this sentence?" check on those cards only.

### B2. Slides with overlapping text can be approved — CONFIRMED

**Test:**

1. In another copy, I filled the cover and the business cards to the **maximum lengths the writer's own schema allows** (eyebrow 60, accent 40, subtitle 90, lead 180, card title 40, card text 150). So this is text the AI could legitimately produce.
2. I ran the real check step and render, then clicked **Approve**.

**Result:**

- The renderer reported "cover text reaches the logo" and the Gate 3 page said **"layout checks have issues"**. Approval still saved **version 1** (top half of the proof image: the cover label runs into the logo).
- The broken words at the end of the headline come from my test text being cut to the limit, not from the renderer.

**Why:**

- The render step never fails on layout problems.
- `approveGate3` checks only the content review (`pipeline/gates.js:133`, `app/server.js:255`).

**Fix (≈0.5 day):**

- Block approval while layout issues exist, and name the slide.
- Add a test using this exact oversized content.

### B3. The safety mechanisms can be switched off and all 79 tests still pass — CONFIRMED

**Test:** in five copies of the code, I disabled one safety mechanism each, then ran the full test suite.

| Mechanism disabled | Tests |
|---|---|
| Quote verification for citations (`verifyCitation` always "ok") | **79/79 pass** |
| Diagnosis evidence status (every problem marked "verified") | **79/79 pass** |
| Slide overflow detector | **79/79 pass** |
| Gate 3 requires the automated reviews to pass | **79/79 pass** |
| Control: the quote matcher itself (`verifyQuote`) | 1 test fails — caught |

**Why it's a blocker:** B1 and B2 are today's holes. B3 means any future edit (English support, prompt changes, a fix) could silently widen them. The tests hand-write the AI outputs instead of running the real steps, and nothing asserts render layout or Gate 3 refusals.

**Fix (≈1.5–2 days):**

- Tests that run the real AI steps through the existing fake-Claude harness, including answers with invented quotes.
- A Gate 3 test that must refuse failing reviews and layout issues.
- A render test with the B2 content.

---

## 2. Important, but the tests downgraded them

### Backup — not urgent, but nothing commits automatically

**Measured in a temporary clone:**

- Committing a re-rendered proposal added only **+0.04 MB and +0.26 MB**, because git reuses the identical fonts and images.
- A new client with a website adds about **6 MB** the first time (Hayaa Fashion: 6.3 MB compressed).

**What that means:** at 5 new clients a week the repo reaches GitHub's recommended 1 GB in **about 8 months**, not the 3 months I estimated before testing.

**Still true:**

- Nothing in the app commits. Everything is committed as of 2026-09-14 00:20, but the next client exists only on this PC until someone runs git.
- Client data stays in GitHub history forever.

**Fix (≈0.5 day):** a daily automatic backup — a commit, or a copy to a synced folder.

### A Claude Code change to headless login — handled, but slow and silent

**Tests:**

1. **Login failure:** I wrapped the real CLI so every call used `--bare`, simulating the "future default". The runner correctly classified the result as a **login problem** and saved a fallback request within about 1 s.
2. **Fallback mode:** I answered a real notes request the way the `/run-step` skill describes. The pipeline **verified all 18 quotes** and finished the step.

**What remains:**

- There is no warning at start-up.
- The fallback is manual for every AI step: about 10 answers typed in Claude Code chat per proposal.

**Seen during testing:** one call hit "You've hit your session limit" and the automatic retry succeeded 3 s later.

**Fix (≈0.5 day):** a start-up system check (login, quota, CLI version) with a clear banner.

### Catalog edits vs rule tables — not silent, but late

**Test:**

1. Turning Meta Ads off in the CSV with only the offering changed was **refused** by import validation.
2. Turning off the offering **and** its 5 deliverables **imported fine**.
3. The rules↔catalog check that production never runs reported 2 problems.
4. A client with a "no Meta ads" problem then gets a clear Gate 2 message: *"Problem type "paid_meta_gap" points at "off.meta_ads", which is not an active catalog item"*. The plan can't be approved.

**Cost:** that client is stuck until someone edits `rules/problem-types.json`, which is a developer file.

**Fix (≈0.25 day):** run that check at import and pull time, before the change is saved.

### Checked and downgraded without a separate test

| Claim | Finding |
|---|---|
| Arabic `\b` bug | Affects the internal catalog report only. The client-text name and guarantee checks match Arabic (tested directly). |
| Gate 3 version race | `approveGate3` is synchronous in one process. |
| AI-requested internal URLs | Local single-user tool; low risk. |
| `1,200,000` read as 1200 and 0 | Reproduced. Mostly causes false alarms. |

---

## 3. Where the design itself is wrong

1. **The product runs on one person's consumer subscription.**
   - **Terms:** subscription login is meant for "ordinary use"; "developers building products … should use API key authentication".
   - **Data:** the consumer training setting (§0).
   - **Continuity:** if that person's login, quota or job changes, proposals stop.

   This was the zero-cost constraint working as asked, but it is a business decision you haven't explicitly made.

2. **Verification protects the internal end, not the client end.** Proven by B1: the strictest checking guards research files, while false client-facing sentences sail through.

3. **Every revision regenerates the whole proposal.** Measured on 8 language notes (§5):
   - The current rewrite **changed 92 of 134 text fields (69%)**. The same notes as a patch changed exactly 8.
   - Text the team liked changes, and edits made with "Edit the text directly" are overwritten.

4. **The tests fake the part that matters most.** Proven by B3.

5. **Reviewer calibration.**
   - The independent problem reviewer marked 5/5 Hayaa Fashion problems "needs review" (0 confirmed). Its signal is weak.
   - The **language reviewer is not noise:** it caught one of the two false facts in B1. My first draft recommended making it on-demand; the test reverses that.

6. **Notion edits the fields that matter least.** Stage, dependencies, fixed/conditional and Arabic names are local-only; the CSV files edit everything.

7. **Evidence is silently cut off.** Diagnosis receives at most 45,000 characters of pages, with no note to anyone about what was dropped.
   - Related test (§5): diagnosis **needs** those raw pages. Without them it missed a real return-policy contradiction between pages.
   - So the fix is a warning plus smarter selection, never "send less".

---

## 4. Built, but not earning its place

| Item | Evidence | Recommendation |
|---|---|---|
| Notion bootstrap, access-wait and pull | §3.6; bootstrap has no test | Freeze: keep the pull working, build nothing more |
| Forbidden-name check in the catalog report | Could never fire (Arabic `\b`); nobody noticed | Fix in the small batch, or drop it |
| PageSpeed call without a key | 429 on the one real website run | Useful only with the free key (`API-KEYS.txt`) |
| Independent problem reviewer as it is | 0/5 confirmed on the real website | Calibrate it with a clear rubric, or remove it |
| Warnings C10, L1–L3 | Same "Pixel" warning every run | Drop, or fold into the Gate 3 evidence view |
| ~15 unused exports, hard-coded numbers | raw/01 | Ignore unless the file is being touched anyway |

**Removed from this list after testing:** the language reviewer. It earns its place (B1).

---

## 5. Tokens and speed — measured and tested

### Baseline (`clients/*/logs/runs.jsonl`)

| | Hayaa Fashion (9 calls) | Hijab Store (12 calls) |
|---|---|---|
| Claude time | 9.7 min | 15.5 min |
| Input / output tokens | 139k / 44k | 120k / 77k |
| API-equivalent estimate (not billed on Max; a proxy for quota) | $1.58 | $1.98 |
| Opus share of time / of estimate | 302 s (52%) / $0.93 (59%) | 411 s (44%) / $1.29 (65%) |

Hijab Store ran three full Opus writes (draft, a rewrite after re-approval, one revision): $1.02 and 312 s of writing alone.

### What goes into each Opus call

Dry run in fallback mode on a copy of Hayaa Fashion.

- **Diagnose:** 46,153 characters.
  - 51% raw evidence pages
  - 24% Client Information Record
  - 11% checks
  - 13% rules and problem types
  - Plus a 4,588-character schema.
- **Write:** 24,561 characters.
  - 45% Client Information Record
  - 25% style example (identical for every client, placed last)
  - 13% approved problems
  - 12% writing rules
  - 4% solutions and map
  - Plus a 15,075-character schema, identical for every client.

### Tested ideas

| Idea | Test | Result | Verdict |
|---|---|---|---|
| **Revision as a patch** (send current draft + notes, return only changed texts) | Same 8 notes on two copies: today's full rewrite vs a patch call | Full rewrite: **143 s**, 18.2k in / 10.6k out, $0.46, **92 of 134 fields changed**. Patch: **24 s**, 7.6k in / 2.0k out, $0.13, **8 fields changed**, all 8 applied. Both pass every blocking check; language review 4/5 for both | **Adopt.** ~6× faster, 81% fewer output tokens, keeps approved and hand-edited text |
| **Diagnose without raw pages** (record quotes only) | Real Opus diagnosis on a copy, compared with the original run | 123 s vs 161 s, input 12.8k vs 25.2k — **but** it lost the real return-policy conflict and the shipping-cost problem, rated every problem severity 1, and tagged a broken YouTube link as `website_missing_or_broken`, which would put Website Building into the proposal | **Reject.** The saving changes what gets sold |
| **`--effort medium` on writing** | Real Opus write on a copy vs the original | 142 s / 9.4k out vs 141 s / 9.5k out: **no difference** | **Reject** |
| **Put the identical text first** so it can be cached | Three Sonnet calls with the same long text: in the prompt body vs in the system prompt | Prompt body: a different client reused **0%**. System prompt: a different client reused **89%** (4,810 of 5,432 tokens) | **Minor.** Only helps calls minutes apart (the 3 parallel research teams, quick revision rounds). Cache lifetime still **unverified** |
| **Language review on demand only** | B1 test | It caught one of two false facts | **Reject.** Keep it automatic |
| **Cheaper model tier** | Not tested | No safe candidate: notes already use Haiku, and the other steps carry quality risk | — |

---

## 6. English proposals — scoped (unchanged by tests)

**Estimate: 11–15 working days** (raw/06).

| Workstream | Days |
|---|---|
| Slide CSS to direction-neutral properties; hand-mirror the cover and the arrow | 3–4 |
| Language layer in `deck.js` and `assemble.js` | 1.5–2 |
| Fonts (verification only) | 0.25–0.5 |
| English writer prompt, voice and rules, plus a native English style example | 2.5–3.5 |
| English content checks; un-hard-code `language: 'ar'` | 1–1.5 |
| Route the detected client language through the pipeline | 1–1.5 |
| End-to-end English test client + render QA | 1.5–2 |

**Conditions:**

- **Do B3's tests first.** English work touches exactly the untested writer and checks.
- **Decisions you own:**
  - Does the diagnosis stay in Arabic for English clients (the estimate holds), or become bilingual (+1–2 days)?
  - Which English voice?
  - Who writes or approves the English style example?

---

## 7. Social media — one path, honestly costed (unchanged by tests)

- **Correction:** Meta's Ad Library API covers only political/issue ads and ads delivered to the EU/UK (https://transparency.meta.com/researchtools/ad-library-tools/, retrieved 2026-09-14). Commercial ads shown only in Egypt or Saudi Arabia aren't in it. The public Ad Library website shows them without login.
- **Path:**
  1. Keep the public page capture.
  2. Make the Ad Library check a guided 60-second step: "running ads? yes/no — how many — one screenshot", saved as evidence the diagnosis can cite. **$0, ≈0.5–1 day.**
  3. Move deep insights (engagement rate, demographics, ad results) to onboarding after signing, when the client grants access.
- **Not recommended:**
  - Paid scrapers (~$0.75–1.9 per 1,000 requests): against Instagram's terms, and they can't see insights anyway.
  - Automating the Ad Library website: your risk call.
  - Google Places API: needs billing.

---

## 8. Things you didn't ask about, ranked by value

1. **Gate 3 evidence view + layout gate** (B1, B2).
2. **Real tests for the safety mechanisms** (B3).
3. **Revisions as patches** (§5, tested: ~6× faster, and stops approved or hand-edited text changing).
4. **Start-up system check + automatic backup + import-time rules check** (§2).
5. **Small correctness batch (~0.5 day):**
   - `extractNumbers` with several thousands separators (reproduced).
   - Leak pattern missing team problem ids like `T1`.
   - Long pages mis-marked as login walls.
   - Market detection matching "sa" inside "USA".
   - `gate2 --approve` in the command line ignoring a failed plan rebuild.
   - The Arabic `\b` in the catalog report.

   All from raw/01; only the first was re-checked.
6. **Warn when diagnosis evidence was cut off** (§3.7).
7. **Sign off the rule tables** (still marked "draft").
8. **A second team member:** one PC and one Claude login are assumed. Decide before it happens.

---

## 9. What will quietly stop being used within six months

| What | Why |
|---|---|
| GitHub backup | Needs someone to run git (§2) |
| Notion catalog editing | Rare edits, token upkeep, and most engine fields aren't there |
| Independent problem-reviewer verdicts | "Needs review" on almost everything |
| Manual checks (Ad Library, Maps) | Optional and unguided, so skipped (§7 fixes the one that matters) |
| Fallback mode | Works (tested), but typing ~10 answers per proposal means people will wait for the login to be fixed instead |
| Evidence and Client Record tabs | Unopened under time pressure unless Gates 1 and 3 link to them |
| Rule-table sign-off | Nothing forces it |
| PageSpeed scores | 429 without a key |

Removed from this list after testing: language review suggestions. They caught a false fact.

---

## 10. Corrections

### To the raw research

- **raw/07:** the Ad Library API does not return commercial ads delivered only outside the EU/UK.
- **raw/03:** `--tools` is a real flag in v2.1.270; the AI-step lockdown works.
- **raw/01:** the `\b` bug is report-only; the Gate 3 race needs two processes.
- **raw/02:** the C4 test can't tell which of its two checks fired, although both work.
- **raw/08:** a second AI provider is moot; the answer to usage limits is queue and retry.

### To my own first draft (found by testing)

- **Backup growth:** about 8 months to 1 GB, not 3.
- **Headless login change:** detection and fallback work; downgraded.
- **Catalog drift:** gives a clear Gate 2 error, not a silent failure; downgraded.
- **Diagnose input trim:** it changed the diagnosis and would have sold a website service; withdrawn.
- **`--effort medium`:** no effect; withdrawn.
- **Language review on demand:** it caught a false fact; withdrawn.

---

## Build status (2026-09-14)

- **Done — B1 and B2:**
  - Gate 3 now has a **fact check** listing every statement next to its evidence, with automatic flags for numbers missing from their evidence, unknown ids, and weak matches.
  - Approval requires ticking "I compared every fact".
  - Approval is refused while there are **layout problems** (the slide is named) or when the reviews or design are out of date.
  - Proven in the real UI on the B1 and B2 test copies.
- **Done — B3:**
  - New tests run the real notes and diagnose steps with invented quotes, check the overflow detector directly and the cover limits, and test every Gate 3 refusal.
  - Repeating the switch-off test:
    - Quote verification switched off → **4 tests fail** (was 0).
    - Overflow detector switched off → **1 fails** (was 0).
    - Gate 3 ignoring reviews → **1 fails** (was 0).
    - Gate 3 ignoring layout → **1 fails**.
  - "Every problem marked verified" still passes. That code path is unreachable today, because a diagnosis whose problem has no verified quote is rejected before that line runs.
  - 87 tests.
- **Done — social media audit core** (design: `docs/research-social.md`):
  - A **Social media** tab. The AI suggests competitors and the team confirms them. Their websites are searched for profile links.
  - TikTok and YouTube are captured automatically without a login. LinkedIn, Facebook and X (and Instagram without the Meta key) go through the research browser: the real Chrome with its own profile and an Al-Marketer panel. "Type numbers" works everywhere.
  - Code computes the scorecard: posts per week over 90 days, days since the last post, formats, interactions, followers, the competitors' median and sourced reference ranges.
  - Each number becomes a check the diagnosis can cite, and the proposal gets a **digital presence** slide.
  - 109 tests.
  - **End-to-end test on a copy of Technopanel (2026-09-14):**
    - The competitor search took 29 s: 4 Saudi aluminium-panel makers, 3 confirmed and 1 rejected in the real UI.
    - TikTok: 460 followers, 0.4 posts/week, last post 67 days ago → inactive. YouTube: 1 video from 2018.
    - The re-run diagnosis (Opus, 171 s) produced "posting is irregular on TikTok and YouTube", citing only those checks. All its numbers match the scorecard.
  - **Bugs the run found, all fixed and covered by tests:**
    - **Stale evidence.** A capture that was deleted or skipped left its posts in the AI's evidence, and a diagnosis quoted them. Now removed on every run. Switching this fix off fails the new test.
    - **"Skip" ignored.** "Skip" or "Not on this platform" did not remove an existing capture from the scorecard.
    - **TikTok list intermittently unreadable.** yt-dlp sometimes could not read TikTok's post list. It now retries with TikTok's internal id, and an unreadable list is "unknown", never "no posts".
    - **Profile sub-page links.** Links like `/company/x/posts` are cut back to the profile. Facebook `profile.php?id=` links keep their id.
    - **Slide overflow.** The new slide overflowed at first; the layout checker caught it before any client could see it.
  - **Not tested live:** the research browser on real LinkedIn, Facebook and X (needs the agency's research login), and Instagram through the Meta API (needs the B4 key). Competitor comparisons appear only after those captures.

## 11. Top 5 recommendations (tested) — nothing gets built until you choose

| # | Recommendation | Size | Tested evidence |
|---|---|---|---|
| 1 | Privacy setting today (§0) + Gate 3 evidence view and layout gate (B1, B2) | 2 min + ~1.5 days | Two false facts and a cover overlap were approved as version 1 through the real UI |
| 2 | Real tests for citation verification, AI steps, render layout and Gate 3 refusals (B3) | ~1.5–2 days | 4 of 5 safety mechanisms can be switched off with 79/79 tests passing |
| 3 | Revisions as patches, keeping "rewrite everything" as an option | ~1.5–2 days | 24 s vs 143 s; 8 vs 92 fields changed; both pass every check |
| 4 | Reliability kit: start-up system check, automatic backup, rules↔catalog check at import (§2) | ~1.5 days | Fallback works but is manual and unannounced; catalog drift surfaces only at Gate 2 |
| 5 | Decide the platform question: personal Max login (documented risk) or commercial terms (§3.1) | Decision | Not testable; the largest single risk |

**Waiting for your call:** English proposals (§6, 11–15 days) and the guided Ad Library step (§7, ~1 day).

**Keys and access:** fill in `API-KEYS.txt` in the project folder, then double-click `apply-api-keys.cmd`.

---

## 12. How the tests were run

- **Location:** everything ran in a temporary folder with copies of the two clients, the code, the catalog and the rules. It used the real code paths: the CLI, the Control Center, and headless Claude calls.
- **Client copies:** each had deliberate edits recorded in `test-evidence/injected-edits.json`. Pipeline states were chained exactly as after a real writer run, so Gate 3 showed "Waiting for your approval" before approving.
- **Claude calls:** 4 Opus, about 9 Sonnet, 1 Haiku. Per-call numbers are in `test-evidence/claude-runs.json`. Each idea was run once, so single-run variance applies; the patch vs rewrite gap (6×) and the lost cross-page contradiction are far larger than that variance.
- **Test copies of the code:** reused the real dependencies through a folder link; the real `node_modules` was not modified.
- **Git measurement:** used a temporary clone; the real repository was only read.
- **Nothing written to:** `clients/`, `catalog/`, `rules/`, `.env.local`, or any app code.
