// Otty integration extension for pi (pi.dev) and omp (omp.sh / oh-my-pi).
//
// Reports agent lifecycle state to the Otty app over IPC so a terminal pane can
// show the processing / idle badge and task-complete notifications. This file
// ships as a readable, code-signed template inside Otty.app so you can audit
// exactly what runs; Otty writes a copy with the per-install values substituted
// (otty-cli path, IPC socket, agent kind) into:
//   ~/.pi/agent/extensions/otty-integration.ts   (pi)
//   ~/.omp/agent/extensions/otty-integration.ts  (omp)
//
// pi and omp share one extension API (omp is a pi rebrand via piConfig.name /
// configDir), so this single file drives both. Placeholders below are replaced
// by Otty at install time.
//
// marker: _otty
// otty-extension-version: 1
import { spawn } from "node:child_process";
import { basename } from "node:path";

const OTTY_CLI = "/Applications/Otty.app/Contents/MacOS/otty-cli";
const OTTY_SOCKET = "/Users/dengwenyu/Library/Application Support/io.appmakes.otty/otty.sock";
const OTTY_AGENT = "pi"; // "pi" | "omp"

// Derive the session id from the persisted session file (its basename, minus
// the .jsonl extension). Falls back to a stable per-process id for ephemeral
// (unpersisted) sessions so the pane badge still tracks this agent.
function sessionIdFor(ctx) {
  try {
    const file = ctx && ctx.sessionManager && ctx.sessionManager.getSessionFile
      ? ctx.sessionManager.getSessionFile()
      : null;
    if (file) return basename(String(file)).replace(/\.jsonl$/, "");
  } catch {}
  return `pid-${process.pid}`;
}

function cwdFor(ctx) {
  try {
    return (ctx && ctx.cwd) ? String(ctx.cwd) : "";
  } catch {
    return "";
  }
}

// Fire-and-forget a state report to Otty. Detached + unref'd so it never blocks
// or outlives the agent process.
function notify(sessionId, state, cwd) {
  if (!sessionId) return;
  const args = [
    `state:${OTTY_AGENT}`,
    `session-id=${sessionId}`,
    `state=${state}`,
    // process.pid is the pi/omp process; Otty matches it against each pane's
    // process tree (pid-accurate) and correctly ignores pi/omp instances
    // running outside Otty (e.g. an editor integration).
    `agent-pid=${process.pid}`,
  ];
  if (cwd) args.push(`cwd=${cwd}`);

  const env = { ...process.env };
  if (OTTY_SOCKET) env.OTTY_SOCKET = OTTY_SOCKET;
  try {
    const proc = spawn(OTTY_CLI, args, { stdio: "ignore", detached: true, env });
    proc.on("error", () => {});
    proc.unref();
  } catch {}
}

// pi extension entry point: `export default function (pi: ExtensionAPI)`.
export default function (pi) {
  // agent_start / agent_end fire once per user prompt — the natural
  // processing → idle boundary. tool_call keeps the "processing" badge warm
  // across long multi-tool turns. session_start seeds the session id early so
  // the pane is associated even before the first prompt completes.
  pi.on("session_start", async (_event, ctx) => {
    notify(sessionIdFor(ctx), "idle", cwdFor(ctx));
  });
  pi.on("agent_start", async (_event, ctx) => {
    notify(sessionIdFor(ctx), "processing", cwdFor(ctx));
  });
  pi.on("tool_call", async (_event, ctx) => {
    // Never return { block, reason } here — Otty intentionally does not wire
    // permission handling for pi/omp. This handler only reports state.
    notify(sessionIdFor(ctx), "processing", cwdFor(ctx));
  });
  pi.on("agent_end", async (_event, ctx) => {
    notify(sessionIdFor(ctx), "idle", cwdFor(ctx));
  });
}
