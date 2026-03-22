import { describe, expect, test } from "bun:test";
import { toSource } from "../../helpers.ts";

describe("telegram helpers toSource", () => {
  test("uses callbackQuery.message chat/topic when ctx.message is missing", () => {
    const source = toSource("default", {
      chat: undefined,
      from: { id: 123, username: "dwsy" },
      callbackQuery: {
        id: "cb-1",
        message: {
          message_id: 88,
          message_thread_id: 777,
          chat: { id: -100123, type: "supergroup", is_forum: true },
        } as any,
      },
    } as any);

    expect(source.channel).toBe("telegram");
    expect(source.accountId).toBe("default");
    expect(source.chatType).toBe("group");
    expect(source.chatId).toBe("-100123");
    expect(source.topicId).toBe("777");
    expect(source.senderId).toBe("123");
    expect(source.senderName).toBe("dwsy");
  });

  test("maps Telegram channel chats to gateway channel type", () => {
    const source = toSource("default", {
      chat: { id: -100999, type: "channel" },
      from: { id: 456, first_name: "channel-bot" },
      message: {
        message_id: 99,
        chat: { id: -100999, type: "channel" },
      } as any,
    } as any);

    expect(source.chatType).toBe("channel");
    expect(source.chatId).toBe("-100999");
    expect(source.senderId).toBe("456");
    expect(source.senderName).toBe("channel-bot");
  });
});
