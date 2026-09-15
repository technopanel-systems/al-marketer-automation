# Social capture without login: fallbacks, finding the right page, failure handling

_Tested live from this PC on 2026-09-15 (Node 24 `fetch` and Playwright Chromium). No account, no key, no proxy, no CAPTCHA solving. A handful of requests per route, with 2–8 s pauses (2 minutes for search engines). Throwaway test scripts: `C:\Users\jerom\AppData\Local\Temp\claude\social-fallbacks\`. Nothing in the project source was changed._

Test brands: Almarai, Al-Marketer (`almarketerksa`), Jarir Bookstore (Snapchat), Technopanel, and the competitors already in `clients/technopanel/`.

**Labels**

| Label | Meaning |
|---|---|
| **[tested ✓]** | Worked today |
| **[tested ✗]** | Tried today; did not work |
| **[untested]** | Not tried |

Everything here is logged-out behaviour that the platforms don't document. It can change without notice, so every route needs fixtures, tests and a clear failure status.

---

## 0. Summary

| Platform | What we use now | Best tested fallback (when the current route fails) | Best tested "find the right page" | Not possible without login |
|---|---|---|---|---|
| LinkedIn | Guest company page: followers + last 10 posts | **Post embed** `linkedin.com/embed/feed/update/urn:li:activity:ID`: reactions, comments, author, date from the id. Post ids come from search-engine results for `linkedin.com/posts/<slug>_`. The guest `/in/` page shows a personal profile's posts | **Jobs typeahead** `jobs-guest/api/typeaheadHits?typeaheadType=COMPANY&query=`: exact company names and ids. Then check the slug, or search DuckDuckGo HTML | More than 10 posts; posts of pages that hide them from guests (e.g. unibondsa, alucopanel); reposts; numeric id → page |
| Instagram | Profile page (12 posts, dates) + one embed per post (likes) | **Profile embed** `instagram.com/<user>/embed/` in Chromium: exact followers, post count, last 6 posts with date, **likes and comments** in one request. Then post embeds for the rest | Links on the website and other profiles; DuckDuckGo/Brave `"<brand>" instagram`; DuckDuckGo Instant Answer/Wikidata for big brands. **No internal search logged out** | More than 12 posts; `web_profile_info` (401 `require_login`); views; mirror sites (all behind Cloudflare) |
| Facebook | Page Plugin in Chromium (5 posts) | **Plain fetch of `www.facebook.com/<page>`** (browser-like `sec-fetch-*` headers): followers text, likes (og), 1 latest post with reactions/shares, **links to website and other profiles**. `m.facebook.com` gives likes and "talking about this" | Cross-links: the page's own website and profile links (Dalcobond's page lists `dalcobond.com` ×7) | More than 5 posts; age/country-restricted pages (Heineken → empty everywhere); not-found vs restricted can't be told apart; mbasic (redirects to login) |
| X | FxEmbed API (profile + 20 posts per page) | **`publish.twitter.com/oembed`** to confirm existence (404 = gone). **x.com in Chromium `channel:'chromium'`** (new headless): followers, post count and ~5 posts with counts; screenshot readable | FxEmbed `user.website` compared with the client domain; DuckDuckGo `site:x.com <brand>` | vxtwitter (Cloudflare 403), syndication (429), every Nitter instance (down, suspended, Anubis or Cloudflare) |
| TikTok | yt-dlp + profile JSON in Chromium | **Creator embed `tiktok.com/embed/@user` by plain fetch**: followers, likes total, last 10 videos (id → date, views). **Video embed `tiktok.com/embed/v2/<id>`**: likes, comments, shares, views, date, video count | **oEmbed** `tiktok.com/oembed?url=…/@user`: 200 = exists, 400 = doesn't. Profile JSON `statusCode 10221` = missing. `bioLink` compared with the domain | Profile video grid in the browser ("Something went wrong" logged out today) |
| Snapchat | Manual | **Automatable:** `snapchat.com/add/<user>` → `__NEXT_DATA__`: subscribers (when shown), website, bio, last-update time, Spotlight posts with date + views/shares/comments, today's story snaps with times, highlights with dates | 404 = missing; `websiteUrl` compared with the domain; website footer links | Hidden subscriber counts (`"0"` means hidden, not zero); story views |
| YouTube | yt-dlp (+ Data API if key) | **RSS** `youtube.com/feeds/videos.xml?channel_id=`: last 15 videos with exact date, views, likes in **one** request (no per-video calls) | **Keyless channel search** `youtube.com/results?search_query=<brand>&sp=EgIQAg%3D%3D` (ytInitialData): channel id, handle, subscribers. Real case: `@almarai` is 404, the real channel is `@almaraicom` | Nothing important |

**Search engines usable from code today (§2.2):**

- **DuckDuckGo HTML** works, but only ~2 queries per ~30–60 minutes per IP before HTTP 202 "anomaly".
- **Brave HTML** works and parses well, but only ~1 query in 7 got through at 45–120 s spacing after the first burst (HTTP 429).
- **DuckDuckGo Instant Answer API, Wikidata and the Wayback CDX** answer reliably, but only know big brands or old URLs.
- **Unusable:** Bing (returns unrelated results to scripts, HTML and RSS), Google, Startpage, Yandex (CAPTCHA), Mojeek and Ecosia (403), Yahoo (500), Qwant API (403), SearXNG public instances.

**So search engines are the last step of discovery, not the first.**

---

## 1. Real failures in `clients/technopanel` (what the owner saw)

These cases show why "page not found" and "no posts" need more than a retry button.

| Capture | What happened | What would have caught it (tested today) |
|---|---|---|
| `c2__x` DalcoBond, `c3__x` SAUDI_CLADDIN | FxEmbed 404 "User not found" | X oEmbed also 404 → the account is gone. DuckDuckGo `site:x.com dalcobond` found no Dalcobond account. Dalcobond's Facebook page still links `x.com/dalcobond` (a stale link). Status should be **not_found → propose "not on X"**, not "failed". |
| `c2` Dalcobond → Facebook `Saudi.Cladding` | The AI proposed another company's page (Saudi Cladding) for Dalcobond | The real page `facebook.com/dalcobond1` shows `dalcobond.com` 7 times. `Saudi.Cladding` never mentions it. A domain-match confidence check rejects the wrong page. |
| `c4__linkedin` (Alucopanel) and `c6__linkedin` (Unibond) | Both captures contain **the same posts**. The embed endpoint shows the first one was written by a personal profile (`jo.linkedin.com/in/omarshegem`, 161 reactions, 7 comments), not either company. | The assisted capture read a feed that was not the company's. Every captured post must pass an **author = profile** check; the post embed gives the author. |
| `c4` Alucopanel | Slug `alucopanel` is **ALUCOPANEL, Dubai** (JSON-LD `sameAs: alucopanel.net`, 578 followers as guest). The competitor's website is `alucopanel.sa`. | Domain check on the guest page's JSON-LD `sameAs` / `about_website` link. |
| `c2`, `c3` LinkedIn | Personal `/in/` profiles used as brand pages | The guest `/in/dalcobond` page shows 9 posts (latest 2024-04-16) and "5K followers". The brand has no company page (typeahead "Dalcobond" = `[]`). |
| YouTube for Almarai (test) | `youtube.com/@almarai/videos` = 404 in both fetch and yt-dlp | Keyless channel search → `@almaraicom`, `UCF9ZYiAv8zR3ygdRnu-pi7w`, 386K. |
| LinkedIn for Al-Marketer (test) | `/company/almarketerksa` = 404 (the Instagram handle guess) | Typeahead → "Al-Marketer الماركتير" id 110668864. DuckDuckGo `site:linkedin.com/company "Al-Marketer"` → `/company/almarketersa`. The guest page title matches the typeahead name exactly (255 followers, 10 posts). |
| Wikidata for Almarai (test) | LinkedIn slug `almarai-company-riyadh-ksa` | 301 → `sa.linkedin.com/company/almarai`: follow redirects and store the final slug. |

---

## 2. A — Finding the right page when a link is missing, dead, moved or wrong

### 2.1 Recommended discovery order (cheapest and most trustworthy first)

Stop at the first **confirmed** hit per platform. Everything that isn't confirmed by a link is only **proposed** and waits for the team (Gate 1).

1. **Links the brand publishes itself** (confirmed):
   - Homepage/footer links (`collect/site.js` already does this).
   - JSON-LD `sameAs`. [tested ✓] `technopanel.com.sa` has 6 profiles in `sameAs`. `almarai.com` has footer links including `snapchat.com/add/almarai` and `youtube.com/user/almaraicom`.
2. **Cross-links from a profile already confirmed** (confirmed):
   - Facebook page HTML `website`/profile links. [tested ✓] `dalcobond1` → instagram/x.
   - Instagram bio link (`www.almarai.com` visible).
   - FxEmbed `user.website`. [tested ✓] `almarai.com`.
   - TikTok `bioLink`. [tested ✓] `almarai.com`.
   - Snapchat `websiteUrl`. [tested ✓] `https://www.almarai.com`.
   - LinkedIn `about_website` redirect link and JSON-LD `sameAs`. [tested ✓]
