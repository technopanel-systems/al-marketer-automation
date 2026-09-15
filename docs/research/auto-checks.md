# Automating the "manual checks" (Ad Library, brand search, Maps, social activity, unanswered comments)

_Tested live on 2026-09-15 from this machine (Windows 11, Node 24.15, Playwright 1.63, Chromium 153 headless shell, a Saudi mobile-carrier IP in Riyadh). No logins, no accounts, no CAPTCHA solving, no proxies, no paid services. Prototype scripts, raw JSON output and screenshots: `C:\Users\jerom\AppData\Local\Temp\claude\auto-checks\` (outputs in `out\`). No project source file was changed._

The five checks are created in `collect/site.js` ("Manual checks that need a person") with `result: 'unknown'`, `manual: true`, and a link for a person to open.

## Verdict

| Check today | Automatable? | Working route (tested) | What code extracts | Blockers / limits |
|---|---|---|---|---|
| `manual_meta_ad_library` | **Yes** | Facebook **Page Plugin** → the page's numeric id → Ad Library `view_all_page_id=<id>&country=SA` (logged out) | Active-ad count for **that page** in the country, start dates, platforms, landing URLs; look-alike advertisers from the keyword search | Needs the brand's Facebook page URL (intake or website link). Without it the answer is "unknown", never a name guess. Counts are Meta's "~N". |
| `manual_google_brand_search` | **Google: no.** Same question on another engine: **yes** | **Brave Search** (reliable). **Startpage** (Google's results) works about 1 run in 3. | Top-10 organic URLs with rank; rank of the client's domain and social profiles | Google showed "unusual traffic" + reCAPTCHA on the **first** request, in every mode (6 of 6). DuckDuckGo: CAPTCHA/418. Bing silently returned unrelated results (4 of 6 queries). **The check label must name the engine** (see the Al Marketer case below). |
| `manual_google_maps` | **Yes** | `google.com/maps/search/<name>?hl=en&gl=sa`, headless | Name, rating, review count, category, address, phone, website, plus code, 7-day hours, open now, "Claim this business" prompt, owner replies visible | Google serves a **"limited view"** to logged-out sessions (fields above still present). A listing counts as the client's only if its website link matches the client's domain. |
| `manual_social_activity` | **Already automated** | `pipeline/social.js` → `engine/social/metrics.js` → checks `social:client:<platform>:cadence` | Last post date, days since, posts/week over 90 days | None. The manual check is redundant: for Technopanel it is still "unknown" next to six code-made cadence checks. |
| `manual_unanswered_comments` | **Partly** | Facebook: the logged-out **post page** (comments + page replies). YouTube: **yt-dlp** comments. Instagram: comment text only. | FB: visible comments, which were answered by the page ("Author"), which have 0 replies. YT: every comment with `author_is_uploader`. IG: newest ≤15 comments (text, date, user). | FB shows only the "Most relevant" subset (3 of 7; 1–2 of 15–64 on videos). **Instagram hides reply counts from logged-out visitors**, so "unanswered" on Instagram stays **unknown**. TikTok: yt-dlp returned 0 of 14 comments. |

Extra free sources tested:

| Source | Usable for Saudi Arabia / Egypt? | Notes |
|---|---|---|
| **Google Ads Transparency Center** | **Yes** (both regions tested) | Search by domain + region. "~N ads" (any time and last 30 days), advertiser names and "Verified", per-format counts, last-shown date. |
| **LinkedIn Ad Library** | **Yes** (plain HTTP works) | "2 ads match your search criteria" for Jarir Bookstore, SA, last 30 days. Each ad's page gives the advertiser company id and "Paid for by". Matching by company id is [untested]. |
| TikTok Ad Library | **No** | Its own `api/v1/support-regions` lists 33 regions (EU/EEA, CH, GB, TR). No SA, no EG. |
| Snap Ads Gallery | **No** | The "Shown in" list is EU countries + Turkey. The Political Ads Library covers political ads only. |

---

## 1. Meta Ad Library — `manual_meta_ad_library`

### What was tested
| Brand | Country | Facebook page (from plugin) | Page id | Keyword search | **Active ads of the page** | Answer |
|---|---|---|---|---|---|---|
| Almarai | SA | المراعي - Almarai | 271672772867718 | ~160 (157) | **~76** | yes |
| Jarir Bookstore | SA | Jarir Bookstore مكتبة جرير | 190297627669223 | ~78 | **~29** (run 2: 29 again) | yes |
| تكنوبانل (Technopanel, small) | SA | Technopanel - تكنوبانل | 2033228233590083 | 0 | **0** | no |
| Zooba (Egypt) | EG | Zooba | 172785516154290 | ~57 | **0** | no |
| Al Marketer | SA | Al-Marketer الماركتير | 924048704124811 | ~22 | **0** | no |

- **Logged out works.** The document answers HTTP 403, but the page renders and embeds its results as JSON (`script[type="application/json"]` → `search_results_connection`, with `count` and `edges[].node.collated_results[]`).
- **Why the page id, not the name.** The keyword search mixes in other advertisers, and name or domain matching gives wrong answers:
  - For "Zooba" in Egypt, the advertisers were "Dokan Zooba - دكان زووبا" (15 ads), "دكان زووبا - Dokan zooba" (7) and "زوبا -Zooba" (2 ads, 117,675 likes). That last one is a **clothing brand** ("ملابس (علامة تجارية)", skirts), not the restaurant. The restaurant's own page runs 0 ads.
  - For "Jarir Bookstore", **BenQ** ads link to jarir.com (a retailer link, not Jarir's ad), and "Tamara تمارا" also appears.
  - So: `answer = activeAds of view_all_page_id`. The domain match is only a hint shown to the team.
- **Page id source.** The public page `facebook.com/<handle>` gives the *new* profile id (e.g. Jarir 100064456911727), which the Ad Library does **not** use. The **Page Plugin** gives the classic id the Ad Library uses: `"pageID":"190297627669223"`, also in the header link `facebook.com/<id>?ref=embed_page`.
- Extracted row (Jarir, SA):
  - Ad `1059572606665514`, page "Jarir Bookstore مكتبة جرير", started 2026-08-17, platforms `["INSTAGRAM"]`, link `https://www.jarir.com/`.
  - First batch: start dates 2026-08-06 … 2026-09-14; platforms FACEBOOK 14, INSTAGRAM 16, MESSENGER 2, THREADS 2, AUDIENCE_NETWORK 1.

