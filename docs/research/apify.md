# Apify as a fallback for social captures

_Research date 2026-09-15. No account was created and no actor was run. Where a fact could be checked on a live page, it was. Anything not checked is marked **[unverified]**._

**How this was verified.** I read the live Apify pricing page and docs pages, mostly their `.md` versions. I also called the public, unauthenticated store API: `https://api.apify.com/v2/store?search=…` for users, ratings, 30-day run stats and free-tier prices. For each actor I called `https://api.apify.com/v2/acts/<owner>~<name>` and its latest build (`/v2/actor-builds/<id>`) to get the input schema, output (dataset) schema and README. The "Maintained by Apify/Community" label was read from each actor's store page. One unauthenticated `POST …/run-sync-get-dataset-items` was refused with HTTP 402. That confirms a run can't start without credentials; no run was created.

---

## 0. Recommendation (short)

- **Yes, use Apify, but only as a code-driven REST fallback.** It runs only after our free route has failed. If `APIFY_TOKEN` is missing, the account is not on the free plan, credit is low, or the run fails, we skip it silently and the row goes to the team as today. Don't use MCP in the pipeline (§6).
- **Billing safety.** On the free plan, access is *blocked* when the $5 is used up; there is no overage ([pricing FAQ](https://apify.com/pricing)). The code should still refuse to run if the account ever becomes a paying plan, because paid plans do bill overage (§2.4).
- **Typical cost:** $0.003–$0.11 per failed profile. A proposal that needs 2–4 fallbacks costs about **$0.10–$0.25**, so **$5 covers roughly 20–50 proposals a month** (§4).
- **Actors chosen:**

| Platform | Actor(s) |
|---|---|
| Instagram | `apify/instagram-profile-scraper`, plus `apify/instagram-post-scraper` when more than 12 posts are needed |
| Facebook | `apify/facebook-pages-scraper` + `apify/facebook-posts-scraper` |
| LinkedIn | `harvestapi/linkedin-company` + `harvestapi/linkedin-company-posts` (community) |
| TikTok | `clockworks/tiktok-profile-scraper` |
| X | `xquik/x-tweet-scraper` (community), or `danek/twitter-scraper` |
| YouTube | `streamers/youtube-channel-scraper` (low value: our free YouTube API route is better) |
| Snapchat | `tri_angle/snapchat-scraper` |
| Google Maps | `compass/crawler-google-places` |
| Meta Ad Library | `apify/facebook-ads-scraper` |

---

## 1. Free plan today

| Item | Value | Source |
|---|---|---|
| Monthly credit | **$5** "to spend in Apify Store or on your own Actors". Unused credit expires at the end of the cycle and does not roll over. | [apify.com/pricing](https://apify.com/pricing) |
| Card required | **No.** "No credit card is required." | [apify.com/pricing](https://apify.com/pricing) (FAQ "Can I try Apify for free?") |
| Credit runs out | **Hard stop:** "If you're on the free plan, your access to Apify's services will be blocked until the beginning of the next monthly cycle." Also: "If you're a paying user, you can continue using the platform and will be charged for overage … If you're on the free plan, you'll be blocked until the next billing cycle." | [apify.com/pricing](https://apify.com/pricing) FAQ |
| Billing docs | "If your usage exceeds the specified limits, Apify platform services will be suspended to prevent incurring charges beyond your subscription plan." | [docs.apify.com/account/billing](https://docs.apify.com/account/billing.md) |
| Compute price | $0.2 per CU (1 GB RAM × 1 hour) | [apify.com/pricing](https://apify.com/pricing) |
| Store discount | None on Free, so the **FREE price tier** applies (the highest tier) | [apify.com/pricing](https://apify.com/pricing) |
| Max run memory / combined memory | 16,384 MB / 16,384 MB | [docs.apify.com/account/limits](https://docs.apify.com/account/limits.md), pricing table "Actor RAM 16 GB" |
| Concurrent runs | **Conflicting:** the pricing table says **5**; the limits doc says **25**. We run one at a time, so it doesn't matter. | [pricing](https://apify.com/pricing), [limits](https://docs.apify.com/account/limits.md) |
| Data retention | "Free plan: Your 10 most recent runs are retained for 4 months." Unnamed storages beyond those are deleted when the retention period expires. The exact free-plan `dataRetentionDays` isn't on the page **[unverified]**; the API returns it (§2.3). We copy results locally right away, so this doesn't matter. | [docs.apify.com/storage](https://docs.apify.com/storage.md) |
| Proxy | "The free plan includes Apify Proxy, which is limited to use within the platform" | [pricing FAQ](https://apify.com/pricing) |
| Rental actors | Not usable after trial on Free ("you are not charged but cannot use the Actor"). Rentals retire on **1 Oct 2026**. None of the chosen actors is a rental. | [docs: Actors in Store](https://docs.apify.com/platform/actors/running/actors-in-store) |
| Multiple accounts | Prohibited (Terms 4.3), so we can't open a second free account for more credit | [General Terms](https://docs.apify.com/legal/general-terms-and-conditions.md) |

**Is overage billing impossible?** On the free plan, per Apify's published pricing FAQ and billing docs, yes: usage over $5 is *blocked*, not billed, and no card is on file. It becomes possible only if someone upgrades the account or adds a paid plan. Overage applies to paying users ([Terms 7.5](https://docs.apify.com/legal/general-terms-and-conditions.md)). The guard in §7 therefore refuses to run when `GET /v2/users/me` says `isPaying !== false`.

---

## 2. Calling actors from plain Node (no MCP, no SDK)

### 2.1 Endpoints

| Purpose | Request | Source |
|---|---|---|
| Run and wait (sync) | `POST https://api.apify.com/v2/actors/<owner>~<name>/run-sync-get-dataset-items?…` The JSON body is the actor input. "If the Actor run exceeds 300 seconds, the HTTP response will return the 408 status code." The doc also warns that a broken connection gives "no information about the run". | [API: run sync get dataset items](https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post) |
| Run (async) | `POST https://api.apify.com/v2/actors/<id>/runs?waitForFinish=60&…`. `waitForFinish`: "By default it is 0, the maximum value is 60." | [API: Run Actor](https://docs.apify.com/api/v2/actors-runs-post.md) |
| Poll a run | `GET https://api.apify.com/v2/actor-runs/<runId>?waitForFinish=60` (same 60 s max) | [API: Get run](https://docs.apify.com/api/v2/actor-run-get.md), [actors-run-get](https://docs.apify.com/api/v2/actors-run-get.md) |
| Abort | `POST https://api.apify.com/v2/actors/<id>/runs/<runId>/abort` | [API: Abort run](https://docs.apify.com/api/v2/actors-run-abort-post.md) |
| Results | `GET https://api.apify.com/v2/datasets/<defaultDatasetId>/items?clean=1&format=json` | [API: dataset items](https://docs.apify.com/api/v2/dataset-items-get.md) |
| Actor details + live price (public, no token) | `GET https://api.apify.com/v2/acts/<owner>~<name>`. Fields: `pricingInfos[-1]`, `minimalMaxTotalChargeUsd`, `defaultRunOptions`. Checked 200 without a token; `/v2/actors/<id>` also answered 200. | observed 2026-09-15 |

- **Token.** "Add the token to your request's `Authorization` header as `Bearer <token>` … (Recommended)." `?token=` also works but ends up in logs ([API intro](https://docs.apify.com/api/v2.md)).
- **Rate limits.** 60 requests/s per resource by default, 400/s for run endpoints, and 250,000/min globally ([API intro](https://docs.apify.com/api/v2.md)). These are irrelevant at our volume.
- **Errors.**
  - `402` "the user has exceeded their usage limit, does not have enough credits…"
  - `408` timeout
  - `429` rate limit
  - error types include `not-enough-usage-to-run-paid-actor`, `apify-plan-required-to-use-paid-actor` and `actor-memory-limit-exceeded`

  Source: [sync endpoint doc](https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post). Treat every one of these as "skip Apify".
- **Cost of a finished run.** The run object has `usageTotalUsd`: "Total cost in USD for this run. Represents what you actually pay." It also has `chargedEventCounts` ([API: Run Actor](https://docs.apify.com/api/v2/actors-runs-post.md)). The sync items endpoint documents no run id or cost headers, so **use the async 3-call pattern** (start → poll → items). That way we can record the real cost and abort on our own deadline.

### 2.2 Spending caps per run

| Query parameter | Behaviour | Source |
|---|---|---|
| `maxTotalChargeUsd` | "Specifies the maximum total cost of the run. Use it to cap the total amount charged for all pricing models." At the limit the platform stops charging and pushing data, then "aborts the run automatically". "You are never charged for produced events over the defined limit." **The cap is per run, not per user.** | [Run Actor](https://docs.apify.com/api/v2/actors-runs-post.md), [PPE docs](https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event.md), [Actors in Store](https://docs.apify.com/platform/actors/running/actors-in-store) |
| `minimalMaxTotalChargeUsd` (actor property) | The developer sets a minimum for the user's cap. Example: `clockworks/tiktok-scraper` = **$0.50**, which is why we use `clockworks/tiktok-profile-scraper` (none set). What the API does if our cap is below this minimum is **[unverified]**, so code should skip such actors. | [PPE docs](https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event.md), store API |
| `maxItems` | "Only works for pay-per-result Actors." Every actor chosen here is **pay-per-event**, so use the actor's own input limit (`resultsLimit`, `maxPosts`, …) plus `maxTotalChargeUsd`. | [sync endpoint doc](https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post) |
| `timeout` (s) | Run timeout; overrides the actor default. Always set it below our HTTP deadline so an abandoned run stops by itself. | same |
| `memory` (MB) | Power of 2, minimum 128. For PPE actors that include platform usage it doesn't change the price, except the synthetic `apify-actor-start` event, which is charged "once for each extra GB" above 1 GB. | [PPE docs](https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event.md) |
| `restartOnError=false` | Stops a failed run from restarting. `apify/facebook-pages-scraper` defaults to `restartOnError: true`. | actor `defaultRunOptions` (store API) |

**Who pays platform usage.** "Most pay-per-event Actors include platform usage in the event price." Some pass it on; the actor JSON shows this as `isPPEPlatformUsagePaidByUser: true` ([Actors in Store](https://docs.apify.com/platform/actors/running/actors-in-store)). Of the chosen actors, only `xquik/x-tweet-scraper` does this ("Apify bills platform usage separately", its README).

### 2.3 Reading remaining credit

- `GET https://api.apify.com/v2/users/me/limits` returns `monthlyUsageCycle.{startAt,endAt}`, `limits.maxMonthlyUsageUsd`, `limits.dataRetentionDays` and `current.monthlyUsageUsd` ([API: Get limits](https://docs.apify.com/api/v2/users-me-limits-get.md)). Remaining = `limits.maxMonthlyUsageUsd - current.monthlyUsageUsd`. That the free plan returns 5 there is **[unverified]**, so also cap at `min(5, maxMonthlyUsageUsd)`.
- `GET https://api.apify.com/v2/users/me` returns `plan.{id, monthlyUsageCreditsUsd, maxMonthlyUsageUsd}` and `isPaying` ([API: Get user](https://docs.apify.com/api/v2/users-me-get.md)). The exact `plan.id` string for Free is **[unverified]**, so guard on `isPaying === false`.
- `GET https://api.apify.com/v2/users/me/usage/monthly` gives a daily breakdown ([API](https://docs.apify.com/api/v2/users-me-usage-monthly-get.md)). It isn't needed for the guard.
- An unauthenticated call to `/users/me/limits` answers 401 (observed).

### 2.4 Pricing traps found in the actor inputs (all cost money silently)

- **`apify/instagram-post-scraper`:** `dataDetailLevel` **defaults to `detailedData`** over the API, which adds `post-details` at $0.001 per post. Always send `"basicData"` (input schema).
- **Date-filter add-ons:**
  - `apify/facebook-posts-scraper` `onlyPostsNewerThan`: +$0.002/post
  - `clockworks/tiktok-profile-scraper` `oldestPostDateUnified`: +$0.0013/result
  - `compass/crawler-google-places` filters: +$0.001/place each

  Don't send them; filter dates in our code (pricing events via store API).
- **`harvestapi/linkedin-company-posts`:** `scrapeReactions` / `scrapeComments` cost $0.002 per item; keep them off.
- **README prices are stale.** The `facebook-pages-scraper` README says "$10 per 1,000 pages", but the live FREE tier is $0.012/page. The TikTok profile README says "$5 to scrape 1,000 results", but live FREE is $0.003. **Code must read the live price** from `GET /v2/acts/<id>` before each run.
- **`apidojo/*` actors (tweet-scraper, twitter-user-scraper, twitter-profile-scraper, twitter-scraper-lite, tiktok-profile-scraper) are unusable on Free.** "Users on the Free Plan can use the actor only in Demo Mode … up to 5 times per month … capped at a maximum of 10 items" (their READMEs, e.g. [apify.com/apidojo/tweet-scraper](https://apify.com/apidojo/tweet-scraper)). `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest` says "free users are restricted in the number of tweets" ([store page](https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest)).

---

## 3. Actors per platform (no cookies or login from us)

**About the figures.**
- **Store figures** (fetched 2026-09-15 from `api.apify.com/v2/store`) are total users, rating (review count), and the 30-day success share across *all* users' runs.
- **Prices** are the **FREE tier** from the live store API (`pricingInfos[-1]`). Pricing pages show "from $X", which is the cheapest paid tier.
- **"Apify"** means the store page shows *Maintained by Apify*. That covers the `apify`, `clockworks`, `streamers`, `tri_angle` and `compass` accounts.

### 3.1 Instagram (profile + recent posts)

| | `apify/instagram-profile-scraper` (1st choice) | `apify/instagram-post-scraper` (only if >12 posts needed) |
|---|---|---|
| Maintained | Apify | Apify |
| Users / rating / 30-day OK | 217,809 / 4.75 (174) / 99.8% of 8.84M | 127,911 / 4.29 (139) / 99.9% of 6.84M |
| Price (FREE) | `profile` $0.0026; min cap $0.0026 | `post` $0.0017 (+ `post-details` $0.001 unless `basicData`); min cap $0.005 |
| Input | `{ "usernames": ["<handle>"] }` (don't send `includeAboutSection`, +$0.007) | `{ "username": ["<handle or URL>"], "resultsLimit": 20, "dataDetailLevel": "basicData", "skipPinnedPosts": true }` |
| Output | `followersCount`, `postsCount`, `fullName`, `businessCategoryName`, `latestPosts[]` ("the latest 12 posts") with `timestamp`, `likesCount`, `commentsCount`, `videoViewCount`, `type`, `url` | per post: `timestamp`, `likesCount`, `commentsCount`, `videoViewCount`, `videoPlayCount`, `reshareCount`, `sharesCount`, `type`, `url`, `isPinned` |
| Cost for profile + posts | **$0.0026** (12 posts) | +20 × $0.0017 = **$0.034**, so **$0.037** with the profile |

Sources: [apify.com/apify/instagram-profile-scraper](https://apify.com/apify/instagram-profile-scraper), [apify.com/apify/instagram-post-scraper](https://apify.com/apify/instagram-post-scraper), plus both actors' dataset schemas. Instagram hides likes on some posts; how the actor reports that (null, 0 or −1) is **[unverified]**. Map negative numbers to `null`.

### 3.2 Facebook (page + recent posts)

| | `apify/facebook-pages-scraper` | `apify/facebook-posts-scraper` |
|---|---|---|
| Maintained | Apify | Apify |
| Users / rating / 30-day OK | 61,261 / 4.64 (54) / 99.9% of 2.37M | 109,370 / 4.64 (233) / 99.8% of 4.90M |
| Price (FREE) | $0.012 per page | `actor-start` $0.001 + `post` $0.005; min cap $0.0062 |
| Input | `{ "startUrls": [{ "url": "<page URL>" }] }` + `restartOnError=false` | `{ "startUrls": [{ "url": "<page URL>" }], "resultsLimit": 10 }` |
| Output | `followers`, `likes`, `title`, `categories`, `rating`, `ad_status` (e.g. "This Page is not currently running ads.") | `time` (ISO), `likes`, `comments`, `shares`, `viewsCount`, `isVideo`, `url`, `postId`, `text`, reaction breakdown |
| Cost | **$0.012** | 10 posts **$0.051**; 20 posts **$0.101** |

Page + 20 posts is **$0.113**, the most expensive fallback; page + 10 posts is $0.063. Our free Page Plugin route already gets 5 posts, so 10 is a sensible fallback limit. Sources: [apify.com/apify/facebook-pages-scraper](https://apify.com/apify/facebook-pages-scraper), [apify.com/apify/facebook-posts-scraper](https://apify.com/apify/facebook-posts-scraper).

### 3.3 LinkedIn company page + recent posts (no Apify-maintained actor exists)

Searching the store for `username=apify|compass|clockworks|streamers|tri_angle` + "linkedin" returned no LinkedIn scraper.

| | `harvestapi/linkedin-company` | `harvestapi/linkedin-company-posts` |
|---|---|---|
| Maintained | Community (HarvestAPI) | Community (HarvestAPI) |
| Users / rating / 30-day OK | 21,144 / 4.48 (35) / 100.0% of 1.59M | 11,384 / 4.97 (21) / 100.0% of 757,663 |
| Price (FREE) | `apify-actor-start` $0.00005 + company $0.004 | start $0.00005 + `post` $0.002; `no-result` $0.001 |
| Input | `{ "companies": ["https://www.linkedin.com/company/<slug>"] }` | `{ "targetUrls": ["https://www.linkedin.com/company/<slug>"], "maxPosts": 20 }` (keep `scrapeReactions` / `scrapeComments` false) |
| Output | `followerCount`, `employeeCount`, `name`, `website` | `postedAt.date` (ISO), `engagement.likes`, `engagement.comments`, `engagement.shares`, `content`, `linkedinUrl` |
| Cost | **$0.004** | **$0.040**, so **$0.044** total |

Both READMEs say "No cookies or account required." Sources: [apify.com/harvestapi/linkedin-company](https://apify.com/harvestapi/linkedin-company), [apify.com/harvestapi/linkedin-company-posts](https://apify.com/harvestapi/linkedin-company-posts). The posts actor has no published dataset schema, so the field names come from its README example.

### 3.4 TikTok (profile + recent videos)

| | `clockworks/tiktok-profile-scraper` (choice) |
|---|---|
| Maintained | Apify |
| Users / rating / 30-day OK | 40,913 / 4.71 (72) / 99.5% of 2.93M |
| Price (FREE) | `result` $0.003 per video; no minimum cap |
| Input | `{ "profiles": ["<handle>"], "resultsPerPage": 20, "profileSorting": "latest" }` (no date or popularity filters, no downloads) |
| Output | per video: `createTimeISO`, `diggCount` (likes), `commentCount`, `shareCount`, `playCount`, `collectCount`, `repostCount`, `isPinned`, `webVideoUrl`, `text`. Profile inside every item: `authorMeta.fans` (followers), `authorMeta.video`, `authorMeta.heart`. Errors come back as items like `{ "errorCode": "PROFILE_PRIVATE" }`. |
| Cost | **$0.060** for 20 videos |

- **Avoid `clockworks/tiktok-scraper`.** It is the same data at $0.0037/result, and its `minimalMaxTotalChargeUsd` is **$0.50**.
- **`apidojo/tiktok-profile-scraper` ($0.0003) is demo-only on Free.**

Source: [apify.com/clockworks/tiktok-profile-scraper](https://apify.com/clockworks/tiktok-profile-scraper).

### 3.5 X (profile + recent posts) (no Apify-maintained actor; weakest area)

| | `xquik/x-tweet-scraper` | `danek/twitter-scraper` |
|---|---|---|
| Maintained | Community (Xquik, "independent third-party service") | Community |
| Users / rating / 30-day OK | 3,921 / 4.55 (14) / 99.8% of 1.06M; created 2026-03-28 | 7,869 / 4.43 (20) / 100.0% of 11.9M |
| Price (FREE) | $0.00015 per tweet, **plus platform usage billed separately** (256 MB default) | $0.0003 per result; "Free users are limited to 20 results per run." |
| Input | `{ "mode": "profileTweets", "twitterHandles": ["<handle>"], "maxItems": 20 }` | `{ "username": "<handle>", "max_posts": 20 }` |
| Output | `createdAt`, `likeCount`, `replyCount`, `retweetCount`, `quoteCount`, `viewCount`, `url`, `authorFollowers`, `authorStatusesCount` (published dataset schema) | **[unverified]**: no schema or example is published; check on the first test run |
| Cost | ≈ **$0.003** + compute. My estimate is under $0.001 for a 1-minute run at 256 MB (0.0042 CU × $0.2) **[unverified]**. | **$0.006** |

Our free FxEmbed route is good. Treat X as the lowest-priority fallback and enable it only after a test run. Sources: [apify.com/xquik/x-tweet-scraper](https://apify.com/xquik/x-tweet-scraper), [apify.com/danek/twitter-scraper](https://apify.com/danek/twitter-scraper).

### 3.6 YouTube (channel + recent videos): low value

| | `streamers/youtube-channel-scraper` | `streamers/youtube-scraper` |
|---|---|---|
| Maintained | Apify | Apify |
| Users / rating / 30-day OK | 21,891 / 4.63 (40) / 99.6% | 122,041 / 4.80 (195) / 99.3% |
| Price (FREE) | $0.0013 per video | $0.004 per video |
| Input | `{ "startUrls": [{ "url": "https://www.youtube.com/@<handle>" }], "maxResults": 20 }` | `{ "startUrls": [{ "url": "…/@<handle>" }], "maxResults": 20 }` |
| Output | `numberOfSubscribers`, `channelTotalVideos`, `viewCount`, `date`, `title`, `url`. No likes or comments fields. The README example shows a relative date ("6 days ago"). | the schema also has `likes`, `commentsCount` and ISO `date`, but channel-listing examples show relative dates; whether channel runs give exact dates and likes is **[unverified]** |
| Cost | **$0.026** | **$0.080** |

Our existing route (free YouTube Data API key, else yt-dlp) gives exact dates, likes and comments. Recommendation: **don't wire YouTube to Apify.** Sources: [apify.com/streamers/youtube-channel-scraper](https://apify.com/streamers/youtube-channel-scraper), [apify.com/streamers/youtube-scraper](https://apify.com/streamers/youtube-scraper).

### 3.7 Snapchat public profile (currently manual in our system)

| | `tri_angle/snapchat-scraper` |
|---|---|
| Maintained | Apify |
| Users / rating / 30-day OK | 1,881 / 5.00 (5) / 99.9% of 18,818; last modified 2026-03-26 |
| Price (FREE) | `start` $0.001 + `profile` $0.002 |
| Input | `{ "profilesInput": ["https://www.snapchat.com/add/<handle>"] }` |
| Output | `subscribers`, `category`, `profileDescription`, `stories[].snaps[].timestamp`, `spotlights[].views`, `spotlights[].snaps[].timestamp`. No likes, comments or shares. |
| Cost | **$0.003** |

Source: [apify.com/tri_angle/snapchat-scraper](https://apify.com/tri_angle/snapchat-scraper). Our own research notes that Snapchat hides follower counts under 5K ([research-social.md](../research-social.md) §2), so expect `subscribers` to be missing sometimes.

### 3.8 Google Maps business listing (new data, not a fallback)

| | `compass/crawler-google-places` |
|---|---|
| Maintained | Apify |
| Users / rating / 30-day OK | 604,358 / 4.70 (1,817) / 95.9% of 3.85M |
| Price (FREE) | `place-scraped` $0.004; `apify-actor-start` $0.00005 per GB (4 GB default, so $0.0002) |
| Input | `{ "startUrls": [{ "url": "<Google Maps place URL>" }] }` or `{ "searchStringsArray": ["<brand>"], "locationQuery": "<city, country>", "maxCrawledPlacesPerSearch": 1 }`. No filters, reviews or images. |
| Output | `title`, `totalScore` (rating), `reviewsCount`, `categoryName`, `categories`, `placeId`, `url`, `website`, `permanentlyClosed` |
| Cost | **≈ $0.004** |

`compass/google-maps-extractor` is also Apify-maintained but costs more ($0.005/place). Source: [apify.com/compass/crawler-google-places](https://apify.com/compass/crawler-google-places).

### 3.9 Meta Ad Library (active ads for a brand)

| | `apify/facebook-ads-scraper` (choice) | `igolaizola/facebook-ad-library-scraper` (cheaper, community) |
|---|---|---|
| Maintained | Apify | Community |
| Users / rating / 30-day OK | 36,307 / 4.19 (57) / 99.6% of 905,867 | 2,889 / 4.98 (10) / 99.4% of 99,802 |
| Price (FREE) | $0.0058 per ad (or per page total with `onlyTotal`) | start $0.0075 + $0.00075 per ad |
| Input | `{ "startUrls": [{ "url": "<FB page URL or Ad Library URL>" }], "onlyTotal": true }` or `{ …, "resultsLimit": 10, "activeStatus": "active" }` | `{ "pageId": "<page id>", "activeStatus": "active", "maxItems": 10 }` |
| Output | `totalCount`, `isActive`, `startDateFormatted`, `endDateFormatted`, `publisherPlatform`, `snapshot.body`, `snapshot.title`, `pageName` | **[unverified]**: no schema published |
| Cost | total only **$0.006**; 10 ads **$0.058** | 10 ads **$0.015** |

Sources: [apify.com/apify/facebook-ads-scraper](https://apify.com/apify/facebook-ads-scraper), [apify.com/igolaizola/facebook-ad-library-scraper](https://apify.com/igolaizola/facebook-ad-library-scraper). Our own notes say Meta's Ad Library **API** doesn't cover commercial ads in Egypt or KSA while the website does ([research-social.md](../research-social.md) §1.4). This actor reads the website route; that it covers those countries is **[unverified]**. `facebook-pages-scraper` also returns `ad_status` for free with the page (§3.2).

---

## 4. Cost per proposal and proposals per month

These are FREE-tier prices, used only after a free route has failed.

| Fallback | Est. cost |
|---|---|
| Instagram profile (followers + 12 posts) | $0.003 |
| Instagram profile + 20 posts | $0.037 |
| Facebook page + 10 posts / + 20 posts | $0.063 / $0.113 |
| LinkedIn company + 20 posts | $0.044 |
| TikTok 20 videos | $0.060 |
| X 20 posts | $0.003–0.006 |
| Snapchat | $0.003 |
| Google Maps listing | $0.004 |
| Ad Library total / 10 ads | $0.006 / $0.058 |

| Scenario (failed profiles in one proposal) | Cost | Proposals per $5 |
|---|---|---|
| Light: IG (12 posts) + X + LinkedIn | ≈ $0.05 | ≈ 100 |
| Typical, 3 failures: IG (20) + FB (10) + TikTok | ≈ $0.16 | ≈ 31 |
| Heavy, 4 failures: FB (20) + TikTok + LinkedIn + IG (20) | ≈ $0.25 | ≈ 20 |
| Typical + Maps listing + Ad Library total | +$0.01 | −2 |

**Planning figure: about $0.10–$0.25 per proposal, so 20–50 proposals a month on $5.** A proposal usually covers the client plus competitors, so the real count depends on how often the free routes fail.

---

## 5. Terms and risk notes

- **Account and legal.** Apify's terms require you to "process only the Customer Data that you are authorized to access and that is in compliance with all applicable laws" ([Terms 6.2](https://docs.apify.com/legal/general-terms-and-conditions.md)). They forbid multiple personal accounts ([4.3](https://docs.apify.com/legal/general-terms-and-conditions.md)). They let Apify block users for activities that "contravene applicable laws … or the rights of any third party" ([Acceptable Use Policy 3.1](https://docs.apify.com/legal/acceptable-use-policy.md)).
- **Actors carry no warranty.** "All Actors are provided 'AS IS' … Your use of any Actor is at your sole risk", and you indemnify Apify for claims "arising out of your use of any Actor" ([Actor Terms 5.1, 7.1](https://docs.apify.com/legal/actor-terms-and-conditions.md)).
- **Community actors are the least durable.** Xquik is an "independent third-party service", and apidojo already restricts free users. Every chosen actor runs with `LIMITED_PERMISSIONS`, so it can reach only its own storage (store API `actorPermissionLevel`; [Actor Terms 4.4](https://docs.apify.com/legal/actor-terms-and-conditions.md)).
- **Data is processed on Apify's servers.** Named storages aside, only the 10 most recent runs are kept for 4 months on Free ([docs.apify.com/storage](https://docs.apify.com/storage.md)).
- **Platform terms still apply.** This does not change our own position in [research-social.md](../research-social.md) §0 on logged-out collection. It is not legal advice.

---

## 6. MCP vs REST

The Apify MCP server exists as hosted `https://mcp.apify.com` (OAuth or `Authorization: Bearer <APIFY_TOKEN>`) or local `npx @apify/actors-mcp-server`. Its tools include `search-actors`, `fetch-actor-details`, `call-actor` and `get-actor-output`, and telemetry is **on by default** ([docs.apify.com/integrations/mcp](https://docs.apify.com/integrations/mcp.md)). Its docs list no per-run cost cap, memory or timeout options for `call-actor` (not found on that page).

**For us, MCP adds nothing and breaks a rule.**
- Capturing is done by code. Our AI steps run with `--strict-mcp-config` and never capture.
- Giving the model `call-actor` would let the AI pick actors, inputs and spend. That contradicts constitutional rule 1 (code decides) and makes the budget guard impossible to enforce deterministically.
- REST is plain `fetch` with zero dependencies, supports `maxTotalChargeUsd` / `timeout` / abort, and returns `usageTotalUsd`.

**Recommendation: REST only.** MCP is at most an optional tool for a human browsing the store in an interactive session, never in the pipeline.

---

## 7. Integration sketch

**Where it plugs in.** `pipeline/social.js › captureTasks` catches a failed collector and saves `status: 'failed'`. The fallback goes in that `catch`: try `apifyFallback(t.platform, t.url, { p, env, log })`. If it returns a capture, save it with `method: 'fallback: Apify <actor>'`. If it returns `null`, save the failure as today, with the skip reason added to `error`. Snapchat (no collector today), Maps and Ad Library would be new tasks that call the same function directly.

**Environment** (`.env.local`, never logged):
- `APIFY_TOKEN` (required to enable)
- `ALM_APIFY=0` (kill switch)
- `ALM_APIFY_MAX_RUN_USD` (default `0.12`)
- `ALM_APIFY_MAX_PROPOSAL_USD` (default `0.30`)
- `ALM_APIFY_RESERVE_USD` (default `0.50`; stop before the month's credit is nearly gone)

```js
// collect/social/apify.js — FALLBACK ONLY. Code picks the actor and input; nothing here is decided by AI.
// Returns a normalized capture or null (never throws, never blocks the pipeline).
const API = 'https://api.apify.com/v2';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const handle = (url) => new URL(url).pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '') || '';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

// Deterministic table: platform → one or two actor steps. `expect` = billable events per run (for the estimate).
export const APIFY_PLAN = {
  instagram: [{ actor: 'apify~instagram-profile-scraper', input: (u) => ({ usernames: [handle(u)] }), expect: { profile: 1 } }],
  facebook: [
    { actor: 'apify~facebook-pages-scraper', input: (u) => ({ startUrls: [{ url: u }] }), expect: { 'apify-default-dataset-item': 1 } },
    { actor: 'apify~facebook-posts-scraper', input: (u, n) => ({ startUrls: [{ url: u }], resultsLimit: n }), expect: (n) => ({ 'actor-start': 1, post: n }) },
  ],
  linkedin: [
    { actor: 'harvestapi~linkedin-company', input: (u) => ({ companies: [u] }), expect: { 'apify-actor-start': 1, 'apify-default-dataset-item': 1 } },
    { actor: 'harvestapi~linkedin-company-posts', input: (u, n) => ({ targetUrls: [u], maxPosts: n }), expect: (n) => ({ 'apify-actor-start': 1, post: n }) },
  ],
  tiktok: [{ actor: 'clockworks~tiktok-profile-scraper', input: (u, n) => ({ profiles: [handle(u)], resultsPerPage: n, profileSorting: 'latest' }), expect: (n) => ({ result: n }) }],
  x: [{ actor: 'xquik~x-tweet-scraper', input: (u, n) => ({ mode: 'profileTweets', twitterHandles: [handle(u)], maxItems: n }), expect: (n) => ({ 'apify-default-dataset-item': n }), platformUsageExtraUsd: 0.005 }],
  snapchat: [{ actor: 'tri_angle~snapchat-scraper', input: (u) => ({ profilesInput: [u] }), expect: { start: 1, profile: 1 } }],
};

async function api(path, token, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(75_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Apify ${res.status}: ${json?.error?.type || 'error'}`); // 401/402/403/404/408/429 → skip
  return json;
}

// Budget guard: every check is a hard "skip", never a wait or a retry.
export async function apifyBudget({ token, steps, limit, maxUsd, reserveUsd, proposalSpentUsd, proposalCapUsd }) {
  const me = (await api('/users/me', token)).data;
  if (me.isPaying !== false) return { skip: 'Apify account is on a paid plan (overage possible) — refusing' };
  const lim = (await api('/users/me/limits', token)).data;
  const remaining = Math.min(5, lim.limits.maxMonthlyUsageUsd) - lim.current.monthlyUsageUsd;
  let estimate = 0;
  for (const s of steps) {
    const pricing = (await api(`/acts/${s.actor}`)).data.pricingInfos?.at(-1) || {}; // public, live price
    if (pricing.pricingModel !== 'PAY_PER_EVENT') return { skip: `${s.actor}: unexpected pricing model` };
    if ((pricing.minimalMaxTotalChargeUsd ?? 0) > maxUsd) return { skip: `${s.actor}: minimum charge above cap` };
    const events = typeof s.expect === 'function' ? s.expect(limit) : s.expect;
    const price = (e) => pricing.pricingPerEvent?.actorChargeEvents?.[e]?.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd;
    s.capUsd = Object.entries(events).reduce((sum, [e, n]) => sum + (price(e) ?? Infinity) * n, 0) + (s.platformUsageExtraUsd || 0);
    estimate += s.capUsd;
  }
  if (!(estimate <= maxUsd)) return { skip: `estimated $${estimate.toFixed(3)} is above the per-profile cap $${maxUsd}` };
  if (remaining < reserveUsd + estimate) return { skip: `Apify credit low ($${remaining.toFixed(2)} left this month)` };
  if (proposalSpentUsd + estimate > proposalCapUsd) return { skip: 'Apify budget for this proposal is used up' };
  return { estimate };
}

async function runActor(token, actor, input, { capUsd, deadline }) {
  const secs = Math.max(30, Math.floor((deadline - Date.now()) / 1000) - 20); // run stops itself before our deadline
  const q = new URLSearchParams({ timeout: String(secs), maxTotalChargeUsd: capUsd.toFixed(4), restartOnError: 'false', waitForFinish: '60' });
  let run = (await api(`/actors/${actor}/runs?${q}`, token, { method: 'POST', body: input })).data;
  while (!TERMINAL.has(run.status) && Date.now() < deadline) run = (await api(`/actor-runs/${run.id}?waitForFinish=60`, token)).data;
  if (!TERMINAL.has(run.status)) await api(`/actors/${actor}/runs/${run.id}/abort`, token, { method: 'POST' }).catch(() => {});
  const items = await api(`/datasets/${run.defaultDatasetId}/items?clean=1&format=json&limit=500`, token).catch(() => []);
  return { runId: run.id, status: run.status, usd: run.usageTotalUsd ?? null, items: Array.isArray(items) ? items : [] };
}

export async function apifyFallback(platform, url, { maxUsd = Number(process.env.ALM_APIFY_MAX_RUN_USD || 0.12), timeoutMs = 240_000, limit = 20, env = process.env, ledger = { spentUsd: 0 }, log = () => {} } = {}) {
  const token = env.APIFY_TOKEN;
  const steps = APIFY_PLAN[platform];
  if (!token || env.ALM_APIFY === '0' || !steps) return null;
  try {
    const plan = steps.map((s) => ({ ...s }));
    const guard = await apifyBudget({ token, steps: plan, limit, maxUsd, reserveUsd: Number(env.ALM_APIFY_RESERVE_USD || 0.5), proposalSpentUsd: ledger.spentUsd, proposalCapUsd: Number(env.ALM_APIFY_MAX_PROPOSAL_USD || 0.3) });
    if (guard.skip) return (log(`  Apify skipped: ${guard.skip}`), null);
    const deadline = Date.now() + timeoutMs;
    const results = [];
    for (const s of plan) {
      const r = await runActor(token, s.actor, s.input(url, limit), { capUsd: s.capUsd, deadline });
      ledger.spentUsd += r.usd ?? s.capUsd; // unknown cost counts as the full cap
      results.push({ actor: s.actor, ...r });
    }
    const cap = MAPPERS[platform](url, results, limit); // pure function → tested with saved fixtures
    cap.source = { kind: 'apify', runs: results.map(({ actor, runId, status, usd }) => ({ actor, runId, status, usd })) };
    // Raw items are saved next to the capture as evidence (rule 3); a mapper never invents a missing number.
    return cap.profile.followers === null && !cap.posts.length ? null : cap;
  } catch (e) {
    log(`  Apify skipped: ${String(e.message).slice(0, 120)}`);
    return null;
  }
}
```

**Mapping to our capture shape.** The shape is `{ platform, url, method, status, capturedAt, profile:{name, followers, postsTotal}, posts:[{id, url, date, type, caption, likes, comments, shares, views}], limit }`, as in `collect/social/auto.js`.

| Platform | `profile` | each post `{ date, likes, comments, shares, views }` |
|---|---|---|
| instagram | `followers ← followersCount`, `postsTotal ← postsCount`, `name ← fullName` | from `latestPosts[]`: `timestamp`, `likesCount`, `commentsCount`, `null`, `videoViewCount`; `type ← Video→video, Sidecar→carousel, else image` |
| facebook | page item: `followers ← followers`, `name ← title` | posts: `time`, `likes`, `comments`, `shares`, `viewsCount`; `type ← isVideo ? video : other` |
| linkedin | company item: `followers ← followerCount`, `name` | `postedAt.date`, `engagement.likes`, `engagement.comments`, `engagement.shares`, `null` |
| tiktok | first item `authorMeta`: `followers ← fans`, `postsTotal ← video`, `totalLikes ← heart` | `createTimeISO`, `diggCount`, `commentCount`, `shareCount`, `playCount`; drop `isPinned` if older than the window |
| x | first item: `followers ← authorFollowers`, `postsTotal ← authorStatusesCount` | `createdAt` → ISO, `likeCount`, `replyCount`, `retweetCount`, `viewCount` |
| snapchat | `followers ← subscribers` (often missing) | spotlights: `date ← snaps[0].timestamp`, `views ← views`, others `null`; stories give dates only |
| maps (new) | `{ name: title, rating: totalScore, reviewsCount, category: categoryName }`, no posts | — |
| adlibrary (new) | `{ activeAds: totalCount }`; ads `[{ start: startDateFormatted, active: isActive, platforms: publisherPlatform, text: snapshot.body }]` | — |

Tests to add, following the convention that every deterministic rule gets a test:
- Mapper fixtures, using the README examples until real runs exist
- `apifyBudget` skips on `isPaying: true`, low credit, an estimate over the cap, the proposal cap, and a high `minimalMaxTotalChargeUsd`
- An `APIFY_TOKEN`-less run returns `null` without any network call

---

## 8. Check on the first real test run (owner creates the free account and token)

1. What `GET /users/me` returns for Free: `isPaying` and `plan.id`.
2. What `limits.maxMonthlyUsageUsd` returns.
3. What happens when `maxTotalChargeUsd` is below an actor's minimum.
4. The real `usageTotalUsd` for one Instagram, TikTok and LinkedIn run versus the estimate.
5. `danek/twitter-scraper` and `igolaizola/facebook-ad-library-scraper` output fields.
6. Whether YouTube channel runs return exact dates.
7. How Instagram hidden likes are reported.
8. Whether the Ad Library actor returns ads for Egypt/KSA brands.
