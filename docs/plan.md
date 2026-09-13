# Plan — Al-Marketer Proposal Automation (Phase 2)

**User decisions received (2026-09-13):** yes to all recommendations **except** Q4 → use the **official Notion API from Sprint 0** (not the unofficial endpoint); Q7 → **exclude capability 0–1 services by default, user opts in**. Additions requested: time estimates per sprint; a **throwaway end-to-end run after Sprint 2 with fake research data**; a **private GitHub backup set up in Sprint 0**; mascot/logo from https://www.al-marketer.com/ until originals arrive. Second round: **the local saved catalog in the repo is the source of truth the engine reads; Notion is only the editing surface**, with a CSV export (and import) command so the catalog can be edited as CSV or moved to Google Sheets without a rebuild; **GitHub repo private under the user's Technopanel account for now** (to be migrated to a company account later — nothing may assume this account), git name/email set **for this project folder only**, no changes to global git config or any other repo. All reflected below.

## 1. What the system does (2-minute read)

You double-click **"Al-Marketer Control Center"** on your PC. A page opens in your browser (it runs only on your computer). You type the client's name, website, social links and market, paste your meeting notes, and press **Start**.

1. **Collect** — the system visits the website and public social pages and saves what it sees as *evidence*: page text, desktop + mobile screenshots, speed/SEO checks, which store platform they use (Zid, Salla, Shopify…). Every item gets an ID, link and date.
2. **Research** — three AI researchers (Business & Offers, Brand & Market, Channels) read that saved evidence (and search the web for more pages to capture) and fill the **Client Information Record**. Every fact carries a source, an exact quote and a confidence level. The system checks every quote really exists in the saved page. Anything important that is still unknown becomes a **question for you** — it never guesses.
3. **Diagnose** — a senior AI writes the problems (each with evidence and impact) and tags each one with a type from an approved list. A second, independent AI challenges every problem.
   **GATE 1 — you** confirm / send back / reject / edit each problem.
4. **Scope** — *plain code, no AI*: confirmed problem types → the matching services/offerings from your catalog, plus the 3 strategic services, plus exactly the deliverables your rules activate. Services with capability 0–1 (or no score) are left out unless you opt in.
   **GATE 2 — you** approve the commercial scope.
5. **Plan** — *plain code*: places every deliverable into the 12 weeks (week-1 order, dependencies, tracking only after execution) and picks KPIs for the approved scope only.
6. **Write & design** — AI writes the Arabic text for the 11 sections using only approved data; code builds the slides in Al-Marketer identity and runs the 4 automated reviews (content, scope, language, form).
   **GATE 3 — you** read the finished proposal in the browser. Approve → final **PDF + one web file**.

The system never sends anything to a client. You send it, then mark it "Sent".

## 2. Architecture — what runs where, and why

```
YOUR WINDOWS PC (everything local, nothing hosted)
│
├─ Control Center  (Node.js local web page, http://localhost)
│     status board (Blueprint's 11 statuses) · intake form · Gate 1/2/3 screens · "run next step"
│
├─ Engine  (plain Node.js — deterministic, unit-tested, no AI)
│     state machine · catalog sync + validation · scope resolver · scheduler · KPI picker
│     traceability + automated checks · slide renderer (HTML → PDF)
│
├─ Collectors  (Node.js + Playwright + Lighthouse)
│     rendered page text · screenshots · speed/SEO/accessibility · tech-stack · social link discovery
│
├─ AI runner  (Node.js) → runs the official `claude` CLI headless, one run per AI step:
│     claude -p --model <haiku|sonnet|opus> --output-format json --json-schema <schema>
│            --tools <only what the step needs> --permission-mode dontAsk
│     validates with ajv → 1 retry with the error → else stops and asks you
│     Fallback: the same steps can be run from an interactive Claude Code session (/run-step)
│
└─ clients/<client-slug>/   ← single source of truth: JSON + evidence + outputs (git history)

OUTSIDE: client websites (read) · Notion (editing surface only; pulled via official API into the local catalog)
         · Claude via your Max login · private GitHub repo (backup only)
```

**Catalog source of truth = the local files in the repo** (`catalog/catalog.json`, mirrored as CSV). The engine never reads Notion directly. Notion is where you edit; a pull command copies it into the local catalog. If Notion ever becomes paid or unavailable, you edit the CSV files (or a Google Sheet exported to CSV) and run the import command — no code changes. All catalog items use our own stable IDs (e.g. `del.brand_book_documentation`), with the Notion page ID kept only as an extra column, so moving away from Notion breaks nothing.

