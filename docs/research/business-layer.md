# Business-needs research layer: design

_Written 2026-09-15. The owner asked us to "think of adding another layer of research about business needs, as we scope not only marketing but business models or support (fully automatic if found)."_

This is a design only. No project source file was changed. The throwaway test scripts and raw captures are in `C:\Users\jerom\AppData\Local\Temp\claude\business-layer\` (Appendix A).

**Labels used in this document:**
- **Tested: works.** It was run live from this PC on 2026-09-15 and gave the stated result.
- **Tested: partial.** It worked with a caveat.
- **Tested: blocked.** It was refused or needs a human.
- **Untested.** The idea is not proven yet.
- **[unverified]** marks an outside fact without a checked source.

---

## 0. Summary

1. **Most business signals are free, need no key, and are already inside pages the website audit loads.** Salla and Zid stores publish their store settings in the page. Salla's settings include:
   - payment methods and whether loyalty is on;
   - the VAT number, commercial registration and e-authentication certificate;
   - whether the store has more than one language.

   Shopify stores publish `/meta.json` (product count, the countries they ship to, currency). Payment icons, forms, chat widgets, the WordPress plugin list and the domain's DNS records show the payment, lead-capture, CRM and email tools.
2. **Outside sources that worked with no login or key:**
   - a Google Maps place page (rating, review count, category, website, phone, branches);
   - the iTunes Search/Lookup API and Google Play app pages;
   - the Saudi Business Center e-store inquiry;
   - DNS records, the Wayback Machine, and RDAP for `.com` domains.

   LinkedIn's guest jobs endpoint works only with a `geoId`. LinkedIn's `robots.txt` disallows `/jobs-guest/`, so this design keeps it a manual link. ZATCA's VAT lookup and the Ministry of Commerce CR inquiry need a captcha, so they are manual links too.
3. **Rule 4 still holds. Business needs never become sold services.** The signals feed three places:
   - **Existing problem types** that already map to catalog items: Website Building, SEO, Community Management, Email Marketing, Marketing Automation and Loyalty Journey.
   - **Eight proposed new problem types** that also map only to existing catalog items, plus two internal-only types.
   - **"Business observations"** for the internal record: payments activation, fulfilment, compliance, hiring, apps, CRM/ERP choice and similar. These never reach the client proposal.
4. **Pipeline change:**
   - A new **code** step `business` (after `collect`).
   - A new **AI** step `business-analyst` (Sonnet, no tools, schema output with verified citations).
   - The `record` step waits for both.

   Results appear in the client record, as diagnosis evidence, in a Gate 1 "Business observations (internal)" panel, and, for high-reliability code checks only, as one extra group on the existing website-audit slide.

---

## 1. Constraints this design keeps

| Rule (CLAUDE.md) | How this layer respects it |
|---|---|
| 1. Code decides services, deliverables, timing, numbers | Business signals are **checks and cited facts**. Only an approved problem type (confirmed at Gate 1) can lead to a service, through `rules/problem-types.json`. Thresholds (e.g. "low rating") live in a rules file the owner approves. |
| 2. Nothing reaches a client without approval | Nothing new is sent. Business observations are internal-only by schema, so the writer never receives them. |
| 3. Evidence before problem; unknown stays unknown | Every signal is saved as a check (K###) or as evidence text (E###) with a URL and time. The AI cites them; code verifies. No match on Maps or the app stores means **unknown**, not "no listing". |
| 4. Catalog only | Signals with no catalog service become **business observations**, never offers. |
| 5. Zero paid software | Only public pages, documented free APIs, DNS and the Playwright browser we already have. Nothing needs a key. |

---

## 2. Live test subjects

| Role | Site | Why |
|---|---|---|
| Salla store (KSA) | https://batlaperfume.com/ (reached from https://salla.sa/batla-perfume) | Salla settings object, payments, VAT/CR, e-authentication |
| Zid store (KSA) | https://aurumcoffee.zid.store/ | Zid payment icons, loyalty endpoint, checkout-disabled banner, e-authentication |
| B2B manufacturer (KSA) | https://technopanel.com.sa/ (existing test client) | Quote/lead path, catalogue PDF, WordPress plugins, DNS email tools, Maps |
| Shopify fashion store (EG) | https://hayaafashioneg.com/ (existing test client) | `/meta.json`, payment icons (COD, valU, Sympl, Fawry), returns page, Maps branches |
| App-first D2C grocery (EG) | https://www.breadfast.com/ | App store links, iTunes/Play ratings, careers page |
| Endpoint checks only | Almarai (LinkedIn jobs, DNS), Namshi (app store search) | Large companies known to have jobs and apps, used to prove that an endpoint returns data |

---

## 3. Signal inventory

**Reliability:**
- **H** = read from a platform's own settings, an official API, or an exact match.
- **M** = a pattern in page HTML or text that can miss or misfire.
- **L** = weak proxy.

"Free" means no login, no key and no payment.

### 3.1 Business model and how customers buy

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S01 | Store platform | Existing `rules/tech-fingerprints.json`, plus a Salla page marker (`"twilight::init"` settings object) and a Zid marker (`zid.store`, `raqeeb.zid.sa` analytics) | H | yes | **Tested: works.** Salla, Zid, Shopify and WordPress were identified on the 4 sites. Breadfast shows `woocommerce` in HTML, but its Store API route is off (see S13). |
| S02 | Online checkout exists | Platform detected **and** an add-to-cart control (`add-to-cart`, «أضف إلى السلة», `salla-add-product-button`) **or** a JSON-LD `Offer` with `priceCurrency` | H with platform, M without | yes | **Tested: works** on Salla, Zid and Shopify. Two false positives were found and fixed: the generic words "checkout" and "cart" matched a WordPress theme's `cart-header-element` CSS on Technopanel. Checkout needs a platform or JSON-LD Offer, not a bare word. |
| S03 | Checkout switched off | Zid shows a visible banner «عملية الشراء معطلة في الوقت الحالي» (check the element is visible, not just present in HTML) | H | yes | **Tested: works.** It was visible on aurumcoffee.zid.store. Salla and Shopify equivalents are untested. |
| S04 | Prices visible vs "request a quote" | JSON-LD `Offer.price`, `og:price:amount`/`product:price:amount`, a currency pattern (ر.س, SAR, ج.م, EGP, LE); quote CTA text («طلب عرض سعر», «احصل على تسعيرة», "request a quote") | M | yes | **Tested: partial.** Prices were found on Salla (JSON-LD `"priceCurrency":"SAR","price":140`) and Shopify ("LE 1,573.00"). Technopanel's homepage shows no price and no quote CTA; its contact path is WhatsApp, phone and PDFs. Quote wording on inner pages is untested. |
| S05 | B2B indicators | Catalogue or company-profile PDF links, certificates (`SASO`, `ISO 9001`), «مشاريعنا»/«عملاؤنا» pages, «موزعين/وكلاء/جملة» words, no cart | M (a bundle of hints, not a label) | yes | **Tested: works** on Technopanel: a `Technopanel-Company-Profile.pdf` link, «شهادة الساسو (SASO)» and «مشاريعنا». |
| S06 | Business-model label (B2C store, D2C brand, B2B supplier, services, bookings, branches retail, marketplace seller, F&B, mixed) | **AI business analyst** labels it from S01–S05 plus page text, citing each clue. Code never infers the label alone. | M | yes | Untested as an AI step; the inputs were tested above. |
| S07 | Markets and languages | `hreflang`, Salla `is_multilingual`/`currencies_enabled`/`languages`, Shopify `/meta.json` `ships_to_countries` and `currency`, Zid country paths such as `/ar-kw/` | H | yes | **Tested: works.** Technopanel `ar,en-US,en`; Hayaa `x-default,en,ar` and ships to `["EG"]`; Batla is single-language, SAR only. |
| S08 | Subscriptions / bundles / B2B portal | Text and links: «اشتراك», "dealer login", «بوابة الموزعين»; Shopify ReCharge script | L–M | yes | Untested. |

### 3.2 Payments

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S09 | Payment methods (Salla) | Settings `store.settings.payments`, e.g. `["mada","credit_card","bank","stc_pay","apple_pay","tabby_installment","tamara_installment","customer_wallet"]` | H | yes | **Tested: works** (batlaperfume.com) |
| S10 | Payment methods (Zid) | `<a href="/shipping-and-payment" title="mada">` icon links; rendered `/shipping-and-payment` shows «خيارات الدفع 6 / خيارات التوصيل 1» | H | yes | **Tested: works.** Found `apple_pay, mada, visa, mastercard, amex`, with counts on the rendered page. The page needs a browser because it is built by JavaScript. |
| S11 | Payment methods (Shopify) | Footer icons `payment_icons/<name>-<hash>.svg` (`cash` = cash on delivery) | H | yes | **Tested: works.** Hayaa: `visa, master, fawry, vodafone, valu, sympl, cash`. |
| S12 | Payment methods (other sites) | Script and request hosts: Paymob, Moyasar, HyperPay (`oppwa`), PayTabs, Tap, Checkout.com, Kashier, Tabby (`tabby.ai`), Tamara (`tamara.co`); text «الدفع عند الاستلام», InstaPay, Vodafone Cash | M | yes | Partially covered by the existing fingerprints. The new host list is **untested**. False positive fixed: the pattern `valu` matched the word "value" on 3 sites. It must be `\bvalu\b` or `valu.com.eg`. |

### 3.3 Catalogue size

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S13 | Number of products | Shopify `GET /meta.json` → `published_products_count`, `published_collections_count`. Salla `GET https://api.salla.dev/store/v1/products?per_page=50` with header `Store-Identifier: <store id from settings>` (follow `cursor.next`). Zid `sitemap_products.xml`. WooCommerce `GET /wp-json/wc/store/v1/products?per_page=1` → `X-WP-Total` header. Otherwise count product URLs in the sitemap. | H (platform), M (sitemap) | yes | **Tested: works.** Hayaa has 244 products and 27 collections. The Salla API counted 15 products and also returns per-product `rating {count, stars}`. Zid has 10 URLs. WooCommerce: the Store API is documented as unauthenticated with `X-WP-Total` ([WooCommerce Store API docs](https://developer.woocommerce.com/docs/apis/store-api/)), but breadfast.com answered 404 `rest_no_route`, so it was **not proven on a live store**. Shopify `/meta.json` and the Salla storefront API are **undocumented and observed** only ([Salla Twilight SDK docs](https://docs.salla.dev/422610m0) do not document the header). |

