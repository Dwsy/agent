/**
 * Feishu channel plugin unit tests.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  isDuplicate,
  resetDedup,
  parseMessageContent,
  parseFeishuEvent,
  checkDmPolicy,
  type FeishuMessageEvent,
} from "./bot.ts";
import { resolveReceiveIdType, chunkText } from "./send.ts";
import type { FeishuChannelConfig } from "./types.ts";

// ── Dedup ──────────────────────────────────────────────────────────────────

describe("feishu dedup", () => {
  beforeEach(() => resetDedup());

  test("first message is not duplicate", () => {
    expect(isDuplicate("msg_001")).toBe(false);
  });

  test("same messageId is duplicate", () => {
    isDuplicate("msg_002");
    expect(isDuplicate("msg_002")).toBe(true);
  });

  test("different messageIds are not duplicates", () => {
    isDuplicate("msg_003");
    expect(isDuplicate("msg_004")).toBe(false);
  });

  test("evicts oldest when capacity exceeded", () => {
    for (let i = 0; i < 1000; i++) {
      isDuplicate(`msg_cap_${i}`);
    }
    // msg_cap_0 should be evicted when adding 1001st
    isDuplicate("msg_cap_overflow");
    expect(isDuplicate("msg_cap_0")).toBe(false);
  });
});

// ── Message parsing ────────────────────────────────────────────────────────

describe("feishu message parsing", () => {
  test("parses text message", () => {
    const content = JSON.stringify({ text: "hello world" });
    expect(parseMessageContent(content, "text")).toBe("hello world");
  });

  test("parses empty text", () => {
    const content = JSON.stringify({ text: "" });
    expect(parseMessageContent(content, "text")).toBe("");
  });

  test("parses post (rich text) message", () => {
    const content = JSON.stringify({
      title: "Title",
      content: [
        [
          { tag: "text", text: "Hello " },
          { tag: "a", text: "link", href: "https://example.com" },
        ],
      ],
    });
    expect(parseMessageContent(content, "post")).toContain("Title");
    expect(parseMessageContent(content, "post")).toContain("Hello ");
    expect(parseMessageContent(content, "post")).toContain("link");
  });

  test("handles malformed JSON gracefully", () => {
    expect(parseMessageContent("not json", "text")).toBe("not json");
  });

  test("parseFeishuEvent extracts fields correctly", () => {
    const event: FeishuMessageEvent = {
      sender: {
        sender_id: { open_id: "ou_abc", user_id: "uid_123" },
      },
      message: {
        message_id: "msg_100",
        chat_id: "oc_chat1",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "test message" }),
      },
    };
    const ctx = parseFeishuEvent(event);
    expect(ctx.chatId).toBe("oc_chat1");
    expect(ctx.messageId).toBe("msg_100");
    expect(ctx.senderOpenId).toBe("ou_abc");
    expect(ctx.senderId).toBe("uid_123");
    expect(ctx.chatType).toBe("p2p");
    expect(ctx.content).toBe("test message");
  });

  test("strips bot mention from content", () => {
    const event: FeishuMessageEvent = {
      sender: { sender_id: { open_id: "ou_user" } },
      message: {
        message_id: "msg_200",
        chat_id: "oc_grp",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@TestBot hello there" }),
        mentions: [{ key: "@_user_1", id: { open_id: "ou_bot" }, name: "TestBot" }],
      },
    };
    const ctx = parseFeishuEvent(event, "ou_bot");
    expect(ctx.content).toBe("hello there");
  });
});

// ── DM Policy ──────────────────────────────────────────────────────────────

describe("feishu DM policy", () => {
  test("open policy allows anyone", () => {
    const cfg: FeishuChannelConfig = { enabled: true, appId: "x", appSecret: "x", dmPolicy: "open" };
    expect(checkDmPolicy("ou_anyone", cfg)).toBe(true);
  });

  test("allowlist policy blocks unknown sender", () => {
    const cfg: FeishuChannelConfig = {
      enabled: true, appId: "x", appSecret: "x",
      dmPolicy: "allowlist",
      allowFrom: ["ou_allowed"],
    };
    expect(checkDmPolicy("ou_unknown", cfg)).toBe(false);
  });

  test("allowlist policy allows listed sender", () => {
    const cfg: FeishuChannelConfig = {
      enabled: true, appId: "x", appSecret: "x",
      dmPolicy: "allowlist",
      allowFrom: ["ou_allowed"],
    };
    expect(checkDmPolicy("ou_allowed", cfg)).toBe(true);
  });

  test("default policy (undefined) is open", () => {
    const cfg: FeishuChannelConfig = { enabled: true, appId: "x", appSecret: "x" };
    expect(checkDmPolicy("ou_anyone", cfg)).toBe(true);
  });
});

// ── Target resolution ──────────────────────────────────────────────────────

describe("feishu target resolution", () => {
  test("oc_ prefix resolves to chat_id", () => {
    expect(resolveReceiveIdType("oc_abc123")).toBe("chat_id");
  });

  test("ou_ prefix resolves to open_id", () => {
    expect(resolveReceiveIdType("ou_abc123")).toBe("open_id");
  });

  test("on_ prefix resolves to union_id", () => {
    expect(resolveReceiveIdType("on_abc123")).toBe("union_id");
  });

  test("unknown prefix defaults to chat_id", () => {
    expect(resolveReceiveIdType("unknown_id")).toBe("chat_id");
  });
});

// ── Text chunking ──────────────────────────────────────────────────────────

describe("feishu text chunking", () => {
  test("short text returns single chunk", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });

  test("long text splits at limit", () => {
    const text = "a".repeat(250);
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].length).toBe(100);
    expect(chunks[2].length).toBe(50);
  });

  test("exact limit returns single chunk", () => {
    const text = "a".repeat(100);
    expect(chunkText(text, 100)).toEqual([text]);
  });
});
