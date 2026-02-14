/**
 * Message dispatch pipeline — extracted from server.ts R3.
 *
 * Handles inbound message routing: dedup → mode resolution → interrupt/inject/enqueue.
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext, TelegramMessageMode, DispatchResult } from "./types.ts";
import type { InboundMessage, SessionKey, ImageContent, MessageSource } from "../core/types.ts";
import type { RpcClient } from "../core/rpc-client.ts";
import type { PrioritizedWork } from "../core/message-queue.ts";
import { processMessage } from "./message-pipeline.ts";
import { resolveDeliveryTarget } from "../core/channel-resolver.ts";

// ============================================================================
// Telegram Helpers
// ============================================================================

export function normalizeTelegramMessageMode(value: unknown): TelegramMessageMode | null {
  return value === "steer" || value === "follow-up" || value === "interrupt"
    ? value
    : null;
}

export function extractTelegramAccountId(sessionKey: SessionKey, sourceAccountId?: string): string {
  if (sourceAccountId?.trim()) return sourceAccountId.trim();
  const matched = sessionKey.match(/^agent:[^:]+:telegram:account:([^:]+):/);
  return matched?.[1] ?? "default";
}

export function resolveTelegramMsgMode(
  sessionKey: SessionKey,
  ctx: GatewayContext,
  sourceAccountId?: string,
): TelegramMessageMode {
  const override = ctx.sessionMessageModeOverrides.get(sessionKey);
  if (override) return override;

  const tg = ctx.config.channels.telegram;
  const accountId = extractTelegramAccountId(sessionKey, sourceAccountId);
  const accountMode = normalizeTelegramMessageMode(tg?.accounts?.[accountId]?.messageMode);
  const channelMode = normalizeTelegramMessageMode(tg?.messageMode);
  return accountMode ?? channelMode ?? "steer";
}

/**
 * Resolve message handling mode for any channel.
 */
export function resolveMessageMode(
  sessionKey: SessionKey,
  source: MessageSource,
  ctx: GatewayContext,
): TelegramMessageMode {
  const override = ctx.sessionMessageModeOverrides.get(sessionKey);
  if (override) return override;

  if (source.channel === "telegram") {
    return resolveTelegramMsgMode(sessionKey, ctx, source.accountId);
  }

  return ctx.config.agent.messageMode ?? "steer";
}

/**
 * Compute numeric priority for an inbound message.
 */
export function computePriority(msg: InboundMessage, ctx: GatewayContext): number {
  const pc = ctx.config.queue.priority;
  let p = msg.source.chatType === "dm" ? pc.dm : pc.group;
  const channelCfg = ctx.config.channels[msg.source.channel] as Record<string, unknown> | undefined;
  const allowFrom = channelCfg?.allowFrom as Array<string | number> | undefined;
  if (allowFrom?.some(id => String(id) === msg.source.senderId)) p += pc.allowlistBonus;
  return p;
}

// ============================================================================
// Heartbeat Alert Delivery
// ============================================================================