3. **Platform-native lookups, no search engine** (proposed; confirmed when the profile's website = client domain):
   - LinkedIn jobs typeahead. [tested ✓]
   - YouTube channel search. [tested ✓]
4. **Handle-variation probes** against cheap existence checks (§2.4) (proposed).
5. **Knowledge bases** for well-known brands: DuckDuckGo Instant Answer and Wikidata. [tested ✓] Big brands only; slugs can be old.
6. **Search engines** (§2.2), within a strict per-IP budget (proposed).
7. Nothing found → status `not_found_on_platform`. The team confirms "not on this platform" or pastes a link.

### 2.2 Keyless search endpoints — tested today

| Endpoint | Result today | Notes |
|---|---|---|
| **DuckDuckGo HTML** `GET https://html.duckduckgo.com/html/?q=` | [tested ✓] with limits. `site:linkedin.com/company "Almarai"` → `linkedin.com/company/almarai/` with snippet "1,596,821 followers on LinkedIn". `site:linkedin.com/company "Al-Marketer"` → `/company/almarketersa`. | Blocks with **HTTP 202 + anomaly page** after ~2 quick queries. Still blocked 25 min later; OK again after ~50 min. At 30 s spacing: 2 OK, the 3rd blocked. Budget: **≤2 queries per 60 min per IP, stop at the first 202.** |
| DuckDuckGo HTML `POST` / `lite.duckduckgo.com/lite/` | [tested ✗] 202 | Tried right after the first block, so no conclusion on whether they differ. |
| DuckDuckGo JS site in Chromium `duckduckgo.com/?q=` | [tested ✗] 202 | Same IP block. |
| **DuckDuckGo Instant Answer API** `https://api.duckduckgo.com/?q=Almarai&format=json&no_html=1&skip_disambig=1` | [tested ✓] Infobox: Website, "Twitter profile" almarai, "Instagram profile" almarai | One request, answered at once (while the HTML endpoint was blocked). Only brands with a Wikipedia/Wikidata entry. |
| **Brave HTML** `https://search.brave.com/search?q=…&source=web` | [tested ✓/✗] 1st query: 6 LinkedIn company URLs. `"Almarai" instagram`: 19 results with follower snippets. | HTTP **429** without `Retry-After`. Paced run (45 s, 120 s after a 429): **1 of 7** succeeded, also 429 inside Chromium. Budget: ≤1 query per 2–5 min, give up after 2 × 429. Server-rendered, easy to parse (code below). |
| Bing HTML `https://www.bing.com/search?q=` (fetch and Chromium) | [tested ✗] HTTP 200 but unrelated results (Google Maps pages, Microsoft support, BNP funds, Chinese Q&A) | Bing serves junk to automated clients. Code can't tell it from real results without a relevance check. **Don't use.** |
| Bing RSS `https://www.bing.com/search?format=rss&q=` | [tested ✗] 2 of 3 queries unrelated (Amazon UK, weather.gov). 1 relevant (Technopanel LinkedIn posts). | Unreliable, same problem. |
| Google `https://www.google.com/search?q=` | [tested ✗] consent/"unusual traffic" page | — |
| Startpage | [tested ✗] redirect to `/sp/captcha-block` | — |
| Yandex | [tested ✗] `showcaptcha` | — |
| Mojeek | [tested ✗] 403 | — |
| Ecosia | [tested ✗] 403 | — |
| Yahoo | [tested ✗] 500 | — |
| Qwant API `api.qwant.com/v3/search/web` | [tested ✗] 403 | — |
| SearXNG public (`searx.be` JSON, `search.inetol.net`) | [tested ✗] HTML only / "Security check" | Volunteer instances block bots. |
| Marginalia API | [tested ✗] timeout | Small index, not useful for social. |
| **Wikidata** `wbsearchentities` + `Special:EntityData/Q….json` | [tested ✓] Almarai Q3535226 → website, instagram `almarai`, x `almarai`, facebook `almarai`, linkedin `almarai-company-riyadh-ksa` (old slug, 301), youtube channel id. Jarir → also snapchat `jarirbookstore`. Technopanel → no entity. | Properties: P856 website, P2003 IG, P2002 X, P2013 FB, P4264 LinkedIn, P7085 TikTok, P2397 YouTube, P2984 Snapchat. Pick the entity whose P856 domain = client domain. |
| **Wayback CDX** `https://web.archive.org/cdx/search/cdx?url=linkedin.com/company/almarai*&output=json&collapse=urlkey` | [tested ✓] lists old and new slugs (`almarai-company-riyadh-ksa`, `almarai`) | Good for "renamed slug" history. Useless for recent posts: `posts/almarai_*` had 5 rows from Jan–Feb 2026; `unibondsa_`, `technopanelco_` had none. |

Parsers (tested on today's saved pages):

```js
// DuckDuckGo HTML: result links are //duckduckgo.com/l/?uddg=<encoded url>
export function parseDdgHtml(html) {
  return String(html).split('class="result__a"').slice(1).map((block) => {
    const href = (block.match(/href="([^"]+)"/) || [])[1] || '';
    const uddg = (href.match(/uddg=([^&]+)/) || [])[1];
    return {
      url: uddg ? decodeURIComponent(uddg) : null,
      title: strip((block.match(/>([\s\S]*?)<\/a>/) || [])[1]),
      snippet: strip((block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) || [])[1]),
    };
  }).filter((r) => r.url && !/duckduckgo\.com\/y\.js/.test(r.url));
}
// Brave: <div class="snippet …" data-type="web"> … <a href="https://…"> … <div class="title …">…</div> … <div class="content …">
export function parseBraveHtml(html) {
  return String(html).split(/<div[^>]+class="snippet\b[^"]*"[^>]*data-type="web"/).slice(1).map((b) => ({
    url: ((b.match(/<a[^>]+href="(https?:\/\/[^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&'),
    title: strip((b.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
    snippet: strip((b.match(/class="content[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
  })).filter((r) => r.url && !/brave\.com/.test(r.url));
}
// Blocked? DDG: status 202 or /anomaly/ in body. Brave: 429. Treat both as "search_rate_limited" and stop.
```

Queries that returned useful results:

- `site:linkedin.com/company "<Brand Name>"`
- `"<Brand>" instagram`
- `site:x.com <brand>`

Search results are **candidates only**. They go through the confidence check (§2.5) and a live profile fetch. Snippets are stale: DuckDuckGo said 169 followers, the live page said 255.

### 2.3 Platform-native lookups (no search engine)

**LinkedIn company typeahead** [tested ✓]

- URL: `GET https://www.linkedin.com/jobs-guest/api/typeaheadHits?typeaheadType=COMPANY&query=<name>`, browser UA, no cookies.
- Returns JSON `[{ id, type: 'COMPANY', displayName, trackingId }]`, up to 10.
  - `Almarai` → `218694 "Almarai - المراعي"` + 9 subsidiaries.
  - `Technopanel` → `77050735 "Technopanel - تكنوبانل"` (also "Technopanel by Formatt", "ACL Technopanel B.V.", "EGY Technopanel").
  - `Al-Marketer` → `110668864 "Al-Marketer الماركتير"`.
  - `Dalcobond` → `[]`.
- **No slug in the answer, and id → slug is hard logged out:**
  - `/company/218694` → 302 login.
  - `organization-guest/api/feedUpdates/218694` → 400 without a token.
- **Id → slug routes:**
  - (a) [tested ✓] Jobs search `GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?location=Saudi%20Arabia&f_C=218694&start=0` → job cards linking `linkedin.com/company/almarai`. Only for companies with open jobs; without `location` it returned empty.
  - (b) Slug guesses (§2.4), verified when the guest page `og:title` minus " | LinkedIn" **equals** the typeahead `displayName`. [tested ✓] `technopanelco` → "Technopanel - تكنوبانل".
  - (c) DuckDuckGo `site:linkedin.com/company "<displayName>"`. [tested ✓] → `almarketersa`.

**YouTube channel search** [tested ✓]

- URL: `GET https://www.youtube.com/results?search_query=<brand>&sp=EgIQAg%3D%3D` (channels filter), headers `accept-language: en`, `cookie: CONSENT=YES+1; SOCS=CAI`.
- Parse `var ytInitialData = {…};` and collect every `channelRenderer`: `title.simpleText`, `channelId`, `navigationEndpoint.browseEndpoint.canonicalBaseUrl` (handle), `videoCountText.simpleText` (holds the subscriber text, e.g. "386K subscribers"; `subscriberCountText` holds the handle).
- `Almarai` → `المراعي Almarai UCF9ZYiAv8zR3ygdRnu-pi7w /@almaraicom 386K`, then Almarai Egypt 55.1K, Almarai Alarabia 3.86K…

**Instagram, Facebook, TikTok, X, Snapchat:** no logged-out user search found.

- Instagram `web_profile_info` refuses (§3.2). `topsearch` [untested] (the whole `/api/v1` refuses logged out).
- TikTok user search needs signed parameters [untested, not pursued].

### 2.4 Existence probes and handle variations

Cheap "does this handle exist?" checks, all [tested ✓] today:

| Platform | Probe | Exists | Missing |
|---|---|---|---|
| X | `https://api.fxtwitter.com/<h>` | 200 `{user:{…}}` | 404 `{"code":404,"message":"User not found"}` |
| X (2nd opinion) | `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F<h>` | 200 (timeline widget HTML) | 404 |
| TikTok | `https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40<h>` | 200 `author_name`, `embed_type: creator` | 400 `{"message":"Something went wrong","code":400}` |
| TikTok | `https://www.tiktok.com/embed/@<h>` (fetch) | 200 with `__FRONTITY_CONNECT_STATE__` userInfo | 400 |
| TikTok (browser) | Profile `__UNIVERSAL_DATA_FOR_REHYDRATION__` → `webapp.user-detail.statusCode` | 0 | 10221 ("user banned" is also used for missing users) |
| Snapchat | `https://www.snapchat.com/add/<h>` | 200 (redirect to `/@h`) | 404 |
| YouTube | `https://www.youtube.com/@<h>/videos` | 200 | 404 |
| LinkedIn | `https://www.linkedin.com/company/<slug>` (manual redirect) | 200 with "N followers"; 301 for old slugs | 404, 317,547-byte page titled "LinkedIn" |
| Instagram (browser only) | Profile page | og "N Followers, M Following, P Posts" | Title "Profile isn't available • Instagram" |
| Facebook | `https://www.facebook.com/<page>` (fetch, `sec-fetch-*` headers) | og description with likes | Title "Facebook", no og (**same as age/country-restricted**: Heineken) |

**Handle variation generator** (deterministic, max ~6 probes per platform):

- From the client domain root: `technopanel`, `almarai`.
- From handles already confirmed on other platforms: `technopanelco`, `almarketerksa`.
- Suffixes common in KSA/EG: `co`, `ksa`, `sa`, `eg`, `official`, `_ksa`, `.sa`, `-ksa`, `-sa`.
- LinkedIn slugs: the display name lowercased, spaces/punctuation → `-`, words like `company|co|ltd|llc` removed.
- Real misses today:
  - `almarketerksa` (IG) ≠ `almarketersa` (LinkedIn).
  - `almarai` (IG/X/TikTok/Snapchat) ≠ `almaraicom` (YouTube).
- Every existence hit is only a **candidate**; it still needs the confidence check.

### 2.5 Confidence score (deterministic, code only) — design, not run; weights to be tuned on fixtures

Signals every tested route gives:

- **Name:** LinkedIn og:title, IG title, FB title, FxEmbed `name`, TikTok `nickname`, Snapchat `title`, YouTube channel title.
- **Website/bio link:** LinkedIn `about_website` + JSON-LD `sameAs`, IG bio link (profile embed has no website field; the profile page shows it), FB page HTML links, FxEmbed `user.website.url`, TikTok `bioLink.link`, Snapchat `websiteUrl`.
- **Followers and posts** from each route.

```js
// Returns { score 0..1, level: 'confirmed' | 'likely' | 'weak' | 'reject', reasons[] } — code decides, the team approves.
export function profileConfidence({ client, candidate, foundVia }) {
  const reasons = [];
  // Hard confirmations: the brand links the profile itself (website, JSON-LD sameAs, or an already-confirmed profile).
  if (['website', 'sameAs', 'confirmed_profile_link'].includes(foundVia)) return { score: 1, level: 'confirmed', reasons: [`linked by ${foundVia}`] };
  const domain = (u) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
  const siteMatch = candidate.links.some((l) => domain(l) && domain(l) === domain(client.website));
  if (siteMatch) return { score: 0.95, level: 'confirmed', reasons: ['profile links the client website'] };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[\u064B-\u0652\u0640]/g, '').replace(/\b(company|co|ltd|llc|group|official|ksa|sa|eg)\b|شركة|مصنع/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
  const dice = (a, b) => { const A = tokens(a), B = tokens(b); const inter = [...A].filter((t) => B.has(t)).length; return A.size + B.size ? (2 * inter) / (A.size + B.size) : 0; };
  const nameSim = Math.max(...client.names.map((n) => dice(n, candidate.name)));           // Latin and Arabic names both listed at intake
  const root = domain(client.website).split('.')[0];
  const handleSim = root && candidate.handle.toLowerCase().replace(/[^a-z0-9]/g, '').includes(root.replace(/[^a-z0-9]/g, '')) ? 1 : 0;
  const otherSite = candidate.links.some((l) => domain(l) && !/(instagram|facebook|x|twitter|tiktok|snapchat|youtube|linkedin|linktr|calendly|wa\.me|bit\.ly)/.test(domain(l)) && domain(l) !== domain(client.website));
  const active = (candidate.followers ?? 0) > 0 && (candidate.postsTotal ?? candidate.posts ?? 0) > 0;
  let score = 0.5 * nameSim + 0.25 * handleSim + 0.1 * (active ? 1 : 0) + 0.15 * (candidate.exactTypeaheadName ? 1 : 0);
  if (otherSite) { score -= 0.4; reasons.push('profile links a different website'); }          // Saudi.Cladding for Dalcobond; alucopanel.net for alucopanel.sa
  const level = score >= 0.75 ? 'likely' : score >= 0.5 ? 'weak' : 'reject';
  return { score: Math.max(0, Math.min(1, score)), level, reasons };
}
```

Rules:

- `confirmed` → capture automatically.
- `likely` / `weak` → capture, but the row shows "proposed page, please confirm" and **nothing reaches the diagnosis until the team confirms**.
- `reject` → never used.
- Every score needs a fixture test. Cases from today's data:
  - `dalcobond1` confirmed (site match).
  - `Saudi.Cladding` for Dalcobond rejected (no site match, name mismatch).
  - `alucopanel` for alucopanel.sa rejected (links alucopanel.net).
  - `almarketersa` likely (exact typeahead name).
  - `@almaraicom` confirmed. [untested] Needs the channel's about links or the website footer (`youtube.com/user/almaraicom` is on almarai.com).

---

## 3. B — "No posts readable" vs "really no posts", and a second route per platform

General rule for every platform: a capture reports **posts total** and **posts listed** separately.

| Situation | Status |
|---|---|
| Total > 0 but nothing listed | `posts_hidden` / `parse_failed`: numbers stay unknown, try the next route |
| Total = 0 and the list section exists and is empty | `no_posts` (a real finding) |
| Profile missing | `not_found`: never "no posts" |

### 3.1 LinkedIn

**Telling them apart:**

- Guest company page with `data-test-id="updates"` and 0 `<article data-activity-urn>` → really no posts.
- Page present **without** the updates section → posts hidden from guests.
  - [tested ✓] `unibondsa` (233 followers, 144 KB page) and `alucopanel` (578 followers, 127 KB, JSON-LD only).
  - Same result inside Chromium.
  - Unibond does post (assisted capture).

| Route | Tested | URL / headers | Gives | Reliability |
|---|---|---|---|---|
| Guest company page (current) | ✓ | `GET https://www.linkedin.com/company/<slug>` browser UA, `accept-language: en-US` | Almarai: 1,598,601 followers, 10 posts (2026-08-12 → 09-14, i.e. only ~33 days for a frequent poster), reactions, comments, JSON-LD, `about_website` | No 999/429 in ~30 LinkedIn requests at 7–8 s today. **10 posts is a hard cap.** |
| Scroll / "show more" as guest | ✗ | Chromium, scrolled 8 times | Still 10 posts; sign-in modal; no `feedUpdates` calls | — |
| `organization-guest/api/feedUpdates/<id>?paginationToken=` (token printed in the page) | ✗ | Same token → the same 10 posts; no token → 400; edited token → 404 | — | No pagination for guests |
| `/company/<slug>/posts/?feedView=all` | ✗ | — | 302 → `/uas/login` | — |
| **Post embed** | ✓ | `GET https://www.linkedin.com/embed/feed/update/urn:li:activity:<ID>` | Title "Almarai \| … \| 55 comments", reactions via `social-actions__reaction-count` (189), `data-num-comments` (55), commentary, **author link** (`/in/omarshegem` exposed the wrong capture). Date = `id >> 22` ms. | 19–24 KB, plain fetch. Also `/feed/update/urn:li:activity:<ID>/` (177 KB, same data). |
| Post ids from search engines | ✓ (Bing RSS, once) / rate-limited | `site:linkedin.com/posts "<slug>_"` → URLs `…/posts/<slug>_…-activity-<ID>-xxxx`. [tested ✓] Bing RSS gave `technopanelco_…activity-6975020800416317440`. DuckDuckGo/Brave hit rate limits before this query ran. | Post ids → date from id + embed for numbers | Search indexes lag; coverage partial. Use only for hidden-posts pages, mark the capture "partial (posts found via search)". |
| Wayback CDX for `posts/<slug>_*` | ✓ but sparse | — | Almarai 5 URLs from Jan–Feb 2026; none for the others | Not useful for the 90-day window |
| **Guest personal profile `/in/<slug>`** | ✓ | `GET https://www.linkedin.com/in/dalcobond` | "5K followers", 9 activity URNs with dates (2023-12-18 → 2024-04-16), post links | Personal-profile data: use only when the brand itself runs the `/in/` page as its brand page, marked as such. The owner decides. |

Sketch (hidden posts → search → embed, with author check):

```js
async function linkedInPostsViaEmbed(slug, activityIds, { fetchImpl = fetch, pauseMs = 8000 } = {}) {
  const posts = [];
  for (const id of activityIds.slice(0, 10)) {
    const res = await fetchImpl(`https://www.linkedin.com/embed/feed/update/urn:li:activity:${id}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    if (res.status === 429 || res.status === 999) throw new RateLimited('linkedin');
    const html = await res.text();
    const author = (html.match(/href="https:\/\/[a-z]{2,3}\.linkedin\.com\/(company|in)\/([^"?/]+)/) || [])[2];
    if (author && author.toLowerCase() !== slug.toLowerCase()) continue;          // not this company's post
    posts.push({ id, date: linkedInActivityDate(id),
      likes: parseCount(strip((html.match(/social-actions__reaction-count"[^>]*>([\s\S]*?)<\/span>/) || [])[1])) ?? 0,
      comments: Number((html.match(/data-num-comments="(\d+)"/) || [])[1] || 0) });
    await pause(pauseMs);
  }
  return posts;
}
```

### 3.2 Instagram

**Telling them apart:**

- Profile og "N Posts" with N > 0 but no `polaris_ordered_timeline_connection` → hidden/unreadable.
- N = 0 → really no posts.
- Title "Profile isn't available" → not found.
- Private accounts [untested] should show "This account is private".

| Route | Tested | URL / headers | Gives | Reliability |
|---|---|---|---|---|
| Profile page in Chromium (current) | ✓ | `https://www.instagram.com/<user>/` | og: 778K followers, 6,205 posts; 12 timeline nodes (Almarai 2026-08-18 → 09-09 = 22 days); pinned posts come first (almarketerksa: 3 posts from 2026-03-08) → **sort by date** | `page_info.has_next_page: true`, but "Show more posts" opens a login dialog. **12 is a hard cap.** |
| Plain `fetch` of the profile or embed | ✗ | Same URLs | 200, ~626 KB JS shell with no data (identical size for every handle) | Browser required |
| `api/v1/users/web_profile_info/?username=` + `x-ig-app-id: 936619743392459` | ✗ | fetch → **429** empty. Inside the page in Chromium (same origin, csrftoken) → **401** `{"message":"Please wait a few minutes before you try again.","require_login":true}` | — | Closed to logged-out visitors |
| `/<user>/?__a=1&__d=dis` | ✗ | — | 400 "SecFetch Policy violation." | — |
| The page's own `/api/graphql` calls | ✗ | Captured in Chromium | Only experiment/dialog queries, no media | — |
| **Profile embed** | ✓ | `https://www.instagram.com/<user>/embed/` in Chromium | `"contextJSON"` → `context.followers_count` **778458 (exact)**, `posts_count` 6205, `graphql_media[6]` each with `shortcode`, `taken_at_timestamp`, `__typename` (GraphImage/GraphSidecar/GraphVideo), `edge_liked_by.count`, `edge_media_to_comment.count`. almarketerksa: 8 followers, 77 posts, 6 latest non-pinned. | One request for 6 posts with likes **and comments**. Comment counts include giveaway threads (18,765 on one post). Reported as-is. |
| Post embed (current) | ✓ | `https://www.instagram.com/p/<code>/embed/captioned/` | "1,933 likes", "View all 107 comments"; the HTML also has `edge_liked_by`/`edge_media_to_comment` JSON | 2.5 s pace as today |
| Mirrors (picuki, imginn, dumpor, greatfon, pixwox/pixnoy, inflact, piokok) | ✗ | — | Cloudflare 403/"Just a moment", or a generic tool page | Also not legitimate sources. **Don't use.** |
| Posts older than the 12 via search `site:instagram.com/p/ <brand>` → shortcode → embed | [untested] | — | Would extend the window | Needs search budget; partial coverage |

Sketch (profile embed parser, tested on saved pages):

```js
export function parseInstagramProfileEmbed(html) {
  const m = String(html || '').match(/"contextJSON":("(?:[^"\\]|\\.)*")/);
  if (!m) return null;
  const c = JSON.parse(JSON.parse(m[1])).context || {};
  return {
    profile: { name: c.full_name || null, followers: c.followers_count ?? null, postsTotal: c.posts_count ?? null },
    posts: (c.graphql_media || []).map((e) => e.shortcode_media || e).map((n) => ({
      id: n.id || n.shortcode, url: `https://www.instagram.com/p/${n.shortcode}/`,
      date: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
      type: n.__typename === 'GraphVideo' ? 'video' : n.__typename === 'GraphSidecar' ? 'carousel' : 'image',
      likes: n.edge_liked_by?.count ?? null, comments: n.edge_media_to_comment?.count ?? null, shares: null, views: n.video_view_count ?? null })),
  };
}
// Flow: profile page (12 posts, dates) → profile embed (exact followers + likes/comments for newest 6) → post embeds for the other in-window posts.
```

### 3.3 Facebook

**Telling them apart:**

- The Page Plugin shows the header (followers) but 0 `abbr[data-utime]` → really no recent posts. [untested] No such page found today.
- The plugin body is empty → the page is missing, age/country-restricted, or not a page. [tested ✓] Missing page and Heineken both gave an empty body.
- Confirm with a plain fetch of `www.facebook.com/<page>`: title "Facebook" and no og → **not readable without login**. That result means "missing or restricted" and can't be split further. Personal profiles with public followers (tested `zuck`) work in the plugin.

| Route | Tested | URL / headers | Gives | Reliability |
|---|---|---|---|---|
| Page Plugin in Chromium (current) | ✓ | `https://www.facebook.com/plugins/page.php?href=…&tabs=timeline&width=500&height=5000&hide_cover=true&show_facepile=false` | Almarai 4,799,321 followers, 5 posts (09-08 → 08-19) with reactions/comments/shares | Scrolling inside the plugin: still 5. **5 is a hard cap.** |
| Page Plugin by plain fetch | ✗ (partial) | Same URL | 45 KB, "4,799,322 followers" text; posts load by JS (0 `data-utime`) | Followers only |
| **`www.facebook.com/<page>` by plain fetch** | ✓ | Headers: browser UA, `accept-language`, `sec-fetch-mode: navigate`, `sec-fetch-dest: document`, `sec-fetch-site: none`. Follow the 302 (`/Almarai` → `/almarai/`). | 1.3–1.5 MB HTML: title; og "4,799,321 likes · 33,959 talking about this · 10,886 were here"; `"text":"4.7M followers"` (rounded); 1 latest post (`creation_time`, `reaction_count` 149, `share_count` 5); **external links** (`dalcobond.com` ×7, instagram/x links) | Best source for the confidence check. Followers text is rounded; the plugin gives exact numbers. |
| `m.facebook.com/<page>` (iPhone UA) | ✓ | — | 11 KB; og with likes, "talking about this", "were here" | Likes ≠ followers. Label it "page likes". |
| `mbasic.facebook.com` | ✗ | — | 302 → login (`refsrc=deprecated`) | Retired |
| Plugin with other tabs/widths | [untested] | `tabs=events`, `messages` | Not post data | Not pursued |
| Meta Ad Library page (active ads) | [untested here] | Already a manual check | Ads, not posts | — |

