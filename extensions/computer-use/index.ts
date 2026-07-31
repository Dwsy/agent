import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { ComputerUseMcpClient } from "./mcp-client.mjs";

const SERVER_NAME = "computer-use";
const TOOL_PREFIX = "computer_use_";
const PROGRESSIVE_TOOL_NAME = "computer_use";
const ACTION_LIST = "action-list";
const ACTION_SCHEMA = "action-schema";

type RegistrationMode = "progressive" | "full";

const COMPUTER_USE_INSTRUCTIONS = `
Computer Use controls local macOS applications. The default progressive tool is computer_use:
1. Start with action="action-list" to discover available actions.
2. Use action="action-schema" with obj={"action":"<name>"} to inspect an action's input/output definition.
3. Execute a discovered action with action="<name>" and obj containing its arguments.
4. For GUI work, observe state before and after actions. Start with get_app_state for the named app and use only fresh element indices.
5. Prefer accessibility elements; use screenshot coordinates only as a fallback.
When full mode is enabled, equivalent tools are exposed as computer_use_<action>.
Dedicated APIs, connectors, and CLIs take precedence over GUI automation.
`;

interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
}

interface McpResult {
	content?: Array<Record<string, unknown>>;
	isError?: boolean;
	[key: string]: unknown;
}

type PiContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

function getParametersSchema(tool: McpTool): any {
	const schema = tool.inputSchema;
	if (!schema || typeof schema !== "object") {
		return { type: "object", properties: {}, additionalProperties: false };
	}
	return { type: "object", properties: {}, ...schema };
}

function toPiContent(result: McpResult): PiContent[] {
	const converted: PiContent[] = [];

	for (const item of result.content ?? []) {
		if (item.type === "text" && typeof item.text === "string") {
			converted.push({ type: "text", text: item.text });
			continue;
		}
		if (
			item.type === "image" &&
			typeof item.data === "string" &&
			typeof item.mimeType === "string"
		) {
			converted.push({ type: "image", data: item.data, mimeType: item.mimeType });
			continue;
		}
		converted.push({ type: "text", text: JSON.stringify(item, null, 2) });
	}

	if (converted.length === 0) {
		converted.push({ type: "text", text: JSON.stringify(result, null, 2) });
	}
	return converted;
}

function resultText(content: PiContent[]): string {
	return content
		.filter((item): item is Extract<PiContent, { type: "text" }> => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

function textResult(value: unknown, details: Record<string, unknown> = {}) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
		details,
	};
}

function asObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export default function (pi: ExtensionAPI) {
	let client: ComputerUseMcpClient | undefined;
	let mode: RegistrationMode = "progressive";
	let registeredToolNames: string[] = [];
	let toolCatalog = new Map<string, McpTool>();
	const registered = new Set<string>();

	const syncActiveTools = () => {
		const ownTools = new Set([PROGRESSIVE_TOOL_NAME, ...registeredToolNames]);
		const active = pi.getActiveTools().filter((name) => !ownTools.has(name));
		const selected = mode === "full" ? registeredToolNames : [PROGRESSIVE_TOOL_NAME];
		pi.setActiveTools([...new Set([...active, ...selected])]);
	};

	const callAction = async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
		if (signal.aborted) throw new Error(`${name} aborted before execution`);
		client ??= new ComputerUseMcpClient();
		const result = (await client.callTool(name, args, signal)) as McpResult;
		const content = toPiContent(result);
		if (result.isError) throw new Error(resultText(content) || `${name} failed`);
		return {
			content,
			details: { server: SERVER_NAME, upstreamTool: name },
		};
	};

	pi.registerTool({
		name: PROGRESSIVE_TOOL_NAME,
		label: "Computer Use",
		description:
			"Progressive Computer Use gateway. Start with action-list, inspect an action with action-schema, then execute it with action + obj.",
		promptSnippet: "Discover and call local Computer Use actions progressively through action + obj.",
		promptGuidelines: [
			`Call ${ACTION_LIST} before guessing action names.`,
			`Call ${ACTION_SCHEMA} with obj.action before using an unfamiliar action.`,
			"Use dedicated APIs, connectors, or CLIs instead when available.",
			"For GUI work, observe state before and after actions and use only current element indices.",
		],
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						`Use ${ACTION_LIST}, ${ACTION_SCHEMA}, or an action name returned by ${ACTION_LIST}.`,
				},
				obj: {
					type: "object",
					description:
						`Arguments for the selected action. For ${ACTION_SCHEMA}, pass {"action":"<name>"}.`,
					additionalProperties: true,
				},
			},
			required: ["action"],
			additionalProperties: false,
		},
		async execute(_toolCallId, params, signal) {
			const action = String(params.action ?? "").trim();
			const obj = asObject(params.obj);

			if (action === ACTION_LIST) {
				return textResult(
					[...toolCatalog.values()].map((tool) => ({
						action: tool.name,
						description: tool.description ?? "",
					})),
					{ mode, metaAction: ACTION_LIST },
				);
			}

			if (action === ACTION_SCHEMA) {
				const requested = String(obj.action ?? obj.name ?? "").trim();
				const tool = toolCatalog.get(requested);
				if (!tool) {
					throw new Error(`Unknown action: ${requested || "<empty>"}. Call ${ACTION_LIST} first.`);
				}
				return textResult(
					{
						action: tool.name,
						description: tool.description ?? "",
						input: getParametersSchema(tool),
						output: tool.outputSchema ?? null,
					},
					{ mode, metaAction: ACTION_SCHEMA, action: tool.name },
				);
			}

			if (!toolCatalog.has(action)) {
				throw new Error(`Unknown action: ${action || "<empty>"}. Call ${ACTION_LIST} first.`);
			}
			return callAction(action, obj, signal);
		},
		renderCall(args, theme) {
			const action = typeof args.action === "string" ? args.action : "action-list";
			return new Text(
				theme.fg("toolTitle", theme.bold("computer-use ")) +
					theme.fg("accent", action) +
					theme.fg("dim", args.obj ? ` ${JSON.stringify(args.obj)}` : ""),
				0,
				0,
			);
		},
	});

	pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n${COMPUTER_USE_INSTRUCTIONS}`,
	}));

	pi.on("session_start", async (_event, ctx) => {
		try {
			client ??= new ComputerUseMcpClient();
			const tools = (await client.listTools()) as McpTool[];
			toolCatalog = new Map(tools.map((tool) => [tool.name, tool]));
			registeredToolNames = tools.map((tool) => `${TOOL_PREFIX}${tool.name}`);

			for (const tool of tools) {
				const piToolName = `${TOOL_PREFIX}${tool.name}`;
				if (registered.has(piToolName)) continue;

				pi.registerTool({
					name: piToolName,
					label: `Computer Use: ${tool.name}`,
					description: `[${SERVER_NAME}] ${tool.description ?? tool.name}`,
					promptSnippet: tool.description ?? `Call Computer Use tool ${tool.name}`,
					promptGuidelines: [
						"Use dedicated APIs, connectors, or CLIs instead when available.",
						"For GUI work, observe state before and after actions and use only current element indices.",
					],
					parameters: getParametersSchema(tool),
					async execute(_toolCallId, params, signal) {
						return callAction(tool.name, params as Record<string, unknown>, signal);
					},
					renderCall(args, theme) {
						const suffix = Object.keys(args ?? {}).length > 0 ? ` ${JSON.stringify(args)}` : "";
						return new Text(
							theme.fg("toolTitle", theme.bold("computer-use ")) +
								theme.fg("accent", tool.name) +
								theme.fg("dim", suffix),
							0,
							0,
						);
					},
				});
				registered.add(piToolName);
			}

			syncActiveTools();
			ctx.ui.notify(`${SERVER_NAME} loaded ${tools.length} actions · mode=${mode}`, "info");
		} catch (error) {
			registeredToolNames = [];
			toolCatalog.clear();
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`${SERVER_NAME} failed to load: ${message}`, "error");
		}
	});

	pi.on("session_shutdown", async () => {
		client?.close();
		client = undefined;
	});

	pi.registerCommand("computer-use-mode", {
		description: "Switch Computer Use tools: progressive (default) or full",
		getArgumentCompletions: (prefix: string) => {
			const values = ["progressive", "full", "toggle", "status"];
			const matches = values.filter((value) => value.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (requested === "status") {
				ctx.ui.notify(`${SERVER_NAME}: mode=${mode}`, "info");
				return;
			}
			if (!requested || requested === "toggle") {
				mode = mode === "progressive" ? "full" : "progressive";
			} else if (requested === "progressive" || requested === "full") {
				mode = requested;
			} else {
				ctx.ui.notify("Usage: /computer-use-mode [progressive|full|toggle|status]", "error");
				return;
			}
			syncActiveTools();
			ctx.ui.notify(
				mode === "progressive"
					? `${SERVER_NAME}: progressive · active tool=${PROGRESSIVE_TOOL_NAME}`
					: `${SERVER_NAME}: full · active tools=${registeredToolNames.length}`,
				"info",
			);
		},
	});

	pi.registerCommand("computer-use-status", {
		description: "Show Computer Use mode, loaded actions, and local runtime status",
		handler: async (_args, ctx) => {
			try {
				client ??= new ComputerUseMcpClient();
				const tools = (await client.listTools()) as McpTool[];
				ctx.ui.notify(
					`${SERVER_NAME}: online · mode=${mode} · actions=${tools.map((tool) => tool.name).join(", ")}`,
					"info",
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`${SERVER_NAME}: offline · ${message}`, "error");
			}
		},
	});
}
