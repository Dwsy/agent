/**
 * Gateway Tools Extension for pi-gateway
 *
 * Registers tools that allow the pi agent to interact with the gateway:
 * - send_media: Send files (images, audio, documents) to the current chat
 *
 * Environment variables (set by gateway when spawning pi processes):
 * - PI_GATEWAY_URL: Gateway HTTP base URL (e.g., http://127.0.0.1:18789)
 * - PI_GATEWAY_INTERNAL_TOKEN: Shared secret for authenticating back to gateway
 * - PI_GATEWAY_SESSION_KEY: Current session key (set dynamically by RPC pool)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function gatewayTools(pi: ExtensionAPI) {
  const gatewayUrl = process.env.PI_GATEWAY_URL;
  const internalToken = process.env.PI_GATEWAY_INTERNAL_TOKEN;

  if (!gatewayUrl || !internalToken) {
    // Not running under pi-gateway — skip tool registration
    return;
  }

  pi.registerTool({
    name: "send_media",
    label: "Send Media",
    description:
      "Send a file (image, audio, document, video) to the current chat via pi-gateway. " +
      "The file is delivered directly to the channel (Telegram/Discord/WebChat). " +
      "Path must be relative to your workspace (e.g., ./output.png). " +
      "Type is auto-detected from extension if omitted.",
    parameters: Type.Object({
      path: Type.String({ description: "Relative file path (e.g., ./output.png, ./report.pdf)" }),
      caption: Type.Optional(
        Type.String({ description: "Optional caption text sent with the media" }),
      ),
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal("photo"),
            Type.Literal("audio"),
            Type.Literal("document"),
            Type.Literal("video"),
          ],
          { description: "Media type. Auto-detected from file extension if omitted." },
        ),
      ),
    }),
    async execute(_toolCallId, params) {
      const { path, caption, type } = params as {
        path: string;
        caption?: string;
        type?: string;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const res = await fetch(`${gatewayUrl}/api/media/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            sessionKey: sessionKey || undefined,
            path,
            caption,
            type,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to send media: ${data.error || res.statusText}`,
              },
            ],
            details: { error: true, status: res.status },
          };
        }

        // Direct delivery succeeded — or fallback directive returned
        if (data.delivered === false) {
          // Channel doesn't support sendMedia, return directive for legacy parsing
          const directiveText = caption
            ? `${caption}\n${data.directive}`
            : String(data.directive);
          return {
            content: [{ type: "text" as const, text: directiveText }],
            details: { path: data.path, type: data.type, channel: data.channel, delivered: false },
          };
        }

        // Direct delivery success
        const summary = data.messageId
          ? `Media sent (${data.type}, messageId: ${data.messageId})`
          : `Media sent (${data.type})`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details: {
            ok: true,
            messageId: data.messageId,
            path: data.path,
            type: data.type,
            channel: data.channel,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `send_media error: ${message}` }],
          details: { error: true },
        };
      }
    },
  });

  // ========================================================================
  // send_message — text message delivery (v3.4 T1)
  // ========================================================================

  pi.registerTool({
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
    async execute(_toolCallId, params) {
      const { text, replyTo, parseMode } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const res = await fetch(`${gatewayUrl}/api/message/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            sessionKey: sessionKey || undefined,
            text,
            replyTo,
            parseMode,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to send message: ${data.error || res.statusText}`,
              },
            ],
            details: { error: true, status: res.status },
          };
        }

        const summary = replyTo
          ? `Message sent (reply to ${replyTo}, ${data.textLength} chars)`
          : `Message sent (${data.textLength} chars)`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details: {
            ok: true,
            channel: data.channel,
            textLength: data.textLength,
            replyTo: data.replyTo,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `send_message error: ${message}` }],
          details: { error: true },
        };
      }
    },
  });
}