### 3.4 X

**Telling them apart:**

- FxEmbed `user.tweets` > 0 but statuses empty → unreadable, try again later.
- `tweets` = 0 → no posts.
- 404 → not found. Confirm with oEmbed 404, then propose "not on X".
- [untested] Suspended or protected accounts. FxEmbed probably also answers 404 or empty; handle both as "not readable".

| Route | Tested | URL / headers | Gives | Reliability |
|---|---|---|---|---|
| FxEmbed profile (current) | ✓ | `https://api.fxtwitter.com/<h>` | Almarai: 482,169 followers, 53,260 posts, `website.url` almarai.com, `joined`, id | Volunteer service; self-host option exists |
| FxEmbed statuses (current) | ✓ | `https://api.fxtwitter.com/2/profile/<h>/statuses[?cursor=]` | 20 per page (2026-09-15 → 08-18), `cursor.bottom` | Good |
| X oEmbed (existence) | ✓ | `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F<h>` | 200 for real accounts (widget HTML, no numbers); 404 for DalcoBond and fake handles | Official endpoint; existence only |
| vxtwitter `api.vxtwitter.com/<h>` | ✗ | — | 403 Cloudflare | — |
| Syndication `syndication.twitter.com/srv/timeline-profile/screen-name/<h>` | ✗ | — | 429 | — |
| Per-tweet `cdn.syndication.twimg.com/tweet-result?id=&token=` | [untested] | — | Would need tweet ids from elsewhere | — |
| Nitter: `nitter.net`, `nitter.poast.org` | ✗ | — | Connection failed | — |
| Nitter: `xcancel.com` | ✗ | — | 451 "XCancel service is suspended." | — |
| Nitter: `nitter.privacyredirect.com`, `nitter.tiekoetter.com` | ✗ | — | Anubis "Making sure you're not a bot!" | Anti-bot by design: don't bypass |
| Nitter: `lightbrd.com`, `nitter.space` | ✗ | — | Cloudflare 403 | — |
| **x.com in Chromium** | ✓ | `chromium.launch({ channel: 'chromium' })` (new headless). The default headless shell got **403**. | Header "482.1K Followers", "53.3K posts", bio, website; ~5 posts with reply/repost/like/view counts; then "See … full profile" login prompt | Fallback for followers + a last-post date; screenshot readable (§4.2) |

