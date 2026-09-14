# Fallback LLM research: can a free-tier non-Claude model ever touch client data?

Date of research: 2026-09-14. All retrieval dates below are 2026-09-14 unless noted.

Context: the pipeline currently runs entirely on one operator's Claude Max (consumer) subscription
via headless `claude -p` calls (Haiku for extraction, Sonnet for research/review, Opus for
diagnosis/writing). Every step's input includes confidential prospective-client data (business
details, scraped website/social text, and problems diagnosed from that data). Question: could any
free-tier product-side LLM ever be a safe fallback if Claude is unavailable or over quota — decided
by data-usage terms, not capability or price.

---

## 1. Google Gemini API — free tier

### Rate limits (free tier), as reported now

Google's own limits page is the canonical source but was not directly quoted here (aggregator
consensus only) — treat the exact numbers as **[reasonably confirmed via multiple secondary
aggregators, not the primary Google limits page]**:

- Gemini Flash: ~15 RPM (requests/minute), ~1,500 RPD (requests/day), plus a TPM (tokens/minute) cap.
- Flash-Lite: somewhat higher RPM than Flash.
- Gemini 2.5 Pro: ~5 RPM, ~25 RPD on the free tier (several sources note Pro was pulled from the
  free tier entirely in April 2026, i.e. now paid-only, with conflicting reports of a residual
  limited free quota).

Sources (secondary, retrieved 2026-09-14): [Gemini API Free Tier Rate Limits 2026: RPM, TPM & RPD by Model](https://aipromptshub.co/blog/gemini-api-free-tier-rate-limits), [Gemini API Rate Limits: Free Tier Quotas 2026](https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/). **Action item: verify exact current numbers against the primary page at https://ai.google.dev/gemini-api/docs/rate-limits before relying on them operationally** — this was not independently re-fetched in this pass.

### Data-usage terms — THE decisive finding

Primary source, fetched directly: **Gemini API Additional Terms of Service**,
https://ai.google.dev/gemini-api/terms (retrieved 2026-09-14).

**Unpaid Services (this includes Google AI Studio and the free/unpaid quota of the Gemini API)** —
section "How Google Uses Your Data" under "Unpaid Services":

> "Google uses the content you submit to the Services and any generated responses to provide,
> improve, and develop Google products and services and machine learning technologies."

Human review, same section:

> "human reviewers may read, annotate, and process your API input and output ... This includes
> disconnecting this data from your Google Account, API key, and Cloud project before reviewers
> see or annotate it."

(De-identification before human review does not change the fact that human reviewers do read raw
client business data — names, problems, confidential notes — before any disconnection step, and
disconnection from the account is not the same as the content not being read.)

**Paid Services — the opposite policy**, section "How Google Uses Your Data" under "Paid Services":

> "Google doesn't use your prompts (including associated system instructions, cached content, and
> files such as images, videos, or documents) or responses to improve our products."

**EEA/UK/Switzerland carve-out** — the free tier gets the paid-tier's protection only in those
jurisdictions:

> "If you're in the European Economic Area, Switzerland, or the United Kingdom, the terms under
> 'How Google uses Your Data' in 'Paid Services' apply to all Services, including Google AI Studio
> and unpaid quota in the Gemini API, even though they are offered free of charge."

**Conclusion for this project**: Google's own current terms confirm the free tier is explicitly a
training/human-review surface, and the paid tier is not. This is a deliberate, stated split, not a
blog inference. Confirmed as of 2026-09-14 at the URL above.

---

## 2. Alternatives with a genuine no-training / zero-retention commitment

### Groq (GroqCloud) — strongest primary-source commitment found

Primary source, fetched directly: **Groq Services Agreement**, section 4.2 ("Inputs and Outputs"),
https://console.groq.com/docs/legal/services-agreement (retrieved 2026-09-14).

> "For the avoidance of any doubt and to the extent permitted by applicable law, Groq is not
> permitted to use Inputs or Outputs for training or fine-tuning any AI Model Services or other
> models, unless explicitly granted permission or instructed by Customer."

Default access/retention, same section:

> Groq does not access, use, store, or retain Inputs or Outputs except as necessary to provide the
> Cloud Services, in accordance with the Customer's permission or instruction, comply with
> applicable law, ensure the reliable operation of the Cloud Services, or confirm Customer's
> compliance with the AUP.

