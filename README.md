# Al-Marketer Proposal System

Turns a new client's **name + website + socials + meeting notes** into a finished, designed **Arabic technical proposal** (16:9 PDF + one self-contained web file), following Al-Marketer's Blueprint V4 — with the team approving at 3 gates.

- **Start:** double-click **Al-Marketer Control Center** on the Desktop (or `Al-Marketer Control Center.cmd`). The app opens at http://localhost:4317. Everything runs on this PC.
- **How to use:** [docs/how-to-use.md](docs/how-to-use.md) (also under "How to use" in the app).
- **Design & decisions:** [docs/plan.md](docs/plan.md) · **Research & sources:** [docs/research.md](docs/research.md)

## The golden rule
Plain code decides **which services and deliverables are sold and when** (from `catalog/` and `rules/`). AI only **researches, diagnoses and writes Arabic** — inside JSON schemas, with every fact quoting saved evidence that the code verifies. Nothing reaches a client without human approval.

## How a proposal is made

| # | Step | Who |
|---|---|---|
| 1 | Collect website & social evidence (text, screenshots, SEO, speed, platform, pixels, social profiles) | code (Playwright) |
| 2 | Read meeting notes | Claude Haiku |
| 3 | Research — Business & Offers, Brand & Market, Channels (can request more pages) | Claude Sonnet ×3 |
| 4 | Client Information Record, readiness, questions for the team | code |
| 5 | Diagnosis (problem types from the approved list) | Claude Opus |
| 6 | Independent review of each problem | Claude Sonnet |
| G1 | **Gate 1 — diagnosis** (confirm / edit / reject / add) | team |
| 7 | Scope, deliverables, 12-week plan, KPIs + 12 scope checks | code (rule engine) |
| G2 | **Gate 2 — commercial scope** (opt-in low-capability services, remove, add, month 1/2) | team |
| 8 | Write the 11 sections in Arabic | Claude Opus |
| 9 | Automated reviews (coverage, names, guarantees, numbers, evidence, language) + language review | code + Claude Sonnet |
| 10 | Design the slides — PDF + web, overflow checks | code (Chromium) |
| G3 | **Gate 3 — map & proposal** (revise with notes, edit text, approve → versioned files) | team |
| — | Mark as sent (the system never sends anything) | team |

Any edit upstream marks later steps **stale** and re-opens the gates after it — an approval can never silently apply to changed content.

## Folders
- `app/` Control Center (local web app) · `pipeline/` steps, gates, change tracking, CLI
- `collect/` website/social capture and checks · `ai/` headless Claude Code runner, prompts, AI steps
- `engine/` catalog, rule engine (scope, schedule, KPIs), checks · `render/` slide design system and PDF/web renderer
- `catalog/` **source of truth** for services/offerings/deliverables (`catalog.json` + CSV) · `rules/` decision tables
- `clients/<client>/` one folder per client: intake, evidence, research, record, diagnosis, gates, plan, proposal, output, logs
- `REF/` Blueprint and the hand-made Hijab Store proposal · `samples/` design sample and test notes · `test/` automated tests

## Commands (for maintenance)
```
npm test                                   # 79 automated tests
npm run catalog:pull-notion                # Notion → local catalog (+ CSV)
npm run catalog:import-csv                 # edited CSVs → local catalog (validated)
node pipeline/cli.js list                  # status of every client
node pipeline/cli.js run <client>          # continue a client until the next gate / question
node render/cli.js sample samples/hijab-store --previews   # design test render
```

## Cost
Zero new paid software: Node.js, Playwright/Chromium, ajv, lucide icons, Noto Sans Arabic + Manrope (SIL OFL). Claude runs through the owner's Claude Max login via the official Claude Code CLI (no API key). Measured on two real runs: 9–12 Claude calls per proposal (Haiku 1, Sonnet 5–6, Opus 2), 10–15 minutes of Claude time end to end; each "Ask for changes" round adds 2 calls (~3 minutes). Optional free Google PageSpeed key: `setup-pagespeed-key.cmd`.