### 3.5 TikTok

**Telling them apart:**

- Profile JSON `statusCode` 0 with `videoCount` > 0 and an empty list → unreadable.
- `videoCount` = 0 → no posts.
- `statusCode` 10221 or oEmbed 400 → not found.
- Private accounts: `privateAccount: true` → "private", not "no posts".
- **Bug to fix:** yt-dlp gives the *same* error for a missing user as for its known glitch ("Unable to extract secondary user ID"). Today the code reports such a user as "could not be read" instead of "not found". Check oEmbed first.

| Route | Tested | URL / headers | Gives | Reliability |
|---|---|---|---|---|
| yt-dlp `--flat-playlist -J` (current) | ✓ | `tools/yt-dlp.exe` 2026.08.19 | almarketerksa: entries with timestamp, views, likes, comments, reposts in 6 s | Good today |
| Profile JSON in Chromium (current) | ✓ | `__UNIVERSAL_DATA_FOR_REHYDRATION__` | almarai: 303,800 followers, 507 videos, bioLink almarai.com. almarketerksa: 20 / 83 | Plain fetch returns a 1,462-byte shell: browser needed |
| Profile video grid in Chromium | ✗ | — | "Something went wrong. Sorry about that! Please try again later." (logged out) | — |
| **Creator embed** (plain fetch) | ✓ | `GET https://www.tiktok.com/embed/@<h>` browser UA | `__FRONTITY_CONNECT_STATE__` → `source.data["/embed/@h"].userInfo` {id, uniqueId, nickname, followerCount, followingCount, heartCount, privateAccount} + `videoList[]` {id, desc, playCount, …}. almarketerksa 10 videos; almarai 13 (3 pinned from March first) | No browser, one request. Date = `BigInt(id) >> 32n` seconds (matched yt-dlp dates). No likes per video. |
| **Video embed v2** (plain fetch) | ✓ | `GET https://www.tiktok.com/embed/v2/<videoId>` | `source.data["/embed/v2/<id>"].videoData.itemInfos` {createTime, diggCount 7, commentCount 0, shareCount 0, playCount 340} + `authorStats` {followerCount 20, videoCount **83**, heartCount} | One request per video (≈10 per profile), 3–4 s pace |
| oEmbed (existence + name) | ✓ | `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@<h>` | `author_name`, creator embed HTML | 400 when missing |