export async function deliverHeartbeatAlert(
  agentId: string,
  alertText: string,
  ctx: GatewayContext,
): Promise<void> {
  const target = resolveDeliveryTarget(agentId, ctx.sessions, ctx.config.agents?.bindings);
  if (!target) {
    ctx.log.warn(`No delivery target for agent ${agentId} heartbeat alert (no binding, no recent session)`);
    return;
  }

  const channel = ctx.registry.channels.get(target.channel);
  if (!channel) {
    ctx.log.warn(`Channel ${target.channel} not available for heartbeat alert delivery`);
    return;
  }

  try {
    await channel.outbound.sendText(
      target.chatId,
      `🔔 **Heartbeat Alert** (${agentId}):\n${alertText.slice(0, 1000)}`,
      { parseMode: "Markdown" },
    );
    ctx.log.info(`Heartbeat alert delivered to ${target.channel}:${target.chatId}`);
  } catch (err: unknown) {
    ctx.log.error(`Failed to deliver heartbeat alert: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// Dispatch Pipeline
// ============================================================================

/**
 * Dispatch an inbound message to the agent pipeline.
 * Called by channel plugins and WebChat.
 */
export async function dispatchMessage(msg: InboundMessage, ctx: GatewayContext): Promise<DispatchResult> {
  // Layer 0: Deduplication
  if (ctx.config.queue.dedup.enabled && ctx.dedup.isDuplicate(msg)) {
    ctx.log.debug(`Dedup: skipping duplicate message from ${msg.source.senderId} on ${msg.source.channel}`);
    return {};
  }

  await ctx.registry.hooks.dispatch("message_received", { message: msg });

  const { sessionKey, source } = msg;
  const session = ctx.sessions.get(sessionKey);
  const rpc = ctx.pool.getForSession(sessionKey);

  if (session?.isStreaming && rpc) {
    const mode = resolveMessageMode(sessionKey, source, ctx);

    if (mode === "interrupt") {
      await handleInterruptMode(sessionKey, rpc, msg, ctx);
      return {};
    } else {
      const handled = await handleInjectionMode(sessionKey, rpc, msg, mode, ctx);
      if (handled) return { injected: true };
    }
  }

  await enqueueMessage(msg, ctx);
  return { enqueued: true };
}

async function handleInterruptMode(
  sessionKey: SessionKey,
  rpc: RpcClient,
  msg: InboundMessage,
  ctx: GatewayContext,
): Promise<void> {
  ctx.log.info(`[INTERRUPT] ${sessionKey}: Starting interrupt sequence`);

  const bufferCleared = ctx.queue.clearCollectBuffer(sessionKey);
  if (bufferCleared > 0) {
    ctx.log.info(`[INTERRUPT] ${sessionKey}: Cleared ${bufferCleared} items from collect buffer`);
  }

  try {
    await rpc.abort();
    ctx.log.info(`[INTERRUPT] ${sessionKey}: RPC abort sent`);
  } catch (err: unknown) {
    ctx.log.warn(`[INTERRUPT] ${sessionKey}: Failed to abort RPC: ${err instanceof Error ? err.message : String(err)}`);
  }

  const session = ctx.sessions.get(sessionKey);
  if (session) {
    session.isStreaming = false;
  }

  ctx.transcripts.logMeta(sessionKey, "interrupt", {
    textLen: msg.text.length,
    hasImages: (msg.images?.length ?? 0) > 0,
    bufferCleared,
  });

  ctx.log.info(`[INTERRUPT] ${sessionKey}: Re-dispatching message after interrupt`);
  await enqueueMessage(msg, ctx);
}

async function handleInjectionMode(
  sessionKey: SessionKey,
  rpc: RpcClient,
  msg: InboundMessage,
  mode: "steer" | "follow-up",
  ctx: GatewayContext,
): Promise<boolean> {
  const rpcMode = mode === "follow-up" ? "followUp" : "steer";

  ctx.transcripts.logMeta(sessionKey, "inbound_injected", {
    mode,
    textLen: msg.text.length,
    hasImages: (msg.images?.length ?? 0) > 0,
  });

  try {
    if (rpcMode === "steer") {
      ctx.activeInboundMessages.get(sessionKey)?.onSteerInjected?.();
    }
    await rpc.prompt(msg.text, msg.images, rpcMode);
    ctx.log.info(`[INJECT] ${sessionKey}: Message injected with mode=${mode}`);
    return true;
  } catch (err: unknown) {
    ctx.log.warn(`[INJECT] ${sessionKey}: Failed to inject: ${err instanceof Error ? err.message : String(err)}. Falling back to enqueue.`);
    return false;
  }
}

async function enqueueMessage(msg: InboundMessage, ctx: GatewayContext): Promise<void> {
  const { sessionKey } = msg;
  const item: PrioritizedWork = {
    work: async () => { await processMessage(msg, ctx, item); },
    priority: computePriority(msg, ctx),
    enqueuedAt: Date.now(),
    ttl: 0,
    source: msg.source,
    text: msg.text,
    summaryLine: msg.text.slice(0, 140) || undefined,
    images: msg.images,
    onBeforeCollectWork: async (batch) => {
      const firstMsg = batch[0] as PrioritizedWork & { _msg?: InboundMessage };
      if (firstMsg._msg?.setTyping) {
        await firstMsg._msg.setTyping(true);
      }
      const allImages: ImageContent[] = [];
      for (const b of batch) {
        if (b.images?.length) allImages.push(...b.images);
      }
      if (allImages.length > 0) {
        msg.images = allImages;
      }
    },
  };
  (item as PrioritizedWork & { _msg?: InboundMessage })._msg = msg;
  const enqueued = ctx.queue.enqueue(sessionKey, item);

  if (!enqueued) {
    await msg.respond("Too many messages queued. Please wait.");
  }
}
