import { describe, expect, test } from "bun:test";
import { registerBuiltinCommands } from "./command-handler.ts";

function createCtx(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      channels: {
        telegram: {
          enabled: true,
          allowFrom: ["u1"],
          dmPolicy: "allowlist",
          accounts: {
            default: {
              allowFrom: ["u1"],
              dmPolicy: "allowlist",
            },
          },
        },
      },
    },
    registry: {
      commands: new Map<string, { pluginId: string; handler: Function; meta?: any }>(),
      channels: new Map(),
      hooks: { dispatch: async () => {} },
    },
    sessions: {
      get: (sessionKey: string) => (sessionKey === "s1" ? { role: "default" } : undefined),
    },
    listAvailableRoles: () => ["default", "coder", "ops"],
    setSessionRole: async () => true,
    ...overrides,
  } as any;
}

describe("registerBuiltinCommands", () => {
  test("registers /role command when absent", () => {
    const ctx = createCtx();
    registerBuiltinCommands(ctx);

    const entry = ctx.registry.commands.get("role");
    expect(entry?.pluginId).toBe("gateway-core");
    expect(entry?.meta?.name).toBe("role");
    expect(typeof entry?.handler).toBe("function");
  });

  test("does not override existing /role command", () => {
    const ctx = createCtx();
    const existing = async () => {};
    ctx.registry.commands.set("role", { pluginId: "custom", handler: existing });

    registerBuiltinCommands(ctx);

    const entry = ctx.registry.commands.get("role");
    expect(entry?.pluginId).toBe("custom");
    expect(entry?.handler).toBe(existing);
  });

  test("/role list responds with available roles", async () => {
    const ctx = createCtx();
    registerBuiltinCommands(ctx);
    const handler = ctx.registry.commands.get("role")!.handler;

    let output = "";
    await handler({
      sessionKey: "s1",
      senderId: "u1",
      channel: "telegram",
      args: "list",
      respond: async (text: string) => {
        output = text;
      },
    });

    expect(output).toBe("Available roles: default, coder, ops");
  });

  test("/role set invokes setSessionRole and reports success", async () => {
    let captured: { sessionKey?: string; role?: string } = {};
    const ctx = createCtx({
      setSessionRole: async (sessionKey: string, role: string) => {
        captured = { sessionKey, role };
        return true;
      },
    });

    registerBuiltinCommands(ctx);
    const handler = ctx.registry.commands.get("role")!.handler;

    let output = "";
    await handler({
      sessionKey: "s1",
      senderId: "u1",
      channel: "telegram",
      accountId: "default",
      args: "set coder",
      respond: async (text: string) => {
        output = text;
      },
    });

    expect(captured).toEqual({ sessionKey: "s1", role: "coder" });
    expect(output).toBe("Role switched to: coder");
  });



  test("/role without args can return rich keyboard response", async () => {
    const ctx = createCtx();
    registerBuiltinCommands(ctx);
    const handler = ctx.registry.commands.get("role")!.handler;

    let rich: any = null;
    await handler({
      sessionKey: "s1",
      senderId: "u1",
      channel: "telegram",
      chatId: "chat-1",
      args: "",
      respond: async () => {},
      respondWith: async (response: any) => {
        rich = response;
      },
    });

    expect(rich?.text).toContain("Current role");
    expect(Array.isArray(rich?.keyboard?.inline_keyboard)).toBeTrue();
  });

  test("/role set blocks unauthorized sender", async () => {
    const ctx = createCtx({
      config: {
        channels: {
          telegram: {
            enabled: true,
            allowFrom: ["admin"],
            dmPolicy: "allowlist",
            accounts: {
              default: {
                allowFrom: ["admin"],
                dmPolicy: "allowlist",
              },
            },
          },
        },
      },
    });

    registerBuiltinCommands(ctx);
    const handler = ctx.registry.commands.get("role")!.handler;

    let output = "";
    await handler({
      sessionKey: "s1",
      senderId: "u1",
      channel: "telegram",
      accountId: "default",
      args: "set coder",
      respond: async (text: string) => {
        output = text;
      },
    });

    expect(output).toBe("Unauthorized: /role set requires allowFrom authorization.");
  });
});
