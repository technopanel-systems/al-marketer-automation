# Al-Marketer Proposal System

Turns a client's name + website + socials + meeting notes into a designed Arabic technical proposal (PDF + web file), following `REF/Al-Marketer_Proposal_System_Blueprint_V4_AR.pdf`. Full design: `docs/plan.md`. Research and sources: `docs/research.md`.

## Constitutional rules (never break)
1. **Deterministic code decides** which services/offerings are sold, which deliverables are included, and when each happens (weeks, dependencies), plus KPIs, names and numbers. **AI never makes these decisions** — AI only does research, diagnosis and Arabic writing, inside JSON schemas that code validates.
2. Nothing reaches a client without human approval (Gate 1 diagnosis, Gate 2 commercial scope, Gate 3 map & proposal). The system never sends anything.
3. Evidence before problem, problem before solution. Every fact cites saved evidence; code verifies quotes. Unknown stays unknown — never guess.
4. Read only from the approved catalog; invent no services or deliverables.
5. Zero new paid software. No Anthropic API key, no Agent SDK with the subscription, no paid SaaS/hosting. Free/open-source only.

## Catalog
- **Source of truth: `catalog/catalog.json`** (mirrored in `catalog/csv/*.csv`). The engine never reads Notion directly.
- Notion is only the editing surface: `npm run catalog:pull-notion` (official API, token in `.env.local`).
- `npm run catalog:export-csv` / `npm run catalog:import-csv` — edit CSVs or a Google Sheet export; import validates and refuses bad data.
- Stable IDs (`svc.*`, `off.*`, `del.*`) never change; Notion page IDs are just a column.
- Blueprint names win over Notion names (e.g. Performance Marketing, not Media Buying). Differences: `catalog/reports/catalog-report.html`.

## Rules data (`rules/`)
`problem-types.json` (problem type → what it justifies), `timing.json`, `kpis.json`, `impact-and-dependencies.json`, `blueprint-catalog.json`. Status "draft" until the owner approves.

## Conventions
- Node.js 24, ES modules, minimal dependencies. Windows: call scripts with `node`, not `npx`, in hooks/automation.
- UTF-8 everywhere; CSVs are written with a BOM (Excel + Arabic).
- Tests: `npm test` (`node --test`). Every deterministic rule gets a test.
- AI steps run as separate headless `claude -p --model <haiku|sonnet|opus> --output-format json --json-schema ...` calls. Never use `--bare` (it drops subscription login). Never use Fable (can bill usage credits).
- Arabic in HTML/PDF: no `letter-spacing` or `text-align: justify` on Arabic; isolate Latin names/numbers; wait for fonts before printing.

## Git / GitHub
- Git identity is set for this folder only (`git config --local`). Never change `--global` git config or touch other repositories.
- Private backup remote is `origin`. Do not hard-code any GitHub account or URL in code, config or docs.
- Never commit `.env.local` or any token.
