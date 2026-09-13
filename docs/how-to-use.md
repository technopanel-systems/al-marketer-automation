HOW TO USE THE AL-MARKETER PROPOSAL SYSTEM
==========================================

START
  Double-click "Al-Marketer Control Center" on your Desktop (or the .cmd file in C:\dev\al-marketer-automation).
  A window opens and the Control Center opens in your browser at http://localhost:4317.
  Keep the black window open while you work. Close it to stop. Nothing is online — it all runs on this PC.

1. NEW CLIENT  (2 minutes)
  Click "+ New client". Fill in: client name, website, social links, market, known constraints,
  and paste your meeting notes. Click "Create & start research".
  The system now works alone: it opens the website and social pages, saves screenshots and text as
  evidence, checks speed / SEO / pixels / store platform, and three AI researchers build the
  Client Information Record. Every fact must quote the saved evidence — the system checks the quotes.

2. QUESTIONS  (only if something important is unknown)
  If the status says "Needs deeper research / your input", open the Questions tab.
  Answer, or type "unknown". There are also optional manual checks with links
  (Meta Ad Library, Google search, Google Maps, social activity) — open, look, record what you saw.
  Click "Save & continue".

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

OPTIONAL: GOOGLE PAGESPEED KEY
  Speed scores from Google often fail without a key (Google answers "too many requests").
  A free key: Google Cloud console → enable "PageSpeed Insights API" → Credentials → Create API key.
  Double-click setup-pagespeed-key.cmd and paste it. Without a key the system still measures load time itself.

WHAT USES CLAUDE (your Max plan)
  Notes (Haiku) · Research ×3 (Sonnet) · Diagnosis (Opus) · Review (Sonnet) · Writing (Opus) ·
  Language review (Sonnet). Everything else is free local code. Re-running a step uses Claude again.
  Measured: about 9–12 Claude calls and 10–15 minutes per proposal; "Ask for changes" = 2 more calls (~3 min).
