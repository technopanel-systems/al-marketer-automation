HOW TO USE THE AL-MARKETER PROPOSAL SYSTEM
==========================================

START
  Double-click "Al-Marketer Control Center" on your Desktop (or the .cmd file in C:\dev\al-marketer-automation).
  A window opens and the Control Center opens in your browser at http://localhost:4317.
  Keep the black window open while you work. Close it to stop. Nothing is online — it all runs on this PC.

1. NEW CLIENT  (2 minutes)
  Click "+ New client". Fill in: client name, website, social links, market, industry, competitors you
  already know (one per line: name, website, profile links), known constraints, and paste your meeting
  notes. Click "Create & start research".
  The system now works alone: it opens the website and social pages, saves screenshots and text as
  evidence, checks speed / SEO / pixels / store platform, and three AI researchers build the
  Client Information Record. Every fact must quote the saved evidence — the system checks the quotes.

2. QUESTIONS  (only if something important is unknown)
  If the status says "Needs deeper research / your input", open the Questions tab.
  Answer, or type "unknown". There are also optional manual checks with links
  (Meta Ad Library, Google search, Google Maps, social activity) — open, look, record what you saw.
  Click "Save & continue".

2b. SOCIAL MEDIA AUDIT  (Social media tab — about 15–30 minutes per client)
  The client and its competitors are compared on the same numbers: posts per week over the last
  90 days, days since the last post, formats, interactions per post, followers. Code computes every
  number; the diagnosis can only quote them, and the proposal gets a "digital presence" slide.
  a) Competitors. The AI suggests up to 4 (with a reason). For each one choose "Compare with this
     competitor" or "Not a competitor", fix the name/website/profile links if needed, and add any
     the AI missed. Click "Save competitors". Their websites are searched for profile links.
     Set the industry — it picks the reference ranges shown next to the numbers.
  b) Capture the profiles. One row per brand per platform:
     - TikTok and YouTube are read automatically (no login). If it fails, click "Try automatic again".
     - Instagram is automatic only with the Meta key (API-KEYS.txt, B4); otherwise use the research browser.
     - LinkedIn, Facebook, X: click "Capture in research browser". A separate Chrome window opens with an
       Al-Marketer panel. The first time, log in with the agency's research account (never a personal
       one). Scroll the profile's posts at a normal pace until the panel says 3 months are covered,
       then press "Done — save". Nothing is liked, followed or posted.
     - "Type numbers" is always there: type what you see (followers + each post's date, likes, comments).
       Also use it to check automatic numbers — saved numbers are marked "reviewed".
     - "Not on this platform" is a finding too (the brand has no account). "Skip" leaves it out.
  c) The scorecard at the bottom updates by itself. The pipeline continues when no row is waiting.
  Running the audit on a client whose diagnosis was already approved makes the diagnosis out of date
  on purpose: re-run it so the new evidence is used, then approve Gate 1 again.

3. GATE 1 — DIAGNOSIS  (you decide)
  The AI diagnosed problems, each with evidence quotes and an independent reviewer's opinion.
  For each problem: Confirm or Reject. You can change the problem type and severity —
  the problem type is what decides the service (by rule, not by AI).
  Did the AI miss something you know from the meeting? Open "Add a problem the AI missed", pick the
  problem type and write how you know (your note becomes evidence).
  Choose the Arabic style (Egyptian by default). Click "Approve diagnosis".

4. GATE 2 — SCOPE  (you decide)
  The rule engine shows the services/offerings, deliverables, the 3-month map, the first 4 weeks
  and the KPIs — all from your catalog and rules, no AI.
  - The 3 strategic services are in every contract.
  - Services with low capability (0–1 or blank) are listed under "Needed but excluded": tick to opt in.
  - You can remove a service, force month 1 or month 2, or add something from the catalog (with a reason).
  Click "Save & recalculate" to see the effect, then "Approve scope".

5. GATE 3 — PROPOSAL  (you decide)
  The AI writes the Arabic text, automated reviews check it (numbers, guarantees, names, evidence,
  language), and the slides are designed. Open the web version or the PDF, look at the slide previews
  and the reviews.
  - Not happy? Write what to change under "Ask for changes" — it rewrites and redesigns.
    "Use the language reviewer's suggestions" fills the box with the reviewer's notes; edit, then send.
  - Small text fix? "Edit the text directly".
  - Fact check (before approving): every statement about the client is listed next to the evidence it cites.
    The automated reviews only confirm the evidence exists — you compare the meaning. Rows marked
    "need a closer look" have a number that isn't in their evidence, or evidence that shares few words.
    Tick "I compared every fact…" to enable approval.
  - Approve stays disabled while the automated reviews have errors, the slides have layout problems
    (the page names the slide), or the reviews/design are still running or out of date.
  - Happy? "Approve proposal". The final PDF and web file are saved with a version number.
  Download them, send them to the client yourself, then click "Mark as sent".

CATALOG (services, offerings, deliverables)
  Edit in Notion ("Al-Marketer — Service Catalog" page), then in the Control Center:
  Catalog & rules → "Update from Notion". Or edit the CSV files in catalog\csv (Excel / Google Sheets)
  and click "Import edited CSV files". Bad data is refused and the old catalog stays.
  Arabic names and the extra columns (stage, dependencies, fixed/conditional) live in the local catalog;
  "Update from Notion" only brings in names, descriptions, capability scores and new items.

WHEN SOMETHING GOES WRONG
  - A step says Failed: click "Try again" on the Overview page.
  - A website blocks the browser: the step still finishes; answer the manual checks instead.
  - "Waiting for AI answer": Claude Code could not run in the background. Open Claude Code in this
    folder and type /run-step — it answers the saved request and continues.
  - You hit your Claude usage limit: wait for it to reset, then click "Continue". Nothing is lost;
    finished steps are never repeated.

KEYS (all free, all optional except the Claude login)
  Open API-KEYS.txt in this folder: each key has step-by-step instructions. Paste the keys, save, then
  double-click apply-api-keys.cmd and restart the Control Center.
  - PAGESPEED_API_KEY: Google speed / SEO scores (without it the system measures load time itself).
  - YOUTUBE_API_KEY: exact YouTube numbers (without it YouTube is still read, slower).
  - META_ACCESS_TOKEN + IG_BUSINESS_ACCOUNT_ID: reads competitors' Instagram automatically (renew every 60 days).
  - NOTION_TOKEN: only for "Update from Notion".

WHAT USES CLAUDE (your Max plan)
  Notes (Haiku) · Research ×3 (Sonnet) · Competitor search (Sonnet, web search) · Diagnosis (Opus) ·
  Review (Sonnet) · Writing (Opus) · Language review (Sonnet). The social media numbers use no AI. Everything else is free local code. Re-running a step uses Claude again.
  Measured: about 9–12 Claude calls and 10–15 minutes per proposal; "Ask for changes" = 2 more calls (~3 min).
