/** send_media tool — send files to the current chat via pi-gateway. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError } from "./helpers.ts";

export function createSendMediaTool(gatewayUrl: string, internalToken: string) {
  return {
    name: "send_media",
    label: "Send Media",
    description:
      "Send a file (image, audio, document, video) to the current chat via pi-gateway. " +
      "The file is delivered directly to the channel (Telegram/Discord/WebChat). " +
      "Path can be relative to workspace (e.g., ./output.png) or absolute temp paths (/tmp/, /var/folders/). " +
      "Type is auto-detected from extension if omitted. " +
      "Note: SVG files are NOT supported as images on Telegram — convert to PNG first. " +
      "Telegram image formats: jpg, jpeg, png, gif, webp, bmp.",
    parameters: Type.Object({
      path: Type.String({ description: "File path — relative (./output.png) or absolute temp path (/tmp/xxx.png)" }),
      caption: Type.Optional(
        Type.String({ description: "Optional caption text sent with the media" }),
      ),
      type: Type.Optional(
        Type.String({
          enum: ["photo", "audio", "document", "video"],
          description: "Media type. Auto-detected from file extension if omitted.",
        }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
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
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            path,
            caption,
            type,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return toolError(`Failed to send media: ${data.error || res.statusText}`);
        }

        if (data.delivered === false) {
          const directiveText = caption
            ? `${caption}\n${data.directive}`
            : String(data.directive);
          return {
            content: [{ type: "text" as const, text: directiveText }],
            details: { path: data.path, type: data.type, channel: data.channel, delivered: false },
          };
        }

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
  };
}
