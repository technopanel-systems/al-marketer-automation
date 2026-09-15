# Plan v3 — owner's full manual audit (2026-09-15)

The owner tested the whole system by hand and sent 23 points. This plan groups them by the part of the system they touch, in build order. Research that needs live testing runs first, in parallel, and is written to `docs/research/*.md`.

Rules that still hold:
- Code decides services, deliverables, timing and numbers; AI only researches, diagnoses and writes.
- Nothing reaches a client without approval.
- Evidence comes before any problem.
- Zero paid software. Apify's free monthly credit is allowed, as a skip-able fallback only, at the owner's request.
- No login accounts for capture.

## Interpretations (stated, not asked)

| Point | Reading |
|---|---|
| "Estimated cost of this proposal from the AI (not estimation, real estimation)" | The **Claude usage cost** of making this proposal, measured per step from each run's own report (`total_cost_usd`), not a guess. It is shown on the Delivery stage and in the internal report, and never in the client PDF. The catalog has no prices, and the rules forbid AI-made numbers in a client document. |
| "Dark mode (keep light)" | Both themes, from the al-marketer.com palette. A toggle offers Light, Dark or System. |
| Client logo | It goes in a cream rounded box next to the Al-Marketer logo on the cover (co-branding), and again on the closing slide. The box keeps any logo readable on the dark cover without recolouring it. |
| Internal report | English with Arabic quotes, never sent. It is built from all saved data by code, plus one AI analysis pass. |

## Brand (measured on al-marketer.com, 2026-09-15)

| Token | Value |
|---|---|
| Background (dark) | `#070808` |
| Text (dark) / cream | `#FCF6D4` |
| Primary | `#EF4625` (hsl 10 86% 54%) |
| Secondary | `#383838` |
| Muted | `#909193` |
| Light theme background | cream hsl(51 86% 91%) |
| Radius | 6px |
| Font | Noto (Latin + Arabic) |
| Glow | radial orange-red |

The site has a dark/light toggle. Contacts: WhatsApp +966 54 334 8930 (`https://wa.me/966543348930`), `siteservicerequest@al-marketer.com`, socials `@almarketerksa` (Instagram, TikTok, Facebook, Snapchat). Its call to action is "احجز استشارة".

## A. Quick fixes

1. **Activity log:** newest line on top, on the stage page, the full log and live updates.
2. **Website field:** accepts `example.com`, `www.example.com` or a full link. The same applies to competitor websites and social links.
3. **Archive / Delete:** visible, labeled buttons on each Home row and on the proposal header, instead of a hidden "…" menu.
4. **PDF cover line:** the faint vertical line is the mascot image's left edge. Edge's PDF viewer composites a transparent PNG slightly differently from the gradient behind it. Fix: flatten the sun gradient and mascot into one opaque image, so there is no transparent edge.
5. **Closing slide:** a call to action with the agency contacts, kept in `rules/agency.json` (editable, not hard-coded).
6. **Claude usage cost:** per step and total, from `logs/runs.jsonl`.

## B. Control Center restyle (ui-ux-pro-max + brand)

- **Design direction:** "Data-Dense Dashboard + Minimalism & Swiss", as ui-ux-pro-max recommends for analytics tools, in brand colours. Its generic palette search returned pink and cyan, so the palette comes from the website instead.
- **Themes:** semantic tokens for light and dark. The theme is set before first paint (cookie read by the server), with the toggle in the sidebar.
- **Tables:**
  - Numbers right-aligned with tabular figures and thousands separators.
  - Grade chips (good / average / weak) that pair colour with text, never colour alone.
  - Mini bars for comparisons, sticky headers, and relative dates with the full date on hover.
- **Motion:** subtle only. 150–250 ms state changes, an animated bar on running steps, a skeleton while loading, one entrance fade per page, all respecting `prefers-reduced-motion`.
- **Less typing:**
  - Native `select` for closed sets and `datalist` (type-to-search) for open sets: market, industry, title of the person, Arabic style.
  - Competitors as repeatable rows, readiness as Yes / No / Don't know buttons, constraints as chips plus free text.

## C. Brief (first page) rethought

1. **Find online presence:** a button beside the website field reads the site (links, JSON-LD `sameAs`, meta tags, contact details) and searches for missing platforms. It shows each profile found with its platform icon and a tick box. The automatic search still runs afterwards.
2. **Meeting report file:** attach `.docx`, `.pdf`, `.txt` or `.md` next to the notes box. The text is extracted by code and saved as evidence (the original file is kept), and the notes step reads it.
3. **Client readiness:** moves from the bottom of Research to the Brief, as a compact Yes / No / Don't know grid. It is filled from the notes automatically when they say so, with the quote, and stays editable.
4. **Client logo:** found on the website (header logo, `og:logo`, apple-touch-icon, favicon) and shown on the Brief with "Use", "Upload another" and "No logo".

