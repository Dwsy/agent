#!/usr/bin/env node

// Fake MCP client that spawns a long-lived grandchild (mirroring codex sandbox →
// Sky client) and records both pids so tests can assert close() kills the whole
// process tree instead of leaking descendants.

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

const pidFile = process.env.TREE_PIDFILE ?? "";

function record(pid) {
  if (pidFile) appendFileSync(pidFile, `${pid}\n`);
}

record(process.pid);
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});
record(grandchild.pid);

let buffer = "";

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(message) {
  if (message.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "tree-computer-use", version: "1.0.0" },
      },
    });
    return;
  }

  if (message.method === "notifications/initialized") return;

  if (message.method === "tools/list") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [
          {
            name: "list_apps",
            description: "List apps.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
    return;
  }

  if (message.method === "tools/call") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: "ok:list_apps" }] },
    });
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex < 0) break;
    const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
    buffer = buffer.slice(newlineIndex + 1);
    if (line) handle(JSON.parse(line));
  }
});
