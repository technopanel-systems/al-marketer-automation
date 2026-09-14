# Skills / Plugins / MCP servers — fit audit for al-marketer-automation

Retrieval date for every source below: **2026-09-14**, unless a different date is quoted inline. Repo metadata (`pushed_at`, license, star count, archived flag) pulled live via `api.github.com` on 2026-09-14.

System constraints this audit judges against (from CLAUDE.md / task brief): Windows, Node 24 ESM, zero paid software, no Anthropic API key / Agent SDK, headless `claude -p --output-format json --json-schema` calls only, deterministic rule engine must stay non-AI, ajv schema validation + quote verification already built, official Notion REST API sync already built (Notion is a one-way *editing surface* — humans edit in Notion, `catalog:pull-notion` pulls down; there is no requirement to push local edits back up), from-scratch HTML→Chromium PDF renderer for 16:9 Arabic RTL decks (built specifically because Chart.js/ECharts had RTL bugs).

**Bottom line: 0 of 12 reviewed candidates are worth adopting.** Every one either doesn't fit a hard constraint (paid/hosted-only, OAuth-only, wrong runtime paradigm), duplicates something already built and tested, or is stale/unmaintained relative to what's already in place. Details below.

---

## 1. Official Claude plugin marketplace (`anthropics/claude-plugins-official`)

- Repo: https://github.com/anthropics/claude-plugins-official — `pushed_at: 2026-09-13`, license Apache-2.0. Actively maintained (101+ plugins as of the search snapshot).
- Full `.claude-plugin/marketplace.json` fetched directly via the GitHub Contents API (175 KB, ~4000 lines) and grepped for `notion`, `pdf`, `doc|deck|slide|presentation`, `schema`, `structured`, `rule.?engine`, `headless`, `orchestrat`.

**Findings:**

| Plugin | What it is | Verdict |
|---|---|---|
| `notion` (wraps `makenotion/claude-code-notion-plugin`) | Bundles Notion Skills + hosted Notion MCP server + slash commands for interactive Claude Code sessions. | **Not worth it.** Requires the hosted `mcp.notion.com` OAuth flow (browser consent) — doesn't fit a headless `claude -p` scripted pipeline at all; this is built for an interactive coding session, not a CI-style automation. It also only *adds* write-back and richer page tools, and the project's Notion integration is deliberately one-directional (Notion is the human editing surface; code only pulls). See §3a for the standalone MCP server, which is the same underlying tool. Repo `makenotion/claude-code-notion-plugin`: `pushed_at 2026-01-22` (8 months stale relative to today), 480 stars, **no LICENSE file found** (404 on `/license`) — so it's all-rights-reserved by default, an extra reason not to vendor it.
| `carbone-skill` | Templating reference for Carbone (DOCX/XLSX/PPTX/ODT/HTML/MD/PDF templating engine). | **Not worth it.** Carbone itself is a template-fill engine (LibreOffice-based conversion under the hood for some formats) aimed at filling existing Office templates, not building a from-scratch 16:9 Arabic RTL HTML→Chromium slide deck. Wrong tool shape; would replace zero existing code and add a new runtime dependency (Carbone requires its own conversion service for some formats). No genuine fit.
| `atomic-agents` | Schema-design/architecture-planning agent workflow for the Atomic Agents Python framework. | **Not worth it.** Targets building new agents with a Python framework; the project's own ajv-based JSON-schema validation + quote verification already does the "structured output" job in ~a few hundred lines of Node, in the exact language/runtime already used. Adopting a Python agent framework would violate the "minimal dependencies" convention for no gain.
| `airtable`, `box`, and other "structured data" plugins | Third-party SaaS connectors (Airtable, Box, etc.), each bundling a hosted MCP server. | **Not worth it.** All require a paid or hosted third-party service account — directly conflicts with "zero new paid software."

**No plugin in the marketplace targets**: headless/batch orchestration of `claude -p`, from-scratch PDF/slide generation, or a business-rules engine. Searched literally for `headless` and `orchestrat` in the full marketplace JSON — the only "orchestrat" hits are for unrelated finance/GraphQL/data-pipeline plugins (Airwallex, GCP data plugin), none about running Claude headlessly.

Source: https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json (fetched via GitHub Contents API, 2026-09-14); https://code.claude.com/docs/en/discover-plugins (2026-09-14).

---

## 2. `github.com/anthropics/skills`

