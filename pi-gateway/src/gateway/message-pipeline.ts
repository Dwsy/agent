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

// ============================================================================
// Helpers
// ============================================================================

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
  });
  if (isNew) {
    ctx.transcripts.logMeta(sessionKey, "session_created", { role: session.role });
    await ctx.registry.hooks.dispatch("session_start", { sessionKey });
  }
  session.lastActivity = Date.now();
  session.messageCount++;
  if (source.chatId) session.lastChatId = source.chatId;
  if (source.channel) session.lastChannel = source.channel;

  // Resolve role → capability profile for RPC process
  const role = session.role ?? "default";
  const profile = ctx.buildSessionProfile(sessionKey, role);

  // Acquire RPC process
  let rpc;
  try {
    rpc = await ctx.pool.acquire(sessionKey, profile);
  } catch (err: any) {
    const errMsg = `Failed to acquire RPC process: ${err?.message ?? String(err)}`;
    ctx.log.error(errMsg);
    ctx.transcripts.logError(sessionKey, errMsg);
    await respond(`Error: ${errMsg}`);
    return;
  }
  session.rpcProcessId = rpc.id;
  session.isStreaming = true;

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

  const unsub = rpc.onEvent((event) => {
    if (rpc.sessionKey !== sessionKey) return;
    eventCount++;

    ctx.log.debug(`[RPC-EVENT] ${sessionKey} type=${(event as any).type} eventCount=${eventCount}`);
    ctx.log.debug(`[RPC-EVENT] ${sessionKey} full event: ${JSON.stringify(event).slice(0, 1000)}`);
    ctx.transcripts.logEvent(sessionKey, event as Record<string, unknown>);

    const extractPartialText = (partial: unknown): { text?: string; thinking?: string } => {
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText input: ${JSON.stringify(partial).slice(0, 500)}`);
      if (!partial || typeof partial !== 'object') {
        ctx.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText: no partial or not object`);
        return {};
      }
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
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} extractPartialText result: text=${text?.length ?? 0} chars, thinking=${thinking?.length ?? 0} chars`);
      return { text, thinking };
    };

    // Stream text and thinking deltas
    if (event.type === "message_update") {
      const ame = (event as any).assistantMessageEvent ?? (event as any).assistant_message_event;
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} message_update ame.type=${ame?.type} ame.delta=${ame?.delta?.length ?? 0} chars`);
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} ame.full: ${JSON.stringify(ame).slice(0, 800)}`);

      const partial = extractPartialText(ame?.partial);
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} partial extracted: text=${partial.text?.length ?? 0} chars, thinking=${partial.thinking?.length ?? 0} chars`);

      const beforeFullText = fullText;
      switch (ame?.type) {
        case 'text_delta':
          if (ame.delta) {
            fullText += ame.delta;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_delta: added ${ame.delta.length} chars, total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, ame.delta);
          } else if (partial.text) {
            fullText = partial.text;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_delta (from partial): total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, partial.text);
          } else {
            ctx.log.warn(`[RPC-EVENT] ${sessionKey} text_delta: no delta and no partial.text`);
          }
          break;
        case 'text_start':
          fullText = '';
          if (partial.text) {
            fullText = partial.text;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_start: total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, partial.text);
          } else {
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_start: empty`);
          }
          break;
        case 'text_end':
          if (ame.content) {
            const content = Array.isArray(ame.content)
              ? ame.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
              : String(ame.content);
            fullText = content;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_end: total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, content);
          } else if (partial.text) {
            fullText = partial.text;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} text_end (from partial): total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, partial.text);
          } else {
            ctx.log.warn(`[RPC-EVENT] ${sessionKey} text_end: no content and no partial.text`);
          }
          break;
        case 'thinking_delta': {
          const thinkDelta = ame.delta || ame.thinking || '';
          if (thinkDelta) {
            thinkingText += thinkDelta;
            msg.onThinkingDelta?.(thinkingText, thinkDelta);
          }
          ctx.log.debug(`[RPC-EVENT] ${sessionKey} thinking_delta: ${thinkDelta.length} chars`);
          break;
        }
        case 'thinking_start':
          thinkingText = '';
          ctx.log.debug(`[RPC-EVENT] ${sessionKey} thinking_start`);
          break;
        case 'thinking_end':
          ctx.log.debug(`[RPC-EVENT] ${sessionKey} thinking_end (${thinkingText.length} chars total)`);
          break;
        case 'start':
          if (partial.text) {
            fullText = partial.text;
            ctx.log.debug(`[RPC-EVENT] ${sessionKey} start (text): total=${fullText.length}`);
            msg.onStreamDelta?.(fullText, partial.text);
          }
          break;
        default:
          ctx.log.warn(`[RPC-EVENT] ${sessionKey} unhandled ame.type: ${ame?.type}`);
      }
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} fullText changed: ${beforeFullText.length} -> ${fullText.length} chars`);
    }

    // Tool execution labels
    if (event.type === "tool_execution_start") {
      const eventAny = event as any;
      ctx.log.info(`[RPC-EVENT] ${sessionKey} tool_execution_start: ${eventAny.toolName}`);
      const label = (eventAny.args as any)?.label || eventAny.toolName;
      if (label) toolLabels.push(label);
      msg.onToolStart?.(eventAny.toolName, eventAny.args, eventAny.toolCallId);
    }

    if (event.type === "agent_end") {
      ctx.log.info(`[RPC-EVENT] ${sessionKey} agent_end`);
      agentEndMessages = (event as any).messages ?? [];
    }

    if (event.type === "message_end") {
      const msgEnd = event as any;
      ctx.log.debug(`[RPC-EVENT] ${sessionKey} message_end: role=${msgEnd.message?.role}, stopReason=${msgEnd.message?.stopReason}`);
      if (msgEnd.message?.role === "assistant" && msgEnd.message?.stopReason) {
        agentEndStopReason = msgEnd.message.stopReason;
      }
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
    const promptText = normalizeOutgoingText(beforeAgentPayload.message, text);

    ctx.log.info(`[processMessage] Sending prompt to ${rpc.id} for ${sessionKey}: "${promptText.slice(0, 80)}"`);
    await rpc.prompt(promptText, images);
    await rpc.waitForIdle(timeoutMs);

    await ctx.registry.hooks.dispatch("agent_end", {
      sessionKey,
      messages: agentEndMessages,
      stopReason: agentEndStopReason,
    });
  } catch (err: any) {
    const errMsg = err?.message ?? "Unknown error";
    fullText = typeof fullText === 'string' && fullText.trim() ? fullText : `Error: ${errMsg}`;
    ctx.log.error(`Agent error for ${sessionKey}: ${errMsg}`);
    ctx.transcripts.logError(sessionKey, errMsg, { eventCount, abortAttempted, textLen: fullText.length });
  } finally {
    clearTimeout(abortTimer);
    unsub();
    session.isStreaming = false;
    await setTyping(false);
  }

  ctx.log.info(`[RPC-EVENT] ${sessionKey} Final fullText: ${fullText.length} chars, eventCount=${eventCount}`);
  ctx.log.debug(`[RPC-EVENT] ${sessionKey} Final fullText content: ${fullText.slice(0, 500)}`);

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
    ctx.log.info(`[processMessage] Calling respond for ${sessionKey}, text=${outbound.text.length} chars`);
    await respond(outbound.text);
    ctx.log.info(`[processMessage] respond completed for ${sessionKey}`);
  } catch (err: any) {
    ctx.log.error(`[processMessage] respond FAILED for ${sessionKey}: ${err?.message ?? err}`);
  }
  await ctx.registry.hooks.dispatch("message_sent", { message: outbound });
}
