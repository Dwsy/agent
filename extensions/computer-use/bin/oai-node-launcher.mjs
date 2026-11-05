#!/usr/bin/env node

// Runs *inside* the OpenAI-signed node that ships with the Codex desktop app
// ($APP/Contents/Resources/cua_node/bin/node). The Sky service authenticates the
// parent process by signing team (2DC432GLL2) and rejects everything else with
// "-10000 Sender process is not authenticated", so the client must be spawned by
// a signed OpenAI binary — not by Pi's own node and not through `codex sandbox`.
//
// stdio is inherited so the bridge speaks MCP to the client unchanged.

import { spawn } from "node:child_process";

const clientPath = process.argv[2];
if (!clientPath) {
	process.stderr.write("usage: oai-node-launcher.mjs <SkyComputerUseClient> [args...]\n");
	process.exit(2);
}

const client = spawn(clientPath, process.argv.slice(3), { stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.once(signal, () => client.kill(signal));
}

// 父进程退出（含标准输入 EOF 收尾）时确保客户端不残留。
process.on("exit", () => {
	try {
		client.kill("SIGKILL");
	} catch {
		// 客户端已退出。
	}
});

client.on("error", (error) => {
	process.stderr.write(`Failed to start the Computer Use client: ${error.message}\n`);
	process.exit(1);
});

client.on("close", (code, signal) => {
	process.exitCode = signal ? 1 : (code ?? 0);
});
