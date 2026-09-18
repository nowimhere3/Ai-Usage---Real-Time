# AI Usage Scorecard — Phase A Claude Mechanism Found (No PTY Required)

**REPORT FILE:** `AI-Usage-Scorecard-PhaseA-Claude-Mechanism-Found__2026-09-18_09-19_MDT__Claude.md`
**REPORT TIMESTAMP:** 2026-09-18 09:19:33 MDT (UTC-06:00, America/Edmonton)
**AGENT:** GitHub Copilot (Claude Sonnet 5)
**ROLE:** Investigator
**PROJECT:** Ai Usage - Real Time
**REPOSITORY:** `c:\Users\dmcal\Documents\GitHub\Ai Usage - Real Time` (local only, not pushed)
**BRANCH:** N/A (no commits made)
**TASK / STAGE:** Phase A continuation — Claude acquisition mechanism, following user's manual trust-prompt acceptance in a throwaway directory
**BREADCRUMB IMPACT:** NO — first-pass discovery, no durable architecture yet
**DIAGNOSTIC IMPACT:** NO

Supersedes the "Claude: BLOCKED" conclusion in `AI-Usage-Scorecard-PhaseA-Forensic-Proof__2026-09-18_08-59_MDT__Claude.md`.

---

## Headline result

**No `node-pty` is required for Claude either.** The Usage tab's numbers come from ordinary HTTP response headers on a request Claude Code already makes automatically at session startup — before `/status` is ever opened and regardless of which tab would be shown. No TUI navigation is needed to obtain the data itself.

## What changed since the last report

You manually accepted the one-time trust prompt in an isolated throwaway directory (`%TEMP%\claude-usage-probe`, never the existing "Claude · Controlled" terminal). With that directory trusted, I relaunched an isolated `claude` session there with `--debug --debug-file <path>` (unfiltered debug logging — the earlier `--debug='api'` filter produced no output at all, unfiltered `--debug` did) and, on a later run, `ANTHROPIC_LOG=debug` as well.

## How Claude usage data is actually read

**Mechanism:** an HTTP API response, not a local file and not an internal IPC message.

At session startup (`performStartupChecks`), Claude Code fires a small request tagged for exactly this purpose:

```
POST https://api.anthropic.com/v1/messages?beta=true
x-client-request-id: <uuid>          source=quota_check
x-claude-code-request-class: auxiliary
model: claude-haiku-4-5-20251001
max_tokens: [small — value redacted in logs]
```

The **response headers** carry the quota data directly — no response body parsing needed:

```
anthropic-ratelimit-unified-5h-utilization: 0.0
anthropic-ratelimit-unified-5h-reset: 1789761600
anthropic-ratelimit-unified-5h-status: allowed

anthropic-ratelimit-unified-7d-utilization: 0.92
anthropic-ratelimit-unified-7d-reset: 1789819200
anthropic-ratelimit-unified-7d-status: allowed_warning
anthropic-ratelimit-unified-7d-surpassed-threshold: 0.75

anthropic-ratelimit-unified-status: allowed_warning
anthropic-ratelimit-unified-representative-claim: seven_day
anthropic-ratelimit-unified-upgrade-paths: upgrade_plan
```

`5h-utilization` maps to the Usage tab's "Current session" figure; `7d-utilization` maps to "Current week". Both are plain decimal fractions (0.0–1.0), and reset fields are Unix timestamps — structurally almost identical to Codex's `usedPercent`/`resetsAt`, just named differently and delivered as HTTP headers instead of a JSON-RPC field.

**Corroboration:** `7d-utilization: 0.92` (92% used) matches the "92% used" weekly figure you gave as a real observed example in the original task brief. Not a simultaneous side-by-side re-check like Codex's (Tab-navigation to visually confirm "Current session/Current week" right now wasn't possible without raw key injection), but a strong independent match against your own earlier manual reading.

**Trigger conditions observed:**
- Fires automatically on ordinary interactive startup, before any prompt, before `/status`, before any tab is opened. This means the *acquisition* does not require reaching the Usage tab at all.
- Requires the working directory's one-time trust decision to already be accepted (your manual step). Once a directory is trusted, `~/.claude.json` remembers it — later isolated sessions in that same directory do not re-prompt.

## Important open question this raises: does it cost anything?

Unlike Codex's `account/rateLimits/read` (a dedicated, model-free JSON-RPC metadata call), Claude's `quota_check` is a **real call to the `/v1/messages` inference endpoint**, just with:
- `x-claude-code-request-class: auxiliary` (marked as internal/auxiliary, not a user turn)
- the cheapest available model (`claude-haiku-4-5`)
- a small, redacted `max_tokens`

This is architecturally different from Codex and needs to be flagged honestly: it is plausible this is designed to be free/uncounted (an "auxiliary" class request, likely how Claude Code always silently checks quota on startup regardless of whether a human ever asks), but it cannot be called a zero-cost pure-metadata call the way Codex's is — it is a real, if minimal, model API call. This should be treated as **unconfirmed cost** rather than assumed-free, and is worth a narrow, explicit follow-up question to you before this becomes an automatic polling loop in Phase C.

## Side effects / latency

- One real `/v1/messages` call per Claude Code session startup; observed latency 622 ms for this call.
- No conversation transcript, no visible assistant turn, no tokens billed to a user-facing thread (it's the CLI's own internal check, same one that already happens every time you start Claude Code normally).
- The isolated throwaway directory, its trust entry, and the debug log have all been deleted/cleaned up after this investigation. `ANTHROPIC_LOG` was only set for the killed terminal's process environment; it does not persist.

## Reliability assessment

High confidence on the mechanism itself (real HTTP headers, clearly named, directly mappable to the normalized contract). Caveats:
- Header names are undocumented/internal (no public Anthropic docs reference `anthropic-ratelimit-unified-*` at this time) — could change without notice, more fragile than Codex's versioned JSON-RPC protocol.
- Getting these headers requires capturing them via `--debug --debug-file` + `ANTHROPIC_LOG=debug` on a real Claude Code process start — this is still "driving the real CLI," just its startup sequence rather than its TUI, and still needs an isolated process per check (not a separate lightweight endpoint we can hit standalone).
- First-time trust per working directory still needs a one-time human decision (as it does for legitimate normal use of Claude Code too) — not an automation blocker for a fixed, pre-trusted working directory going forward.

## Recommendation

**PROCEED WITH CAVEAT** for Claude:
- No `node-pty`, no TUI parsing, no ANSI handling needed.
- Acquisition = spawn isolated `claude --debug --debug-file <tmp>` (with `ANTHROPIC_LOG=debug` in its env) in a directory that has already been trusted once, let it run briefly through startup, read the `anthropic-ratelimit-unified-*` headers from the debug log, then terminate the process.
- Caveat to resolve before automating: confirm whether repeated `quota_check` calls have any real cost/rate impact if this runs on a recurring schedule (Phase C polling) — recommend asking you directly, or testing a handful of repeated one-shot calls and watching whether the 5h/7d utilization numbers move in a way attributable to the check itself.

---

## REPORT IDENTITY

**REPORT NAME:** AI Usage Scorecard — Phase A Claude Mechanism Found (No PTY Required)
**REPORT FILE:** `AI-Usage-Scorecard-PhaseA-Claude-Mechanism-Found__2026-09-18_09-19_MDT__Claude.md`
**REPORT TIMESTAMP:** 2026-09-18 09:19:33 MDT (UTC-06:00, America/Edmonton)

**END OF REPORT**
