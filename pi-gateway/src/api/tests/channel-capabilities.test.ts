import { describe, expect, test } from "bun:test";
import type { ChannelPlugin } from "../../plugins/types.ts";
import {
  canDeleteMessage,
  canEditMessage,
  canReadHistory,
  canSendKeyboard,
  canSendMedia,
  canSendReaction,
} from "../channel-capabilities.ts";

function createBaseChannel(): ChannelPlugin {
  return {
    id: "mock",
    meta: { label: "Mock" },
    capabilities: {},
    outbound: {
      sendText: async () => ({ ok: true }),
    },
    async init() {},
    async start() {},
    async stop() {},
  };
}

describe("channel capability gates", () => {
  test("matrix enables media only when sendMedia exists", () => {
    const channel = createBaseChannel();
    channel.capabilities.matrix = { messaging: { fileUpload: "full" } };

    expect(canSendMedia(channel)).toBe(false);

    channel.outbound.sendMedia = async () => ({ ok: true });
    expect(canSendMedia(channel)).toBe(true);
  });

  test("matrix reactions=none blocks even if method exists", () => {
    const channel = createBaseChannel();
    channel.outbound.sendReaction = async () => ({ ok: true });
    channel.capabilities.matrix = { conversation: { reactions: "none" } };

    expect(canSendReaction(channel)).toBe(false);
  });

  test("legacy flags still work as fallback", () => {
    const channel = createBaseChannel();
    Object.assign(channel.capabilities, {
      editable: true,
      deletable: true,
      history: true,
      reactions: true,
    });
    channel.outbound.editMessage = async () => ({ ok: true });
    channel.outbound.deleteMessage = async () => ({ ok: true });
    channel.outbound.readHistory = async () => ({ ok: true, messages: [] });
    channel.outbound.sendReaction = async () => ({ ok: true });

    expect(canEditMessage(channel)).toBe(true);
    expect(canDeleteMessage(channel)).toBe(true);
    expect(canReadHistory(channel)).toBe(true);
    expect(canSendReaction(channel)).toBe(true);
  });

  test("keyboard requires both capability and method", () => {
    const channel = createBaseChannel();
    channel.capabilities.matrix = { richContent: { buttons: "full" } };
    expect(canSendKeyboard(channel)).toBe(false);

    channel.outbound.sendKeyboard = async () => ({ ok: true, messageId: "1" });
    expect(canSendKeyboard(channel)).toBe(true);

    channel.capabilities.matrix = { richContent: { buttons: "none" } };
    expect(canSendKeyboard(channel)).toBe(false);
  });
});
