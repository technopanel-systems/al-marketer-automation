# AI Skills, Plugins, and MCP Servers for the Digital & Social Media Audit Step

Research date: 2026-09-14 (all sources retrieved on this date unless noted otherwise).

Context: Al-Marketer's proposal system runs locally on Windows with Node.js 24 and headless
Claude Code CLI calls (`claude -p --json-schema`, subscription login, no paid SaaS). The planned
architecture for the new "digital & social media audit" step: an **employee manually browses**
client + competitor profiles in a **real, logged-in Chrome** that the app opens; **deterministic
code** captures posts/screenshots and computes metrics; **Claude (vision)** then analyzes the
already-captured text/screenshots to find evidence-backed problems for an Arabic proposal.
Constitutional rules that gate every recommendation below: code decides facts/numbers, AI never
invents them; every factual claim must cite saved evidence; zero new paid software (free/open
source only); unknown stays unknown, never guess.

---

## 1. Claude Code skills and plugins

### Official Anthropic sources — nothing usable found

**github.com/anthropics/claude-plugins-official** — Apache-2.0. 36,251 stars, pushed
2026-09-14 (actively maintained, official Anthropic marketplace). Directory listing of
`/plugins` (39 entries, confirmed via directory fetch) is entirely developer-tooling: LSPs
(rust-analyzer, gopls, pyright, clangd, jdtls, kotlin, lua, php, ruby, swift, typescript,
csharp), `code-review`, `code-simplifier`, `security-guidance`, `frontend-design`,
`mcp-server-dev`, `mcp-tunnels`, `skill-creator`, `session-report`, `commit-commands`,
`hookify`, `plugin-dev`, `pr-review-toolkit`, `project-artifact`, `math-olympiad`,
`ralph-loop`, `receipts`, `playground`, output-style plugins, etc.
**There is no marketing/social/competitor-research plugin at all.**
Source: https://github.com/anthropics/claude-plugins-official (repo tree + API metadata
`api.github.com/repos/anthropics/claude-plugins-official`), retrieved 2026-09-14.

**github.com/anthropics/skills** — No license file present (GitHub API reports
`license: null`, meaning default all-rights-reserved terms apply to any reuse). 176,208
stars, pushed 2026-09-10. 18 skill directories: `academy-guide`, `algorithmic-art`,
`brand-guidelines`, `canvas-design`, `claude-api`, `discernment-nudge`, `doc-coauthoring`,
`docx`, `frontend-design`, `internal-comms`, `mcp-builder`, `pdf`, `pptx`, `skill-creator`,
`slack-gif-creator`, `theme-factory`, `web-artifacts-builder`, `webapp-testing`, `xlsx`.
None target social/marketing audits. `brand-guidelines` applies a company's *own* visual
identity to documents (not an audit of anyone's presence). `webapp-testing` is
screenshot-driven QA for web apps — methodologically adjacent (capture screenshots → have
Claude review them) but built for testing your own app, not auditing social feeds.
**Nothing to adopt.** Source: https://github.com/anthropics/skills, retrieved 2026-09-14.

### Community skill repos found

All of the below are third-party/unofficial. None are Anthropic-vetted. Evaluated against
whether they structure evidence collection + verification (good fit) or are prompt templates
that assert benchmarks/scores as fact with no grounding (bad fit — violates constitutional
rule 3, "evidence before problem... code verifies quotes").

1. **borghei/Claude-Skills** — https://github.com/borghei/Claude-Skills — License: MIT +
   Commons Clause (no resale/repackaging as a paid product; fine for internal use). Created
   2026-01-13, pushed 2026-08-12, 755 stars — plausible activity/star ratio. 368 skills across
   20 domains, 39 under "Marketing." Two directly relevant, both read in full:
   - `marketing/social-media-analyzer/SKILL.md` — computes engagement rate, cost-per-engagement,
     and ROI% via **explicit formulas and a `calculate_metrics.py` script**
     (`Engagement Rate = (Likes+Comments+Shares+Saves)/Reach×100`, fixed per-engagement dollar
     values, hard benchmark tables e.g. "Excellent >6% engagement", "ROI >500% = Excellent").
     This is the closest thing found anywhere to this project's pattern (**code computes, AI
     only interprets**) — but it operates on user-supplied campaign numbers (likes/spend), not
     on scraped/screenshotted competitor content, and does not require citing external
     evidence for its narrative output. **Not directly adoptable, but the formula/threshold
     design is a useful reference** for building the project's own deterministic metrics
     module.
     https://github.com/borghei/Claude-Skills/blob/main/marketing/social-media-analyzer/SKILL.md,
     retrieved 2026-09-14.
   - `marketing/social-media-manager/SKILL.md` — strategy/audit-checklist skill (profile/
     content/engagement audit checklist, posting-time tips, content-pillar ratio targets).
     Pure prompt template: no real APIs or code computation, benchmarks are hardcoded and
     presented as fact ("post 7-9am Tue-Thu on LinkedIn"), no evidence-citation requirement.
     **Not suitable** — would have Claude assert unsourced "facts," which the constitutional
     rules explicitly forbid ("unknown stays unknown — never guess").
     https://github.com/borghei/Claude-Skills/blob/main/marketing/social-media-manager/SKILL.md,
     retrieved 2026-09-14.

2. **thatrebeccarae/claude-marketing** — https://github.com/thatrebeccarae/claude-marketing —
   MIT. Created 2026-02-09, **pushed 2026-05-14** (4+ months stale as of retrieval), 139
   stars. 56 skills in packs (Paid Media, DTC, Content, Strategy&Research, Creative&Design,
   Dev Tools). Includes "Competitor Ads Analyst" (analyzes public ad libraries — real external
   data, but ads-library data, not organic social) and "Social Media Strategy" (read directly:
   **no real APIs or code computation; all benchmarks hardcoded/illustrative; no evidence-
   citation requirement** — same grounding problem as above). Given staleness + no grounding
   mechanism, **not adoptable**. Source retrieved 2026-09-14.