Sketch (TikTok without yt-dlp and without a browser):

```js
const frontity = (html) => JSON.parse((String(html).match(/<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || 'null');
async function tiktokViaEmbeds(handle, { fetchImpl = fetch, pauseMs = 3500, windowStart }) {
  const res = await fetchImpl(`https://www.tiktok.com/embed/@${handle}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US' } });
  if (res.status === 400) return { status: 'not_found' };
  const data = frontity(await res.text())?.source?.data?.[`/embed/@${handle}`];
  if (!data?.userInfo) throw new Error('TikTok embed changed');
  const idDate = (id) => new Date(Number(BigInt(id) >> 32n) * 1000).toISOString();
  const ids = data.videoList.map((v) => v.id).sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1));   // pinned first in the list → sort
  const posts = []; let videoCount = null;
  for (const id of ids.filter((id) => Date.parse(idDate(id)) >= windowStart)) {
    await pause(pauseMs);
    const v = frontity(await (await fetchImpl(`https://www.tiktok.com/embed/v2/${id}`, { headers: { 'user-agent': UA } })).text())?.source?.data?.[`/embed/v2/${id}`]?.videoData;
    const i = v?.itemInfos || {};
    videoCount ??= v?.authorStats?.videoCount ?? null;
    posts.push({ id, url: `https://www.tiktok.com/@${handle}/video/${id}`, date: i.createTime ? new Date(i.createTime * 1000).toISOString() : idDate(id),
      type: v?.imagePostInfo ? 'carousel' : 'video' /* check imagePostInfo on a real video vs photo post */, caption: i.text || null, likes: i.diggCount ?? null, comments: i.commentCount ?? null, shares: i.shareCount ?? null, views: i.playCount ?? null });
  }
  const u = data.userInfo;
  return { profile: { name: u.nickname, followers: u.followerCount, totalLikes: Number(u.heartCount), postsTotal: videoCount, private: u.privateAccount }, posts, limit: data.videoList.length };
}
```

### 3.6 Snapchat (today: manual → can be automatic)

[tested ✓] `GET https://www.snapchat.com/add/<user>` (redirects to `/@user`). Plain fetch, browser UA, no browser needed. Parse `<script id="__NEXT_DATA__">` → `props.pageProps`.

