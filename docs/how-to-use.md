HOW TO USE THE AL-MARKETER PROPOSAL SYSTEM
==========================================

START  (restarted the computer, or want to test everything? see HOW-TO-START-AND-TEST.txt in the project folder)
  Double-click "Al-Marketer Control Center" on your Desktop (or the .cmd file in C:\dev\al-marketer-automation).
  The Control Center opens in your browser at http://localhost:4317.
  Keep the black window open while you work. Close it to stop. Nothing is online; it all runs on this PC.
  Work that was ready when you closed it continues on its own when you open it again.

THE TWO SCREENS YOU USE
  Proposals (home)
    - "Needs you": every task waiting for a person, across all proposals, each with its own button
      (for example "Confirm competitors", "Review diagnosis", "Try again").
    - "All proposals": each client with a 7-part progress bar and what is happening now.
  A proposal
    - Top right: the one next move for this proposal, as a button.
    - The stage line: Brief > Research > Competitors & social > Diagnosis > Scope & plan > Proposal > Delivery.
      Each stage shows Done, Working, Needs you, Ready or Not started. Click a stage to open it.
    - Right side: "Needs you" for this proposal, and the live activity log.
    - Pages update by themselves while work runs. If you are typing, a "Refresh" bar appears instead.

1. NEW PROPOSAL  (2 minutes)
  Click "New proposal". Fill in the client name, cover name, who it is presented to, website, social links,
  market, industry, competitors you already know, known constraints, and your meeting notes.
  Click "Create and start research". You land on the Research stage and can watch it work.

2. RESEARCH  (automatic, several things at once)
  What runs by itself, at the same time where possible:
    - Website audit and meeting notes start together.
    - Then client social profiles, competitor search and the research teams run side by side.
    - Then the client record is built from the verified facts.
  What needs you, as soon as it appears (the rest keeps running):
    - Competitors: the AI suggests direct competitors with a reason. For each, choose "Compare" or
      "Not a competitor"; fix names or links under "Edit"; add any it missed. Click "Save decisions".
      Only competitors you mark "Compare" are captured. You can also "Skip competitor comparison".
    - Important questions: only if the research could not find something important. Answer, or type unknown.
  Optional (never holds anything up): readiness answers and manual checks, under "Optional answers".
  "What the research found" summarises the facts; "All evidence" shows screenshots, sources and checks.

3. COMPETITORS & SOCIAL  (automatic)
  The client's and confirmed competitors' profiles are read from public pages, without any login:
  LinkedIn company pages, Facebook pages, X, Instagram, TikTok and YouTube. The scorecard compares posts
  per week, last post, interactions and followers over 90 days, next to industry reference ranges.
  If a profile could not be read, the stage says "Needs you": click "Try again" later, or "Review numbers" /
  "Type numbers" to type what you see, or "More" > "Not on this platform" / "Skip this profile".
  If the brand runs more than one account on a platform (for example two LinkedIn pages), a warning shows it
  and it becomes evidence for the diagnosis.

4. DIAGNOSIS  (you decide)
  Each problem shows its Arabic statement next to the evidence it cites and the independent reviewer's opinion.
  For each problem choose Confirm, Reject or Decide later. You can change the problem type (it decides the
  service, by rule, not by AI) and the severity, edit the wording, or add a note.
  "Add a problem the AI missed" needs a note saying how you know.
  Choose the Arabic style, then "Approve diagnosis". The scope is built right away.

5. SCOPE & PLAN  (you decide)
  The rule engine shows the services and deliverables, the 3-month map, the first 4 weeks and the KPIs,
  all from your catalog and rules.
  - The 3 strategic services are in every contract.
  - "Needed but left out": low-capability services; tick to include.
  - You can remove a service, choose month 1 or month 2, or add something from the catalog with a reason.
  "Save and recalculate" shows the effect; "Approve scope" starts writing the proposal.

6. PROPOSAL  (you decide)
  The Arabic text is written, then the automated reviews and the slide design run at the same time.
  - Slides: click the thumbnails (or use the arrow keys) and open the web version or PDF.
  - The proposal includes, built by code: an executive summary after the cover, a website and tracking audit
    (when the website was reachable), the digital presence comparison, and next steps at the end.
  - Automated reviews: layout, fonts, content, scope, numbers, names, guarantees, language.
  - Fact check: every statement about the client next to its evidence; "needs a closer look" items first.
  - Not happy? "Ask for changes" (the text is rewritten, reviewed and redesigned; scope and timing stay).
    Small fix? "Edit the text directly".
  - Tick "I compared every statement…" and click "Approve proposal". Approval is blocked while reviews fail,
    slides have layout problems, or anything is out of date. Final files are saved with a version number.

7. DELIVERY
  Download the approved PDF or web file, send it yourself, then "Mark as sent" (with an optional note).

CATALOG & RULES
  Edit services, offerings and deliverables in Notion, then "Update from Notion". Or edit the CSV files in
  catalog\csv and click "Import edited CSV files". Bad data is refused and the old catalog stays.

WHEN SOMETHING GOES WRONG
  - A step failed or was interrupted (the app or computer closed while it ran): it appears under "Needs you"
    with "Try again". Only that step runs again; everything finished stays.
  - "Claude could not run": log in to Claude Code (Terminal: claude, then /exit) and click "Check again".
    Or open Claude Code in this folder and type /run-step to answer the saved request by hand.
  - You hit your Claude usage limit: wait for it to reset, then click "Try again".
  - A profile could not be read: platforms sometimes refuse for a while. Try again later or type the numbers.
  - Advanced: each stage has a "Progress" list where any step can be run again.

KEYS (all free, all optional except the Claude login)
  Open API-KEYS.txt in this folder: each key has step-by-step instructions. Paste the keys, save, then
  double-click apply-api-keys.cmd and restart the Control Center.
  - PAGESPEED_API_KEY: Google speed / SEO scores (without it the system measures load time itself).
  - YOUTUBE_API_KEY: exact YouTube numbers (without it YouTube is still read, slower).
  - META_ACCESS_TOKEN + IG_BUSINESS_ACCOUNT_ID: adds Instagram comment counts (renew every 60 days).
  - NOTION_TOKEN: only for "Update from Notion".

WHAT USES CLAUDE (your Max plan)
  Meeting notes (Haiku) · Research teams ×3 (Sonnet) · Competitor search (Sonnet, web search) ·
  Diagnosis (Opus) · Independent review (Sonnet) · Writing (Opus) · Language review (Sonnet).
  At most 2 Claude steps run at the same time. Everything else is free local code, including the social media
  numbers, the scope, the plan, the website audit and the slides. Running a step again uses Claude again.
