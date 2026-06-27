import { keyText, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "codebase-memory-mcp";
const BRIDGE_URL = process.env.CODEBASE_MEMORY_MCP_BRIDGE_URL ?? "http://127.0.0.1:9750";
const UI_URL = "http://127.0.0.1:9749/";
const DAEMON_PATH = join(dirname(fileURLToPath(import.meta.url)), "daemon.mjs");
const REQUEST_TIMEOUT_MS = 120_000;
const MCP_OUTPUT_MODE = process.env.CODEBASE_MEMORY_MCP_OUTPUT_MODE ?? "hidden";
const COLLAPSED_PREVIEW_LINES = 8;
const EXPANDED_MAX_LINES = 4_000;

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

interface McpListToolsResult {
	tools?: McpTool[];
}

interface McpCallResult {
	content?: Array<Record<string, unknown>>;
	isError?: boolean;
	[key: string]: unknown;
}

async function isBridgeOnline(): Promise<boolean> {
	try {
		const response = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(1_500) });
		return response.ok;
	} catch {
		return false;
	}
}

async function startBridge(): Promise<void> {
	if (await isBridgeOnline()) return;

	spawn(process.execPath, [DAEMON_PATH], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env },
	}).unref();

	for (let i = 0; i < 40; i++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
		if (await isBridgeOnline()) return;
	}

	throw new Error(`${SERVER_NAME} bridge did not become ready at ${BRIDGE_URL}`);
}

async function callBridge<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
	await startBridge();
	const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
	const response = await fetch(`${BRIDGE_URL}${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: requestSignal,
	});

	const text = await response.text();
	const payload = text ? JSON.parse(text) : undefined;
	if (!response.ok) {
		throw new Error(payload?.error ?? `${path} failed with HTTP ${response.status}`);
	}
	return payload as T;
}

async function listTools(): Promise<McpTool[]> {
	const result = await callBridge<McpListToolsResult>("/tools");
	return Array.isArray(result.tools) ? result.tools : [];
}

async function callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult> {
	return callBridge<McpCallResult>("/call", { name, arguments: args }, signal);
}

function getParametersSchema(tool: McpTool): any {
	const schema = tool.inputSchema;
	if (!schema || typeof schema !== "object") {
		return { type: "object", properties: {}, additionalProperties: false };
	}
	return { type: "object", properties: {}, ...schema };
}

function formatMcpContent(result: McpCallResult): string {
	const content = result.content ?? [];
	const parts = content.map((item) => {
		if (item.type === "text" && typeof item.text === "string") return item.text;
		if (item.type === "image") return `[image:${String(item.mimeType ?? "unknown")}]`;
		if (item.type === "resource") return JSON.stringify(item.resource ?? item, null, 2);
		return JSON.stringify(item, null, 2);
	});

	return parts.join("\n") || JSON.stringify(result, null, 2);
}

function getResultText(result: { content?: Array<Record<string, unknown>> }): string {
	const text = result.content?.find((item) => item.type === "text")?.text;
	return typeof text === "string" ? text : "";
}

function getFoldSummary(text: string): { lineCount: number; charCount: number; firstLine: string } {
	const trimmed = text.trim();
	const lines = trimmed ? trimmed.split("\n") : [];
	return {
		lineCount: lines.length,
		charCount: text.length,
		firstLine: lines[0] ?? "empty result",
	};
}

function getExpandedLines(text: string): { lines: string[]; hiddenCount: number } {
	const lines = text.split("\n");
	const visible = lines.slice(0, EXPANDED_MAX_LINES);
	return { lines: visible, hiddenCount: Math.max(0, lines.length - visible.length) };
}

export default function (pi: ExtensionAPI) {
	let registeredToolNames: string[] = [];

	pi.on("session_start", async (_event, ctx) => {
		try {
			const tools = await listTools();
			registeredToolNames = tools.map((tool) => tool.name);

			for (const tool of tools) {
				pi.registerTool({
					name: tool.name,
					label: tool.name,
					description: `[${SERVER_NAME}] ${tool.description ?? tool.name}`,
					promptSnippet: tool.description ?? `Call ${SERVER_NAME} tool ${tool.name}`,
					promptGuidelines: [
						`Use ${tool.name} when the user asks for codebase-memory-mcp knowledge graph or code memory operations.`,
					],
					parameters: getParametersSchema(tool),
					async execute(_toolCallId, params, signal) {
						if (signal?.aborted) throw new Error(`${tool.name} aborted before execution`);
						const result = await callTool(tool.name, params as Record<string, unknown>, signal);
						const text = formatMcpContent(result);

						if (result.isError) {
							throw new Error(text);
						}

						return {
							content: [{ type: "text", text }],
							details: { server: SERVER_NAME, tool: tool.name, raw: result },
						};
					},
					renderCall(args, theme) {
						const suffix = Object.keys(args ?? {}).length > 0 ? ` ${JSON.stringify(args)}` : "";
						return new Text(
							theme.fg("toolTitle", theme.bold(`${SERVER_NAME} `)) + theme.fg("accent", tool.name) + theme.fg("dim", suffix),
							0,
							0,
						);
					},
					renderResult(result, { expanded }, theme) {
						const text = getResultText(result);
						const summary = getFoldSummary(text);

						if (!expanded) {
							const header =
								theme.fg("muted", `↳ result folded · ${summary.lineCount} lines · ${summary.charCount} chars`) +
								" " +
								theme.fg("dim", `${keyText("app.tools.expand")} expand`);

							if (MCP_OUTPUT_MODE === "preview") {
								const preview = text.split("\n").slice(0, COLLAPSED_PREVIEW_LINES);
								return new Text(
									[header, ...preview.map((line) => theme.fg("toolOutput", line))].join("\n"),
									0,
									0,
								);
							}

							return new Text(header, 0, 0);
						}

						const expandedResult = getExpandedLines(text);
						const suffix =
							expandedResult.hiddenCount > 0
								? `\n${theme.fg("dim", `… ${expandedResult.hiddenCount} more lines hidden by ${SERVER_NAME} renderer`)}`
								: "";
						return new Text(expandedResult.lines.map((line) => theme.fg("toolOutput", line)).join("\n") + suffix, 0, 0);
					},
				});
			}

			pi.setActiveTools([...new Set([...pi.getActiveTools(), ...registeredToolNames])]);
			ctx.ui.notify(`${SERVER_NAME} loaded ${tools.length} MCP tools · bridge ${BRIDGE_URL} · UI ${UI_URL}`, "info");
		} catch (error) {
			registeredToolNames = [];
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`${SERVER_NAME} failed to load: ${message}`, "error");
		}
	});

	pi.registerCommand("codebase-memory-mcp-status", {
		description: "Show loaded codebase-memory-mcp tools and shared daemon endpoints",
		handler: async (_args, ctx) => {
			const bridgeOnline = await isBridgeOnline();
			ctx.ui.notify(
				registeredToolNames.length > 0
					? `${SERVER_NAME}: ${registeredToolNames.join(", ")} · bridge=${bridgeOnline ? "online" : "offline"} ${BRIDGE_URL} · ui=${UI_URL}`
					: `${SERVER_NAME}: no tools loaded · bridge=${bridgeOnline ? "online" : "offline"} ${BRIDGE_URL} · ui=${UI_URL}`,
				"info",
			);
		},
	});
}
