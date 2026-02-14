/** send_message tool — send text messages to the current chat via pi-gateway. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

export function createSendMessageTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "send_message",
    label: "Send Message",
    description:
      "Send a text message to the current chat via pi-gateway. " +
      "Optionally reply to a specific message by providing replyTo (message ID). " +
      "Use this when you need to send an additional message outside the normal response flow.",
    parameters: Type.Object({
      text: Type.String({ description: "Message text to send" }),
      replyTo: Type.Optional(
        Type.String({ description: "Message ID to reply to (creates a threaded reply)" }),
      ),
      parseMode: Type.Optional(
        Type.String({ description: "Parse mode: Markdown, HTML, or plain (default: channel default)" }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { text, replyTo, parseMode } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const res = await fetch(`${gatewayUrl}/api/message/send`, {
          method: "POST",
          headers: gatewayHeaders(authToken ?? internalToken, true),
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            text,
            replyTo,
            parseMode,
          }),
        });

        const data = await parseResponseJson(res);

        if (!res.ok) {
          return toolError(`Failed to send message: ${data.error || res.statusText}`);
        }

        const summary = replyTo
          ? `Message sent (reply to ${replyTo}, ${data.textLength} chars)`
          : `Message sent (${data.textLength} chars)`;

        return toolOk(summary);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `send_message error: ${message}` }],
          details: { error: true },
        };
      }
    },
  };
}