- Repo: https://github.com/anthropics/skills — `pushed_at: 2026-09-10`. Top-level repo license shows `NOASSERTION` (mixed licensing per-skill, not a single blanket license).
- `pdf` skill: last commit touching `skills/pdf` was `2026-02-06` (per `GET /repos/anthropics/skills/commits?path=skills/pdf`). Its `SKILL.md` frontmatter states plainly: `license: Proprietary. LICENSE.txt has complete terms`. This **confirms the project's prior research is still correct**: the document-authoring skills (`docx`, `pdf`, `pptx`, `xlsx`) are source-available, not open source, and the LICENSE.txt (per Anthropic's own repo README) "prohibits derivative works and third-party distribution" and is offered "for demonstration and educational purposes only."
- Technical approach confirmed by reading `skills/pdf/SKILL.md` directly: it's a **Python** guide built on `pypdf` (merge/split/rotate/extract/forms/encrypt) plus a separate `FORMS.md`/`REFERENCE.md` for advanced/JS options. This is a **PDF-manipulation toolkit** (edit/merge/split existing PDFs, fill forms, OCR) — it has nothing to do with *generating* a styled, paginated, RTL, custom-font slide deck from HTML. Even if the license permitted reuse, the technique doesn't transfer: the project's renderer already solves the actual hard problem (HTML/CSS layout → Chromium print-to-PDF with Arabic shaping, font loading, and RTL-safe typography), which is an entirely different technical path from "programmatically splice PDF page objects with pypdf."
- No skill in the repo targets Notion, evidence-citation/quote-verification workflows, or RTL typography — nothing else in this repo is relevant to the project.

**Verdict: not worth adopting.** License terms alone rule out reuse (proprietary, no derivatives, no redistribution), and even ignoring the license, the pdf/pptx/docx/xlsx skills solve a different problem (post-processing existing office documents) than what the project already built (from-scratch Arabic RTL HTML slide rendering).

Sources: https://github.com/anthropics/skills (repo root, 2026-09-14); https://api.github.com/repos/anthropics/skills/commits?path=skills/pdf (2026-09-14); raw `SKILL.md` frontmatter fetched 2026-09-14 confirms `license: Proprietary`.

---

## 3. GitHub — current (2026) MCP servers and libraries

### 3a. Notion MCP server (official)

- `makenotion/notion-mcp-server` — https://github.com/makenotion/notion-mcp-server — `pushed_at: 2026-09-13`, **MIT license**, 4,632 stars, not archived. Actively developed.
- Two things exist under the "Notion MCP" name:
  1. **Hosted remote MCP** at `mcp.notion.com/mcp` — OAuth-only, no local process. The repo's own README (fetched 2026-09-14) says outright: *"We are prioritizing, and only providing active support for, Notion MCP (remote)... We may sunset this local MCP server repository in the future. Issues and pull requests here are not actively monitored."*
  2. **This self-hosted local server** (npm/Docker) — the one that's MIT-licensed and could theoretically be scripted headlessly, but Anthropic's own README flags it as being phased out in favor of the OAuth-only hosted one.
- New capability found: a **Markdown page API** — `retrieve-page-markdown` / `update-page-markdown`, which map to genuinely new Notion REST endpoints (`GET`/`PATCH /v1/pages/{page_id}/markdown`, API version `2026-03-11`). These convert a full page to/from Markdown in one call instead of paging through the block-children endpoint (which is capped at 100 items per request and requires cursor pagination for large pages) — a real, concrete improvement over the old block-JSON dance for *large free-text pages*.
- **Why it's still not worth adopting here:**
  - The markdown convenience is a **REST API endpoint**, not something exclusive to the MCP server or plugin — the project's existing official-API integration (`catalog:pull-notion`) could call `GET /v1/pages/{id}/markdown` directly with the same axios/fetch call it already makes, with zero new dependency, if and when it ever needs to pull long free-text content. No MCP server, plugin, or client library is required to get this benefit.
  - The project's catalog sync is **structured database rows** (`svc.*`/`off.*`/`del.*` with stable IDs), not long free-text pages — the workload the markdown API optimizes for doesn't match the project's actual Notion usage (data-source/database queries), which the existing REST integration already covers.
  - Architecture is explicitly one-way (Notion → local CSV pull only, no push-back requirement per CLAUDE.md), so the "write-back" capability the MCP/plugin route is built around is not a gap the project has.
  - The actively-supported path (hosted MCP, OAuth) cannot run headlessly/unattended the way `catalog:pull-notion` does today with a static token in `.env.local` — adopting it would be a regression for automation, not an improvement.
  - The self-hostable, MIT, non-OAuth version — the only variant that *would* fit headless use — is the one Anthropic's own README says may be sunset and isn't actively monitored.

**Verdict: not worth adopting.** The one real improvement (markdown page I/O) is a plain REST API upgrade the existing integration can pick up directly without any new package; the MCP/plugin wrapper adds OAuth and interactivity requirements that fit worse than what's already built, and write-back isn't something the architecture wants.

