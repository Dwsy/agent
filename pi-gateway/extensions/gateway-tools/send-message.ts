/** send_message tool — send text messages to the current chat via pi-gateway. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

// Stream chunk size in characters
const STREAM_CHUNK_SIZE = 80;
// Delay between chunks in ms (simulates typing)
const STREAM_CHUNK_DELAY_MS = 80;
// Keep stream edits below the smallest channel max length (Discord: 2000)
const MAX_STREAM_SAFE_LENGTH = 1800;

export function createSendMessageTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "send_message",
    label: "Send Message",
    description:
      "Send a text message to the current chat via pi-gateway. " +
      "Optionally reply to a specific message by providing replyTo (message ID). " +
      "Use this when you need to send an additional message outside the normal response flow. " +
      "Set stream=true for long messages to show typing animation.",
    parameters: Type.Object({
      text: Type.String({ description: "Message text to send" }),
      replyTo: Type.Optional(
        Type.String({ description: "Message ID to reply to (creates a threaded reply)" }),
      ),
      parseMode: Type.Optional(
        Type.String({ description: "Parse mode: Markdown, HTML, or plain (default: channel default)" }),
      ),
      stream: Type.Optional(
        Type.Boolean({ description: "Stream the message with typing animation (default: auto-detect based on length)" }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: unknown,
      signal: AbortSignal,
      onPartialResult?: (partial: { content: Array<{ type: "text"; text: string }>; details: { sent: number; total: number; messageId?: string } }) => void
    ) {
      const { text, replyTo, parseMode, stream } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
        stream?: boolean;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";
      const shouldStream = (stream ?? text.length > 200) && text.length <= MAX_STREAM_SAFE_LENGTH;
      const streamSuppressedByLength = text.length > MAX_STREAM_SAFE_LENGTH;

      try {
        // Non-streaming: send in one go
        if (!shouldStream || text.length <= STREAM_CHUNK_SIZE) {
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

          const chunkInfo = typeof data.chunkCount === "number" ? `, ${data.chunkCount} chunks` : "";
          const streamInfo = streamSuppressedByLength ? "; stream disabled due to channel length limits" : "";
          const summary = replyTo
            ? `Message sent (reply to ${replyTo}, ${data.textLength} chars${chunkInfo}${streamInfo})`
            : `Message sent (${data.textLength} chars${chunkInfo}${streamInfo})`;

          return toolOk(summary);
        }

        // Streaming: send first chunk, then edit
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
          chunks.push(text.slice(i, i + STREAM_CHUNK_SIZE));
        }

        // Send first chunk
        let currentText = chunks[0]!;
        const res = await fetch(`${gatewayUrl}/api/message/send`, {
          method: "POST",
          headers: gatewayHeaders(authToken ?? internalToken, true),
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            text: currentText + "…", // Add ellipsis to indicate more coming
            replyTo,
            parseMode,
            stream: true, // Mark as streaming message
          }),
        });

        const data = await parseResponseJson(res);
        if (!res.ok) {
          return toolError(`Failed to send message: ${data.error || res.statusText}`);
        }

        const messageId = data.messageId as string | undefined;
        const totalChunks = chunks.length;

        // Report first chunk
        if (onPartialResult) {
          onPartialResult({
            content: [{ type: "text", text: currentText }],
            details: { sent: 1, total: totalChunks, messageId },
          });
        }

        // Send remaining chunks via edit
        for (let i = 1; i < chunks.length; i++) {
          // Check abort signal
          if (signal?.aborted) {
            return toolError("Message sending aborted");
          }

          // Wait a bit to simulate typing
          await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));

          currentText += chunks[i];
          const isLast = i === chunks.length - 1;
          const displayText = isLast ? currentText : currentText + "…";

          // Edit message
          const editRes = await fetch(`${gatewayUrl}/api/message/edit`, {
            method: "POST",
            headers: gatewayHeaders(authToken ?? internalToken, true),
            body: JSON.stringify({
              token: internalToken,
              pid: process.pid,
              sessionKey: sessionKey || undefined,
              messageId,
              text: displayText,
              parseMode,
            }),
          });

          if (!editRes.ok) {
            // Edit failed, continue with final result
            console.warn(`[send_message] Edit failed at chunk ${i + 1}/${totalChunks}`);
          }

          // Report progress
          if (onPartialResult) {
            onPartialResult({
              content: [{ type: "text", text: displayText }],
              details: { sent: i + 1, total: totalChunks, messageId },
            });
          }
        }

        const summary = replyTo
          ? `Streamed message sent (reply to ${replyTo}, ${text.length} chars in ${totalChunks} chunks)`
          : `Streamed message sent (${text.length} chars in ${totalChunks} chunks)`;

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
