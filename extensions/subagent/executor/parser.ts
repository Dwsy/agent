/**
 * JSON event parser for subagent output
 */

import type { Message } from "@mariozechner/pi-ai";
import type { UsageStats, ProcessResult } from "../types.js";

export interface ParsedEvent {
	type: string;
	message?: Message;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: { total: number };
		totalTokens?: number;
	};
}

export function parseEventLine(line: string): ParsedEvent | null {
	if (!line.trim()) return null;
	try {
		return JSON.parse(line) as ParsedEvent;
	} catch {
		return null;
	}
}

export function accumulateUsage(current: UsageStats, event: ParsedEvent): void {
	const usage = event.usage;
	if (usage) {
		current.input += usage.input ?? 0;
		current.output += usage.output ?? 0;
		current.cacheRead += usage.cacheRead ?? 0;
		current.cacheWrite += usage.cacheWrite ?? 0;
		current.cost += usage.cost?.total ?? 0;
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