3. **zubair-trabzada/ai-marketing-claude** —
   https://github.com/zubair-trabzada/ai-marketing-claude — MIT. Created **and** pushed both
   2026-03-02 (a single commit, never updated in 6+ months), yet shows **2,646 stars** — a
   star count wildly disproportionate to a one-commit, never-updated repo. This is a strong
   signal of inorganic/purchased stars; **treat as not credibly maintained regardless of star
   count**. Its "Competitive Intelligence" / audit scoring uses fixed dimension weights (e.g.
   Content 25%, SEO 20%) but documentation never clarifies whether the underlying per-
   dimension scores come from real analysis or AI guessing — most likely the latter, since no
   API/tool integration is documented. **Do not adopt.** Retrieved 2026-09-14.

4. **OpenClaudia/openclaudia-skills** — https://github.com/OpenClaudia/openclaudia-skills —
   MIT. Created 2026-02-11, pushed 2026-09-11 (fresh), 690 stars — the most credibly
   maintained community repo found, with a star count plausible for its age/activity. 77
   skills. Relevant: `social-content`, `thread-writer`, `content-calendar`, `linkedin-content`,
   `bluesky`, `reddit-marketing` (content *generation*, not audit — out of scope) and
   `brand-monitor`, read directly: **calls the real Brand.dev API**
   (`api.brand.dev/v1/...`) for mention tracking/sentiment/logo detection, requires an API
   key, returns actual source URLs + titles + dates suitable for citation, and has numeric
   sentiment thresholds (>0.3 positive / <-0.3 negative). This is genuinely evidence-grounded,
   not invented. **Caveat: Brand.dev is a paid third-party API** — conflicts with constitutional
   rule 5 ("zero new paid software... free/open-source only") unless a usable free tier exists
   [unverified — Brand.dev pricing not checked, out of scope for this research pass]. The
   repo's other analytics skills (`similarweb-traffic`, `semrush-research`, `youtube-analytics`,
   `search-console`) are almost certainly paid-API-backed too; not individually verified.
   Retrieved 2026-09-14.

5. **coreyhaines31/marketingskills** — https://github.com/coreyhaines31/marketingskills — MIT.
   Created 2026-01-15, pushed 2026-09-05, but shows **50,113 stars** — disproportionate for an
   8-month-old niche marketing-skills repo (compare: Anthropic's own flagship skills repo has
   176k stars; OpenClaudia, comparable scope/age, has 690). Strong suspicion of fake/purchased
   stars. Has `social`, `competitor-profiling`, `competitors`, `seo-audit` skills, but given
   the credibility flag, **star count should not be treated as a quality signal**; individual
   SKILL.md files were not deep-read given the trust concern. **Not recommended without
   independent scrutiny.** Retrieved 2026-09-14.

### Marketplaces / round-ups checked

**mcpmarket.com/tools/skills** — a third-party (non-Anthropic) skills marketplace/leaderboard
listing "Social Media Analyzer," "Social Media Manager," "Vision Expert," "Screenshot
Analysis" as separate listings — these appear to repackage the same community skills found
above (e.g. borghei's), not independently sourced content. No unique grounding advantage.
Round-up/listicle articles (composio.dev, medium.com/design-bootcamp, twominutereports.com,
aibuilderclub.com, get-ryze.ai) surface the same repos above and were not treated as primary
sources. Retrieved 2026-09-14.

### Vision/screenshot-capture skills (tangential)

Searched specifically for feed-grid/screenshot-vision social-audit skills; found none
purpose-built. Generic screen-capture skills exist (`fltman/claude-code-skill-screenshot`,
`ellyseum/claude-vision`, `Adiakys/claude-vision`) but solve "let Claude see the current
screen," which is the opposite of this project's design (code captures, human browses, AI
never drives the browser). Not evaluated further — out of scope for adoption.

### Section 1 conclusion

**No skill or plugin — official or community — is fit to adopt wholesale.** The official
Anthropic marketplace and skills repo have nothing in this domain. Every community option is
either (a) a prompt template asserting benchmarks/scores as fact with no citation mechanism,
(b) backed by a paid third-party API, or (c) attached to a repo with credibility red flags
(star counts wildly disproportionate to commit history). The one component worth
*referencing* (not installing) is borghei's `social-media-analyzer` deterministic-formula /
benchmark-threshold design as inspiration for this project's own in-house metrics module.

---

## 2. MCP servers for social media data / browser capture

### Architectural note (read first)

MCP servers exist to give an **LLM agent loop** tool-calling access — i.e., the AI decides
what to click, navigate, or scrape next. That is the opposite of this project's design, where
a human employee browses and **deterministic code** captures data on a fixed schedule/script.
Using a browser-automation MCP here would hand browsing decisions to the AI, violating
constitutional rule 1 ("deterministic code decides... AI never makes these decisions"). The
right tool for this step is very likely **not an MCP server at all**, but the Playwright
Node.js *library* used directly in the app's own scripted code (see recommendation at the end
of this section).

### Generic browser-automation MCPs

