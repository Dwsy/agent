/**
 * Shared dispatch for GAPP generate jobs.
 *
 * mode "subagent" (default): run on a parallel headless pi process — multiple
 * jobs execute concurrently. mode "agent": legacy injection into the main
 * session as a user message (serialized, but shares the session's context).
 */

import {
  createGenerateJob,
  armGenerateTimeout,
  completeGenerateJob,
  getAgentBridge,
} from "./registry.js";
import { formatGenerateUserMessage, type GappLlmMode } from "./protocol.js";
import { runSubagent } from "./subagent.js";

export interface GenerateDispatchInput {
  appId: string;
  requestId: string;
  prompt: string;
  system?: string;
  format?: "text" | "json";
  mode?: GappLlmMode;
  cwd?: string;
}

export type GenerateDispatchResult =
  | { ok: true; created: boolean; via: "subagent" | "agent" }
  | { ok: false; error: { code: string; message: string } };

export function dispatchGenerate(input: GenerateDispatchInput): GenerateDispatchResult {
  const mode: GappLlmMode = input.mode === "agent" ? "agent" : "subagent";
  const format = input.format === "json" ? "json" as const : "text" as const;

  if (mode === "agent") {
    const bridge = getAgentBridge();
    if (!bridge.notifyAgent) {
      return {
        ok: false,
        error: { code: "host_unavailable", message: "No Pi agent bridge in this process" },
      };
    }
    const { created } = createGenerateJob({ ...input, format });
    if (created) {
      armGenerateTimeout(input.requestId);
      const userMsg = formatGenerateUserMessage({
        appId: input.appId,
        requestId: input.requestId,
        prompt: input.prompt,
        system: input.system,
        format,
      });
      const busy = bridge.isAgentBusy();
      bridge.notifyAgent(userMsg, busy ? { deliverAs: "followUp" } : undefined);
    }
    return { ok: true, created, via: "agent" };
  }

  const { job, created } = createGenerateJob({ ...input, format });
  if (created) {
    job.status = "running";
    armGenerateTimeout(input.requestId);
    void runSubagent({
      prompt: input.prompt,
      system: input.system,
      format,
      cwd: input.cwd,
    }).then(
      (text) => completeGenerateJob(input.requestId, { ok: true, text }),
      (err) => completeGenerateJob(input.requestId, {
        ok: false,
        error: { code: "subagent_error", message: err instanceof Error ? err.message : String(err) },
      }),
    );
  }
  return { ok: true, created, via: "subagent" };
}