### Exact URLs and waits
- Plugin: `https://www.facebook.com/plugins/page.php?href=<page url>&tabs=timeline&width=340&height=500`. Read `"pageID":"(\d+)"`; the page name is `a._1drp[title]`.
- Page ads: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=SA&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=<id>`.
- Keyword (context only): `...&q=<brand>&search_type=keyword_unordered`.
- Wait for `domcontentloaded`, then until the body text matches `/~?[\d,]+ results?|No ads match/`, plus 1.5 s.

### Code (trimmed from `meta-ads.mjs`, tested)
```js
function readEmbedded() { // runs in the page
  const find = (o, k, d = 0) => { if (!o || typeof o !== 'object' || d > 40) return; if (k in o) return o[k];
    for (const v of Object.values(o)) { const h = find(v, k, d + 1); if (h !== undefined) return h; } };
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    if (!s.textContent.includes('search_results_connection')) continue;
    try {
      const conn = find(JSON.parse(s.textContent), 'search_results_connection');
      const ads = (conn.edges || []).flatMap((e) => e.node?.collated_results || []).map((r) => ({
        adArchiveId: r.ad_archive_id, pageId: r.page_id, pageName: r.snapshot?.page_name, pageUri: r.snapshot?.page_profile_uri,
        startDate: r.start_date ? new Date(r.start_date * 1000).toISOString().slice(0, 10) : null,
        platforms: r.publisher_platform || [], linkUrl: r.snapshot?.cards?.[0]?.link_url || r.snapshot?.link_url || null }));
      return { count: conn.count, ads };
    } catch {}
  }
  return null;
}
async function openLibrary(page, url, shot) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); // HTTP 403 but renders
  await page.waitForFunction(() => /~?[\d,]+ results?|No ads match/i.test(document.body?.innerText || ''), null, { timeout: 25000 }).catch(() => {});
  await pause(1500);
  const text = await page.evaluate(() => document.body?.innerText || '');
  const data = await page.evaluate(readEmbedded);
  const shown = (text.match(/(~?[\d,]+) results?/i) || [])[1] || (/No ads match/i.test(text) ? '0' : null);
  const status = /you must log in|log in to continue/i.test(text) && !data ? 'login_wall' : !data && shown === null ? 'no_data' : 'ok';
  await page.screenshot({ path: shot });
  return { status, shown, count: data?.count ?? (shown === '0' ? 0 : null), ads: data?.ads || [], text };
}
export async function metaAdsCheck(browser, { country = 'SA', facebookUrl }) {
  const { ctx, page } = await newPage(browser, { locale: 'en-US' });
  await page.goto(`https://www.facebook.com/plugins/page.php?${new URLSearchParams({ href: facebookUrl, tabs: 'timeline', width: '340', height: '500' })}`, { waitUntil: 'domcontentloaded' });
  await pause(2000);
  const html = await page.content();
  const pageId = (html.match(/"pageID":"(\d+)"/) || html.match(/href="https:\/\/www\.facebook\.com\/(\d+)\?ref=embed_page/) || [])[1];
  if (!pageId) return { answer: 'unknown', reason: 'page id not readable' };
  const own = await openLibrary(page, `https://www.facebook.com/ads/library/?${new URLSearchParams({ active_status: 'active', ad_type: 'all', country, is_targeted_country: 'false', media_type: 'all', search_type: 'page', view_all_page_id: pageId })}`, 'meta-page.png');
  await ctx.close();
  return { pageId, activeAds: own.count, answer: own.count > 0 ? 'yes' : own.count === 0 ? 'no' : 'unknown', ads: own.ads };
}
```

**Timing:** plugin ~3 s, page view 5–7 s. With the keyword context, ~14 s per brand. About 15 Ad Library loads today showed no login wall; higher volume is [untested].

**Suggested label:** "Meta Ad Library: active ads from the brand's Facebook page shown in {country}". Result `value` = "29 active ads (Meta shows ~29), started 2026-08-06 … 2026-09-14".

---

## 2. Brand search — `manual_google_brand_search`

### Google itself: blocked
| Attempt | Result |
|---|---|
| Headless shell, `google.com/search?q=Almarai&hl=en&gl=sa`, first request of the day | `/sorry/index` "Our systems have detected unusual traffic from your computer network" + reCAPTCHA (screenshot `google-search-0.png`) |
| Same, 3 more brands, 4 s apart | Same, 4 of 4 |
| New headless (`channel:'chromium'`), open google.com, type the query with 120 ms/key | Home page loads; the search goes to `/sorry/` |
| **Visible (headed) Chromium window**, ~1 h later — the owner's idea | `/sorry/`, reCAPTCHA (`google-headed.png`) |
| Plain `fetch` | HTTP 200 JavaScript challenge page ("Please click here if you are not redirected"), no results |

**Conclusion:** an automated fresh browser on this network cannot read Google results. The only way past it is solving the CAPTCHA, which is out of bounds. The team's normal browser still works, since it carries Google cookies.

### Alternatives (same six queries on each)
| Engine | Worked | Time/query | Quality | Verdict |
|---|---|---|---|---|
| **Brave Search** (`search.brave.com/search?q=…&source=web&country=sa`) | **14/14** in Playwright (+ plain fetch OK) | **2.2–4.3 s** | Relevant, stable between runs | **Primary automated route** |
| **Startpage** (`startpage.com/sp/search?query=…`), results come from Google per Startpage | 7/19 | 4–35 s when it works | Closest to Google | Optional second opinion: an in-browser proof-of-work ("Verifying your request… Difficulty: 6") often ran past 45 s. "Access Temporarily Suspended" when one context was reused for 5 queries. |
| Bing (`bing.com/search?q=…&cc=SA`) | Pages load, 5–8 s | **4 of 6 unrelated**: "تكنوبانل" → zhihu.com / velo-club.net ("About 75 results"); "Zooba" → support.google.com in Russian / zhihu ("About 63 results"); "المسوق" → ENSAM E-Campus; "Al Marketer" → Almosafer, Saudi National Bank, Al Jazeera | Silently wrong | **Do not use** |
| DuckDuckGo HTML (`html.duckduckgo.com/html/`) | 0 | — | "Unfortunately, bots use DuckDuckGo too… Select all squares containing a duck" (HTTP 202) | Blocked |
| DuckDuckGo JS | 0 | — | Redirect to `static-pages/418.html` | Blocked |
| Mojeek | 0 | — | "JavaScript is required to complete this challenge" | Blocked (fetch) |

Brave vs Startpage, client domain rank in the top 10:

| Query | Domain | Brave | Startpage (Google results) | Bing |
|---|---|---|---|---|
| Almarai | almarai.com | 1 (LinkedIn 3) | 1 (LinkedIn 6, Instagram 9) | 1 |
| Jarir Bookstore | jarir.com | 1 (Instagram 8) | failed | 1 |
| **Al Marketer** | al-marketer.com | **not in top 10** (almarketer.net, yelp.com, almarketing.com…) | **1** | not in top 10 |
| المسوق | al-marketer.com | not in top 10 | not in top 10 | junk |
| تكنوبانل | technopanel.com.sa | 3 (Facebook 1, Instagram 2, LinkedIn 5) | failed (a manual peek showed technopanel.com.sa first) | junk |
| Zooba (EG) | zoobaeats.com | not in top 10 (the Zooba game dominates) | 8 | junk |

**Important:** Brave's index is not Google's. "Al Marketer" is #1 on Startpage's Google results and absent from Brave's top 10. So the check must say which engine answered:
- `search_brand_brave`: "Brave Search: does the brand's website appear in the top 10 for its name?" Always automated.
- `search_brand_google_via_startpage`: tried once, 60 s budget. On failure → `blocked`, and the old manual Google link stays as an **optional** check.
- Never write "not on Google page 1" from a Brave result.

### Code (trimmed from `search-alt.mjs`, tested)
```js
const isArabic = (s) => /[\u0600-\u06FF]/.test(s);
const ENGINES = {
  brave: { url: (q, cc) => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web&country=${cc.toLowerCase()}`,
    ready: 'div.snippet[data-type="web"]', timeout: 20000,
    extract: () => [...document.querySelectorAll('div.snippet[data-type="web"]')].map((d) => ({ url: d.querySelector('a[href^="http"]')?.href || '',
      title: (d.querySelector('.title, .search-snippet-title')?.innerText || '').trim() })),
    blocked: /captcha|verify you are human|too many requests/i },
  startpage: { url: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}&cat=web&language=${isArabic(q) ? 'arabic' : 'english'}`,
    ready: '.w-gl .result a.result-title', timeout: 60000, // after Startpage's proof-of-work check
    extract: () => [...document.querySelectorAll('.w-gl .result')].map((r) => ({ url: r.querySelector('a.result-title, a.result-link')?.href || '', title: (r.querySelector('h2, h3')?.innerText || '').trim() })),
    blocked: /captcha|verify you are human|temporarily suspended/i },
};
const norm = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/([a-z]{2}\.|www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
export async function brandSearch(browser, engine, query, { cc = 'SA', clientDomain, clientSocials = [], shot }) {
  const E = ENGINES[engine];
  const { ctx, page } = await newPage(browser, { locale: isArabic(query) ? 'ar-SA' : 'en-US' }); // fresh context per query
  const out = { engine, query, url: E.url(query, cc), fetchedAt: new Date().toISOString() };
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(E.ready, { timeout: E.timeout }).catch(() => {});
  await pause(1200);
  const text = await page.evaluate(() => document.body?.innerText || '');
  const seen = new Set();
  out.results = (await page.evaluate(E.extract)).filter((r) => /^https?:/.test(r.url) && !seen.has(r.url) && seen.add(r.url))
    .slice(0, 10).map((r, i) => ({ rank: i + 1, ...r, host: hostOf(r.url) }));
  out.status = out.results.length ? 'ok' : E.blocked.test(text.slice(0, 3000)) ? 'blocked' : 'no_results_parsed';
  out.clientDomainRank = out.results.find((r) => r.host === clientDomain || r.host.endsWith(`.${clientDomain}`))?.rank ?? null;
  const socials = clientSocials.map(norm);
  out.clientSocialRanks = out.results.filter((r) => socials.some((s) => norm(r.url).startsWith(s))).map((r) => r.rank);
  out.evidenceText = text.slice(0, 6000);
  await page.screenshot({ path: shot, fullPage: true }); // full page: the domain can sit below a videos block
  await ctx.close();
  return out;
}
```

Observed row (Brave, "Jarir Bookstore"):
```json
{"rank":1,"url":"https://www.jarir.com/sa-en/","title":"Jarir Bookstore, Not just a bookstore | Saudi Arabia KSA | Jarir Bookstore","host":"jarir.com"}
```

**Relevance guard (the Bing lesson):** if no top-10 title or URL contains a query word of 3+ letters, record `unreliable`, never `absent`. Run afterwards on the saved Bing results, it flagged all 4 junk pages and passed the 2 good ones (Almarai, Jarir). It is not yet wired into `brandSearch`.

---

## 3. Google Maps — `manual_google_maps`

- **Not blocked.** Maps kept working even after google.com/search had flagged the IP. There was no consent wall (the IP is Saudi).
- Many sessions show "You're seeing a limited view of Google Maps. See more". The fields below were still present.

| Query | Mode | Answer | Extracted (the listing whose website matches the domain) |
|---|---|---|---|
| تكنوبانل | single place | yes | TECHNOPANEL Cladding - تكنوبانل كلادينج · 4.1★ · 92 reviews · Manufacturer (the Arabic "مصنع" on another load) · Al Mashael, Riyadh 14325 · 050 330 0489 · technopanel.com.sa · JR5J+X2 · Sun–Thu 8 AM–4 PM, Fri/Sat Closed |
| Jarir Bookstore | list (10 shown, 5 opened) | yes, **5 of 5 opened** match jarir.com | e.g. Olaya St, Riyadh · 4.3★ · 4,683 reviews · Book store · 9200 00089 · 9 AM–11 PM (Fri 2–11 PM) · 3 owner responses visible |
| Zooba (gl=eg) | list (5) | yes, 4 of 5 match zoobaeats.com | Zööba Zamalek · 4.2★ · 6,863 reviews · Egyptian restaurant. Two branches show "Claim this business" (unclaimed); the Grand Egyptian Museum branch has no website. |
| Al Marketer | list | **not found among the 5 opened** | Marketer Junayed, AL-Amer…, Ayman Nour Agency… (none link to al-marketer.com) |
| الماركتير | single place | **needs confirmation** | "ماركيتير لك للتسويق الالكتروني", Sanaa, **Yemen**, marketerlek.com: the only result, and the website does not match |
| al-marketer.com | list | not found | — |

### Selectors (aria-labels and data-item-ids, not generated class names)
| Field | Selector |
|---|---|
| Name | `div[role="main"] h1` |
| Rating | `div.F7nice span[aria-hidden="true"]` |
| Review count | any `div[role="main"] [aria-label]` matching `^[\d,.]+ reviews?$` |
| Category | `button[jsaction*="category"]` |
| Address / phone / plus code | `button[data-item-id="address"]` / `[data-item-id^="phone:tel:"]` / `[data-item-id="oloc"]`, reading `aria-label` after the colon |
| Website | `a[data-item-id="authority"]` href |
| Hours | the 7 elements with `aria-label` ending "Copy open hours" ("Sunday, 8 AM to 4 PM, Copy open hours") |
| List results | `div[role="feed"] a[href*="/maps/place/"]` (aria-label = name), `span.MW4etd` rating, `span.UY7F9` count, "Sponsored" filtered out |

**Render quirk seen once:** a place panel had 1 hours row and no review count. It took 14 s and gave wrong data. A reload fixed it, so the code reloads once when `0 < hours < 7` or there is a rating but no review count.

### Code (trimmed from `maps.mjs`, tested)
```js
const HOURS_READY = () => document.querySelector('div[role="feed"]') || (document.querySelectorAll('[aria-label$="Copy open hours"]').length >= 7
  && [...document.querySelectorAll('div[role="main"] [aria-label]')].some((e) => /^[\d,.]+ reviews?$/.test(e.getAttribute('aria-label').trim())));
function readPlace() {
  const label = (sel) => document.querySelector(sel)?.getAttribute('aria-label')?.replace(/^[^:]+:\s*/, '').trim() || null;
  const reviews = [...document.querySelectorAll('div[role="main"] [aria-label]')].map((e) => e.getAttribute('aria-label').trim()).find((l) => /^[\d,.]+ reviews?$/.test(l));
  const rating = document.querySelector('div.F7nice span[aria-hidden="true"]')?.innerText;
  const text = document.querySelector('div[role="main"]')?.innerText || '';
  return { name: document.querySelector('div[role="main"] h1')?.innerText.trim() || null,
    rating: rating ? Number(rating.replace(',', '.')) : null, reviews: reviews ? Number(reviews.replace(/[^\d]/g, '')) : 0,
    category: document.querySelector('button[jsaction*="category"]')?.innerText.trim() || null,
    address: label('button[data-item-id="address"]'), phone: label('button[data-item-id^="phone:tel:"]'),
    website: document.querySelector('a[data-item-id="authority"]')?.href || null, plusCode: label('button[data-item-id="oloc"]'),
    hours: [...document.querySelectorAll('[aria-label$="Copy open hours"]')].map((e) => e.getAttribute('aria-label').replace(/, Copy open hours$/, '')),
    claimPrompt: /Claim this business/i.test(text), ownerResponsesVisible: (text.match(/Response from the owner/g) || []).length,
    limitedView: /seeing a limited view of Google Maps/i.test(document.body.innerText) };
}
export async function mapsCheck(browser, { query, cc = 'sa', domain, maxOpen = 5 }) {
  const { ctx, page } = await newPage(browser, { locale: 'en-US' });
  const out = { query, url: `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en&gl=${cc}` };
  await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (/consent\.google|\/sorry\//.test(page.url())) return { ...out, status: 'blocked' };
  await page.waitForSelector('div[role="main"] h1, div[role="feed"]', { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(HOURS_READY, null, { timeout: 8000 }).catch(() => {});
  await pause(2500);
  out.listings = [];
  if (!(await page.locator('div[role="feed"]').count())) {
    let place = await page.evaluate(readPlace);
    if (place.name && ((place.hours.length > 0 && place.hours.length < 7) || (place.rating !== null && !place.reviews))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(HOURS_READY, null, { timeout: 8000 }).catch(() => {});
      place = await page.evaluate(readPlace);
    }
    if (place.name) out.listings.push({ ...place, url: page.url().split('?')[0] });
  } else {
    const list = await page.evaluate(() => [...document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]')]
      .map((a) => ({ name: a.getAttribute('aria-label'), url: a.href.split('?')[0], sponsored: /Sponsored/.test(a.parentElement.innerText) })));
    for (const item of list.filter((x) => !x.sponsored).slice(0, maxOpen)) {
      await pause(1500);
      await page.goto(`${item.url}?hl=en`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(HOURS_READY, null, { timeout: 8000 }).catch(() => {});
      out.listings.push({ ...(await page.evaluate(readPlace)), url: item.url });
    }
  }
  for (const l of out.listings) l.matchedBy = hostOf(l.website || '').endsWith(domain) ? 'website_domain' : null;
  out.answer = out.listings.some((l) => l.matchedBy) ? 'yes' : out.listings.length === 1 ? 'needs_confirmation' : 'not_found_in_checked';
  await ctx.close();
  return out;
}
```

**Timing:** single place 5–6 s (14–21 s with the reload); list with 3–5 places opened 21–30 s.

**Suggested label:** "Google Maps: business listing linked to {domain}". Value: "yes — 4.1★ from 92 reviews, Manufacturer, hours Sun–Thu 8–4". Also record `not_found_in_checked` / `needs_confirmation`, never "no listing".

---

## 4. Social activity — `manual_social_activity` (already answered by code)

- `pipeline/social.js` (`runProfilesStep` / `runSocialStep`) captures the client's profiles automatically:
  - LinkedIn guest page
  - Facebook Page Plugin
  - X via FxEmbed
  - Instagram public page
  - TikTok/YouTube via yt-dlp
- `engine/social/metrics.js` `platformMetrics()` computes `lastPostDate`, `daysSinceLastPost` and `postsPerWeek` over a 90-day window, marking coverage as partial when the capture is cut off.
- `scorecardChecks()` writes `social:<brand>:<platform>:cadence` checks with `by: 'code'`.
- Evidence in `clients/technopanel/evidence/checks.json`: `manual_social_activity` is still `unknown`, next to:
  - `social:client:instagram:cadence` = "0.4 posts/week (5 posts); last post 67 days ago (2026-07-09)"
  - `social:client:linkedin:cadence` = "0.5 posts/week (7 posts); last post 58 days ago (2026-07-19)"
  - the same for facebook, x, tiktok and youtube ("last post 3130 days ago (2018-02-18)")
- **Recommendation:** drop `manual_social_activity`, or fill it from the cadence checks. Keep it open only for platforms whose capture failed (the social tasks list already covers that).

---

## 5. Unanswered comments — `manual_unanswered_comments`

### Instagram (logged out): comment text yes, reply status no
- `instagram.com/p/<code>/` logged out embeds the newest top-level comments as JSON (`xig_polaris_media.comments_connection.edges[].node`, `__typename: "XIGComment"`). Each has `text`, `created_at`, `user.username`, `child_comment_count` and `parent_comment_id`. Its visible text shows them with "Like | Reply".
  - Jarir post `DcD81w2tJpU`: 15 comments, e.g. 2026-09-14 lataiyf "متى تبدا عروض اليوم الرطني؟؟", 2026-09-12 mnnooy "هل يوجد خصم على الكتب ؟", 2026-09-09 ftts313 "جرير طالبة منكم طلبية وصار لها أكثر من أسبوع ما وصلت !…".
- **But `child_comment_count` was `null` on all 68 comments read** (7 posts: 1 jarirbookstore, 3 stc_ksa, 3 almarai), and no "View replies" link was shown.
  - stc_ksa post `DdRg9O2iW5V` has `comment_count` 7 but only 5 top-level comments, so about 2 hidden items are probably replies, yet every `child_comment_count` is null.
  - So null ≠ 0: **a logged-out visitor cannot tell whether a comment was answered.**
- The captioned embed (`/p/<code>/embed/captioned/`) shows only "215 likes … View all 127 comments", with no comment text.
- The profile's GraphQL returned "Unauthorized logged out query."
- **Verdict:** "unanswered on Instagram" stays **unknown** (optional manual). What *can* be automated honestly: "questions customers ask in the latest comments" as quotable text evidence (≤15 comments per post, ~5 s per post). Meta's Graph API would need the client's own access (the existing `META_ACCESS_TOKEN` path); [untested] here.

### Facebook (logged out): partial but real
- The logged-out **post page** (`facebook.com/<page>/posts/<pfbid>`) embeds the "Most relevant" comments as JSON (`comment_list_renderer…comments.edges[].node`, `__typename: "Comment"`), with:
  - `depth`, `body.text`, `author.{id,name}`, `created_time`
  - `feedback.replies_fields.total_count`
  - `feedback.replies_connection.edges[].node` (the replies shown)
- The page's replies carry the "Author" badge; the author id is the page's profile id, e.g. Jarir 100064456911727. Screenshot: `fb-comments-post.png`, where Fahim Joardar's question is followed by "Author · Jarir Bookstore مكتبة جرير: You can contact Tamara customer service via…".
- Reels (`/reel/<id>/`) show no comments to logged-out visitors. The same video under `/<page>/videos/<id>/` does.

| Page | Post | Comments on post | Visible | Answered by page | 0 replies | Replies by others / hidden |
|---|---|---|---|---|---|---|
| Jarir | HUAWEI offer | 7 | 3 | **2** ("If I purchase a mobile with Tamara…", "5G enabled?") | 1 ("HUAWEI IS THE BEST…") | 0 |
| Jarir | Eufy offer | 1 | 1 | 0 | 1 ("امين يارب") | 0 |
| Almarai | 5 latest videos | 25 / 15 / 64 / 33 / 45 | 2 / 2 / 2 / 1 / 2 | 0 | 5 | 4 (incl. a complaint "شكوى بشأن وجود عفن…", replies exist but not shown) |
| Technopanel | 5 latest | 0 each | 0 | — | — | — |

- **Verdict:** automatable as "Facebook: of the N visible comments on the last 5 posts, X were answered by the page, Y have no reply". The sample must be stated because it is Facebook's "Most relevant" subset.
- A comment counts as `no_reply` only when `total_count === 0`, and as `answered_by_page` only when a page-authored reply is visible.
- The "question" flag is a deterministic regex (`?` / `؟` / متى / كم / بكم / هل / كيف / وين …, whole words). It is a heuristic; show it as such.

### YouTube: complete (yt-dlp, already in `tools/`)
- `yt-dlp --skip-download --write-comments --extractor-args "youtube:max_comments=30,30,10,3;comment_sort=new" -J <video>` took 4.6 s for Jarir video `R4Bsv2nm_kI`.
- It returned 2 comments with `parent`, `author_is_uploader` and `timestamp`. Both top-level, neither answered by the channel ("الله لا يحرمنا من ابداع مكتبة جرير💚🤍…").
- Unanswered = top-level comments with no reply where `author_is_uploader`.

### TikTok: no
- yt-dlp `--write-comments` on `tiktok.com/@almarai/video/7683148595922537744` reported `comment_count` 14 but returned **0 comments**.

### Code (trimmed from `fb-unanswered.mjs`, tested)
```js
const QUESTION = /[?؟]|(?:^|[\s,.!،])(how|when|where|price|available|متى|كم|بكم|وين|فين|هل|كيف|ليش|لماذا|متوفر|متوفرة|السعر|سعر|طلبي|ما وصل|ماوصل)(?=$|[\s,.!،?؟])/i;
const norm = (s) => String(s || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function commentsFromPostHtml(html) {
  const out = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return;
    if (o.__typename === 'Comment' && o.body && o.depth === 0) return void out.push({ date: new Date(o.created_time * 1000).toISOString(), author: o.author?.name, text: o.body.text,
      replyCount: o.feedback?.replies_fields?.total_count ?? null, repliesShown: (o.feedback?.replies_connection?.edges || []).map((e) => ({ authorId: e.node?.author?.id, author: e.node?.author?.name })) });
    for (const v of Object.values(o)) walk(v); };
  for (const [, json] of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) if (json.includes('"__typename":"Comment"')) try { walk(JSON.parse(json)); } catch {}
  return out;
}
export async function facebookReplies(browser, pageUrl, { maxPosts = 5, delayMs = 3000 } = {}) {
  const { ctx, page } = await newPage(browser, { locale: 'en-US', viewport: { width: 1366, height: 1400 } }); // tall: scrolling opens a sign-up dialog
  await page.goto(`https://www.facebook.com/plugins/page.php?${new URLSearchParams({ href: pageUrl, tabs: 'timeline', width: '500', height: '3000' })}`, { waitUntil: 'domcontentloaded' });
  await pause(5000);
  const pageName = await page.locator('a._1drp').first().getAttribute('title');
  const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('abbr[data-utime]')].map((a) => a.closest('a')?.href).filter(Boolean))]);
  const handle = new URL(pageUrl).pathname.split('/').filter(Boolean)[0];
  const posts = [];
  for (const link of links.slice(0, maxPosts)) {
    await pause(delayMs);
    const url = link.replace(/\?ref=embed_page$/, '').replace(/^https:\/\/www\.facebook\.com\/reel\/(\d+)\/?$/, `https://www.facebook.com/${handle}/videos/$1/`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pause(5000);
    const rows = commentsFromPostHtml(await page.content()).filter((c) => norm(c.author) !== norm(pageName)).map((c) => ({ ...c, question: QUESTION.test(c.text),
      status: c.repliesShown.some((r) => norm(r.author) === norm(pageName)) ? 'answered_by_page' : c.replyCount === 0 ? 'no_reply' : 'replies_by_others_or_hidden' }));
    posts.push({ url, commentsVisible: rows.length, answeredByPage: rows.filter((r) => r.status === 'answered_by_page').length, noReply: rows.filter((r) => r.status === 'no_reply').length, rows });
  }
  await ctx.close();
  return { pageName, posts };
}
```

Instagram comment reader (trimmed from `ig-comments2.mjs`): the same JSON walk with `__typename === 'XIGComment'` → `{ text, date: created_at, user: user.username, replies: child_comment_count }`. Before the screenshot, close the "Never miss a post" dialog: `[role="dialog"] svg[aria-label="Close"]`. That is a sign-up prompt, not a login.

**Suggested labels:**
- `facebook_comment_replies`: "Facebook: visible comments on the last 5 posts answered by the page"
- `youtube_comment_replies`
- `instagram_customer_questions`: text evidence only
- `manual_unanswered_comments` stays optional for Instagram/TikTok.

---

## 6. Extra: Google Ads Transparency Center

- `https://adstransparency.google.com/?region=SA&domain=<domain>&hl=en`, and `&preset-date=Last+30+days`, `&format=TEXT|IMAGE|VIDEO`.
- No login, no robots.txt (404). Regions tested: SA, EG.
- The page itself calls `anji/_/rpc/SearchService/SearchCreatives`. Its JSON has:
  - `"4"` / `"5"`: count bucket bounds
  - `"1"[]`: creatives, with `"1"` advertiser id (AR…), `"2"` creative id, `"12"` advertiser name, `"6"` / `"7"` first/last shown (unix s)
- The **visible "~N ads" text** is the reliable count. After a filtered navigation, the first RPC answer still carried the unfiltered bucket.

| Domain | Region | Any time | Last 30 days | Formats (30 d) | Advertisers (first batch) |
|---|---|---|---|---|---|
| almarai.com | SA | ~600 | ~500 | TEXT ~400, IMAGE 0, VIDEO 6 | ALMARAI COMPANY (Verified), last shown 2026-09-15 |
| jarir.com | SA | ~20K | ~2K | TEXT ~400, IMAGE ~500, VIDEO ~300 (~700 in an earlier run) | Jarir Bookstore (Verified), last shown 2026-09-15 |
| technopanel.com.sa | SA | 0 ("No ads found") | 0 | — | — |
| al-marketer.com | SA | 0 | 0 | — | — |
| zoobaeats.com | EG | 0 | 0 | — | — |

- A domain search covers "multiple advertiser accounts with ads pointing to this domain", so list the advertiser names (resellers can appear). Counts are Google's rounded buckets.
- **Timing:** 3–7 s per view; 11–27 s with the 30-day and format views.

```js
async function one(page, url) { // trimmed from google-ads.mjs
  let body = null;
  const onResp = async (r) => { if (/SearchService\/SearchCreatives/.test(r.url()) && !body) body = await r.text().catch(() => null); };
  page.on('response', onResp);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => /~?[\d,.]+[KM]?\+? ads?\b|No ads found/i.test(document.body?.innerText || ''), null, { timeout: 25000 }).catch(() => {});
  await pause(1500);
  page.off('response', onResp);
  const text = await page.evaluate(() => document.body.innerText);
  const j = body ? JSON.parse(body) : null;
  const advertisers = [...new Map((j?.['1'] || []).map((c) => [c['1'], { id: c['1'], name: c['12'] }])).values()];
  return { shown: (text.match(/(~?[\d,.]+[KM]?\+?) ads?\b/i) || [])[1] || (/No ads found/i.test(text) ? '0' : null), advertisers,
    lastShown: (j?.['1'] || []).map((c) => new Date(Number(c['7']?.['1']) * 1000).toISOString().slice(0, 10)).sort().at(-1) || null, text };
}
```

## 7. Extra: LinkedIn Ad Library, TikTok, Snapchat
- **LinkedIn Ad Library** (plain HTTP, no browser): `https://www.linkedin.com/ad-library/search?accountOwner=Jarir%20Bookstore&countries=SA&dateOption=last-30-days` → "2 ads match your search criteria", links `/ad-library/detail/1485290693`. The detail page has `Advertiser <a href="https://www.linkedin.com/company/91639…">` and "Paid for by JARIR MARKETING COMPANY". Matching the numeric company id to the client's `linkedin.com/company/<slug>` is [untested].
- **TikTok Ad Library** (`library.tiktok.com/ads`): `api/v1/support-regions` = AT, BE, BG, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU, IE, IS, IT, LI, LT, LU, LV, MT, NL, NO, PL, PT, RO, SE, SI, SK, TR. SA and EG are absent, and "Almarai" over all regions → "Total ads: 0". **Not usable.** TikTok Creative Center "Top Ads" is [untested].
- **Snap Ads Gallery** (`adsgallery.snap.com`): "Find ads delivered in European Union and other jurisdictions". The "Shown in" list is 27 EU countries + Turkey. **Not usable** (a search was not completed). The Political Ads Library is political only.

---

## 8. Timing per check (observed)

| Check | Typical | Worst seen |
|---|---|---|
| Brave brand search (1 query) | 2.2–4.3 s | 4.3 s |
| Startpage (Google results) | 4–35 s | fails after 45 s (proof-of-work) |
| Meta Ad Library (plugin + page view; + keyword context) | ~9 s; ~14 s | 15 s |
| Google Maps | 5–6 s single; 21–30 s list with 3–5 places opened | 30 s |
| Google Ads Transparency (any time + 30 days + 3 formats) | 11 s when 0 ads; ~27 s with ads | 28 s (a regex miss caused a timeout) |
| Facebook replies (3–5 posts) | 34–45 s | 45 s |
| Instagram comments (per post) | ~5 s | 5 s |
| YouTube comments via yt-dlp (per video) | 4.6 s | — |

Whole run for one brand (Brave + Startpage + Meta + Maps + GATC + 3 FB posts), one browser, measured with `run-all.mjs`: **~2.5 minutes** (Jarir 146 s, Technopanel 131 s of check time, plus 3 s pauses). About 47 s of each was Startpage failing.

## 9. Politeness and reliability policy (proposed)

1. **Sequential, one browser, fresh context per source.** Pauses:
   - 3 s between requests to the same site; 5 s between brands
   - 2.5 s between Instagram posts (as today)
   - Caps per client run: 2 search queries per engine (Latin + Arabic name), ≤5 Maps places, ≤3 Meta views, ≤5 GATC views, ≤5 Facebook posts, ≤3 Instagram posts. Competitors get the same caps.
2. **Result states:** `yes` · `no` · `value` · `not_found_in_checked` · `needs_confirmation` · `unreliable` · `blocked` · `unknown`. Code picks the state from extracted fields, never AI (rule 1). Every automated check saves the page text + a screenshot as a source, like `capturePage` does.
3. **Retry** once after 20–30 s on a timeout, an empty parse, or a partial render (the Maps hours quirk).
   - **No retry** on an explicit block: Google `/sorry/`, DuckDuckGo duck CAPTCHA / 418, Startpage "Access Temporarily Suspended", Meta "log in to continue", Instagram "require_login". Mark `blocked`, keep the screenshot, and skip that source for the rest of the run (suggested cooldown 24 h).
   - The old manual link then stays as an **optional** check (never blocking, as today).
4. **Never:** solve or click a CAPTCHA, log in, reuse the team's browser cookies, rotate IPs, or randomise fingerprints to evade detection. (The prototypes only set a normal desktop user-agent and locale.)
5. **Identity rules that prevent wrong answers:**
   - Meta by page id only.
   - Maps and GATC by the client's domain.
   - Search by domain/profile URL in the top 10.
   - A name-only match is `needs_confirmation`.
   - A Brave miss is "not in Brave's top 10", never a Google statement.
   - The relevance guard marks junk pages `unreliable`.
6. **robots.txt, for the owner's decision.** These are single, user-triggered lookups per client, not crawling. Still:
   - Google disallows `/search` and `/maps/` for generic crawlers; Bing `/search`; Brave `/search`; Startpage `/sp/`.
   - Facebook's robots.txt disallows everything to unlisted bots; LinkedIn disallows `/search*` (the ad-library path is not listed in what was checked).
   - `adstransparency.google.com` has no robots.txt.
   - Brave's terms of use (brave.com/terms-of-use, retrieved 2026-09-15) forbid "unreasonable or disproportionately large load" and bypassing "measures Brave may use to prevent or restrict access".
   - Not legal advice.
7. **Fragility:** these are undocumented page structures (Facebook JSON keys, Maps aria-labels, GATC RPC field numbers). Each parser should be a pure function with a saved-HTML fixture test (as `test/collect/social-public.test.js` does). When a parser returns nothing, the check says `unknown`, never `no`.

## 10. Files (prototypes, not project code)
`C:\Users\jerom\AppData\Local\Temp\claude\auto-checks\`:

| File | What it is |
|---|---|
| `lib.mjs` | Shared Playwright helpers |
| `google-search.mjs`, `google-search-newheadless.mjs`, `google-headed.mjs` | Google block tests |
| `search-fetch.mjs`, `search-alt.mjs`, `startpage-shared.mjs` | Alternative engines |
| `meta-ads.mjs`, `fb-pageid.mjs` | Meta Ad Library |
| `maps.mjs` | Google Maps |
| `google-ads.mjs` | Google Ads Transparency Center |
| `tiktok-lib.mjs`, `snap-gallery.mjs` | TikTok / Snap libraries |
| `ig-comments.mjs`, `ig-comments2.mjs`, `ig-one.mjs` | Instagram comments |
| `fb-unanswered.mjs` | Facebook replies |
| `run-all.mjs` | End-to-end for one brand |

Screenshots in `out\`, one per check:

| Check | Screenshot |
|---|---|
| Google blocked | `google-search-0.png`, `google-headed.png` |
| Search | `all-technopanel-brave.png`, `search-startpage.png`, `peek-ddg.png` |
| Meta | `all-jarir-meta-page.png`, `meta-zooba-keyword.png` |
| Maps | `all-technopanel-maps.png`, `maps-jarir.png` |
| GATC | `all-jarir-gatc.png` |
| Comments | `fb-comments-post.png`, `ig-comments-loggedout.png` |
| TikTok / Snap | `tiktok-ad-library.png`, `snap-ads-gallery.png` |
| LinkedIn | `linkedin-ad-library.png` |

Raw JSON: `out\meta-ads.json`, `maps.json`, `google-ads.json`, `search-alt*.json`, `fb-unanswered*.json`, `run-all-*.json`.