| Field | Path | Tested values |
|---|---|---|
| Name, bio, website | `userProfile.publicProfileInfo.title / bio / websiteUrl` | Jarir "Jarirbookstore", `https://www.jarir.com`; Almarai `https://www.almarai.com` |
| Subscribers | `publicProfileInfo.subscriberCount` (string) | Jarir 141300, Almarai 37000, **Al-Marketer "0" = hidden** (store as unknown) |
| Last profile update | `publicProfileInfo.lastUpdateTimestampMs.value` | Almarai 2026-09-09 |
| Spotlight posts | `spotlightStoryMetadata[].videoMetadata.uploadDateMs` + `engagementStats` {viewCount (−1 = hidden), shareCount, commentCount, boostCount, recommendCount} | Jarir: 16 Spotlights 2026-09-01 → 09-14 (e.g. 10,948 views, 330 shares, 10 comments). Almarai: 11, **not in date order** (2021 → 2026-03-14). One entry had no metadata → skip. |
| Current story | `story.snapList[].timestampInSec.value` | Jarir: 3 snaps posted 2026-09-14 14:14 |
| Highlights | `curatedHighlights[].snapList[].timestampInSec` | Jarir: 27 (latest 2026-09-03) |
| More Spotlights | `spotlightHighlightsCursor` | [untested] how to page with it |
| Missing account | HTTP 404 | ✓ |

