// Claude acquisition: BLOCKED pending node-pty approval (see Phase B report).
//
// Confirmed in Phase A/B investigation:
//   - Claude Code's `rate_limits.five_hour`/`rate_limits.seven_day` (used_percentage,
//     resets_at) are populated automatically at ordinary interactive session startup,
//     before any prompt and before /status is ever opened. No TUI/Tab navigation is
//     needed to obtain the values themselves.
//   - However, without a real pseudo-terminal (isTTY), Claude Code does not run its
//     normal interactive startup at all — it short-circuits into a print-mode error
//     ("Input must be provided either through stdin or as a prompt argument when
//     using --print") before the startup rate-limit prefetch ever fires. A plain
//     Node child_process (stdio: pipe, no TTY) is therefore not sufficient.
//   - This means a real PTY (e.g. via node-pty) is required just to let Claude Code
//     boot normally — NOT to send Tab keys or read a rendered screen buffer. No
//     screen-buffer parsing (e.g. @xterm/headless) is needed for this data.
"use strict";

const { makeWindow, okSnapshot, unavailableSnapshot } = require("../usage-contract");

const SOURCE = "claude statusline/rate_limits (blocked: requires real PTY)";

/**
 * Maps the documented statusline `rate_limits` object
 * ({ five_hour: { used_percentage, resets_at }, seven_day: { ... } }) to the
 * normalized contract. Never guesses: an absent window is left null.
 * @param {object} rateLimits
 */
function normalizeClaudeRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") {
    return { fiveHour: null, weekly: null };
  }
  const toWindow = (raw) =>
    raw && Number.isFinite(Number(raw.used_percentage)) ? makeWindow(raw.used_percentage, raw.resets_at) : null;
  return {
    fiveHour: toWindow(rateLimits.five_hour),
    weekly: toWindow(rateLimits.seven_day),
  };
}

/**
 * Not yet implemented. Reaching Claude Code's rate-limit prefetch requires spawning
 * an isolated process attached to a real pseudo-terminal (node-pty), which has not
 * been approved. Returns a truthful "unavailable" snapshot rather than faking data.
 */
async function getClaudeUsage() {
  return unavailableSnapshot(
    "claude",
    SOURCE,
    "Acquisition requires a real PTY (node-pty) to boot Claude Code's normal startup; not yet approved."
  );
}

module.exports = { getClaudeUsage, normalizeClaudeRateLimits };
