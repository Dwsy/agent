import { describe, expect, test } from "bun:test";
import { parseTelegramTarget } from "../handlers.ts";

describe("telegram target parser", () => {
  test("supports legacy chatId target", () => {
    expect(parseTelegramTarget("123456", "default")).toEqual({
      accountId: "default",
      chatId: "123456",
    });
  });

  test("supports account-scoped chat target", () => {
    expect(parseTelegramTarget("work:123456", "default")).toEqual({
      accountId: "work",
      chatId: "123456",
    });
  });

  test("supports account + topic target", () => {
    expect(parseTelegramTarget("work:-100123:topic:42", "default")).toEqual({
      accountId: "work",
      chatId: "-100123",
      topicId: "42",
    });
  });
});