### 3.4 Lead capture and sales process

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S14 | Enquiry form by purpose | Count `<form>` elements **that contain** an email, tel or textarea field, or a name plus phone. Ignore search, cart, login and newsletter-only forms. Also plugin hints: WPForms, Contact Form 7 (`wpcf7`), Elementor form, HubSpot (`hsforms`), Zoho Forms, Google Forms, Typeform. | M | yes | **Tested: partial.** A raw form count is useless: Zid showed 7 forms (search, cart, …). Technopanel's `/wp-json/` lists the `wpforms/v1` plugin, but the homepage has no form. The purpose filter is **untested**. |
| S15 | WordPress plugin list | `GET /wp-json/` → `namespaces` (WPForms, Mailchimp widget, Rank Math, Site Kit, …) | H | yes | **Tested: works** (technopanel.com.sa) |
| S16 | WhatsApp path type | Plain link (`wa.me/<number>`, `api.whatsapp.com/send?phone=`) vs a chat widget plugin (`ht-ctc`/Click to Chat, `joinchat`, Elfsight, GetButton) vs an API provider script (WATI, respond.io, Karzoun, Zoko, Mottasl, Unifonic, Gupshup) | H for link/plugin; L for API provider (most providers leave no trace on the site) | yes | **Tested: works** for the link (Batla, Aurum, Technopanel) and the plugin (`ht-ctc` on Technopanel). API-provider detection is **untested**. |
| S17 | Calls/email only | `tel:` and `mailto:` links; contact email on a free mailbox (gmail/hotmail/outlook/yahoo) vs the brand domain | H | yes | **Tested: works.** Batla's contact email is on gmail.com; Technopanel uses its own domain. |
| S18 | Booking / appointments | Calendly, cal.com, zcal, Google Calendar appointment pages, Microsoft Bookings, Fresha, Booksy, SimplyBook, Setmore, Vezeeta; text «احجز موعد» | M | yes | Untested (no booking business in the sample) |
| S19 | Catalogue / profile PDF as the main CTA | `href="*.pdf"` in the header or hero | M | yes | **Tested: works** (Technopanel: «بروفايل الشركة», «تحميل الكتالوج») |

### 3.5 CRM, marketing automation, helpdesk, live chat

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S20 | Tools loaded on the site | Request hosts: HubSpot (`hs-scripts`, `hsforms`, `hs-analytics`), Zoho (`salesiq.zoho`, `zohopublic`), Salesforce/Pardot, Freshworks (`freshchat`, `fw-cdn`), Zendesk (`zdassets`, `zopim`), Intercom, tawk.to, Crisp, Tidio, LiveChat, Chatwoot; push/CRM tools (OneSignal, WebEngage, CleverTap, MoEngage, Insider); Zid marketing apps (`mazeedplus`) | H when present; absence is weak | yes | **Tested: partial.** None of these were on the 5 SME sites. Zid's `raqeeb` and `mazeedplus` were detected. The host list for the others is **untested** on a positive case. |
| S21 | Tools proven by DNS | `dns.resolveTxt` and SPF `include:` values: `_spf.mlsend.com` (MailerLite), `servers.mcsv.net` (Mailchimp), `mail.zendesk.com` (Zendesk), `mailgun.org`, `sendgrid.net`, `spf.brevo.com`, `hubspotemail.net`, `zoho.*`, `_spf.salesforce.com`, `spf.protection.outlook.com` (Microsoft 365), `_spf.google.com` (Google Workspace); TXT `*-domain-verification` (atlassian, mailerlite, apple, zoho, …) | H | yes (Node `node:dns`) | **Tested: works.** Technopanel has MailerLite, which the website never shows. Almarai has Microsoft 365, Mailchimp and Zendesk. Breadfast has Google Workspace and Mailgun. |
| S22 | Business email on the domain | `dns.resolveMx(domain)`. No MX records means no mailbox on the brand domain. | H | yes | **Tested: works.** batlaperfume.com and hayaafashioneg.com have no MX; technopanel.com.sa has its own mail server. |

### 3.6 Retention, loyalty, reviews and reputation

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S23 | Loyalty / cashback / wallet | Salla settings `is_loyalty_enabled` and feature `customer-wallet`. Zid `GET /api/v1/loyalty-points/check-status` → `{"loyalty_status":false,"cashback_status":false}`. Scripts: Smile.io, LoyaltyLion, Gameball, Boonus, Rise.ai. Text «برنامج الولاء», «نقاط». | H (platform), M (scripts) | yes | **Tested: works.** Batla has loyalty off. Aurum has loyalty and cashback off (a public JSON endpoint, undocumented and observed). Script hosts are **untested**. |
| S24 | On-site reviews | Salla `rating_enabled` plus per-product `rating.count/stars` from the storefront API; Judge.me, Yotpo, Loox, Stamped, Okendo scripts | H (Salla), M | yes | **Tested: works** for Salla (a product had 16 ratings at 4.8). Scripts are **untested**. |
| S25 | Google Maps rating and review count | Browser opens `https://www.google.com/maps/search/<name>` or a Maps link found on the site (JSON-LD `sameAs`, footer). Read `h1`, «4.1 (92)», category button, `a[data-item-id="authority"]` (website), `button[data-item-id^="phone"]`, address, latest owner update. | H after match | yes (robots.txt allows `/maps/place/` and `/maps/search/`) | **Tested: works.** Technopanel: «شركة تكنوبانل لصناعه الكلادينج», 4.1 from 92 reviews, category «مصنع», website technopanel.com.sa, owner update dated 20/03/2026. |
| S26 | Maps match rule (prevents false matches) | A listing counts only if its website equals the client domain, **or** equals one of the client's known social URLs, **or** its phone equals a `tel:`/`wa.me` number on the site. Otherwise the result is **unknown**. | H | yes | **Tested: works.** "Hayaa Fashion Cairo" matched 2 listings (main: website hayaafashioneg.com, 4.2 from 53; "Giza branch": website facebook.com/hayaafashioneg, 3.3 from 3) and rejected "Haya". "Batla perfume" returned 2 different businesses (batlah.com, battalstore.com), both correctly rejected. |
| S27 | Unanswered Google reviews | "Response from the owner" markers on the reviews tab | M | yes | Untested |
| S28 | App store rating and downloads | See S33 | H | yes | **Tested: works** |

