/**
 * Chain execution mode
 */

import type { AgentConfig } from "../agents.js";
import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { ExecutionContext } from "./base.js";
import { runSingleAgent } from "../executor/runner.js";
import { getFinalOutput } from "../utils/formatter.js";

export class ChainMode {
	async execute(ctx: ExecutionContext, params: { chain: Array<{ agent: string; task: string; cwd?: string }>; agentScope: string; projectAgentsDir: string | null }): Promise<any> {
		const { defaultCwd, agents, signal, onUpdate } = ctx;
		const { chain, agentScope, projectAgentsDir } = params;

		const makeDetails = (results: SingleResult[]): SubagentDetails => ({
			mode: "chain",
			agentScope,
			projectAgentsDir,
			results,
		});

		const results: SingleResult[] = [];
		let previousOutput = "";

		for (let i = 0; i < chain.length; i++) {
			const step = chain[i];
			const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);

			const chainUpdate: OnUpdateCallback | undefined = onUpdate
				? (partial) => {
						const currentResult = partial.details?.results[0];
						if (currentResult) {
							const allResults = [...results, currentResult];
							onUpdate({
								content: partial.content,
								details: makeDetails(allResults),
							});
						}
					}
				: undefined;

			const result = await runSingleAgent({
				defaultCwd,
				agents,
				agentName: step.agent,
				task: taskWithContext,
				cwd: step.cwd,
				step: i + 1,
				signal,
				onUpdate: chainUpdate,
				makeDetails,
			});

			results.push(result);

			const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
			if (isError) {
				const errorMsg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
				return {
					content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
					details: makeDetails(results),
					isError: true,
				};
			}

			previousOutput = getFinalOutput(result.messages);
		}

		return {
			content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
			details: makeDetails(results),
		};
	}
}