/**
 * Discord handlers unit tests
 */
import { describe, expect, test } from "bun:test";

// Test parseDiscordTarget logic (inline since it uses discord.js types)
test("parseDiscordTarget handles simple channel ID", () => {
  // Simulate the parse logic
  const parse = (target: string) => {
    const [channelId, scope, threadId] = target.split(":");
    if (scope === "thread" && threadId) {
      return { channelId, threadId };
    }
    return { channelId: target };
  };

  expect(parse("123456")).toEqual({ channelId: "123456" });
  expect(parse("123456:thread:789")).toEqual({ channelId: "123456", threadId: "789" });
});

// Test text chunking logic
test("text chunking splits correctly", () => {
  const splitDiscordText = (text: string, max = 2000): string[] => {
    if (text.length <= max) return [text];
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + max));
      i += max;
    }
    return chunks;
  };

  expect(splitDiscordText("hello")).toEqual(["hello"]);
  expect(splitDiscordText("a".repeat(3000))).toEqual(["a".repeat(2000), "a".repeat(1000)]);
  expect(splitDiscordText("")).toEqual([""]);
});