### 3.7 Fulfilment and distribution

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S29 | Delivery options count and pickup | Zid rendered `/shipping-and-payment` («خيارات التوصيل N»); Salla `support_pickup`, `shipping.delivery_location`, `bullet_delivery` | H | yes | **Tested: works.** Zid shows 1 delivery option; Batla `support_pickup:false`. |
| S30 | Named couriers | Shipping page text vocabulary. KSA: SMSA, Aramex, SPL/«البريد السعودي», J&T, iMile, Naqel, Redbox, Zajil, Torod, OTO. EG: Bosta, Mylerz, J&T, Aramex, R2S. | L–M (text lists) | yes | Untested. The vocabulary is a list of names, not facts about any client. |
| S31 | Marketplaces and delivery apps | Outbound links to amazon.sa/.eg, noon.com, Jumia, Namshi, HungerStation, Jahez, Keeta, ToYou, Mrsool, Talabat, elmenus | M (a link proves presence; no link proves nothing) | yes | Untested (no case in the sample) |
| S32 | Shipping countries | Shopify `/meta.json` `ships_to_countries`; Salla `currencies`/`languages`; Zid country paths | H | yes | **Tested: works** (Hayaa `["EG"]`) |
| S33 | Own mobile app | Site links to `apps.apple.com/.../id<n>` and `play.google.com/store/apps/details?id=<pkg>`, then `https://itunes.apple.com/lookup?id=<n>&country=<cc>`. With no link: `https://itunes.apple.com/search?term=<name>&country=<cc>&entity=software`, accepted **only if** `sellerUrl` host = client domain. Google Play `https://play.google.com/store/apps/details?id=<pkg>&hl=en&gl=<cc>` → rating, reviews, downloads, "Updated on". | H | yes | **Tested: works.** Breadfast iOS: 4.83 from 148,430 ratings, updated 2026-09-13; Play: 4.8, 88.4K reviews, 5M+ downloads, updated Sep 10, 2026. Search by "نمشي" returned Namshi with `sellerUrl` https://www.namshi.com, so the match rule works. Batla/Hayaa/Technopanel have 0 results (correct). |

### 3.8 Scale and growth

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S34 | Branches / locations | JSON-LD `LocalBusiness`/`Store` blocks with `address`; Rank Math `locations.kml`; store-locator page («فروعنا»); several matched Maps listings (S26) | M–H | yes | **Tested: works.** Technopanel serves `/locations.kml` (1 placemark) and its JSON-LD links Maps. Hayaa has 2 matched Maps listings (a Cairo store and a Giza branch). |
| S35 | Hiring (growth) | Careers link on the site plus an applicant-tracking host (Greenhouse, Lever, Workable, BambooHR, Zoho Recruit, Recruitee, Teamtailor). LinkedIn guest jobs: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?f_C=<companyId>&geoId=92000000&start=0` (company id = `organization:<n>` in the public company page HTML). | M | the site yes; LinkedIn see §7 | **Tested: partial.** `f_C` **alone returns an empty body (26 bytes)** for Technopanel, Almarai and noon. **`f_C` + `geoId` works**: Almarai returned 10 job cards with titles and dates (`geoId=100459316` and the worldwide `92000000`), Breadfast 10 cards with `geoId=106155005` → "Cairo, Egypt". Technopanel has 0 open jobs. Breadfast's careers page links only to LinkedIn; ATS detection is **untested**. LinkedIn `robots.txt` disallows `/jobs-guest/` (§7), so use a manual link. |
| S36 | Business age online | `https://web.archive.org/cdx/search/cdx?url=<domain>&limit=1&output=json&fl=timestamp,original`; `https://rdap.org/domain/<domain>` (registration date) | M | yes | **Tested: works.** Technopanel's first Wayback capture is 2007-04-15. RDAP works for `.com` (redirects to Verisign). It returned 404 "No RDAP service" for `.com.sa`. |
| S37 | Social scale as an inbound-volume proxy | Already collected by the social step (followers, posts). No new work. | — | yes | Existing (docs/research-social.md) |

### 3.9 Trust and compliance

| # | Signal | How to detect | Rel. | Free | Status |
|---|---|---|---|---|---|
| S38 | Saudi e-store authentication badge on the site | Link `https://eauthenticate.saudibusiness.gov.sa/certificate-details/<certificate no.>`; Salla settings `certificate.id` | H | yes | **Tested: works** (Batla `0000029053`, Aurum `0000094420`) |
| S39 | Saudi e-store authentication confirmed at the source | Browser opens `https://eauthenticate.saudibusiness.gov.sa/inquiry`, picks a search type (certificate no., freelance document no., unified national number, store name, store URL), types, and clicks «بحث». The page solves its own automatic proof-of-work challenge (no human captcha). The result shows the identifier (e.g. «7008237385 سجل تجاري»), certificate number and store names in Arabic and English. | H | yes | **Tested: works** for certificate `0000094420` → CR national number 7008237385, «اوروم كوفي / AURUM COFFEE». Opening `/certificate-details/<n>` directly redirects to `/inquiry`, so the form must be used. Search by "store URL" was attempted but not completed in the test (input handling). **Untested:** name and URL searches. Maroof was replaced by this platform: Ministry of Commerce news https://mc.gov.sa/ar/mediacenter/News/Pages/29-03-23-02.aspx (seen in search results; the page failed to open here with a certificate error). `maroof.sa` answered HTTP 503. |
| S40 | VAT number and CR shown on the site | Salla settings `tax.number`, `commercial_number`, `freelance_number`, `made_in_ksa`; text «الرقم الضريبي» + 15 digits starting and ending with 3; «السجل التجاري» + 10 digits | H (Salla), M (text) | yes | **Tested: works.** Batla shows VAT and CR in both the settings and the footer. The 15-digit "3…3" format is a pattern, [unverified] as an official rule. |
| S41 | VAT number valid at ZATCA | https://zatca.gov.sa/en/eServices/Pages/TaxpayerLookup.aspx | H | yes, but **invisible reCAPTCHA Enterprise** | **Tested: blocked** for automation. It stays an optional manual link. |
| S42 | Saudi CR details | https://mc.gov.sa/ar/eservices/Pages/Commercial-data.aspx | H | yes, but has «رمز التحقق» (captcha) | **Tested: blocked** for automation. Manual link. Plain Node `fetch` also failed (TLS). |
| S43 | Egyptian registry / tax status | ITDA commercial entity inquiry http://itda.gov.eg/en/registry-inquiry-en.html (the page says the "initial inquiry about entity name and status is free"; the flow shows Login/Payment steps); ETA e-invoice registered list https://eta.gov.eg/ar/registered | H | unclear | **Tested: partial** (ITDA page loads; search not run). ETA answered **HTTP 403** from this PC. Manual links only. |
| S44 | Returns / exchange policy | A link whose path or text contains return/refund/exchange/«استرجاع»/«استبدال» (`/pages/exchange-and-returns`, `/policies/refund-policy`); capture that page as evidence | H for presence; content needs reading | yes | **Tested: works.** Hayaa has `/pages/exchange-and-returns`; Batla's footer has «سياسة الاستخدام والخصوصية والاستبدال والاسترجاع». The v1 text-only regex missed Hayaa and the link-based rule found it. |
| S45 | Business email / real address / hours | S22 plus JSON-LD `address` and Maps hours | H | yes | **Tested: works** (see S22, S25) |

---

## 4. The catalog today (`catalog/catalog.json`, read 2026-09-15)

### 4.1 Services (10)