**What this means for the audit:**

- Posting activity = Spotlight uploads in 90 days + whether a story is live now + latest highlight date.
- Followers are known only when the brand shows them.
- Views are often hidden (−1).
- Label the metric "Spotlight posts", not "posts", because stories disappear after 24 h and can't be counted over 90 days.

```js
export function parseSnapchatProfile(html) {
  const pp = JSON.parse((String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '{}').props?.pageProps || {};
  const info = pp.userProfile?.publicProfileInfo;
  if (!info) return null;                                            // 404 page or personal (non-public) profile
  const n = (v) => (v === undefined || v === null || Number(v) < 0 ? null : Number(v));
  const subs = n(info.subscriberCount);
  return {
    profile: { name: info.title, followers: subs === 0 ? null : subs, website: info.websiteUrl || null, bio: info.bio || null,
      lastUpdate: info.lastUpdateTimestampMs?.value ? new Date(Number(info.lastUpdateTimestampMs.value)).toISOString() : null,
      storyLiveSnaps: pp.story?.snapList?.length || 0 },
    posts: (pp.spotlightStoryMetadata || []).filter((s) => s.videoMetadata?.uploadDateMs).map((s) => ({
      id: s.videoMetadata.contentUrl || s.videoMetadata.uploadDateMs, date: new Date(Number(s.videoMetadata.uploadDateMs)).toISOString(), type: 'video',
      caption: s.videoMetadata.embeddedTextCaption || null, likes: null, comments: n(s.engagementStats?.commentCount), shares: n(s.engagementStats?.shareCount), views: n(s.engagementStats?.viewCount) }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}
```

`captureMethod('snapchat')` in `pipeline/social.js` can become `auto`, with manual as the fallback.

### 3.7 YouTube

**Telling them apart:**

- yt-dlp/`ytInitialData` with 0 entries on `/videos` → check `/shorts` and `/streams` [untested].
- 404 → wrong handle → channel search (§2.3).

| Route | Tested | URL | Gives | Reliability |
|---|---|---|---|---|
| yt-dlp (current) | ✓ | `@almaraicom/videos` | Channel name, 386,000 followers, entries with views; **no timestamps in flat mode** (the code makes one call per video) | Good; 404 on a wrong handle |
| **RSS** | ✓ | `https://www.youtube.com/feeds/videos.xml?channel_id=UCF9ZYiAv8zR3ygdRnu-pi7w` | 15 latest: `<published>`, `<media:statistics views="…">`, `<media:starRating count="…">` (= likes) | One request replaces ~12 yt-dlp calls. Needs the channel id (`externalId` in `/videos` HTML, or yt-dlp `channel_id`). No comments. |
| `/@handle/videos` by plain fetch | ✓ | `cookie: CONSENT=YES+1; SOCS=CAI` | `ytInitialData`, 30 video ids, "386K subscribers", `externalId` | Relative dates only |
| Keyless channel search | ✓ | §2.3 | Candidates | Good |

---

## 4. C — Blocked, rate-limited, login walls

### 4.1 Signals seen today and the policy

| Host | Block signal observed | How it looked |
|---|---|---|
| LinkedIn | None in ~30 requests at 7–8 s. Known signals: 999 / 429 (code already handles). Login wall = 302 to `/uas/login` or `/authwall`. | — |
| Instagram | `web_profile_info` 429 (fetch) / 401 `require_login` (in page) | Profile pages fine at 6–8 s |
| TikTok | None | yt-dlp glitch message is the same as for missing users |
| X | Syndication 429; x.com default headless 403 | FxEmbed fine at 2.5 s |
| DuckDuckGo | HTTP 202 anomaly page | Cool-down ≈ 50 min |
| Brave | 429, no `Retry-After` | Many minutes |
| Bing | HTTP 200 with junk results | A silent block: needs a relevance check |
| Snapchat, YouTube, FxEmbed | None | — |

**Policy (deterministic, in code):**

1. **One pace per host,** not per brand:
   - LinkedIn 8 s
   - Instagram pages 6 s, embeds 2.5 s
   - TikTok embeds 3.5 s
   - FxEmbed 2 s
   - Snapchat 4 s
   - DuckDuckGo ≥ 30 s and ≤ 2 queries per 60 min
   - Brave ≥ 2 min
2. **On the first block signal (429/999/202/401 `require_login`) for a host:**
   - Never retry the same host in that run.
   - Record `status: 'rate_limited'`, `host`, `retryAfter`: 15 min on the 1st block, 60 min on the 2nd, the next working day on the 3rd.
   - Move straight to the **next route on a different host or endpoint** for that platform (table below).
3. **Chains:**

   | Platform | Route order |
   |---|---|
   | LinkedIn | Guest page → post embeds (for known ids) → `/in/` guest (brand-run only) → screenshot → manual |
   | Instagram | Profile page → profile embed → post embeds → screenshot → manual |
   | Facebook | Page Plugin → www fetch (1 post + followers) → m.facebook og → screenshot → manual |
   | X | FxEmbed → (self-hosted FxEmbed if configured) → x.com in Chromium new headless → screenshot → manual |
   | TikTok | yt-dlp → creator embed + v2 embeds → profile JSON (followers only) → screenshot → manual |
   | Snapchat | `__NEXT_DATA__` → screenshot → manual |
   | YouTube | Data API (key) → yt-dlp + RSS → `ytInitialData` → manual |

4. **Later retries:**
   - A capture in `rate_limited` is retried automatically only after `retryAfter`, and only when the team opens the Social tab or runs the step again. No background loops, no IP changes, no proxies.
5. **Result states:**
   - Every route returns one of: `ok`, `partial` (limit reached or some fields missing), `no_posts` (list present and empty), `posts_hidden`, `not_found`, `restricted_or_missing` (Facebook), `private`, `login_wall`, `rate_limited`, `parse_failed` (the page changed; save the HTML for a fixture).
   - Only `ok`/`partial`/`no_posts` feed the scorecard. `not_found` proposes "not on this platform" to the team.

