# AI Usage Scorecard — Phase A Forensic Proof

**REPORT FILE:** `AI-Usage-Scorecard-PhaseA-Forensic-Proof__2026-09-18_08-59_MDT__Claude.md`
**REPORT TIMESTAMP:** 2026-09-18 08:59:22 MDT (UTC-06:00, America/Edmonton)
**AGENT:** GitHub Copilot (Claude Sonnet 5)
**ROLE:** Investigator
**PROJECT:** Ai Usage - Real Time
**REPOSITORY:** `c:\Users\dmcal\Documents\GitHub\Ai Usage - Real Time` (local only, not pushed)
**BRANCH:** N/A (no commits made)
**TASK / STAGE:** Phase 0 + Phase A — forensic proof of acquisition mechanisms for Codex and Claude Code usage/quota data
**BREADCRUMB IMPACT:** NO — no durable architecture exists yet in this repo; this is first-pass discovery
**DIAGNOSTIC IMPACT:** NO

---

## What was proven

- **Codex: PROVEN, not just provisional.** `codex app-server --stdio` is a real, working JSON-RPC-over-stdio service on the installed/authenticated CLI (v0.154.0). Calling `account/rateLimits/read` returns the exact same numbers as the human-visible `/status` screen, confirmed side by side in this session.
- **Claude: NOT YET PROVEN.** No non-PTY structured source was found. Investigation was blocked at an earlier step than expected: even a two-item Yes/No trust menu (shown before any Claude session can do anything) could not be navigated with the terminal-automation tool available in this environment, because it can only send literal text + Enter, not raw arrow-key codes. This is concrete evidence about the PTY question, addressed below.

## How Codex is read

**Mechanism:** Spawn `codex app-server --stdio` as an isolated child process (its own process, not attached to any existing Codex terminal). Perform a JSON-RPC handshake over stdio:

1. Write `{"id":1,"method":"initialize","params":{"clientInfo":{...},"capabilities":{"experimentalApi":true,...}}}\n`
2. Read the `initialize` response line.
3. Write `{"method":"initialized"}\n` (notification, no id).
4. Write `{"id":2,"method":"account/rateLimits/read"}\n`, read the response line.
5. Close stdin, kill the process.

**Framing:** one JSON object per line (`\n`-terminated), not Content-Length-prefixed like LSP. Confirmed both by reading `codex-rs` source (`app-server-transport/src/transport/stdio.rs`, `bounded_stdio_transport.rs`) and by a live probe script (`phase-a/codex-probe.mjs`) run against the real CLI.

**Live result (real account, this machine):**
```json
{
  "primary":   { "usedPercent": 0,  "windowDurationMins": 300,   "resetsAt": 1789760869 },
  "secondary": { "usedPercent": 51, "windowDurationMins": 10080, "resetsAt": 1790118301 },
  "planType": "plus"
}
```
`windowDurationMins: 300` = 5 hours → `primary` is the **5-hour window**. `windowDurationMins: 10080` = 7 days → `secondary` is the **weekly window**.

