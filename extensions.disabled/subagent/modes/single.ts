/**
 * Single task execution mode
 */

import type { AgentConfig } from "../agents.js";
import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { ExecutionContext, ExecutionMode } from "./base.js";
import { runSingleAgent } from "../executor/runner.js";
import { getFinalOutput } from "../utils/formatter.js";
import { extractWisdom, appendWisdom, loadAllWisdom, formatWisdomForPrompt } from "../utils/wisdom.js";

export class SingleMode implements ExecutionMode {
	async execute(
		ctx: ExecutionContext,
		params: { agent: string; task: string; cwd?: string; agentScope: string; projectAgentsDir: string | null; injectWisdom?: boolean },
	): Promise<any> {
		const { defaultCwd, agents, signal, onUpdate } = ctx;

		const makeDetails = (results: SingleResult[]): SubagentDetails => ({
			mode: "single",
			agentScope: params.agentScope,
			projectAgentsDir: params.projectAgentsDir,
			results,
		});

		// 加载累积的智慧（三层：会话 + 项目 + 全局）
		const taskCwd = params.cwd || defaultCwd;
		const wisdom = loadAllWisdom(taskCwd);
		let enhancedTask = params.task;
		
		// 如果有智慧且启用注入，则增强任务提示
		if (wisdom && params.injectWisdom !== false) {
			const wisdomSection = formatWisdomForPrompt(wisdom);
			enhancedTask = `${params.task}\n\n${wisdomSection}`;
		}

		const result = await runSingleAgent({
			defaultCwd,
			agents,
			agentName: params.agent,
			task: enhancedTask,
			cwd: params.cwd,
			step: undefined,
			signal,
			onUpdate,
			makeDetails,
		});

		// 提取智慧并追加到会话（默认作用域）
		const wisdomNotes = extractWisdom(result, "session");
		if (wisdomNotes.length > 0) {
			appendWisdom(wisdomNotes, taskCwd);
		}

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