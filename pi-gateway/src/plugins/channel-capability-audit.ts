import type { ChannelOutbound } from "./types.ts";
import type { PluginRegistryState } from "./loader.ts";

export interface ChannelCapabilityAuditIssue {
  channelId: string;
  severity: "error" | "warn";
  code:
    | "matrix_missing"
    | "matrix_post_disabled"
    | "method_missing"
    | "legacy_matrix_mismatch"
    | "streaming_mismatch";
  message: string;
}

function hasMethod(outbound: ChannelOutbound, key: keyof ChannelOutbound): boolean {
  return typeof outbound[key] === "function";
}

export function auditChannelCapabilities(registry: PluginRegistryState): ChannelCapabilityAuditIssue[] {
  const issues: ChannelCapabilityAuditIssue[] = [];

  for (const [channelId, channel] of registry.channels.entries()) {
    const matrix = channel.capabilities.matrix;

    if (!matrix) {
      issues.push({
        channelId,
        severity: "warn",
        code: "matrix_missing",
        message: "Channel missing capabilities.matrix declaration",
      });
      continue;
    }

    if (matrix.messaging?.post === false) {
      issues.push({
        channelId,
        severity: "warn",
        code: "matrix_post_disabled",
        message: "matrix.messaging.post is false; sendText-based channel should usually allow posting",
      });
    }

    const methodChecks: Array<{
      enabled: boolean;
      method: keyof ChannelOutbound;
      feature: string;
    }> = [
      { enabled: matrix.messaging?.edit === true, method: "editMessage", feature: "messaging.edit" },
      { enabled: matrix.messaging?.delete === true, method: "deleteMessage", feature: "messaging.delete" },
      { enabled: matrix.history?.fetchMessages === "full" || matrix.history?.fetchMessages === "partial", method: "readHistory", feature: "history.fetchMessages" },
      { enabled: matrix.richContent?.buttons === "full" || matrix.richContent?.buttons === "partial", method: "sendKeyboard", feature: "richContent.buttons" },
      { enabled: matrix.conversation?.reactions === "full" || matrix.conversation?.reactions === "partial", method: "sendReaction", feature: "conversation.reactions" },
      { enabled: matrix.messaging?.fileUpload === "full" || matrix.messaging?.fileUpload === "partial", method: "sendMedia", feature: "messaging.fileUpload" },
    ];

    for (const check of methodChecks) {
      if (check.enabled && !hasMethod(channel.outbound, check.method)) {
        issues.push({
          channelId,
          severity: "error",
          code: "method_missing",
          message: `matrix.${check.feature} requires outbound.${String(check.method)}()`,
        });
      }
    }

    const legacyPairs: Array<{ legacy: boolean | undefined; matrixEnabled: boolean; name: string }> = [
      {
        legacy: channel.capabilities.editable,
        matrixEnabled: matrix.messaging?.edit === true,
        name: "editable vs messaging.edit",
      },
      {
        legacy: channel.capabilities.deletable,
        matrixEnabled: matrix.messaging?.delete === true,
        name: "deletable vs messaging.delete",
      },
      {
        legacy: channel.capabilities.reactions,
        matrixEnabled: matrix.conversation?.reactions === "full" || matrix.conversation?.reactions === "partial",
        name: "reactions vs conversation.reactions",
      },
      {
        legacy: channel.capabilities.history,
        matrixEnabled: matrix.history?.fetchMessages === "full" || matrix.history?.fetchMessages === "partial",
        name: "history vs history.fetchMessages",
      },
    ];

    for (const pair of legacyPairs) {
      if (pair.legacy !== undefined && pair.legacy !== pair.matrixEnabled) {
        issues.push({
          channelId,
          severity: "warn",
          code: "legacy_matrix_mismatch",
          message: `Legacy capability mismatch: ${pair.name}`,
        });
      }
    }

    const streamMode = matrix.messaging?.streaming ?? "none";
    const supportsStreaming = streamMode !== "none";
    const canStreamByMethod = Boolean(channel.streaming) || hasMethod(channel.outbound, "editMessage");
    if (supportsStreaming && !canStreamByMethod) {
      issues.push({
        channelId,
        severity: "warn",
        code: "streaming_mismatch",
        message: `matrix.messaging.streaming=${streamMode} but no streaming adapter/editMessage available`,
      });
    }
  }

  return issues;
}
