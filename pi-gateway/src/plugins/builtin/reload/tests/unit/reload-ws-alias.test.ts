import { describe, expect, test } from "bun:test";
import reloadPlugin from "../../index.ts";

function setupReloadPlugin(options: {
  hasSession?: boolean;
  forwardError?: Error;
} = {}) {
  const { hasSession = true, forwardError } = options;
  const gatewayMethods = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
  const forwardCalls: Array<{ sessionKey: string; command: string; args: string }> = [];

  const api = {
    registerCommand: () => {},
    registerHttpRoute: () => {},
    registerGatewayMethod: (method: string, handler: (params: Record<string, unknown>) => Promise<unknown>) => {
      gatewayMethods.set(method, handler);
    },
    getSessionState: (_sessionKey: string) => (hasSession ? { role: "default" } : null),
    forwardCommand: async (sessionKey: string, command: string, args: string) => {
      if (forwardError) {
        throw forwardError;
      }
      forwardCalls.push({ sessionKey, command, args });
    },
  } as any;

  reloadPlugin(api);

  return { gatewayMethods, forwardCalls };
}

describe("reload plugin ws alias", () => {
  test("registers session.reload and reloadsession to same behavior", async () => {
    const { gatewayMethods, forwardCalls } = setupReloadPlugin();

    const canonicalHandler = gatewayMethods.get("session.reload");
    const aliasHandler = gatewayMethods.get("reloadsession");

    expect(typeof canonicalHandler).toBe("function");
    expect(typeof aliasHandler).toBe("function");

    const canonicalResult = await canonicalHandler!({ sessionKey: "s1" }) as any;
    const aliasResult = await aliasHandler!({ sessionKey: "s2" }) as any;

    expect(canonicalResult.success).toBe(true);
    expect(aliasResult.success).toBe(true);
    expect(canonicalResult.message).toBe("Reload command queued for agent runtime");
    expect(aliasResult.message).toBe("Reload command queued for agent runtime");
    expect(forwardCalls).toEqual([
      { sessionKey: "s1", command: "/reload", args: "" },
      { sessionKey: "s2", command: "/reload", args: "" },
    ]);
  });

  test("returns sessionKey required when missing", async () => {
    const { gatewayMethods, forwardCalls } = setupReloadPlugin();
    const aliasHandler = gatewayMethods.get("reloadsession");

    const result = await aliasHandler!({}) as any;

    expect(result).toEqual({ success: false, error: "sessionKey required" });
    expect(forwardCalls).toEqual([]);
  });

  test("returns session not found when session is absent", async () => {
    const { gatewayMethods, forwardCalls } = setupReloadPlugin({ hasSession: false });
    const canonicalHandler = gatewayMethods.get("session.reload");

    const result = await canonicalHandler!({ sessionKey: "s-missing" }) as any;

    expect(result).toEqual({ success: false, error: "Session not found" });
    expect(forwardCalls).toEqual([]);
  });
});
