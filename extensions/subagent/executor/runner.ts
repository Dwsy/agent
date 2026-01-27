/**
 * Process runner for executing subagent tasks
 */

import { spawn } from "node:child_process";
import type { AgentConfig } from "../agents.js";
import type { SingleResult, OnUpdateCallback, AgentRunnerOptions, ToolCallRecord } from "../types.js";
import { writePromptToTempFile, cleanupTempFiles } from "../utils/tempfiles.js";
import { createInitialUsage, accumulateUsage, parseEventLine } from "./parser.js";
import { generateDynamicAgent, dynamicAgentToConfig, getDynamicAgentsDir } from "../dynamic-agent.js";
import type { GeneratedAgentConfig } from "../dynamic-agent.js";

function createGeneratingResult(agentName: string, task: string, status: SingleResult["status"], generationStage?: string): SingleResult {
	return {
		agent: agentName,
		agentSource: "dynamic",
		task: `Generating dynamic agent "${agentName}" for task: ${task}`,
		exitCode: -1,
		messages: [],
		stderr: "",
		usage: createInitialUsage(),
		startTime: Date.now(),
		status,
		generationStage,
	};
}

export async function runSingleAgent(options: AgentRunnerOptions): Promise<SingleResult> {
	const { defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails } = options;

	let agent = agents.find((a) => a.name === agentName);
	let isDynamicAgent = false;
	let dynamicAgentInfo: GeneratedAgentConfig | null = null;

	if (!agent) {
		let generatingResult = createGeneratingResult(agentName, task, "searching", "Searching for existing agent...");

		const emitGenerationUpdate = (status: SingleResult["status"], stage: string, text: string, error?: string, partial?: string) => {
			generatingResult = {
				...generatingResult,
				status,
				generationStage: stage,
				messages: partial ? [{ role: "assistant", content: [{ type: "text", text: partial }] }] : [],
			};
			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text }],
					details: makeDetails([generatingResult]),
				});
			}
		};

		const generated = await generateDynamicAgent({
			agentName,
			task,
			onProgress: (progress) => {
				switch (progress.stage) {
					case "search":
						emitGenerationUpdate("searching", "Searching for existing agent...", `[Searching] ${progress.text}`);
						break;
					case "create":
						emitGenerationUpdate("generating", "Generating new agent...", `[Generating] ${progress.text}`, undefined, progress.details?.partial);
						break;
					case "save":
						emitGenerationUpdate("generating", "Saving agent...", `[Saving] ${progress.text}`);
						break;
					case "done":
						emitGenerationUpdate("completed", "Agent ready", `[OK] ${progress.text}`);
						break;
					case "error":
						emitGenerationUpdate("error", "Generation failed", `[FAIL] ${progress.text}`);
						break;
				}
			},
		});
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
			if (onUpdate) {
				onUpdate({
					content: [{ type: "text", text: `✗ Unknown agent: ${agentName} (no worker.md available and dynamic generation failed)` }],
					details: makeDetails([]),
				});
			}
			return {
				agent: agentName,
				agentSource: "unknown",
				task,
				exitCode: 1,
				messages: [],
				stderr: `Unknown agent: ${agentName} (no worker.md available and dynamic generation failed)`,
				usage: createInitialUsage(),
				step,
				status: "error",
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
		status: "running",
		stderr: "",
		usage: createInitialUsage(),
		model: agent.model,
		step,
		startTime: Date.now(),
		toolCalls: [],
		currentTool: undefined,
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
			const currentToolMap = new Map<string, ToolCallRecord>();

			const processLine = (line: string) => {
				const event = parseEventLine(line);
				if (!event) return;

				// Handle thinking content
				if (event.type === "thinking_start") {
					// Initialize thinking array
					if (!currentResult.thinking) {
						currentResult.thinking = [];
					}
					emitUpdate();
				}
				else if (event.type === "thinking_delta") {
					// Accumulate thinking content
					if (!currentResult.thinking) {
						currentResult.thinking = [];
					}
					// Append delta to the last thinking entry
					if (currentResult.thinking.length === 0) {
						currentResult.thinking.push(event.delta);
					} else {
						currentResult.thinking[currentResult.thinking.length - 1] += event.delta;
					}
					emitUpdate();
				}
				else if (event.type === "thinking_end") {
					// Finalize thinking content
					if (event.content && event.content.trim()) {
						if (!currentResult.thinking) {
							currentResult.thinking = [];
						}
						// Replace the last entry with the full content
						if (currentResult.thinking.length > 0) {
							currentResult.thinking[currentResult.thinking.length - 1] = event.content.trim();
						} else {
							currentResult.thinking.push(event.content.trim());
						}
					}
					emitUpdate();
				}
				// Handle tool execution start
				else if (event.type === "tool_execution_start") {
					const toolCall: ToolCallRecord = {
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						startTime: Date.now(),
						args: event.args,
						partialResults: [],
					};
					currentResult.toolCalls?.push(toolCall);
					currentToolMap.set(event.toolCallId, toolCall);

					// Update current tool
					currentResult.currentTool = {
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						startTime: toolCall.startTime,
					};
					emitUpdate();
				}
				// Handle tool execution update (streaming output)
				else if (event.type === "tool_execution_update") {
					const toolCall = currentToolMap.get(event.toolCallId);
					if (toolCall) {
						toolCall.partialResults?.push(JSON.stringify(event.partialResult));
						currentResult.currentTool = {
							toolName: event.toolName,
							toolCallId: event.toolCallId,
							startTime: toolCall.startTime,
							partialResult: JSON.stringify(event.partialResult),
						};
						emitUpdate();
					}
				}
				// Handle tool execution end
				else if (event.type === "tool_execution_end") {
					const toolCall = currentToolMap.get(event.toolCallId);
					if (toolCall) {
						toolCall.endTime = Date.now();
						toolCall.duration = toolCall.endTime - toolCall.startTime;
						toolCall.result = event.result;
						toolCall.isError = event.isError;
						currentToolMap.delete(event.toolCallId);

						// Clear current tool if it's the one that just finished
						if (currentResult.currentTool?.toolCallId === event.toolCallId) {
							currentResult.currentTool = undefined;
						}
						emitUpdate();
					}
				}
				// Handle message end
				else if (event.type === "message_end" && event.message) {
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
				// Handle tool result end (legacy event)
				else if (event.type === "tool_result_end" && event.message) {
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