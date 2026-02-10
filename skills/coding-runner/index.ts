// coding-runner POC implementation (Pi Agent side)
// NOTE: This is a lightweight example, not a full skill framework.
// It shows how to route coding tasks to interactive_shell or tmux
// without blocking the current RPC call.

import { interactive_shell } from "pi-tools"; // pseudo-import: replace with real tool bridge

export type CodingAgent = "pi" | "codex" | "claude" | "opencode";
export type CodingMode = "oneshot" | "job" | "service";

export interface CodingRequest {
  agent: CodingAgent;
  mode: CodingMode;
  workdir: string;
  prompt: string;
  danger?: boolean;
}

export interface InteractiveShellResult {
  backend: "interactive_shell";
  sessionId: string;
  workdir: string;
  command: string;
  mode: "dispatch" | "hands-free";
  inspect: { hint: string; command: string };
  stop: { hint: string; command: string };
}

// tmux is documented in SKILL.md but not implemented in this POC on purpose.
export type CodingRunnerResult = InteractiveShellResult;

function buildCommand(agent: CodingAgent, prompt: string, danger: boolean | undefined): string {
  const safePrompt = prompt.replace(/"/g, '\\"');

  switch (agent) {
    case "pi": {
      // Always use prompt mode, let pi figure out details.
      return `pi -p "${safePrompt}"`;
    }
    case "codex": {
      const base = `codex exec "${safePrompt}"`;
      // Only allow dangerous flags when explicitly requested.
      return danger ? `${base} --yolo` : `${base} --full-auto`;
    }
    case "claude": {
      return `claude "${safePrompt}"`;
    }
    case "opencode": {
      return `opencode run "${safePrompt}"`;
    }
  }
}

function assertSafeWorkdir(workdir: string) {
  const forbidden = [
    "/Users/dengwenyu/.pi/agent",
    "/Users/dengwenyu/.pi/gateway",
  ];
  for (const base of forbidden) {
    if (workdir === base || workdir.startsWith(base + "/")) {
      throw new Error(`Refusing to run coding agent inside sensitive path: ${base}`);
    }
  }
}

export async function runCodingTask(req: CodingRequest): Promise<CodingRunnerResult> {
  assertSafeWorkdir(req.workdir);

  if (req.mode === "service") {
    throw new Error("service mode (tmux backend) is not implemented in this POC");
  }

  const mode = req.mode === "oneshot" ? "dispatch" : "hands-free";
  const command = buildCommand(req.agent, req.prompt, req.danger);

  // Pseudo-call: in real skill, this would use the pi interactive_shell tool.
  const result = await interactive_shell({
    command,
    cwd: req.workdir,
    mode,
    reason: `coding-runner: ${req.agent} ${req.mode}`,
  });

  const sessionId = result.sessionId ?? "";

  return {
    backend: "interactive_shell",
    sessionId,
    workdir: req.workdir,
    command,
    mode,
    inspect: {
      hint: "Check latest output from this coding task",
      command: `interactive_shell({ sessionId: '${sessionId}', outputLines: 50 })`,
    },
    stop: {
      hint: "Stop this coding task",
      command: `interactive_shell({ sessionId: '${sessionId}', kill: true })`,
    },
  };
}
