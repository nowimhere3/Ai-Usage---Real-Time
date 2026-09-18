// Phase A follow-up: does the Claude Code startup quota_check + rate-limit headers
// still appear when spawned headlessly (no real TTY), the way our own Node collector
// would need to run it? One-shot, bounded, isolated process — no polling loop.
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const probeDir = path.join(os.tmpdir(), "claude-usage-probe"); // already manually trusted earlier
const logPath = path.join(probeDir, "claude-headless-debug.log");
if (existsSync(logPath)) rmSync(logPath);

const claudeBin = "claude"; // native .exe on this machine (~/.local/bin), not an npm .cmd/.ps1 shim
const child = spawn(claudeBin, ["--debug", "--debug-file", logPath], {
  cwd: probeDir,
  stdio: ["ignore", "pipe", "pipe"], // no TTY — this is the key question
  windowsHide: true,
  env: { ...process.env, ANTHROPIC_LOG: "debug" },
});

let stdout = "";
let stderr = "";
child.stdout?.on("data", (d) => (stdout += d.toString()));
child.stderr?.on("data", (d) => (stderr += d.toString()));

const BOUND_MS = 8000;
const timer = setTimeout(() => {
  child.kill();
  finish();
}, BOUND_MS);

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log("--- exit, stdout length:", stdout.length, "stderr length:", stderr.length);
  console.log("stdout head:", stdout.slice(0, 500));
  console.log("stderr head:", stderr.slice(0, 500));
  let log = "";
  try {
    log = readFileSync(logPath, "utf8");
  } catch (err) {
    console.log("NO LOG FILE:", err.message);
  }
  console.log("log length:", log.length);
  const hasQuotaCheck = log.includes("source=quota_check");
  const hasRateLimitHeaders = log.includes("anthropic-ratelimit-unified");
  console.log("has quota_check request:", hasQuotaCheck);
  console.log("has rate-limit headers:", hasRateLimitHeaders);
  if (hasRateLimitHeaders) {
    const idx = log.indexOf("anthropic-ratelimit-unified");
    console.log("excerpt:", log.slice(Math.max(0, idx - 200), idx + 400));
  }
  process.exit(0);
}

child.on("exit", (code) => {
  console.log("child exited with code", code);
  finish();
});
child.on("error", (err) => {
  console.log("spawn error:", err.message);
  finish();
});
