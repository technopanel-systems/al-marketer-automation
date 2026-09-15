# Al-Marketer Proposal System

Turns a new client's **name + website + socials + meeting notes** into a finished, designed **Arabic technical proposal** (16:9 PDF + one self-contained web file), following Al-Marketer's Blueprint V4 — with the team approving at 3 gates.

- **Start:** double-click **Al-Marketer Control Center** on the Desktop (or `Al-Marketer Control Center.cmd`). The app opens at http://localhost:4317. Everything runs on this PC.
- **How to use:** [docs/how-to-use.md](docs/how-to-use.md) (also under "How to use" in the app).
- **After a restart / how to test:** [HOW-TO-START-AND-TEST.txt](HOW-TO-START-AND-TEST.txt).
- **Design & decisions:** [docs/plan.md](docs/plan.md) · **Research & sources:** [docs/research.md](docs/research.md) · **Social media research:** [docs/research-social.md](docs/research-social.md) · **Audit:** [docs/audit.md](docs/audit.md)
- **Keys (all free and optional):** the **Settings & keys** page in the app — save, test, remove or import from `API-KEYS.txt`. Saved in `.env.local` on this PC, never committed, never shown again.

## The golden rule
Plain code decides **which services and deliverables are sold and when** (from `catalog/` and `rules/`). AI only **researches, diagnoses and writes Arabic** — inside JSON schemas, with every fact quoting saved evidence that the code verifies. Nothing reaches a client without human approval.

## How a proposal is made

Seven stages. Steps whose inputs are ready run at the same time (at most 2 Claude steps and 2 browsers at once); a person's task blocks only what depends on it, and the system continues by itself when the task is done. Full design: [docs/plan-v2.md](docs/plan-v2.md).

| Stage | Runs by itself | Needs a person |
|---|---|---|
| Brief | — | Name, website, socials, market, industry, known competitors, notes |
| Research | Website audit + meeting notes (Haiku; Sonnet for long reports) together; then client social profiles, competitor search (Sonnet + web search), research teams (Sonnet ×3), business signals and **ads, search & Maps checks** (Meta Ad Library, Brave Search, Google Maps, Google Ads Transparency Center, Facebook comment replies) side by side; then the business analyst (Sonnet) and the client record | Confirm competitors (while research continues) · important questions only if something is missing · optional checks never hold anything up |
| Competitors & social | Competitor profiles from public pages without login, scorecard → evidence checks | Only if a profile could not be read |
| Diagnosis | Diagnosis (Opus) → independent review (Sonnet); business needs and risks shown for the team only | **Approve diagnosis** |
| Scope & plan | Rule engine: services, deliverables, 12-week plan, KPIs, scope checks | **Approve scope** |
| Proposal | Arabic writing (Opus) → automated reviews + language review (Sonnet) and slide design at the same time; client logo beside the Al-Marketer logo; closing call-to-action slide | Changes by chat with the AI (Sonnet), the slide text editor or a full rewrite, each saved as a version · **Approve proposal** (after the fact check) |
| Delivery | Internal English strategy report (Opus), for the team only · what the proposal cost in Claude usage, measured per run | Send it yourself, mark as sent |

Any edit upstream marks later steps **out of date** and re-opens the approvals after it — an approval can never silently apply to changed content.

## Folders
- `app/` Control Center: `server.js` routes, `jobs.js` background work, `views/` stage pages, `ui/` components · `pipeline/` step graph, scheduler, gates, change tracking, CLI
- `collect/` website/social capture and checks, `collect/lookups.js` ads/search/Maps checks, `collect/business.js` business signals, `collect/social/` automatic captures (several routes per platform, yt-dlp, Apify free plan as the last try) and the research browser · `ai/` headless Claude Code runner, prompts, AI steps, `ai/models.js` the model, effort and fallback of each step
- `engine/` catalog, rule engine (scope, schedule, KPIs), checks, `engine/social/` scorecard metrics · `render/` slide design system and PDF/web renderer
- `catalog/` **source of truth** for services/offerings/deliverables (`catalog.json` + CSV) · `rules/` decision tables
- `clients/<client>/` one folder per client: intake, evidence, research, record, diagnosis, gates, plan, proposal, output, logs
- `REF/` Blueprint and the hand-made Hijab Store proposal · `samples/` design sample and test notes · `test/` automated tests

## Commands (for maintenance)
```
npm test                                   # 183 automated tests
npm run catalog:pull-notion                # Notion → local catalog (+ CSV)
npm run catalog:import-csv                 # edited CSVs → local catalog (validated)
node pipeline/cli.js list                  # status of every client
node pipeline/cli.js run <client>          # continue a client until the next gate / question
node render/cli.js sample samples/hijab-store --previews   # design test render
```

## Cost
Zero new paid software: Node.js, Playwright/Chromium, ajv, lucide icons, Noto Sans Arabic + Manrope (SIL OFL). Claude runs through the owner's Claude Max login via the official Claude Code CLI (no API key). Measured on a real run from a new proposal to the internal report (2026-09-15): about 28 minutes end to end, 15 Claude runs (Sonnet 11, Opus 4), $4.45 of equivalent API value on the Max plan (not a bill), shown per step on the Delivery page. A change asked in the chat takes seconds (one Sonnet run, about $0.09). Optional free keys (PageSpeed recommended; YouTube, Apify, Notion) on the Settings & keys page.