- **Playwright MCP** — https://github.com/microsoft/playwright-mcp — maintained by Microsoft,
  Apache-2.0, 37.1k stars, 579 commits (active). Uses Playwright's **accessibility tree**, not
  screenshots, as its default representation ("LLM-friendly... bypassing the need for
  screenshots or visually-tuned models"), which keeps token cost down for navigation tasks but
  is the wrong representation for a *visual* social-feed audit. Supports connecting to an
  existing/logged-in browser via `--cdp-endpoint` or a browser-extension mode that "allows you
  to connect to existing browser tabs and leverage your logged-in sessions and browser state."
  Windows support confirmed (documented `%USERPROFILE%\AppData\Local\ms-playwright\...` cache
  path). **Fit**: technically capable of attaching to a real logged-in Chrome, but it is
  designed to let the *AI* drive the browser via tool calls — wrong paradigm for this project's
  "code drives, human browses" design. Retrieved 2026-09-14.

- **Chrome DevTools MCP** — https://github.com/ChromeDevTools/chrome-devtools-mcp — official
  Google/Chrome DevTools team project, Apache-2.0, 51.9k stars, 1,221 commits (active).
  Provides screenshots, network analysis, console messages, and performance traces; documents
  "connecting to a running Chrome instance instead of starting a new one" as an advanced
  feature. Collects usage statistics by default (`--no-usage-statistics` to disable) — a
  privacy note worth flagging. Windows support not explicitly confirmed in the fetched
  content [unverified — likely works, Puppeteer/CDP-based tooling is generally cross-platform,
  but not directly confirmed]. **Fit**: same issue as Playwright MCP — built for AI-driven
  control, not scripted deterministic capture. Retrieved 2026-09-14.

- **browser-use-style "drive your real logged-in Chrome" MCPs** — several small community
  projects surfaced:
  - `ofershap/real-browser-mcp` — https://github.com/ofershap/real-browser-mcp — MIT, 51
    stars, single maintainer, active. Local MCP server + Chrome extension over a localhost
    WebSocket; explicitly designed to let an AI agent act in your real, already-authenticated
    Chrome tab (cookies/SSO intact). Its own README **explicitly warns**: "The agent can still
    click, type, and read whatever is visible in the connected tab, including logged-in apps,"
    and recommends a dedicated profile for untrusted sites. This is a direct illustration of
    the security risk of letting an AI freely drive a logged-in session — useful as a
    cautionary reference, not something to adopt for this project's design. Retrieved
    2026-09-14.
  - `agent360dk/browser-mcp` — https://github.com/agent360dk/browser-mcp — markets itself as
    reading "emailed login codes from your Gmail" and "solves CAPTCHAs." **Flag as a hard
    no**: an MCP that auto-solves CAPTCHAs and reads 2FA/login codes essentially automates
    around the exact anti-automation and account-security measures social platforms rely on;
    this is both a ToS risk for the client's real accounts and a broad-trust risk (small/single
    maintainer given deep Gmail + browser access). Not evaluated further; do not use.
    Retrieved 2026-09-14 [maintenance/commit-history not independently verified beyond the
    README claims — treat description itself as the disqualifying signal regardless of
    maintenance quality].
  - Others found by name only (not deep-evaluated, same "AI drives your real browser"
    category): `imprvhub/mcp-browser-agent`, `rithikanupam-hub/browser-agent-mcp`,
    `softallice/agent-browser-mcp`, `LvcidPsyche/auto-browser`, `vercel-labs/agent-browser`.
    All fall into the same architectural mismatch (AI-autonomous browsing) for this project.

### Additional session-reuse nuances (independent verification pass)

- **Chrome DevTools MCP's "attach to existing Chrome" is not a literal daily-profile attach.**
  Its docs (`docs/advanced-usage.md`) document `--browser-url` pointing at a Chrome started with
  `--remote-debugging-port`, but Chrome requires a **non-default `--user-data-dir`** whenever
  remote debugging is enabled — you cannot point it at an already-running, everyday Chrome
  profile directly; the employee would need a dedicated Chrome profile, logged into the target
  accounts once, launched with the debugging flag each time. The docs also carry an explicit
  security warning: "Any application on your machine can connect to this port and control the
  browser... make sure you are not browsing any sensitive websites while the debugging port is
  open." Source: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md,
  retrieved 2026-09-14.
- **`hangwin/mcp-chrome`** — https://github.com/hangwin/mcp-chrome — MIT, 12.4k stars, pushed
  2026-01-06. Solves the profile problem differently: it installs as a **Chrome extension
  inside the user's actual daily Chrome**, so it genuinely reuses the real logged-in profile
  with no separate debug profile or remote-debugging flag needed. Notable as the only option
  found that sidesteps the Chrome 136+ default-profile restriction other CDP-based tools hit —
  but it is still fundamentally an AI-tool-loop interface (the extension exposes browser control
  to an MCP client), so the same "AI decides what to click" mismatch with this project's
  code-driven design applies. Retrieved 2026-09-14.
- **`browser-use`** (https://github.com/browser-use/browser-use, 114.6k stars, MIT, pushed
  2026-09-13) is the most popular "AI drives a real browser" project, but it is a **Python**
  library — using it would add a second runtime (Python) to this otherwise Node.js-only
  codebase, on top of the same AI-autonomous-navigation mismatch. Its MCP wrapper
  (`Saik0s/mcp-browser-use`, MIT, 962 stars, pushed 2026-02-11) supports both a `cdp_url`
  (attach to an existing Chrome via remote debugging, same profile caveat as above) and a
  `user_data_dir` (persistent profile) option. Not recommended — wrong language, wrong paradigm.
  Retrieved 2026-09-14.
- **`BrowserMCP/mcp`** — https://github.com/BrowserMCP/mcp — Apache-2.0, 7.1k stars, but
  **last pushed 2025-04-24**, over a year stale as of this research date. Drop from
  consideration on staleness alone regardless of its architecture. Retrieved 2026-09-14.

