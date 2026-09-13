# Research — Al-Marketer Proposal Automation (Phase 1)

_Research date: 2026-09-13. Method: official docs and GitHub pages fetched today, three parallel research agents, my own re-checks of the highest-impact claims, local checks on this machine (`claude --help` for v2.1.270), and direct reading of the two PDFs (page images) and the Notion catalog. Tags: **[verified]** = confirmed on a page fetched today; **[observed]** = I tested it on this machine today; **[unverified]** = secondary source or could not confirm; **[conflicting]** = sources disagree._

## A0. What our own inputs contain (read before anything else)

- **Blueprint V4** (71 A4-landscape pages, Egyptian-Arabic): 6 parts, 8 ordered questions, 3 research teams, Client Information Record, diagnosis with independent review (Confirmed / Needs review / Rejected), 6 terms (Service/Offering/Process/Deliverable/KPI/Optimization), 10 services (3 strategic always-on), dependency rules, month-1 week structure, 4 automated reviews, 3 human gates, 11-status control center, 11-section proposal, identity (#EF4423, #070808, #FCF6D6, #909194, mascot on cover), 16 constitutional rules. [observed]
- **Hijab Store proposal v2** (11 slides, 16:9, 1200×675pt): quality bar for design, tone and density. **It does not follow the Blueprint strictly**: week 1 is "minimum readiness" (not Portfolio→Brand→Strategy), it proposes a Go/No-Go market pilot, uses items not in the catalog ("store & content development", "expansion"), and has no formal 3-month deliverables map. [observed] → decision needed (Part B §9 Q1, Q11).
- **Both PDFs were generated from HTML by Chromium** (PDF producer "Skia/PDF m141", fonts Noto Sans Arabic + Manrope). So our current hand process is already "HTML → Chrome print"; the system can reproduce it exactly. [observed]
- **Arabic text cannot be cleanly copied out of these PDFs** — extraction returns broken, reversed letters (tested with PyMuPDF). I had to read the pages as images. [observed] Same root cause documented in pdf.js and Chromium: https://github.com/mozilla/pdf.js/issues/2141 , https://issues.chromium.org/issues/385699043 [verified]
- **Notion catalog**: a normal web fetch sees only the word "Notion" (JavaScript-rendered) [observed]. However, Notion's public-page data endpoint (`/api/v3/loadPageChunk` + `queryCollection`) returned all rows without login: **10 services, 7 offerings, 50 deliverables** [observed]. This endpoint is unofficial/undocumented and can change without notice: https://github.com/kjk/notionapi , https://github.com/NotionX/react-notion-x [verified that these libraries use it; stability unverified].
- **Catalog vs Blueprint mismatches** [observed]:
  1. Notion names the paid-ads service "الدعاية الممولة (Media Buying)"; Blueprint p.36 says the commercial name must be "تسويق الأداء (Performance Marketing)" and "media buying" is internal only.
  2. Community Management has 2 deliverables in Notion (Response Playbook, Community Insights Report); Blueprint p.34 lists 3 (adds "Comments & messages management").
  3. Product Portfolio Management's description in Notion is a copy of Marketing Management's.
  4. No field for fixed vs conditional deliverable (Blueprint: Loyalty Journey Transformation is conditional).
  5. No Arabic deliverable names, no durations, no dependencies, no stage type.
  6. Capability scores: Portfolio 5, Brand 4, Marketing 5, Social 3, Website 3, Media Buying 2, Email 1, Influencer 0, Automation 0, Media Production blank.
  7. Linked "Problem" (30 rows) and "Segment" (8 F&B segments) databases are also public, but they are agency/market pain points (e.g. "Agencies fail to prove ROI"), **not a client-diagnosis taxonomy** — cannot drive service selection directly.

## A1. Claude Code features (question a)

| Feature | What matters for us | Source |
|---|---|---|
| Headless `claude -p` | Runs non-interactively; `--output-format json`; `--json-schema` returns schema-shaped data in `structured_output`; JSON includes `total_cost_usd` estimate per run; `--permission-mode dontAsk` + `--allowedTools` for locked-down runs; skills usable in `-p` via `/skill-name` | https://code.claude.com/docs/en/headless [verified]; `--json-schema` present in local v2.1.270 help [observed] |
| `--bare` mode | Docs recommend it for scripts **but it never reads subscription (OAuth) login — API key only**, and docs say it "will become the default for `-p` in a future release" → **must not use; future-release landmine** | https://code.claude.com/docs/en/headless [verified]; local help text [observed] |
| `--max-turns` | Not listed in local v2.1.270 help → don't rely on it; enforce timeouts in our own code | [observed] |
| `--restricted`, `--tools`, `--strict-mcp-config`, `--system-prompt`/`--append-system-prompt(-file)`, `--setting-sources` | Lets each AI step run with only the tools/context it needs (smaller context = less usage) | local help [observed]; https://code.claude.com/docs/en/cli-reference [verified by agent] |
| Subscription auth & terms | OAuth is "designed to support ordinary use of Claude Code"; developers building products (incl. Agent SDK) should use API keys; Max limits "assume ordinary, individual usage". Running the unmodified `claude` binary signed in with your own subscription is permitted; **do not use the Agent SDK with the subscription** | https://code.claude.com/docs/en/legal-and-compliance [verified]. A secondary claim that the CLI is "built for scripted use" was **not found** on that page [unverified] |
| Usage limits | Limits are shared between claude.ai and Claude Code; exact 5-hour/weekly numbers and per-model weights not published in the article | https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan [verified]; numbers: https://claudelog.com/faqs/claude-code-usage-limits/ [unverified] |
| Models | Aliases `haiku`, `sonnet`, `opus`, `fable`, `opusplan`; Max default is Opus 5; **Fable usage "can bill to usage credits"** → avoid (zero-cost rule) | https://code.claude.com/docs/en/model-config [verified] |
| Subagents | `.claude/agents/*.md` with `model`, `tools`, `skills`, `mcpServers`, `hooks`; isolated context; can nest (depth 3) | https://code.claude.com/docs/en/sub-agents [verified by agent] |
| Subagent model bug | **Open issue (opened 2026-04-05): every way of setting a subagent's model silently falls back to the parent model (Opus)** → cost control via subagents is unreliable; use one headless run per step with `--model` instead | https://github.com/anthropics/claude-code/issues/43869 [verified open today] |
| Skills | `.claude/skills/<name>/SKILL.md`; auto-trigger by description or `/name`; keep SKILL.md short, link reference files | https://code.claude.com/docs/en/skills [verified by agent]. Practitioners report auto-trigger is unreliable (~50%) → always invoke by name: https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h [unverified] |
| Plugins | Bundle skills/agents/hooks/MCP; official marketplace `claude-plugins-official`; not needed for us | https://code.claude.com/docs/en/plugins [verified by agent] |
| anthropics/skills | Most skills Apache-2.0; **docx/pdf/pptx/xlsx skills are source-available, not open source** → reference only | https://github.com/anthropics/skills [verified by agent] |
| Hooks | PreToolUse/PostToolUse/Stop/SubagentStop etc.; exit code 2 blocks; on Windows hooks run in Git Bash (fallback PowerShell); `.cmd` shims like `npx` can't be exec'd — call `node script.js` | https://code.claude.com/docs/en/hooks [verified by agent] |
| Headless + project config | Without `--bare`, `-p` runs the project's hooks and `.mcp.json` with no trust prompt → keep project config minimal and safe | https://code.claude.com/docs/en/headless [verified] |
| Output styles | Feature kept; `/output-style` command removed, set via `/config` | https://code.claude.com/docs/en/output-styles [verified by agent] |
| MCP config | `claude mcp add <name> -- <cmd>`; scopes local/project/user; Windows needs `cmd /c npx`; outputs capped by `MAX_MCP_OUTPUT_TOKENS`; tool search loads MCP tools on demand | https://code.claude.com/docs/en/mcp [verified by agent] |
| Permissions | allow/ask/deny rules, deny wins; modes default/acceptEdits/plan/auto/dontAsk/bypassPermissions | https://code.claude.com/docs/en/permissions [verified by agent] |
| Sandboxing | **Not available on native Windows** (request closed "not planned") → permission rules + narrow tool lists are our only guardrail | https://code.claude.com/docs/en/sandboxing , https://github.com/anthropics/claude-code/issues/46740 [verified by agent] |
| CLAUDE.md | Hierarchical, `@imports`, keep under ~200 lines; `.claude/rules/*.md` with path scoping | https://code.claude.com/docs/en/memory [verified by agent] |
| WebFetch / WebSearch | WebFetch converts the page and answers through a small model (its own tool description says so) → **returns a summary, not raw text**; cannot see JS-rendered pages (confirmed on Notion) → **never use as evidence** | Tool description in this session [observed]; https://mikhail.io/2025/10/claude-code-web-tools/ [unverified] |
| Checkpoints | `/rewind` restores Claude's own edits, not Bash-made file changes | https://code.claude.com/docs/en/checkpointing [verified by agent] |

## A2. MCP servers (question b)

| Need | Server | Status today | Verdict |
|---|---|---|---|
| Browser/screenshots | microsoft/playwright-mcp (Apache-2.0) | Active | Optional dev tool only. **Known token blow-up**: screenshots/snapshots flood context (one report: 232k tokens) https://github.com/microsoft/playwright-mcp/issues/1216 [verified by agent]. We use our own Playwright scripts that save to disk instead. https://github.com/microsoft/playwright-mcp |
| Performance traces | ChromeDevTools/chrome-devtools-mcp (Apache-2.0) | v1.9.0 on 2026-09-08; its Lighthouse tool excludes Performance category | Optional later. https://github.com/ChromeDevTools/chrome-devtools-mcp [verified by agent] |
| Browser (old) | Puppeteer MCP | **Archived** May 2025, no security updates | Avoid. https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer [verified by agent] |
| Browser (alt) | executeautomation/mcp-playwright (MIT) | Slower cadence (last commit ~2025-12) | Skip. https://github.com/executeautomation/mcp-playwright [verified by agent] |
| Fetch | modelcontextprotocol fetch (Python/uvx) | Active (PyPI 2026-08-18) | Not needed (Playwright capture is better evidence). https://github.com/modelcontextprotocol/servers/tree/main/src/fetch , https://pypi.org/project/mcp-server-fetch/ |
| Fetch (paid) | Firecrawl / Bright Data / Jina | Key or paid tier for real use | Avoid. https://www.firecrawl.dev/blog/firecrawl-keyless-launch [verified by agent] |
| Notion | makenotion/notion-mcp-server (local, token) | Works; README says it may be sunset in favour of hosted | Not needed for v1. https://github.com/makenotion/notion-mcp-server [verified by agent] |
| Notion | Notion hosted MCP (OAuth) | Maintained by Notion; some view-query features need paid plans | Later, only if we write status back to Notion. https://developers.notion.com/guides/mcp/overview [verified by agent]; exact URL/command [unverified] |
| Notion API limits | Official API | ~3 req/s per integration | Fine for catalog sync. https://developers.notion.com/reference/request-limits [verified by agent] |
| Filesystem | modelcontextprotocol filesystem | Active | Redundant with Claude Code file tools — skip. https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem |
| GitHub | github/github-mcp-server (official, MIT) | Active; old `@modelcontextprotocol/server-github` archived | Not needed (local git). https://github.com/github/github-mcp-server [verified by agent] |
| Workflow | n8n (Sustainable Use License, free internal use), MCP Server Trigger node, czlonkowski/n8n-mcp; Activepieces (MIT) | Active | Skip: adds a server + database for a single operator; plain Node is simpler. https://docs.n8n.io/sustainable-use-license/ , https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger , https://github.com/czlonkowski/n8n-mcp , https://2sync.com/blog/activepieces-vs-n8n [verified by agent] |
| Web search | Built-in WebSearch (no key); SearXNG+MCP (Docker); DuckDuckGo MCP (scrapes, throttles); **Brave API free tier ended Feb 2026** | — | Use built-in WebSearch only to *discover* URLs. https://github.com/ihor-sokoliuk/mcp-searxng , https://github.com/nickclyde/duckduckgo-mcp-server , https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ [verified by agent] |
| Windows | `npx` MCP servers need `cmd /c`; several reports of `claude mcp add` mangling `/c` | — | Avoid runtime MCP. https://github.com/anthropics/claude-code/issues/9594 , https://github.com/anthropics/claude-code/issues/20061 , https://github.com/anthropics/claude-code/issues/4158 [verified by agent] |

## A3. Existing open source — reuse vs build (question c)

**Website / SEO / tech audit (reuse):**
- Playwright (Apache-2.0) for rendered page text + desktop/mobile screenshots — already installed browsers on this machine [observed].
- Lighthouse CLI (Apache-2.0) for speed/SEO/accessibility: https://github.com/GoogleChrome/lighthouse [license not re-checked today]; unlighthouse (MIT) for whole-site: https://github.com/harlan-zw/unlighthouse [verified by agent].
- PageSpeed Insights API v5: free, 25,000 req/day, key optional, uses Google's crawler (useful when a site blocks headless browsers): https://developers.google.com/speed/docs/insights/v5/get-started [verified by agent].
- Tech-stack fingerprints: Wappalyzer went closed in 2023; maintained forks enthec/webappanalyzer (GPLv3, updated Jul 2026) and projectdiscovery/wappalyzergo (MIT): https://github.com/enthec/webappanalyzer , https://github.com/projectdiscovery/wappalyzergo , https://dev.to/nexgendata/wappalyzer-paywalled-itself-in-2023-heres-the-oss-powered-replacement-3i01 [verified by agent]. Salla/Zid/Shopify/WooCommerce leave detectable HTML/asset signatures: https://storeleads.app/reports/salla , https://docs.salla.dev/ [partially verified].
- axe-core (MPL-2.0) accessibility: https://github.com/dequelabs/axe-core ; crawlee (Apache-2.0): https://github.com/apify/crawlee ; crawl4ai (Apache-2.0, Python): https://github.com/unclecode/crawl4ai [verified by agent].

**Social media (mostly manual):** Instagram blocks anonymous scraping quickly (Instaloader active but fragile): https://github.com/instaloader/instaloader , https://instaloader.github.io/troubleshooting.html ; TikTok anti-scraping: https://scrapfly.io/blog/posts/how-to-scrape-tiktok-python-json ; YouTube Data API free 10,000 units/day: https://www.getphyllo.com/post/youtube-api-quota-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota ; Meta Ad Library API needs ID verification — use the web UI manually: https://adlibrary.com/posts/meta-ad-library-api-limitations ; Google Business Profile API not quick to get: https://developers.google.com/my-business/content/prereqs [all verified by agent].

**Proposal / deck generators (patterns only, don't adopt):** presenton (Apache-2.0, no RTL found) https://github.com/presenton/presenton ; PPTAgent (MIT; "reference deck → schema → edits" pattern) https://github.com/icip-cas/PPTAgent ; slide-deck-ai (MIT, PPTX) https://github.com/barun-saha/slide-deck-ai ; Pandoc (GPL, not for designed slides) https://github.com/jgm/pandoc [verified by agent]. None handles Arabic RTL print-quality slides → **build our own HTML templates** (cloned from the Hijab look).

**Evidence-backed research agents (patterns only):** GPT Researcher (Apache-2.0) https://github.com/assafelovic/gpt-researcher ; Stanford STORM (MIT) https://github.com/stanford-oval/storm ; LangChain open_deep_research (MIT) https://github.com/langchain-ai/open_deep_research ; dzhng/deep-research (MIT, dormant) https://github.com/dzhng/deep-research [verified by agent]. Anthropic's guidance: allow "I don't know", extract word-for-word quotes first, cite every claim and retract unsupported ones: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations [verified by agent].

**Reuse decision:** reuse Playwright, Lighthouse/PSI, a fingerprint list, ajv (schema validation, MIT: https://github.com/ajv-validator/ajv [not re-checked today]); reuse *patterns* from STORM/GPT-Researcher/Anthropic guidance; **build** the rule engine, evidence store, templates and control center.

## A4. Arabic RTL slides → print-quality PDF, free (question d)

- **Recommended engine: Playwright/Chromium `page.pdf()`** — full flex/grid, HarfBuzz shaping, and it is what produced our reference PDFs [observed]. Alternatives: WeasyPrint (RTL float/column bugs: https://github.com/Kozea/WeasyPrint/issues/574), Paged.js/Vivliostyle (paged-media, add complexity), Typst (Arabic only via community package), Marp/Slidev (no documented RTL), reveal.js (`rtl` option: https://revealjs.com/config/), Gotenberg (Chromium in Docker: https://gotenberg.dev) [verified by agent].
- **Required settings / known bugs:**
  - Wait for fonts: `document.fonts.ready` before printing, `font-display: block`, else fallback font is baked in: https://github.com/puppeteer/puppeteer/issues/3183 [verified by agent].
  - Page size: `preferCSSPageSize` + `@page { size: 1200pt 675pt }` has open issues (blank pages, rounding): https://github.com/puppeteer/puppeteer/issues/11345 , https://github.com/puppeteer/puppeteer/issues/4505 , https://github.com/microsoft/playwright/issues/20565 [verified by agent] → one fixed-size `<section>` per slide with `break-after: page`, plus an automated overflow check.
  - `printBackground: true` for dark slides [verified by agent].
  - **No `letter-spacing` on Arabic** (breaks letter joining): https://github.com/w3c/csswg-drafts/issues/3861 , https://bugzilla.mozilla.org/show_bug.cgi?id=1427032 [verified by agent].
  - **No justified Arabic** (no browser does kashida): https://drafts.csswg.org/css-text-3/ , https://bugzilla.mozilla.org/show_bug.cgi?id=185600 [verified by agent].
  - Latin brand names / numbers / % inside Arabic: wrap in isolated spans (`<bdi>` / `unicode-bidi: isolate`) — seen in Hijab slides ("Hijab Store", "5–6", "Code 118") [observed need; technique standard].
  - Digits: `Intl.NumberFormat('ar')` gives Western digits; `ar-EG`/`ar-u-nu-arab` gives Arabic-Indic — our references use Western digits → keep Western: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat [verified by agent].
  - Arabic text copied from the PDF is garbled [observed] → the HTML web version is the searchable/copyable copy.
- **Charts:** ECharts has open RTL bugs https://github.com/apache/echarts/issues/21465 ; Chart.js has no RTL https://github.com/chartjs/Chart.js/issues/1916 [verified by agent] → draw timeline/Gantt/KPI visuals as hand-built SVG from code.
- **Fonts (commercial use OK):** keep our current pair — **Noto Sans Arabic** (SIL OFL 1.1: https://github.com/notofonts/arabic [verified]) + **Manrope** (SIL OFL 1.1: https://www.fontsquirrel.com/license/manrope , https://github.com/davelab6/manrope [verified via search]). Other OFL options: IBM Plex Sans Arabic https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic , Cairo https://fonts.google.com/specimen/Cairo , Tajawal https://github.com/googlefonts/tajawal , Readex Pro https://github.com/ThomasJockin/readexpro , Alexandria https://fonts.google.com/specimen/Alexandria [verified by agent]. **Avoid**: Thmanyah (license terms conflicting, https://font.thmanyah.com) [conflicting], Dubai font [conflicting], 29LT Bukra and GE SS (paid, https://www.boutrosfonts.com) [verified by agent].
- **Web version hosting:** GitHub Pages from a private repo needs a paid plan and the site is public anyway (https://docs.github.com/en/pages) ; Netlify password protection is paid for accounts created after Sep 2025 ; Cloudflare Pages + Cloudflare Access is free up to 50 users (https://www.cloudflare.com/plans/zero-trust-services/) [verified by agent; plan pages not re-fetched] → **v1 = one self-contained HTML file** (no hosting, stays private).

## A5. Known landmines (question e)

1. **`--bare` becoming default for `-p`** would silently switch headless runs to API-key-only auth → pipeline must detect auth failure and fall back to running steps inside an interactive Claude Code session. https://code.claude.com/docs/en/headless [verified]
2. **Subagent model routing broken** (all subagents run on parent model) → burns Opus quota. https://github.com/anthropics/claude-code/issues/43869 [verified]
3. **WebFetch returns a small-model summary**, fails on JS pages → never evidence. [observed]
4. **Hallucinated URLs, quotes, numbers in structured output** — mitigated by schema-constrained output + ajv validation + verifying every quote against saved page text (Anthropic guidance above; strict schemas: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use [verified by agent]).
5. **Cloudflare / bot protection blocks headless Chromium**; stealth plugins dead (puppeteer-extra-plugin-stealth unmaintained). https://www.browserstack.com/guide/playwright-cloudflare , https://www.npmjs.com/package/puppeteer-extra-plugin-stealth [verified by agent] → mark source "blocked", use PSI API, ask human.
6. **Instagram/TikTok login walls and rate limits** (see A3) → social evidence is semi-manual.
7. **Rate limits**: PSI 400 req/100s; DuckDuckGo scraping ~30/min; Notion ~3 req/s. (sources in A2/A3)
8. **Playwright MCP context blow-up** (A2) → no runtime MCP.
9. **Windows**: `npx` `.cmd` shims break MCP/hooks; hooks run in Git Bash; no sandbox. (sources in A1/A2)
10. **Chromium PDF**: fonts not loaded, `@page` size bugs, letter-spacing, justify, garbled Arabic copy-paste. (sources in A4)
11. **Unofficial Notion endpoint** can break without notice. (A0)
12. **Skills don't reliably auto-trigger** → invoke by name. (A1)
13. **Fable model may bill usage credits** → never select it. (A1)
14. **Consumer-terms boundary**: don't use the Agent SDK or extract the subscription token; only run the unmodified `claude` CLI yourself. (A1)

## A6. Conflicts between sources and how resolved
- `--json-schema`: one agent said "likely not GA" (old closed feature request); official headless docs document it and local v2.1.270 help lists it → **available** [verified + observed].
- "CLI exempted for scripted use" quote: not present on the legal page today → treated as **unverified**; design keeps a fallback (landmine 1).