**Field cross-check against manual `/status`** (opened in a second, separate, isolated `codex` process — not the user's existing Codex terminal):

| Field | app-server (`account/rateLimits/read`) | Manual `/status` screen | Match |
|---|---|---|---|
| 5h remaining | 100% (`usedPercent: 0`) | "100% left (resets 13:53)" | ✅ |
| Weekly remaining | 49% (`usedPercent: 51`) | "49% left … resets 17:05 on 22 Sep" | ✅ |

Exact agreement. No PTY, no TUI parsing, no ANSI handling needed for Codex.

**Side effects / cost / latency:**
- Read-only account metadata call. No conversation/thread was created, no model was invoked (response shape contains only account/rate-limit fields, no thread id, no message).
- `initialize`: 210 ms. `account/rateLimits/read`: 555 ms. Total round trip ≈ 0.77 s, one-shot (no polling loop built yet, per constraint).
- The isolated verification `codex` TUI session was opened, `/status` was read, then closed cleanly with `/quit`. No lasting side effects (no files written, no memory/settings changed).

**Reliability assessment:** High. Structured JSON, versioned protocol, matches the authoritative human-visible screen exactly, marked `[experimental]` by Codex's own CLI help (meaning the interface could still change in a future Codex release — should be treated as provisional across upgrades, but is proven for the currently installed v0.154.0).

## How Claude was investigated (and where it stopped)

Investigated in the priority order from the approved plan, all via isolated processes (never the user's existing "Claude · Controlled" terminal):

1. **`claude --help` (full).** No `usage`, `status`, or equivalent subcommand/flag returning structured usage data. Only `claude auth status --json` exists for identity/plan info.
2. **`claude auth status --json`.** Returns login state, org, email, `subscriptionType` — **no usage percentages, no reset times**. Confirms this is not a substitute for `/status` → Usage.
3. **`~/.claude/` directory contents.** `stats-cache.json` contains only local historical telemetry (daily message/token counts per day) — this is *our own local activity log*, not the live plan-quota percentage Anthropic's backend reports in the Usage tab. `cache/` only holds the model catalog and changelog. `.credentials.json` was not opened/dumped (contains an OAuth token — a secret; left untouched per privacy rules). No cached file matches the `/status` Usage tab's "Current session / Current week % used" figures.
4. **Attempted to observe the live API call behind `/status`.** Plan: launch an isolated `claude --debug='api' --debug-file <path>` session (no prompt sent — `/status` is a client-side command, not a model prompt) and read the debug log to see if a plain HTTP usage endpoint could be called directly, Codex-style.
   - **Blocked:** every `claude` launch in a fresh working directory first shows a one-time interactive trust menu ("No, exit" / "Yes, I trust this folder") that requires an **arrow-key** press to select the second option before Enter confirms it.
   - The terminal-automation tool available in this environment can only send literal text followed by Enter — it cannot send a raw Down-arrow control byte. Two attempts (a literal `` `e[B `` string and a literal `\u001b[B` string) were both interpreted as ordinary typed text, not a key press, and the trailing Enter simply confirmed the default ("No, exit"), which exits the process immediately.
   - Because even this simple 2-item menu could not be driven, this is direct, concrete evidence that reliably driving a real key-sequence-navigated screen (let alone `/status` → Tab-to-Usage) **requires true PTY-level key injection** (raw bytes via something like `node-pty`), not the higher-level terminal tool used for Phase A so far.

**Per constraint 3, stopping here before installing `node-pty`.**

## Decision gate — Claude PTY question

- **What was inspected:** `claude --help`, `claude auth status --json`, `~/.claude/` (stats-cache.json, cache/, settings.json, credentials existence only), and one blocked attempt at API debug-log capture.
- **Why simpler sources failed:** no CLI flag/subcommand exports usage as structured data; the only local cache is our own historical token/message counts, not the live plan-quota percentage; the debug-log route requires getting past an interactive, keystroke-navigated menu that the available automation cannot drive.
- **Exactly what `node-pty` would be used for:** spawning an isolated `claude` process attached to a real pseudo-console so we can (a) get past the one-time trust menu with a real Down-arrow + Enter key sequence, and (b) later send `/status`, then Tab key(s), and read the *rendered* screen (via a headless terminal buffer such as `@xterm/headless`) to confirm the Usage tab is actually selected before parsing "Current session" / "Current week".
- **Can it run in a fully isolated session?** Yes — it would spawn its own new `claude` process/pty, never attach to the user's existing "Claude · Controlled" terminal, and would be bounded (timeouts, no infinite retries, clean exit) per the plan's non-negotiable constraints.
- **Cheaper next step before committing to `node-pty`:** the user could manually run `claude` once in a throwaway directory and select "Yes, I trust this folder" themselves (one keystroke, their own choice), after which the same isolated `--debug='api' --debug-file` capture could be retried programmatically for subsequent `/status` calls in that now-trusted directory — this might reveal a plain HTTP usage endpoint (Codex-style) and avoid `node-pty` entirely. This has not been done yet; it requires the user's own action, not automation.

## Normalized fields recovered so far

- **Codex:** `fiveHour.usedPercent` (0), `fiveHour.resetAt` (unix ts 1789760869), `weekly.usedPercent` (51), `weekly.resetAt` (unix ts 1790118301), `provider: "plus"` plan metadata. All exact, no guessing.
- **Claude:** none recovered yet — blocked before reaching any usage data.

## Test results

No automated parser tests were written yet (Phase B is out of scope for this pass). The only artifact is `phase-a/codex-probe.mjs`, a one-shot manual probe script (not part of the app), used to prove the Codex mechanism live against the real account.

## Field results

- Codex dashboard-candidate values agree exactly with a manually-opened `/status` screen (see table above).
- Claude: no field comparison possible yet.
- `/usage` was never invoked or substituted for either provider.

## Known risks

1. Codex's `app-server` subcommand is explicitly marked `[experimental]` in its own `--help` output — the JSON-RPC shape could change in a future Codex release. Recommend a version-tolerant parser (missing-field → "unknown", never guess) when this is built in Phase B.
2. Claude's acquisition path is still unresolved. If `node-pty` is approved, the Tab-navigation-to-Usage-tab step is the single highest-risk, most TUI-layout-dependent part of the whole project, exactly as flagged in the original task.
3. The blocked trust-menu experiment shows this environment's higher-level terminal tool cannot drive arbitrary interactive TUIs — any future Claude PTY work must use a real PTY library, not this session's terminal-automation tool.

## Recommendation

- **Codex: PROCEED** — mechanism is proven, fast (~0.8s one-shot), no model invoked, exact field agreement with the human-visible screen.
- **Claude: BLOCKED pending your decision.** Two options going forward:
  1. Approve adding `node-pty` (native dependency, needs Windows build tools) so an isolated Claude session can get past the trust menu and drive `/status` → Usage with real key codes.
  2. You manually trust one throwaway directory yourself once, so a debug-log capture can be retried without any new dependency — cheaper, but requires your one-time manual action and might still lead to needing `node-pty` for the actual `/status` → Tab → Usage navigation afterward.

Waiting for your decision before any further work (per constraint 1: stop after Phase 0 + Phase A).

---

## REPORT IDENTITY

**REPORT NAME:** AI Usage Scorecard — Phase A Forensic Proof
**REPORT FILE:** `AI-Usage-Scorecard-PhaseA-Forensic-Proof__2026-09-18_08-59_MDT__Claude.md`
**REPORT TIMESTAMP:** 2026-09-18 08:59:22 MDT (UTC-06:00, America/Edmonton)

**END OF REPORT**