### Scraping-as-a-service MCPs

- **Apify MCP server** — https://github.com/apify/apify-mcp-server — MIT, free/open-source
  server itself, 7.1k stars, 1,139 commits. Free tier: $5/month platform credit, no credit
  card, 25 concurrent runs. However, it is a **gateway to the Apify Store's paid Actors** —
  most social-scraping Actors (e.g. the "Universal Social Media Metrics Scraper" and
  "Influencer Scraper" found for Instagram/TikTok/YouTube/X) charge **pay-per-result on top of
  compute units**, so a real audit workload will exceed the free credit quickly
  (source: usecarly.com/blog/apify-mcp, retrieved 2026-09-14: "A $4/1,000-results Maps scraper
  can burn your $29 budget without the usage chart ever looking scary"). This is fundamentally
  a paid-SaaS scraping marketplace — **conflicts with constitutional rule 5** beyond trivial
  exploration. Not recommended.

- **Bright Data MCP** — https://github.com/brightdata/brightdata-mcp — MIT license for the
  server code, 2.6k stars, 343 commits. Free tier: 5,000 credits/month (~$7.50 value), no
  credit card, auto-renews monthly, unused credits don't roll over; base tools cost 1
  credit/request, `web_data_*` tools cost 1 credit per record. Pro mode (needed for harder
  anti-bot targets) costs extra. Fundamentally this is a **proxy/unlocker-based scraping
  service**, not a "drive the employee's logged-in browser" tool — its model is anonymized
  residential-proxy scraping of public pages, which doesn't match this project's "employee is
  logged in and browsing normally" design, and social platforms' ToS generally prohibit this
  kind of scraping regardless of vendor. Not recommended for this use case.
  Both retrieved 2026-09-14.

### Platform-specific (Instagram/TikTok/LinkedIn/YouTube) MCPs

- **William-Gao/instagram-mcp** — https://github.com/William-Gao/instagram-mcp — MIT, 0
  stars, 21 commits. Uses **Instagram's official Platform API exclusively** ("No Facebook Page
  required. No private/scraping APIs.") via Meta's Instagram Login, with a long-lived
  `IGAA…` access token. **Critical limitation**: official Instagram Platform/Graph APIs only
  expose data for accounts the token's owner manages (their own Business/Creator account) —
  they cannot fetch an arbitrary competitor's feed. **Not useful for competitor auditing**,
  only for a client's own connected account (and even then requires the client to grant API
  access, out of scope for an audit step). Retrieved 2026-09-14.
- **Sharan-Kumar-R/Custom-MCP-Server** — https://github.com/Sharan-Kumar-R/Custom-MCP-Server —
  scrapes LinkedIn/Facebook/Instagram profiles via unofficial means; low-visibility single-
  author repo, not deep-evaluated. Unofficial scraping of these platforms is against their
  ToS and carries account-ban risk for whatever credentials/session it uses.
  [unverified — maintenance and technique not independently confirmed]. Not recommended
  without much closer scrutiny, and likely disqualified on ToS grounds regardless.
