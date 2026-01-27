/**
 * Type definitions for subagent extension
 */

import type { Message } from "@mariozechner/pi-ai";
import type { AgentConfig, AgentScope, AgentSource as BaseAgentSource } from "./agents.js";

export type AgentSource = BaseAgentSource | "unknown";

/**
 * 从 pi 进程接收的 JSON 事件类型
 */
export type PiProcessEvent =
	| { type: "message_start"; message: Message; usage?: any }
	| { type: "message_end"; message: Message; usage?: any }
	| { type: "thinking_start"; contentIndex: number; partial: Message }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: Message }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: Message }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean; usage?: any };

/**
 * 使用统计
 */
export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

/**
 * 工具调用历史记录
 */
export interface ToolCallRecord {
	toolName: string;
	toolCallId: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	args: any;
	partialResults?: string[];
	result?: any;
	isError?: boolean;
	tokens?: number;
}

/**
 * 单个子代理执行结果
 */
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
	duration?: number;

	// 动态代理生成状态
	status?: "searching" | "generating" | "running" | "completed" | "error";
	generationStage?: string;

	// 工具调用历史
	toolCalls?: ToolCallRecord[];

	// 当前正在执行的工具
	currentTool?: {
		toolName: string;
		toolCallId: string;
		startTime: number;
		partialResult?: string;
	};

	// 思考过程
	thinking?: string[];
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
	(partial: { content: Array<{ type: string; text?: string }>; details?: SubagentDetails }, realtimeUpdate?: RealtimeUpdate): void;
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