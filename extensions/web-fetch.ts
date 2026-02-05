/**
 * Web Fetch Extension - Fetch web content using iflow's webFetch API
 *
 * Reads API key from ~/.iflow/settings.json and provides web_fetch tool
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const SETTINGS_PATH = path.join(process.env.HOME || "", ".iflow", "settings.json");
const API_URL = "https://apis.iflow.cn/v1/chat/webFetch";

interface IFlowSettings {
	apiKey?: string;
}

async function getApiKey(): Promise<string | null> {
	try {
		const content = await fs.readFile(SETTINGS_PATH, "utf-8");
		const settings = JSON.parse(content) as IFlowSettings;
		return settings.apiKey || null;
	} catch (error) {
		console.error("Failed to read iflow settings:", error);
		return null;
	}
}

async function generateTraceId(): Promise<string> {
	const timestamp = Date.now().toString(16);
	const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	return `00-${timestamp}-${random}-01`;
}

async function webFetch(url: string): Promise<string> {
	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error("Failed to get API key from ~/.iflow/settings.json");
	}

	const traceId = await generateTraceId();
	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"User-Agent": "node",
			"Accept-Encoding": "br, gzip, deflate",
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
			"traceparent": traceId,
			"accept-language": "*",
			"sec-fetch-mode": "cors",
		},
		body: JSON.stringify({ url }),
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();
	return JSON.stringify(data, null, 2);
}

export default function (pi: ExtensionAPI) {
	// Register web_fetch tool
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch and extract content from a web URL using iflow's webFetch API",
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "The URL to fetch content from",
				},
			},
			required: ["url"],
		},
		async execute(toolCallId, params, onUpdate, ctx, signal) {
			try {
				const { url } = params as { url: string };
				onUpdate({ type: "text", text: `Fetching: ${url}...\n` });

				const result = await webFetch(url);

				return {
					content: [{ type: "text", text: result }],
					details: { url },
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${errorMessage}` }],
					details: {},
				};
			}
		},
	});

	// Register /web-fetch command
	pi.registerCommand("web-fetch", {
		description: "Fetch content from a URL",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("web-fetch requires interactive mode", "error");
				return;
			}

			const url = args[0];
			if (!url) {
				ctx.ui.notify("Usage: /web-fetch <url>", "error");
				return;
			}

			try {
				const result = await webFetch(url);
				ctx.ui.setEditorText(result);
				ctx.ui.notify("Content loaded into editor", "info");
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Error: ${errorMessage}`, "error");
			}
		},
	});
}