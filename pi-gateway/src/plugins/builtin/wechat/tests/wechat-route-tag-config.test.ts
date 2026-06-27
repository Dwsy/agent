import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigRouteTag } from "../accounts.ts";

const originalConfigEnv = process.env.PI_GATEWAY_CONFIG;

afterEach(() => {
  if (originalConfigEnv === undefined) delete process.env.PI_GATEWAY_CONFIG;
  else process.env.PI_GATEWAY_CONFIG = originalConfigEnv;
});

describe("wechat routeTag config loading", () => {
  test("loadConfigRouteTag reads account routeTag from JSONC config", () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-config-jsonc-"));
    const configPath = path.join(configDir, "pi-gateway.jsonc");
    fs.writeFileSync(
      configPath,
      `{
        // comment to prove jsonc parsing works
        "channels": {
          "wechat": {
            "routeTag": "global-tag",
            "accounts": {
              "wx-bot": {
                "routeTag": "account-tag"
              }
            }
          }
        }
      }`,
      "utf-8",
    );

    process.env.PI_GATEWAY_CONFIG = configPath;

    expect(loadConfigRouteTag("wx-bot")).toBe("account-tag");
    expect(loadConfigRouteTag("other-bot")).toBe("global-tag");
  });

  test("loadConfigRouteTag respects PI_GATEWAY_CONFIG override", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-config-override-"));
    const configPath = path.join(dir, "custom-gateway.jsonc");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ channels: { wechat: { routeTag: 42 } } }, null, 2),
      "utf-8",
    );

    process.env.PI_GATEWAY_CONFIG = configPath;

    expect(loadConfigRouteTag()).toBe("42");
  });
});
