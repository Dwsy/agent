/** send_message tool — send text messages to the current chat via pi-gateway. */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

// Stream chunk size in characters
const STREAM_CHUNK_SIZE = 80;
// Delay between chunks in ms (simulates typing)
const STREAM_CHUNK_DELAY_MS = 80;
// Max length for Telegram draft mode
const MAX_DRAFT_TEXT_LENGTH = 4096;

export function createSendMessageTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "send_message",
    label: "Send Message",
    description:
      "Send a text message to the current chat via pi-gateway. " +
      "Optionally reply to a specific message by providing replyTo (message ID). " +
      "Use this when you need to send an additional message outside the normal response flow. " +
      "Set streamMode='draft' for Telegram draft-mode streaming (edit same message).",
    parameters: Type.Object({
      text: Type.String({ description: "Message text to send" }),
      replyTo: Type.Optional(
        Type.String({ description: "Message ID to reply to (creates a threaded reply)" }),
      ),
      parseMode: Type.Optional(
        Type.String({ description: "Parse mode: Markdown, HTML, or plain (default: channel default)" }),
      ),
      streamMode: Type.Optional(
        Type.String({ description: "Streaming mode: off | partial | block | draft (draft = edit same message)" }),
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
      const { text, replyTo, parseMode, streamMode, draftId } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
        streamMode?: "off" | "partial" | "block" | "draft";
        draftId?: number;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";
      const normalizedDraftId = typeof draftId === "number" && Number.isFinite(draftId) && draftId > 0
        ? Math.floor(draftId)
        : undefined;
      const wantsDraft = streamMode === "draft";
      const wantsPartial = streamMode === "partial";
      const wantsStreaming = streamMode === "draft" || streamMode === "partial";
      const draftSuppressedByLength = wantsDraft && text.length > MAX_DRAFT_TEXT_LENGTH;

      // Limit total display text to Telegram's 4096 char limit to avoid edit failures
      const maxDisplayLength = 4096;

      // Auto-streaming: enable for longer messages to show typing effect
      const shouldAutoStream = !wantsStreaming && text.length > STREAM_CHUNK_SIZE * 2;
      // Partial mode: show typing effect via message edits
      // For messages > 4096 chars, we'll create multiple messages as needed
      const effectivePartial = wantsPartial || shouldAutoStream;

      try {
        // Draft mode: use draft streaming (edit same message for each chunk)
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
                streamMode: "draft",
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

        // Partial mode or auto-streaming: send first message, then edit for each chunk (works in groups)
        // For messages > 4096 chars, we send multiple messages and continue editing the latest one
        if (effectivePartial) {
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

            currentText += chunks[i];
            const isLast = i === chunks.length - 1;
            let displayText = isLast ? currentText : `${currentText}…`;

            // Check if we need to start a new message (current display would exceed limit)
            const wouldExceedLimit = displayText.length > maxDisplayLength;

            if (i === 0 || wouldExceedLimit) {
              // Truncate to fit limit for intermediate chunks
              if (!isLast && displayText.length > maxDisplayLength) {
                displayText = displayText.slice(0, maxDisplayLength - 1) + "…";
              }
              
              // Send new message (first chunk or when exceeding limit)
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
                  streamMode: "off",
                }),
              });

              const data = await parseResponseJson(res);
              if (!res.ok) {
                return toolError(`Failed to send partial stream: ${data.error || res.statusText}`);
              }
              messageId = data.messageId;
              
              // Reset currentText for next message
              if (wouldExceedLimit && !isLast) {
                // Truncate current text to match what we sent
                // Next message will start fresh from this point
                currentText = chunks[i]!;
              }
            } else if (messageId) {
              // Edit existing message
              await fetch(`${gatewayUrl}/api/message/action`, {
                method: "POST",
                headers: gatewayHeaders(authToken ?? internalToken, true),
                body: JSON.stringify({
                  token: internalToken,
                  pid: process.pid,
                  sessionKey: sessionKey || undefined,
                  action: "edit",
                  messageId,
                  text: displayText,
                  parseMode,
                }),
              });
            }

            if (onPartialResult) {
              onPartialResult({
                content: [{ type: "text", text: displayText }],
                details: { sent: i + 1, total: totalChunks, messageId },
              });
            }

            if (!isLast) {
              await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));
            }
          }

          return toolOk(
            `Partial streamed message sent (${text.length} chars in ${totalChunks} chunks, messageId=${messageId})`,
          );
        }

        // Non-streaming: send in one go (text is short or streamMode=off)
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
            streamMode: "off",
            draftId: normalizedDraftId,
          }),
        });

        const data = await parseResponseJson(res);

        if (!res.ok) {
          return toolError(`Failed to send message: ${data.error || res.statusText}`);
        }

        const chunkInfo = typeof data.chunkCount === "number" ? `, ${data.chunkCount} chunks` : "";
        const draftInfo = draftSuppressedByLength ? "; draft stream disabled due to length limit" : "";
        const summary = replyTo
          ? `Message sent (reply to ${replyTo}, ${data.textLength} chars${chunkInfo}${draftInfo})`
          : `Message sent (${data.textLength} chars${chunkInfo}${draftInfo})`;

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
