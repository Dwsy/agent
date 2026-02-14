/** message tool — react/edit/delete actions on existing messages. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

const MESSAGE_ACTIONS = ["react", "edit", "delete", "pin", "read"] as const;

export function createMessageActionTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "message",
    label: "Message Action",
    description:
      "Perform actions on chat messages: react with emoji, edit text, delete, pin/unpin, or read history. " +
      "The messageId comes from previous send_message or send_media tool results. " +
      "Actions: react (add/remove emoji), edit (replace text), delete (remove), pin (pin/unpin), read (fetch recent messages).",
    parameters: Type.Object({
      action: Type.String({
        enum: MESSAGE_ACTIONS as unknown as string[],
        description: "Action to perform: react, edit, delete, pin, or read",
      }),
      messageId: Type.Optional(
        Type.String({ description: "Target message ID (required for react/edit/delete/pin, not for read)" }),
      ),
      emoji: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "Emoji for react action — single emoji or array of emoji",
        }),
      ),
      text: Type.Optional(
        Type.String({ description: "New text for edit action" }),
      ),
      remove: Type.Optional(
        Type.Boolean({ description: "Remove reaction instead of adding (react action only, default: false)" }),
      ),
      unpin: Type.Optional(
        Type.Boolean({ description: "Unpin instead of pin (pin action only, default: false)" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Number of messages to read (read action, default: 20, max: 100)" }),
      ),
      before: Type.Optional(
        Type.String({ description: "Read messages before this message ID (read action, for pagination)" }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { action, messageId, emoji, text, remove, unpin, limit, before } = params as {
        action: string;
        messageId?: string;
        emoji?: string | string[];
        text?: string;
        remove?: boolean;
        unpin?: boolean;
        limit?: number;
        before?: string;
      };

      if (!MESSAGE_ACTIONS.includes(action as typeof MESSAGE_ACTIONS[number])) {
        return toolError(`Unknown action: ${action}. Must be one of: ${MESSAGE_ACTIONS.join(", ")}`);
      }
      if (!messageId && action !== "read") {
        return toolError("messageId is required for this action");
      }
      if (action === "react" && !emoji) {
        return toolError("emoji is required for react action");
      }
      if (action === "edit" && !text) {
        return toolError("text is required for edit action");
      }

      try {
        const res = await fetch(`${gatewayUrl}/api/message/action`, {
          method: "POST",
          headers: gatewayHeaders(authToken ?? internalToken, true),
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: process.env.PI_GATEWAY_SESSION_KEY || undefined,
            action,
            messageId,
            emoji,
            text,
            remove,
            unpin,
            limit,
            before,
          }),
        });

        const data = await parseResponseJson(res);

        if (!res.ok) {
          return toolError(String(data.error || res.statusText));
        }

        if (action === "react") {
          const emojiStr = Array.isArray(emoji) ? emoji.join(" ") : emoji;
          return toolOk(remove ? `Reaction ${emojiStr} removed from message ${messageId}` : `Reacted ${emojiStr} to message ${messageId}`);
        }
        if (action === "edit") {
          return toolOk(`Message ${messageId} edited (${(text ?? "").length} chars)`);
        }
        if (action === "delete") {
          return toolOk(`Message ${messageId} deleted`);
        }
        if (action === "pin") {
          return toolOk(unpin ? `Message ${messageId} unpinned` : `Message ${messageId} pinned`);
        }
        if (action === "read") {
          const messages = (data.messages as unknown[]) ?? [];
          return toolOk(JSON.stringify({ count: messages.length, messages }, null, 2));
        }

        return toolOk(`Action ${action} completed on message ${messageId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  };
}
