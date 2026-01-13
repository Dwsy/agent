/**
 * Single task execution mode
 */

import type { AgentConfig } from "../agents.js";
import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { ExecutionContext, ExecutionMode } from "./base.js";
import { runSingleAgent } from "../executor/runner.js";
import { getFinalOutput } from "../utils/formatter.js";

export class SingleMode implements ExecutionMode {
	async execute(ctx: ExecutionContext, params: { agent: string; task: string; cwd?: string }): Promise<any> {
		const { defaultCwd, agents, signal, onUpdate } = ctx;

		const makeDetails = (results: SingleResult[]): SubagentDetails => ({
			mode: "single",
			agentScope: "user",
			projectAgentsDir: null,
			results,
		});

		const result = await runSingleAgent({
			defaultCwd,
			agents,
			agentName: params.agent,
			task: params.task,
			cwd: params.cwd,
			step: undefined,
			signal,
			onUpdate,
			makeDetails,
		});

		const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
		if (isError) {
			const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
			return {
				content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
				details: makeDetails([result]),
				isError: true,
			};
		}

		return {
			content: [{ type: "text", text: getFinalOutput(result.messages) || "(no output)" }],
			details: makeDetails([result]),
		};
	}
}