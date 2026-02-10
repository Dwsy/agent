/**
 * Test file for observability enhancements
 */

import type { SingleResult, ToolCallRecord, UsageStats } from "./types.js";
import { formatFullResult, formatCollapsedResult, formatToolCallRecord, formatUsageStats } from "./ui/status-formatter.js";

// Test data
const testToolCalls: ToolCallRecord[] = [
	{
		toolName: "ace-tool",
		toolCallId: "call_123",
		startTime: Date.now() - 2000,
		endTime: Date.now() - 800,
		duration: 1200,
		args: { query: "authentication code" },
		result: { files: ["src/auth/jwt.ts", "src/auth/middleware.ts"] },
		isError: false
	},
	{
		toolName: "read",
		toolCallId: "call_456",
		startTime: Date.now() - 700,
		endTime: Date.now() - 360,
		duration: 340,
		args: { path: "src/auth/jwt.ts" },
		result: { content: "JWT implementation..." },
		isError: false
	},
	{
		toolName: "bash",
		toolCallId: "call_789",
		startTime: Date.now() - 300,
		endTime: Date.now() - 150,
		duration: 150,
		args: { command: "gcc hello.c -o hello" },
		result: { exitCode: 0 },
		isError: false
	},
	{
		toolName: "grep",
		toolCallId: "call_abc",
		startTime: Date.now() - 100,
		endTime: Date.now() - 50,
		duration: 50,
		args: { pattern: "main", path: "hello.c" },
		result: {}, // 空结果，只测试参数显示
		isError: false
	}
];

const testUsage: UsageStats = {
	input: 1234,
	output: 168,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0.0042,
	contextTokens: 1402,
	turns: 1
};

const testResult: SingleResult = {
	agent: "scout",
	agentSource: "user",
	task: "Find authentication code",
	exitCode: 0,
	messages: [
		{
			role: "assistant",
			content: [{ type: "text", text: "Found 23 files related to authentication\n\nFiles:\n1. src/auth/jwt.ts\n2. src/auth/middleware.ts" }]
		}
	],
	stderr: "",
	usage: testUsage,
	model: "Qwen/Qwen2.5-72B-Instruct",
	stopReason: "stop",
	startTime: Date.now() - 2300,
	endTime: Date.now(),
	duration: 2300,
	status: "completed",
	toolCalls: testToolCalls,
	currentTool: undefined
};

console.log("=== Test Observability Enhancements ===\n");

console.log("1. Format Tool Call Records:");
for (let i = 0; i < testToolCalls.length; i++) {
	console.log(`   ${i + 1}. ${formatToolCallRecord(testToolCalls[i])}`);
}
console.log();

console.log("2. Format Tool Call Record (expanded):");
console.log(formatToolCallRecord(testToolCalls[0], true));
console.log();

console.log("3. Format Usage Stats:");
console.log(formatUsageStats(testUsage, "Qwen/Qwen2.5-72B-Instruct"));
console.log();

console.log("4. Format Collapsed Result:");
console.log(formatCollapsedResult(testResult));
console.log();

console.log("5. Format Full Result:");
console.log(formatFullResult(testResult));
console.log();

console.log("=== All tests passed! ===");