| id | Name | Strategic | Capability |
|---|---|---|---|
| `svc.product_portfolio_management` | Product Portfolio Management | yes | 5 |
| `svc.brand_management` | Brand Management | yes | 4 |
| `svc.marketing_management` | Marketing Management | yes | 5 |
| `svc.social_media_management` | Social Media Management | no | 3 |
| `svc.website_management` | Website Management | no | 3 |
| `svc.performance_marketing` | Performance Marketing | no | 2 |
| `svc.email_marketing` | Email Marketing | no | 1 |
| `svc.marketing_automation` | Marketing Automation | no | 0 |
| `svc.influencer_marketing` | Influencer Marketing | no | 0 |
| `svc.media_production` | Media Production | no | blank |

### 4.2 Offerings (7)

| id | Parent service | Name |
|---|---|---|
| `off.content_calendar_production` | Social Media Management | Content Calendar Production |
| `off.community_management` | Social Media Management | Community Management |
| `off.website_building` | Website Management | Website Building |
| `off.seo` | Website Management | SEO |
| `off.google_ads` | Performance Marketing | Google Ads |
| `off.meta_ads` | Performance Marketing | Meta Ads |
| `off.tiktok_ads` | Performance Marketing | TikTok Ads |

### 4.3 Deliverables (50, grouped by parent)

**Strategic services:**
- **Product Portfolio Management:** `del.product_portfolio_master_sheet`
- **Brand Management:** `del.brand_book_documentation`, `del.loyalty_journey_transformation` (conditional)
- **Marketing Management:** `del.marketing_strategy_map`

**Offerings:**
- **Content Calendar Production:** `del.content_calendar_research_analysis_report`, `del.content_calendar_plan`, `del.content_calendar_content_production`, `del.content_calendar_media_preparation`
- **Community Management:** `del.response_playbook`, `del.community_insights_report`
- **Website Building:** `del.website_research_analysis_report`, `del.website_roadmap`, `del.website_building`, `del.website_monitoring_dashboard`, `del.website_optimization_reports`
- **SEO:** `del.seo_research_analysis_report`, `del.seo_plan`, `del.seo_implementation`, `del.seo_monitoring_dashboard`, `del.seo_optimization_reports`
- **Google Ads:** `del.google_ads_research_analysis_report`, `del.google_ads_plan`, `del.google_ads_campaign_execution`, `del.google_ads_monitoring_dashboard`, `del.google_ads_optimization_reports`
- **Meta Ads:** `del.meta_ads_research_analysis_report`, `del.meta_ads_plan`, `del.meta_ads_campaign_execution`, `del.meta_ads_monitoring_dashboard`, `del.meta_ads_optimization_reports`
- **TikTok Ads:** `del.tiktok_ads_research_analysis_report`, `del.tiktok_ads_plan`, `del.tiktok_ads_campaign_execution`, `del.tiktok_ads_monitoring_dashboard`, `del.tiktok_ads_optimization_reports`

**Other services:**
- **Email Marketing:** `del.email_marketing_research_analysis_report`, `del.email_marketing_plan`, `del.email_marketing_campaign_execution`, `del.email_marketing_monitoring_dashboard`, `del.email_marketing_optimization_reports`
- **Marketing Automation:** `del.marketing_automation_research_analysis_report`, `del.marketing_automation_plan`, `del.implemented_marketing_automation_workflows`
- **Influencer Marketing:** `del.influencer_marketing_research_analysis_report`, `del.influencer_marketing_plan`, `del.influencer_campaign_execution`, `del.influencer_campaign_performance_report`
- **Media Production:** `del.media_production_research_analysis_report`, `del.media_production_plan`, `del.final_media_asset_batch`

---

## 5. Mapping business signals to the catalog

### 5.1 Signals that support existing problem types

In this table, "→" means the problem type, once confirmed at Gate 1, justifies that item through `rules/problem-types.json`.

| Signals | Existing problem type | Catalog item it justifies |
|---|---|---|
| S02 no checkout, S14 no enquiry form, S16 WhatsApp-only path, S19 PDF as the only CTA | `weak_conversion_path` | `off.website_building` |
| S01 no site / S03 checkout off | `website_missing_or_broken` | `off.website_building` |
| S34 branches with S25/S26 no matched listing | `low_search_visibility` | `off.seo` |
| S14/S21/S22 no list capture and no email tool in DNS/site | `no_owned_audience_nurture` | `svc.email_marketing` (capability 1 → Gate 2 opt-in) |
| S16/S20/S21 no CRM/chat/automation **plus** notes that show manual follow-up | `manual_lead_follow_up` | `svc.marketing_automation` (capability 0 → opt-in) |
| S23 loyalty off plus client data | `no_post_purchase_journey`, `low_repeat_engagement` | `del.loyalty_journey_transformation` (conditional) |
| S25/S28 low ratings with complaint quotes | `negative_experience_signals` | `del.loyalty_journey_transformation`, `off.community_management` |
| S27 unanswered reviews | `community_unmanaged` | `off.community_management` |
| S04 prices missing or different across channels; S13 very large or very small catalogue with no grouping | `pricing_inconsistent`, `offer_structure_unclear` | `svc.product_portfolio_management` |
| S31 sales dependent on one marketplace or delivery app | `channel_mix_misaligned` | `svc.marketing_management` |
| S07 markets vs languages | `value_proposition_unclear` (weak fit) → a new type is proposed below | — |

### 5.2 Proposed new problem types (for the owner to approve; `rules/problem-types.json` NOT edited)

Each type maps only to existing catalog items. "Auto hint" means the code checks that make the diagnosis consider the type. The AI still tags it with evidence, and the team confirms it at Gate 1.

| id (proposal) | Label (EN / AR) | Definition | Justifies | Evidence kind | Auto hint (check keys, §6.2) | Overlap note |
|---|---|---|---|---|---|---|
| `no_online_ordering` | No way to order on the website / لا يمكن الطلب من الموقع | Products are shown (with or without prices), but visitors cannot order online. There is no cart or checkout, orders go only by WhatsApp, phone or DMs, or the store's checkout is switched off. | `off.website_building` | absence_check | `biz_online_checkout=absent` + (`biz_prices_visible=present` or `biz_catalog_size>0`); or `biz_checkout_disabled=present` | A narrower, stronger form of `weak_conversion_path` for product sellers |
| `no_lead_capture_path` | No enquiry path for B2B or service buyers / لا يوجد مسار لطلب عرض سعر أو استفسار | A B2B, services or booking business whose site has no enquiry or quote form, no booking tool and no chat. Buyers can only call, email or download a PDF. | `off.website_building` | absence_check | `biz_lead_form=absent`, `biz_quote_request=absent`, `biz_booking_tool=absent`, `biz_catalogue_pdf=present` | Narrower form of `weak_conversion_path` for B2B |
| `purchase_policies_unclear` | Shipping, returns or payment terms unclear / سياسات الشحن والاسترجاع غير واضحة | Shipping, returns/exchange or payment terms are missing, hard to find, or contradict each other across pages. | `off.website_building` | public | `biz_returns_policy=absent`; policy pages captured as evidence for quotes | The Hayaa Fashion test had to force "return policy conflict" and "unclear shipping" into other types |
| `market_language_gap` | The site doesn't speak the target market's language / الموقع لا يخاطب السوق المستهدف بلغته | The client targets markets or buyers (notes, shipping countries, currencies) in a language the site does not offer. | `off.website_building` | public | `biz_languages` vs notes/`biz_ships_to` | New |
| `local_listings_gap` | Branches missing or incomplete on Google Maps / الفروع غير ظاهرة على خرائط Google | Physical branches, showrooms or factories exist (site, JSON-LD, KML, notes), but there is no matched Maps listing, fewer listings than branches, or listings lack website or hours. | `off.seo` | absence_check | `biz_branches` vs `biz_maps_listing` | More specific than `low_search_visibility` |
| `reviews_unmanaged` | Public reviews weak or unanswered / تقييمات عامة ضعيفة أو بدون رد | Matched Google Maps or app reviews show a rating below the approved threshold (minimum review count), or recent reviews with no owner reply. | `off.community_management` | public (code-measured) | `biz_maps_listing`, `biz_app_ios`, `biz_app_android` + thresholds in `rules/business-signals.json` | `community_unmanaged` is about social comments; this covers reviews. `negative_experience_signals` still needs quotes. |
| `trust_signals_not_shown` | Official trust signals not shown to buyers / علامات الثقة الرسمية غير ظاهرة للمشتري | A Saudi online store has e-authentication or VAT/CR (found by the official inquiry or in notes), but the site does not show them. Or an Egyptian store shows no real address, contact or returns info. | `off.website_building` | absence_check | `biz_sbc_badge=absent` + `biz_sbc_verified=value` | New. It never claims the business is unregistered (see the internal-only type below). |
| `inbound_not_systemised` | Many enquiries, no system to handle them / استفسارات كثيرة بدون نظام متابعة | Clear inbound demand (notes, a high Maps review count, several branches, WhatsApp as the main channel) and no CRM, helpdesk, chat or automation tool found on the site or in DNS. | `svc.marketing_automation` (capability 0 → Gate 2 opt-in) | client_data | `biz_crm_tools=absent`, `biz_live_chat=absent`, `biz_whatsapp_path`, `biz_maps_listing` | Close to `manual_lead_follow_up`. **Recommendation:** approve this or widen `manual_lead_follow_up`, not both. Absence of detected tools is weak (CRMs are often internal), so it needs notes or team confirmation. |
| `checkout_payment_gap` _(internal only)_ | Payment options may block orders / خيارات الدفع قد تعيق الطلب | The checkout lacks methods listed in an approved local-market table (e.g. mada/Apple Pay in KSA, COD/wallets in EG), or it has only one method. | **nothing** (`justifies: []`, `internalOnly: true`) | absence_check | `biz_payment_methods` vs `rules/business-signals.json` market table | Activating payment gateways is operations, not a catalog service |
| `compliance_gap_observed` _(internal only)_ | Registration or authentication not found / لم يُعثر على توثيق أو سجل | No e-authentication, VAT or CR was found for a Saudi online store after the official inquiry. | **nothing** (`justifies: []`, `internalOnly: true`) | absence_check | `biz_sbc_verified=absent` | Never shown to the client: the inquiry can miss (name spelling, freelance document), and legality is not ours to judge |

