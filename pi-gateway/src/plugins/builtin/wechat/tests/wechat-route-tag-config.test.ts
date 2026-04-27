import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigRouteTag } from "../accounts.ts";

const originalConfigEnv = process.env.PI_GATEWAY_CONFIG;
const originalHome = process.env.HOME;

afterEach(() => {
  if (originalConfigEnv === undefined) delete process.env.PI_GATEWAY_CONFIG;
  else process.env.PI_GATEWAY_CONFIG = originalConfigEnv;

  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe("wechat routeTag config loading", () => {
  test("loadConfigRouteTag reads account routeTag from ~/.pi/gateway/pi-gateway.jsonc style config", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-config-home-"));
    const configDir = path.join(homeDir, ".pi", "gateway");
    fs.mkdirSync(configDir, { recursive: true });
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

    process.env.HOME = homeDir;
    delete process.env.PI_GATEWAY_CONFIG;

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
