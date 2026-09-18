// Codex acquisition: isolated `codex app-server --stdio` JSON-RPC child process.
// account/rateLimits/read is read-only account metadata — no model is invoked.
"use strict";

const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { makeWindow, okSnapshot, unavailableSnapshot } = require("../usage-contract");

const SOURCE = "codex app-server (account/rateLimits/read)";

// windowDurationMins thresholds distinguish the 5h window from the weekly window
// when a caller doesn't already know which of primary/secondary is which.
const FIVE_HOUR_MAX_MINUTES = 360; // 6h, generous margin around the observed 300
const WEEKLY_MIN_MINUTES = 9000; // ~6.25 days, generous margin around the observed 10080

/**
 * Maps a raw `account/rateLimits/read` `rateLimits` payload to fiveHour/weekly windows.
 * Never guesses: a window with no usable usedPercent is left null.
 * @param {object} rateLimits
 */
function normalizeCodexRateLimits(rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") {
    return { fiveHour: null, weekly: null };
  }
  const { primary, secondary } = rateLimits;
  const windows = [primary, secondary].filter(Boolean);

  const pick = (predicate) => windows.find((w) => predicate(w?.windowDurationMins));
  let fiveHourRaw = pick((mins) => Number.isFinite(mins) && mins <= FIVE_HOUR_MAX_MINUTES);
  let weeklyRaw = pick((mins) => Number.isFinite(mins) && mins >= WEEKLY_MIN_MINUTES);

  // Fall back to the documented primary=5h/secondary=weekly convention only when
  // windowDurationMins wasn't usable to classify a window.
  if (!fiveHourRaw && !weeklyRaw && primary && secondary) {
    fiveHourRaw = primary;
    weeklyRaw = secondary;
  }

  const toWindow = (raw) =>
    raw && Number.isFinite(Number(raw.usedPercent)) ? makeWindow(raw.usedPercent, raw.resetsAt) : null;

  return { fiveHour: toWindow(fiveHourRaw), weekly: toWindow(weeklyRaw) };
}

function sendLine(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

/**
 * One-shot acquisition. Spawns an isolated `codex app-server --stdio`, performs the
 * JSON-RPC handshake, calls `account/rateLimits/read` once, then terminates the process.
 * Bounded by `timeoutMs` — never hangs indefinitely.
 * @param {{ timeoutMs?: number }} [options]
 */
function getCodexUsage(options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const codexBin = process.platform === "win32" ? "codex.cmd" : "codex";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        /* already closed */
      }
      child.kill();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish(unavailableSnapshot("codex", SOURCE, "Timed out waiting for codex app-server"));
    }, timeoutMs);

    let child;
    try {
      child = spawn(codexBin, ["app-server", "--stdio"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      });
    } catch (err) {
      clearTimeout(timer);
      resolve(unavailableSnapshot("codex", SOURCE, `Failed to start codex: ${err.message}`));
      return;
    }

    child.on("error", (err) => {
      finish(unavailableSnapshot("codex", SOURCE, `codex process error: ${err.message}`));
    });

    const rl = createInterface({ input: child.stdout });
    let nextId = 1;
    const pending = new Map();

    function request(method, params) {
      return new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej });
        sendLine(child, { id, method, params });
      });
    }

    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // ignore unparsable lines rather than crashing the collector
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || "codex app-server error"));
        else res(msg.result);
      }
      // other messages (notifications/events) are ignored — not needed for this snapshot
    });

    (async () => {
      try {
        await request("initialize", {
          clientInfo: { name: "ai-usage-realtime", title: "AI Usage Scorecard", version: "0.1.0" },
          capabilities: { experimentalApi: true, requestAttestation: false, mcpServerOpenaiFormElicitation: false },
        });
        sendLine(child, { method: "initialized" });

        const result = await request("account/rateLimits/read", undefined);
        const { fiveHour, weekly } = normalizeCodexRateLimits(result?.rateLimits);
        finish(okSnapshot("codex", SOURCE, fiveHour, weekly));
      } catch (err) {
        finish(unavailableSnapshot("codex", SOURCE, err.message));
      }
    })();
  });
}

module.exports = { getCodexUsage, normalizeCodexRateLimits };
