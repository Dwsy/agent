/**
 * Parallel task execution mode
 */

import type { AgentConfig } from "../agents.js";
import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { ExecutionContext } from "./base.js";
import { runSingleAgent } from "../executor/runner.js";
import { mapWithConcurrencyLimit } from "../utils/concurrency.js";
import { getFinalOutput } from "../utils/formatter.js";
import { createInitialUsage } from "../executor/parser.js";
import { extractWisdom, appendWisdom } from "../utils/wisdom.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

export class ParallelMode {
	async execute(ctx: ExecutionContext, params: { tasks: Array<{ agent: string; task: string; cwd?: string }>; agentScope: string; projectAgentsDir: string | null }): Promise<any> {
		const { defaultCwd, agents, signal, onUpdate } = ctx;
		const { tasks, agentScope, projectAgentsDir } = params;

		if (tasks.length > MAX_PARALLEL_TASKS) {
			return {
				content: [{ type: "text", text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
				details: {
					mode: "parallel",
					agentScope,
					projectAgentsDir,
					results: [],
				},
			};
		}

		const makeDetails = (results: SingleResult[]): SubagentDetails => ({
			mode: "parallel",
			agentScope,
			projectAgentsDir,
			results,
		});

		const allResults: SingleResult[] = new Array(tasks.length);
		for (let i = 0; i < tasks.length; i++) {
			allResults[i] = {
				agent: tasks[i].agent,
				agentSource: "unknown",
				task: tasks[i].task,
				exitCode: -1,
				messages: [],
				stderr: "",
				usage: createInitialUsage(),
				startTime: Date.now(),
			};
		}

		const emitParallelUpdate = () => {
			if (onUpdate) {
				const running = allResults.filter((r) => r.exitCode === -1).length;
				const done = allResults.filter((r) => r.exitCode !== -1).length;
				onUpdate({
					content: [{ type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }],
					details: makeDetails([...allResults]),
				});
			}
		};

		const results = await mapWithConcurrencyLimit(tasks, MAX_CONCURRENCY, async (t, index) => {
			const result = await runSingleAgent({
				defaultCwd,
				agents,
				agentName: t.agent,
				task: t.task,
				cwd: t.cwd,
				step: undefined,
				signal,
				onUpdate: (partial) => {
					if (partial.details?.results[0]) {
						allResults[index] = partial.details.results[0];
						emitParallelUpdate();
					}
				},
				makeDetails,
			});
			if (!result.endTime) {
				result.endTime = Date.now();
			}
			allResults[index] = result;
			emitParallelUpdate();
			return result;
		});

		const successCount = results.filter((r) => r.exitCode === 0).length;
		const summaries = results.map((r) => {
			const output = getFinalOutput(r.messages);
			const preview = output.slice(0, 100) + (output.length > 100 ? "..." : "");
			return `[${r.agent}] ${r.exitCode === 0 ? "completed" : "failed"}: ${preview || "(no output)"}`;
		});

		return {
			content: [{ type: "text", text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}` }],
			details: makeDetails(results),
		};
	}
}