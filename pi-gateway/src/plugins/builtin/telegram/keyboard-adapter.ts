import type { InlineKeyboardMarkup } from "../../types.ts";

type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

function normalizeButton(button: { text: string; callbackData?: string; callback_data?: string; url?: string }): TelegramInlineButton {
  const callbackData =
    (typeof button.callbackData === "string" && button.callbackData.length > 0)
      ? button.callbackData
      : (typeof button.callback_data === "string" && button.callback_data.length > 0)
        ? button.callback_data
        : undefined;

  return {
    text: button.text,
    ...(callbackData ? { callback_data: callbackData } : {}),
    ...(button.url ? { url: button.url } : {}),
  };
}

export function toTelegramInlineKeyboard(markup: InlineKeyboardMarkup): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: (markup.inline_keyboard ?? []).map((row) =>
      row.map((button) => normalizeButton(button as any)),
    ),
  };
}
