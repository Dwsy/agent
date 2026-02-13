/** message tool — react/edit/delete actions on existing messages. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError } from "./helpers.ts";

const MESSAGE_ACTIONS = ["react", "edit", "delete"] as const;

export function createMessageActionTool(gatewayUrl: string, internalToken: string) {
  return {
    name: "message",
    label: "Message Action",
    description:
      "Perform actions on existing chat messages: react with emoji, edit message text, or delete a message. " +
      "The messageId comes from previous send_message or send_media tool results. " +
      "Actions: react (add/remove emoji reaction), edit (replace message text), delete (remove message).",
    parameters: Type.Object({
      action: Type.String({
        enum: MESSAGE_ACTIONS as unknown as string[],
        description: "Action to perform: react, edit, or delete",
      }),
      messageId: Type.String({ description: "Target message ID (from send_message/send_media result)" }),
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
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { action, messageId, emoji, text, remove } = params as {
        action: string;
        messageId: string;
        emoji?: string | string[];
        text?: string;
        remove?: boolean;
      };

      if (!MESSAGE_ACTIONS.includes(action as typeof MESSAGE_ACTIONS[number])) {
        return toolError(`Unknown action: ${action}. Must be one of: ${MESSAGE_ACTIONS.join(", ")}`);
      }
      if (!messageId) {
        return toolError("messageId is required");
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: process.env.PI_GATEWAY_SESSION_KEY || undefined,
            action,
            messageId,
            emoji,
            text,
            remove,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

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

        return toolOk(`Action ${action} completed on message ${messageId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  };
}
