/**
 * Base interface for execution modes
 */

import type { SingleResult, SubagentDetails, OnUpdateCallback } from "../types.js";
import type { AgentConfig } from "../agents.js";

export interface ExecutionContext {
	defaultCwd: string;
	agents: AgentConfig[];
	signal?: AbortSignal;
	onUpdate?: OnUpdateCallback;
}

export interface ModeResult {
	content: Array<{ type: string; text?: string }>;
	details: SubagentDetails;
	isError?: boolean;
}

export interface ExecutionMode {
	execute(ctx: ExecutionContext, params: any): Promise<ModeResult>;
}