Proposed JSON shape (same fields as today, plus two optional ones):

```json
{
  "id": "no_online_ordering",
  "labelEn": "No way to order on the website",
  "labelAr": "لا يمكن الطلب من الموقع",
  "definition": "Products are shown but visitors cannot order online (no cart/checkout; orders only by WhatsApp, phone or DMs; or checkout switched off).",
  "justifies": ["off.website_building"],
  "evidence": "absence_check",
  "hintChecks": ["biz_online_checkout", "biz_checkout_disabled", "biz_prices_visible", "biz_catalog_size"],
  "status": "proposal"
}
```

- `hintChecks` is informational: it is shown to the diagnosis and at Gate 1.
- `internalOnly: true` means the scope resolver ignores the type, and a check keeps its problems out of the client proposal. This is like the existing "needed but excluded" handling.
- **Thresholds** go in a new rules file (`rules/business-signals.json`, status "draft"). Two examples: `reviews.lowRating = 4.0`, `reviews.minCount = 15`. The local payment table is another. Code never hard-codes them.

### 5.3 Business observations (no catalog service; internal report only)

| Area | Examples that can be detected automatically | Why it is not sold |
|---|---|---|
| Payments activation | No mada/Apple Pay (KSA) or COD/wallets (EG); no BNPL; checkout switched off | Gateway and BNPL contracts are merchant operations, not in the catalog |
| Fulfilment | Only 1 delivery option; no pickup; no stated delivery times; no cross-border shipping | Courier contracts and logistics are not in the catalog |
| Compliance and trust | E-authentication/VAT/CR not found at the source; no business email (no MX) | Legal/registration work; plan.md §8.3 already lists "entity, importer, payment, shipping" as manual constraints |
| CRM / helpdesk / ERP / POS choice | No CRM or helpdesk found; tools exist in DNS but not on the site (e.g. MailerLite) | Software selection and implementation beyond marketing automation is not in the catalog. It is useful context for `svc.marketing_automation` readiness. |
| Hiring and growth | Open jobs (count, roles, dates); no careers page | Context for the size and stage of the business |
| Apps | App rating, downloads, last update; no app | App development is not in the catalog |
| Marketplaces / delivery apps | Present on noon/Amazon/HungerStation; not present | Marketplace operations are not in the catalog (their marketing is covered by `channel_mix_misaligned`) |
| B2B distribution | Distributors/dealers pages, certificates, tenders | Sales-team or channel building is not in the catalog |
| Business age | First web capture, domain registration date | Context only |

---

## 6. How the layer fits the pipeline

### 6.1 Step graph change (`pipeline/steps.js`)

```
collect ──► business (code, browser) ──► business-analyst (ai, sonnet) ──┐
notes ──────────────────────────────────► business-analyst               ├──► record ──► …
collect + notes ──► research (3 teams, unchanged) ────────────────────────┘
```

| New step | kind | resource | needs | outputs | inputFingerprint |
|---|---|---|---|---|---|
| `business` "Business signals" | code | browser | `collect` | `evidence/audits/business.json` | `{ collect: out('collect'), name, market, socials }` |
| `business-analyst` "Business analyst" | ai (sonnet, effort medium) | ai | `business`, `notes` | `research/business-ops.json` | `{ business: out('business'), notes: out('notes'), market }` |