| Tool | Why this and not something else | Cost |
|---|---|---|
| Claude Code CLI (already installed, v2.1.270) | Only way to use Claude on the Max plan without an API key; headless mode gives per-step model choice + schema output | Included in Max |
| Node.js 24 (installed) | One language for engine, collectors, renderer, UI; best Windows support | Free |
| Playwright + Chromium (browsers already on this PC) | Same engine that made our reference PDFs; captures rendered pages | Free, Apache-2.0 |
| Lighthouse (+ optional PageSpeed API without key) | Industry-standard speed/SEO checks | Free, Apache-2.0 / free quota |
| ajv | JSON Schema validation of every AI output | Free, MIT |
| Noto Sans Arabic + Manrope | Fonts already used in our proposals | Free, SIL OFL |
| git (installed) | Version history of rules, catalog snapshots and every client folder | Free |
| Official Notion API (plain Node `fetch`, header `Notion-Version: 2026-03-11`, `POST /v1/data_sources/{id}/query`) — used only by the pull command | Supported, documented way to copy the 3 catalog databases into the local catalog; no SDK dependency to lag behind API versions (https://developers.notion.com/reference/query-a-data-source , https://developers.notion.com/guides/get-started/internal-connections [verified]) | Free on all Notion plans. Note: a Free-plan workspace hits the 1,000-block cap once a second member joins (per user; https://www.notion.com/pricing [not re-checked today]) — another reason Notion is only the editing surface |
| CSV files in the repo (`catalog/csv/*.csv`) | Plain-text copy of the catalog you can edit in Excel/Google Sheets; import validates it with the same checks as a Notion pull | Free |
| GitHub private repository + GitHub CLI (`gh`, installed via `winget`) | Off-machine backup; private repos are free. Created under your Technopanel account for now; nothing in code or docs refers to the account — only the git `origin` setting does, so moving to a company account later is a repo transfer or one `git remote set-url` | Free |
| **Not used**: Python, Docker, n8n, runtime MCP servers, hosting, paid APIs | Not needed; each adds setup, fragility or cost | — |

Why headless runs instead of subagents: subagent model selection is currently broken (A5-2), and one run per step keeps each context small, lets plain code own the order of steps, and makes each step retryable on its own.

## 3. Deterministic code vs AI, and the 3 gates

| # | Step | Done by | Output | Automatic check |
|---|---|---|---|---|
| 0 | Catalog: engine reads the **local catalog only**; `catalog:pull-notion` (Notion → local), `catalog:export-csv` (local → CSV), `catalog:import-csv` (CSV/Google Sheets → local) | Code | `catalog/catalog.json` + `catalog/csv/*.csv` + change & mismatch report | schema + validation on every pull/import; nothing replaces the local catalog unless it passes; diff shown and committed to git |
| 1 | Intake | You + code | `intake.json`, notes saved | required fields present |
| 2 | Evidence capture | Code | `evidence/` (text, screenshots, audits, tech) | each source ok / blocked / failed |
| 3 | Meeting-notes facts | AI (Haiku) | facts with quotes | quotes found in notes |
| 4 | Research × 3 teams (2 passes) | AI (Sonnet), parallel | `research/*.json` | Pass 1 reads saved evidence and may only *request* more URLs (WebSearch for discovery); **code** captures them; pass 2 reads the new files. AI never browses as evidence. Every fact cites evidence ID + quote found in saved text (after Arabic normalisation: diacritics, tatweel, alef/ya/ta-marbuta, digits); else "unknown" |
| 5 | Completeness + readiness | Code | missing-fields list → 1 targeted round → questions for you; readiness checklist per candidate offering (ad account, tracking pixel, site access, email list, product access) | required record fields |
| 5b | "Absence" checks | Code (+ you for manual ones) | `evidence/checks.json`: e.g. "no Meta pixel found on homepage", "Meta Ad Library: no active ads (checked by you)" with URL, time, screenshot | a problem based on something missing must cite a check |
| 6 | Language detect | Code | ar / en / unclear (unclear → you) | Arabic-letter ratio on site + bios |
| 7 | Diagnosis + impact + problem type + severity 1–3 | AI (Opus) | `diagnosis/problems.json` | schema; evidence IDs exist; type ∈ approved list (incl. `unmapped`); impact ∈ 10 categories |
| 8 | Independent review | AI (Sonnet, fresh context, sees only the claim + its evidence, not the diagnoser's reasoning) | Confirmed / Needs review / Rejected + reason | schema |
| **G1** | **Diagnosis review** | **You** (evidence quote shown next to each problem type) | `gates/gate1.json` | cannot pass with an unevidenced problem |
| 9 | Scope resolution | **Code** | `scope/recommendation.json` with trace | rules 04, 05, 13; capability + readiness flags |
| **G2** | **Commercial scope approval** | **You** (catalog dropdowns only; every addition must link to a confirmed problem or give a reason). Services with capability 0–1 or blank appear in a separate "needed but excluded" box: opt in, or the related problem is kept in the internal record but left out of the client proposal (so no problem ever appears without a solution) | `gates/gate2.json` | same rules re-run on your edits |
| 10 | Deliverables + schedule + KPIs | **Code** | `plan/deliverables.json`, `plan/schedule.json`, `plan/kpis.json` | rules 07–10, dependencies, nothing silently cut |
| 11 | Arabic writing (11 sections) | AI (Opus) | `proposal/content.json` — AI fills **only free-text slots**; service/deliverable names, the map, weeks, KPIs and numbers are inserted by code | schema; every block lists the IDs it is based on |
| 12 | 4 automated reviews | Code (+ Sonnet advisory language pass) | `proposal/review.json` | see §3a |
| 13 | Render | Code | slides HTML → PDF + web file | overflow, font size, element count |
| **G3** | **Map & proposal approval** | **You** | `gates/gate3.json`, final files | nothing is "approved" without G3 |

**AI never decides**: which services/offerings, which deliverables, dates/weeks, KPIs, names, or numbers. AI outputs are *proposals* inside strict schemas; code accepts, rejects, or asks you.

**Safety of AI steps**: AI steps get only `Read` (limited to the client's evidence folder) and, for research, `WebSearch` to discover URLs — no Bash, Write or browsing — and return data only through `--json-schema`. Scraped page text is wrapped as data, so instructions hidden in a website can't make the AI act. Prompts and schemas are passed as files/stdin (Windows command-line limits).

**No stale approvals**: every step output is hashed; editing a gate invalidates everything after it, and each proposal records the catalog + rules version it used.

**3a. Automated reviews (Blueprint p.52), as machine checks** — full assertion list in Appendix B5.
- Content: sections exactly 01–11 in order; §04 = G1-confirmed problems only, each with a verified quote, check, or your confirmation; each has an impact (§05) and solution (§06); no guarantee words (Arabic + English list); every number comes from evidence, the plan or you; §07 is directional (no numbers unless you entered them); no internal data leaks (confidence, capability, evidence IDs, Notion links); jargon (ROAS, CTR) explained on first use.
- Scope: strategic 3 always present; every other service/offering traces to a confirmed problem; names = catalog display names ("Media Buying" forbidden); full-service name shown only if all its offerings are selected; fixed deliverables complete; conditional ones justified; capability 0–1/blank items present only with your Gate 2 opt-in; schedule respects every dependency, week 1 = the 3 strategic deliverables in order, no optimisation in month 1, nothing beyond week 12 unless listed as "continues after month 3".
- Language: title 4–10 words, one intro sentence, ≤2 lines per card (measured after rendering), sentence length limit, script ratio matches proposal language; Sonnet advisory pass for dialect match and non-specialist clarity.
- Form: brand colours only, mascot on cover, 3–5 elements per slide, minimum font size, fonts loaded, no overflow (content never shrunk — overflow creates an extra slide), PDF pages = slides.

## 4. Models per AI step, and keeping usage low

| Step | Model | Why |
|---|---|---|
| Meeting-notes fact extraction | **Haiku 4.5** | Simple extraction; quote check catches errors; auto-escalates to Sonnet if validation fails twice |
| Research teams ×3, targeted follow-up research | **Sonnet 5** | Good reading/structuring at lower usage; mistakes are caught by quote verification and G1 |
| Independent problem reviewer | **Sonnet 5** (fresh context) | Independent second opinion; advisory only (you decide at G1) |
| Language review (advisory) | **Sonnet 5** | Checklist-style review |
| Diagnosis + impact + problem typing | **Opus 5** | Most costly mistake: a wrong problem drives the whole proposal |
| Final Arabic writing | **Opus 5** | Client-facing quality bar (Hijab level) |
| Fable | **never** | Can bill usage credits (A1) |

Usage controls: each step runs once and is saved (re-running a later step never repeats earlier ones) · AI reads cleaned, trimmed page text files, never raw HTML · each run gets only the tools and files it needs (`--tools`, no MCP, short system prompt) · max 1 retry · targeted research max 1 extra round · model names live in one config file · every run logs duration + the CLI's usage estimate (`total_cost_usd` is an estimate even on a subscription) so we measure real usage per proposal in Sprint 6.

## 5. MCP servers, skills, plugins — exact installs

**Runtime MCP servers: none.** Our own Node collectors are cheaper (save to disk instead of flooding context), deterministic, and avoid Windows `npx` issues (A2, A5).

One-time setup I run:
```powershell
cd C:\dev\al-marketer-automation
git init
git config user.name  "Technopanel"               # this project folder only (no --global)
git config user.email "jerom@technopanel.com.sa"   # this project folder only (no --global)
npm init -y
npm install playwright ajv ajv-formats lighthouse chrome-launcher
npx playwright install chromium
winget install --id GitHub.cli -e            # free GitHub command-line tool (not installed today; may show one Windows permission prompt)
gh auth login --web --hostname github.com --git-protocol https   # you approve a code in the browser, signed in as Technopanel
gh repo create al-marketer-automation --private --source . --remote origin --push
```
Guardrails for GitHub: no `--global` git settings are changed; I don't run `gh auth setup-git`; only this folder's repo is created/pushed; no other repository is read, changed or deleted. The account name appears only in the `origin` remote, never in code, config files or docs.
`.gitignore` keeps secrets (`.env.local`) and temporary files out of GitHub. Client folders are included in the private backup (screenshots saved compressed to keep the repo small).

Catalog commands (Sprint 0; later also buttons in the Control Center):
```powershell
npm run catalog:pull-notion   # Notion → validated local catalog (catalog/catalog.json) → auto-exports CSV → shows what changed
npm run catalog:export-csv    # local catalog → catalog/csv/services.csv, offerings.csv, deliverables.csv
npm run catalog:import-csv    # edited CSVs (or Google Sheets downloaded as CSV) → validated local catalog
```
CSV columns = our stable ID, English + Arabic names, display name, description, parent service/offering ID, fixed/conditional, stage type, dependencies, capability, and the Notion page ID (optional). Pulling from Notion updates only the Notion-owned columns and keeps our extra columns.

**The only 2 things you do by hand (Sprint 0, ~5 minutes total):**
1. **Notion connection** (per Notion's guide https://developers.notion.com/guides/get-started/internal-connections): Notion Developer portal → **Build → Internal connections → Create a new connection** (name "Al-Marketer Proposal System", your workspace) → **Content access → Edit access** → tick the Services, Offerings and Deliverables databases (read-only is enough) → **Configuration** tab → copy the **Installation access token** → double-click `setup-notion-token.cmd` in the project folder and paste it. The token never goes into chat or GitHub.
2. **GitHub sign-in**: when I start the login, approve the one-time code in your browser while signed in to your **Technopanel** GitHub account.

Project Claude Code configuration I create (files, not installs):
- `CLAUDE.md` (<150 lines): the constitutional rules, especially "AI never selects services, deliverables or timing".
- `.claude/settings.json`: allow `node` scripts in this project, deny deleting/outside-folder writes, no `bypassPermissions`.
- `.claude/skills/`: `new-client`, `run-step`, `client-status`, `sync-catalog` (invoked by name, also the fallback way to run the pipeline from chat).
- `.claude/agents/`: `researcher`, `diagnostician`, `reviewer`, `writer` (used only in fallback mode).
- Hook: `PostToolUse` on writes under `clients/**.json` → `node engine/validate.js` (blocks invalid JSON in fallback mode).

Optional later (not installed now):
- Chrome DevTools MCP for deeper performance traces: `claude mcp add chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@latest`
- Notion hosted MCP — only if we later write client status into Notion (exact URL to confirm then) [unverified].
- Plugins: none.

## 6. Data model — one client folder

```
clients/hijab-store/
  intake.json                 name, website, socials[], market/country, constraints[], language hint, created
  inputs/meeting-notes.md     your notes (+ any files/emails you drop in inputs/)
  status.json                 current status (received → research → needs-input → diagnosis-review →
                              scope-approval → deliverables-defined → map-review → ready-to-generate →
                              proposal-review → approved → sent), history, catalog + rules hash,
                              hash of each step output (gate edits invalidate later steps)
  evidence/
    sources.json              [{id:"E012", url, type:page|screenshot|audit|social|notes|human, fetchedAt, status:ok|blocked|failed, sha256}]
    pages/E012.txt            cleaned rendered text (what AI reads and quotes are checked against)
    shots/E012-desktop.png, E012-mobile.png
    audits/lighthouse-home.json, psi-home.json, tech.json   (platform: Zid/Salla/Shopify…, pixels: Meta/GA/TikTok)
    checks.json               "absence" checks: {id:"K03", question, method, url, at, screenshot, result, by:code|you}
  research/
    business.json  brand-market.json  channels.json
                              facts: [{field, value, evidence:["E012"], quote, confidence:high|medium|low|unknown}]
  record/
    client-record.json        merged Client Information Record (business, brand, digital presence, evidence index)
    open-questions.json       unknowns for you + your answers (saved as evidence type "human")
    readiness.json            per candidate offering: ad account, tracking pixel, site access, email list, budget → yes|no|unknown
  diagnosis/
    problems.json             [{id:"P1", statement, problemType, severity:1-3, evidence[], quotes[], checks[],
                                impact:[{category, chain}], reviewer:{verdict, reason}}]
  gates/
    gate1.json gate2.json gate3.json   decision per item, your edits, timestamp
  scope/
    recommendation.json       [{serviceOrOffering, level:service|offering, becauseProblems:["P1"], capability, flags[]}]
  plan/
    deliverables.json         [{deliverableId, name_ar, name_en, fixed|conditional, trace:{problem, offering, service}}]
    schedule.json             [{deliverableId, instance (monthly repeats), phase:P1|P2, week, slot, dependsOn[], rule}]
                              + afterMonth3[] (never silently cut)
    kpis.json                 [{kpi, forScope, deliverableId}]
  proposal/
    content.json              11 sections → blocks {text_ar, basedOn:[IDs]}
    review.json               4 automated reviews: pass/fail per check
  output/
    hijab-store-proposal-v1.pdf
    hijab-store-proposal-v1.html   (self-contained web version)
  logs/runs.jsonl             every AI run: step, model, duration, attempts, validation result, usage estimate
```
Project secrets: `.env.local` (NOTION_TOKEN; never committed). Shared (versioned) folders: `catalog/` (**source of truth**: `catalog.json` + `csv/services.csv`, `csv/offerings.csv`, `csv/deliverables.csv`, keyed by our stable IDs with Arabic names, display names, fixed/conditional, stage type, dependencies, naming fixes; Notion page IDs optional; `reports/` change + mismatch reports) · `rules/` (problem types → offerings, stage types, timing, dependencies, KPIs, impact categories, forbidden phrases) · `engine/` · `collect/` · `ai/prompts/` + `ai/schemas/` · `render/` (templates, fonts, mascot, logo) · `app/` (Control Center) · `test/`.

## 7. Build order — sprints and what you will SEE

Estimates are focused working days of my build time. Calendar time will be longer if Max usage limits pause work or while a sprint waits for your review (~30 min per sprint review).

| Sprint | Build | What you can see at the end | Estimate |
|---|---|---|---|
| 0 | Save docs; repo with project-only git identity + **private GitHub backup (Technopanel account)**; `setup-notion-token.cmd`; **local catalog as source of truth** with `catalog:pull-notion`, `catalog:export-csv`, `catalog:import-csv`; catalog validator; stable IDs + extra columns (Arabic names, fixed/conditional, stage type, dependencies); CLAUDE.md + `.claude/settings.json` | Your private GitHub repo; the catalog as CSV files you can open in Excel/Sheets; a page listing all 10 services / 7 offerings / 50 deliverables with Arabic names, a **mismatch report**, and the **3 one-page rule tables to approve** (problem types, timing, KPIs — drafts in Appendix B) | 1.5 days |
| 1 | Rule engine: scope resolver (incl. capability opt-in), scheduler (phases, slots, monthly repeats, "after month 3" list), dependencies, KPI picker, traceability, assertions S1–S14; unit tests on every Blueprint rule | Enter a few sample problems → see the **recommended scope, 3-month map and first-4-weeks plan** as a table, plus a green test report | 2 days |
| 2 | Slide design system (Hijab look, Al-Marketer identity; mascot/logo taken from al-marketer.com until you send originals), 11 section templates, PDF + web file renderer, overflow/form checks | A **PDF generated from data** that visually matches the Hijab proposal | 2.5 days |
| **2.5** | **Throwaway end-to-end dry run with fake research data**: hand-made fake Client Record + fake confirmed problems for a fictional client → rule engine → simple file-based Gate 2/3 approvals (no UI) → **one real headless `claude -p` Opus writing call with `--json-schema`** → render PDF + web file. Code lives in `spikes/` and is deleted afterwards; lessons go into `docs/plan.md` | A complete (fake) proposal PDF end-to-end, and early proof of the riskiest parts: subscription login in headless mode, schema output, Arabic writing quality, rendering | 1 day |
| 3 | Evidence collectors (page text, screenshots, Lighthouse/PSI, tech/platform detection, social links, absence checks) + Control Center v1 (intake + status board) | Type a real website → see its **evidence pack** (screenshots, speed, platform, pages) | 2 days |
| 4 | AI runner (validation, retry, usage log, auth-failure fallback) + 3 research teams (2 passes) + Arabic-normalised quote verification + completeness/readiness loop + questions for you | A **Client Information Record** with sources, confidence and "questions for you" | 2.5 days |
| 5 | Diagnosis (Opus) + independent reviewer + Gate 1 screen | Review and **approve problems in the browser** with evidence next to each | 1.5 days |
| 6 | Gate 2 screen (incl. "needed but excluded" opt-in box), Arabic writer (Opus), 4 automated reviews, Gate 3 screen, final export; usage measurement | **First end-to-end proposal** (Hijab Store re-run) — PDF + web file, and real usage per proposal | 2.5 days |
| 7 | Hardening: resume after failure, blocked-site handling, English-client path, fallback mode via Claude Code chat, 1-page "how to use" guide | Run 2–3 real clients without me | 2 days |
| | **Total** | | **≈ 17.5 working days** |

## 8. What from the Blueprint cannot be fully automated, and why
1. **Social media depth** (DM behaviour, insights, follower quality, "inquiries end in Instagram DMs") — needs account access or a human looking; platforms block scraping (A3). System captures what's public and generates a checklist for you.
2. **Client internal data** — sales, margins, stock, real product priorities. Blueprint p.60: commercial priority is a sensitive human decision.
3. **Business readiness / operations** (entity, importer, payment, shipping — like Hijab week 1) — not in the catalog, so rules forbid proposing it; can only appear as "known constraints" you enter.
4. **Pilot / Go-No-Go proposals** (Hijab style) — break rule 08 (fixed week 1) and rule 13 (catalog only).
5. **The 3 gate decisions** — human by design (rule 11).
6. **"Unclear language" clients** — escalated to you (rule 15).
7. **Competitor choice in niche markets** — AI suggests with evidence; you confirm.
8. **Subjective visual judgement** (e.g. "brand appearance inconsistent") — AI can describe screenshots, but it enters as "needs review" until you confirm.
9. **Meta Ad Library / Google Business Profile details** — no free API path; manual look-up checklist.
10. **Pricing and commercial terms** — not in the 11 sections.
11. **Post-contract live Notion dashboards** — a separate operations system (Blueprint p.9).
12. **Layer-2 technical spec** (Blueprint p.56 says it is not written yet) — this plan fills it; rule tables need your one-time approval (§9 Q5, Q6).

## 9. Decisions (answered by you on 2026-09-13: yes to all, except Q4 and Q7 as changed below)

1. **When the Blueprint and the Hijab proposal disagree, which wins?** → ✅ Blueprint decides content and structure (11 sections, fixed week 1, catalog only); Hijab is the bar for look, tone and density.
2. **Arabic style?** → ✅ Egyptian business Arabic like both your documents by default; you can switch a client to Saudi-friendly or simple formal Arabic at Gate 1.
3. **"الدعاية الممولة (Media Buying)" in Notion vs "تسويق الأداء (Performance Marketing)" in the Blueprint?** → ✅ Proposals use the Blueprint name. I'll give you a short list of all catalog mismatches to fix in Notion when convenient.
4. **Where does the catalog come from?** → ✅ **(changed by you)** The **local catalog in the repo is the source of truth** the engine reads. Notion is only the editing surface, pulled with the official Notion API (read-only connection you create once, §5). `catalog:export-csv` / `catalog:import-csv` let you edit CSVs or move to Google Sheets with no rebuild. Notion API is free on all plans; a Free workspace hits a 1,000-block cap if a second member joins. The unofficial public endpoint is not used.
5. **Service-selection rule table?** → ✅ I draft a one-page list of ~25 "problem types", each linked to the offering/service it justifies (draft in Appendix B3). You approve it once; after that code does the matching — AI only tags problems and you confirm tags at Gate 1. A service's full name (e.g. "Website Management") is used only when all its offerings are needed; otherwise only the offering name (e.g. "SEO").
6. **Timing table?** → ✅ I draft default week placements per deliverable type (draft in Appendix B2: research & plans week 2, execution from week 3, dashboards only after execution starts, website build weeks 3–7, optimisation reports from month 2). You approve once; code schedules from it.
7. **Services with low capability scores?** → ✅ **(changed by you)** Capability 0–1 (Influencer 0, Automation 0, Email 1) are **excluded by default**; Gate 2 lists them as "needed but excluded" and you opt in. If you don't, the related problem stays in the internal record but is left out of the client proposal. Blank score (Media Production today) is treated the same until filled in Notion. Capability 2+ (e.g. Ads = 2) is included normally.
8. **Prices in the proposal?** → ✅ No prices (not part of the 11 sections); pricing stays a separate step.
9. **Format?** → ✅ 16:9 slides like the Hijab proposal; PDF + one web file you can send; no public link in v1 (confidential). Optional later: free password-protected link.
10. **How will you use it?** → ✅ A page in your browser opened by double-clicking one icon, with buttons and the 3 approval screens. Claude Code chat works as a backup.
11. **Pilot / Go-No-Go proposals like Hijab?** → ✅ Not automated in v1; stay manual until the Blueprint defines them as an approved proposal type.
12. **First test client?** → ✅ Re-run Hijab Store end-to-end so we can compare with your hand-made version. Mascot and logo come from https://www.al-marketer.com/ (fallback: the Blueprint PDF) until you send original files.
13. **A chosen service has deliverables that don't fit inside 3 months (e.g. website built in month 3, its dashboard later)?** → ✅ Never cut them and never cram them: show them under "continues after month 3" in the map, and flag it at Gate 2.
14. **How many extra (non-strategic) services can start in month 1?** → ✅ At most 2 (ranked by how serious their problems are); any others start in month 2. You can change this number any time.

## 10. Risks and what I'll do about each
| Risk | Mitigation |
|---|---|
| Hit Max usage limits mid-proposal | Saved step-by-step, resumes where it stopped; Sonnet by default, Opus only for 2 steps; usage measured per proposal in Sprint 6 |
| Future Claude Code makes `-p` API-key-only (`--bare` default) | Runner detects auth failure and switches to fallback mode (same steps from a Claude Code chat session); version noted in each run log |
| Anthropic tightens scripted use of subscriptions | Same fallback mode; usage stays individual-scale (one operator, a few proposals/week) |
| AI invents facts, quotes, URLs or numbers | Evidence saved by code; every fact needs evidence ID + exact quote verified by code; unverifiable → "unknown"; numbers in text must exist in approved data; G1 |
| AI output in the wrong shape | `--json-schema` + ajv + 1 retry → stop and show you the error |
| Subagent model bug burns Opus quota | No subagents in the main pipeline; one headless run per step with explicit model |
| Websites block the browser / social login walls | Mark source "blocked", use PageSpeed API, add item to your manual checklist; never guess |
| Arabic rendering bugs (fonts, bidi, overflow, letter joining) | Fixed CSS rules (no letter-spacing/justify on Arabic, isolated Latin/numbers, fonts-ready wait) + automatic overflow/size checks + visual comparison with the Hijab reference |
| Notion token revoked/expired, or Notion changes its API version | Engine never depends on Notion (reads local catalog); pinned `Notion-Version` header; pull shows a clear warning and the 1-step fix |
| Notion becomes paid, hits the 1,000-block cap (second member on Free plan), or is dropped | Edit `catalog/csv/*.csv` or a Google Sheet → `catalog:import-csv`; stable IDs don't depend on Notion |
| Client data in the GitHub backup | Private repo only; secrets excluded by `.gitignore`; you control the account |
| Moving the repo to a company GitHub account later | Nothing references the Technopanel account except the `origin` remote; project-only git identity; migration = GitHub repo transfer or `git remote set-url origin <new>` |
| Catalog and Blueprint disagree | Overlay file + mismatch report; the Blueprint wins (Q1/Q3) |
| Rules change later (new services, new timing) | All rules in versioned tables, not code; each proposal records which rules version it used |
| Windows quirks (npx, paths, Arabic filenames) | Node-only scripts called with `node`, ASCII client folder names, UTF-8 everywhere |
| No sandbox on Windows | AI runs get only needed tools, work inside the client folder, `dontAsk` mode, deny rules |
| Arabic tone drifts from Hijab quality | Style guide + Hijab excerpts as examples + language checks + G3 |
| Confidential client data | Everything runs on your PC; no public hosting; the only copy elsewhere is your private GitHub backup |
| AI forces a problem into a type that "sells" a service | `unmapped` type allowed; evidence quote shown next to each type at G1; reviewer checks the fit |
| Instructions hidden inside scraped web pages (prompt injection) | AI steps can only read files and return schema data — no Bash, Write or browsing |
| An approval goes stale after a later edit | Hash chain: editing a gate invalidates everything after it |
| Problems based on something *missing* can't be quoted | Code-made "absence checks" (what was checked, where, when, screenshot) |

## Verification (how we prove it works)
- Sprint 0: `catalog:pull-notion` returns 10 / 7 / 50 rows matching the earlier read; `catalog:export-csv` → `catalog:import-csv` round-trip produces an identical `catalog.json`; a deliberately broken CSV is rejected and the local catalog stays unchanged; `git config --local` shows the project identity and `git config --global` is unchanged; `git push` to the private repo succeeds and `.env.local` is absent from GitHub; `grep` finds no account name outside `.git/config`.
- Sprint 2.5: throwaway fake-data run produces a PDF + web file through a real headless Opus call with schema output (proves subscription login in `-p` mode).
- `node --test` unit tests for every deterministic rule (rules 04, 05, 07, 08, 09, 10, 12, 13 and dependencies) with fixed sample clients; tests must fail if any rule is broken.
- Golden test: Hijab Store fixture → generated `schedule.json` / `kpis.json` compared with expected files.
- Render test: generate PDF, check page size 1200×675pt, fonts embedded (Noto Sans Arabic, Manrope), zero overflow, screenshot comparison against reference slides.
- Evidence test: every quote in research/diagnosis files is found in `evidence/pages/*.txt`.
- End-to-end: Hijab Store run through all 3 gates in the Control Center → PDF + web file; compare side-by-side with the hand-made version; record usage from `logs/runs.jsonl`.

## Appendix B — Draft engine rules (approach approved via Q5, Q6, Q13, Q14; the detailed tables are shown to you for one-time sign-off in Sprint 0)

**B1. Scope resolution (pure function, tested)**
1. Always add the 3 strategic services (Portfolio, Brand, Marketing). Each shows the problems linked to it, or the approved fixed reason "mandatory foundation" (satisfies rule 12).
2. For each G1-confirmed problem: add the offering/service its type justifies (B3). `unmapped` adds nothing and is shown to you.
3. Score each non-strategic target = sum of its problems' severity. Capability 0/1/blank → **excluded by default** (listed as "needed but excluded"; included only if you opt in at G2; otherwise its problems are dropped from the client proposal but kept internally). Readiness unknown → question for you. Not ready → starts in month 2.
4. Model-A services: all offerings justified → service name; otherwise offering names only.
5. Deliverables = all fixed deliverables of each target + conditional ones only when a linked problem type requires them (Loyalty Journey needs `low_repeat_engagement`, `no_post_purchase_journey` or `negative_experience_signals`, backed by client data or review quotes — a website crawl can't prove it).
6. A dependency on something not in scope → note/question, never auto-added.
7. Rank ready targets (score, highest severity, catalog order); top K (Q14, default 2) start in phase P1 (month 1), the rest in P2 (month 2).
8. Any G2 edit re-runs steps 4–7; overrides saved with your reason.
"Tracking setup" is not a catalog deliverable → treated as a client-readiness prerequisite (pixel/analytics detected or confirmed) before ads execution.

**B2. Stage types and default week placement** (M1 = W1–4, M2 = W5–8, M3 = W9–12; slots order work inside a week)

| Stage | Deliverables | Phase P1 | Phase P2 |
|---|---|---|---|
| strategic | Portfolio Master Sheet (slot 1) → Brand Book (slot 2) → Strategy Map (slot 3) | W1 only, nothing else in W1 | — |
| strategic (conditional) | Loyalty Journey Transformation | W5–6 | — |
| research | all Research & Analysis Reports | W2 slot 1 | W5 slot 1 |
| plan | Plans, Website Roadmap, Production Plan, Response Playbook | W2 slot 2 | W5 slot 2 |
| execution (repeats monthly where recurring) | Campaign Execution, Content Production, Media Preparation, SEO Implementation, Implemented Workflows, Final Media Asset Batch | W3–W4, then each month | W6–8, then each month |
| monitoring | Monitoring Dashboards | W4 | W8 |
| optimisation | Optimisation Reports | W8, W12 (never month 1) | W12 |
| report | Community Insights Report, Influencer Campaign Performance Report | W8, W12 | W12 |

Overrides: Website Building = one build W3–W7, dashboard W8, optimisation W12 (P2: W6–W10, W11, W12). SEO first optimisation report W12. Media Production asset batch W3, before content/ads that use it. Influencer = P2 by default, execution ≥ W6, performance report ≥ 2 weeks after execution. Automation workflows ≥ W4 and after email execution if email is selected. Ads execution blocked until readiness has tracking + ad-account access.
Scheduler: build dependency graph (Portfolio → Brand Book → Strategy Map → every plan; Brand Book → all visual execution; within each offering research → plan → execution → monitoring → optimisation) → place in dependency order at max(default week, predecessor + lag) → if a week exceeds execution capacity, move lowest-ranked target to P2 once, else ask you → anything past W12 goes to "continues after month 3" (Q13) → output month map (§08) and first-4-weeks plan (§09).

**B3. Problem types (draft) → what each justifies**
`offer_structure_unclear`, `pricing_inconsistent`, `no_hero_offer` → Product Portfolio Mgmt · `brand_identity_inconsistent`, `value_proposition_unclear` → Brand Mgmt · `low_repeat_engagement`, `no_post_purchase_journey`, `negative_experience_signals` → Loyalty Journey Transformation (conditional; last one also Community Management) · `no_marketing_strategy`, `channel_mix_misaligned` → Marketing Mgmt · `social_irregular`, `content_low_quality` → Content Calendar Production · `insufficient_visual_assets` → Media Production · `community_unmanaged` → Community Management · `website_missing_or_broken`, `weak_conversion_path` → Website Building · `low_search_visibility` → SEO · `paid_search_gap` → Google Ads · `paid_meta_gap` → Meta Ads · `paid_tiktok_gap` → TikTok Ads · `no_owned_audience_nurture` → Email Marketing · `manual_lead_follow_up` → Marketing Automation · `low_third_party_reach` → Influencer Marketing · `measurement_missing` → nothing (readiness blocker only) · `unmapped` → nothing (shown to you).

**B4. KPI library (draft; each KPI shows only if its scope is approved, from its dashboard week, with data source + access needed)**
Portfolio: % offers with price/tier/segment defined · Brand: % audited touchpoints matching Brand Book · Marketing: % channel plans traced to Strategy Map · Loyalty: repeat purchase & retention (client data only) · Content Calendar: posts published vs planned, reach, engagement rate, follower growth · Community: response rate, median response time, sentiment ratio · Website: sessions, conversion rate (form/checkout/WhatsApp), engagement, mobile Core Web Vitals · SEO: organic clicks & impressions, average position (approved keywords), indexed pages · Google/Meta/TikTok Ads: impressions, CTR, CPC, cost per lead, cost per conversion, conversion rate, ROAS only if purchase value is tracked · Email: delivery, click, unsubscribe rates, list growth · Automation: workflows live vs plan, contacts enrolled, workflow conversion, lead response time · Influencer: content delivered vs plan, reach, engagement, code/UTM conversions · Media Production: assets delivered vs plan, on-time rate, first-round approval rate.

**B5. Automated assertions**
Scope: S1 strategic 3 present · S2 every other target traces to a confirmed problem · S3 every deliverable exists in the catalog snapshot used · S4 fixed deliverables complete, no orphan deliverables · S5 service name ⟺ all offerings selected · S6 conditional ⟹ justifying problem type · S7 capability 0/1/blank in scope ⟹ your G2 opt-in exists; problems whose only solution was not opted in are absent from the client proposal · S8 every confirmed problem has verified quote, check, or your confirmation · S9 W1 = the 3 strategic deliverables in order, only · S10 every dependency respected · S11 no optimisation in month 1; dashboard after first execution; P1 research/plans in W2 · S12 map = scope deliverables, max week 12 (+ explicit after-month-3 list) · S13 KPIs only from library, in-scope, from dashboard week · S14 G2 hash = plan input hash; G3 hash = final PDF hash.
Content: C1 sections 01–11 in order · C2 §04 = confirmed problems · C3 each has §05 impact + §06 solution · C4 only in-scope display names; forbidden names absent · C5 no guarantee words · C6 numbers only from evidence/plan/you; none in §07 unless you entered them · C7 facts in §02/§03 resolve to evidence · C8 script ratio matches language · C9 no internal leaks · C10 jargon explained · C11 no overflow, fonts loaded, PDF pages = slides.
