/**
 * UI rendering for subagent results
 */

import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { SubagentDetails, SingleResult } from "../types.js";
import { getDisplayItems, formatToolCall, aggregateUsage, renderDisplayItems, formatJson, formatToolResult } from "./formatter.js";
import { formatUsageStats, getFinalOutput, formatDuration } from "../utils/formatter.js";
import { formatFullResult, formatCollapsedResult, formatTimeDiff, formatToolCallRecord } from "./status-formatter.js";

// Animation state for generating agents
const animationFrames = [".  ", ".. ", "..."];
let animationIndex = 0;

function getAnimatedGenText(status: SingleResult["status"], stage: string): string {
	animationIndex = (animationIndex + 1) % animationFrames.length;
	const dots = animationFrames[animationIndex];

	switch (status) {
		case "searching":
			return `[Searching]${dots}`;
		case "generating":
			if (stage?.includes("Saving")) {
				return `[Saving]${dots}`;
			}
			return `[Generating]${dots}`;
		case "error":
			return "[FAIL] Agent generation failed";
		case "completed":
			return "[OK] Agent generation complete";
		default:
			return `[Creating]${dots}`;
	}
}

export function renderCall(args: any, theme: any): Text {
	const scope = args.agentScope ?? "user";

	if (args.chain && args.chain.length > 0) {
		let text =
			theme.fg("toolTitle", theme.bold("subagent ")) +
			theme.fg("accent", `chain (${args.chain.length} steps)`) +
			theme.fg("muted", ` [${scope}]`);
		for (let i = 0; i < Math.min(args.chain.length, 5); i++) {
			const step = args.chain[i];
			const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
			text += "\n  " + theme.fg("muted", `${i + 1}.`) + " " + theme.fg("accent", step.agent);
			if (cleanTask) text += `\n    ${theme.fg("dim", cleanTask)}`;
		}
		if (args.chain.length > 5) text += `\n  ${theme.fg("muted", `... +${args.chain.length - 5} more`)}`;
		return new Text(text, 0, 0);
	}

	if (args.tasks && args.tasks.length > 0) {
		let text =
			theme.fg("toolTitle", theme.bold("subagent ")) +
			theme.fg("accent", `parallel (${args.tasks.length} tasks)`) +
			theme.fg("muted", ` [${scope}]`);
		for (let i = 0; i < Math.min(args.tasks.length, 5); i++) {
			const t = args.tasks[i];
			text += `\n  ${theme.fg("accent", t.agent)}`;
			if (t.task) text += `\n    ${theme.fg("dim", t.task)}`;
		}
		if (args.tasks.length > 5) text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 5} more`)}`;
		return new Text(text, 0, 0);
	}

	const agentName = args.agent || "...";
	const task = args.task || "";
	let text =
		theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", agentName) + theme.fg("muted", ` [${scope}]`);
	if (task) {
		text += `\n  ${theme.fg("dim", task)}`;
	}
	return new Text(text, 0, 0);
}

export function renderResult(result: any, { expanded }: { expanded: boolean }, theme: any): Container | Text {
	const details = result.details as SubagentDetails | undefined;
	if (!details || details.results.length === 0) {
		const text = result.content[0];
		return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
	}

	const mdTheme = getMarkdownTheme();

	if (details.mode === "single" && details.results.length === 1) {
		return renderSingleResult(details.results[0], expanded, theme, mdTheme);
	}

	if (details.mode === "chain") {
		return renderChainResult(details, expanded, theme, mdTheme);
	}

	if (details.mode === "parallel") {
		return renderParallelResult(details, expanded, theme, mdTheme);
	}

	const text = result.content[0];
	return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
}

