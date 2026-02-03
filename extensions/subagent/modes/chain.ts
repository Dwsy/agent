/**
 * Chain execution mode
 */

import type { AgentConfig } from "../agents.js";
import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { ExecutionContext } from "./base.js";
import { runSingleAgent } from "../executor/runner.js";
import { getFinalOutput } from "../utils/formatter.js";
import { mapWithConcurrencyLimit } from "../utils/concurrency.js";
import { extractWisdom, appendWisdom, loadAllWisdom, formatWisdomForPrompt } from "../utils/wisdom.js";

const MAX_CONCURRENCY = 4;

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

			// 检查是否为并行任务组标记
			const isParallelGroup = taskWithContext.includes("@parallel:");
			
			if (isParallelGroup) {
				// 解析并行任务
				const parallelTasks = this.parseParallelTasks(taskWithContext);
				
				if (parallelTasks.length > 0) {
					// 执行并行任务组
					const parallelResults = await this.executeParallelGroup(
						parallelTasks,
						ctx,
						agentScope,
						projectAgentsDir,
						i + 1,
						makeDetails
					);
					
					results.push(...parallelResults);
					
					// 检查是否有错误
					const hasError = parallelResults.some(r => 
						r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted"
					);
					
					if (hasError) {
						const failedTasks = parallelResults
							.filter(r => r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted")
							.map(r => r.agent)
							.join(", ");
						
						return {
							content: [{ type: "text", text: `Chain stopped at step ${i + 1} (parallel group): Failed tasks: ${failedTasks}` }],
							details: makeDetails(results),
							isError: true,
						};
					}
					
					// 合并并行结果
					previousOutput = this.mergeParallelResults(parallelResults);
					continue;
				}
			}

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

		// 提取所有步骤的智慧并保存到会话（默认作用域）
		const allWisdomNotes: any[] = [];
		for (const result of results) {
			const notes = extractWisdom(result, "session");
			allWisdomNotes.push(...notes);
		}

		if (allWisdomNotes.length > 0) {
			appendWisdom(allWisdomNotes, defaultCwd);
		}

		return {
			content: [{ type: "text", text: getFinalOutput(results[results.length - 1].messages) || "(no output)" }],
			details: makeDetails(results),
		};
	}

	/**
	 * 解析并行任务标记
	 * 格式: @parallel: agent1:task1, agent2:task2, agent3:task3
	 */
	private parseParallelTasks(task: string): Array<{ agent: string; task: string }> {
		const match = task.match(/@parallel:\s*(.*)/);
		if (!match) return [];
		
		const tasksStr = match[1];
		const tasks: Array<{ agent: string; task: string }> = [];
		
		// 解析任务列表
		const items = tasksStr.split(/\s*,\s*(?=[a-zA-Z-]+:)/); // 按逗号分割，但保留冒号前的代理名
		
		for (const item of items) {
			const colonIndex = item.indexOf(':');
			if (colonIndex > 0) {
				const agent = item.slice(0, colonIndex).trim();
				const taskDesc = item.slice(colonIndex + 1).trim();
				
				if (agent && taskDesc) {
					tasks.push({ agent, task: taskDesc });
				}
			}
		}
		
		return tasks;
	}

	/**
	 * 执行并行任务组
	 */
	private async executeParallelGroup(
		tasks: Array<{ agent: string; task: string }>,
		ctx: ExecutionContext,
		agentScope: string,
		projectAgentsDir: string | null,
		step: number,
		makeDetails: (results: SingleResult[]) => SubagentDetails
	): Promise<SingleResult[]> {
		const { defaultCwd, agents, signal, onUpdate } = ctx;
		
		const results = await mapWithConcurrencyLimit(tasks, MAX_CONCURRENCY, async (t, index) => {
			return await runSingleAgent({
				defaultCwd,
				agents,
				agentName: t.agent,
				task: t.task,
				cwd: undefined,
				step,
				signal,
				onUpdate,
				makeDetails,
			});
		});
		
		return results;
	}

	/**
	 * 合并并行结果
	 */
	private mergeParallelResults(results: SingleResult[]): string {
		return results.map(r => {
			const output = getFinalOutput(r.messages);
			return `## [${r.agent}]\n${output}`;
		}).join("\n\n");
	}
}