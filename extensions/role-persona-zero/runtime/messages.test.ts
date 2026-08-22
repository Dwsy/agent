import { describe, expect, test } from "bun:test";
import { getLastUserText, messageText } from "./messages.ts";

const text = (t: string) => ({ type: "text", text: t });

describe("messageText", () => {
  test("joins all text parts across messages", () => {
    const messages = [
      { role: "user", content: [text("hello"), text("world")] },
      { role: "assistant", content: [text("hi")] },
    ];
    expect(messageText(messages)).toBe("hello\nworld\nhi");
  });

  test("ignores non-text content and malformed messages", () => {
    const messages = [
      { role: "user", content: [{ type: "image", data: "..." }, text("ok")] },
      { role: "assistant", content: "not-an-array" },
      null,
    ];
    expect(messageText(messages as unknown[])).toBe("ok");
  });

  test("returns empty string for empty input", () => {
    expect(messageText([])).toBe("");
  });
});

describe("getLastUserText", () => {
  test("returns text of the LAST user message", () => {
    const messages = [
      { role: "user", content: [text("first")] },
      { role: "assistant", content: [text("reply")] },
      { role: "user", content: [text("second question")] },
    ];
    expect(getLastUserText(messages)).toBe("second question");
  });

  test("returns empty string when no user message exists", () => {
    expect(getLastUserText([{ role: "assistant", content: [text("x")] }])).toBe("");
    expect(getLastUserText([])).toBe("");
  });

  test("joins multiple text parts and trims", () => {
    const messages = [{ role: "user", content: [text(" a "), text("b")] }];
    expect(getLastUserText(messages)).toBe("a \nb");
  });
});
