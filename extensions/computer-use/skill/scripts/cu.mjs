#!/usr/bin/env node
// One-shot CLI for the OpenAI Computer Use MCP service.
//
// Usage:
//   node cu.mjs list
//   node cu.mjs schema <action>
//   node cu.mjs call <action> [json-arguments]

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ComputerUseMcpClient } from "../../mcp-client.mjs";

const IMAGE_EXT_BY_MIME = new Map([
	["image/png", ".png"],
	["image/jpeg", ".jpg"],
	["image/gif", ".gif"],
	["image/webp", ".webp"],
	["image/bmp", ".bmp"],
]);

function usage() {
	return [
		"Usage:",
		"  node cu.mjs list",
		"  node cu.mjs schema <action>",
		"  node cu.mjs call <action> [json-arguments]",
	].join("\n");
}

function fail(message) {
	console.error(`error: ${message}`);
	console.error(usage());
	process.exit(2);
}

function parseArguments(raw, action) {
	if (raw === undefined) return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
		fail(`arguments for "${action}" must be a JSON object`);
	} catch (error) {
		fail(`invalid JSON arguments: ${error.message}`);
	}
}

async function emitResult(result) {
	const lines = [];
	let imageIndex = 0;

	for (const item of result.content ?? []) {
		if (item.type === "text" && typeof item.text === "string") {
			lines.push(item.text);
			continue;
		}
		if (item.type === "image" && typeof item.data === "string") {
			const ext = IMAGE_EXT_BY_MIME.get(item.mimeType) ?? ".bin";
			imageIndex += 1;
			const file = join(tmpdir(), `computer-use-${Date.now()}-${imageIndex}${ext}`);
			await writeFile(file, Buffer.from(item.data, "base64"));
			lines.push(`[image saved: ${file} (${item.mimeType ?? "unknown"})]`);
			continue;
		}
		lines.push(JSON.stringify(item, null, 2));
	}

	console.log(lines.join("\n") || "(empty result)");
}

async function main() {
	const [command, action, rawArgs] = process.argv.slice(2);

	if (!command || !["list", "schema", "call"].includes(command)) {
		fail(command ? `unknown command "${command}"` : "missing command");
	}

	const timeoutMs = Number(process.env.COMPUTER_USE_TIMEOUT_MS) || undefined;
	const client = new ComputerUseMcpClient({ ...(timeoutMs ? { requestTimeoutMs: timeoutMs } : {}) });

	try {
		if (command === "list") {
			const tools = await client.listTools();
			console.log(
				JSON.stringify(
					tools.map((tool) => ({ action: tool.name, description: tool.description ?? "" })),
					null,
					2,
				),
			);
			return;
		}

		if (!action) fail(`${command} requires an action name`);

		if (command === "schema") {
			const tools = await client.listTools();
			const tool = tools.find((candidate) => candidate.name === action);
			if (!tool) fail(`unknown action: ${action}. Run "node cu.mjs list" first.`);
			console.log(
				JSON.stringify(
					{
						action: tool.name,
						description: tool.description ?? "",
						input: tool.inputSchema ?? null,
						output: tool.outputSchema ?? null,
					},
					null,
					2,
				),
			);
			return;
		}

		const args = parseArguments(rawArgs, action);
		const result = await client.callTool(action, args);
		if (result.isError) {
			throw new Error(
				(result.content ?? [])
					.filter((item) => item.type === "text")
					.map((item) => item.text)
					.join("\n") || `${action} failed`,
			);
		}
		await emitResult(result);
	} finally {
		client.close();
	}
}

main().catch((error) => {
	console.error(`error: ${error.message}`);
	process.exit(1);
});