function renderSingleResult(r: any, expanded: boolean, theme: any, mdTheme: any): Container | Text {
	// Handle generating status
	if (r.status === "searching" || r.status === "generating" || r.status === "error" || r.status === "completed") {
		const animatedText = getAnimatedGenText(r.status, r.generationStage);

		if (expanded) {
			const container = new Container();
			let header = `${theme.fg("warning", "[GEN]")} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", " (dynamic)")}`;
			container.addChild(new Text(header, 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Generation Status:"), 0, 0));
			container.addChild(new Text(theme.fg("accent", animatedText), 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Task:"), 0, 0));
			container.addChild(new Text(theme.fg("dim", r.task), 0, 0));

			// Show real-time generation output
			if (r.messages && r.messages.length > 0) {
				const displayItems = getDisplayItems(r.messages);
				if (displayItems.length > 0) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "Generation Output:"), 0, 0));
					for (const item of displayItems) {
						if (item.type === "text") {
							const preview = item.text.length > 500 ? item.text : item.text;
							container.addChild(new Markdown(preview.trim(), 0, 0, mdTheme));
						}
					}
				}
			}

			if (r.status === "error") {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("error", "Failed to generate agent. The agent may not exist or generation timed out."), 0, 0));
			}

			return container;
		}

		let text = `${theme.fg("warning", "[GEN]")} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", " (dynamic)")}`;
		text += `\n${theme.fg("accent", animatedText)}`;

		// Show preview of generation output in collapsed mode
		if (r.messages && r.messages.length > 0) {
			const displayItems = getDisplayItems(r.messages);
			if (displayItems.length > 0) {
				const lastItem = displayItems[displayItems.length - 1];
				if (lastItem.type === "text" && lastItem.text) {
					const preview = lastItem.text.length > 100 ? lastItem.text.slice(-100) : lastItem.text;
					text += `\n${theme.fg("dim", `Generating: ${preview}...`)}`;
				}
			}
		}

		if (r.status === "error") {
			text += `\n${theme.fg("dim", r.task)}`;
		}

		return new Text(text, 0, 0);
	}

	const isError = r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
	const statusSymbol = isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

	// Use new formatters for completed results
	if (expanded) {
		const container = new Container();

		// Header: agent name and status
		let header = `${statusSymbol} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
		if (isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
		container.addChild(new Text(header, 0, 0));

		if (isError && r.errorMessage) {
			container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
		}

		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "Task:"), 0, 0));
		container.addChild(new Text(theme.fg("dim", r.task), 0, 0));

		// Thinking process (if available)
		if (r.thinking && r.thinking.length > 0) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Thinking Process:"), 0, 0));
			for (const thought of r.thinking) {
				container.addChild(new Text(theme.fg("dim", `  > ${thought}`), 0, 0));
			}
		}

		// Tool calls history
		if (r.toolCalls && r.toolCalls.length > 0) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", `Tool Calls (${r.toolCalls.length}):`), 0, 0));

			for (const toolCall of r.toolCalls) {
				const duration = toolCall.duration ? `${toolCall.duration.toFixed(2)}s` : "running";
				const status = toolCall.isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

				// Show tool call header
				container.addChild(new Text(
					`  ${status} ${theme.fg("accent", toolCall.toolName)} ${theme.fg("dim", `"${JSON.stringify(toolCall.args)}"`)}`,
					0, 0
				));
				container.addChild(new Text(
					theme.fg("dim", `     Time: ${duration}`),
					0, 0
				));

				// Show tool result if available
				if (toolCall.result) {
					// Only show Result header for read tool
					if (toolCall.toolName === "read") {
						container.addChild(new Text(theme.fg("muted", "     Result:"), 0, 0));
					}

					// Check if result has content array
					if (toolCall.result.content && Array.isArray(toolCall.result.content)) {
						for (const item of toolCall.result.content) {
							if (item.type === "text" && item.text) {
								const formatted = formatToolResult(item.text, theme.fg.bind(theme), 2, toolCall.toolName);
								if (formatted) container.addChild(new Text(formatted, 0, 0));
							} else {
								const formatted = formatToolResult(item, theme.fg.bind(theme), 2, toolCall.toolName);
								if (formatted) container.addChild(new Text(formatted, 0, 0));
							}
						}
					} else {
						const formatted = formatToolResult(toolCall.result, theme.fg.bind(theme), 2, toolCall.toolName);
						if (formatted) container.addChild(new Text(formatted, 0, 0));
					}
				}

				// Show error if failed
				if (toolCall.isError && toolCall.result) {
					container.addChild(new Text(
						theme.fg("error", `     Error: ${JSON.stringify(toolCall.result)}`),
						0, 0
					));
				}

				container.addChild(new Spacer(0.5));
			}
		}

		// Current tool (if running)
		if (r.currentTool) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Running:"), 0, 0));
			container.addChild(new Text(
				theme.fg("accent", `  -> ${r.currentTool.toolName}`),
				0, 0
			));
			if (r.currentTool.partialResult) {
				container.addChild(new Text(
					theme.fg("dim", `     ${r.currentTool.partialResult.slice(-100)}...`),
					0, 0
				));
			}
		}

		// Output content
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "Output:"), 0, 0));
		const finalOutput = getFinalOutput(r.messages);
		if (finalOutput) {
			container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
		} else {
			container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
		}

		// Stats
		const usageStr = formatUsageStats(r.usage, r.model);
		const duration = formatDuration(r.startTime, r.endTime);
		if (usageStr || duration) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "Stats:"), 0, 0));
			let statsText = "";
			if (usageStr) statsText += usageStr;
			if (duration) statsText += (statsText ? " • " : "") + `Duration: ${duration}`;
			container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
		}

		return container;
	}

	// Collapsed view - simplified, no task repetition
	let text = `${statusSymbol} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;

	// Show thinking process summary
	if (r.thinking && r.thinking.length > 0) {
		const lastThought = r.thinking[r.thinking.length - 1];
		text += `\n${theme.fg("dim", `Thinking: ${lastThought.slice(0, 80)}${lastThought.length > 80 ? "..." : ""}`)}`;
	}

	// Show current tool if running
	if (r.currentTool) {
		text += `\n${theme.fg("accent", `Running: ${r.currentTool.toolName}`)}`;
	} else if (r.toolCalls && r.toolCalls.length > 0) {
		const completed = r.toolCalls.filter((t: any) => t.endTime !== undefined).length;
		text += `\n${theme.fg("accent", `${completed} tools executed`)}`;
	}

	// Show final output (truncated)
	const finalOutput = getFinalOutput(r.messages);
	if (finalOutput) {
		const preview = finalOutput.length > 100 ? finalOutput.slice(0, 100) + "..." : finalOutput;
		// Only show preview if there's actual content (not just whitespace)
		if (preview.trim()) {
			text += `\n${theme.fg("dim", preview)}`;
		}
	}

	// Show stats
	const usageStr = formatUsageStats(r.usage, r.model);
	const duration = formatDuration(r.startTime, r.endTime);
	if (usageStr || duration) {
		text += `\n${theme.fg("dim", usageStr + (duration ? ` • ${duration}` : ""))}`;
	}

	return new Text(text, 0, 0);
}