Sources: https://github.com/makenotion/notion-mcp-server (README fetched via GitHub API 2026-09-14); https://api.github.com/repos/makenotion/notion-mcp-server (2026-09-14).

### 3b. Arabic/RTL-aware PDF or chart generation

- **`pdfmake-rtl`** (`aysnet1/pdfmake-rtl`) — https://github.com/aysnet1/pdfmake-rtl — `pushed_at: 2026-02-10`, license `NOASSERTION` (no LICENSE file detected), only **9 stars**. Automatic RTL detection/table-reversal wrapper around pdfmake.
  - **Not worth it.** Wrong architecture entirely: pdfmake builds PDFs from a JSON content-description tree via a custom layout/canvas engine, not from HTML/CSS via a browser. The project deliberately renders HTML through Chromium to get real CSS layout, `@font-face` (Noto Sans Arabic + Manrope), and print-quality control — switching to pdfmake would mean re-authoring the entire slide-layout system in a different paradigm, to fix nothing that's currently broken. Also unlicensed and has essentially no adoption (9 stars).
- **`Gpdf`** (`omaralalwi/Gpdf`) — a DomPDF wrapper for PHP with native Arabic support. **Not applicable** — wrong language/runtime (PHP, not Node), and again a from-HTML-string-to-PDF engine different from Chromium print-to-PDF.
- **ApexCharts** (checked as a possible fix for the Chart.js/ECharts RTL bugs the project already hit) — https://github.com/apexcharts/apexcharts.js, `pushed_at: 2026-09-13`, 15,157 stars, actively maintained, MIT (per project docs; GitHub's license detector shows `NOASSERTION` because of file layout — treat license as MIT but **[unverified]** by automated detection). Its GitHub RTL-support issue (#4006, opened 2023, **closed** 2023-11-20 with only one comment) doesn't clearly establish that RTL rendering is now solid — the resolution isn't documented in the issue itself.
  - **Not worth switching.** No confirmed, well-documented fix for the specific RTL bug class (label mirroring, legend ordering, tooltip positioning) that drove the project to avoid Chart.js/ECharts in the first place; swapping charting libraries on a "maybe it's fixed" basis for a working, already-debugged from-scratch approach is not justified. If chart needs grow, this deserves a hands-on spike before adoption — but that's future work, not something to pull in now.
- No other actively maintained, Node-usable, HTML-aware Arabic/RTL PDF or document-generation library surfaced in general GitHub search that offers something the project's existing Chromium-based renderer doesn't already do correctly (font loading wait, no `letter-spacing`/`justify` on Arabic, Latin-run isolation).

**Verdict for this whole category: nothing found is worth adopting.** The project's own from-scratch renderer is, per this research, still the most correct tool for the specific RTL/Arabic constraints it targets; every alternative found is either a different rendering paradigm, unmaintained/near-zero-adoption, or has unresolved/unverified RTL correctness.

### 3c. JSON-schema / structured-output helpers for CLI tools

- The project already uses **ajv** (implied by CLAUDE.md: "ajv JSON-schema validation of every AI output") plus its own quote-verification layer against saved evidence — this is exactly the mainstream, actively-maintained (ajv is the de facto standard JSON Schema validator for Node, MIT licensed) solution already. No search turned up a CLI-wrapper, MCP server, or plugin that does "validate this headless `claude -p --json-schema` output" better than calling ajv directly in ~20 lines, which is what a schema-validation layer is anyway.
- Anthropic's own `platform.claude.com/docs/en/build-with-claude/structured-outputs` and `agent-sdk/structured-outputs` docs describe **API-level** structured outputs (passing a JSON Schema to the Messages API `output_format`), which requires the Claude **API** with an API key — explicitly out of bounds per the project's "no Anthropic API key" rule. Not applicable.
- **Verdict: nothing found is worth adopting.** ajv + the project's existing quote-verification code already is the right-sized, already-working solution; nothing in the plugin/MCP ecosystem does this job better within the "headless `claude -p`, no API key" constraint.

### 3d. Rule-engine / business-rules frameworks usable from Node

Checked as a hypothetical alternative to the project's existing ~hand-rolled deterministic scope/schedule/KPI rule engine (which is a **constitutional requirement** to stay deterministic and non-AI, and is already built + tested per Sprint 1 in the commit log).

