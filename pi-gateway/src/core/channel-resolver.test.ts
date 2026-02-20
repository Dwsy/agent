import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore } from "./session-store.ts";
import { resolveDeliveryTarget } from "./channel-resolver.ts";
import type { SessionState } from "./types.ts";

const tempDirs: string[] = [];
const stores: SessionStore[] = [];

function mkStore(): SessionStore {
  const dir = mkdtempSync(join(tmpdir(), "pi-gw-channel-resolver-"));
  tempDirs.push(dir);
  const store = new SessionStore(dir);
  stores.push(store);
  return store;
}

function mkSession(partial: Partial<SessionState> & Pick<SessionState, "sessionKey">): SessionState {
  return {
    sessionKey: partial.sessionKey,
    role: partial.role ?? null,
    isStreaming: partial.isStreaming ?? false,
    lastActivity: partial.lastActivity ?? Date.now(),
    messageCount: partial.messageCount ?? 1,
    rpcProcessId: partial.rpcProcessId ?? null,
    lastChatId: partial.lastChatId,
    lastChannel: partial.lastChannel,
    lastAccountId: partial.lastAccountId,
    lastChatType: partial.lastChatType,
    lastSenderId: partial.lastSenderId,
    lastSenderName: partial.lastSenderName,
    lastTopicId: partial.lastTopicId,
    lastThreadId: partial.lastThreadId,
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.dispose();
  }
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("resolveDeliveryTarget", () => {
  test("prefers requested channel when available", () => {
    const store = mkStore();

    store.set(
      "agent:main:discord:channel:c1",
      mkSession({
        sessionKey: "agent:main:discord:channel:c1",
        lastActivity: 200,
        lastChannel: "discord",
        lastChatId: "c1",
      }),
    );

    store.set(
      "agent:main:telegram:account:a1:group:g1",
      mkSession({
        sessionKey: "agent:main:telegram:account:a1:group:g1",
        lastActivity: 100,
        lastChannel: "telegram",
        lastChatId: "g1",
        lastAccountId: "a1",
        lastChatType: "group",
      }),
    );

    const target = resolveDeliveryTarget("main", store, undefined, { preferredChannel: "telegram" });
    expect(target).toEqual({ channel: "telegram", chatId: "g1" });
  });

  test("falls back to global latest when preferred filter has no match", () => {
    const store = mkStore();

    store.set(
      "agent:main:discord:channel:c9",
      mkSession({
        sessionKey: "agent:main:discord:channel:c9",
        lastActivity: 500,
        lastChannel: "discord",
        lastChatId: "c9",
      }),
    );

    const target = resolveDeliveryTarget("main", store, undefined, { preferredChannel: "telegram" });
    expect(target).toEqual({ channel: "discord", chatId: "c9" });
  });

  test("filters by accountId when provided", () => {
    const store = mkStore();

    store.set(
      "agent:main:telegram:account:primary:group:g1",
      mkSession({
        sessionKey: "agent:main:telegram:account:primary:group:g1",
        lastActivity: 100,
        lastChannel: "telegram",
        lastChatId: "g1",
        lastAccountId: "primary",
      }),
    );

    store.set(
      "agent:main:telegram:account:backup:group:g2",
      mkSession({
        sessionKey: "agent:main:telegram:account:backup:group:g2",
        lastActivity: 200,
        lastChannel: "telegram",
        lastChatId: "g2",
        lastAccountId: "backup",
      }),
    );

    const target = resolveDeliveryTarget("main", store, undefined, {
      preferredChannel: "telegram",
      preferredAccountId: "primary",
    });

    expect(target).toEqual({ channel: "telegram", chatId: "g1" });
  });
});
