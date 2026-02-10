/**
 * JSON event parser for subagent output
 */

import type { Message } from "@mariozechner/pi-ai";
import type { UsageStats, PiProcessEvent } from "../types.js";

export function parseEventLine(line: string): PiProcessEvent | null {
	if (!line.trim()) return null;
	try {
		return JSON.parse(line) as PiProcessEvent;
	} catch {
		return null;
	}
}

export function extractUsageFromEvent(event: PiProcessEvent): {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: number;
	totalTokens?: number;
} | null {
	if (event.type === "message_end" || event.type === "tool_execution_end") {
		return event.usage || null;
	}
	return null;
}

export function accumulateUsage(current: UsageStats, event: PiProcessEvent): void {
	const usage = extractUsageFromEvent(event);
	if (usage) {
		current.input += usage.input ?? 0;
		current.output += usage.output ?? 0;
		current.cacheRead += usage.cacheRead ?? 0;
		current.cacheWrite += usage.cacheWrite ?? 0;
		current.cost += usage.cost ?? 0;
		current.contextTokens = usage.totalTokens ?? 0;
	}
}

export function createInitialUsage(): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	};
}