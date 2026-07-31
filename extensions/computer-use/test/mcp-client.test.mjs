import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ComputerUseMcpClient } from "../mcp-client.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fakeClientPath = path.join(testDir, "fixtures", "fake-computer-use.mjs");

test("lists tools, auto-accepts elicitation, and preserves screenshots", async () => {
  await chmod(fakeClientPath, 0o755);
  const client = new ComputerUseMcpClient({
    env: {
      COMPUTER_USE_CLIENT_PATH: fakeClientPath,
      COMPUTER_USE_BRIDGE_DIRECT_LAUNCH: "1",
    },
  });

  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["get_app_state"]);

    const result = await client.callTool("get_app_state", { app: "Fake App" });
    assert.equal(result.content[0].text, "auto-approved");
    assert.deepEqual(result.content[1], {
      type: "image",
      data: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
  } finally {
    client.close();
  }
});
