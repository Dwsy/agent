/**
 * Web Fetch Extension - Fetch web content using iflow's webFetch API
 *
 * Reads API key from ~/.iflow/settings.json and provides web_fetch tool
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Text, Container, Markdown } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);
const SETTINGS_PATH = `${process.env.HOME}/.iflow/settings.json`;
const API_URL = "https://apis.iflow.cn/v1/chat/webFetch";

interface WebFetchResponse {
	success: boolean;
	code: string;
	message: string;
	data?: {
		outputs?: {
			data?: {
				data?: Array<{
					title?: string;
					content?: string;
					url?: string;
					site?: string;
					publishTime?: string;
				}>;
			};
		};
	};
}

async function getApiKey(): Promise<string | null> {
	try {
		// Use jq to read apiKey from settings.json, similar to how pi reads models.json
		const { stdout } = await execAsync(`jq -r '.apiKey // empty' "${SETTINGS_PATH}"`);
		const apiKey = stdout.trim();
		return apiKey || null;
	} catch (error) {
		console.error("Failed to read iflow settings:", error);
		return null;
	}
}

function generateTraceId(): string {
	// W3C trace context format: 00-<32-hex-trace-id>-<16-hex-span-id>-<flags>
	const traceId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	const spanId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	return `00-${traceId}-${spanId}-01`;
}

function extractContent(data: WebFetchResponse): string {
	if (!data.success) {
		throw new Error(`API error: ${data.message || "Unknown error"}`);
	}

	const items = data.data?.outputs?.data?.data;
	if (!items || items.length === 0) {
		return "No content extracted from the URL.";
	}

	const item = items[0];
	const parts: string[] = [];

	if (item.title) {
		parts.push(`# ${item.title}\n`);
	}
	if (item.url) {
		parts.push(`URL: ${item.url}\n`);
	}
	if (item.site) {
		parts.push(`Site: ${item.site}\n`);
	}
	if (item.publishTime) {
		parts.push(`Published: ${item.publishTime}\n`);
	}
	if (parts.length > 0) {
		parts.push("---\n");
	}
	if (item.content) {
		parts.push(item.content);
	}

	return parts.join("\n") || "Empty content.";
}

async function webFetch(url: string): Promise<string> {
	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error("API key not found. Please configure iflow settings.");
	}

	// Validate URL
	try {
		new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	const traceId = generateTraceId();

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
			"traceparent": traceId,
		},
		body: JSON.stringify({ url }),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "Unknown error");
		throw new Error(`HTTP ${response.status}: ${response.statusText}. ${text}`);
	}

	const data = await response.json() as WebFetchResponse;
	return extractContent(data);
}

export default function (pi: ExtensionAPI) {
	// Register web_fetch tool
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch and extract content from a web URL",
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
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const update = onUpdate || (() => {});
			try {
				const { url } = params as { url: string };
				update({ content: [{ type: "text", text: `Fetching ${url}...` }], details: {} });

				const result = await webFetch(url);

				update({ content: [{ type: "text", text: ` ✓ Done\n` }], details: {} });

				return {
					content: [{ type: "text", text: result }],
					details: { url, length: result.length },
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				update({ content: [{ type: "text", text: ` ✗ Failed: ${errorMessage}\n` }], details: {} });
				return {
					content: [{ type: "text", text: `Error: ${errorMessage}` }],
					details: {},
					isError: true,
				};
			}
		},

		renderCall(args: { url: string }, theme: any): Text {
			const text = theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("accent", args.url);
			return new Text(text, 0, 0);
		},

		renderResult(result: any, options: ToolRenderResultOptions, theme: any): Container | Text {
			const details = result.details as { url: string; length: number } | undefined;
			const isError = result.isError;
			const statusSymbol = isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

			if (options.expanded) {
				const container = new Container();
				const header = `${statusSymbol} ${theme.fg("toolTitle", theme.bold("web_fetch"))}`;
				container.addChild(new Text(header, 0, 0));

				if (details) {
					container.addChild(new Text(theme.fg("muted", `URL: ${details.url}`), 0, 0));
					container.addChild(new Text(theme.fg("muted", `Length: ${details.length} chars`), 0, 0));
				}

				const content = result.content?.[0];
				if (content?.type === "text") {
					const mdTheme = getMarkdownTheme();
					container.addChild(new Markdown(content.text, 0, 0, mdTheme));
				}

				return container;
			}

			// Collapsed view
			let text = `${statusSymbol} ${theme.fg("toolTitle", theme.bold("web_fetch"))}`;
			if (details) {
				text += `\n${theme.fg("muted", details.url)}`;
				if (!isError) {
					const content = result.content?.[0];
					if (content?.type === "text") {
						const preview = content.text.slice(0, 100).replace(/\n/g, " ");
						text += `\n${theme.fg("dim", preview)}${content.text.length > 100 ? "..." : ""}`;
					}
				}
			}
			text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
			return new Text(text, 0, 0);
		},
	});

	// Register /web-fetch command
	pi.registerCommand("web-fetch", {
		description: "Fetch content from a URL",
		handler: async (args, ctx) => {
			const url = args[0];
			if (!url) {
				ctx.ui?.notify?.("Usage: /web-fetch <url>", "error");
				return;
			}

			try {
				const result = await webFetch(url);
				if (ctx.ui?.setEditorText) {
					ctx.ui.setEditorText(result);
					ctx.ui.notify?.("Content loaded into editor", "info");
				} else {
					console.log(result);
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				ctx.ui?.notify?.(`Error: ${errorMessage}`, "error");
			}
		},
	});
}
