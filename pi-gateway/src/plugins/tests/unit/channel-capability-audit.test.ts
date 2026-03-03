import { describe, expect, test } from "bun:test";
import type { ChannelPlugin } from "../../types.ts";
import { auditChannelCapabilities } from "../../channel-capability-audit.ts";

function makeRegistry(channel: ChannelPlugin) {
  return {
    channels: new Map([[channel.id, channel]]),
  } as any;
}

function baseChannel(): ChannelPlugin {
  return {
    id: "mock",
    meta: { label: "Mock" },
    capabilities: {
      matrix: {
        messaging: { post: true, streaming: "none" },
      },
    },
    outbound: {
      sendText: async () => ({ ok: true }),
    },
    async init() {},
    async start() {},
    async stop() {},
  };
}

describe("channel capability audit", () => {
  test("reports missing method when matrix says supported", () => {
    const channel = baseChannel();
    channel.capabilities.matrix = {
      messaging: { post: true, edit: true, streaming: "post-edit" },
    };

    const issues = auditChannelCapabilities(makeRegistry(channel));
    expect(issues.some((i) => i.code === "method_missing" && i.message.includes("outbound.editMessage"))).toBeTrue();
  });

  test("warns on legacy/matrix mismatch", () => {
    const channel = baseChannel();
    channel.capabilities.editable = false;
    channel.capabilities.matrix = {
      messaging: { post: true, edit: true, streaming: "post-edit" },
    };
    channel.outbound.editMessage = async () => ({ ok: true });

    const issues = auditChannelCapabilities(makeRegistry(channel));
    expect(issues.some((i) => i.code === "legacy_matrix_mismatch")).toBeTrue();
  });

  test("passes clean config", () => {
    const channel = baseChannel();
    channel.capabilities.editable = true;
    channel.capabilities.deletable = true;
    channel.capabilities.reactions = true;
    channel.capabilities.history = true;
    channel.capabilities.matrix = {
      messaging: { post: true, edit: true, delete: true, fileUpload: "full", streaming: "post-edit" },
      conversation: { reactions: "full" },
      history: { fetchMessages: "full" },
      richContent: { buttons: "none" },
    };
    channel.outbound.editMessage = async () => ({ ok: true });
    channel.outbound.deleteMessage = async () => ({ ok: true });
    channel.outbound.sendMedia = async () => ({ ok: true });
    channel.outbound.sendReaction = async () => ({ ok: true });
    channel.outbound.readHistory = async () => ({ ok: true, messages: [] });

    const issues = auditChannelCapabilities(makeRegistry(channel));
    expect(issues.length).toBe(0);
  });
});
