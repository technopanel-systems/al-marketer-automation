# Claude Code fact-check re-verification — 2026-09-14

Source document checked: `docs/research.md` section A1 (written 2026-09-13).
Local install checked against: `claude --version` → **2.1.270** (same version research.md cites).
Method: WebFetch of current `code.claude.com/docs/en/*` pages, GitHub REST API (`api.github.com`) for issue status/comments (gh CLI not available in this environment), and direct `claude --help` / `claude -p --help` output from the locally installed binary.

---

## Row-by-row

### 1. Headless `claude -p`
**UNCHANGED.** Confirmed on https://code.claude.com/docs/en/headless (retrieved 2026-09-14):
- `-p`/`--print` runs non-interactively.
- `--output-format json` gives structured JSON; with `--json-schema` the schema-shaped result lands in `structured_output`, metadata (session id, usage) alongside it.
- JSON includes `total_cost_usd` plus a **per-model cost breakdown**; docs explicitly flag both as **client-side estimates that can differ from your actual bill** (this nuance wasn't in the original row — worth noting, not a change to the fact itself).
- `--permission-mode dontAsk` exists and behaves as described: denies everything that would otherwise prompt, while still allowing read-only ops and anything covered by `--allowedTools`/`permissions.allow`.
- Skills work in `-p` via `/skill-name` in the prompt string — confirmed verbatim, plus a detail not in the original row: `/model`, `/effort`, `/fast`, `/color`, `/rename` and `/config key=value` are also usable inline as of v2.1.205+.
Source: https://code.claude.com/docs/en/headless (retrieved 2026-09-14); local `claude -p --help` (v2.1.270, observed 2026-09-14).

### 2. `--bare` mode
**UNCHANGED — still not the default, still API-key-only.** Current docs (retrieved 2026-09-14) state verbatim: *"`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release."* Also confirmed: *"In bare mode, Claude Code never reads OAuth credentials or the system keychain... bare mode doesn't use your subscription login."* Local `--help` text for `--bare` matches: "Anthropic auth is strictly `ANTHROPIC_API_KEY` or `apiKeyHelper` via `--settings` (OAuth and keychain are never read)." This is exactly the landmine research.md described — no change, and it has **not** shipped as default yet. Skills still resolve via `/skill-name` even in bare mode (confirmed).
Source: https://code.claude.com/docs/en/headless (retrieved 2026-09-14); local `claude --help` v2.1.270 (observed 2026-09-14).

### 3. `--max-turns`
**UNCHANGED, but with a new discrepancy worth flagging.** `--max-turns` is still **absent from local v2.1.270 `--help`** (checked both `claude --help` and `claude -p --help`, byte-identical option list, no `max-turns` anywhere) — confirms the original observation exactly, so the "don't rely on it, enforce timeouts ourselves" advice stands.
However, the **online** cli-reference page *does* document `--max-turns` ("Limit the number of agentic turns, print mode only," example `claude -p --max-turns 3 "query"`) — a docs/binary mismatch on the currently-installed version. Not a change from yesterday (same version, same gap), just noting it's real and current, not something research.md missed.
Source: local `claude --help`/`claude -p --help` v2.1.270 (observed 2026-09-14); https://code.claude.com/docs/en/cli-reference (retrieved 2026-09-14).

**New and worth adopting:** `--max-budget-usd <amount>` — *"Maximum dollar amount to spend on API calls before stopping (print mode only)"*, requires v2.1.217+. This **is** present in local v2.1.270 `--help` (confirmed: `--max-budget-usd <amount>  Maximum dollar amount to spend on API calls (only works with --print)`, sitting right where `--max-turns` would alphabetically be). This directly serves the pipeline's per-step cost control goal and wasn't in research.md at all. Recommend adding `--max-budget-usd` to each headless step invocation as a hard stop, since `--max-turns` can't be relied on but this flag is real and installed.
Source: local `claude --help` v2.1.270 (observed 2026-09-14); https://code.claude.com/docs/en/cli-reference (retrieved 2026-09-14).

### 4. `--restricted`, `--tools`, `--strict-mcp-config`, `--system-prompt`/`--append-system-prompt(-file)`, `--setting-sources`
**UNCHANGED.** All present in local v2.1.270 `--help` except `--tools` (not a real flag — likely research.md meant `--allowedTools`/`--disallowedTools`, both of which are present). Confirmed present locally: `--restricted`, `--strict-mcp-config`, `--system-prompt`, `--append-system-prompt`, `--setting-sources`. `--restricted` requires v2.1.248+ per docs (removes tools that run commands, confines file tools to working directories, loads only managed settings) — useful for locking down a headless step further than `--allowedTools` alone.
Source: local `claude --help` v2.1.270 (observed 2026-09-14); https://code.claude.com/docs/en/cli-reference (retrieved 2026-09-14).

### 5. Subscription auth & terms
**UNCHANGED.** Confirmed verbatim on https://code.claude.com/docs/en/legal-and-compliance (retrieved 2026-09-14): OAuth "is designed to support ordinary use of Claude Code and other native Anthropic applications"; developers building products (including Agent SDK users) "should use API key authentication"; the policy explicitly does **not** prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription." This is exactly the basis for the constitutional rule (no Agent SDK with the subscription; plain `claude` binary with OAuth login is fine).
Source: https://code.claude.com/docs/en/legal-and-compliance (retrieved 2026-09-14).

### 6. Usage limits
**UNCHANGED.** Support article still states usage is shared between claude.ai and Claude Code ("all activity in both tools counts against the same usage limits") and still does not publish exact numeric limits.
Source: https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan (retrieved 2026-09-14).

### 7. Models
**UNCHANGED** on the core fact. Aliases `haiku`, `sonnet`, `opus`, `fable`, `opusplan` all still exist (plus `default`, `best`, `sonnet[1m]`, `opus[1m]`, none of which change the picture). Fable "usage may bill to usage credits" is confirmed, with a new detail: in **non-interactive mode (`-p`) and Agent SDK, Claude Code never shows the consent prompt** — a Fable call that would bill usage credits is just billed silently. This reinforces (does not change) the existing "avoid Fable" rule — it's actually a stronger reason to avoid it in headless runs, since there's no consent gate to catch an accidental Fable invocation in a script.
Source: https://code.claude.com/docs/en/model-config (retrieved 2026-09-14).

### 8. Subagents
**UNCHANGED** on the structural facts research.md cites (`.claude/agents/*.md`, model/tools/skills/mcpServers/hooks fields, isolated context). One correction to the "nest depth 3" detail: docs say default max nesting is 3 layers **as of v2.1.219+**; v2.1.217–218 briefly defaulted to 1, and versions before that allowed up to 5 — so "depth 3" is the current default but has moved around across versions. Not a change since yesterday (still 3 in current docs), just a note that it's not been a stable constant historically.
Source: https://code.claude.com/docs/en/sub-agents (retrieved 2026-09-14).

### 9. Subagent model bug — **PRIORITY, re-checked carefully**
**Issue #43869 is STILL OPEN.** Verified directly via GitHub REST API (not just the rendered page): `state: "open"`, `state_reason: null`, `created_at: 2026-04-05`, `updated_at: 2026-08-18`, `closed_at: null`, 17 comments. No maintainer has closed it or posted an official fix confirmation as of the last comment (2026-08-18).

This does **not** remove the justification for the "no subagents, one headless call per step" architecture — if anything the thread shows the bug is **partially fixed but still broken for exactly the pattern research.md's design would use**:
- A fix landed in **v2.1.146** (2026-05-21, per a commenter's changelog citation and confirmed by transcript inspection): direct `Agent(model: "sonnet")` tool-call invocations now resolve to the requested model correctly. `CLAUDE_CODE_SUBAGENT_MODEL` forwarding to child processes was fixed.
- But the **custom-agent-frontmatter path** (`.claude/agents/<name>.md` with `model: sonnet`, invoked by `subagent_type`/name — i.e. the "teammate" spawn path) is still reported broken on **v2.1.202, v2.1.212, v2.1.220, and v2.1.233** (most recent repro: 2026-08-17, on Windows, showing intermittent failures even mid-session with `CLAUDE_CODE_SUBAGENT_MODEL` verified present in the child's environment). One commenter traced it to source (minified v2.1.202 binary): the teammate spawn path looks up the agent definition by exact `subagent_type` string match, and a miss silently drops the frontmatter `model` field, falling back to the parent's model.
- Current docs (`sub-agents` page, retrieved 2026-09-14) now document a "Model Selection Known Issues" section themselves, listing the resolution order and noting that **before v2.1.251**, `CLAUDE_CODE_SUBAGENT_MODEL` incorrectly took priority over both the per-invocation `model` param and frontmatter (including `model: inherit`) — implying a v2.1.251 fix to *resolution-order precedence*, which is a different bug than the one the GitHub issue tracks (routing dropping the model entirely on the teammate path). It is not clear from the docs alone whether v2.1.251 also fixed the teammate-path drop; the GitHub thread's most recent repro (v2.1.233, 2026-08-17) postdates that claim's implied version but the reporter didn't confirm which code path they hit.

**Conclusion: the fix is incomplete.** Direct `Agent(model:)` calls (i.e., what `general-purpose`/ad-hoc Task-tool subagents would use) appear reliable since v2.1.146. Named custom agents defined in `.claude/agents/*.md` with a `model:` frontmatter field — the exact mechanism a multi-team research fan-out would use — are still reported unreliable as recently as five weeks before this check. **Recommendation: do not change the "one headless `claude -p` call per pipeline step" architecture based on this.** If parallel research fan-out is ever wanted, it would currently be safer to use ad-hoc `Agent(model: "haiku")`-style per-invocation calls (the fixed path) rather than named subagent definitions with `model:` frontmatter (the still-reported-broken path) — and even then, verify actual model usage from transcripts (`subagents/agent-*.jsonl`) rather than trusting the UI label, since one 2026-04-29 report showed the UI mislabeling a subagent as Sonnet while it actually ran on Opus.
Source: https://github.com/anthropics/claude-code/issues/43869 (GitHub REST API `state`/`comments` retrieved 2026-09-14; comment thread retrieved 2026-09-14); https://code.claude.com/docs/en/sub-agents (retrieved 2026-09-14).

### 10. Skills
**UNCHANGED** on the cited facts (`.claude/skills/<name>/SKILL.md`, auto-trigger by description or `/name`). Docs now explicitly acknowledge reliability limits in their own words: "Auto-trigger works best for reference content and clear use cases; complex conditional logic may not trigger reliably," and recommend `disable-model-invocation: true` for tasks needing explicit control — this is a documented admission consistent with research.md's "reportedly unreliable (~50%)" characterization, though docs don't give a number. Not a change, just corroboration.
New capability not in research.md: `context: fork` on a skill runs it in an isolated subagent (background by default) — could be relevant later if this pipeline ever wants an isolated one-off skill run, but doesn't affect the current "no subagents" design since it's still opt-in per skill.
Source: https://code.claude.com/docs/en/skills (retrieved 2026-09-14).

### 11. Hooks
**UNCHANGED** on cited facts: PreToolUse/PostToolUse/Stop/SubagentStop all exist, exit code 2 blocks (confirmed table: blocks PreToolUse, UserPromptSubmit, Stop, SubagentStop, PreModelSwitch, WorktreeCreate/Remove; no effect on other events), Windows hooks default to Git Bash (PowerShell available via `"shell": "powershell"`), and exec-form `.cmd`/`.bat` shims still can't run directly on Windows (documented workaround: invoke via `node.exe` or use shell form instead). Docs list many more hook events than research.md mentioned (SessionStart/End, UserPromptSubmit, PermissionRequest/Denied, PreModelSwitch, PreCompact, etc.) but that's breadth, not a change to what was cited.
Source: https://code.claude.com/docs/en/hooks (retrieved 2026-09-14).

### 12. MCP config
**UNCHANGED.** `claude mcp add <name> -- <cmd>` (stdio form) and scopes local/project/user all confirmed as described. Windows `cmd /c npx` workaround confirmed. Tool search loading MCP tools on demand confirmed, with one addition: tool search is **disabled** for custom `ANTHROPIC_BASE_URL` deployments, `ENABLE_TOOL_SEARCH=false`, and pre-4.5-generation models on Google Cloud's Agent Platform/Microsoft Foundry — in those cases Claude Code falls back to a `WaitForMcpServers` tool. Not relevant to this project's default Anthropic-API setup, so not a change in practice.
Source: https://code.claude.com/docs/en/mcp (retrieved 2026-09-14).

### 13. Sandboxing — **PRIORITY, re-checked carefully**
**UNCHANGED — still not available on native Windows, still closed "not planned".** Docs verbatim (retrieved 2026-09-14): *"The sandbox is built into Claude Code and runs on macOS, Linux, and WSL2. Native Windows is not supported. On Windows, run Claude Code inside a WSL2 distribution."* Issue #46740 verified via GitHub REST API: `state: "closed"`, `state_reason: "not_planned"`, `closed_at: 2026-06-21`. No sign of reopening (`updated_at: 2026-09-02` is just later comment/label activity, not a reopen). This confirms research.md's claim and gives the exact closure date it lacked.
Source: https://code.claude.com/docs/en/sandboxing (retrieved 2026-09-14); GitHub REST API for issue #46740 (retrieved 2026-09-14).

### 14. WebFetch / WebSearch
**COULD NOT FULLY VERIFY** against a dedicated current doc page (no single canonical page was checked for this row this round), but nothing in any of the pages reviewed above contradicts it, and this matches this agent's own observed tool description at the top of this session (WebFetch: "Fetches content... processes it using an AI model... Includes a self-cleaning cache... entries expire after 15 minutes"). Treat as UNCHANGED based on tool-description consistency, not a fresh doc citation.
Source: [unverified against a dedicated docs page this round] / tool description, observed 2026-09-14.

---

## Direct answers to the four priority questions

1. **Is #43869 still open?** Yes — confirmed open via GitHub API, last activity 2026-08-18, 17 comments, no maintainer close. It does **not** remove the justification for avoiding subagents for cost-controlled fan-out: the fix that landed (v2.1.146) covers only direct `Agent(model:)` calls, not the named-custom-agent-with-frontmatter-`model:` pattern research teams would use, which is still reported broken through v2.1.233 (2026-08-17). **No architecture change is warranted.**
2. **Has `--bare` become the default for `-p` yet?** No. Docs still say it "will become the default... in a future release" — still a future promise, not shipped, as of 2026-09-14.
3. **Is Windows sandboxing still "not planned"?** Yes, confirmed closed `not_planned` on 2026-06-21, still closed today, docs unchanged.
4. **Anything genuinely new worth adopting?**
   - **`--max-budget-usd <amount>`** (print mode only, v2.1.217+, present in the locally installed v2.1.270 binary) — a real, working per-invocation dollar cap. Since `--max-turns` cannot be relied on (confirmed still absent from local `--help`), this is a better-fitting guardrail for capping runaway cost per pipeline step and should be added to the standard `claude -p` invocation pattern.
   - **`--restricted`** (v2.1.248+) — stronger lockdown than `--allowedTools` alone (strips command-running tools, confines file tools to working directories, loads only managed settings); worth considering for steps that should never touch the filesystem outside the project.
   - `--output-format json`'s `total_cost_usd`/per-model cost breakdown is now explicitly documented as a **client-side estimate that can differ from the actual bill** — worth a one-line caveat anywhere the pipeline uses that field for cost accounting/budgeting decisions.
   - Nothing new changes how `--json-schema` or evidence-quote verification should work; no new skills/hooks mechanics require pipeline changes.

## Tally
UNCHANGED: 12 (rows 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, and row 3's core `--max-turns` claim)
CHANGED: 0 (no row's underlying fact flipped; row 3 gained a new adjacent flag `--max-budget-usd` worth adopting, and row 9 gained detail confirming the bug is open-but-partially-fixed, which is a refinement, not a reversal)
COULD NOT VERIFY: 1 (row 14, WebFetch/WebSearch — no dedicated doc page checked this round)