- No credible, actively-maintained, free TikTok/LinkedIn-specific MCP server built for
  third-party (competitor) data collection was found. Two LinkedIn scraper MCPs exist
  (`eliasbiondo/linkedin-mcp-server`, MIT, 185 stars, pushed 2026-03-08; `stickerdaniel/linkedin-mcp-server`,
  Apache-2.0, 3,470 stars, pushed 2026-09-14) but both log the tool itself into LinkedIn and
  scrape — exactly the ToS-risk pattern this project avoids by having a human browse manually.
  A third-party write-up on this category states plainly: "browser scraping and unofficial-API
  methods violate [platform] terms and can trigger [account] restrictions"
  (https://taplio.com/blog/linkedin-mcp-github, retrieved 2026-09-14).
  **YouTube is the one platform with a genuinely usable free official API for competitor data**:
  YouTube Data API v3 exposes public channel/video stats (view/like/comment counts, upload
  cadence) for *any* public channel — client or competitor — via a free, quota-limited Google
  Cloud API key, with no login/session needed at all. A vetted MCP wrapper exists
  (`kirbah/mcp-youtube`, MIT, 29 stars, pushed 2026-09-11) though calling the API directly from
  the app's own code (no MCP) would fit this project's architecture just as well. Worth a
  targeted look as a supplementary, code-driven data source specifically for YouTube if the
  audit ever needs it — it is structurally different from Instagram/TikTok/LinkedIn, where no
  open public API for competitor data exists. Retrieved 2026-09-14.
  Also checked: `mikusnuz/meta-mcp` (Instagram Graph API + Threads, MIT, 24 stars, pushed
  2026-08-29) and `AdsMCP/tiktok-ads-mcp-server` (TikTok **Ads** Marketing API, MIT, 49 stars,
  pushed 2026-07-04) — both confirm the same owned-account-only limitation as William-Gao's
  Instagram tool above; the TikTok one is an ads-API product besides, irrelevant to organic
  content auditing. Retrieved 2026-09-14.

### Section 2 conclusion

**No MCP server is worth adopting for this step.** Every browser-automation MCP found is built
for AI-autonomous browsing, which is the wrong paradigm here and one project maintainer
(`ofershap/real-browser-mcp`) explicitly documents the security risk of letting an agent
operate a real logged-in session. Every scraping-as-a-service MCP (Apify, Bright Data) is a
paid product beyond a token free tier, and scraping social platforms this way generally
violates their ToS regardless of vendor. Platform-specific MCPs either can't reach competitor
data (Instagram's official API only covers owned accounts) or rely on unofficial/ToS-risky
scraping.

**Recommended approach instead (no MCP needed):** use the **Playwright Node.js library**
directly (not through any MCP layer) — `npm install playwright`, free/MIT, Microsoft-
maintained, first-class Windows support (playwright.dev documents Windows explicitly) — and
call `chromium.connectOverCDP('http://localhost:9222')` (or the equivalent) to attach
deterministic app code to the employee's own Chrome, launched with
`--remote-debugging-port=9222`, preserving their real logged-in cookies/session. Confirmed
working pattern via Playwright's own documentation and multiple independent write-ups: "The
`connectOverCDP()` method connects to the Chrome DevTools Protocol endpoint, allowing your
Node.js script to control and interact with an existing Chrome instance that's already logged
in and has all your sessions intact." From there, the app's own code (not an AI, not an MCP)
decides what to screenshot/capture and computes metrics — exactly matching this project's
constitutional rules. Sources: https://playwright.dev (Node API docs), summarized via search
of playwright.dev/BrowserStack/DEV Community write-ups, retrieved 2026-09-14. Playwright MCP
and Chrome DevTools MCP's own documentation (above) independently confirm the CDP-attach
technique is sound and well-supported — just use it as a plain library call, not via MCP.

---

## 3. Prompting and analysis techniques for AI social media audits

### Rubric-based scoring / avoiding open-ended judgment

Anthropic's own guidance on **structured outputs** (JSON Schema-constrained responses, which
this project already uses via `--json-schema`) compiles the schema into a generation grammar
that actively restricts token generation — i.e., forcing Claude's output into a fixed set of
fields/enums is a *stronger* constraint than prompting alone. Use closed `enum` lists (e.g. a
fixed content-pillar taxonomy, a fixed problem-type list matching `rules/problem-types.json`)
rather than open string fields wherever the taxonomy is closed, so Claude cannot invent new
categories. Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs,
retrieved 2026-09-14.

For rubric-based *scoring* specifically, LLM-as-judge literature (a close analogue to scoring
a social presence) converges on a few concrete, applicable techniques:
- **Pairwise/relative comparison beats absolute scoring for consistency.** "Pairwise reaches
  higher human-agreement than absolute scoring because the judge is doing a relative
  comparison instead of an absolute calibration" — relevant to comparing a client against
  competitors: consider having Claude compare client-vs-competitor-A, client-vs-competitor-B
  pairs rather than independently scoring each on a 1-10 scale, to reduce inconsistent
  harshness across passes.
- **Position/order bias is real and correctable.** "Always run both orderings (A vs B and B vs
  A) and average to control position bias" — if comparing multiple competitors in one prompt,
  vary/randomize the order they're presented in, or run twice with swapped order, especially
  for close calls.
- **Anchor examples reduce variance.** "Providing a concrete scored reference example... anchors
  the judge's scoring scale, reducing inter-query variance" — i.e., give Claude one or two
  worked examples of "what a 3/5 vs a 4/5 profile looks like" in the prompt rather than a bare
  numeric scale, if the pipeline ever needs Claude to assign a severity/quality score at all
  (recall: per constitutional rule 1, code — not AI — should be deciding any final numeric
  score; these techniques are more relevant if Claude is asked to classify severity/category
  of a *qualitative* finding, which code then maps to a numeric weight).
  Source: aggregated from arXiv papers and practitioner write-ups on LLM-as-judge calibration
  (arxiv.org/pdf/2605.09227, kinde.com/learn/.../llm-as-a-judge-done-right,
  medium.com/@adnanmasood/rubric-based-evals-llm-as-a-judge), retrieved 2026-09-14 — treat as
  general ML-eval literature, not social-media-specific, but directly transferable.

### Vision: how to reliably analyze feed screenshots

From Anthropic's own official vision docs (https://platform.claude.com/docs/en/build-with-claude/vision,
retrieved 2026-09-14 — primary source, quoted directly):

- **Image-then-text ordering matters**: "Claude works best when images come before text.
  Images placed after text or interpolated with text still perform well, but if your use case
  allows it, prefer an image-then-text structure." → structure audit prompts as: [screenshot(s)]
  then the analysis instructions/schema.
- **Label multiple images explicitly**: "When sending several images, introduce each one with
  a short text label (`Image 1:`, `Image 2:`, and so on) so you can refer to them by name" —
  directly applicable when sending, e.g., 6 competitor post screenshots in one request; label
  each with account name + post date so Claude's findings can cite "Image 3 (competitor X,
  post dated ...)" as evidence.
- **Resolution/token-cost limits (exact numbers)**: images are billed in 28×28px "visual
  token" patches. Two resolution tiers: **standard** (older models) caps at 1568px long edge /
  1568 visual tokens; **high-resolution** (Claude 4.7+) caps at 2576px long edge / 4784 visual
  tokens — "High-resolution images can use up to roughly three times more visual tokens than
  the same image on a standard-tier model." A 1920×1080 screenshot costs ~1560 tokens on
  standard tier (auto-downscaled to 1456×819) vs ~2691 tokens at high-resolution (not
  resized). **Practical implication**: pre-resize captured screenshots before sending to
  control cost — the docs explicitly recommend "downsample images before sending to control
  token costs" when full high-res fidelity isn't needed for the task.
- **Hard limits**: max 8000×8000px per image; max 100 images/request (200k-context models) or
  600/request (other models) via the API; **if a request has >20 images, a stricter per-image
  size limit kicks in for every image in that request** — practical guidance from the docs:
  "either resize each image so that neither dimension exceeds 2000px, or keep the request to
  20 or fewer image/document blocks." This directly bounds how many post screenshots can go in
  one audit request — batch competitor audits in groups of ≤20 images per call, or resize
  aggressively if sending more.
