/**
 * UI rendering for subagent results
 */

import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { SubagentDetails, SingleResult } from "../types.js";
import { getDisplayItems, formatToolCall, aggregateUsage, renderDisplayItems } from "./formatter.js";
import { formatUsageStats, getFinalOutput, formatDuration } from "../utils/formatter.js";

// Animation state for generating agents
const animationFrames = [".  ", ".. ", "..."];
let animationIndex = 0;

function getAnimatedGenText(status: SingleResult["status"], stage: string): string {
	animationIndex = (animationIndex + 1) % animationFrames.length;
	const dots = animationFrames[animationIndex];

	switch (status) {
		case "searching":
			return `🔍 Searching for existing agent${dots}`;
		case "generating":
			if (stage?.includes("Saving")) {
				return `💾 Saving agent${dots}`;
			}
			return `⚙️ Generating dynamic agent${dots}`;
		case "error":
			return "✗ Agent generation failed";
		case "completed":
			return "✓ Agent generation complete";
		default:
			return `⚙️ Agent creation${dots}`;
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
			let header = `${theme.fg("warning", "⚙️")} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", " (dynamic)")}`;
			container.addChild(new Text(header, 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "─── Generation Status ───"), 0, 0));
			container.addChild(new Text(theme.fg("accent", animatedText), 0, 0));
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
			container.addChild(new Text(theme.fg("dim", r.task), 0, 0));

			// Show real-time generation output
			if (r.messages && r.messages.length > 0) {
				const displayItems = getDisplayItems(r.messages);
				if (displayItems.length > 0) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Generation Output ───"), 0, 0));
					for (const item of displayItems) {
						if (item.type === "text") {
							// Show partial content with dim color
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

		let text = `${theme.fg("warning", "⚙️")} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", " (dynamic)")}`;
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
	const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const displayItems = getDisplayItems(r.messages);
	const finalOutput = getFinalOutput(r.messages);
	const duration = formatDuration(r.startTime, r.endTime);

	if (expanded) {
		const container = new Container();
		let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
		if (isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
		container.addChild(new Text(header, 0, 0));
		if (isError && r.errorMessage) container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
		container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
		if (displayItems.length === 0 && !finalOutput) {
			container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
		} else {
			for (const item of displayItems) {
				if (item.type === "toolCall")
					container.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
			}
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
			}
		}
		const usageStr = formatUsageStats(r.usage, r.model);
		if (usageStr || duration) {
			container.addChild(new Spacer(1));
			let statsText = "";
			if (usageStr) statsText += usageStr;
			if (duration) statsText += (statsText ? " • " : "") + theme.fg("accent", `⏱ ${duration}`);
			container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
		}
		return container;
	}

	let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
	if (isError && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
	if (isError && r.errorMessage) text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
	else if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
	else {
		text += `\n${renderDisplayItems(displayItems, expanded, theme)}`;
		if (displayItems.length > 10) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	}
	const usageStr = formatUsageStats(r.usage, r.model);
	if (usageStr || duration) {
		text += `\n${theme.fg("dim", usageStr + (duration ? ` • ${theme.fg("accent", `⏱ ${duration}`)}` : ""))}`;
	}
	return new Text(text, 0, 0);
}

function renderChainResult(details: SubagentDetails, expanded: boolean, theme: any, mdTheme: any): Container | Text {
	const successCount = details.results.filter((r) => r.exitCode === 0).length;
	const icon = successCount === details.results.length ? theme.fg("success", "✓") : theme.fg("error", "✗");
	const totalDuration = details.results.reduce((sum, r) => sum + (r.endTime && r.startTime ? r.endTime - r.startTime : 0), 0);

	if (expanded) {
		const container = new Container();
		container.addChild(
			new Text(icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`), 0, 0),
		);

		for (const r of details.results) {
			let rIcon: string;
			if (r.status === "searching" || r.status === "generating") {
				rIcon = theme.fg("warning", "⚙️");
			} else {
				rIcon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
			}
			const displayItems = getDisplayItems(r.messages);
			const finalOutput = getFinalOutput(r.messages);
			const duration = formatDuration(r.startTime, r.endTime);

			container.addChild(new Spacer(1));
			container.addChild(new Text(`${theme.fg("muted", `─── Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
			container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

			for (const item of displayItems) {
				if (item.type === "toolCall") {
					container.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
				}
			}

			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
			}

			const stepUsage = formatUsageStats(r.usage, r.model);
			if (stepUsage || duration) {
				let statsText = "";
				if (stepUsage) statsText += stepUsage;
				if (duration) statsText += (statsText ? " • " : "") + theme.fg("accent", `⏱ ${duration}`);
				container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
			}
		}

		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			container.addChild(new Spacer(1));
			let totalText = "";
			if (usageStr) totalText += `Total: ${usageStr}`;
			if (totalDuration > 0) totalText += (totalText ? " • " : "") + theme.fg("accent", `⏱ ${formatDuration(0, totalDuration)}`);
			container.addChild(new Text(theme.fg("dim", totalText), 0, 0));
		}
		return container;
	}

	let text =
		icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`);
	for (const r of details.results) {
		let rIcon: string;
		if (r.status === "searching" || r.status === "generating") {
			rIcon = theme.fg("warning", "⚙️");
		} else {
			rIcon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
		}
		const displayItems = getDisplayItems(r.messages);
		const duration = formatDuration(r.startTime, r.endTime);
		text += `\n\n${theme.fg("muted", `─── Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}`;
		if (displayItems.length === 0) text += `\n${theme.fg("muted", "(no output)")}`;
		else text += `\n${renderDisplayItems(displayItems, false)}`;
		if (duration) text += `\n${theme.fg("dim", `⏱ ${duration}`)}`;
	}
	const usageStr = formatUsageStats(aggregateUsage(details.results));
	if (usageStr || totalDuration > 0) {
		text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
		if (totalDuration > 0) text += ` ${theme.fg("accent", `⏱ ${formatDuration(0, totalDuration)}`)}`;
	}
	text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}

function renderParallelResult(details: SubagentDetails, expanded: boolean, theme: any, mdTheme: any): Container | Text {
	const running = details.results.filter((r) => r.exitCode === -1).length;
	const successCount = details.results.filter((r) => r.exitCode === 0).length;
	const failCount = details.results.filter((r) => r.exitCode > 0).length;
	const isRunning = running > 0;
	const icon = isRunning ? theme.fg("warning", "⏳") : failCount > 0 ? theme.fg("warning", "◐") : theme.fg("success", "✓");
	const status = isRunning
		? `${successCount + failCount}/${details.results.length} done, ${running} running`
		: `${successCount}/${details.results.length} tasks`;
	const totalDuration = details.results.reduce((sum, r) => sum + (r.endTime && r.startTime ? r.endTime - r.startTime : 0), 0);

	if (expanded && !isRunning) {
		const container = new Container();
		container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));

		for (const r of details.results) {
			let rIcon: string;
			if (r.status === "searching" || r.status === "generating") {
				rIcon = theme.fg("warning", "⚙️");
			} else {
				rIcon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
			}
			const displayItems = getDisplayItems(r.messages);
			const finalOutput = getFinalOutput(r.messages);
			const duration = formatDuration(r.startTime, r.endTime);

			container.addChild(new Spacer(1));
			container.addChild(new Text(`${theme.fg("muted", "─── ") + theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
			container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));

			for (const item of displayItems) {
				if (item.type === "toolCall") {
					container.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
				}
			}

			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
			}

			const taskUsage = formatUsageStats(r.usage, r.model);
			if (taskUsage || duration) {
				let statsText = "";
				if (taskUsage) statsText += taskUsage;
				if (duration) statsText += (statsText ? " • " : "") + theme.fg("accent", `⏱ ${duration}`);
				container.addChild(new Text(theme.fg("dim", statsText), 0, 0));
			}
		}

		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			container.addChild(new Spacer(1));
			let totalText = "";
			if (usageStr) totalText += `Total: ${usageStr}`;
			if (totalDuration > 0) totalText += (totalText ? " • " : "") + theme.fg("accent", `⏱ ${formatDuration(0, totalDuration)}`);
			container.addChild(new Text(theme.fg("dim", totalText), 0, 0));
		}
		return container;
	}

	let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
	for (const r of details.results) {
		let rIcon: string;
		if (r.status === "searching" || r.status === "generating") {
			rIcon = theme.fg("warning", "⚙️");
		} else {
			rIcon = r.exitCode === -1 ? theme.fg("warning", "⏳") : r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
		}
		const displayItems = getDisplayItems(r.messages);
		const duration = formatDuration(r.startTime, r.endTime);
		text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}`;
		if (displayItems.length === 0)
			text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
		else text += `\n${renderDisplayItems(displayItems, false)}`;
		if (duration && r.exitCode !== -1) text += `\n${theme.fg("dim", `⏱ ${duration}`)}`;
	}
	if (!isRunning) {
		const usageStr = formatUsageStats(aggregateUsage(details.results));
		if (usageStr || totalDuration > 0) {
			text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
			if (totalDuration > 0) text += ` ${theme.fg("accent", `⏱ ${formatDuration(0, totalDuration)}`)}`;
		}
	}
	if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}