import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { ComputerUseMcpClient } from "./mcp-client.mjs";

const SERVER_NAME = "computer-use";
const PROGRESSIVE_TOOL_NAME = "computer_use";
const ACTION_LIST = "action-list";
const ACTION_SCHEMA = "action-schema";

type RegistrationMode = "progressive" | "skill";

// 🎯 不注入系统提示词：技能靠 frontmatter description 自路由；
// 提示词只写在工具声明里，让 agent 先阅读 computer-use 技能再动手。
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(EXTENSION_DIR, "skill");
const MODE_FILE = join(EXTENSION_DIR, ".mode");

function loadInitialMode(): RegistrationMode {
	try {
		const raw = readFileSync(MODE_FILE, "utf8").trim();
		return raw === "skill" ? raw : "progressive";
	} catch {
		return "progressive";
	}
}

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

// codemode 等脚本调用方拿到 structuredContent（含 image block），文本内容不变。
const OUTPUT_SCHEMA = {
	type: "object",
	properties: {
		content: {
			type: "array",
			items: {
				type: "object",
				properties: {
					type: { type: "string" },
					text: { type: "string" },
					data: { type: "string" },
					mimeType: { type: "string" },
				},
				required: ["type"],
			},
		},
	},
	required: ["content"],
};

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
	const content = [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
	return { content, structuredContent: { content }, details };
}

function asObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export default function (pi: ExtensionAPI) {
	let client: ComputerUseMcpClient | undefined;
	let mode: RegistrationMode = loadInitialMode();
	let toolCatalog = new Map<string, McpTool>();

	const persistMode = (next: RegistrationMode): string | undefined => {
		mode = next;
		try {
			writeFileSync(MODE_FILE, `${mode}\n`);
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	};

	const syncActiveTools = () => {
		const active = pi.getActiveTools().filter((name) => name !== PROGRESSIVE_TOOL_NAME);
		pi.setActiveTools(mode === "progressive" ? [...active, PROGRESSIVE_TOOL_NAME] : active);
	};

	const callAction = async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
		if (signal.aborted) throw new Error(`${name} aborted before execution`);
		client ??= new ComputerUseMcpClient();
		const result = (await client.callTool(name, args, signal)) as McpResult;
		const content = toPiContent(result);
		if (result.isError) throw new Error(resultText(content) || `${name} failed`);
		return {
			content,
			structuredContent: { content },
			details: { server: SERVER_NAME, upstreamTool: name },
		};
	};

	pi.registerTool({
		name: PROGRESSIVE_TOOL_NAME,
		label: "Computer Use",
		description:
			"Progressive Computer Use gateway. Read the computer-use skill before first use: it carries the workflow and the confirmations taxonomy. Start with action-list, inspect an action with action-schema, then execute it with action + obj.",
		promptSnippet:
			"Read the computer-use skill first, then discover and call local Computer Use actions progressively through action + obj.",
		promptGuidelines: [
			"Read the computer-use skill before the first action and before any risky or mutating UI action.",
			"Stop and ask the user before risky UI actions (delete, send, post, purchase, login, upload, install, system settings, sensitive data, CAPTCHAs).",
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
		outputSchema: OUTPUT_SCHEMA,
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

	pi.on("resources_discover", async () => ({
		// 技能自路由通道：广告 name+description，正文按需加载。
		skillPaths: [SKILL_PATH],
	}));

	pi.on("session_start", async (_event, ctx) => {
		try {
			client ??= new ComputerUseMcpClient();
			const tools = (await client.listTools()) as McpTool[];
			toolCatalog = new Map(tools.map((tool) => [tool.name, tool]));

			syncActiveTools();
			ctx.ui.notify(`${SERVER_NAME} loaded ${tools.length} actions · mode=${mode}`, "info");
		} catch (error) {
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
		description: "Switch Computer Use tools: progressive (default) or skill",
		getArgumentCompletions: (prefix: string) => {
			const values = ["progressive", "skill", "toggle", "status"];
			const matches = values.filter((value) => value.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (requested === "status") {
				ctx.ui.notify(`${SERVER_NAME}: mode=${mode}`, "info");
				return;
			}
			const cycle: Record<RegistrationMode, RegistrationMode> = {
				progressive: "skill",
				skill: "progressive",
			};
			let next: RegistrationMode;
			if (!requested || requested === "toggle") {
				next = cycle[mode];
			} else if (requested === "progressive" || requested === "skill") {
				next = requested;
			} else {
				ctx.ui.notify("Usage: /computer-use-mode [progressive|skill|toggle|status]", "error");
				return;
			}
			persistMode(next);
			syncActiveTools();
			const activeDescription =
				mode === "progressive"
					? `active tool=${PROGRESSIVE_TOOL_NAME}`
					: `no active tools · skill at ${SKILL_PATH}`;
			ctx.ui.notify(`${SERVER_NAME}: mode=${mode} · ${activeDescription}`, "info");
			if (mode === "skill") {
				ctx.ui.notify(
					`${SERVER_NAME}: run /reload or start a new session so the computer-use skill loads`,
					"info",
				);
			}
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