- **Image-quality guidance** (direct quote): "Ensure images are clear and not too blurry or
  pixelated... If the image contains important text, make sure it's legible and not too
  small. Avoid cropping out key visual context solely to enlarge the text." — relevant to a
  grid-vs-individual-screenshot decision: a dense feed-grid screenshot (e.g. 9 posts composited
  into one 1080×1080 collage) will shrink per-post text below a reliable size, whereas
  individual full-resolution post screenshots keep captions/UI text legible. **No official
  Anthropic guidance was found specifically comparing "grid/montage of many posts" vs
  "individual post screenshots"** [gap — not found despite searching the vision docs and the
  best_practices_for_vision cookbook notebook]; the general "text: keep it legible, don't crop
  to force enlargement" principle argues for **individual, higher-resolution screenshots per
  post rather than dense grids**, especially for reading captions/numbers, reserving a grid
  view (if used at all) for coarse visual/branding-consistency impressions only, not for
  anything Claude will cite as evidence of specific text content.
  Adjacent (non-Claude) evidence supports this: Google's ScreenAI paper on UI/infographic VLMs
  (https://arxiv.org/html/2402.04615v3, retrieved 2026-09-14) processed multi-page documents
  page-by-page rather than as one composite image for QA tasks, and found that adding explicit
  OCR-extracted text alongside the image improved dense-text accuracy by up to 4.5 points over
  relying on the vision encoder alone. Different model family, not proof of Claude's behavior
  specifically, but it reinforces "separate images + code-extracted text over one big collage,"
  especially combined with Anthropic's own Image-1/Image-2 multi-image labeling mechanism, which
  is built for several distinct items considered jointly rather than one merged image. Treat
  individual labeled screenshots, batched to <=20 per request, as the recommended default, with
  a composite grid reserved only for a coarse visual/branding-consistency glance the AI is not
  asked to cite specific text from.
- **Documented failure modes** (direct quotes from the official Limitations section): "Claude
  might hallucinate or make mistakes when interpreting low-quality, rotated, or very small
  images under 200 pixels"; "Claude's coordinate and localization outputs are approximate";
  "Claude can give approximate counts of objects in an image but might not always be precisely
  accurate, especially with large numbers of small objects"; "Claude cannot determine whether
  an image is AI-generated." → **do not** have Claude count things in screenshots (likes,
  posts in a grid, followers) — that must come from code-extracted DOM/API text, never from
  vision-based counting.
