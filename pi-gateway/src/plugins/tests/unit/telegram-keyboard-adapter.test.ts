import { describe, expect, test } from "bun:test";
import { toTelegramInlineKeyboard } from "../../builtin/telegram/keyboard-adapter.ts";

describe("telegram keyboard adapter", () => {
  test("maps callbackData to callback_data", () => {
    const markup = {
      inline_keyboard: [[{ text: "A", callbackData: "x:1" }]],
    };

    const out = toTelegramInlineKeyboard(markup as any);
    expect(out.inline_keyboard[0]?.[0]?.callback_data).toBe("x:1");
  });

  test("keeps legacy callback_data compatibility", () => {
    const markup = {
      inline_keyboard: [[{ text: "B", callback_data: "legacy" }]],
    };

    const out = toTelegramInlineKeyboard(markup as any);
    expect(out.inline_keyboard[0]?.[0]?.callback_data).toBe("legacy");
  });

  test("callbackData wins when both aliases exist", () => {
    const markup = {
      inline_keyboard: [[{ text: "C", callbackData: "new", callback_data: "old" }]],
    };

    const out = toTelegramInlineKeyboard(markup as any);
    expect(out.inline_keyboard[0]?.[0]?.callback_data).toBe("new");
  });
});