## D. "What do I need to do" first

1. **Research page (and every stage):** starts with the actions waiting for the person, as inline forms (competitor decisions, questions). Next comes what is running now (live bars), then the results, collapsed. The page jumps to the first action.
2. **Manual checks become an automatic step, "Presence checks"** (browser):
   - Meta Ad Library, search-engine presence, Google Maps listing and Google Ads Transparency.
   - "Latest post" comes from the social scorecard.
   - "Unanswered comments" stays optional unless an honest no-login route exists (see `docs/research/auto-checks.md`).

## E. Social capture that finds its way

(Details: `docs/research/social-fallbacks.md`, `docs/research/apify.md`.)
1. **Page not found:**
   - Look for the right page: website links, then search results, then slug variations.
   - Score each candidate: name match, website link on the profile, has followers.
   - Use it automatically when certain; otherwise ask "Use this page?" in one click.
2. **"No posts" vs "posts unreadable":** tell the two apart; use a second free route per platform.
3. **Apify fallback:** only when `APIFY_TOKEN` is set, only after the free routes fail, with a per-run cost cap and a monthly budget check. On any failure it skips.
4. **Last resort:** a screenshot of the public profile that the AI reads (followers, latest post date), stored as evidence.

## F. Business layer

(Details: `docs/research/business-layer.md`.) New code checks for business model, sales channels, payments, lead capture, support tools, reviews and hiring, plus an AI business analyst in the research teams. Signals that match a catalog service can support a diagnosis; others become business observations in the internal report. Code still sells only catalog items.

## G. Smarter AI

1. **Skills** (see `docs/research/skills-v3.md`): methodology from vetted marketing and business-analysis skills goes into the research, diagnosis, writing and report prompts.
2. **Models per step:** reviewed against real run times and costs, with a fallback model when a step times out or fails validation, and effort levels per step. Kept in one table (`ai/models.js`).

## H. Proposal output

1. **Client logo** on the cover and the closing slide.
2. **Closing call-to-action slide.**
3. **Edit after the PDF:**
   - **Slide editor:** form fields per slide, no JSON.
   - **"Ask the AI":** a chat box connected to all the proposal data. The AI returns targeted edits inside the content schema; code validates them, re-renders the slides and keeps every version so any change can be undone.
4. **Internal report:** English, detailed, never sent. Built after approval from everything saved (client record, evidence, social scorecard, competitors, diagnosis with the reviewer's view and rejected problems, scope with rule reasons, plan, KPIs, readiness gaps, business observations, Claude usage), plus one AI analysis (strategy, risks, opportunities, next-meeting questions). Delivered as HTML and PDF.
5. **Claude usage cost** on the Delivery stage and in the internal report.

## I. Keys housekeeping

One `API-KEYS.txt` lists only the keys the system uses, each with free sign-up steps. Unused keys are removed from code and docs. A "Settings" page shows which keys are set (never their values), with a test button for each.

## Build order and proof

| Phase | Proof |
|---|---|
| A quick fixes | Tests (URL normalising, log order, cost totals); PDF cover checked in Edge's PDF viewer |
| B + C + D Control Center | Route tests for every new action; screenshots light and dark at 1440 / 1024 / 820 px; ui-ux-pro-max pre-delivery checklist |
| H proposal output | Deck tests (logo, CTA), edit-and-undo tests, internal report renders; PDF checked in Edge |
| E + F + G research | Tests with recorded fixtures; live checks on real brands |
| I keys | Settings page test; the keys file reviewed |
| Real run | New proposal from scratch through the UI, to an approved PDF and internal report |

## Build status

| Phase | Status |
|---|---|
| Research (5 parallel reports) | Done: docs/research/{apify,social-fallbacks,auto-checks,business-layer,skills-v3}.md |
| A quick fixes (website field, activity order, cover line, archive/delete buttons) | Done (a34a081, a8b94fb) |
| B + C + D Control Center (brand theme, dark mode, brief, action cards, tables, animations) | Done (a34a081) |
| H proposal output (logo, CTA, editing, versions, internal report, Claude usage) | Done (a8b94fb) |
| E social capture v3 (fallbacks, ownership check, discovery, Apify) | Done (9065970) |
| Business layer (signals + analyst + needs and risks) | Done (e34616a) |
| F automatic ads / search / Maps checks | Done (c578030) |
| G prompts from skills + models per step with fallback | Done (ef81b53) |
| I Settings & keys page | Done (84b7ae6) |
| Visual check of every page, light and dark | Partly (research, settings); diagnosis, scope, proposal, editor, delivery left |
| Real run from a new proposal to approved PDF + internal report | Not run yet (next step) |

Where the work stopped and how to continue: docs/session-state.md.