function renderChainResult(details: SubagentDetails, expanded: boolean, theme: any, mdTheme: any): Container | Text {
	const successCount = details.results.filter((r) => r.exitCode === 0).length;
	const statusSymbol = successCount === details.results.length ? theme.fg("success", "[OK]") : theme.fg("error", "[FAIL]");
	const totalDuration = details.results.reduce((sum, r) => sum + (r.endTime && r.startTime ? r.endTime - r.startTime : 0), 0);

	if (expanded) {
		const container = new Container();
		container.addChild(
			new Text(statusSymbol + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`), 0, 0),
		);

		for (const r of details.results) {
			let rStatus: string;
			if (r.status === "searching" || r.status === "generating") {
				rStatus = theme.fg("warning", "[GEN]");
			} else {
				rStatus = r.exitCode === 0 ? theme.fg("success", "[OK]") : theme.fg("error", "[FAIL]");
			}
			const displayItems = getDisplayItems(r.messages);
			const finalOutput = getFinalOutput(r.messages);
			const duration = formatDuration(r.startTime, r.endTime);

			container.addChild(new Spacer(1));
			container.addChild(new Text(`${theme.fg("muted", `--- Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rStatus}`, 0, 0));
			container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

			// Show tool calls with details
			if (r.toolCalls && r.toolCalls.length > 0) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", `Tool Calls (${r.toolCalls.length}):`), 0, 0));

				for (const toolCall of r.toolCalls) {
					const duration = toolCall.duration ? `${toolCall.duration.toFixed(2)}s` : "running";
					const status = toolCall.isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

					// Show tool call header
					container.addChild(new Text(
						`  ${status} ${theme.fg("accent", toolCall.toolName)} ${theme.fg("dim", `"${JSON.stringify(toolCall.args)}"`)}`,
						0, 0
					));
					container.addChild(new Text(
						theme.fg("dim", `     Time: ${duration}`),
						0, 0
					));

					// Show tool result if available
					if (toolCall.result) {
						// Only show Result header for read tool
						if (toolCall.toolName === "read") {
							container.addChild(new Text(theme.fg("muted", "     Result:"), 0, 0));
						}

						// Check if result has content array
						if (toolCall.result.content && Array.isArray(toolCall.result.content)) {
							for (const item of toolCall.result.content) {
								if (item.type === "text" && item.text) {
									const formatted = formatToolResult(item.text, theme.fg.bind(theme), 2, toolCall.toolName);
									if (formatted) container.addChild(new Text(formatted, 0, 0));
								} else {
									const formatted = formatToolResult(item, theme.fg.bind(theme), 2, toolCall.toolName);
									if (formatted) container.addChild(new Text(formatted, 0, 0));
								}
							}
						} else {
							const formatted = formatToolResult(toolCall.result, theme.fg.bind(theme), 2, toolCall.toolName);
							if (formatted) container.addChild(new Text(formatted, 0, 0));
						}
					}

					// Show error if failed
					if (toolCall.isError && toolCall.result) {
						container.addChild(new Text(
							theme.fg("error", `     Error: ${JSON.stringify(toolCall.result)}`),
							0, 0
						));
					}

					container.addChild(new Spacer(0.5));
				}
			}

			// Show final output
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "Output:"), 0, 0));
				container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
			}

			const stepUsage = formatUsageStats(r.usage, r.model);
			if (stepUsage || duration) {
				container.addChild(new Spacer(1));
				let statsText = "";
				if (stepUsage) statsText += stepUsage;
				if (duration) statsText += (statsText ? " • " : "") + `Duration: ${duration}`;
				container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
			}
		}

		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			container.addChild(new Spacer(1));
			let totalText = "";
			if (usageStr) totalText += `Total: ${usageStr}`;
			if (totalDuration > 0) totalText += (totalText ? " • " : "") + `Duration: ${formatDuration(0, totalDuration)}`;
			container.addChild(new Text(theme.fg("dim", totalText), 0, 0));
		}
		return container;
	}

	let text =
		statusSymbol + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`);
	for (const r of details.results) {
		let rStatus: string;
		if (r.status === "searching" || r.status === "generating") {
			rStatus = theme.fg("warning", "[GEN]");
		} else {
			rStatus = r.exitCode === 0 ? theme.fg("success", "[OK]") : theme.fg("error", "[FAIL]");
		}
		const displayItems = getDisplayItems(r.messages);
		const duration = formatDuration(r.startTime, r.endTime);
		text += `\n\n${theme.fg("muted", `--- Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rStatus}`;
		if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
		else text += `\n${renderDisplayItems(displayItems, false)}`;
		if (duration) text += `\n${theme.fg("dim", `Duration: ${duration}`)}`;
	}
	const usageStr = formatUsageStats(aggregateUsage(details.results));
	if (usageStr || totalDuration > 0) {
		text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
		if (totalDuration > 0) text += ` ${theme.fg("accent", `Duration: ${formatDuration(0, totalDuration)}`)}`;
	}
	text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}

