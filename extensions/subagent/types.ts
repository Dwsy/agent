/**
 * Type definitions for subagent extension
 */

import type { Message } from "@mariozechner/pi-ai";
import type { AgentConfig, AgentScope, AgentSource as BaseAgentSource } from "./agents.js";

export type AgentSource = BaseAgentSource | "unknown";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	agent: string;
	agentSource: AgentSource;
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	startTime?: number;
	endTime?: number;
	status?: "searching" | "generating" | "running" | "completed" | "error";
	generationStage?: string;
}

export interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
}

export type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, any> };

export interface SubagentParams {
	agent?: string;
	task?: string;
	tasks?: Array<{ agent: string; task: string; cwd?: string }>;
	chain?: Array<{ agent: string; task: string; cwd?: string }>;
	agentScope?: AgentScope;
	confirmProjectAgents?: boolean;
	cwd?: string;
}

export interface OnUpdateCallback {
	(partial: { content: Array<{ type: string; text?: string }>; details?: SubagentDetails }): void;
}

export interface AgentRunnerOptions {
	defaultCwd: string;
	agents: AgentConfig[];
	agentName: string;
	task: string;
	cwd?: string;
	step?: number;
	signal?: AbortSignal;
	onUpdate?: OnUpdateCallback;
	makeDetails: (results: SingleResult[]) => SubagentDetails;
}

export interface ProcessResult {
	exitCode: number;
	messages: Message[];
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	stderr: string;
}