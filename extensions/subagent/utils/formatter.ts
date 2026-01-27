/**
 * Utility functions for formatting and display
 */

import * as os from "node:os";

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function formatDuration(startTime?: number, endTime?: number): string {
	if (startTime === undefined || startTime === null || endTime === undefined || endTime === null) return "";
	const ms = endTime - startTime;
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 3600000) return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
	return `${Math.floor(ms / 3600000)}h${Math.floor((ms % 3600000) / 60000)}m`;
}

export function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) {
		const costStr = usage.cost >= 0.01 ? `$${usage.cost.toFixed(4)}` : `$${usage.cost.toFixed(4).replace(/0+$/, '')}`;
		parts.push(costStr);
	}
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

export function shortenPath(p: string): string {
	const home = os.homedir();
	return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

export function getFinalOutput(messages: import("@mariozechner/pi-ai").Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") {
					const text = part.text;
					// Filter out task-like messages that start with common patterns
					if (!text.startsWith("Task:") &&
					    !text.startsWith("Write a") &&
					    !text.startsWith("Create a") &&
					    !text.startsWith("Generate a") &&
					    !text.startsWith("Build a") &&
					    text.length > 0) {
						return text;
					}
				}
			}
		}
	}
	return "";
}