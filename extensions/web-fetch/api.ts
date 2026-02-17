/**
 * API implementations for web fetch and search
 */

import { getQwenAccessToken, getIlowApiKey, getIlowToken } from "./providers.js";
import type { IlowWebFetchResponse, QwenSearchResult } from "./types.js";

// API URLs
const ILOW_API_URL = "https://apis.iflow.cn/v1/chat/webFetch";
const QWEN_WEB_SEARCH_URL = "https://portal.qwen.ai/api/v1/indices/plugin/web_search";
const QWEN_CHAT_URL = "https://portal.qwen.ai/v1/chat/completions";

// ============ Utilities ============

function generateTraceId(): string {
	// W3C trace context format: 00-<32-hex-trace-id>-<16-hex-span-id>-<flags>
	const traceId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	const spanId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	return `00-${traceId}-${spanId}-01`;
}

// ============ Qwen APIs ============

export async function qwenWebSearch(query: string, page = 1, rows = 10): Promise<string> {
	const token = await getQwenAccessToken();
	if (!token) {
		throw new Error("Qwen access token not found. Please login to Qwen first.");
	}

	const response = await fetch(QWEN_WEB_SEARCH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${token}`,
			"User-Agent": "node",
			"Accept-Encoding": "br, gzip, deflate",
			"accept-language": "*",
			"sec-fetch-mode": "cors",
		},
		body: JSON.stringify({
			uq: query,
			page,
			rows,
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "Unknown error");
		throw new Error(`HTTP ${response.status}: ${response.statusText}. ${text}`);
	}

	const data = await response.json() as QwenSearchResult;

	if (!data.success && !data.data?.list) {
		throw new Error(data.message || "Search failed");
	}

	const results = data.data?.list || [];
	if (results.length === 0) {
		return "No results found.";
	}

	const parts: string[] = [];
	parts.push(`# Search Results: ${query}\n`);
	parts.push(`Total: ${data.data?.total || results.length}\n`);
	parts.push("---\n");

	for (const item of results) {
		if (item.title) parts.push(`## ${item.title}`);
		if (item.url) parts.push(`URL: ${item.url}`);
		if (item.site) parts.push(`Site: ${item.site}`);
		if (item.date) parts.push(`Date: ${item.date}`);
		if (item.content) parts.push(`\n${item.content}`);
		parts.push("\n---\n");
	}

	return parts.join("\n");
}

export async function qwenChat(
	messages: Array<{ role: string; content: string }>,
	options: {
		model?: string;
		temperature?: number;
		stream?: boolean;
	} = {}
): Promise<string> {
	const token = await getQwenAccessToken();
	if (!token) {
		throw new Error("Qwen access token not found.");
	}

	const response = await fetch(QWEN_CHAT_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${token}`,
			"User-Agent": "QwenCode/0.10.3 (darwin; arm64)",
			"Accept": "application/json",
			"X-Stainless-Lang": "js",
			"X-Stainless-Package-Version": "5.11.0",
			"X-Stainless-OS": "MacOS",
			"X-Stainless-Arch": "arm64",
			"X-Stainless-Runtime": "node",
			"X-Stainless-Runtime-Version": "v23.11.1",
			"X-DashScope-CacheControl": "enable",
			"X-DashScope-AuthType": "qwen-oauth",
		},
		body: JSON.stringify({
			model: options.model || "coder-model",
			messages,
			temperature: options.temperature ?? 0.3,
			stream: options.stream ?? false,
			...(options.stream && { stream_options: { include_usage: true } }),
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "Unknown error");
		throw new Error(`HTTP ${response.status}: ${response.statusText}. ${text}`);
	}

	if (options.stream) {
		return "Streaming not fully implemented in this tool. Use non-stream mode.";
	}

	const data = await response.json();
	const reply = data.choices?.[0]?.message?.content;
	return reply || JSON.stringify(data, null, 2);
}

// ============ Ilow APIs ============

function extractIlowContent(data: IlowWebFetchResponse): string {
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

export async function ilowWebFetch(url: string): Promise<string> {
	const apiKey = await getIlowToken();
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

	const response = await fetch(ILOW_API_URL, {
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

	const data = await response.json() as IlowWebFetchResponse;
	return extractIlowContent(data);
}

// ============ Unified APIs ============

export async function webFetch(url: string): Promise<string> {
	// Prefer iflow for web fetch (better support)
	return await ilowWebFetch(url);
}

export async function webSearch(query: string, page = 1, rows = 10): Promise<string> {
	// Use Qwen web search (primary)
	const qwenToken = await getQwenAccessToken();
	if (qwenToken) {
		return await qwenWebSearch(query, page, rows);
	}

	throw new Error("Web search requires Qwen access token. Please login to Qwen.");
}