- `record.needs` becomes `['research', 'business-analyst']`. The record fingerprint adds `businessOps: out('business-analyst')`.
- Both new steps go into `OPTIONAL_LATE_STEPS`. Clients diagnosed before the layer existed then keep their approvals: the steps show `not_used` and can be run on demand. This is the same pattern as `profiles`/`competitors`/`social`.
- **Parallelism is unchanged.** The three research teams do not wait for the business step. Only `record` waits, and it already waits for research.
- The business step reuses the pages `collect` already captured (`techPages` HTML, requests and headers must be saved to `evidence/audits/pages-raw/`, or passed in, so they are not loaded again). It adds its own light calls.
- Time budget: ≈ 60–120 s. That covers Maps (1 search plus up to 3 candidate pages), the SBC inquiry (1 page), iTunes (1–2 calls; the documented limit is "approximately 20 calls per minute", [Apple Search API](https://performance-partners.apple.com/search-api)), Play (≤ 2 fetches), DNS (instant), a platform API (≤ 3 calls) and policy pages (≤ 3 captures).
- **Failure rule:** a source that fails or is blocked becomes a check with `result: 'blocked'` or `'unknown'` and a plain reason. The step itself never fails because of one source.

### 6.2 New code checks (`collect/business.js` + `rules/business-fingerprints.json`)

All checks use the existing `upsertCheck` format (`present | absent | value | blocked | unknown`), so the diagnosis can cite K### ids. Key prefix: `biz_`.

| Key | Question (as saved) | Detection | Result |
|---|---|---|---|
| `biz_platform_settings` | Store platform settings readable (Salla/Zid/Shopify) | S01, Salla `twilight::init`, Shopify `/meta.json` | value |
| `biz_online_checkout` | Visitors can add to cart and check out on the website | S02 | present/absent |
| `biz_checkout_disabled` | Store shows "checkout is disabled" to visitors | S03 (visible element) | present/absent |
| `biz_prices_visible` | Product prices are shown on the website | S04 (JSON-LD/meta/currency text on home + product page) | present/absent |
| `biz_quote_request` | "Request a quote" path on the website | S04 CTA text/link | present/absent |
| `biz_catalogue_pdf` | Catalogue or company profile offered as a PDF download | S19 | present/absent |
| `biz_b2b_indicators` | B2B indicators found (certificates, projects/clients pages, distributors) | S05 | value (list with page URLs) |
| `biz_payment_methods` | Payment methods shown by the store | S09–S12 | value (list + source: settings/icons/scripts) |
| `biz_bnpl` | Buy-now-pay-later offered (Tabby, Tamara, valU, Sympl, …) | S09–S12 | present/absent/value |
| `biz_cod` | Cash on delivery offered | Shopify `cash` icon, text | present/absent |
| `biz_catalog_size` | Number of published products | S13 | value (+ method) |
| `biz_languages` | Website languages / market versions | S07 | value |
| `biz_ships_to` | Countries the store ships to / sells in | S07, S32 | value |
| `biz_lead_form` | Enquiry form on the website (name/phone/email/message) | S14 on home + contact page | present/absent |
| `biz_booking_tool` | Online booking / appointment tool | S18 | present/absent |
| `biz_whatsapp_path` | WhatsApp path type | S16 | value: none / link / widget / API provider |
| `biz_live_chat` | Live chat widget on the website | S20 | present/absent |
| `biz_crm_tools` | CRM / marketing automation tools found (site or DNS) | S20, S21 | value/absent |
| `biz_email_tools` | Email sending tools found in the domain's DNS | S21 | value/absent |
| `biz_business_email` | Brand domain receives email (MX) and contact email uses the brand domain | S17, S22 | value |
| `biz_helpdesk` | Helpdesk / ticketing tool found | S20, S21 (Zendesk, Freshdesk) | present/absent |
| `biz_loyalty` | Loyalty / cashback / wallet enabled | S23 | present/absent (+ source) |
| `biz_onsite_reviews` | Product ratings enabled on the store (count, average) | S24 | value |
| `biz_delivery_options` | Delivery options / pickup | S29 | value |
| `biz_couriers` | Couriers named on shipping pages | S30 | value/unknown |
| `biz_returns_policy` | Returns / exchange policy page | S44 (page saved as evidence) | present/absent |
| `biz_marketplaces` | Links to marketplaces or delivery apps | S31 | value/unknown |
| `biz_app_ios` | iOS app (name, rating, ratings count, last update) | S33, match by link or `sellerUrl` | value/unknown |
| `biz_app_android` | Android app (rating, reviews, downloads, last update) | S33 | value/unknown |
| `biz_maps_listing` | Google Maps listing matched to this client (name, category, rating, reviews, website, hours) | S25 + S26 match rule; page text saved as evidence | value/unknown |
| `biz_branches` | Branches / locations found | S34 | value |
| `biz_hiring` | Careers page / open jobs | S35 site part | value/unknown |
| `biz_web_age` | First Wayback capture / domain registration date | S36 | value |
| `biz_sbc_badge` | Saudi e-store authentication badge shown on the website | S38 | present/absent (KSA only) |
| `biz_sbc_verified` | Saudi Business Center inquiry result | S39 by certificate no. from the site, else by store URL | value/absent/blocked (KSA only) |
| `biz_vat_cr_shown` | VAT number / CR number shown on the website | S40 | value/absent |
| `manual_zatca_vat` | ZATCA: is the VAT number valid? (optional, has captcha) | link S41 with the number filled in the note | manual |
| `manual_mc_cr` | Ministry of Commerce CR data (optional, has captcha) | link S42 | manual |
| `manual_linkedin_jobs` | LinkedIn: open jobs for this company (optional) | `https://www.linkedin.com/jobs/search/?f_C=<id>&geoId=92000000` | manual |
| `manual_eg_registry` | Egypt: commercial registry status (optional) | S43 links | manual (EG only) |

**Evidence text sources** get the new kind `business`. They feed quotes to the AI and the quote checker:
- the matched Maps listing (visible text);
- the SBC inquiry result row;
- app store listings (name, seller, rating, update);
- returns, shipping and payment pages (up to 3).

All manual checks are **optional and never blocking**, like today's `manual_*` checks.

**Fingerprint data file:** `rules/business-fingerprints.json`. It uses the same shape as `tech-fingerprints.json`, with new categories: `payment`, `bnpl`, `crm`, `helpdesk`, `live_chat`, `whatsapp_api`, `booking`, `loyalty`, `reviews`, `ats`, `marketplace`, `delivery_app`, `email_sender_dns`. DNS SPF/TXT patterns get their own `dns` array. Every pattern gets a unit test with a positive fixture (saved from the live tests in Appendix A) and a false-positive fixture:
- `value` must not match valU;
- theme `cart` CSS must not count as a checkout;
- a search form must not count as a lead form.

### 6.3 The AI "business analyst" research team (`ai/steps/business-analyst.js`)

**Run:** `claude -p --model sonnet --effort medium --output-format json --json-schema <schema>`. **No tools** (no WebSearch): code already did the discovery. It has the same system-prompt style and `EVIDENCE_RULES`, and the same `runAiStep` validation, retry and fallback.

**Inputs:**
- `intake` (name, market, industry, constraints);
- the `checksPacket` filtered to `biz_*`, `tech_*`, `website_reachable` and `social_*`;
- `evidencePacket` for kinds `website`, `business`, `requested`, `notes`, `human`, `file` (≈ 45k chars);
- the meeting-notes facts.

**Output schema (sketch):**

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["businessModel", "facts", "observations", "unknown"],
  "properties": {
    "businessModel": {
      "type": "object", "additionalProperties": false,
      "required": ["label", "evidence", "confidence"],
      "properties": {
        "label": { "enum": ["b2c_ecommerce", "d2c_brand", "b2b_manufacturer_supplier", "b2b_services", "b2c_services_booking", "retail_branches", "food_beverage", "marketplace_or_social_seller", "mixed", "unknown"] },
        "evidence": { "type": "array", "minItems": 0, "maxItems": 5, "items": { "$ref": "#/$defs/cite" } },
        "confidence": { "enum": ["high", "medium", "low"] }
      }
    },
    "facts": { "type": "array", "maxItems": 40, "items": {
      "type": "object", "additionalProperties": false,
      "required": ["field", "value", "evidenceId", "quote", "confidence"],
      "properties": {
        "field": { "enum": ["customer_type", "order_path", "payment_methods", "pricing_visibility", "lead_handling", "support_channels", "crm_and_tools", "fulfilment", "retention_mechanisms", "public_reputation", "catalogue_scale", "locations", "growth_signals", "markets_served", "trust_and_compliance", "app_presence", "marketplace_presence"] },
        "value": { "type": "string", "minLength": 2, "maxLength": 300 },
        "evidenceId": { "type": "string", "pattern": "^[ENHK][0-9]{3}$" },
        "quote": { "type": "string", "maxLength": 300 },
        "confidence": { "enum": ["high", "medium", "low"] }
      } } },
    "observations": { "type": "array", "maxItems": 8, "items": {
      "type": "object", "additionalProperties": false,
      "required": ["area", "text_ar", "text_en", "evidence"],
      "properties": {
        "area": { "enum": ["payments", "fulfilment", "compliance", "crm_support", "sales_process", "retention", "reputation", "hiring_growth", "markets", "catalogue", "apps", "marketplaces"] },
        "text_ar": { "type": "string", "maxLength": 300 },
        "text_en": { "type": "string", "maxLength": 300 },
        "evidence": { "type": "array", "minItems": 1, "maxItems": 4, "items": { "$ref": "#/$defs/cite" } }
      } } },
    "unknown": { "type": "array", "items": { "type": "object", "required": ["field", "reason"], "properties": { "field": { "type": "string" }, "reason": { "type": "string", "maxLength": 200 } } } }
  },
  "$defs": { "cite": { "type": "object", "additionalProperties": false, "required": ["evidenceId", "quote"], "properties": { "evidenceId": { "type": "string", "pattern": "^[ENHK][0-9]{3}$" }, "quote": { "type": "string", "maxLength": 300 } } } }
}
```

**Code after the run (same as `research.js`):**
- `verifyCitation` checks every fact and every observation citation.
- Facts that fail are dropped and listed as `rejected`.
- An observation with zero verified citations is dropped.
- `businessModel.label` becomes `unknown` unless at least one citation verifies.
- The quality retry triggers when more than a third of citations fail.
- Observations are saved with `internalOnly: true`.

**The analyst must not (written into the prompt; the schema enforces what it can):**
- Name Al-Marketer services, offerings or deliverables, or suggest solutions, vendors or tools to buy.
- Estimate revenue, order volume, traffic, margins or employee counts, or write any number that is not in a check or quote.
- Treat a missing detection as a fact without the check id. "No CRM found" must cite `biz_crm_tools`, and the text says "not found on the pages and DNS we checked", never "has no CRM".
- Judge legality or compliance ("unlicensed", "illegal"). It may only restate the inquiry result.
- Use general market knowledge as a fact (e.g. "Saudi shoppers prefer mada"). Market expectations live in the owner-approved rules table, not in AI text.
- Pick problem types or severities. That remains the diagnosis step (Opus) plus Gate 1.
- Cite search results or browse. It has no tools.

### 6.4 Where results show up

| Place | What appears | Built by |
|---|---|---|
| **Client record** (`record/client-record.json`) | New section "Business & operations": business-model label with citations and all verified business facts. `business_model` (already a REQUIRED field) can now be filled from the analyst, so the existing blocking question is asked only if both the Business & Offers team and the analyst leave it unknown. | Code (record step) |
| **Research stage → "What we found"** | A "Business & operations" card: a grid of `biz_*` checks (grouped: how customers buy · payments · lead handling & support · retention & reputation · scale & growth · trust) plus the analyst's facts. This is the **internal report**. | Code (app view) |
| **Diagnosis (Opus)** | `recordText` includes the business section. `checksPacket` includes `biz_*`. The prompt adds: "business observations with no matching problem type go to `observations` or `unmapped`; never force a type". The 8 new types are listed if the owner approves them. | Code + AI |
| **Gate 1 screen** | New collapsible side panel "Business observations (internal)", next to the existing "Observations" panel. Each item shows its area, Arabic and English text, and the evidence quote or check. There are no decision controls, because nothing is sold from them. A **Copy to constraints** button lets the team move one into `intake.constraints` by hand. | Code (app view) |
| **Proposal** | 1) Problems of the new types flow through §04–§06 like any other problem, and services come only through the rules table. 2) Optionally, the existing code-built "فحص الموقع والقياس" slide gets one extra group "الشراء والتواصل": online checkout, enquiry/quote form, booking, WhatsApp, returns policy. **Payment methods and trust items appear only as "موجود", never "غير موجود"**, because an absence is less certain. **No** compliance, hiring, app or business-observation content, and no AI text. | Code (`engine/proposal/extras.js`) |
| **Next steps slide** | Unchanged logic. It may add readiness asks when a related service is in scope, e.g. "صلاحية حساب المتجر" for `svc.website_management`, reusing `website_access`. | Code |

### 6.5 Fully automatic, with few questions

- No new blocking questions. The only blocking field stays `business_model`, and it is now filled automatically in most cases.
- Captcha sources (ZATCA, MC CR) and robots-disallowed sources (LinkedIn jobs, Bayt) are optional manual links that never block.
- Country-specific checks run only for the client's `market` (KSA: SBC/VAT/CR; EG: ITDA/ETA links). An unclear market runs both sets and marks them `unknown` rather than `absent`.

### 6.6 Tests (`node --test`)

- **Parsers, with fixtures saved from the live pages:**
  - Salla settings (`twilight::init`);
  - Zid payment icons plus the visible checkout-disabled banner;
  - Shopify `/meta.json` and payment icons;
  - `/wp-json/` namespaces;
  - SPF/TXT/MX;
  - Maps place text («4.1 (92)», authority link, phone);
  - the iTunes result `sellerUrl` match;
  - the Play details text;
  - LinkedIn job cards (for the manual-link fixture only);
  - the SBC result row.
- **Rules:**
  - Maps/app match accepted only by website, social or phone.
  - Absent vs unknown: a blocked source never becomes `absent`.
  - Internal-only types never reach scope or content (a scope assertion alongside S2/S7).
  - Every `biz_*` check has a question and a result.
- **False positives:** `value` ≠ valU; theme cart CSS ≠ checkout; a search form ≠ a lead form; a different business with a similar name on Maps is rejected (the Batla case).
- Each safeguard is switched off once to confirm its test fails, as done in plan-v2.

### 6.7 Effort estimate

| Slice | Days |
|---|---|
| `collect/business.js` + fingerprints + platform parsers + DNS + Maps/app/SBC capture + checks + tests | 2–2.5 |
| `business-analyst` AI step + schema + verification + record merge + step graph + fingerprints/legacy | 1 |
| Research card, Gate 1 panel, optional audit-slide group | 1 |
| Rules drafts (`business-signals.json`, proposed problem types) for owner sign-off + docs | 0.5 |
| **Total** | **≈ 4.5–5** |

---

## 7. Free external sources: exact URLs and test results

| Source | Exact URL / call | Login / key | Tested from this PC (2026-09-15) | Automation position |
|---|---|---|---|---|
| Google Maps place/search | `https://www.google.com/maps/search/<name>`, then `/maps/place/...` (or the site's own Maps link) | none | **Works** in Playwright: rating, review count, category, website, phone, address, owner update (Technopanel, Hayaa ×2, Batla correctly unmatched). Plain `fetch` returns only a JS shell. | Allowed by robots: `https://www.google.com/robots.txt` has `Allow: /maps/place/` and `Allow: /maps/search/` (checked today). Google's terms forbid automated access "in violation of the machine-readable instructions on our web pages (for example, robots.txt files…)" ([Google Terms](https://policies.google.com/terms)). **Automate** at low volume (1 search + ≤ 3 places per client). |
| iTunes Search / Lookup API | `https://itunes.apple.com/search?term=<name>&country=sa&entity=software&limit=5`; `https://itunes.apple.com/lookup?id=<appId>&country=eg` | none | **Works** (Namshi found via "نمشي" with `sellerUrl`; Breadfast lookup 4.83 / 148,430) | Documented API, "approximately 20 calls per minute" ([Apple](https://performance-partners.apple.com/search-api)). Note: `itunes.apple.com/robots.txt` says `Disallow: /search*`. The documented API is treated as permitted [unverified interpretation]. **Automate**, 1–2 calls per client. |
| Google Play app page | `https://play.google.com/store/apps/details?id=<package>&hl=en&gl=SA` | none | **Works**: rating, reviews, downloads, "Updated on" (Breadfast, Namshi). The search page `https://play.google.com/store/search?q=<name>&c=apps&gl=SA` returns package ids but is fuzzy ("Batla perfume" → other perfume apps). | `play.google.com/robots.txt` does not disallow `/store/apps/details` (checked today). **Automate** details only when the package comes from the site's own link. Use search only as a candidate list, with the developer-website match. |
| LinkedIn guest jobs | `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?f_C=<companyId>&geoId=92000000&start=0` | none | **Works only with `geoId`**. `f_C` alone returns an empty 26-byte body. Almarai 10 cards, Breadfast 10 cards (Cairo), Technopanel 0. | `https://www.linkedin.com/robots.txt`: `Disallow: /jobs-guest/`, plus a notice that automated access without permission is prohibited (checked today). **Manual link** by default: `https://www.linkedin.com/jobs/search/?f_C=<id>&geoId=92000000`. The owner may opt in knowingly. The company id comes from the company page the social step already reads (`organization:77050735` for Technopanel). |
| Saudi Business Center e-store inquiry | `https://eauthenticate.saudibusiness.gov.sa/inquiry` (form; `certificate-details/<n>` redirects here) | none (automatic proof-of-work challenge, no human captcha) | **Works** in Playwright by certificate number → CR national number, store names | `robots.txt` returns the app page (no rules file). **Automate** 1 inquiry per KSA client, using the certificate number found on the site. Name/URL search is untested. |
| Maroof | `https://maroof.sa/` | — | HTTP 503 "unconditional drop overload" | Replaced by the SBC platform (MC news, see S39). **Do not use.** |
| ZATCA VAT lookup | `https://zatca.gov.sa/en/eServices/Pages/TaxpayerLookup.aspx` | none, but reCAPTCHA Enterprise | Page loads; captcha present | **Manual link** only |
| Ministry of Commerce CR data | `https://mc.gov.sa/ar/eservices/Pages/Commercial-data.aspx` | «رمز التحقق» captcha | Page loads in a browser; plain `fetch` fails (TLS) | **Manual link** only |
| Egypt ITDA registry inquiry | `http://itda.gov.eg/en/registry-inquiry-en.html` | flow shows Login/Payment steps | Page loads; search not run | **Manual link** (untested beyond the landing page) |
| Egypt ETA registered taxpayers | `https://eta.gov.eg/ar/registered` | — | **HTTP 403** from this PC | **Manual link**; may work from Egypt [unverified] |
| Egypt GAFI | `https://www.gafi.gov.eg/` | — | Home page loads; no public lookup tested | Not used |
| Wuzzuf (EG jobs) | `https://wuzzuf.net/search/jobs/?q=<name>` | none | Plain `fetch` 403 (Cloudflare); Playwright **works** but search is fuzzy ("breadfast" → "broadcast" results) | `robots.txt` carries `Content-Signal: search=yes,ai-train=no,use=reference`. **Manual link** (low reliability). |
| Bayt (GCC jobs) | `https://www.bayt.com/en/saudi-arabia/jobs/<company>-jobs/` | none | Plain `fetch` 403; Playwright **works** ("Almarai Jobs in Saudi Arabia 54 jobs found") | `robots.txt` disallows `/en/jobs/*-jobs/`. **Manual link.** |
| Jadarat (KSA national jobs) | `https://jadarat.sa/` | — | Redirected to a Queue-it waiting room | Not used |
| DNS (MX, TXT/SPF) | Node `dns.resolveMx`, `dns.resolveTxt` | none | **Works** (4 domains) | **Automate** |
| Wayback Machine CDX | `https://web.archive.org/cdx/search/cdx?url=<domain>&limit=1&output=json&fl=timestamp,original` | none | **Works** (Technopanel: 2007-04-15) | **Automate** |
| RDAP | `https://rdap.org/domain/<domain>` | none | **Works** for `.com`; `.com.sa` → 404 "No RDAP service" | **Automate** (gTLDs only) |
| Shopify store info | `https://<store>/meta.json`, `https://<store>/products.json?limit=250` | none | **Works** (Hayaa) | Undocumented, observed. `robots.txt` does not disallow them (checked). **Automate** `meta.json` only. |
| Salla storefront API | `GET https://api.salla.dev/store/v1/products?per_page=50` with `Store-Identifier: <id>` | none | **Works** (15 products, ratings per product) | Undocumented header, observed. **Automate**, ≤ 3 pages. |
| Zid loyalty status | `GET https://<store>/api/v1/loyalty-points/check-status` | none | **Works** | Observed. **Automate.** |
| WooCommerce Store API | `GET https://<site>/wp-json/wc/store/v1/products?per_page=1` → `X-WP-Total` | none (documented) | Route absent on breadfast.com (404) | **Automate when present**; fall back to the sitemap |
| WordPress REST index | `GET https://<site>/wp-json/` → `namespaces` | none | **Works** (Technopanel) | **Automate** |

---

## 8. Risks and open questions for the owner

1. **Approve or reject the 8 proposed problem types and the 2 internal-only types** (§5.2). The main choice is `inbound_not_systemised` vs widening `manual_lead_follow_up`.
2. **Thresholds and the local-payments table** (`rules/business-signals.json`) need owner values: rating threshold, minimum reviews, and which payment methods count as "expected" per market. Without them, `reviews_unmanaged` and `checkout_payment_gap` stay advisory.
3. **LinkedIn jobs:** keep the manual link (the robots.txt disallows it), or opt in to automatic use knowing the risk.
4. **Absence is weaker than presence** for tools: CRMs, WhatsApp API providers and payment methods shown only at checkout may be invisible. This is why the client slide shows only "present" for those items, and absence-based problems about tools need notes or team confirmation.
5. **Undocumented endpoints** (Shopify `meta.json`, the Salla storefront API, Zid loyalty status, the SBC inquiry form) can change. Each parser fails into `unknown` with a message, never into `absent`.
6. **Government lookups:** only the SBC inquiry is automated (no human captcha). ZATCA and MC CR stay manual on purpose.
7. **Personal data:** business identifiers shown publicly (CR, VAT, certificate) are stored in the client folder like other evidence. Phone numbers are used only for Maps matching. Business observations never leave the internal record.

---

## Appendix A: test log (throwaway scripts)

Folder: `C:\Users\jerom\AppData\Local\Temp\claude\business-layer\`. Raw captures are in `raw\*.json` (HTML, requests, text).

| Script | What it did | Key result |
|---|---|---|
| `capture.mjs` | Used the project's `collect/capture.js` (read-only import) on Batla (Salla), Aurum (Zid), Technopanel, Hayaa, Breadfast | All `ok`, HTTP 200 |
| `probe.mjs` | v1 regex signals on the captures | Found payments, SBC badge, VAT/CR, PDF, WhatsApp plugin. False positives: `valu`→"value", theme cart CSS, raw form counts |
| `probe2.mjs` | v2 platform-aware parsers | Salla settings (payments, loyalty off, VAT, CR, cert, single language); Zid icons; Shopify icons incl. `cash`; returns link on Hayaa; app links and careers on Breadfast; Maps link in Technopanel JSON-LD |
| `urls.mjs`, `urls2.mjs` | Public URL reachability (Shopify, Salla API, sitemaps, wp-json, SBC, Maroof, iTunes, Play, LinkedIn, Wayback, RDAP, Wuzzuf, Bayt, Jadarat, MC, Maps) | See §7 |
| `urls3.mjs` – `urls5.mjs` | LinkedIn company id + guest jobs variants; Salla product count; iTunes/Play matching | `f_C` alone empty; `f_C`+`geoId` works; Salla 15 products; Namshi matched by `sellerUrl` |
| `pw.mjs` – `pw4.mjs` | Playwright: SBC inquiry, Zid shipping-and-payment, Maps, Wuzzuf, Bayt | SBC → CR national number; Zid 6 payment / 1 delivery options + visible checkout-disabled banner; Maps 4.1 (92); Bayt 54 jobs; Wuzzuf fuzzy |
| `gov.mjs` | ETA, ITDA, ZATCA, MC, business.sa, GAFI | ETA 403; ITDA landing page; ZATCA reCAPTCHA; MC captcha |
| `zatca-dns.mjs` | DNS MX/TXT for 5 domains; ZATCA captcha check | MailerLite (Technopanel), Zendesk + Mailchimp + Microsoft 365 (Almarai), Google Workspace + Mailgun (Breadfast); no MX for Hayaa/Batla |
| `apps-maps.mjs`, `maps2.mjs` | iTunes lookup, Play details, Maps search → open candidates → match | Breadfast app stats; Hayaa 2 matched listings (incl. Giza branch via Facebook URL); Batla candidates correctly rejected |

## Appendix B: sources

- WooCommerce Store API (unauthenticated, `X-WP-Total`): https://developer.woocommerce.com/docs/apis/store-api/
- Apple iTunes Search API (base URL, `entity=software`, ~20 calls/min): https://performance-partners.apple.com/search-api
- Google Terms of Service (automated access vs robots.txt): https://policies.google.com/terms
- Google robots.txt (Maps allow rules): https://www.google.com/robots.txt
- LinkedIn robots.txt (`Disallow: /jobs-guest/`): https://www.linkedin.com/robots.txt, and the LinkedIn User Agreement: https://www.linkedin.com/legal/user-agreement
- Salla Twilight JS SDK overview (storefront; header not documented): https://docs.salla.dev/422610m0
- Saudi Business Center e-store inquiry: https://eauthenticate.saudibusiness.gov.sa/inquiry
- Ministry of Commerce: e-store authentication moved from Maroof to the Business Platform (search result; page not opened here): https://mc.gov.sa/ar/mediacenter/News/Pages/29-03-23-02.aspx
- ZATCA VAT registration verification: https://zatca.gov.sa/en/eServices/Pages/TaxpayerLookup.aspx
- Ministry of Commerce CR data inquiry: https://mc.gov.sa/ar/eservices/Pages/Commercial-data.aspx
- Egypt ITDA commercial registry inquiry: http://itda.gov.eg/en/registry-inquiry-en.html
- Egypt Tax Authority registered list: https://eta.gov.eg/ar/registered
- Wayback CDX server: https://web.archive.org/cdx/search/cdx (live-tested; documentation not opened [unverified])
- RDAP bootstrap service: https://rdap.org/ (live-tested)
