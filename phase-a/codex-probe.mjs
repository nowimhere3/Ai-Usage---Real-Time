// Phase A probe: spawn an isolated `codex app-server --stdio` process (not the user's
// active Codex terminal), perform the JSON-RPC handshake, and call
// `account/rateLimits/read` once. One-shot only — no polling loop.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// Windows npm installs `codex` as a .cmd/.ps1 shim, not a directly spawnable .exe.
// spawn() requires shell:true to run .cmd files on Windows (Node cannot exec them directly).
const codexBin = process.platform === "win32" ? "codex.cmd" : "codex";
const child = spawn(codexBin, ["app-server", "--stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  shell: process.platform === "win32",
});

const rl = createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

function send(method, params, withId) {
  const msg = withId ? { id: nextId++, method, params } : { method, params };
  const line = JSON.stringify(msg);
  child.stdin.write(line + "\n");
  return withId ? msg.id : undefined;
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = send(method, params, true);
    pending.set(id, { resolve, reject, t0: Date.now() });
  });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    console.error("RAW (unparsed):", line);
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject, t0 } = pending.get(msg.id);
    pending.delete(msg.id);
    const ms = Date.now() - t0;
    if (msg.error) reject(Object.assign(new Error(msg.error.message), { ms, raw: msg }));
    else resolve({ result: msg.result, ms });
  } else {
    console.error("EVENT/NOTIFICATION:", JSON.stringify(msg));
  }
});

child.stderr.on("data", (d) => process.stderr.write(`[stderr] ${d}`));
child.on("error", (err) => console.error("spawn error:", err));

(async () => {
  try {
    const init = await request("initialize", {
      clientInfo: { name: "ai-usage-realtime-probe", title: "Phase A Probe", version: "0.0.1" },
      capabilities: { experimentalApi: true, requestAttestation: false, mcpServerOpenaiFormElicitation: false },
    });
    console.log("initialize ok in", init.ms, "ms ->", JSON.stringify(init.result));

    send("initialized", undefined, false);

    const rl1 = await request("account/rateLimits/read", undefined);
    console.log("account/rateLimits/read ok in", rl1.ms, "ms ->");
    console.log(JSON.stringify(rl1.result, null, 2));
  } catch (err) {
    console.error("PROBE FAILED:", err.message, err.raw ? JSON.stringify(err.raw) : "", "after", err.ms, "ms");
  } finally {
    child.stdin.end();
    child.kill();
    process.exit(0);
  }
})();
