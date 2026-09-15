HOW TO USE THE AL-MARKETER PROPOSAL SYSTEM
==========================================

START  (restarted the computer, or want to test everything? see HOW-TO-START-AND-TEST.txt in the project folder)
  Double-click "Al-Marketer Control Center" on your Desktop (or the .cmd file in C:\dev\al-marketer-automation).
  The Control Center opens in your browser at http://localhost:4317.
  Keep the black window open while you work. Close it to stop. Nothing is online; it all runs on this PC.
  Work that was ready when you closed it continues on its own when you open it again.
  Light or dark: the switch at the bottom of the left menu (Light / Dark / System).

THE TWO SCREENS YOU USE
  Proposals (home)
    - The numbers strip: proposals, what needs you, what is working now, how many were sent.
    - "Needs you": every task waiting for a person, across all proposals, each with its own button.
    - The table: each client with its stage, what is happening now, its Claude usage and its "..." menu.
  A proposal
    - Top: what needs you right now, as cards with one button each. You never scroll to find it.
    - The stage line: Brief > Research > Competitors & social > Diagnosis > Scope & plan > Proposal > Delivery.
    - Right side: the activity log, newest line first.
    - Pages update by themselves while work runs; a thin moving bar shows a step that is working.

1. NEW PROPOSAL  (2 minutes)
  Click "New proposal".
  - Client name and the name on the cover.
  - Website: type it any way (example.com, www.example.com or the full address).
  - "Find profiles and logo": reads the website and lists the social pages and logo it links to. Tick what is
    right. You can skip it: the research looks for profiles anyway.
  - Market and industry are pick lists; competitors are rows (name, website, link); constraints are chips.
  - Meeting notes: type them, and/or attach the meeting report file (Word, PDF or text). Both are read, and
    every fact is checked against the file it came from.
  - Logo: automatic (found on the website, cleaned and put in a box next to the Al-Marketer logo on the cover),
    upload your own, or no logo.
  Click "Create and start research". You land on the Research stage.

2. RESEARCH  (automatic, several things at once)
  What runs by itself:
    - Website audit and meeting notes start together.
    - Then the client's social profiles, the business signals, the competitor search and the research teams.
    - "Ads, search & Maps checks" (no account needed): the brand's Facebook page in the Meta Ad Library, Brave
      Search for the brand name, the Google Maps listing linked to the website (rating, reviews, hours), the
      Google Ads Transparency Center, and which visible Facebook comments the page answered.
    - The business analyst: how the business sells, gets paid, answers enquiries and supports customers, and
      the business needs and risks this shows (for the team only; nothing is sold from these).
    - Then the client record is built from the verified facts.
  What needs you, as soon as it appears (the rest keeps running):
    - Competitors: choose "Compare" or "Not a competitor" for each suggestion; add any it missed.
    - Important questions: only if the research could not find something important. Answer, or type unknown.
  Optional checks (never hold anything up): only what the browser could not read by itself, for example
  whether Instagram comments are answered (Instagram hides replies from visitors who are not logged in).

3. COMPETITORS & SOCIAL  (automatic)
  The client's and confirmed competitors' profiles are read from public pages, without any login: LinkedIn,
  Facebook, X, Instagram, TikTok, Snapchat and YouTube. Each platform has several ways to read it; when one is
  refused the next is tried, and Apify is the last try if you added its free key.
  - A page that belongs to someone else (a different website in its bio) is flagged: "Correct the link".
  - A page that does not exist is marked as checked; a page without visible posts shows its followers only.
  - "Possible pages found for the client": pages the system found by itself. "Use this page" or "Not this".
  The scorecard compares posts per week, last post, interactions and followers over 90 days, graded by colour.

4. DIAGNOSIS  (you decide)
  Each problem shows its Arabic statement next to the evidence it cites and the independent reviewer's opinion.
  Confirm, Reject or Decide later; change the problem type (it decides the service, by rule) or the severity.
  "Business needs and risks (internal)" shows what the business analyst found, to prepare for the meeting.
  Choose the Arabic style, then "Approve diagnosis". The scope is built right away.

5. SCOPE & PLAN  (you decide)
  The rule engine shows the services and deliverables, the 3-month map, the first 4 weeks and the KPIs.
  Remove a service, choose month 1 or 2, or add something from the catalog with a reason. "Approve scope".

6. PROPOSAL  (you decide)
  The Arabic text is written, then the automated reviews and the slide design run at the same time.
  The last slide is a call to action with Al-Marketer's WhatsApp, email, website and a QR code.
  Change the proposal, after the PDF too:
    - "Ask the AI to change something": type what should change (Arabic or English). Only that changes.
    - "Edit slide text": every text on the slides as a field, next to the slide pictures.
    - "Rewrite the whole proposal with notes": a full rewrite; scope and timing stay.
    - Versions: every change is saved; "Restore" brings back an earlier one.
  Tick "I compared every statement…" and click "Approve proposal".

7. DELIVERY
  Download the approved PDF or web file, send it yourself, then "Mark as sent".
  - Internal strategy report (English, for the team only): made after approval. "Open the report".
  - "What this proposal cost in Claude usage": measured from each Claude run of this proposal (not an estimate).
    On the Max plan it is the value of the usage, not a bill.

ARCHIVE AND DELETE
  Every proposal has Archive and Delete buttons at the top of its own page, and in the "..." menu on its row in
  Proposals.
  - Archive: out of the list, nothing more runs, all files kept. Find it under "Archived": download, Restore
    or Delete.
  - Delete permanently: removes the proposal and all its files from this computer, after you confirm.
  A new proposal for the same customer always starts fresh.

SETTINGS & KEYS  (left menu)
  All keys are free and optional; every proposal works without them. Paste a key, "Save keys", "Test".
  - PAGESPEED_API_KEY (recommended): Google speed / SEO scores.
  - YOUTUBE_API_KEY: exact YouTube numbers (without it YouTube is still read, slower).
  - APIFY_TOKEN: last try for a social page nothing else could read; free plan only, capped per proposal.
  - NOTION_TOKEN: only for "Update from Notion" on the Catalog page.
  Each key has "How to get it" steps on the page. Keys stay in .env.local on this computer.
  "Import from API-KEYS.txt" copies the keys from that file if you keep one.
  The page also shows the Claude model of each step, the tools on this computer and the agency contacts.

CATALOG & RULES
  Edit services, offerings and deliverables in Notion, then "Update from Notion". Or edit the CSV files in
  catalog\csv and click "Import edited CSV files". Bad data is refused and the old catalog stays.

WHEN SOMETHING GOES WRONG
  - A step failed or was interrupted: it appears on top with "Try again". Only that step runs again.
  - "Claude could not run": log in to Claude Code (Terminal: claude, then /login) and click "Check again".
  - A Claude step that fails twice tries once more on its fallback model (Settings > Claude model for each step).
  - You hit your Claude usage limit: wait for it to reset, then click "Try again".
  - A profile could not be read: platforms sometimes refuse for a while. Try again later or type the numbers.

WHAT USES CLAUDE (your Max plan)
  Meeting notes (Haiku; Sonnet for reports) · Research teams ×3 (Sonnet) · Competitor search (Sonnet) ·
  Business analyst (Sonnet) · Diagnosis (Opus) · Independent review (Sonnet) · Writing (Opus) ·
  Language review (Sonnet) · AI edits (Sonnet) · Internal report (Opus). Fable is never used.
  Everything else is free local code: the website audit, ads/search/Maps checks, business signals, social
  numbers, scope, plan and slides. Running a step again uses Claude again.