- Anthropic's cookbook has a dedicated notebook,
  `anthropics/claude-cookbooks/multimodal/best_practices_for_vision.ipynb`
  (https://github.com/anthropics/claude-cookbooks/blob/main/multimodal/best_practices_for_vision.ipynb,
  retrieved 2026-09-14), which states plainly: "You can fix hallucination issues with
  traditional prompt engineering techniques like role assignment." The notebook's full content
  did not render as extractable markdown text via the fetch tool used in this research pass —
  **recommend the team open this notebook directly (it's a short, runnable Jupyter notebook)
  before building the vision-analysis prompts**, since it's the single most on-point official
  resource found and this pass could only partially extract it. [partially unverified —
  notebook exists and is confirmed on-topic, but its full content beyond the hallucination
  quote above was not retrievable through WebFetch].

### Avoiding hallucinated metrics — "code computes, AI narrates"

This exact pattern is Anthropic's own official recommendation for reducing hallucination, and
maps directly onto this project's constitutional rule 1. From
https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
(retrieved 2026-09-14, quoted directly):
- **"Allow Claude to say 'I don't know'"** — explicitly permit uncertainty in every audit
  prompt (matches the project's existing "unknown stays unknown" rule).
- **"Use direct quotes for factual grounding"**: "ask Claude to extract word-for-word quotes
  first before performing its task. This grounds its responses in the actual text, reducing
  hallucinations" — this is exactly the project's existing "code verifies quotes" pattern,
  confirming it's the right approach per Anthropic's own guardrail guidance, not just an
  internal convention.
- **"Verify with citations"**: "have it cite quotes and sources for each of its claims... If
  it can't find a quote, it must retract the claim" — i.e. the two-pass structure (Claude
  drafts a claim → Claude or code checks the claim against a saved quote → unsupported claims
  are dropped) is an Anthropic-recommended pattern, not a novel invention specific to this
  project.
- **"External knowledge restriction"**: "Explicitly instruct Claude to only use information
  from provided documents and not its general knowledge" — apply this explicitly in the
  social-audit prompt: Claude must not use its general/trained knowledge of what a "typical"
  Instagram engagement rate looks like unless that benchmark was itself sourced/coded into the
  input (matches `rules/kpis.json`-style deterministic benchmark tables rather than
  Claude-recalled numbers).
- **Chain-of-thought / best-of-N / iterative refinement** are listed as advanced techniques but
  are generic reliability boosts, not evidence-grounding mechanisms per se — lower priority
  than the citation/quote techniques above for this project's needs.
- **Anthropic's Citations API** (https://claude.com/blog/introducing-citations-api,
  https://platform.claude.com/docs/en/build-with-claude/citations, retrieved 2026-09-14) is a
  structured feature where Claude auto-cites the exact source sentences behind a claim, with
  internal Anthropic evals showing up to 15% recall-accuracy improvement over manual
  citation-prompting. Important caveat: it operates on **text/PDF documents**, not on image
  content — usable for captured caption/comment *text* evidence, not for screenshot/vision
  evidence (use the manual extract-quote-then-verify prompting pattern above for that). It is
  also an Anthropic **API** feature; whether it is reachable through this project's headless
  `claude -p` CLI subscription-login path, versus requiring a separate paid API key (which
  constitutional rule 5 bans), is **[unverified — flag for engineering verification before
  relying on it]**.

**General pattern name**: this is usually described in industry write-ups as "grounded
generation" or "retrieval/tool-augmented narration" — the numeric/factual layer is computed or
retrieved by deterministic code, and the LLM's only job is to write natural-language narrative
*around* already-verified facts, never to produce the facts itself. No single canonical
paper/write-up specific to "marketing dashboards" was found beyond the Anthropic guardrails
doc above and the LLM-as-judge calibration literature already cited; treat the Anthropic
guardrails page as the primary, most authoritative source for this technique.

### Content-pillar / content-category classification

No dedicated write-up specific to "social media content pillar classification with LLMs" was
found [gap]. The generally-applicable, directly-sourced technique is: define a **closed
taxonomy as a JSON Schema enum** (not free text) matching whatever content-pillar categories
the project's own catalog/rules define, and require Claude to pick from that fixed list per
post plus a confidence indicator — schema-level enums are enforced by Claude's structured-
output grammar constraint (see Rubric section above), which prevents category drift/invention
far more reliably than prompt instructions alone. Source: same structured-outputs doc as
above, retrieved 2026-09-14.

General industry consensus on pillar taxonomies (aggregated, non-authoritative marketing
sources — stackinfluence.com, storychief.io, versacreative.com, retrieved 2026-09-14): brands
typically run 3–5 pillars, commonly educational, entertaining/behind-the-scenes, inspirational,
promotional/commercial, and user-generated/social-proof content. An academic classification
framework also exists — "A Framework for Categorizing Social Media Posts," *Cogent Business &
Management* (https://www.tandfonline.com/doi/full/10.1080/23311975.2017.1284390) — but the
publisher page returned HTTP 403 during this research pass, so its actual category labels are
**[unverified]**; worth a manual read before adopting its taxonomy wholesale. No taxonomy found
is Claude/AI-specific or vision-specific — this is generic marketing practice. Recommend the
project define its own fixed pillar list in code/rules data (per constitutional rule 1 — pillar
definitions are a "decision," so they belong in code, not in an AI prompt), with Claude only
classifying each post into that fixed list via the schema-enum mechanism above.

### Comparing competitors fairly

Covered under "Rubric-based scoring" above (pairwise comparison, order randomization, anchor
examples) — this is the most directly relevant, sourced guidance found for this sub-question.
No marketing-specific write-up on comparing social-media competitors with LLMs was found; the
LLM-as-judge calibration literature is the best available source and transfers cleanly since
"compare N competitors on the same rubric" is structurally identical to "judge N candidate
responses on the same rubric."

**Quantified position-bias evidence** (independent verification pass, not just general
literature): a dedicated benchmark, https://github.com/lechmazur/position_bias (retrieved
2026-09-14), shows identical content pairs given to judge models in both orders and measures
whether the judge flips its preference — 193 story pairs, 36 models, 386 prompts/model. Results:
**average first-position preference bias of 64.3%** (judges systematically favor whichever item
is shown first); **median model flips its verdict in 41.3% of swapped-order cases**; average
first-position rating bonus of **+0.271 on a 1–7 scale**. This is concrete, quantified
confirmation that scoring "client vs. N competitors" in one prompt, in a fixed order, will
systematically bias toward whichever brand appears first (or last, depending on the model).
Corroborated by arxiv.org/abs/2406.07791 ("Judging the Judges: A Systematic Study of Position
Bias in LLM-as-a-Judge") and aclanthology.org/2025.ijcnlp-long.18.pdf, retrieved 2026-09-14.
**Concrete mitigation for this project**: score each brand/competitor **independently, in its
own separate call**, same rubric/schema, temperature 0 — then let deterministic code compare
and rank the resulting structured scores afterward. This also satisfies constitutional rule 1
(code, not AI, decides/compares) more directly than any in-prompt debiasing trick.

**Rubric/JSON-schema grading pattern reference**: promptfoo's model-graded rubric docs
(https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/,
retrieved 2026-09-14) and rubric-grading papers (arxiv.org/pdf/2605.30244,
arxiv.org/pdf/2601.08430, retrieved 2026-09-14) recommend: temperature 0 for reproducibility;
each rubric item returns a score/verdict **plus a rationale plus a pointer to the specific
evidence** (which image number / which quoted text) grounding it, not one freeform paragraph —
"if the format of structured representations is loose or inconsistent, LLMs often fail to reuse
evidence reliably to support assessments." This directly supports designing the audit's JSON
schema with a dedicated `evidence` field per claim/score so code can programmatically verify the
cited evidence exists (matches this project's rule 3, "code verifies quotes").

### Bilingual Arabic/English content handling — important finding

**Claude's vision is not reliable for Arabic OCR/text-in-image reading.** Search results
(aggregated from datastudios.org and general OCR-comparison write-ups, retrieved 2026-09-14,
cross-checked against Anthropic's own documented vision limitations) converge on: "Claude...
makes frequent errors on scanned documents, right-to-left scripts like Arabic..."; Claude
"frequently reverses word order, confuses similar Arabic letters, and drops diacritics when
attempting Arabic text extraction," due to Arabic's positional letterforms (initial/medial/
final/isolated shapes). This is a **load-bearing finding for this project**: the audit will
capture Arabic-language post captions/comments constantly, and Claude's vision should **not**
be trusted to transcribe Arabic caption text directly from a screenshot as evidence. Instead,
wherever possible the code-side capture step should extract **actual Arabic text via the DOM
(the real HTML text nodes / platform's own rendered text), not via image OCR** — reserving
vision analysis for genuinely visual judgments (layout quality, image/branding consistency,
visual design problems) rather than for reading dense Arabic text. This directly refines the
project's "code captures posts/screenshots, Claude analyzes text and screenshots" design: the
**text** should be captured as text (DOM extraction), and screenshots reserved for what only
vision can judge (visual design, not word-for-word Arabic content).
Sources: https://www.datastudios.org/post/can-claude-analyze-images-and-screenshots-vision-features-and-limitations
(retrieved 2026-09-14) plus Anthropic's own vision-limitations text ("Claude might hallucinate
or make mistakes when interpreting low-quality, rotated, or very small images") as
corroboration; the Arabic-specific claims are from a secondary source and not from Anthropic
directly — **mark as [moderately verified]**: consistent across multiple independent sources
but not confirmed against Anthropic's own primary documentation, which does not call out
Arabic specifically.

Screenshot-quality guidance more generally (from a secondary aggregation, retrieved
2026-09-14, treat as **[unverified]**/lower-confidence than the Anthropic-primary findings
above): "text extraction is most reliable when the screenshot is high-resolution, cropped to
focus on the area of interest... accuracy diminishes when screenshots include small font
sizes, dense tables with minimal spacing, multi-column layouts with ambiguous reading order,
or faint, low-contrast text" — consistent with, and reinforces, Anthropic's own official
"keep text legible, don't crop to force enlargement" guidance cited above.

### Reddit / community threads

Searched r/ClaudeAI, r/PromptEngineering, r/marketing for "AI social media audit," "vision
model marketing analysis," "LLM hallucination metrics dashboard" combinations. **No
specifically on-topic, citable threads were found** — search results returned only generic
subreddit-stats pages and unrelated tooling links, no actual discussion threads matching this
niche combination. This sub-question has **thin evidence available**; the Anthropic primary
docs and general LLM-as-judge/eval literature above are the strongest sources found, and no
community-forum corroboration was located. Retrieved 2026-09-14.

---

## Summary

1. **Claude Code skills/plugins**: nothing worth adopting. Official Anthropic marketplace and
   skills repo have no marketing/social content. Every community skill repo evaluated is either
   ungrounded (prompt templates asserting scores/benchmarks as fact), paid-API-backed
   (conflicts with "zero new paid software"), or attached to a repo with credibility red flags
   (star counts wildly disproportionate to commit activity). At most, borghei's
   `social-media-analyzer` formula/threshold design is worth using as a *reference*, not
   installing.
2. **MCP servers**: nothing worth adopting. Every MCP surveyed assumes an LLM client sits in a
   loop deciding the next browser action, tool call by tool call — a legitimate pattern for
   interactive AI-driven browsing, but the wrong shape for this project, where **code** must
   deterministically open pages, wait, capture screenshots, and hand fixed artifacts to a
   separate offline vision call with no live AI-in-the-loop browsing decision at all (one
   maintainer's own README, `ofershap/real-browser-mcp`, explicitly documents the security risk
   of letting an agent drive a real logged-in session). Scraping-as-a-service MCPs (Apify,
   Bright Data) are paid products beyond trivial free credits and generally conflict with
   platform ToS regardless of vendor. Platform-specific MCPs either can't reach competitor data
   (Instagram/Meta's and TikTok's official APIs only cover accounts the token owner controls)
   or rely on ToS-risky unofficial scraping (LinkedIn). The one exception is **YouTube**, whose
   Data API v3 legitimately exposes public channel stats for *any* channel — including
   competitors — via a free API key, worth a targeted look if YouTube is in scope.
   `hangwin/mcp-chrome` is the one browser-MCP that genuinely reuses a daily Chrome profile
   (via extension, not remote-debugging) without the profile restrictions other CDP-based tools
   hit, but it's still built for AI-driven control, not scripted capture. **Recommended
   instead**: skip MCP entirely for this step and use the free, Microsoft-maintained,
   Windows-supported Playwright Node.js library directly, attaching to the employee's real
   logged-in Chrome via `chromium.connectOverCDP()` against a `--remote-debugging-port`-launched
   Chrome with a dedicated, persistently-logged-in profile (or a saved `storageState.json`) —
   exactly matching the project's own constitutional rules with zero new paid or ToS-risky
   dependencies, and zero MCP-driven context/token overhead from screenshots flowing through a
   tool-call loop.
3. **Prompting/analysis techniques**: several genuinely useful, well-sourced findings from
   Anthropic's own primary documentation: image-before-text ordering, explicit image labeling
   for multi-image requests, concrete resolution/token-cost numbers and the ≤20-image/request
   sizing rule, official confirmation that "extract quotes first, then cite them, retract
   unsupported claims" is Anthropic's own recommended hallucination-reduction pattern (matching
   this project's existing evidence-citation design), and enum-constrained structured outputs
   for closed taxonomies (content pillars, problem types). Anthropic's Citations API could
   strengthen text-evidence grounding but only covers text/PDF (not images), and it's
   unconfirmed whether it's reachable through the project's subscription-based CLI path rather
   than a paid API key. The most important actionable finding: **Claude's vision should not be
   trusted to transcribe Arabic text from screenshots** — capture Arabic post text via DOM
   extraction in code, and reserve vision analysis for visual/design judgments only. Quantified
   position-bias research (64.3% average first-position bias, 41.3% verdict-flip rate on order
   swap) makes a strong, specific case for scoring each competitor **independently in its own
   call** rather than comparing several brands "vibes-first" in one pass — deterministic code
   then ranks the resulting structured scores. Community/Reddit corroboration for this niche
   combination of topics was thin to nonexistent — the Anthropic primary docs and general
   LLM-as-judge/eval literature carry most of the weight here.