Zero Data Retention toggle, same section, and corroborated on
https://console.groq.com/docs/your-data (retrieved 2026-09-14):

> "Eligible Customers may enable Groq's zero data retention setting in the Console to prevent
> access by Groq to Inputs and Outputs..." / "All customers may enable Zero Data Retention (ZDR) in
> Data Controls settings."

Notes/caveats found in secondary sources (retrieved 2026-09-14, e.g. [Groq Data Retention (2026)](https://humla.team/blog/groq-data-retention-policy), [Your Data in GroqCloud](https://console.groq.com/docs/your-data)):
Groq may temporarily log Inputs/Outputs (up to ~30 days) specifically for abuse investigation or
reliability troubleshooting even without ZDR on, and law can require longer retention. This is a
narrow operational exception, not a training exception — the no-training clause has no such carve-out.

**This is the one provider found whose contract states no-training as a default rule (not merely a
paid-tier marketing claim), self-serve ZDR "for every/all customers" (i.e., not gated behind an
enterprise sales tier the way Anthropic's and Mistral's ZDR are), and it hosts open-weight models
(Llama, Qwen, etc.) at low/no cost. This makes Groq the most plausible fallback candidate on
data-usage grounds — capability/quality of the specific hosted model still needs separate
evaluation, which was out of scope here.**

### Mistral (La Plateforme) — genuine ZDR exists, but gated to a paid plan, and the free tier looks worse than Gemini's

Primary source, fetched directly: **Zero Data Retention**, https://docs.mistral.ai/admin/monitor-comply/zero-data-retention (retrieved 2026-09-14):

> "When ZDR is enabled, Mistral does not store or log inputs and outputs for supported API requests
> longer than required to generate the output." / "ZDR is available on paid plans for supported
> stateless API calls" (chat completions, embeddings, moderation, OCR, audio only — not agents,
> batch, conversations, libraries, or Le Chat).

Default retention off ZDR, corroborated by secondary sources of the same page (retrieved
2026-09-14, [Mistral La Plateforme Data Retention Policy 2026](https://meetily.ai/llm-privacy/mistral)): inputs/outputs are kept for the time needed to generate the response, then for a rolling
30 days for abuse monitoring, then deleted — unless ZDR is on.

**Free tier ("Experiment" plan) training default — could not get a direct primary-source quote in
this pass** (the specific help-center article fetched, https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training, retrieved 2026-09-14, returned
text about Mistral's "Vibe"/consumer chat product's opt-out defaults and confirmed that "API
customers retain full control over this processing and have the right to opt out at any time," but
did not surface an explicit sentence naming the free/Experiment tier specifically). Multiple
independent secondary sources converge on the same claim: **the free Experiment tier has API
inputs/outputs entering Mistral's training programs by default, requiring a manual opt-out in the
Admin Console privacy settings**, while paid tiers are opted out by default. Sources (secondary,
retrieved 2026-09-14): [Mistral AI Free API Tier: Experiment plan](https://yangmao.ai/en/deals/mistral-free-api-tier/), [Mistral La Plateforme Data Retention Policy 2026](https://meetily.ai/llm-privacy/mistral). **This claim is marked [reasonably confirmed, not primary-quoted] rather than fully verified — re-check the Admin Console privacy toggle copy directly before relying on it.**

**Conclusion**: Mistral's genuinely safe mode (ZDR) requires the paid Scale plan, same structural
pattern as Anthropic — free tier is not safe. Not recommended as a free-tier fallback; only useful
if the project is ever willing to pay for the Scale plan specifically for this reason.

---

## 3. Baseline: Anthropic's own terms (what the fallback is being compared against)

This project's headless calls run on **Claude Max — a consumer plan**, not the Commercial/API
default. That distinction matters and is easy to get backwards.

### Commercial Terms of Service / API (Team, Enterprise, pay-as-you-go API keys)

Primary source, fetched directly: **API and data retention**,
https://platform.claude.com/docs/en/manage-claude/api-and-data-retention (retrieved 2026-09-14):

> "Retained data is never used for model training without your express permission."

Standard (non-ZDR) retention for the Claude API is 30 days; conversation content is "not retained
by default" except for a short list of "Covered Models" (Claude Fable 5/5.1, Mythos 5/5.1) which
require 30-day retention. Zero Data Retention (ZDR) is available but is **not self-serve** — "To
request ZDR for your organization, contact the Anthropic sales team," enabled per-organization by
the account team, and does not cover Claude Console, Claude Managed Agents, or consumer products.

Claude Code specifically is ZDR-eligible only (a) with API keys from a **Commercial** organization,
or (b) through Claude Enterprise with ZDR turned on — **consumer Free/Pro/Max plans are explicitly
excluded** from ZDR ("Claude consumer products: Claude Free, Pro, and Max plans, including when
customers on those plans use Claude's web, desktop, or mobile apps or Claude Code.").

### Consumer terms (Free, Pro, Max) — what this project is actually running on today

Primary source, fetched directly: **Claude Code data usage**, https://code.claude.com/docs/en/data-usage (retrieved 2026-09-14):

> "Consumer users (Free, Pro, and Max plans): We give you the choice to allow your data to be used
> to improve future Claude models. We will train new models using data from Free, Pro, and Max
> accounts when this setting is on (including when you use Claude Code from these accounts)."

> "Commercial users: (Team and Enterprise plans, API, 3rd-party platforms, and Claude Gov) maintain
> existing policies: Anthropic does not train generative models using code or prompts sent to
> Claude Code under commercial terms, unless the customer has chosen to provide their data to us
> for model improvement."

Retention mirrors the choice: 5 years if "Help improve Claude" is on, 30 days if off (same page,
"Data retention" section). This setting is changeable any time at
`claude.ai/settings/data-privacy-controls`.

Corroborating secondary source on the opt-in/opt-out rollout timeline (retrieved 2026-09-14):
[Updates to Consumer Terms and Privacy Policy](https://www.anthropic.com/news/updates-to-our-consumer-terms) — existing users had until 2025-09-28 to opt out of training; new signups choose at
onboarding.

**Operational implication, not a hypothetical**: this project's own baseline safety currently
depends on the operator's own "Help improve Claude" toggle being OFF in their Claude Max account
settings. Under the Commercial/API terms, no-training is the default and requires opting in to a
program to change it; under the *consumer* Max plan this project is actually built on, the toggle
is bidirectional and per-user, and Anthropic explicitly *will* train on this data if the toggle is
on. **This should be verified/documented as an operational control (screenshot / check the setting)
alongside this research, since it is the actual baseline, not the Commercial default many people
assume "Claude" means.**

---

## 4. Recommendation, reasoned from the terms above

Pipeline steps in question:
- (a) meeting-notes fact extraction (Haiku)
- (b) research team analysis of scraped public website/social text (Sonnet)
- (c) problem diagnosis from business data (Opus)
- (d) independent review of a diagnosis (Sonnet/Opus)
- (e) final Arabic proposal writing (Opus)
- (f) language-quality review of the writing (Sonnet)

**Gemini free tier: 0 of 6 steps, ever.** Google's own Additional Terms of Service confirm the free
tier is a training and human-review surface by design (Section "Unpaid Services" → "How Google Uses
Your Data", quoted above, https://ai.google.dev/gemini-api/terms, retrieved 2026-09-14). Every one
of the six steps' *input* is either directly confidential (client name, notes, diagnosed problems)
or becomes confidential the moment it's combined with the client's identity/context in the prompt
(even step (b), which sources from public text, is being analyzed together with which client it
belongs to and why — see below). There is no step where "human reviewers may read... your API
input and output" is an acceptable risk for this product's constitutional confidentiality
requirement.

**Per-step reasoning:**

- **(a) meeting-notes fact extraction — never leaves Claude.** This is the most sensitive raw input
  in the whole pipeline: verbatim notes from a confidential client meeting, often containing
  budget, personnel, and competitive information the client said in confidence. Zero ambiguity.

- **(b) research team analysis of scraped public website/social text — the *text itself* is
  public, but the request is not.** The prompt necessarily says "analyze this website/social
  content *for prospective client X, in order to sell them Y*." That framing — which client is
  being targeted, that Al-Marketer is preparing a commercial proposal for them, and (once combined
  across steps) the angle of analysis — is itself confidential business information about
  Al-Marketer's pipeline and sales targets, even though the underlying scraped sentences are
  public. Additionally, in practice this step will very often include some non-public context
  (meeting notes summaries, prior findings) attached to ground the analysis. Given a free provider
  trains on it and has human reviewers, this step should also stay on Claude — the "already public"
  argument only covers the scraped text in isolation, not the request that reveals a client
  relationship and commercial intent, which no free tier's terms protect. If this step is ever
  isolated to *pure* public-text summarization with the client's identity and Al-Marketer's
  involvement fully stripped out (e.g., "summarize this webpage" with no naming, no other context),
  that narrower task could in principle tolerate more exposure — but that is not how the pipeline
  is described, and enforcing that isolation reliably in code is itself a real engineering task, not
  a one-line change. Recommend leaving this on Claude unless/until that isolation is deliberately built.

- **(c) problem diagnosis from business data — never leaves Claude, no exceptions.** This is
  explicitly the client's actual diagnosed business problems and constraints, which is exactly the
  kind of content the constitutional confidentiality requirement exists to protect, and exactly the
  kind of content Google's terms say human reviewers "may read, annotate, and process" on the free
  tier. Non-negotiable.

- **(d) independent review of a diagnosis — never leaves Claude.** By definition this step's input
  *is* the diagnosis from (c) plus the evidence behind it. Same sensitivity, no reduction.

- **(e) final Arabic proposal writing — never leaves Claude.** Highest-sensitivity step: it
  synthesizes the client's name, diagnosed problems, and the exact commercial scope/pricing being
  proposed to them into one document. This is the single most complete exposure of confidential
  client + business data in the entire pipeline.

- **(f) language-quality review of the writing — never leaves Claude.** Its input is the (e) output
  verbatim — same content, same exposure, only the review lens changes.

**Bottom line: 0 of the 6 steps can safely route through the Gemini free tier, or any provider
without a demonstrated no-training/no-retention *default*, under the current design.** All six
process confidential client data either directly or through unavoidable context (client identity +
commercial intent), and the project's own constitutional rule 5 ("Zero new paid software") already
forecloses simply paying for Gemini's paid tier or Mistral's Scale plan as a workaround — those
would be new paid software, which the constitution forbids, and even if that rule were waived, the
consumer-plan analysis above shows the operator would still need to check their own Claude Max
training toggle first, since that (not a hypothetical fallback) is the actual current exposure.

**If a free/no-added-cost fallback is ever truly required (quota outage), the only candidate found
with a genuine, primary-sourced, non-training-by-default contractual term that is not gated behind
an enterprise sales relationship is Groq** (Services Agreement §4.2: "Groq is not permitted to use
Inputs or Outputs for training or fine-tuning... unless explicitly granted permission," plus
self-serve ZDR "for every/all customers"). Even so, recommend treating this as a "break glass"
option only — not a routine fallback — and only for the *least sensitive slice* of the pipeline. Of
the six steps, none is actually low-sensitivity per the reasoning above, so **the practical
recommendation is: build retry/backoff and a queue for when Claude is over quota, rather than a
cross-provider fallback for any of these six steps.** A free/cheap provider could reasonably be
considered later only for a genuinely new, isolated task that contains no client-identifying
information and no commercial intent (e.g., a generic Arabic grammar-only linter fed fabricated
placeholder text) — none of the current six steps qualify as designed.

---

## Sources index (all retrieved 2026-09-14)

- Google Gemini API Additional Terms of Service (primary): https://ai.google.dev/gemini-api/terms
- Gemini free tier rate limits (secondary aggregators, primary page not re-verified this pass):
  https://aipromptshub.co/blog/gemini-api-free-tier-rate-limits ,
  https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/
- Groq Services Agreement (primary): https://console.groq.com/docs/legal/services-agreement
- Groq "Your Data in GroqCloud" (primary): https://console.groq.com/docs/your-data
- Mistral Zero Data Retention docs (primary): https://docs.mistral.ai/admin/monitor-comply/zero-data-retention
- Mistral Help Center, opt-out of training article (primary, partial quote obtained):
  https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training
- Mistral free-tier training-default claim (secondary, not primary-quoted):
  https://yangmao.ai/en/deals/mistral-free-api-tier/ , https://meetily.ai/llm-privacy/mistral
- Anthropic "API and data retention" (primary): https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Anthropic "Claude Code data usage" (primary): https://code.claude.com/docs/en/data-usage
- Anthropic "Updates to Consumer Terms and Privacy Policy" (primary/announcement, secondary corroboration of dates): https://www.anthropic.com/news/updates-to-our-consumer-terms
