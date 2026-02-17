/**
 * Web Fetch Extension - Main Entry
 *
 * Multi-provider web fetch and search
 * Supports: iflow, Qwen, cli-proxy-api
 */

import { Text, Container, Markdown } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";

import { getQwenAccessToken, getIlowApiKey, getAllProviders } from "./providers.js";
import { webFetch, webSearch } from "./api.js";

export default function (pi: ExtensionAPI) {
	// ============ web_fetch tool ============
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch and extract content from a web URL (iflow or Qwen)",
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

	// ============ web_search tool ============
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web using Qwen's search engine",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "The search query",
				},
				page: {
					type: "number",
					description: "Page number (default: 1)",
					default: 1,
				},
				rows: {
					type: "number",
					description: "Number of results (default: 10)",
					default: 10,
				},
			},
			required: ["query"],
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const update = onUpdate || (() => {});
			try {
				const { query, page = 1, rows = 10 } = params as { query: string; page?: number; rows?: number };
				update({ content: [{ type: "text", text: `Searching: ${query}...` }], details: {} });

				const result = await webSearch(query, page, rows);

				update({ content: [{ type: "text", text: ` ✓ Done\n` }], details: {} });

				return {
					content: [{ type: "text", text: result }],
					details: { query, length: result.length },
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

		renderCall(args: { query: string }, theme: any): Text {
			const text = theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", args.query);
			return new Text(text, 0, 0);
		},

		renderResult(result: any, options: ToolRenderResultOptions, theme: any): Container | Text {
			const details = result.details as { query: string; length: number } | undefined;
			const isError = result.isError;
			const statusSymbol = isError ? theme.fg("error", "[FAIL]") : theme.fg("success", "[OK]");

			if (options.expanded) {
				const container = new Container();
				const header = `${statusSymbol} ${theme.fg("toolTitle", theme.bold("web_search"))}`;
				container.addChild(new Text(header, 0, 0));

				if (details) {
					container.addChild(new Text(theme.fg("muted", `Query: ${details.query}`), 0, 0));
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
			let text = `${statusSymbol} ${theme.fg("toolTitle", theme.bold("web_search"))}`;
			if (details) {
				text += `\n${theme.fg("muted", details.query)}`;
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

	// ============ Commands ============

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

	pi.registerCommand("web-search", {
		description: "Search the web using Qwen",
		handler: async (args, ctx) => {
			const query = args.join(" ");
			if (!query) {
				ctx.ui?.notify?.("Usage: /web-search <query>", "error");
				return;
			}

			try {
				const result = await webSearch(query);
				if (ctx.ui?.setEditorText) {
					ctx.ui.setEditorText(result);
					ctx.ui.notify?.("Search results loaded into editor", "info");
				} else {
					console.log(result);
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				ctx.ui?.notify?.(`Error: ${errorMessage}`, "error");
			}
		},
	});

	// Status command to show available providers
	pi.registerCommand("web-status", {
		description: "Show web fetch/search provider status",
		handler: async (args, ctx) => {
			const qwenToken = await getQwenAccessToken();
			const iflowKey = await getIlowApiKey();
			const providers = await getAllProviders();

			const lines = [
				"# Web Providers Status",
				"",
				`- Qwen: ${qwenToken ? "✓ Connected" : "✗ Not configured"}`,
				`  Token: ${qwenToken ? qwenToken.slice(0, 20) + "..." : "N/A"}`,
				"",
				`- iflow: ${iflowKey ? "✓ Connected" : "✗ Not configured"}`,
				`  Key: ${iflowKey ? iflowKey.slice(0, 20) + "..." : "N/A"}`,
				"",
				"---",
				"",
				"## CLI Proxy API Providers:",
			];

			if (providers.length === 0) {
				lines.push("  (none found)");
			} else {
				for (const p of providers) {
					const status = p.expired ? `(expires: ${p.expired})` : "";
					lines.push(`- ${p.type}: ${p.email} ${status}`);
				}
			}

			const status = lines.join("\n");

			if (ctx.ui?.setEditorText) {
				ctx.ui.setEditorText(status);
			} else {
				console.log(status);
			}
		},
	});
}
