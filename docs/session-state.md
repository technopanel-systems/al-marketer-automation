# Session state — where the v3 work stopped (2026-09-15)

The owner shut the computer down in the middle of the v3 audit work. This file is the handoff: what is done, what is
left, and exactly where to pick up. Read it together with `docs/plan-v3.md` (the plan and the 23 audit points).

## To continue

Tell Claude: "continue from docs/session-state.md". Then, in this order:

1. `npm test` — must show **182 pass, 0 fail**.
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

## Left to do

1. **Visual check, light and dark**: Diagnosis, Scope, Proposal, slide text editor, Delivery (Research and Settings
   were checked). Use a scratch clients folder, never `clients/`:
   `ALM_CLIENTS_DIR=<scratch>/clients ALM_PORT=4321 ALM_NO_AUTORUN=1 ALM_NO_RESUME=1 ALM_NO_BROWSER=1 node app/server.js`
   In Git Bash set `MSYS_NO_PATHCONV=1` before passing `/c/<slug>/...` paths to scripts.
2. **Real end-to-end run** (was about to start): a new proposal through the UI in a scratch clients folder on its own
   port with autorun on, e.g. Technopanel (website technopanel.com.sa, market Saudi Arabia, industry manufacturing).
   Plan for the Playwright script:
   - /new: fill `name`, `displayName`, `website` (without https), click "Find profiles and logo" (`[data-presence]`),
     tick found profiles (`socials_pick`), market combo `market`, notes textarea `#notes`, attach a small meeting
     report to `notes_files` (clearly marked as system-test notes), submit "Create and start research".
   - Poll `GET /api/c/<slug>/state` every 5 s (steps are `[label, detail, state]`).
   - confirm-competitors open → mark those with a website "Compare", save. answer-questions open → answer or
     "unknown". fix-captures open → "Skip this profile" / "Not on this platform" where needed.
   - gate1 open → confirm verified problems, "Approve diagnosis". gate2 → "Approve scope".
   - Before gate3: one chat edit ("ask", e.g. shorten the cover promise) to exercise `edit` + versions; then tick
     `factsChecked`, "Approve proposal".
   - Wait for `report` done; screenshot Delivery (Claude usage table, internal report link); open the report PDF.
   - Check: lookups and business steps ran; model tags show real models; no step fell back unexpectedly
     (`logs/runs.jsonl` lines with `fallbackTo`).
   The earlier script `e2e-v2.mjs` in the old session scratchpad was the model for this; it may be gone after a
   restart, so rewrite from the plan above.
3. **Docs**: HOW-TO-START-AND-TEST.txt (keep CRLF): test count 135 → 182; key instructions now point to
   Settings & keys (section G, part 5, part 6 step 3). README.md: test count, the Research row (lookups, business
   analyst), the Delivery row (internal report, Claude usage), Keys line → Settings page, folders line
   (`collect/social/` no longer has a Meta API route; add `collect/lookups.js`, `collect/business.js`, `ai/models.js`).
4. **Commit and push** after 1–3.
5. **Final plain-language report to the owner** covering all 23 audit points (see plan-v3.md), with:
   - the two interpretations (Claude usage cost is measured, internal only; client logo in a box beside ours),
   - what could not be done and why (Google Search blocks automated browsers → Brave, labelled; LinkedIn Ad Library
     blocked; Instagram comment replies hidden from logged-out visitors → optional check; TikTok and Snap ad
     libraries are EU-only),
   - action items: restart the Control Center; add keys on Settings & keys (PageSpeed recommended; YouTube, Apify,
     Notion optional); in API-KEYS.txt the Instagram section (META_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID) is no
     longer used and can be deleted by the owner (Claude cannot read that file, by design).

## Rules that still apply (from CLAUDE.md and the owner)

- Code decides services, deliverables, timing and numbers; AI only researches, diagnoses and writes.
- Nothing reaches a client without approval; evidence before any problem; zero paid software.
- No Anthropic API key, no Agent SDK; headless `claude -p` only; never `--bare`; never Fable.
- Git identity local only; never hard-code the GitHub account; never commit `.env.local`, `API-KEYS.txt` or tokens;
  never print key values.
- `clients/technopanel` is the owner's own test run (untracked): do not touch or commit it.
- `catalog/reports/catalog-report.html` and `catalog/reports/last-pull.md` changes are not from this work: do not
  commit them.
