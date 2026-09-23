# Session state — v3 audit work (2026-09-15): finished

The owner shut the computer down in the middle of the v3 audit work. This file is the handoff: what is done, what is
left, and exactly where to pick up. Read it together with `docs/plan-v3.md` (the plan and the 23 audit points).

## To continue

Tell Claude: "continue from docs/session-state.md". Then, in this order:

1. `npm test` — must show **194 pass, 0 fail**.
2. Restart the Control Center: close the black window, then double-click "Al-Marketer Control Center". The server
   must restart to load the new code.
3. Carry on with **Left to do** below, starting at item 1.

## Done in this session (all committed)

| Commit | What |
|---|---|
| cb77c95, 783d355 | Archive and delete proposals; old test proposals removed (these two are the only ones pushed before today's backup) |
| a34a081 | Control Center v3 part 1: al-marketer.com brand theme with dark mode (Light / Dark / System), website typed without https/www, activity log newest first, "what needs you" as action cards on top, brief with profile + logo finder, meeting report file upload (docx / pdf / txt), graded tables, light animations |
| a8b94fb | Proposal v3: client logo in a box next to the Al-Marketer logo, closing call-to-action slide (WhatsApp, email, website, QR), cover line fixed (flattened cover art), chat edit with the AI, slide text editor, versions with restore, internal English strategy report (Opus, after approval), measured Claude usage per proposal |
| 9065970 | Social capture v3: several routes per platform, typed failures, page ownership check (wrong page), Snapchat automatic, page discovery, Apify as a capped free-plan last fallback |
| e34616a | Business layer: biz_* signals from pages, DNS, Shopify, App Store and Wayback; business analyst (Sonnet) with checked citations; "Business needs and risks" (need / risk / strength + what it affects), internal only; Business & Operations record section |
| c578030 | Automatic ads / search / Maps checks (step `lookups`): Meta Ad Library by page id, Brave Search, Google Maps matched by website, Google Ads Transparency, Facebook comment replies; manual checks only as fallbacks |
| ef81b53 | Prompt upgrades from docs/research/skills-v3.md §4 (evidence discipline, notes lens, team lenses, competitor tiers, diagnosis method, review checks, persuasion structure); `ai/models.js` model + effort + fallback per step; the step list shows the model that answered |
| 84b7ae6 | Settings & keys page (`/settings`): save / test / remove / import keys, never showing values; Instagram official API keys retired; every POST must come from the app itself (same-origin check); docs/how-to-use.md rewritten |

Live checks done:
- Business layer on Technopanel: 15 signals, business model b2b manufacturer supplier, 8 needs/risks/strengths.
- Lookups: Technopanel 85 s (no Meta or Google ads, Brave #3, Maps 4.1★ / 92 reviews); Jarir Bookstore 95 s
  (29 Meta ads, ~20K Google ads, Brave #1, Maps 4.2★ / 3,016 reviews, 0 of 2 visible Facebook comments answered).
- LinkedIn Ad Library is now blocked by Cloudflare from this network (plain HTTP and Chromium), so it is not built.

## Done after the restart (2026-09-15, second part)

1. **Visual check** of Diagnosis, Scope, Proposal, slide editor and Delivery in light, dark and phone width (997e039):
   slide thumbnails were squeezed, long check results ran out of their card, the problem type list was cut off,
   Arabic in the week cards was unevenly aligned, section headers did not wrap on phones, language review showed raw
   paths ("brand.cards[0].text"), a report that never ran offered "Run again".
2. **Real end-to-end run** through the pages (scratch folder, port 4322): Technopanel, technopanel.com.sa, Saudi Arabia,
   manufacturing, system-test notes + an attached system-test meeting report. New proposal → competitors → skipped
   2 unreadable profiles → diagnosis (6 problems) → scope → one chat edit → approval → internal report.
   About 28 minutes, 15 Claude runs, $4.45 API value, no page errors, no model fallback. Found and fixed:
   - the internal report did not start after "Approve proposal" (no wake-up of the background work);
   - a chat edit made the AI write the whole proposal back (269 s, 31K output tokens): it now returns only the texts it
     changes and code puts them in place (6 s, 357 tokens, $0.09); untouched text cannot change;
   - the writer was not told which service names are out of scope, so the check made it write everything again;
   - a competitor website link "x.com/https://twitter.com/…" was read as the X account "https:";
   - an answer the checks sent back was labelled "failed" in the usage table; it is now "redone".
3. **Docs**: HOW-TO-START-AND-TEST.txt (183 tests, keys on Settings & keys, TEST 5 steps and times), README.md,
   docs/plan-v3.md build status.

## Left to do

Nothing from the v3 audit. Committed and pushed (65d7f61 and this file); the final report was given to the owner in the
session. The owner's action items: restart the Control Center; add the free keys on Settings & keys (PageSpeed
recommended); delete the unused Instagram lines (META_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID) from API-KEYS.txt.

Added afterwards on the owner's request: **Google search** (step `google`, `collect/google.js`). Google's first page for
the brand name and 2-3 buyer searches (from the competitor research): rank, profiles, other pages with the same name,
ads, the map. Read with the installed Edge in a temporary in-memory session — the owner does not allow saved browser
profiles or accounts — and through SerpApi (optional free key `SERPAPI_KEY`) when Google asks to verify. Details and
test results: docs/research/auto-checks.md §2. Owner's optional action: add a free SerpApi key on Settings & keys.

Then (2026-09-21), for giving the system to a tester: **SETUP.cmd** (`setup/setup.ps1`: computer check, Node.js 24 put
in `runtime\node` when missing, components and browser, Claude Code official installer, `claude auth login`, full
check with one Haiku answer, Desktop shortcut with the brand icon), **`npm run doctor`** (`setup/doctor.js`, also a
quick check in the launcher before each start), **`npm run package`** (`setup/make-package.js`: committed files only,
without REF/, stopped by any saved key value or key-like text; copied to the Desktop) and **START-HERE.txt**.
Tested on a fresh extracted copy: setup 7/7 OK with the private Node.js, the app started from the launcher, and the
full test suite passed inside that copy. The tester needs their own paid Claude plan (Pro or Max).
On the owner's request the same day: **`npm run package:full`**, a complete copy for a teammate (all proposals,
REF, catalog reports, keys in .env.local and API-KEYS.txt) without .git, the machine-made folders and the retired
Instagram/Meta keys; PACKAGE-INFO.txt says what is inside. Tested the same way: setup 7/7, both proposals, their
slides and files open, 5 of 5 keys set.
Then (2026-09-23): **UPDATE-CLAUDE.cmd** (`setup/update-claude.js`, `npm run claude:update`) — one double-click
updates the Claude Code program, says whether it is signed in, and prints the real model that last answered for each
job. Nothing in the project names a model version: every step asks for `haiku` / `sonnet` / `opus` (ai/models.js) and
Claude Code answers with the newest model of that family, so a new Opus or Sonnet is used on the next run by itself.

## Rules that still apply (from CLAUDE.md and the owner)

- Code decides services, deliverables, timing and numbers; AI only researches, diagnoses and writes.
- Nothing reaches a client without approval; evidence before any problem; zero paid software.
- No Anthropic API key, no Agent SDK; headless `claude -p` only; never `--bare`; never Fable.
- Git identity local only; never hard-code the GitHub account; never commit `.env.local`, `API-KEYS.txt` or tokens;
  never print key values.
- `clients/technopanel` is the owner's own test run (untracked): do not touch or commit it.
- `catalog/reports/catalog-report.html` and `catalog/reports/last-pull.md` changes are not from this work: do not
  commit them.
