# Al-Marketer Proposal System

Turns a new client's **name + website + socials + meeting notes** into a finished, designed **Arabic technical proposal** (16:9 PDF + one self-contained web file), following Al-Marketer's Blueprint V4 — with the team approving at 3 gates.

- **Start:** double-click **Al-Marketer Control Center** on the Desktop (or `Al-Marketer Control Center.cmd`). The app opens at http://localhost:4317. Everything runs on this PC.
- **How to use:** [docs/how-to-use.md](docs/how-to-use.md) (also under "How to use" in the app).
- **After a restart / how to test:** [HOW-TO-START-AND-TEST.txt](HOW-TO-START-AND-TEST.txt).
- **Design & decisions:** [docs/plan.md](docs/plan.md) · **Research & sources:** [docs/research.md](docs/research.md) · **Social media research:** [docs/research-social.md](docs/research-social.md) · **Audit:** [docs/audit.md](docs/audit.md)
- **Keys:** `API-KEYS.txt` (stays on this PC, never committed) → `apply-api-keys.cmd`.

## The golden rule
Plain code decides **which services and deliverables are sold and when** (from `catalog/` and `rules/`). AI only **researches, diagnoses and writes Arabic** — inside JSON schemas, with every fact quoting saved evidence that the code verifies. Nothing reaches a client without human approval.

## How a proposal is made

Seven stages. Steps whose inputs are ready run at the same time (at most 2 Claude steps and 2 browsers at once); a person's task blocks only what depends on it, and the system continues by itself when the task is done. Full design: [docs/plan-v2.md](docs/plan-v2.md).

| Stage | Runs by itself | Needs a person |
|---|---|---|
| Brief | — | Name, website, socials, market, industry, known competitors, notes |
| Research | Website audit + meeting notes (Haiku) together; then client social profiles, competitor search (Sonnet + web search) and research teams (Sonnet ×3) side by side; then the client record | Confirm competitors (while research continues) · important questions only if something is missing |
| Competitors & social | Competitor profiles from public pages without login, scorecard → evidence checks | Only if a profile could not be read |
| Diagnosis | Diagnosis (Opus) → independent review (Sonnet) | **Approve diagnosis** |
| Scope & plan | Rule engine: services, deliverables, 12-week plan, KPIs, scope checks | **Approve scope** |
| Proposal | Arabic writing (Opus) → automated reviews + language review (Sonnet) and slide design at the same time; code-built executive summary, website audit, digital presence and next steps | **Approve proposal** (after the fact check) |
| Delivery | — | Send it yourself, mark as sent |

Any edit upstream marks later steps **out of date** and re-opens the approvals after it — an approval can never silently apply to changed content.

## Folders
- `app/` Control Center: `server.js` routes, `jobs.js` background work, `views/` stage pages, `ui/` components · `pipeline/` step graph, scheduler, gates, change tracking, CLI
- `collect/` website/social capture and checks, `collect/social/` automatic captures (yt-dlp, Meta API) and the research browser · `ai/` headless Claude Code runner, prompts, AI steps
- `engine/` catalog, rule engine (scope, schedule, KPIs), checks, `engine/social/` scorecard metrics · `render/` slide design system and PDF/web renderer
- `catalog/` **source of truth** for services/offerings/deliverables (`catalog.json` + CSV) · `rules/` decision tables
- `clients/<client>/` one folder per client: intake, evidence, research, record, diagnosis, gates, plan, proposal, output, logs
- `REF/` Blueprint and the hand-made Hijab Store proposal · `samples/` design sample and test notes · `test/` automated tests

## Commands (for maintenance)
```
npm test                                   # 135 automated tests
npm run catalog:pull-notion                # Notion → local catalog (+ CSV)
npm run catalog:import-csv                 # edited CSVs → local catalog (validated)
node pipeline/cli.js list                  # status of every client
node pipeline/cli.js run <client>          # continue a client until the next gate / question
node render/cli.js sample samples/hijab-store --previews   # design test render
```

## Cost
Zero new paid software: Node.js, Playwright/Chromium, ajv, lucide icons, Noto Sans Arabic + Manrope (SIL OFL). Claude runs through the owner's Claude Max login via the official Claude Code CLI (no API key). Measured on two real runs: 9–12 Claude calls per proposal (Haiku 1, Sonnet 5–6, Opus 2), 10–15 minutes of Claude time end to end; each "Ask for changes" round adds 2 calls (~3 minutes). Optional free Google PageSpeed key: `setup-pagespeed-key.cmd`.