- **`json-rules-engine`** (`CacheControl/json-rules-engine`) — https://github.com/cachecontrol/json-rules-engine — repo `pushed_at: 2026-02-16` (ISC license, not archived), but its **last actual GitHub release is `v6.5.0` from 2023-11-10**, and the latest npm-published version's registry timestamp is **2025-02-20** — i.e., no real feature/version release in over a year and a half as of today. Low-maintenance, not actively evolving.
  - **Not worth it.** Generic JSON-condition rule engines like this are meant for "rules that change often without redeploying code" (pricing, eligibility, feature flags). The project's scope/schedule/KPI logic is the opposite: it's a small, fixed, test-covered, versioned set of business rules that the Constitutional rules require to stay in **deterministic code**, not a JSON-configurable engine that non-developers edit live. Introducing json-rules-engine would add an interpreter layer and a new dependency for something the project has already implemented directly and tested — no genuine gain, and mild risk of an aging/low-activity dependency.
- **`zen-engine` / GoRules** (`gorules/zen`) — https://github.com/gorules/zen — `pushed_at: 2026-08-25`, **MIT**, 1,984 stars, actively maintained; Rust-core with native Node bindings (`@gorules/zen-engine` on npm) for JSON Decision Model (JDM) graphs, fast execution.
  - **Not worth it, for the same reason as above** — actively maintained and technically solid, but it's a generic decision-table/graph engine meant to let *non-engineers* edit business logic externally (e.g., via GoRules' visual editor). The project's rule engine must stay in code, reviewed and tested like any other deterministic logic (per Constitutional Rule 1), and is already implemented in Sprint 1 (`2a014d4`, "deterministic rule engine — scope resolver, scheduler, KPI picker, automated scope checks"). Swapping working, tested, in-repo logic for an external engine + a native Rust binary dependency (napi build complexity on Windows) buys nothing and adds a real integration/build-portability cost on the project's Windows target.

**Verdict: nothing found is worth adopting** for the rule-engine category — both because the existing code already satisfies the requirement and passes tests, and because the *kind* of tool a "rules engine" package provides (externally-editable rule configuration) is not what this project's rules are (code-reviewed, versioned business logic that must never be AI- or non-developer-editable at runtime).

---

## Summary table

| # | Candidate | Category | Last activity | License | Verdict |
|---|---|---|---|---|---|
| 1 | `notion` plugin (`makenotion/claude-code-notion-plugin`) | Official marketplace plugin | 2026-01-22 | none found (all rights reserved) | Not worth it — OAuth/hosted-only, wrong direction (write-back not needed), stale, unlicensed |
| 2 | `carbone-skill` | Official marketplace plugin | n/a (marketplace entry) | n/a | Not worth it — template-fill engine, wrong paradigm |
| 3 | `atomic-agents` | Official marketplace plugin | n/a | n/a | Not worth it — Python framework, duplicates existing ajv validation |
| 4 | `airtable`/`box` etc. | Official marketplace plugins | n/a | n/a | Not worth it — paid/hosted SaaS, violates zero-paid-software rule |
| 5 | `anthropics/skills` — pdf/docx/pptx/xlsx | Anthropic skills repo | pdf: 2026-02-06 | Proprietary (source-available, no derivatives/redistribution) | Not worth it — license blocks reuse; also wrong technique (pypdf post-processing vs. from-scratch HTML render) |
| 6 | `makenotion/notion-mcp-server` (self-hosted) | MCP server | 2026-09-13 | MIT | Not worth it — the one useful feature (markdown page API) is a plain REST endpoint usable without this package; Anthropic itself is deprioritizing this variant |
| 7 | Notion MCP (hosted, `mcp.notion.com`) | MCP server | n/a (SaaS) | n/a | Not worth it — OAuth-only, can't run headless, write-back not needed by this architecture |
| 8 | `pdfmake-rtl` | RTL PDF library | 2026-02-10 | none found | Not worth it — wrong rendering paradigm, 9 stars, unlicensed |
| 9 | `Gpdf` (DomPDF/PHP) | RTL PDF library | — | — | Not applicable — wrong language/runtime |
| 10 | ApexCharts | RTL chart library | 2026-09-13 | MIT (license file detection unverified) | Not worth it — RTL fix unconfirmed, no reason to replace working custom rendering |
| 11 | `json-rules-engine` | Rule engine | last release 2023-11-10 | ISC | Not worth it — low-maintenance, and wrong tool class (externally-editable rules vs. required in-code deterministic logic) |
| 12 | `zen-engine` / GoRules | Rule engine | 2026-08-25 | MIT | Not worth it — actively maintained but wrong tool class for the same constitutional reason, plus native-binary build overhead on Windows |

**Total: 0 of 12 candidates worth adopting**, across all three requested areas (official plugin marketplace, `anthropics/skills`, and general 2026 MCP servers/libraries for Notion, Arabic/RTL PDF, structured output, and rule engines).
