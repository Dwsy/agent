/**
 * Message Pipeline — core message processing logic extracted from server.ts (R1)
 *
 * Handles the full lifecycle of an inbound message:
 * 1. Transcript logging
 * 2. TUI command guard
 * 3. Session creation/update
 * 4. RPC acquisition + Extension UI wiring
 * 5. Slash command interception
 * 6. RPC event streaming (text/thinking/tool deltas)
 * 7. Timeout protection
 * 8. Hook dispatch (before_agent_start, agent_end, message_sending, message_sent)
 * 9. Response delivery
 */

import type { InboundMessage, SessionKey } from "../core/types.ts";
import type { GatewayContext } from "./types.ts";
import type { PrioritizedWork } from "../core/message-queue.ts";
import { resolveRoleForSession } from "../core/session-router.ts";
import { isTuiCommand, tryHandleCommand } from "./command-handler.ts";
import { getAssistantMessageEvent, getAmePartial } from "../core/rpc-events.ts";
import { isTransient, classifyError } from "../core/model-health.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Format relative time in Chinese (e.g., "2分钟前", "1小时前") */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 0) return "刚刚"; // Future message (clock skew)
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}周前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}个月前`;
  return `${Math.floor(diff / 31536000)}年前`;
}

/** Coerce unknown values to string safely */
function normalizeOutgoingText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// ============================================================================
// Main Pipeline
// ============================================================================

export async function processMessage(
  msg: InboundMessage,
  ctx: GatewayContext,
  queueItem?: PrioritizedWork,
): Promise<void> {
  const effectiveText = queueItem?.collectMergedText ?? msg.text;
  const { sessionKey, images, respond, setTyping, source } = msg;
  const text = effectiveText;
  const startTime = Date.now();

  // Transcript: log inbound prompt
  ctx.transcripts.logPrompt(sessionKey, text, images?.length ?? 0);
  ctx.transcripts.logMeta(sessionKey, "process_start", {
    source: { channel: source.channel, chatType: source.chatType, chatId: source.chatId },
  });

  // Guard: intercept pi extension commands that use TUI (would hang in RPC mode)
  if (isTuiCommand(text)) {
    const reply = `Command "${text.trim()}" requires interactive TUI and is not available in gateway mode. Use the pi CLI directly for this command.`;
    ctx.transcripts.logResponse(sessionKey, reply, Date.now() - startTime);
    await respond(reply);
    return;
  }

  // Hook: session_start (if new session)
  const isNew = !ctx.sessions.has(sessionKey);
  const session = ctx.sessions.getOrCreate(sessionKey, {
    role: resolveRoleForSession(source, ctx.config),
    isStreaming: false,
    lastActivity: Date.now(),
    messageCount: 0,
    rpcProcessId: null,
    lastChatId: source.chatId,
    lastChannel: source.channel,
    lastAccountId: source.accountId,
    lastChatType: source.chatType,
    lastSenderId: source.senderId,
    lastSenderName: source.senderName,
    lastTopicId: source.topicId,
    lastThreadId: source.threadId,
  });
  if (isNew) {
    ctx.transcripts.logMeta(sessionKey, "session_created", { role: session.role });
    await ctx.registry.hooks.dispatch("session_start", { sessionKey });
  }
  session.lastActivity = Date.now();
  session.messageCount++;
  if (source.chatId) session.lastChatId = source.chatId;
  if (source.channel) session.lastChannel = source.channel;
  if (source.accountId) session.lastAccountId = source.accountId;
  if (source.chatType) session.lastChatType = source.chatType;
  if (source.senderId) session.lastSenderId = source.senderId;
  if (source.senderName) session.lastSenderName = source.senderName;
  if (source.topicId) session.lastTopicId = source.topicId;
  if (source.threadId) session.lastThreadId = source.threadId;

  // Resolve role → capability profile for RPC process
  const role = session.role ?? "default";
  const profile = ctx.buildSessionProfile(sessionKey, role);

  // Wait for any ongoing compaction to prevent race conditions
  if (session.isCompacting) {
    ctx.log.info(`[processMessage] Waiting for compaction to complete for ${sessionKey}`);
    let waitCycles = 0;
    const maxWaitCycles = 30; // 30 * 500ms = 15s max wait
    while (session.isCompacting && waitCycles < maxWaitCycles) {
      await new Promise((r) => setTimeout(r, 500));
      waitCycles++;
    }
    if (session.isCompacting) {
      ctx.log.warn(`[processMessage] Compaction timeout for ${sessionKey}, proceeding anyway`);
    }
  }

  // Acquire RPC process
  let rpc;
  try {
    rpc = await ctx.pool.acquire(sessionKey, profile);
  } catch (err: unknown) {
    const errMsg = `Failed to acquire RPC process: ${err instanceof Error ? err.message : String(err)}`;
    ctx.log.error(errMsg);
    ctx.transcripts.logError(sessionKey, errMsg);
    await respond(`Error: ${errMsg}`);
    return;
  }
  session.rpcProcessId = rpc.id;
  session.isStreaming = true;
  ctx.activeInboundMessages.set(sessionKey, msg);

  // Wire Extension UI forwarding to WebChat clients
  rpc.extensionUIHandler = (data, writeToRpc) =>
    ctx.extensionUI.forward(data, ctx.wsClients, writeToRpc);
  ctx.transcripts.logMeta(sessionKey, "rpc_acquired", {
    rpcId: rpc.id,
    cwd: profile.cwd,
    role: profile.role,
    signature: profile.signature.slice(0, 12),
    capabilities: profile.resourceCounts,
  });

  // Typing indicator
  await setTyping(true);

  // Plugin slash commands bypass LLM
  if (await tryHandleCommand(msg, ctx, startTime, rpc)) {
    return;
  }

  // Collect response
  let fullText = "";
  let thinkingText = "";
  let toolLabels: string[] = [];
  let agentEndMessages: unknown[] = [];
  let agentEndStopReason = "stop";
  let eventCount = 0;

  // Retry state tracking (for UX and timeout management)
  let retryState: { attempt: number; maxAttempts: number; delayMs: number } | null = null;
  let lastAssistantError: { message: string; model: string } | null = null;

  const unsub = rpc.onEvent((event) => {
    if (rpc.sessionKey !== sessionKey) return;
    eventCount++;

    ctx.transcripts.logEvent(sessionKey, event as Record<string, unknown>);

    const extractPartialText = (partial: unknown): { text?: string; thinking?: string } => {
      if (!partial || typeof partial !== 'object') return {};
      const record = partial as Record<string, unknown>;
      let content = record.content;
      if (!Array.isArray(content) && record.message && typeof record.message === 'object') {
        const message = record.message as Record<string, unknown>;
        if (Array.isArray(message.content)) {
          content = message.content;
        }
      }
      let text: string | undefined;
      let thinking: string | undefined;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          const p = part as Record<string, unknown>;
          const partType = typeof p.type === 'string' ? p.type : '';
          if (partType === 'text' && typeof p.text === 'string') text = p.text;
          if (partType === 'thinking' && typeof p.thinking === 'string') thinking = p.thinking;
        }
      } else {
        if (typeof record.text === 'string') text = record.text;
        if (typeof record.thinking === 'string') thinking = record.thinking;
      }
      return { text, thinking };
    };

    // Stream text and thinking deltas
    if (event.type === "message_update") {
      const ame = getAssistantMessageEvent(event);
      const partial = extractPartialText(getAmePartial(ame));

      switch (ame?.type) {
        case 'text_delta':
          if (ame.delta) {
            fullText += ame.delta;
            msg.onStreamDelta?.(fullText, ame.delta);
          } else if (partial.text) {
            fullText = partial.text;
            msg.onStreamDelta?.(fullText, partial.text);
          }
          break;
        case 'text_start':
          fullText = '';
          if (partial.text) {
            fullText = partial.text;
            msg.onStreamDelta?.(fullText, partial.text);
          }
          break;
        case 'text_end':
          if (ame.content) {
            const content = Array.isArray(ame.content)
              ? ame.content.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('')
              : String(ame.content);
            fullText = content;
            msg.onStreamDelta?.(fullText, content);
          } else if (partial.text) {
            fullText = partial.text;
            msg.onStreamDelta?.(fullText, partial.text);
          }
          break;
        case 'thinking_delta': {
          const thinkDelta = ame.delta || '';
          if (thinkDelta) {
            thinkingText += thinkDelta;
            msg.onThinkingDelta?.(thinkingText, thinkDelta);
          }
          break;
        }
        case 'thinking_start':
          thinkingText = '';
          break;
        case 'thinking_end':
          break;
        case 'start':
          if (partial.text) {
            fullText = partial.text;
            msg.onStreamDelta?.(fullText, partial.text);
          }
          break;
        // default: silently ignore unhandled ame.type
      }
    }

    // Tool execution labels
    if (event.type === "tool_execution_start") {
      const { toolName, args, toolCallId } = event;
      if (toolName && !String(toolName).includes("unhandled")) {
        ctx.log.info(`[RPC] tool: ${toolName}`);
      }
      const label = String((args as Record<string, unknown>)?.label || toolName);
      if (label) toolLabels.push(label);
      msg.onToolStart?.(toolName, args, toolCallId);
    }

    if (event.type === "agent_end") {
      agentEndMessages = event.messages ?? [];
    }

    if (event.type === "message_end") {
      const msg_ = event.message;
      if (msg_?.role === "assistant" && "stopReason" in msg_) {
        agentEndStopReason = (msg_ as { stopReason: string }).stopReason;

        // Track assistant errors for failover (auto_retry intermediate failures)
        if (agentEndStopReason === "error" && ctx.modelHealth) {
          const assistantMsg = msg_ as { stopReason: string; errorMessage?: string; api?: string; model?: string };
          const errorMsg = assistantMsg.errorMessage || "Unknown error";
          const modelName = assistantMsg.model || ctx.config.agent?.model || "default";

          lastAssistantError = { message: errorMsg, model: modelName };

          const category = ctx.modelHealth.recordFailure(modelName, errorMsg);
          ctx.log.warn(`[model-health] ${modelName} error in turn: ${category} - ${errorMsg.slice(0, 100)}`);

          // If this is the final failure (auto_retry exhausted or non-retryable), trigger failover
          if (!isTransient(category) || (retryState && retryState.attempt >= retryState.maxAttempts)) {
            const fc = ctx.config.agent?.modelFailover;
            const primary = fc?.primary ?? modelName;
            const fallbacks = fc?.fallbacks ?? [];
            if (fallbacks.length > 0) {
              const next = ctx.modelHealth.selectModel(primary, fallbacks);
              if (next && next !== modelName) {
                ctx.log.warn(`[model-health] Will switch from ${modelName} to ${next} for next request`);
              }
            }
          }
        }
      }
    }

    // Track auto-retry state for UX and timeout management
    if (event.type === "auto_retry_start") {
      retryState = {
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
      };
      ctx.log.info(`[auto-retry] Attempt ${event.attempt}/${event.maxAttempts} after ${event.delayMs}ms: ${event.errorMessage.slice(0, 100)}`);
      // Notify user via typing indicator that we're retrying
      setTyping(true).catch(() => {});
    }

    if (event.type === "auto_retry_end") {
      retryState = null;
      if (event.success) {
        ctx.log.info(`[auto-retry] Success after ${event.attempt} attempt(s)`);
      } else {
        ctx.log.warn(`[auto-retry] Failed after ${event.attempt} attempt(s): ${event.finalError?.slice(0, 100)}`);
      }
    }

    // Track auto-compaction state to prevent race conditions
    if (event.type === "auto_compaction_start") {
      session.isCompacting = true;
      ctx.log.info(`[auto-compaction] Started for ${sessionKey} (reason: ${event.reason})`);
    }

    if (event.type === "auto_compaction_end") {
      session.isCompacting = false;
      ctx.log.info(`[auto-compaction] Completed for ${sessionKey} (aborted: ${event.aborted})`);
    }

    // Broadcast to WebSocket clients
    ctx.broadcastToWs("agent", { sessionKey, ...event });
  });

  // Timeout protection
  const timeoutMs = ctx.config.agent.timeoutMs ?? 120_000;
  let abortAttempted = false;
  const abortTimer = setTimeout(() => {
    ctx.log.warn(`Agent timeout for ${sessionKey} (${timeoutMs}ms), aborting`);
    ctx.transcripts.logError(sessionKey, `Agent timeout after ${timeoutMs}ms`, { eventCount, textLen: fullText.length });
    ctx.metrics?.incRpcTimeout();
    abortAttempted = true;
    rpc.abort().catch(() => {});
    setTimeout(() => {
      if (session.isStreaming) {
        ctx.log.warn(`Force-killing hung RPC process ${rpc.id} for ${sessionKey}`);
        ctx.transcripts.logError(sessionKey, `Force-killing hung RPC process ${rpc.id}`);
        rpc.stop().catch(() => {});
        ctx.pool.release(sessionKey);
      }
    }, 5000);
  }, timeoutMs);

  try {
    // Hook: before_agent_start
    const beforeAgentPayload = { sessionKey, message: text };
    await ctx.registry.hooks.dispatch("before_agent_start", beforeAgentPayload);
    let promptText = normalizeOutgoingText(beforeAgentPayload.message, text);

    // Group chat context injection: prepend sender/chat metadata so the agent
    // knows who is speaking and can decide whether to respond.
    // Inject message context so the agent knows messageId (for pin/react/reply)
    // and group metadata (for group chat awareness).
    if (source.chatType !== "dm") {
      const sender = source.senderName || source.senderId;
      const parts = [`[group:${source.chatId}`, `from:${sender}`];
      if (source.threadId) parts.push(`thread:${source.threadId}`);
      if (source.messageId) parts.push(`msgId:${source.messageId}`);
      if (source.timestamp) {
        const date = new Date(source.timestamp * 1000);
        const timeStr = date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const relativeTime = formatRelativeTime(source.timestamp);
        parts.push(`time:${timeStr}`, `${relativeTime}`);
      }
      promptText = `${parts.join(" | ")}]\n${promptText}`;
    } else if (source.messageId || source.timestamp) {
      const parts: string[] = [];
      if (source.messageId) parts.push(`msgId:${source.messageId}`);
      if (source.timestamp) {
        const date = new Date(source.timestamp * 1000);
        const timeStr = date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const relativeTime = formatRelativeTime(source.timestamp);
        parts.push(`time:${timeStr}`, `${relativeTime}`);
      }
      promptText = `[${parts.join(" | ")}]\n${promptText}`;
    }

    ctx.log.info(`[processMessage] Sending prompt to ${rpc.id} for ${sessionKey}: "${promptText.slice(0, 80)}"`);
    await rpc.prompt(promptText, images);
    await rpc.waitForIdle(timeoutMs);

    await ctx.registry.hooks.dispatch("agent_end", {
      sessionKey,
      messages: agentEndMessages,
      stopReason: agentEndStopReason,
    });

    // Model health: record success
    if (ctx.modelHealth) {
      const currentModel = ctx.config.agent?.model ?? "default";
      ctx.modelHealth.recordSuccess(currentModel);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    fullText = typeof fullText === 'string' && fullText.trim() ? fullText : `Error: ${errMsg}`;
    ctx.log.error(`Agent error for ${sessionKey}: ${errMsg}`);
    ctx.transcripts.logError(sessionKey, errMsg, { eventCount, abortAttempted, textLen: fullText.length });

    // Model health: record failure and execute failover if transient
    if (ctx.modelHealth) {
      const currentModel = ctx.config.agent?.model ?? "default";
      const category = ctx.modelHealth.recordFailure(currentModel, errMsg);
      if (isTransient(category)) {
        const fc = ctx.config.agent?.modelFailover;
        const primary = fc?.primary ?? currentModel;
        const fallbacks = fc?.fallbacks ?? [];
        if (fallbacks.length > 0) {
          const next = ctx.modelHealth.selectModel(primary, fallbacks);
          ctx.log.warn(`[model-health] ${currentModel} failed (${category}), switching to: ${next}`);

          // Execute failover: actually switch the model in the RPC process
          if (next && next !== currentModel) {
            const parts = next.split("/");
            if (parts.length === 2) {
              const [provider, modelId] = parts;
              rpc.setModel(provider, modelId)
                .then(() => ctx.log.info(`[model-health] Switched to ${next}`))
                .catch((e) => ctx.log.error(`[model-health] Failed to switch to ${next}:`, e));
            } else {
              ctx.log.warn(`[model-health] Cannot switch to ${next}: expected "provider/model" format`);
            }
          }
        }
      } else {
        ctx.log.warn(`[model-health] ${currentModel} failed (${category}), non-transient error`);
      }
    }
  } finally {
    clearTimeout(abortTimer);
    unsub();
    session.isStreaming = false;
    ctx.activeInboundMessages.delete(sessionKey);
    await setTyping(false);
  }

  // Hook: message_sending
  if (!fullText.trim()) {
    ctx.log.warn(`Empty assistant response for ${sessionKey}; sending fallback text.`);
    fullText = "我这次没有生成可发送的文本，请再发一次或换个问法。";
  }

  const outbound = { channel: source.channel, target: source.chatId, text: fullText };
  await ctx.registry.hooks.dispatch("message_sending", { message: outbound });
  outbound.text = normalizeOutgoingText(outbound.text, fullText);

  const durationMs = Date.now() - startTime;
  ctx.transcripts.logResponse(sessionKey, outbound.text, durationMs);
  ctx.transcripts.logMeta(sessionKey, "process_end", {
    durationMs,
    eventCount,
    textLength: outbound.text.length,
    toolCount: toolLabels.length,
    tools: toolLabels,
    abortAttempted,
  });

  ctx.metrics?.incMessageProcessed();
  ctx.metrics?.recordLatency(durationMs);

  try {
    // Group chat silent mode: if agent responds with [NO_REPLY], skip delivery.
    const SILENT_TOKEN = "[NO_REPLY]";
    if (source.chatType !== "dm" && outbound.text.includes(SILENT_TOKEN)) {
      ctx.log.info(`[processMessage] SILENT: agent declined to reply in group ${sessionKey}`);
      ctx.transcripts.logMeta(sessionKey, "silent_no_reply", { durationMs });
    } else {
      ctx.log.info(`[processMessage] Calling respond for ${sessionKey}, text=${outbound.text.length} chars`);
      await respond(outbound.text);
      ctx.log.info(`[processMessage] respond completed for ${sessionKey}`);
    }
  } catch (err: unknown) {
    ctx.log.error(`[processMessage] respond FAILED for ${sessionKey}: ${err instanceof Error ? err.message : String(err)}`);
  }
  await ctx.registry.hooks.dispatch("message_sent", { message: outbound });
}
