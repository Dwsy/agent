/**
 * Parallel subagent pool for GAPP generate jobs.
 *
 * Each job spawns a headless `pi -p --no-session --no-tools` process, so
 * multiple generate requests run concurrently instead of queuing as follow-up
 * messages on the main session. Concurrency is capped (GAPP_SUBAGENT_CONCURRENCY,
 * default 3); excess jobs wait in FIFO order.
 */

import { spawn } from "node:child_process";

export interface SubagentRequest {
  prompt: string;
  system?: string;
  format?: "text" | "json";
  cwd?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 110_000; // under GENERATE_TIMEOUT_MS so we fail first with a real message

function concurrencyLimit(): number {
  const n = Number(process.env.GAPP_SUBAGENT_CONCURRENCY || 3);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

/** Override with e.g. "node /path/fake-pi.mjs" in tests. */
function subagentCommand(): string[] {
  const raw = process.env.GAPP_SUBAGENT_CMD || "pi";
  return raw.split(" ").filter(Boolean);
}

let active = 0;
const waiters: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  while (active >= concurrencyLimit()) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
}

function releaseSlot(): void {
  active--;
  waiters.shift()?.();
}

export function subagentPoolStatus(): { active: number; waiting: number; limit: number } {
  return { active, waiting: waiters.length, limit: concurrencyLimit() };
}

function buildArgs(req: SubagentRequest): string[] {
  const args = ["-p", "--no-session", "--no-tools", "--mode", "json"];
  if (req.system) args.push("--system-prompt", req.system);
  let prompt = req.prompt;
  if (req.format === "json") {
    prompt += "\n\nRespond with valid JSON only — no markdown fences, no prose.";
  }
  args.push(prompt);
  return args;
}

/** Concatenated `text` parts of a pi JSON-mode message. */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: string; text?: string } => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

/**
 * Run one prompt on a headless subagent; resolves with the assistant's reply.
 *
 * Uses `--mode json` and watches the NDJSON event stream for completion
 * (`agent_settled` / `agent_end`) instead of waiting for process exit — the
 * real `pi -p` often never exits because extensions keep handles alive.
 * The child is killed as soon as the answer is in hand.
 */
export async function runSubagent(req: SubagentRequest): Promise<string> {
  await acquireSlot();
  try {
    return await new Promise<string>((resolve, reject) => {
      const [cmd, ...cmdArgs] = subagentCommand();
      const child = spawn(cmd, [...cmdArgs, ...buildArgs(req)], {
        cwd: req.cwd || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        // Marks the child so the generative-ui extension skips itself there
        // (no recursive gapp host / window hooks inside subagents).
        env: { ...process.env, GAPP_SUBAGENT: "1" },
      });

      let stdout = "";
      let stderr = "";
      let lineBuffer = "";
      let assistantText = "";
      let settled = false;

      const terminate = () => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 3_000).unref();
      };

      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        terminate();
        reject(new Error(`subagent timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const complete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(assistantText.trim());
        terminate();
      };

      const handleEvent = (line: string) => {
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return; // tolerate non-JSON noise on stdout
        }
        if (event?.type === "message_end" && event.message?.role === "assistant") {
          assistantText = messageText(event.message);
          return;
        }
        if (event?.type === "agent_end") {
          if (Array.isArray(event.messages)) {
            const last = [...event.messages].reverse().find((m: any) => m?.role === "assistant");
            const text = messageText(last);
            if (text) assistantText = text;
          }
          complete();
          return;
        }
        if (event?.type === "agent_settled") complete();
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (settled) return;
        lineBuffer += chunk;
        let newline: number;
        while ((newline = lineBuffer.indexOf("\n")) !== -1) {
          const line = lineBuffer.slice(0, newline).trim();
          lineBuffer = lineBuffer.slice(newline + 1);
          if (line) handleEvent(line);
          if (settled) return;
        }
      });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`subagent spawn failed: ${err.message}`));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Stream ended without a completion event — salvage what we can.
        if (code === 0 && assistantText.trim()) {
          resolve(assistantText.trim());
        } else {
          const detail = (stderr || stdout).trim().slice(0, 500);
          reject(new Error(`subagent exited with code ${code}${detail ? `: ${detail}` : ""}`));
        }
      });
    });
  } finally {
    releaseSlot();
  }
}
