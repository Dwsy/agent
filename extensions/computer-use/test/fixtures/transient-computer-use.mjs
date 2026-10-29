#!/usr/bin/env node

// Fake MCP client whose tools/call reports a transient upstream server error while the
// marker file exists; each failure consumes the marker. Every call name is appended to
// the attempts file so tests can assert replay behavior across transport restarts.

import { appendFileSync, existsSync, unlinkSync } from "node:fs";

const markerPath = process.env.TRANSIENT_MARKER ?? "";
const attemptsPath = process.env.TRANSIENT_ATTEMPTS ?? "";

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
        serverInfo: { name: "transient-computer-use", version: "1.0.0" },
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
          {
            name: "click",
            description: "Click.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
    return;
  }

  if (message.method === "tools/call") {
    const name = message.params?.name ?? "?";
    if (attemptsPath) appendFileSync(attemptsPath, `${name}\n`);
    if (markerPath && existsSync(markerPath)) {
      unlinkSync(markerPath);
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [
            { type: "text", text: "Computer Use server error -10000: Sender process is not authenticated" },
          ],
        },
      });
      return;
    }
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: { content: [{ type: "text", text: `ok:${name}` }] },
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