function renderParallelResult(details: SubagentDetails, expanded: boolean, theme: any, mdTheme: any): Container | Text {
	const running = details.results.filter((r) => r.exitCode === -1).length;
	const successCount = details.results.filter((r) => r.exitCode === 0).length;
	const failCount = details.results.filter((r) => r.exitCode > 0).length;
	const isRunning = running > 0;
	const statusSymbol = isRunning ? theme.fg("warning", "[RUN]") : failCount > 0 ? theme.fg("warning", "[PARTIAL]") : theme.fg("success", "[OK]");
	const status = isRunning
		? `${successCount + failCount}/${details.results.length} done, ${running} running`
		: `${successCount}/${details.results.length} tasks`;
	const totalDuration = details.results.reduce((sum, r) => sum + (r.endTime && r.startTime ? r.endTime - r.startTime : 0), 0);

	if (expanded && !isRunning) {
		const container = new Container();
		container.addChild(new Text(`${statusSymbol} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));

		for (const r of details.results) {
			let rStatus: string;
			if (r.status === "searching" || r.status === "generating") {
				rStatus = theme.fg("warning", "[GEN]");
			} else {
				rStatus = r.exitCode === 0 ? theme.fg("success", "[OK]") : theme.fg("error", "[FAIL]");
			}
			const displayItems = getDisplayItems(r.messages);
			const finalOutput = getFinalOutput(r.messages);
			const duration = formatDuration(r.startTime, r.endTime);

			container.addChild(new Spacer(1));
			container.addChild(new Text(`${theme.fg("muted", "--- ") + theme.fg("accent", r.agent)} ${rStatus}`, 0, 0));
			container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

			// Show tool calls with details
			if (r.toolCalls && r.toolCalls.length > 0) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", `Tool Calls (${r.toolCalls.length}):`), 0, 0));

				for (const toolCall of r.toolCalls) {
					const duration = toolCall.duration ? `${toolCall.duration.toFixed(2)}s` : "running";
					const status = toolCall.isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

					// Show tool call header
					container.addChild(new Text(
						`  ${status} ${theme.fg("accent", toolCall.toolName)} ${theme.fg("dim", `"${JSON.stringify(toolCall.args)}"`)}`,
						0, 0
					));
					container.addChild(new Text(
						theme.fg("dim", `     Time: ${duration}`),
						0, 0
					));

					// Show tool result if available
					if (toolCall.result) {
						// Only show Result header for read tool
						if (toolCall.toolName === "read") {
							container.addChild(new Text(theme.fg("muted", "     Result:"), 0, 0));
						}

						// Check if result has content array
						if (toolCall.result.content && Array.isArray(toolCall.result.content)) {
							for (const item of toolCall.result.content) {
								if (item.type === "text" && item.text) {
									const formatted = formatToolResult(item.text, theme.fg.bind(theme), 2, toolCall.toolName);
									if (formatted) container.addChild(new Text(formatted, 0, 0));
								} else {
									const formatted = formatToolResult(item, theme.fg.bind(theme), 2, toolCall.toolName);
									if (formatted) container.addChild(new Text(formatted, 0, 0));
								}
							}
						} else {
							const formatted = formatToolResult(toolCall.result, theme.fg.bind(theme), 2, toolCall.toolName);
							if (formatted) container.addChild(new Text(formatted, 0, 0));
						}
					}

					// Show error if failed
					if (toolCall.isError && toolCall.result) {
						container.addChild(new Text(
							theme.fg("error", `     Error: ${JSON.stringify(toolCall.result)}`),
							0, 0
						));
					}

					container.addChild(new Spacer(0.5));
				}
			}

			// Show final output
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "Output:"), 0, 0));
				container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
			}

			const taskUsage = formatUsageStats(r.usage, r.model);
			if (taskUsage || duration) {
				container.addChild(new Spacer(1));
				let statsText = "";
				if (taskUsage) statsText += taskUsage;
				if (duration) statsText += (statsText ? " • " : "") + `Duration: ${duration}`;
				container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
			}
		}

		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			container.addChild(new Spacer(1));
			let totalText = "";
			if (usageStr) totalText += `Total: ${usageStr}`;
			if (totalDuration > 0) totalText += (totalText ? " • " : "") + `Duration: ${formatDuration(0, totalDuration)}`;
			container.addChild(new Text(theme.fg("dim", totalText), 0, 0));
		}
		return container;
	}

	let text = `${statusSymbol} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
	for (const r of details.results) {
		let rStatus: string;
		if (r.status === "searching" || r.status === "generating") {
			rStatus = theme.fg("warning", "[GEN]");
		} else {
			rStatus = r.exitCode === -1 ? theme.fg("warning", "[RUN]") : r.exitCode === 0 ? theme.fg("success", "[OK]") : theme.fg("error", "[FAIL]");
		}
		const displayItems = getDisplayItems(r.messages);
		const duration = formatDuration(r.startTime, r.endTime);
		text += `\n\n${theme.fg("muted", "--- ")}${theme.fg("accent", r.agent)} ${rStatus}`;
		if (displayItems.length === 0)
			text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
		else text += `\n${renderDisplayItems(displayItems, false)}`;
		if (duration && r.exitCode !== -1) text += `\n${theme.fg("dim", `Duration: ${duration}`)}`;
	}
	if (!isRunning) {
		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
			if (totalDuration > 0) text += ` ${theme.fg("accent", `Duration: ${formatDuration(0, totalDuration)}`)}`;
		}
	}
	if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}