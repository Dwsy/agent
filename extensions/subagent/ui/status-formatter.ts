/**
 * Status and realtime update formatters
 */

import type { SingleResult, ToolCallRecord, UsageStats } from "../types.js";

/**
 * 获取状态的文本描述
 */
export function getStatusText(status: string): string {
	switch (status) {
		case "searching":
			return "Searching for agent...";
		case "generating":
			return "Generating agent...";
		case "running":
			return "Running...";
		case "completed":
			return "Completed";
		case "error":
			return "Error";
		default:
			return status;
	}
}

/**
 * 格式化进度条（纯文本，无 emoji）
 */
export function formatProgressBar(percent: number, width: number = 20): string {
	const filled = Math.round((percent / 100) * width);
	const empty = width - filled;
	return `[${"=".repeat(filled)}${".".repeat(empty)}] ${percent.toFixed(0)}%`;
}

/**
 * 格式化工具调用状态
 */
export function formatToolCallRecord(toolCall: ToolCallRecord, expanded: boolean = false): string {
	let text = `-> ${toolCall.toolName}`;

	// Add simplified args for better observability
	if (toolCall.args && !expanded) {
		const argsStr = formatArgsSummary(toolCall.args, toolCall.toolName);
		if (argsStr) {
			text += ` ${argsStr}`;
		}
	}

	if (toolCall.duration !== undefined) {
		// Convert milliseconds to seconds
		const durationInSeconds = toolCall.duration / 1000;
		text += ` (${durationInSeconds.toFixed(2)}s)`;
	}

	if (toolCall.isError) {
		text += ` [FAILED]`;
	}

	if (expanded) {
		text += `\n   Args: ${JSON.stringify(toolCall.args, null, 2)}`;
		if (toolCall.result !== undefined) {
			text += `\n   Result: ${JSON.stringify(toolCall.result, null, 2)}`;
		}
		if (toolCall.isError) {
			text += `\n   Error: ${JSON.stringify(toolCall.result, null, 2)}`;
		}
	}

	return text;
}

/**
 * 格式化参数摘要（用于非展开模式）
 */
function formatArgsSummary(args: any, toolName: string): string {
	if (!args) return "";

	switch (toolName) {
		case "bash":
			return args.command ? `"${args.command}"` : "";
		case "read":
			return args.path ? `"${args.path}"` : "";
		case "write":
			return args.path ? `"${args.path}"` : "";
		case "edit":
			return args.path ? `"${args.path}"` : "";
		case "grep":
			return args.pattern ? `"${args.pattern}"` : "";
		case "find":
			return args.pattern ? `"${args.pattern}"` : "";
		case "ls":
			return args.path ? `"${args.path}"` : "";
		case "ace-tool":
			return args.query ? `"${args.query}"` : "";
		default:
			// For unknown tools, try to find a meaningful field
			const keys = Object.keys(args);
			if (keys.length === 0) return "";
			const firstKey = keys[0];
			const firstValue = args[firstKey];
			if (typeof firstValue === "string" && firstValue.length < 50) {
				return `"${firstValue}"`;
			}
			return "";
	}
}

/**
 * 格式化使用统计
 */
export function formatUsageStats(usage: UsageStats, model?: string): string {
	const parts: string[] = [];

	if (usage.input > 0 || usage.output > 0) {
		parts.push(`${usage.input.toLocaleString()} in + ${usage.output.toLocaleString()} out tokens`);
	}

	if (usage.cost > 0) {
		parts.push(`$${usage.cost.toFixed(6)}`);
	}

	if (usage.turns > 0) {
		parts.push(`${usage.turns} turns`);
	}

	if (model && parts.length > 0) {
		parts.push(`[${model}]`);
	}

	return parts.join(" • ");
}

/**
 * 格式化时间差
 */
export function formatTimeDiff(start: number, end?: number): string {
	const diff = (end || Date.now()) - start;

	if (diff < 1000) {
		return `${diff}ms`;
	}

	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 格式化执行结果摘要
 */
export function formatResultSummary(result: SingleResult): string {
	const parts: string[] = [];

	// 状态
	if (result.status === "searching" || result.status === "generating") {
		parts.push(getStatusText(result.status));
	}

	// 工具调用
	if (result.toolCalls && result.toolCalls.length > 0) {
		const completed = result.toolCalls.filter((t) => t.endTime !== undefined).length;
		parts.push(`${completed} tools executed`);
	}

	// 当前工具
	if (result.currentTool) {
		parts.push(`Running: ${result.currentTool.toolName}`);
	}

	// 使用统计
	if (result.usage && (result.usage.input > 0 || result.usage.output > 0)) {
		parts.push(formatUsageStats(result.usage, result.model));
	}

	// 执行时间
	if (result.startTime && result.duration !== undefined) {
		parts.push(formatTimeDiff(result.startTime, result.startTime + result.duration));
	} else if (result.startTime) {
		parts.push(formatTimeDiff(result.startTime));
	}

	return parts.join(" • ");
}

/**
 * 格式化完整结果（展开视图）
 */
export function formatFullResult(result: SingleResult): string {
	const lines: string[] = [];

	// 头部：代理名和任务
	const statusSymbol = result.exitCode === 0 ? "[OK]" : "[FAIL]";
	lines.push(`${statusSymbol} ${result.agent} (${result.agentSource})`);
	lines.push(`Task: ${result.task}`);
	lines.push("");

	// 工具调用历史
	if (result.toolCalls && result.toolCalls.length > 0) {
		lines.push("Tool Calls:");
		for (const toolCall of result.toolCalls) {
			lines.push(`  ${formatToolCallRecord(toolCall)}`);
		}
		lines.push("");
	}

	// 消息内容
	if (result.messages && result.messages.length > 0) {
		const lastMessage = result.messages[result.messages.length - 1];
		if (lastMessage && lastMessage.content) {
			const textContent = lastMessage.content
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text)
				.join("\n");

			if (textContent) {
				lines.push("Output:");
				lines.push(textContent.trim());
				lines.push("");
			}
		}
	}

	// 统计信息
	lines.push("Stats:");
	lines.push(`  ${formatUsageStats(result.usage, result.model)}`);
	if (result.duration !== undefined) {
		lines.push(`  Duration: ${formatTimeDiff(0, result.duration)}`);
	}

	return lines.join("\n");
}

/**
 * 格式化折叠结果（单行摘要）
 */
export function formatCollapsedResult(result: SingleResult): string {
	const statusSymbol = result.exitCode === 0 ? "[OK]" : "[FAIL]";

	if (result.status === "searching" || result.status === "generating") {
		return `${statusSymbol} ${result.agent}: ${getStatusText(result.status)}`;
	}

	if (result.currentTool) {
		return `${statusSymbol} ${result.agent}: Running ${result.currentTool.toolName}`;
	}

	const summary = formatResultSummary(result);
	return `${statusSymbol} ${result.agent}: ${summary}`;
}

/**
 * 计算进度百分比
 */
export function calculateProgress(completed: number, total: number): number {
	if (total === 0) return 0;
	return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * 从消息中提取最后一条文本内容
 */
export function getLastTextMessage(messages: any[]): string | null {
	if (!messages || messages.length === 0) return null;

	const lastMessage = messages[messages.length - 1];
	if (!lastMessage || !lastMessage.content) return null;

	const textContent = lastMessage.content
		.filter((c: any) => c.type === "text")
		.map((c: any) => c.text)
		.join("\n");

	return textContent || null;
}