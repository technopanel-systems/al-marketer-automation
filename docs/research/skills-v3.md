# Skills v3: vetted marketing and business-analysis skills, distilled for our prompts

Date: 2026-09-15. Method: the `find-skills` process (skills.sh leaderboard, then `npx skills find`, then quality checks, then reading the full SKILL.md, then a project-level install). Skills CLI version 1.5.26.

Raw search output (25 queries), star counts, install counts and copies of every SKILL.md we read are saved in `C:\Users\jerom\AppData\Local\Temp\claude\skills-v3\` (`find-*.txt`, `stars*.tsv`, `installs.tsv`, `src/`, `ref/`).

**Why this matters.** Our AI steps run as headless `claude -p --setting-sources '' --disable-slash-commands`, so installed skills **do not load inside pipeline runs**. They help in two ways: (a) they guide Claude Code while we build the project, and (b) they give us methods we copy into our own prompts (`ai/prompts.js`, `ai/steps/*.js`). Section 4 is the part to paste into the prompts.

---

## 1. Method and quality bar

1. **Leaderboard** (skills.sh): the top of the leaderboard is developer skills. The marketing entries are dominated by `coreyhaines31/marketingskills` (seo-audit 207K, copywriting 201K, marketing-psychology 143K, content-strategy 140K). skills.sh has a "Marketing" category but no business-analysis category.
2. **CLI search**: 25 queries (marketing research, market research, competitive analysis, competitor analysis, business analysis, business model, swot, pricing strategy, customer research, persona, market sizing, brand audit, content strategy, paid ads audit, meta ads, google ads, social media audit, marketing plan, go to market, positioning, customer support, sales funnel, proposal writing, report writing, data analysis). That gave about 400 hits and about 230 unique skills.
3. **Quality bar**: we prefer 1K+ installs, are cautious under 100, prefer known sources, and are sceptical of repos under 100 GitHub stars. Exact install counts come from the skills.sh JSON-LD (`userInteractionCount`). Stars come from `gh api repos/<owner>/<repo>`.
4. **Full read**: we read every SKILL.md that passed the bar, plus the reference files of the skills we installed. We rejected anything that sends data to outside services, needs a paid API or SaaS (constitution rule 5), runs unexpected network scripts, has a license that blocks commercial use, or is mostly fluff.
5. **Install**: at project level, `npx -y skills add <owner/repo> --skill <name> -a claude-code -y --copy`. Each install is recorded in `skills-lock.json`. We checked that each installed SKILL.md matches the copy we read (the only difference is CRLF line endings). A scan of all installed files found no shell commands and no outbound calls.

---

## 2. Installed in this round (8)

| Skill | Source | Installs | Stars | License | What it adds that we did not have | Pipeline steps |
|---|---|---|---|---|---|---|
| `customer-research` | coreyhaines31/marketingskills | 94.2K | 50.4K | MIT | JTBD / pain / trigger / outcome / alternative / language extraction; confidence rule (1 source low, 2 medium, 3+ high); sample-bias notes; personas only from 5+ data points, proxy personas labelled as such; 5-why laddering | notes, research, diagnosis, internal report |
| `product-marketing` | coreyhaines31/marketingskills | 64.7K | 50.4K | MIT | A 12-section context record: competitor tiers (direct / secondary / indirect), JTBD four forces (push / pull / habit / anxiety), objections and anti-persona, customer language, proof points | notes, research (business, brand), write |
| `ads` | coreyhaines31/marketingskills (listed on skills.sh as `paid-ads`, 55.3K) | 62.0K | 50.4K | MIT | Audit guardrails: pass / fail / unknown / not-applicable; **coverage kept separate from health**; benchmark evidence ladder; Ad Library teardown schema; ad-to-landing-page congruence; paid-ads checklist for e-commerce | research (channels), competitors, diagnosis, review |
| `offers` | coreyhaines31/marketingskills | 39.4K | 50.4K | MIT | Value equation (dream outcome × likelihood ÷ time delay × effort); 6-part offer anatomy; service and agency-retainer offer formats; rules against fake scarcity | research (business), diagnosis, write, internal report |
| `marketing-plan` | coreyhaines31/marketingskills | 50.0K | 50.4K | MIT | A current-state rubric covering 17 areas (0–5 each) and how to read its "shape"; problem size × frequency gate; exec summary, open-decisions and measurement structure; "hope is not a strategy", kill criteria. SaaS and funding bias, so we adapt it | diagnosis, internal report |
| `competitive-brief` | anthropics/knowledge-work-plugins (official) | 2.9K | 24.0K | Apache-2.0 | Messaging comparison matrix; promise / evidence / mechanism / uniqueness; narrative analysis (villain / hero / transformation / stakes); messaging quality lens; content-format coverage grid; 2×2 positioning map; category strategy | competitors, research (brand), internal report |
| `consulting-analysis` | bytedance/deer-flow | 2.7K | 82.5K | MIT | Report method: pick 2–4 frameworks that the data can support; What → Why → So what; Data → Psychology → Implication; per-chapter data needs ranked P0 / P1 / P2; zero-hallucination protocol; titles that state the insight | internal report |
| `brand-audit` | arnabbagxd/Brand-building-skills | 1.1K | 649 | MIT | Six-dimension brand scorecard (positioning clarity, visual consistency, messaging consistency, voice, audience alignment, differentiation), each with an Issue → Evidence → Impact format; tests like "could this apply to a competitor?" and "homepage hero vs social bio" | research (brand), diagnosis |

Already installed before this round (not reinstalled): `frontend-design` (anthropics), `web-design-guidelines` (vercel-labs), `seo-audit`, `cro`, `analytics`, `competitor-profiling`, `social`, `copywriting` (coreyhaines31), plus `ui-ux-audit` at user level.

**Cautions about the installed skills (for Claude Code sessions in this repo)**
- `product-marketing` writes `.agents/product-marketing.md` when someone invokes it. Several marketing skills read that file. Do not create it for Al-Marketer unless the owner wants it.
- `marketing-plan` has an optional "publish to a GitHub repo" step. It asks first. In this repo, never accept it (CLAUDE.md git rules).
- `consulting-analysis` defaults to `output_locale = zh_CN` and GB/T 7714 citations. Always ask for English output and our own citation ids.
- `ads/references/creative-research-automation.md` mentions Chrome and Slack connectors for scheduled reports. That is optional and needs the user to set it up. Nothing is sent by the skill itself.
- The `offers` skill promotes guarantees, scarcity and bonus stacks. Our client proposal **must not** use them (WRITING_RULES). Use them only to *diagnose the client's own offer*.

---

## 3. All candidates considered

Installs are exact skills.sh counts where fetched; `~` means the count comes from search results. Stars are for the whole source repo. "Read" means the full SKILL.md was read.

| Skill | Source | Installs | Stars | Verdict | Reason |
|---|---|---|---|---|---|
| customer-research | coreyhaines31/marketingskills | 94.2K | 50.4K | **Installed** | See §2 |
| product-marketing | coreyhaines31/marketingskills | 64.7K | 50.4K | **Installed** | See §2 |
| ads (paid-ads) | coreyhaines31/marketingskills | 62.0K | 50.4K | **Installed** | See §2 |
| marketing-plan | coreyhaines31/marketingskills | 50.0K | 50.4K | **Installed** | See §2 |
| offers | coreyhaines31/marketingskills | 39.4K | 50.4K | **Installed** | See §2 |
| competitive-brief | anthropics/knowledge-work-plugins | 2.9K | 24.0K | **Installed** | See §2 |
| consulting-analysis | bytedance/deer-flow | 2.7K | 82.5K | **Installed** | See §2 |
| brand-audit | arnabbagxd/Brand-building-skills | 1.1K | 649 | **Installed** | See §2 (mid reputation, but the method is concrete and needs no tools) |
| content-strategy | coreyhaines31/marketingskills | 140.2K | 50.4K | Not installed (read) | Blog/SEO focus; overlaps installed `social` + `seo-audit`. The owned / rented / borrowed channel idea is distilled in §4.4 |
| marketing-psychology | coreyhaines31/marketingskills | 143.1K | 50.4K | Rejected (skimmed) | A glossary of about 70 mental models with no procedure; the model already knows these |
| pricing (pricing-strategy) | coreyhaines31/marketingskills | 61.0K | 50.4K | Not installed (read) | SaaS tier and value-metric focus; the price-transparency check is distilled in §4.2 |
| competitors | coreyhaines31/marketingskills | 60.3K | 50.4K | Rejected (skimmed) | Builds "X vs Y" SEO pages, which is not our job |
| sales-funnel-blueprint | autonnel/autonnel-skills | 52.3K | 9 | Rejected (read) | 52K installs with 9 stars is not believable; it also promotes the author's own funnel builder (docker compose) |
| firecrawl-market-research | firecrawl/firecrawl-workflows | 32.1K | 161 | Rejected (read) | Needs a paid `FIRECRAWL_API_KEY` (rule 5) |
| persona-researcher / persona-* (10) | googleworkspace/cli | 27–29K | 31.0K | Rejected | Google Workspace CLI role presets, not customer personas |
| market-sizing-analysis | wshobson/agents | 10.2K | 39.7K | Rejected (read) | Startup TAM/SAM/SOM for investor decks; not useful for SMB proposals |
| market-research | affaan-m/ECC | 3.5K (~10.4K listed) | 258.7K | Rejected (read) | Short and generic; its untrusted-source rules are already in our EVIDENCE_RULES |
| emblem-market-research | EmblemCompany/Agent-skills | 8.9K | 12 | Rejected | Crypto market data; 12 stars |
| datanalysis-credit-risk | github/awesome-copilot | ~7.4K | 39.0K | Rejected | Credit-risk modelling, off topic |
| data-analysis | claude-office-skills/skills | ~7K | 468 | Rejected | Spreadsheet analysis through office-mcp; off topic |
| competitor-analysis | aaron-he-zhu/seo-geo-claude-skills | ~6K | 203 | Rejected | SEO keyword-gap tooling; covered by `seo-audit` |
| google-ads-manager / facebook-meta-ads | claude-office-skills/skills | ~5.5K / ~4.4K | 468 | Rejected | Needs office-mcp, runs account operations, low stars |
| competitive-analysis | claude-office-skills/skills | 4.4K | 468 | Rejected (read) | Generic, wants office-mcp docx/xlsx output, low stars |
| competitor-analysis | every-app/open-seo | ~4.4K | 18.8K | Rejected | Tied to its own SEO tool |
| google-ads-api-* / google-mobile-ads-* | google/skills | ~3.3–4K | 19.9K | Rejected | Developer API and mobile ads SDK setup; we have no ad-account access |
| ads-meta / ads-google / ads-audit / ads-competitor / ads-report | AgriciDaniel/claude-ads | 3.9K / ~3.7K / 3.4K / – / – | 9.3K | Rejected (read) | Needs ad-account exports, a Python core and a root `ads` contract that a single `--skill` install does not bring. Its guardrails (pass/fail/unknown, coverage) are already copied into the installed `ads` |
| competitor-analysis | phuryn/pm-skills | ~3.4K | 26.3K | Rejected (read) | Generic, web-search-heavy product template; `competitive-brief` goes deeper |
| business-model | phuryn/pm-skills | 3.3K | 26.3K | Not installed (read) | A generic Business Model Canvas; a light version is distilled in §4.2 |
| swot-analysis | phuryn/pm-skills | 2.7K | 26.3K | Not installed (read) | Generic; its TOWS crossings are distilled in §4.9 |
| gtm-strategy / market-sizing / user-personas / positioning-ideas / pricing-strategy | phuryn/pm-skills | ~2.6–2.8K | 26.3K | Rejected (read) | Product-launch and startup templates, thin |
| competitive-platform-analysis | affaan-m/ECC | ~3.2K | 258.7K | Rejected | Only scopes and scores a competitor set before benchmarking; our team confirms competitors |
| competitor-analysis | eronred/aso-skills | ~3.1K | 1.9K | Rejected | App Store optimization |
| apify-competitor-intelligence / apify-market-research | apify/agent-skills | ~2.6K / ~3.4K | 2.4K | Rejected | Needs Apify actors and a token (paid route, rule 5) |
| customer-research | anthropics/knowledge-work-plugins | 2.8K | 24.0K | Rejected (read) | Support-desk research over an internal KB and CRM |
| competitive-intelligence | anthropics/knowledge-work-plugins | 4.2K | 24.0K | Rejected (read) | Sales battlecard as HTML; overlaps `competitive-brief`. Its "landmine questions" idea is used for next-meeting questions |
| brand-review | anthropics/knowledge-work-plugins | 2.8K | 24.0K | Not installed (read) | Reviews copy against a brand guide; its legal-claim flags are distilled into §4.7–4.8 |
| customer-escalation | anthropics/knowledge-work-plugins | ~2.6K | 24.0K | Rejected | Support escalation, off topic |
| content-strategy | anthropics/knowledge-work-plugins | 1.5K | 24.0K | Rejected (read) | Needs QuickBooks / PayPal / Square connectors |
| competitive-analysis | anthropics/financial-services | 2.2K | 34.8K | Rejected (read) | Investment deck in PowerPoint; financial metrics |
| positioning | RefoundAI/lenny-skills | 487 | 1.3K | Rejected (read) | A collection of podcast quotes; low installs |
| pricing-strategy | RefoundAI/lenny-skills | 2.1K | 1.3K | Rejected (read) | SaaS pricing quotes |
| competitive-analysis | RefoundAI/lenny-skills | ~2.7K | 1.3K | Rejected | Same quote-collection format |
| swot-analysis | deanpeters/Product-Manager-Skills | 413 | 7.0K | Rejected (read) | **CC BY-NC-SA 4.0 (non-commercial)**; Al-Marketer is commercial. The method is good, but none of its wording is copied |
| positioning-statement | deanpeters/Product-Manager-Skills | 2.0K | 7.0K | Rejected (read) | Same non-commercial license; the Moore template is common knowledge |
| data-analysis | bytedance/deer-flow | ~3.3K | 82.5K | Rejected | Data-file and SQL analysis; not needed |
| marketing-plan | slavingia/skills | 2.4K | 10.3K | Rejected (read) | Founder audience-building philosophy, no audit method |
| gtm-positioning-strategy | github/awesome-copilot | 1.9K | 39.0K | Rejected (read) | Enterprise AI-product A/B stories. The "shared claims are table stakes" check is distilled in §4.5 |
| market-research-reports | K-Dense-AI/scientific-agent-skills | 1.5K | 45.0K | Rejected (read) | Tells the agent to cite the authors' paper and fetch arXiv (self-promotion and unexpected network use); macro-market sizing. Its claim rules are distilled in §4.0 |
| market-research-reports | davila7/claude-code-templates | ~1.8K | 30.7K | Rejected | Mirror of the K-Dense skill |
| social-media-analyzer | alirezarezvani/claude-skills | 1.5K | 26.0K | Rejected (read) | Unsourced benchmarks, invented "$ per like" values, Python scripts. It conflicts with "code decides numbers" |
| business-analyst | sickn33/agentic-awesome-skills | 1.5K | 46.4K | Rejected (read) | A generic capability list with no method |
| competitive-analysis / user-persona | Owl-Listener/designer-skills | ~1.6K | 2.7K | Rejected | UX-pattern comparison, not market |
| content-strategy-sms | blacktwist/social-media-skills | ~1.8K | 502 | Rejected | Tied to a scheduling tool; covered by `social` |
| exploratory-data-analysis | K-Dense-AI / davila7 | ~1.7K / ~1.8K | 45.0K / 30.7K | Rejected | Scientific data files |
| brand-analyzer | ailabs-393/ai-labs-claude-skills | ~1.1K | 445 | Rejected | Repo stale (last push 2025-11); `brand-audit` chosen |
| meta-ads / google-ads / brand-positioning | arnabbagxd/Brand-building-skills | ~1.1–1.2K | 649 | Rejected | `ads` installed; positioning is covered |
| meta-ads / google-ads / competitor-research / gtm-strategy / content-strategy / pricing-strategy / research-sources | kostja94/marketing-skills | ~0.8–2K | 971 | Rejected | Under 1K stars and duplicates the coreyhaines31 equivalents |
| keyword-research / campaign-planner / positioning-mapper / pricing-packaging-planner | aaron-he-zhu/aaron-marketing-skills | ~0.7–1.4K | 2.8K | Rejected | Campaign execution planners, not diagnosis |
| ecommerce-competitor-analysis / competitor-price-analysis / tiktok-shop-content-strategy | nexscope-ai/eCommerce-Skills | ~0.9–1.1K | 938 | Rejected | Marketplace (Amazon/Etsy/TikTok Shop) tooling |
| building-full-social-audit-for-brand | apidojo-io/apidojo-skills | ~328 | 1 | Rejected | 1 star; built on paid scrapers |
| meta-ads-audit / paid-ads | nowork-studio/notfair-plugin | ~218 / ~36 | 3.8K | Rejected | Under 1K installs |
| campaign-audit / funnel-architect / seo-audit | indranilbanerjee/digital-marketing-pro | ~80–138 | 815 | Rejected | Under about 150 installs |
| icp-research / market-research / research-digest | thatrebeccarae/claude-marketing | ~87–94 | 141 | Rejected | Under 100 installs |
| market-researcher-agent | michaelboeding/skills | ~87 | 27 | Rejected | Under 100 installs and under 100 stars |
| researching-markets / creating-swot-analysis | jesseotremblay/claude-skills | ~101 / ~33 | 1 | Rejected | 1 star |
| marketing-research | ishwarjha/claude-marketing-research-skill | ~44 | 49 | Rejected | Under 100 on both |
| autoresearch | ericosiu/ai-marketing-skills | ~163 | 3.5K | Rejected | Low installs; an auto-loop research runner |
| customer-research / seo-research | hyperfx-ai/marketing-skills | ~141 / ~148 | 87 | Rejected | Under 100 stars |
| social-media | aitytech/agentkits-marketing | ~368 | 603 | Rejected | Low installs; covered by `social` |
| content-audit | social-media-skills/skills | ~251 | 86 | Rejected | Under 100 stars |
| discover-market-sizing | product-on-purpose/pm-skills | ~529 | 673 | Rejected | Market sizing not needed |
| market-sizing | OneWave-AI/claude-skills | ~201 | 292 | Rejected | Market sizing not needed |
| go-to-market-plan | ognjengt/founder-skills | ~909 | 303 | Rejected | Startup launch plan |
| market-research-analysis | manojbajaj95/claude-gtm-plugin | ~843 | 100 | Rejected | Borderline stars; generic |
| business-model-canvas | ScientiaCapital/skills | ~395 | 28 | Rejected | Under 100 stars |
| business_model_decoder_skill | Wind-Alice/AliceMarket | ~275 | 112 | Rejected | Low installs |
| opc-business-model-design | easychen/opc-methodology | ~217 | 16.8K | Rejected | One-person-company design, not client diagnosis |
| business-analysis | kienhaminh/anti-chaotic | ~115 | 79 | Rejected | Under 100 stars; software BA |
| sec-business-desc-analysis | OctagonAI/skills | ~256 | 127 | Rejected | SEC filings |
| business-analyst | rmyndharis/antigravity-skills | ~168 | 1.5K | Rejected | Generic persona |
| swot | neurofoo/agent-skills | ~106 | 114 | Rejected | Low installs |
| swot-pestle-analysis | melodic-software/claude-code-plugins | ~94 | 16 | Rejected | Under 100 on both |
| biz-swot | asgard-ai-platform/skills | ~35 | 228 | Rejected | Under 100 installs |
| sales-market-sizing | mbfinotti/sales-skills | ~196 | 0 | Rejected | 0 stars |
| market-research | shawnpang/startup-founder-skills | ~183 | 325 | Rejected | Low installs; startup |
| market-research | alirezarezvani/claude-skills | ~197 | 26.0K | Rejected | Low installs; same repo as the rejected analyzer |
| dotcom-secrets | guia-matthieu/clawfu-skills | ~302 | 150 | Rejected | A book summary (funnel hacking) |
| funnel-analysis | nimrodfisher/data-analytics-skills | ~216 | 429 | Rejected | Needs event data we do not have |
| funnel-architect | shipshitdev/skills | ~259 | 35 | Rejected | Under 100 stars |
| meta-ads-strategy | adkit/ads-skills | ~348 | 26 | Rejected | Under 100 stars |
| metaads | mfwarren/entrepreneur-claude-skills | ~303 | 68 | Rejected | Under 100 stars |
| paid-ads | borghei/claude-skills | ~97 | 757 | Rejected | Under 100 installs |
| paid-ads | ayrshare/marketingskills | ~23 | 13 | Rejected | A fork; tiny |
| customer-support-verification | MengTo/Skills | ~144 | 6.0K | Rejected | Off topic |
| twilio-customer-support-architect | twilio/ai | ~114 | 32 | Rejected | Off topic |
| customer-support-builder | daffy0208/ai-dev-standards | ~202 | 36 | Rejected | Off topic |
| proposal-writing | maddhruv/absolute | ~161 | 211 | Rejected | Low installs; generic RFP tips |
| frame-a-proposal / write-a-spec | inkeep/open-knowledge-skills | ~142 | 8 | Rejected | 8 stars; software specs |
| proposal-writing | JK-0001/skills | ~100 | 16 | Rejected | 16 stars |
| commercial-proposal-writing | TimLai666/skills | ~61 | 0 | Rejected | 0 stars |
| sales-proposal-page / sales-funnel | sales-skills/sales | ~84 / ~126 | n/a (no GitHub repo) | Rejected | Unverifiable source |
| torob-technical-report-writing | skills.torob.dev | ~524 | n/a | Rejected | Not on GitHub; unverifiable |
| results-report | Galaxy-Dawn/claude-scholar | ~440 | 5.5K | Rejected | Academic experiment reports |
| write-report | fellowship-dev/dogfooded-skills | ~154 | 3 | Rejected | 3 stars |
| data-analysis | lingzhi227/agent-research-skills | ~1.8K | 336 | Rejected | Research-paper data analysis |
| analyzing-data | astronomer/agents | ~1.3K | 443 | Rejected | Airflow / warehouse data |
| data-analysis-jupyter / analytics-data-analysis | Mindrally/skills | ~1.0–1.4K | 259 | Rejected | Jupyter/pandas coding |
| ads | Infrasity-Labs/dev-gtm-claude-skills | ~90 | 123 | Rejected | Under 100 installs; dev-tool GTM |

No proposal-writing or report-writing skill passed the bar. The report method comes from `consulting-analysis` + `marketing-plan`, and the proposal rules stay ours.

---

## 4. Distilled methodology per pipeline step (prompt-ready)

Rules that apply to every block below:
- Nothing here changes who decides services, deliverables, timing, KPIs or numbers. Code decides those (constitution rule 1). The bullets only improve **what AI observes, how it reasons and how it writes**.
- The bullets are plain text with no backticks and no `${`, so they can be pasted into template literals in `ai/prompts.js` or `ai/steps/*.js`.
- Tags like `[ads]` or `[customer-research]` show which skill a bullet came from.

### 4.0 Cross-cutting evidence discipline (add to EVIDENCE_RULES)

```text
<evidence_discipline>
- Label every statement in your head as FACT (backed by a cited evidence id), INFERENCE (reasoned from named facts) or ASSUMPTION (not supported). Only FACTS and clearly marked INFERENCES may appear in output; assumptions go to missing information or questions. [consulting-analysis, market-research-reports]
- What a brand says about itself (website, bio, ads: "best quality", "fastest delivery") is a CLAIM, not proof. Treat it as the brand's positioning, never as a verified strength, unless independent evidence (customer reviews or comments, checks, marketplace ratings) supports it. [competitive-brief]
- Customer voice outweighs brand voice. Reviews, comments and quotes from the meeting notes about customers are the strongest evidence for weaknesses. [customer-research]
- Absence of evidence means UNKNOWN, not NO. Only a check (K###) that actually looked for something can show it is missing. A page that failed to load or hit a login wall proves nothing. [ads audit-guardrails, market-research-reports]
- Keep what you could check separate from what you found. An item you could not check never counts as a weakness; it counts as missing coverage. [ads audit-guardrails]
- One quote supports one claim. Split compound claims that rely on different evidence. The same text repeated by two pages is one source, not two. [market-research-reports]
- Confidence: a theme seen in one source is low, in two independent sources medium, in three or more independent sources high. A count of comments or mentions is not a share of the market. [customer-research]
- Prefer recent evidence (last 12 months). Say when evidence is old. [customer-research]
- Benchmarks are context, never pass/fail lines. Compare in this order: the client's own history, then the confirmed competitors measured by our checks, then a broad industry figure (only if it is in the data, and only as a direction). Never import a benchmark number from memory. [ads audit-guardrails]
- When sources disagree, keep both, say which is more direct or more recent, and lower confidence. [customer-research]
</evidence_discipline>
```

### 4.1 Notes step (Haiku: meeting notes → facts)

```text
<what_to_look_for_in_notes>
From the meeting notes, extract, always with a verbatim quote:
- Customer jobs: the task the client's customers want done, how they want to feel, how they want to be seen. [customer-research JTBD]
- Customer pains in the customers' own words; prefer pains the client mentioned unprompted or with strong emotion. [customer-research]
- Trigger moments: what makes a customer start looking (season, occasion, event, a problem). [customer-research]
- Alternatives customers use instead of the client: named competitors, marketplaces, informal sellers, doing it themselves, doing nothing. [product-marketing]
- Objections and reasons people do not buy; who is NOT a good customer. [product-marketing]
- Switching forces: what pushes customers away from their current option, what pulls them to the client, what habit keeps them where they are, what worries them about switching. [product-marketing four forces]
- Exact customer and client phrases (dialect words) for the problem and for the product; copy them exactly. [customer-research]
- Proof the client mentioned: numbers, named customers, testimonials, awards; copy numbers exactly and never round them.
- The stated ask versus the underlying goal: when the client asks for one thing ("more followers") but describes another goal ("more repeat orders"), record both with quotes. [marketing-plan intake]
- Work the client already did and is proud of (past campaigns, launches, partnerships), so the proposal can acknowledge it. [marketing-plan]
- Things started but stuck, and what blocks them; the owner's "one thing to fix now" and anything they said to ignore. [marketing-plan]
- Contradictions inside the notes: record both sides, do not resolve them.
Map each item to the closest field. If no field fits, keep it as an open item; never force it into a wrong field.
</what_to_look_for_in_notes>
```

Suggested new fields (a code change for later, not done here): `customer_jobs`, `objections`, `customer_language`, `alternatives`, `past_work`, `stuck_items`.

### 4.2 Research: Business & Offers team (and the planned AI business analyst)

```text
<business_lens>
- Business type: online store, service or agency, B2B supplier, marketplace seller, subscription, local shop or branches, or a named hybrid. The main way it earns money decides the type. [marketing-plan client-types]
- The core offer: is it described as an outcome for the customer or as a list of features? Is the scope clear (what is included, what is not)? [offers]
- Offer anatomy as observed (never recommended): core product or service, bundles or gifts, guarantee or return / refund / exchange policy, a real deadline or season, a named offer, price and payment options (cash on delivery, instalments, payment links) only as seen. [offers]
- Value signals from evidence: is the outcome named clearly (dream outcome)? Is there proof that it works: reviews, named customers, before/after, a described method (likelihood)? Are delivery or response times stated (time delay)? How much work is buying: DM to ask price, many steps, unclear shipping (effort)? [offers value equation]
- Price transparency: prices written as text on pages, versus only in images, "DM for price" or "contact us". [pricing teardown]
- Price position (premium / mid / budget) ONLY from captured prices of the client and confirmed competitors; otherwise unknown.
- Canvas-lite, only from evidence: customer segments; channels for awareness, purchase, delivery and after-sale; revenue streams; relationship type (self-serve, personal, community). [business-model canvas]
- For stores: order-value levers seen (bundles, upsells, free-shipping threshold), repeat-purchase mechanics (loyalty, subscriptions, follow-up after purchase), and trust at checkout (reviews, returns, shipping info). [marketing-plan commerce archetype]
</business_lens>
```

### 4.3 Research: Brand & Market team

```text
<brand_lens>
- Positioning clarity: from the evidence, can you say in one sentence who the brand is for and why it is different? Would that sentence also fit a competitor? If yes, the positioning is generic; say so as an observation. [brand-audit, competitive-brief]
- Consistency across surfaces: quote the website's first-screen headline, the Instagram / TikTok / Snapchat bio, the Google listing description and the pinned or top posts. Note where they say different things. [brand-audit]
- Five-second clarity: does the first screen of the website say what is sold, for whom, and what to do next? [competitive-brief, cro]
- Value proposition parts: the promise (outcome), the evidence shown, the mechanism (how it works), and the uniqueness claimed. Mark any part that is missing. [competitive-brief]
- Messaging quality: clarity, differentiation, proof, consistency, and whether it speaks to pains customers actually mention (notes, comments). [competitive-brief]
- Voice: three words for how the brand writes now; dialect and formality; human or corporate; would you recognise it without the logo? [brand-audit]
- Visual identity: logo versions, colours and photo style across website and social, only from captured screenshots and pages. [brand-audit]
- Audience alignment: does the copy use the customers' own words (from notes and comments) or internal jargon? [brand-audit, customer-research]
- Category words: which words the brand uses to describe what it is, compared with competitors. [competitive-brief]
- Give each dimension 1–5 with a one-line cited reason, or "unknown" when the evidence cannot support a score.
</brand_lens>
```

### 4.4 Research: Channels & Digital Presence team (website, social, ads, tracking)

```text
<channels_lens>
- Public paid-ads evidence (only if captured from Meta Ad Library or Google Ads Transparency): number of active ads, products promoted, format split (video / image / carousel), video length groups, share of creator or partnership ads, 3 to 6 recurring message angles, the longest-running ads (a hint of what works), and who each ad group seems to target (INFERENCE). If a field cannot be verified, write unknown. [ads creative-research]
- Ad-to-page match: does the promise, offer, price or product in the ad appear on the first screen of the page it links to? A mismatch wastes the click. [ads]
- Funnel balance: are all ads and posts direct "buy now", or is there content for people who do not know the brand yet? [ads, google-ads checklist]
- Tracking: pixel and tag presence ONLY from checks (Meta Pixel, GA4 / GTM, TikTok, Snap). Purchase events and deduplication cannot be verified from outside, so they are unknown. [ads conversion-tracking]
- Channel ownership: owned (website, store, customer list, WhatsApp list), rented (Instagram, TikTok, Snapchat, marketplaces), borrowed (influencers, press). Note when discovery AND sales both happen only on rented platforms. [content-strategy, not installed]
- Purchase journey: count the steps from first seeing the brand to a paid order, and name where the path depends on a person replying (DM, WhatsApp) or has no checkout. [cro, marketing-plan]
- Organic view per platform, from the social checks only: followers, posting rhythm, top posts by engagement with links, and what the brand keeps doing (educational, offers, user content, creators, behind-the-scenes). [ads creative-research]
- Stage-appropriate absence: no ads for a business with no ad budget, or no English site for a local-only shop, is an observation, not a gap, unless the goals in the notes make it relevant. [marketing-plan rubric notes]
</channels_lens>
```

### 4.5 Competitors step (discovery + comparison)

```text
<competitor_discovery>
- Sort alternatives into tiers: DIRECT (same kind of product, same customers, same market), SECONDARY (a different route to the same need: marketplaces, informal social sellers, big retailers), STATUS QUO (customers doing nothing or doing it themselves). Propose only DIRECT competitors; mention the others in one line as context. [product-marketing]
- For each proposal, note its posture if evident (leader, challenger, niche) and why it competes for the same customer. [competitive-brief]
</competitor_discovery>

<competitor_comparison>
For the client and each CONFIRMED competitor, fill the same grid from saved evidence only (unknown when missing):
- main headline or tagline; target buyer; core value promise; claimed difference; tone and dialect; category words
- visible price approach (prices shown or hidden, price range); offer mechanics (free shipping, cash on delivery, bundles, returns)
- proof shown (reviews, ratings, testimonials, named customers)
- active platforms and posting rhythm (numbers only from social checks); content formats used; public ads presence
- purchase path (website checkout, marketplace, DM, WhatsApp)
Then analyse:
- Shared claims: promises that most competitors make ("best quality", "fast delivery") are the basic minimum, not a difference. Name them. [gtm-positioning, competitive-brief]
- Story each one tells: what it positions against, who the hero is (customer or product), the before/after it promises. [competitive-brief narrative analysis]
- Format coverage: which content formats each uses, and which formats nobody uses. [competitive-brief]
- Positioning map: pick the two axes that matter most in THIS market (for example price level and specialisation) and place each brand only where evidence allows; an empty area is an INFERENCE, not a fact. [competitive-brief]
- Where competitors genuinely do better than the client: say it honestly, with evidence. [competitive-brief]
- What customers praise and complain about for each competitor (reviews, comments); mid ratings are the most honest. [customer-research]
- Opportunities: angles, segments or formats no confirmed competitor covers. Threats: where competitors are strong and the client is weak. Each one cites evidence.
</competitor_comparison>
```

### 4.6 Diagnosis (Opus)

```text
<diagnosis_method>
- Before writing problems, walk this coverage list silently and mark each area as strong, weak or unknown, with evidence: positioning; customer understanding; website first screen; product / service pages; conversion path (checkout, form, WhatsApp); trust and proof; content; after-purchase follow-up and repeat purchase; messaging and voice; price clarity; tracking; campaigns and launches; paid ads; search visibility; Google Maps / local listing; markets and language. Use it to find gaps, not as output. [marketing-plan current-state rubric]
- Read the SHAPE of strengths and gaps, for example: "strong content, weak conversion path" means problems sit in the purchase journey; "ads running, no tracking" is a measurement problem; "all discovery and sales on rented platforms" is a dependency problem; "good traffic signals, weak proof" is a trust problem. [marketing-plan rubric shapes]
- Find the binding constraint: the one weakness that limits the others, like the lowest lever in a value equation. Only binding constraints get severity 3. [offers diagnostic, marketing-plan]
- Offer problem vs content problem: when the outcome is vague, proof is thin, delivery or answers are slow, or buying takes too much effort, diagnose the offer or trust gap, not "needs better posts". [offers value equation]
- For every candidate problem, ask "why does this matter?" 3 to 5 times until you reach a business result (sales, repeat orders, margin, lost leads). Stop at the deepest level the evidence supports. [customer-research 5-why]
- Observation → problem → impact. Never a recommendation, service or solution.
- Unknown is not failing: an ad account, pixel event, customer list or sales number we could not see goes to missingInfo, never to problems. [ads audit-guardrails]
- Do not punish absence that fits the business's stage or budget, unless the client's goals make it relevant. [marketing-plan]
- Stated vs real problem: when the client's ask differs from what the evidence shows, diagnose what the evidence shows and mention the ask in the statement. [marketing-plan intake]
- Specificity test: if the problem would still be true after swapping in a competitor's name, rewrite it or move it to observations. [brand-audit, blueprint]
- missingInfo questions should be able to prove the diagnosis wrong, not only confirm it. [customer-research]
</diagnosis_method>
```

### 4.7 Review (independent sceptic, Sonnet)

```text
<review_checks>
For each proposed problem, challenge it with these questions and say which one fails:
- Is it supported only by the brand's own claims or marketing text? Brand claims cannot prove a strength or rule out a problem. [competitive-brief, SWOT discipline]
- If it is about something missing: did a check actually look for it, and could the check see (no login wall, page loaded)? Otherwise it is unknown. [ads audit-guardrails]
- Is it a solution disguised as a problem ("needs to be on TikTok", "needs a new website")? Reject it, or restate it as the evidenced gap underneath. [SWOT discipline: an item that requires the client to act is a strategy, not a finding]
- Is it a benchmark verdict ("engagement below industry average") without a like-for-like comparison from our competitor checks? Downgrade it. [ads benchmark ladder]
- Is the sample big enough (number of posts, length of window)? A few posts or a short period is not a trend. [ads recommendation safety]
- Does the impact chain skip steps between problem and business result?
- Could the same evidence support the opposite reading? Name that reading.
- Are two problems the same root cause? Suggest merging.
- Does it make unsupported superlative or comparative claims about the client or competitors ("the worst", "the only", "far behind")? Flag them. [brand-review legal flags]
- Is the absence fair to expect for this business's size, budget and market?
</review_checks>
```

### 4.8 Write (Arabic proposal)

```text
<persuasion_structure>
- For each problem → solution pair, write in this order, without new numbers: the result the owner wants (in their words from the notes), why this approach is believable (the evidence we saw and the method), when a first visible result can appear (ONLY the weeks the plan data gives), and how little the owner has to carry (what the team handles). [offers value equation]
- Open with the owner's real goal and the customers' own words; the service name comes later, inserted by the system. [product-marketing, customer-research]
- Acknowledge what the client already does well (from evidence) before naming a gap. [marketing-plan]
- Compare with the client's current situation, not an imaginary rival. Name a competitor only when it is in the approved comparison data, and stay factual and fair. [competitive-brief positioning pitfalls, brand-review]
- Outcomes, not features: one outcome per card. [offers, competitive-brief]
- If the notes show an owner worry (cost, time, "tried before"), answer it with process and proof, never with a guarantee. [offers bonus-as-objection idea, adapted]
- Do not use superlatives without evidence (الأفضل، الأول، الوحيد، الأسرع), fake urgency (عرض لفترة محدودة، آخر فرصة) unless the data gives a real date, or hype words (ثوري، سحري، سري، مضاعفة). [offers banned vocabulary, brand-review]
- Never add bonuses, guarantees, discounts or deadlines; scope and terms come from code. [constitution]
</persuasion_structure>
```

### 4.9 NEW: internal English strategy report (after approval; never sent)

**Structure** (code builds most sections from saved data; the AI analysis pass fills the parts marked AI):

1. **Executive summary** (AI, readable in 60 seconds): one sentence on what this engagement is really about; top 3 insights ranked by impact; the biggest opportunity and the biggest risk; what must be confirmed at the next meeting. [marketing-plan §1]
2. **Strategic frame** (AI): the client in one sentence; the category it competes in; the ideal customer (stated vs real problem); how the business makes money; problem size × frequency (big and frequent / big and rare / small and frequent / small and rare) as an INFERENCE and what that means for acquisition cost and the retention focus. [marketing-plan strategic frame + market-quality gate]
3. **Current state** (code + AI): the coverage list from §4.6 as a table (strong / weak / unknown, with citations), plus a short paragraph on the shape; work already done to acknowledge; stuck items and the cost of doing nothing. [marketing-plan §3]
4. **Customer insight** (AI): jobs, pains, triggers, objections, switching forces; a quote bank in Arabic with English glosses; confidence per theme. [customer-research]
5. **Competitive landscape** (code grid + AI): comparison grid, shared claims, stories, positioning map, where competitors really win, white space. [competitive-brief]
6. **SWOT with crossings** (AI): S/W are internal and current; O/T are external. Crossings: strength × opportunity (what to push), weakness × opportunity (what to fix first), strength × threat (what to defend), weakness × threat (where the client is exposed). Every entry labelled Fact or Inference and cited. [phuryn swot TOWS, consulting-analysis]
7. **Offer & funnel** (AI): value-equation levers scored 1–10 with reasons; which parts of the offer anatomy are missing; the purchase journey and the binding constraint. [offers, marketing-plan]
8. **Measurement & readiness** (code + AI): what is tracked, what is unknown, readiness gaps; how much the audit could verify versus what stayed unknown. No single health score when less than 60% could be checked. [ads audit-guardrails, marketing-plan measurement]
9. **Risks** (AI): delivery risks (access, budget, content assets), market risks, data risks (low-confidence findings), platform dependency; likelihood × damage; each with "owner: team to decide". [SWOT threats ranking, marketing-plan open decisions]
10. **Opportunities outside the scope** (code + AI): business observations that match no catalog item, listed as observations only, never as offers. [constitution rule 4]
11. **Open decisions & next-meeting questions** (AI): ranked by impact; each one is question + why it matters + what it unblocks. Unknown numbers the client can give come first (order value, repeat rate, ad budget, lead volume, conversion counts). Include questions that could disprove our diagnosis, and "why" follow-ups; never leading questions. [marketing-plan open decisions, customer-research, competitive-intelligence landmines]
12. **Evidence appendix** (code): sources with dates, confidence, contradictions, rejected problems with the reviewer's reasons, Claude usage.

```text
<internal_report_rules>
- Audience: Al-Marketer's team, in English; Arabic quotes stay in Arabic with a short English gloss.
- Every sub-section follows What (the data) → Why (the cause or customer psychology) → So what (the implication for this engagement). An insight that stops at the data is incomplete. [consulting-analysis]
- Section and card titles state the insight, not the topic: "Sales stop at the Instagram DM", not "Channels". [consulting-analysis, financial-services competitive-analysis]
- Choose 2 to 4 frameworks that fit the available data (for example SWOT with crossings, value equation, competitor grid, customer jobs). Depth over breadth; drop a framework the data cannot support. [consulting-analysis]
- Zero invented numbers. When important data is missing, write "Data not available" and add it to the open questions. [consulting-analysis, marketing-plan]
- Keep facts, inferences, assumptions and suggestions visibly separate. Suggestions never add services, deliverables, timelines or KPI targets beyond what code decided; code-decided KPIs may be quoted, never changed. [constitution]
- Hope is not a strategy: every opportunity names its mechanism (why it would work) and the signal that would show it is working (from code KPIs, or "to be defined by the team"). [marketing-plan]
- Name uncomfortable findings plainly; do not pad; say "nothing to add" when a section has nothing. [marketing-plan quality bar]
- Exit criteria are questions for the team ("what would make us stop X?"), not numbers you set. [marketing-plan kill criteria, adapted]
</internal_report_rules>
```

---

## 5. Where the skills conflict with our constitution (do not import)

| Skill idea | Conflict | How we adapt |
|---|---|---|
| Guarantees, bonus stacks, scarcity (`offers`) | WRITING_RULES forbid guarantees; code sets scope | Used only to diagnose the client's own offer |
| Health scores and KPI targets (`marketing-plan`, `ads`) | Code decides KPIs and numbers | AI reports coverage and strong / weak / unknown; KPI numbers come only from `rules/kpis.json` |
| Fixed benchmark thresholds (engagement, CTR, CPC) | Numbers from memory = guessing | Compare only with the client's history and confirmed competitors in checks |
| Scraping connectors, Slack delivery, publishing to a GitHub repo | Rule 2 (nothing leaves without approval), rule 5 (no paid SaaS) | Not used; our collectors and gates stay |
| Budget formulas, funding tiers, 3-3-2-2-2 (`marketing-plan`) | SaaS / VC context; invented numbers | Ignored for SMB clients |
| TAM/SAM/SOM (rejected skills) | Invented market numbers | Market context only from cited evidence |