### 4.2 Screenshot + AI reads the numbers

Test [tested ✓]:

- Chromium (`channel: 'chromium'`, 1280×1000, logged out) opened TikTok `@almarketerksa`, Instagram `almarai` and LinkedIn `almarai`, plus X `Almarai` from the §3.4 test, and saved PNGs.
- One headless call, mirroring `ai/runner.js`: `claude -p --model haiku --output-format json --json-schema <schema> --tools Read --allowedTools Read --permission-mode dontAsk --setting-sources "" --no-session-persistence`.
- The prompt asked it to Read 3 PNGs and report values "as printed".
- 28 s, 5 turns, CLI cost estimate $0.03 (covered by the subscription; estimate only).

| Image | Haiku read | Correct? |
|---|---|---|
| TikTok | followers "20"; posts hidden reason "error message" | Yes (the grid showed "Something went wrong") |
| Instagram | followers "778K" | Yes |
| X (scrolled) | posts "53.3K posts"; visible date "Sep 8"; followers null (off-screen) | Yes; null instead of a guess |

**Assessment:**

- **Feasible and cheap** for follower counts, total posts, "is there an error/login wall", and relative dates printed on X/LinkedIn/Facebook ("Sep 8", "1w").
- **Not a source of post lists:** the Instagram grid and TikTok show no dates, and the Instagram grid doesn't show likes either.
- `innerText` of the same page already gave exact strings ("20 Followers 247 Likes", "778K followers", "1,598,634 followers"). **Prefer text: code reads numbers from the saved page text first.**
- Use the AI image read only when the text has no number (canvas, obfuscated markup) or to confirm "this is an error/login wall, not an empty profile".
- Earlier research (docs/research-social.md §1.7) found that Claude misreads Arabic text in screenshots. Read only digits and Latin labels from images, never Arabic captions.
- **Rule 3 still applies:**
  - The AI returns strings *as printed* ("778K").
  - **Code** converts them with `parseCount`.
  - The value is marked approximate when abbreviated (K/M).
  - Code checks the string appears in the saved page `innerText` when text exists; if not, the value is flagged "read from image, team to confirm".

**Evidence to store per screenshot capture:**

- `screenshots/<brand>__<platform>__<ISO time>.png` (viewport, not full page)
- The page `innerText` (first 5,000 chars)
- Final URL, HTTP status, UA, viewport, capture time
- The AI request/response JSON (model, schema, as-printed strings)
- The code-parsed numbers with `method: 'screenshot+ai (logged out)'`
- `approximate: true` for abbreviated numbers
- `confirmedBy` once the team approves

Sketch:

```js
const browser = await chromium.launch({ channel: 'chromium' });              // new headless: x.com gave 403 to the default headless shell
const page = await (await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1280, height: 1000 } })).newPage();
const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.waitForTimeout(7000);
for (const sel of ['[aria-label="Close"]', 'button:has-text("Decline optional cookies")', 'button:has-text("Not now")']) // dismiss only, never log in
  if (await page.locator(sel).first().isVisible().catch(() => false)) await page.locator(sel).first().click({ timeout: 2000 }).catch(() => {});
await page.screenshot({ path: shotPath });
const text = (await page.evaluate(() => document.body.innerText)).slice(0, 5000);
const fromText = parseProfileNumbersFromText(platform, text);                // code first
if (fromText.followers === null) await queueAiImageRead({ shotPath, schema: SCREENSHOT_SCHEMA, model: 'haiku' }); // AI only reads "as printed"
```

---

## 5. What to change in our code (proposal only, nothing implemented)

1. **`collect/social/discover.js` (new):**
   - Candidates from the website (links + JSON-LD `sameAs`) and confirmed-profile cross-links.
   - LinkedIn typeahead; YouTube channel search; existence probes (§2.4); DuckDuckGo Instant Answer/Wikidata; then DuckDuckGo/Brave within budget.
   - Every candidate scored by `profileConfidence` with fixture tests.
2. **Capture identity check:** each capture stores the profile's own name/handle/website. Posts whose author ≠ profile are dropped (the Omar Shegem posts in `c4`/`c6`).
3. **Instagram:** add the profile embed step (exact followers, likes + comments for 6 posts in one request); sort posts by date (pinned posts); detect "Profile isn't available" → `not_found`.
4. **TikTok:** oEmbed existence check before yt-dlp (fixes "missing user reported as unreadable"); creator embed + v2 embeds when yt-dlp fails; `statusCode 10221` → `not_found`.
5. **YouTube:** RSS for dates/likes; 404 → channel search candidates.
6. **X:** FxEmbed 404 → oEmbed 404 → `not_found` + candidates. Optional x.com new-headless route for followers.
7. **LinkedIn:**
   - `hasUpdates === false` → `posts_hidden` (followers kept).
   - Optional post discovery via search + embed with the author check.
   - Follow 301 slug renames and store the final slug.
   - Guest `/in/` capture only when the team marks it "brand-run personal page".
8. **Facebook:** www fetch for links/followers/latest post; empty plugin + no og → `restricted_or_missing`.
9. **Snapchat:** new `captureSnapchatPublic` (plain fetch + `__NEXT_DATA__`); `captureMethod('snapchat')` → `auto`.
10. **Per-host pacing and `rate_limited` status** with `retryAfter` (§4.1).
11. **Screenshot fallback** as the last automatic route, text first and AI image read second (§4.2).
12. **Fixtures:** save today's shapes (minimal):
    - LinkedIn: guest page without updates, 404 page, post embed
    - Instagram: profile embed `contextJSON`
    - TikTok: FRONTITY creator and v2 embeds
    - Snapchat: `__NEXT_DATA__`
    - YouTube: RSS
    - FxEmbed: 404 JSON
    - Search engines: DuckDuckGo/Brave result HTML, DuckDuckGo 202 anomaly page

---

## 6. Simply not possible without a login (as of today)

| Platform | Not possible logged out |
|---|---|
| Instagram | More than the latest 12 posts; the JSON profile API; view counts; comment text; stories |
| LinkedIn | More than the latest 10 posts on a company page; posts of company pages that hide them from guests (except those found one by one via search + embed); repost counts; numeric company id → page; `/posts` feed |
| Facebook | More than 5 posts; any data from age/country-restricted pages; telling "missing" from "restricted"; comment text |
| X | Timelines via X's own endpoints (syndication 429, x.com shows ~5 posts then a login prompt); Nitter-style mirrors (all down or anti-bot) |
| TikTok | The profile video grid in a browser (errors logged out); per-video likes without one embed request per video |
| Snapchat | Hidden subscriber counts; story view counts; a 90-day story history (stories expire) |
| Search | Google and Bing results from code without a key (Bing returns junk); more than a few DuckDuckGo/Brave queries per hour from one IP |
