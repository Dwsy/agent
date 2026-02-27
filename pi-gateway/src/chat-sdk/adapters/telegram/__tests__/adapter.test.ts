/**
 * Tests for Telegram adapter.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { parseMarkdown, stringifyMarkdown } from "chat";
import { TelegramAdapter, createTelegramAdapter, buildForwardContext, buildReplyContext } from "../adapter.ts";
import { TelegramFormatConverter, escapeHtml, markdownToTelegramHtml } from "../format.ts";
import { verifyWebhookSecret, parseWebhookUpdate } from "../webhook.ts";
import { detectMediaKind, parseMediaDirectives } from "../media.ts";
import { shouldAllowGroupMessage, resolveGroupConfig } from "../groups.ts";
import { isTransientError, withRetry } from "../network.ts";
import type { TelegramRawMessage, TelegramThreadId } from "../types.ts";

// ─── Thread ID encode/decode ───────────────────────────────────────────

describe("Thread ID encode/decode", () => {
  // We need a minimal adapter for encode/decode tests.
  // Create one with a dummy token (won't actually connect).
  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter({
      botToken: "123456:ABC-DEF",
      userName: "testbot",
    });
  });

  test("encode simple chat ID", () => {
    const threadId = adapter.encodeThreadId({ chatId: "12345" });
    expect(threadId).toBe("telegram:12345");
  });

  test("encode chat ID with topic thread", () => {
    const threadId = adapter.encodeThreadId({ chatId: "-100123", messageThreadId: "42" });
    expect(threadId).toBe("telegram:-100123:42");
  });

  test("decode simple thread ID", () => {
    const decoded = adapter.decodeThreadId("telegram:12345");
    expect(decoded).toEqual({ chatId: "12345", messageThreadId: undefined });
  });

  test("decode thread ID with topic", () => {
    const decoded = adapter.decodeThreadId("telegram:-100123:42");
    expect(decoded).toEqual({ chatId: "-100123", messageThreadId: "42" });
  });

  test("decode throws on invalid format", () => {
    expect(() => adapter.decodeThreadId("discord:123:456")).toThrow("Invalid Telegram thread ID");
  });

  test("decode throws on missing prefix", () => {
    expect(() => adapter.decodeThreadId("12345")).toThrow("Invalid Telegram thread ID");
  });

  test("roundtrip encode/decode without topic", () => {
    const original: TelegramThreadId = { chatId: "-987654321" };
    const encoded = adapter.encodeThreadId(original);
    const decoded = adapter.decodeThreadId(encoded);
    expect(decoded.chatId).toBe(original.chatId);
    expect(decoded.messageThreadId).toBeUndefined();
  });

  test("roundtrip encode/decode with topic", () => {
    const original: TelegramThreadId = { chatId: "-100555", messageThreadId: "99" };
    const encoded = adapter.encodeThreadId(original);
    const decoded = adapter.decodeThreadId(encoded);
    expect(decoded).toEqual(original);
  });

  test("channelIdFromThreadId strips topic", () => {
    expect(adapter.channelIdFromThreadId("telegram:-100123:42")).toBe("telegram:-100123");
  });

  test("channelIdFromThreadId keeps simple ID", () => {
    expect(adapter.channelIdFromThreadId("telegram:12345")).toBe("telegram:12345");
  });

  test("isDM returns true for positive chat ID", () => {
    expect(adapter.isDM("telegram:12345")).toBe(true);
  });

  test("isDM returns false for negative chat ID (group)", () => {
    expect(adapter.isDM("telegram:-100123")).toBe(false);
  });
});

// ─── Format Converter ──────────────────────────────────────────────────

describe("TelegramFormatConverter", () => {
  const converter = new TelegramFormatConverter();

  test("escapeHtml escapes special characters", () => {
    expect(escapeHtml("<b>test & 'stuff'</b>")).toBe("&lt;b&gt;test &amp; 'stuff'&lt;/b&gt;");
  });

  test("markdownToTelegramHtml converts bold", () => {
    expect(markdownToTelegramHtml("**bold**")).toBe("<b>bold</b>");
  });

  test("markdownToTelegramHtml converts italic", () => {
    expect(markdownToTelegramHtml("*italic*")).toBe("<i>italic</i>");
  });

  test("markdownToTelegramHtml converts strikethrough", () => {
    expect(markdownToTelegramHtml("~~strike~~")).toBe("<s>strike</s>");
  });

  test("markdownToTelegramHtml converts inline code", () => {
    const result = markdownToTelegramHtml("`code`");
    expect(result).toContain("<code>");
    expect(result).toContain("code");
  });

  test("markdownToTelegramHtml converts links", () => {
    expect(markdownToTelegramHtml("[text](https://example.com)")).toBe(
      '<a href="https://example.com">text</a>',
    );
  });

  test("markdownToTelegramHtml converts code blocks", () => {
    const result = markdownToTelegramHtml("```js\nconsole.log('hi')\n```");
    expect(result).toContain("<pre><code>");
    expect(result).toContain("console.log");
  });

  test("fromAst converts bold node", () => {
    const ast = parseMarkdown("**bold text**");
    const html = converter.fromAst(ast);
    expect(html).toContain("<b>");
    expect(html).toContain("bold text");
  });

  test("fromAst converts italic node", () => {
    const ast = parseMarkdown("*italic text*");
    const html = converter.fromAst(ast);
    expect(html).toContain("<i>");
    expect(html).toContain("italic text");
  });

  test("fromAst converts code block", () => {
    const ast = parseMarkdown("```\nhello\n```");
    const html = converter.fromAst(ast);
    expect(html).toContain("<pre><code>");
    expect(html).toContain("hello");
  });

  test("fromAst converts link", () => {
    const ast = parseMarkdown("[click](https://example.com)");
    const html = converter.fromAst(ast);
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain("click");
  });

  test("toAst parses Telegram HTML bold", () => {
    const ast = converter.toAst("<b>bold</b>");
    const md = stringifyMarkdown(ast);
    expect(md).toContain("**bold**");
  });

  test("renderPostable handles string", () => {
    expect(converter.renderPostable("hello")).toBe("hello");
  });

  test("renderPostable handles markdown object", () => {
    const result = converter.renderPostable({ markdown: "**bold**" });
    expect(result).toContain("<b>");
    expect(result).toContain("bold");
  });

  test("renderPostable handles raw object", () => {
    expect(converter.renderPostable({ raw: "raw text" })).toBe("raw text");
  });
});

// ─── Message Parsing ───────────────────────────────────────────────────

describe("Message parsing", () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter({
      botToken: "123456:ABC-DEF",
      userName: "testbot",
    });
  });

  test("parseMessage extracts text and author", () => {
    const raw: TelegramRawMessage = {
      message_id: 42,
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      text: "Hello world",
      from: {
        id: 999,
        is_bot: false,
        first_name: "John",
        last_name: "Doe",
        username: "johndoe",
      },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.id).toBe("42");
    expect(msg.text).toBe("Hello world");
    expect(msg.author.userId).toBe("999");
    expect(msg.author.userName).toBe("johndoe");
    expect(msg.author.fullName).toBe("John Doe");
    expect(msg.author.isBot).toBe(false);
    expect(msg.threadId).toBe("telegram:12345");
  });

  test("parseMessage handles message with topic thread", () => {
    const raw: TelegramRawMessage = {
      message_id: 100,
      chat: { id: -100555, type: "supergroup", is_forum: true },
      date: 1700000000,
      text: "Topic message",
      message_thread_id: 42,
      from: {
        id: 888,
        is_bot: false,
        first_name: "Alice",
      },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.threadId).toBe("telegram:-100555:42");
    expect(msg.text).toBe("Topic message");
  });

  test("parseMessage handles caption (photo message)", () => {
    const raw: TelegramRawMessage = {
      message_id: 200,
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      caption: "Photo caption",
      photo: [
        { file_id: "abc", file_unique_id: "u1", width: 100, height: 100 },
        { file_id: "def", file_unique_id: "u2", width: 800, height: 600, file_size: 50000 },
      ],
      from: { id: 777, is_bot: false, first_name: "Bob" },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.text).toBe("Photo caption");
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("image");
  });

  test("parseMessage handles document attachment", () => {
    const raw: TelegramRawMessage = {
      message_id: 300,
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      text: "Here's a file",
      document: {
        file_id: "doc123",
        file_name: "report.pdf",
        mime_type: "application/pdf",
        file_size: 1024000,
      },
      from: { id: 777, is_bot: false, first_name: "Bob" },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("file");
    expect(msg.attachments[0]!.name).toBe("report.pdf");
    expect(msg.attachments[0]!.mimeType).toBe("application/pdf");
  });

  test("parseMessage handles edited message", () => {
    const raw: TelegramRawMessage = {
      message_id: 400,
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      edit_date: 1700001000,
      text: "Edited text",
      from: { id: 777, is_bot: false, first_name: "Bob" },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.metadata.edited).toBe(true);
    expect(msg.metadata.editedAt).toBeDefined();
  });

  test("parseMessage handles missing from field", () => {
    const raw: TelegramRawMessage = {
      message_id: 500,
      chat: { id: -100999, type: "channel" },
      date: 1700000000,
      text: "Channel post",
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.author.userId).toBe("unknown");
    expect(msg.author.fullName).toBe("Unknown");
  });

  test("parseMessage handles voice attachment", () => {
    const raw: TelegramRawMessage = {
      message_id: 600,
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      voice: { file_id: "voice123", duration: 5 },
      from: { id: 777, is_bot: false, first_name: "Bob" },
    };

    const msg = adapter.parseMessage(raw);
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("audio");
    expect(msg.attachments[0]!.mimeType).toBe("audio/ogg");
  });
});

// ─── Webhook ───────────────────────────────────────────────────────────

describe("Webhook verification", () => {
  test("verifyWebhookSecret passes when no secret configured", () => {
    const req = new Request("https://example.com/webhook", { method: "POST" });
    expect(verifyWebhookSecret(req)).toBe(true);
  });

  test("verifyWebhookSecret passes with correct secret", () => {
    const req = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "my-secret" },
    });
    expect(verifyWebhookSecret(req, "my-secret")).toBe(true);
  });

  test("verifyWebhookSecret fails with wrong secret", () => {
    const req = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
    });
    expect(verifyWebhookSecret(req, "my-secret")).toBe(false);
  });

  test("verifyWebhookSecret fails with missing header", () => {
    const req = new Request("https://example.com/webhook", { method: "POST" });
    expect(verifyWebhookSecret(req, "my-secret")).toBe(false);
  });
});

describe("Webhook update parsing", () => {
  test("parseWebhookUpdate parses valid update", async () => {
    const body = JSON.stringify({
      update_id: 123,
      message: {
        message_id: 1,
        chat: { id: 12345, type: "private" },
        date: 1700000000,
        text: "Hello",
        from: { id: 999, is_bot: false, first_name: "Test" },
      },
    });
    const req = new Request("https://example.com/webhook", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    const update = await parseWebhookUpdate(req);
    expect(update).not.toBeNull();
    expect(update!.update_id).toBe(123);
    expect(update!.message?.text).toBe("Hello");
  });

  test("parseWebhookUpdate returns null for invalid JSON", async () => {
    const req = new Request("https://example.com/webhook", {
      method: "POST",
      body: "not json",
    });
    const update = await parseWebhookUpdate(req);
    expect(update).toBeNull();
  });

  test("parseWebhookUpdate returns null for missing update_id", async () => {
    const req = new Request("https://example.com/webhook", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "Content-Type": "application/json" },
    });
    const update = await parseWebhookUpdate(req);
    expect(update).toBeNull();
  });
});

// ─── Factory function ──────────────────────────────────────────────────

describe("createTelegramAdapter", () => {
  test("creates adapter with explicit token", () => {
    const adapter = createTelegramAdapter({ botToken: "123:ABC" });
    expect(adapter.name).toBe("telegram");
  });

  test("throws without token", () => {
    const origEnv = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => createTelegramAdapter()).toThrow("Telegram bot token is required");
    if (origEnv) process.env.TELEGRAM_BOT_TOKEN = origEnv;
  });

  test("reads token from env var", () => {
    const origEnv = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "env-token:XYZ";
    const adapter = createTelegramAdapter();
    expect(adapter.name).toBe("telegram");
    if (origEnv) {
      process.env.TELEGRAM_BOT_TOKEN = origEnv;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
});

// ─── Media Type Detection ──────────────────────────────────────────────

describe("Media type detection", () => {
  test("detects photo from jpg extension", () => {
    expect(detectMediaKind("photo.jpg")).toBe("photo");
  });

  test("detects photo from png extension", () => {
    expect(detectMediaKind("image.png")).toBe("photo");
  });

  test("detects photo from webp extension", () => {
    expect(detectMediaKind("sticker.webp")).toBe("photo");
  });

  test("detects audio from mp3 extension", () => {
    expect(detectMediaKind("song.mp3")).toBe("audio");
  });

  test("detects audio from ogg extension", () => {
    expect(detectMediaKind("voice.ogg")).toBe("audio");
  });

  test("detects video from mp4 extension", () => {
    expect(detectMediaKind("clip.mp4")).toBe("video");
  });

  test("detects video from webm extension", () => {
    expect(detectMediaKind("video.webm")).toBe("video");
  });

  test("detects sticker from tgs extension", () => {
    expect(detectMediaKind("animated.tgs")).toBe("sticker");
  });

  test("detects document for unknown extension", () => {
    expect(detectMediaKind("report.pdf")).toBe("document");
  });

  test("detects document for no extension", () => {
    expect(detectMediaKind("README")).toBe("document");
  });

  test("detects photo from jpeg extension", () => {
    expect(detectMediaKind("photo.jpeg")).toBe("photo");
  });

  test("detects audio from wav extension", () => {
    expect(detectMediaKind("sound.wav")).toBe("audio");
  });
});

// ─── Media Directive Parsing ───────────────────────────────────────────

describe("Media directive parsing", () => {
  test("parses [photo] directive", () => {
    const result = parseMediaDirectives("[photo] /path/to/image.jpg | My caption");
    expect(result.media.length).toBe(1);
    expect(result.media[0]!.kind).toBe("photo");
    expect(result.media[0]!.source).toBe("/path/to/image.jpg");
    expect(result.media[0]!.caption).toBe("My caption");
    expect(result.cleanText).toBe("");
  });

  test("parses [audio] directive", () => {
    const result = parseMediaDirectives("[audio] https://example.com/song.mp3");
    expect(result.media.length).toBe(1);
    expect(result.media[0]!.kind).toBe("audio");
    expect(result.media[0]!.source).toBe("https://example.com/song.mp3");
    expect(result.media[0]!.caption).toBeUndefined();
  });

  test("parses MEDIA: directive with auto-detection", () => {
    const result = parseMediaDirectives("MEDIA:/path/to/video.mp4");
    expect(result.media.length).toBe(1);
    expect(result.media[0]!.kind).toBe("video");
    expect(result.media[0]!.source).toBe("/path/to/video.mp4");
  });

  test("preserves non-directive text", () => {
    const input = "Hello world\n[photo] /img.jpg\nGoodbye";
    const result = parseMediaDirectives(input);
    expect(result.cleanText).toBe("Hello world\nGoodbye");
    expect(result.media.length).toBe(1);
  });

  test("handles multiple directives", () => {
    const input = "[photo] /a.jpg\n[audio] /b.mp3\nSome text";
    const result = parseMediaDirectives(input);
    expect(result.media.length).toBe(2);
    expect(result.cleanText).toBe("Some text");
  });

  test("returns empty media for plain text", () => {
    const result = parseMediaDirectives("Just plain text here");
    expect(result.media.length).toBe(0);
    expect(result.cleanText).toBe("Just plain text here");
  });

  test("parses [sticker] directive", () => {
    const result = parseMediaDirectives("[sticker] /path/to/sticker.webp");
    expect(result.media.length).toBe(1);
    expect(result.media[0]!.kind).toBe("sticker");
  });

  test("parses [video] directive with caption", () => {
    const result = parseMediaDirectives("[video] /clip.mp4 | Check this out");
    expect(result.media.length).toBe(1);
    expect(result.media[0]!.kind).toBe("video");
    expect(result.media[0]!.caption).toBe("Check this out");
  });
});

// ─── Group Message Filtering ───────────────────────────────────────────

describe("Group message filtering", () => {
  test("blocks message when no group config", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: undefined,
      senderId: "123",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(false);
  });

  test("blocks message when group is disabled", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { enabled: false },
      senderId: "123",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(false);
  });

  test("blocks message when mention required but missing", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: true },
      senderId: "123",
      text: "hello world",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(false);
  });

  test("allows message when mention required and present", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: true },
      senderId: "123",
      text: "hello @mybot how are you",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
    expect(result.text).toBe("hello  how are you");
  });

  test("strips @mention from text", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: true },
      senderId: "123",
      text: "@mybot do something",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
    expect(result.text).toBe("do something");
  });

  test("allows message when requireMention is false", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: false },
      senderId: "123",
      text: "hello world",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
  });

  test("blocks sender not in allowFrom list", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: false, allowFrom: ["456", "789"] },
      senderId: "123",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(false);
  });

  test("allows sender in allowFrom list", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: false, allowFrom: ["123", "456"] },
      senderId: "123",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
  });

  test("allows all senders with wildcard allowFrom", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: false, allowFrom: "*" },
      senderId: "999",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
  });

  test("allows all senders with wildcard in array", () => {
    const result = shouldAllowGroupMessage({
      groupCfg: { requireMention: false, allowFrom: ["*"] },
      senderId: "999",
      text: "hello",
      botUsername: "mybot",
    });
    expect(result.allowed).toBe(true);
  });
});

// ─── resolveGroupConfig ────────────────────────────────────────────────

describe("resolveGroupConfig", () => {
  test("returns exact match", () => {
    const groups = { "-100123": { enabled: true }, "*": { enabled: false } };
    expect(resolveGroupConfig(groups, "-100123")?.enabled).toBe(true);
  });

  test("falls back to wildcard", () => {
    const groups = { "*": { requireMention: false } };
    expect(resolveGroupConfig(groups, "-100999")?.requireMention).toBe(false);
  });

  test("returns undefined when no match", () => {
    const groups = { "-100123": { enabled: true } };
    expect(resolveGroupConfig(groups, "-100999")).toBeUndefined();
  });

  test("returns undefined when groups is undefined", () => {
    expect(resolveGroupConfig(undefined, "-100123")).toBeUndefined();
  });
});

// ─── Forward Context ───────────────────────────────────────────────────

describe("Forward context extraction", () => {
  test("builds forward context from user origin", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "forwarded text",
      forward_origin: {
        type: "user",
        sender_user: { id: 999, is_bot: false, first_name: "John", last_name: "Doe", username: "johndoe" },
        date: 1699999000,
      },
    };
    const ctx = buildForwardContext(msg);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain("Forwarded");
    expect(ctx).toContain("John Doe");
    expect(ctx).toContain("@johndoe");
  });

  test("builds forward context from hidden user", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "forwarded",
      forward_origin: { type: "hidden_user", sender_user_name: "Secret Person" },
    };
    const ctx = buildForwardContext(msg);
    expect(ctx).toContain("Secret Person");
  });

  test("builds forward context from channel origin", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "channel post",
      forward_origin: {
        type: "channel",
        chat: { id: -100555, type: "channel", title: "News Channel", username: "newschan" },
        message_id: 42,
      },
    };
    const ctx = buildForwardContext(msg);
    expect(ctx).toContain("News Channel");
    expect(ctx).toContain("https://t.me/newschan/42");
  });

  test("builds forward context from legacy forward_from", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "old forward",
      forward_from: { id: 888, is_bot: false, first_name: "Alice", username: "alice" },
      forward_date: 1699998000,
    };
    const ctx = buildForwardContext(msg);
    expect(ctx).toContain("Alice");
    expect(ctx).toContain("@alice");
  });

  test("builds forward context from legacy forward_sender_name", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "hidden forward",
      forward_sender_name: "Hidden User",
    };
    const ctx = buildForwardContext(msg);
    expect(ctx).toContain("Hidden User");
  });

  test("returns null for non-forwarded message", () => {
    const msg: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "normal message",
    };
    expect(buildForwardContext(msg)).toBeNull();
  });
});

// ─── Reply Context ─────────────────────────────────────────────────────

describe("Reply context extraction", () => {
  test("builds reply context from text reply", () => {
    const replyMsg: TelegramRawMessage = {
      message_id: 10,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "Original message text",
      from: { id: 999, is_bot: false, first_name: "Bob" },
    };
    const ctx = buildReplyContext(replyMsg);
    expect(ctx).toContain("Reply to:");
    expect(ctx).toContain("Original message text");
  });

  test("truncates long reply text", () => {
    const longText = "A".repeat(400);
    const replyMsg: TelegramRawMessage = {
      message_id: 10,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: longText,
      from: { id: 999, is_bot: false, first_name: "Bob" },
    };
    const ctx = buildReplyContext(replyMsg);
    expect(ctx).toContain("...");
    expect(ctx!.length).toBeLessThan(longText.length);
  });

  test("includes media hints in reply context", () => {
    const replyMsg: TelegramRawMessage = {
      message_id: 10,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "Check this",
      photo: [{ file_id: "abc", file_unique_id: "u1", width: 100, height: 100 }],
      from: { id: 999, is_bot: false, first_name: "Bob" },
    };
    const ctx = buildReplyContext(replyMsg);
    expect(ctx).toContain("[photo]");
  });

  test("skips reply to own bot messages", () => {
    const replyMsg: TelegramRawMessage = {
      message_id: 10,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "Bot reply",
      from: { id: 42, is_bot: true, first_name: "MyBot" },
    };
    const ctx = buildReplyContext(replyMsg, 42);
    expect(ctx).toBeNull();
  });

  test("includes sticker emoji in reply context", () => {
    const replyMsg: TelegramRawMessage = {
      message_id: 10,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      sticker: { file_id: "stk1", file_unique_id: "u1", emoji: "😀" },
      from: { id: 999, is_bot: false, first_name: "Bob" },
    };
    const ctx = buildReplyContext(replyMsg);
    expect(ctx).toContain("[sticker 😀]");
  });
});

// ─── Network Resilience ────────────────────────────────────────────────

describe("Network error classification", () => {
  test("classifies ETIMEDOUT as transient", () => {
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
  });

  test("classifies ECONNRESET as transient", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
  });

  test("classifies network error as transient", () => {
    expect(isTransientError(new Error("network error"))).toBe(true);
  });

  test("classifies 429 as transient", () => {
    expect(isTransientError({ error_code: 429, message: "Too Many Requests" })).toBe(true);
  });

  test("classifies 500 as transient", () => {
    expect(isTransientError({ error_code: 500, message: "Internal Server Error" })).toBe(true);
  });

  test("classifies 400 as permanent", () => {
    expect(isTransientError({ error_code: 400, message: "Bad Request" })).toBe(false);
  });

  test("classifies 403 as permanent", () => {
    expect(isTransientError({ error_code: 403, message: "Forbidden" })).toBe(false);
  });

  test("classifies null as non-transient", () => {
    expect(isTransientError(null)).toBe(false);
  });
});

describe("Retry logic", () => {
  test("succeeds on first try", async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return "ok"; });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on transient error", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("ETIMEDOUT");
      return "recovered";
    }, 3, 10);
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  test("throws immediately on permanent error", async () => {
    let calls = 0;
    try {
      await withRetry(async () => {
        calls++;
        const err = new Error("Bad Request") as any;
        err.error_code = 400;
        throw err;
      }, 3, 10);
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.message).toBe("Bad Request");
    }
    expect(calls).toBe(1);
  });

  test("throws after max retries exhausted", async () => {
    let calls = 0;
    try {
      await withRetry(async () => {
        calls++;
        throw new Error("ECONNRESET");
      }, 2, 10);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBe("ECONNRESET");
    }
    expect(calls).toBe(3); // initial + 2 retries
  });
});

// ─── Enhanced Message Parsing ──────────────────────────────────────────

describe("Enhanced message parsing", () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter({
      botToken: "123456:ABC-DEF",
      userName: "testbot",
    });
  });

  test("parseMessage includes forward context", () => {
    const raw: TelegramRawMessage = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "forwarded text",
      forward_origin: {
        type: "user",
        sender_user: { id: 999, is_bot: false, first_name: "John" },
      },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Forwarded");
    expect(msg.text).toContain("John");
    expect(msg.text).toContain("forwarded text");
  });

  test("parseMessage includes reply context", () => {
    const raw: TelegramRawMessage = {
      message_id: 2,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "my reply",
      reply_to_message: {
        message_id: 1,
        chat: { id: 123, type: "private" },
        date: 1699999000,
        text: "original message",
        from: { id: 999, is_bot: false, first_name: "Bob" },
      },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Reply to:");
    expect(msg.text).toContain("original message");
    expect(msg.text).toContain("my reply");
  });

  test("parseMessage includes sticker context", () => {
    const raw: TelegramRawMessage = {
      message_id: 3,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      sticker: {
        file_id: "stk1",
        file_unique_id: "u1",
        emoji: "😀",
        set_name: "FunStickers",
      },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Sticker");
    expect(msg.text).toContain("😀");
    expect(msg.text).toContain("FunStickers");
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("image");
  });

  test("parseMessage includes voice metadata", () => {
    const raw: TelegramRawMessage = {
      message_id: 4,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      voice: { file_id: "v1", duration: 5, mime_type: "audio/ogg" },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Voice message");
    expect(msg.text).toContain("5s");
    expect(msg.text).toContain("audio/ogg");
  });

  test("parseMessage includes audio metadata with performer/title", () => {
    const raw: TelegramRawMessage = {
      message_id: 5,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      audio: {
        file_id: "a1",
        file_name: "song.mp3",
        mime_type: "audio/mpeg",
        duration: 180,
        performer: "Artist",
        title: "Song Title",
      },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Audio");
    expect(msg.text).toContain("Artist");
    expect(msg.text).toContain("Song Title");
    expect(msg.text).toContain("180s");
  });

  test("parseMessage includes document context", () => {
    const raw: TelegramRawMessage = {
      message_id: 6,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      text: "Here's a file",
      document: {
        file_id: "doc1",
        file_name: "report.pdf",
        mime_type: "application/pdf",
        file_size: 1024,
      },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Document: report.pdf");
    expect(msg.text).toContain("application/pdf");
  });

  test("parseMessage includes video_note context", () => {
    const raw: TelegramRawMessage = {
      message_id: 7,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      video_note: { file_id: "vn1", duration: 10, length: 240 },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.text).toContain("[Video note");
    expect(msg.text).toContain("10s");
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("video");
  });

  test("parseMessage extracts animation attachment", () => {
    const raw: TelegramRawMessage = {
      message_id: 8,
      chat: { id: 123, type: "private" },
      date: 1700000000,
      animation: { file_id: "anim1", file_name: "funny.gif", mime_type: "video/mp4" },
      from: { id: 888, is_bot: false, first_name: "Alice" },
    };
    const msg = adapter.parseMessage(raw);
    expect(msg.attachments.length).toBe(1);
    expect(msg.attachments[0]!.type).toBe("video");
    expect(msg.attachments[0]!.name).toBe("funny.gif");
  });
});
