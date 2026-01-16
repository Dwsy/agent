/**
 * Process runner for executing subagent tasks
 */

import { spawn } from "node:child_process";
import type { AgentConfig } from "../agents.js";
import type { SingleResult, OnUpdateCallback, AgentRunnerOptions } from "../types.js";
import { writePromptToTempFile, cleanupTempFiles } from "../utils/tempfiles.js";
import { createInitialUsage, accumulateUsage, parseEventLine } from "./parser.js";
import { generateDynamicAgent, dynamicAgentToConfig, getDynamicAgentsDir } from "../dynamic-agent.js";
import type { GeneratedAgentConfig } from "../dynamic-agent.js";

export async function runSingleAgent(options: AgentRunnerOptions): Promise<SingleResult> {
	const { defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails } = options;

	let agent = agents.find((a) => a.name === agentName);
	let isDynamicAgent = false;
	let dynamicAgentInfo: GeneratedAgentConfig | null = null;

	if (!agent) {
		const generated = await generateDynamicAgent({ agentName, task });
		if (generated) {
			dynamicAgentInfo = generated;
			agent = dynamicAgentToConfig(generated, agentName);
			isDynamicAgent = true;
		}
	}

	if (!agent) {
		const worker = agents.find((a) => a.name === "worker");
		if (worker) {
			agent = worker;
		} else {
			return {
				agent: agentName,
				agentSource: "unknown",
				task,
				exitCode: 1,
				messages: [],
				stderr: `Unknown agent: ${agentName} (no worker.md available and dynamic generation failed)`,
				usage: createInitialUsage(),
				step,
			};
		}
	}

	const effectiveAgentName = agent.name;
	const effectiveTask = isDynamicAgent
		? [
				`[Dynamic agent "${agentName}" ${
					dynamicAgentInfo?.origin === "matched" ? "matched from" : "created and saved to"
				} ${dynamicAgentInfo?.filePath ?? getDynamicAgentsDir()}]`,
				`Generation: ${dynamicAgentInfo?.origin === "matched" ? "matched existing dynamic agent" : "generated from model"}`,
				`Available tools: ${dynamicAgentInfo?.availableTools?.join(", ") || "(unknown)"}`,
				`Available skills/plugins: ${
					dynamicAgentInfo?.availableSkills && dynamicAgentInfo.availableSkills.length > 0
						? dynamicAgentInfo.availableSkills.join(", ")
						: "(none)"
				}`,
				dynamicAgentInfo?.systemPrompt?.trim() ? `System prompt:\n${dynamicAgentInfo.systemPrompt.trim()}` : "",
				`Original task: ${task}`,
			]
				.filter(Boolean)
				.join("\n\n")
		: task;

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.provider) args.push("--provider", agent.provider);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		agent: effectiveAgentName,
		agentSource: isDynamicAgent ? "dynamic" : agent.source,
		task: effectiveTask,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: createInitialUsage(),
		model: agent.model,
		step,
		startTime: Date.now(),
	};

	const emitUpdate = () => {
		if (onUpdate) {
			onUpdate({
				content: [{ type: "text", text: "(running...)" }],
				details: makeDetails([currentResult]),
			});
		}
	};

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${effectiveTask}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn("pi", args, { cwd: cwd ?? defaultCwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
			let buffer = "";

			const processLine = (line: string) => {
				const event = parseEventLine(line);
				if (!event) return;

				if (event.type === "message_end" && event.message) {
					const msg = event.message;
					currentResult.messages.push(msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						accumulateUsage(currentResult.usage, event);

						// Also try to get usage from message itself if event.usage is missing
						if (!event.usage && (msg as any).usage) {
							const msgUsage = (msg as any).usage;
							currentResult.usage.input += msgUsage.input ?? 0;
							currentResult.usage.output += msgUsage.output ?? 0;
							currentResult.usage.cacheRead += msgUsage.cacheRead ?? 0;
							currentResult.usage.cacheWrite += msgUsage.cacheWrite ?? 0;
							currentResult.usage.cost += msgUsage.cost?.total ?? 0;
							currentResult.usage.contextTokens = msgUsage.totalTokens ?? 0;
						}

						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => resolve(1));

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		currentResult.endTime = Date.now();
		if (wasAborted) throw new Error("Subagent was aborted");
		return currentResult;
	} finally {
		cleanupTempFiles(tmpPromptPath, tmpPromptDir);
	}
}