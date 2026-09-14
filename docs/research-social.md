# Social media research — how to see a prospect's social media like a marketer

_2026-09-14. Synthesis of four research files in `docs/research-social/raw/` (Sonnet research agents, every claim sourced there), plus my own checks during this session._

**Why this exists:** the Technopanel proposal said almost nothing about social media, because the collector only ever saw login walls.

| Channel | What the collector saw |
|---|---|
| Instagram | Followers, bio and 4 highlight names, behind a login pop-up |
| LinkedIn | A company header |
| X | Failed |
| Competitors | Never looked at |

With no social evidence, the diagnosis could only find website problems. This document decides how to get real social evidence for free and legitimately.

**Reddit caveat:** Reddit blocks AI crawlers, so no Reddit threads could be read by any tool (raw/02 §0). The "practitioner" findings come from other sources.

---

## 0. Update — every platform without a login (tested live 2026-09-14)

The owner asked for no account logins. These logged-out routes were tested on Technopanel and two competitors, then built (`collect/social/public.js`). They **replace assisted browsing as the default**. This supersedes point 5 below. The research browser stays only as an optional fallback (`ALM_SOCIAL_ASSISTED=1`).

| Platform | Route (no login, no key) | What it gave in the test | Source / status |
|---|---|---|---|
| LinkedIn (company pages) | The public company page as a guest, over plain HTTP | 2,093 followers; last 10 posts with exact date (decoded from the post id), format, reactions, comments | Observed, not documented by LinkedIn; may change. Personal profiles are not readable. |
| Facebook (pages) | The official **Page Plugin** that websites embed | 1,737 followers; last 5 posts with date, reactions, comments, shares | [Meta: Page Plugin](https://developers.facebook.com/docs/plugins/page-plugin/) (retrieved 2026-09-14). Only 5 posts, so frequent posters are measured over a shorter period (marked `*`). |
| X | **FxEmbed's** public API (the free, open-source service behind X link previews in Discord) | 262 followers, 966 posts; 20 posts per page with date, likes, replies, reposts, views; pages back past 90 days | [github.com/FxEmbed/FxEmbed](https://github.com/FxEmbed/FxEmbed) (retrieved 2026-09-14). Third-party volunteer service; can be self-hosted if it stops (`ALM_FXTWITTER_API`). X's own embed endpoint answered 429. |
| Instagram | The public profile page (embedded timeline data) + each post's public embed | 656 followers, 696 posts; last 12 posts with date and format; likes per post (e.g. "0 likes" confirmed on the post) | Observed, not documented; its JSON API refused logged-out calls ("require_login"). Comment counts need the Meta key (B4). |

- **Legal position:** logged-out collection of public pages is what the Meta v. Bright Data ruling covered (raw/04 §3). That is safer than the logged-in research-account plan it replaces. It is still not legal advice.
- **Pace:** a few requests per profile, 4 s between profiles on the same platform, 2.5 s between Instagram posts.
- **Failure mode:** when a platform changes or refuses, the capture fails with a message and the row asks the team to retry, type the numbers or skip. The parsers never guess (tested with fixtures in `test/collect/social-public.test.js`).

---

## 1. What changes the plan

1. **Instagram has an official way to read other brands' posts.** The Graph API **Business Discovery** endpoint returns followers, post count and recent posts with **date, type, caption, likes and comments** for any *business or creator* account. It is queried from Al-Marketer's own Instagram business account (raw/04 §1.1, Meta docs).
   - It's free, structured, and needs no scraping.
   - **Unknown:** whether Meta's full "Advanced Access" review is required for accounts we don't own. Test in development mode first; the owner's Meta setup is roughly one hour.
2. **YouTube is fully open.** The free Data API gives subscribers, videos, and per-video views, likes, comments and dates for any channel (raw/04 §1.3).
3. **TikTok works logged-out with yt-dlp**, a maintained single `.exe`. Its source code confirms per-video view, like, comment and share counts with no login (raw/01).
4. **Ads are free and public everywhere:** the Meta Ad Library website, Google Ads Transparency Center, LinkedIn Ad Library and TikTok Creative Center Top Ads.
   - Meta's Ad Library **API** doesn't cover commercial ads in Egypt or KSA (checked earlier), but the website does.
5. **LinkedIn, Facebook, X and Snapchat have no free official route to competitor data.**
   - The only maintained LinkedIn scraper needs a login, and LinkedIn actively bans and sues (a scraping API provider shut down after a 2025 lawsuit).
   - Facebook scrapers are unmaintained, and nothing works for Snapchat.
   - **So these four use assisted browsing**, with Snapchat kept manual.
6. **Assisted browsing done right:**
   - A dedicated agency browser profile (Playwright `launchPersistentContext`).
   - The employee browses at human pace while the app **records the platform's own data responses** (exact counts, dates, captions) instead of reading the screen.
   - Agency accounts only, low volume, internal use (raw/04 §2).
   - **Legal nuance:** the Meta v. Bright Data win covered *logged-out* scraping only. Logged in, the platform's terms apply, so the realistic downside is a restricted research account, not a lawsuit, for this scale (raw/04 §3; not legal advice).
7. **Claude should not read Arabic text from screenshots.** It reverses words and confuses letters (raw/03 §3, moderately verified).
   - Captions and comments must be captured as **text**.
   - Screenshots only for visual judgements: brand consistency and design quality.
8. **Score each brand in a separate AI call, and let code compare.** Judges favour whichever option appears first 64% of the time and flip verdicts 41% of the time when the order is swapped (raw/03 §3).
9. **Built-in competitor features exist, but they're manual and limited:**
   - Instagram "Competitive Insights": up to 10 accounts, launched Nov 2025, secondary sources.
   - LinkedIn Page "Competitor analytics": 1 competitor free.
   - Useful for an employee to screenshot; not automatable.
10. **No skill, plugin or MCP server is worth adopting** (raw/03). Plain Playwright plus our own code is the right shape.

---

## 2. The recommended design, per platform

| Platform | Method | What we get | Risk |
|---|---|---|---|
| Instagram | **Business Discovery API** (automatic). If a target is a personal account, or access is refused: assisted browsing | Followers, posts, last ~25 posts with date, type, caption, likes, comments | Low (official) |
| TikTok | **yt-dlp** logged-out (automatic) | Followers, per-video views, likes, comments, shares, date, caption | Low–medium (public, logged-out) |
| YouTube | **YouTube Data API** (automatic, free key) | Subscribers, per-video views, likes, comments, date | None |
| LinkedIn company page | **Assisted browsing** (agency account, human pace) + LinkedIn Ad Library | Posts with date, reactions, comments; ads | Medium: LinkedIn is strict, so keep it slow and few |
| Facebook page | **Assisted browsing** + Meta Ad Library website | Posts with date, reactions, comments, shares; active ads | Low–medium |
| X | **Assisted browsing** (the official API is pay-per-use, ~$0.005 per post read) | Posts with date, likes, replies, reposts | Low–medium |
| Snapchat | **Manual** in the Questions tab: followers if shown (hidden under 5K), last story/Spotlight activity, a screenshot | Limited | None |
| Ads | Meta Ad Library website, Google Ads Transparency Center, LinkedIn Ad Library, TikTok Top Ads | Active ads, creatives, start dates | Low |
| Search / Maps | Buyer-keyword checks + Maps listing (already partly done) | Ranking presence, rating, review count | Low |

**Competitors** (your decision): the team can add them at intake; the AI proposes more; the team confirms the AI's picks in the Questions tab, before capture.

**Measured in code, never by AI:**
- Posts per week over the last 90 days and days since the last post.
- Format mix (video/reel, carousel, image).
- Average interactions per post and engagement rate by followers.
- Best and worst posts, and the gap versus each competitor.

**Benchmarks as a rules table** with sources, shown as ranges:

| Industry (Hootsuite 2026) | Instagram | LinkedIn | Facebook | TikTok |
|---|---|---|---|---|
| Manufacturing | 5.2% | 4.0% | 2.8% | 2.6% |
| Retail | 3.6% | 4.3% | — | 1.6% |

- TikTok's reported average ranges from 2.0% to 3.7% depending on the tracker.
- B2B LinkedIn: 2–5 posts per week.
- Saudi reach (DataReportal 2026): TikTok 38.6M, YouTube 27.5M, Snapchat 25.3M, Instagram 18.2M, LinkedIn 12M.

**AI analysis** (a new "digital audit" step before diagnosis):
- One call per brand, reading captured text plus labelled screenshots (at most 20 per call, images first).
- It classifies each post into a **fixed content-pillar list defined in `rules/`**.
- It judges visual consistency and calls to action.
- Every claim points to a captured post id, verified by code.
- Code then compares the brands and creates scorecard evidence for the existing social problem types. Those problem types now get sold only when evidence supports them.

**Proposal:** a "digital scorecard" slide with the code-calculated numbers against competitors and benchmarks.

---

## 3. Owner setup needed (added to `API-KEYS.txt` when built)

- **YouTube Data API key:** the same Google Cloud project as PageSpeed. Enable "YouTube Data API v3" and allow it on the key.
- **Instagram Business Discovery:**
  - Al-Marketer's Instagram switched to a Business account and linked to a Facebook Page.
  - A Meta developer app and a long-lived access token plus the Instagram business account id.
  - Possibly Business Verification if development mode refuses competitor lookups (test first).
- **Agency research accounts** for LinkedIn, Facebook, X and TikTok: dedicated, never personal. Logged in once inside the app's browser profile.

---

## 4. Estimate

| Slice | Days |
|---|---|
| **Core:** competitors flow · Instagram Business Discovery · TikTok via yt-dlp · YouTube API · code metrics + benchmark table · evidence into diagnosis · scorecard slide | ~5–6 |
| Assisted browsing capture (LinkedIn, Facebook, X, recording data responses) + ad libraries | ~3–3.5 |
| AI digital-audit step with screenshots + content pillars | ~2–2.5 |
| **Total** | **~10–12** |
