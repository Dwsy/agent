/** send_message tool — send text messages to the current chat via pi-gateway. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

// Stream chunk size in characters
const STREAM_CHUNK_SIZE = 80;
// Delay between chunks in ms (simulates typing)
const STREAM_CHUNK_DELAY_MS = 80;
// Keep stream edits below the smallest channel max length (Discord: 2000)
const MAX_STREAM_SAFE_LENGTH = 1800;
const MAX_DRAFT_TEXT_LENGTH = 4096;

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
      streamMode: Type.Optional(
        Type.String({ description: "Streaming mode hint: off | partial | block | draft (Telegram supports draft mode)" }),
      ),
      draftId: Type.Optional(
        Type.Number({ description: "Optional draft stream identifier (used with streamMode=draft)" }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: unknown,
      signal: AbortSignal,
      onPartialResult?: (partial: { content: Array<{ type: "text"; text: string }>; details: { sent: number; total: number; messageId?: string } }) => void
    ) {
      const { text, replyTo, parseMode, stream, streamMode, draftId } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
        stream?: boolean;
        streamMode?: "off" | "partial" | "block" | "draft";
        draftId?: number;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";
      const normalizedDraftId = typeof draftId === "number" && Number.isFinite(draftId) && draftId > 0
        ? Math.floor(draftId)
        : undefined;
      const wantsDraft = streamMode === "draft";
      const shouldStream = !wantsDraft && (stream ?? text.length > 200) && text.length <= MAX_STREAM_SAFE_LENGTH;
      const streamSuppressedByLength = !wantsDraft && text.length > MAX_STREAM_SAFE_LENGTH;
      const draftSuppressedByLength = wantsDraft && text.length > MAX_DRAFT_TEXT_LENGTH;

      try {
        if (wantsDraft && !draftSuppressedByLength) {
          const draftStreamId = normalizedDraftId ?? Date.now();
          const chunks: string[] = [];
          for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
            chunks.push(text.slice(i, i + STREAM_CHUNK_SIZE));
          }

          let currentText = "";
          const totalChunks = chunks.length;

          for (let i = 0; i < chunks.length; i++) {
            if (signal?.aborted) {
              return toolError("Message sending aborted");
            }

            currentText += chunks[i];
            const isLast = i === chunks.length - 1;
            const displayText = isLast ? currentText : `${currentText}…`;

            const res = await fetch(`${gatewayUrl}/api/message/send`, {
              method: "POST",
              headers: gatewayHeaders(authToken ?? internalToken, true),
              body: JSON.stringify({
                token: internalToken,
                pid: process.pid,
                sessionKey: sessionKey || undefined,
                text: displayText,
                replyTo,
                parseMode,
                streamMode,
                draftId: draftStreamId,
              }),
            });

            const data = await parseResponseJson(res);
            if (!res.ok) {
              return toolError(`Failed to send draft stream: ${data.error || res.statusText}`);
            }

            if (onPartialResult) {
              onPartialResult({
                content: [{ type: "text", text: displayText }],
                details: { sent: i + 1, total: totalChunks, messageId: String(draftStreamId) },
              });
            }

            if (!isLast) {
              await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));
            }
          }

          return toolOk(
            `Draft streamed message sent (${text.length} chars in ${totalChunks} chunks, draftId=${draftStreamId})`,
          );
        }

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
              streamMode,
              draftId: wantsDraft ? (normalizedDraftId ?? Date.now()) : undefined,
            }),
          });

          const data = await parseResponseJson(res);

          if (!res.ok) {
            return toolError(`Failed to send message: ${data.error || res.statusText}`);
          }

          const chunkInfo = typeof data.chunkCount === "number" ? `, ${data.chunkCount} chunks` : "";
          const streamInfo = streamSuppressedByLength ? "; stream disabled due to channel length limits" : "";
          const draftInfo = draftSuppressedByLength ? "; draft stream disabled due to Telegram draft length limit" : "";
          const summary = replyTo
            ? `Message sent (reply to ${replyTo}, ${data.textLength} chars${chunkInfo}${streamInfo}${draftInfo})`
            : `Message sent (${data.textLength} chars${chunkInfo}${streamInfo}${draftInfo})`;

          return toolOk(summary);
        }

        // Streaming: prefer channel-native stream via repeated /api/message/send calls.
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
          chunks.push(text.slice(i, i + STREAM_CHUNK_SIZE));
        }

        let currentText = "";
        let messageId: string | undefined;
        const totalChunks = chunks.length;

        for (let i = 0; i < chunks.length; i++) {
          if (signal?.aborted) {
            return toolError("Message sending aborted");
          }

          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));
          }

          currentText += chunks[i];
          const isLast = i === chunks.length - 1;
          const displayText = isLast ? currentText : currentText + "…";

          const sendRes = await fetch(`${gatewayUrl}/api/message/send`, {
            method: "POST",
            headers: gatewayHeaders(authToken ?? internalToken, true),
            body: JSON.stringify({
              token: internalToken,
              pid: process.pid,
              sessionKey: sessionKey || undefined,
              text: displayText,
              replyTo: i === 0 ? replyTo : undefined,
              parseMode,
              streamMode: streamMode ?? "partial",
              streamId: messageId,
              streamIndex: i,
              streamReset: i === 0,
              streamFinal: isLast,
              draftId: wantsDraft ? (normalizedDraftId ?? Date.now()) : undefined,
              stream: true,
            }),
          });

          const data = await parseResponseJson(sendRes);
          if (!sendRes.ok) {
            return toolError(`Failed to stream message: ${data.error || sendRes.statusText}`);
          }

          messageId = (data.lastMessageId as string | undefined) ?? (data.messageId as string | undefined) ?? messageId;

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
