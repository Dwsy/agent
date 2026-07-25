import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined) return;

  const ok = (result) => send({ jsonrpc: "2.0", id: message.id, result });
  const fail = (code, text) => send({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });

  switch (message.method) {
    case "initialize":
      ok({
        protocolVersion: message.params?.protocolVersion,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
        },
        serverInfo: { name: "fixture-mcp", version: "1.0.0" },
        instructions: "Fixture server for MCP Inspector integration tests",
      });
      break;
    case "ping":
      ok({});
      break;
    case "tools/list":
      ok({ tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] });
      break;
    case "tools/call":
      ok({ content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }], structuredContent: { echoed: message.params?.arguments?.text ?? "" } });
      break;
    case "resources/list":
      ok({ resources: [{ uri: "fixture://hello", name: "Hello", mimeType: "text/plain" }] });
      break;
    case "resources/templates/list":
      ok({ resourceTemplates: [{ uriTemplate: "fixture://item/{id}", name: "Item" }] });
      break;
    case "resources/read":
      ok({ contents: [{ uri: message.params?.uri || "fixture://hello", mimeType: "text/plain", text: "hello resource" }] });
      break;
    case "prompts/list":
      ok({ prompts: [{ name: "greet", description: "Greeting prompt", arguments: [{ name: "name", required: true }] }] });
      break;
    case "prompts/get":
      ok({ description: "Greeting", messages: [{ role: "user", content: { type: "text", text: `Hello ${message.params?.arguments?.name || "world"}` } }] });
      break;
    case "logging/setLevel":
      ok({});
      break;
    default:
      fail(-32601, `Method not found: ${message.method}`);
  }
});
