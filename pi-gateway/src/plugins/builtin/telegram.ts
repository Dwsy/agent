/**
 * Telegram channel plugin — aligned with OpenClaw src/telegram/.
 *
 * Features (P0 complete):
 * - DM + group + forum topic support
 * - DM pairing / allowlist / open / disabled policies
 * - Group requireMention gating
 * - Per-group role binding (via config)
 * - Photo/document/voice media download -> base64
 * - Markdown -> Telegram HTML formatting
 * - sequentialize + apiThrottler middleware
 * - Inbound message debouncing (fast burst merge)
 * - Streaming reply via editMessageText
 * - Native slash commands registered to Telegram API
 * - Typing indicators
 * - Message chunking (4096 char limit)
 */

import { Bot } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import type { GatewayPluginApi, ChannelPlugin } from "../types.ts";
import { resolveSessionKey } from "../../core/session-router.ts";
import { isSenderAllowed, type DmPolicy } from "../../security/allowlist.ts";
import { createPairingRequest } from "../../security/pairing.ts";
import { splitMessage } from "../../core/utils.ts";
import type { MessageSource, ImageContent } from "../../core/types.ts";

let bot: Bot | null = null;
let gatewayApi: GatewayPluginApi | null = null;

// ============================================================================
// Markdown -> Telegram HTML
// ============================================================================

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert Markdown to Telegram-safe HTML. Handles bold, italic, code, code blocks, links. */
function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Code blocks: ```lang\n...\n``` -> <pre><code>...</code></pre>
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code: `...` -> <code>...</code>
  html = html.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Bold: **text** or __text__ -> <b>text</b>
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ -> <i>text</i> (careful not to match inside code)
  html = html.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<i>$1</i>");
  html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~ -> <s>text</s>
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Links: [text](url) -> <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}

function clipInline(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function codeInline(text: string, max = 160): string {
  return `\`${clipInline(text, max).replace(/`/g, "'")}\``;
}

function pickArgString(args: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!args) return null;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function formatToolStartLine(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case "read": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `read ${codeInline(path)}` : "read";
    }
    case "write": {
      const path = pickArgString(args, ["path", "filePath", "file", "outputPath"]);
      return path ? `write ${codeInline(path)}` : "write";
    }
    case "edit":
    case "multi_edit": {
      const path = pickArgString(args, ["path", "filePath", "file"]);
      return path ? `${toolName} ${codeInline(path)}` : toolName;
    }
    case "bash": {
      const command = pickArgString(args, ["command", "cmd"]);
      return command ? `bash ${codeInline(command, 180)}` : "bash";
    }
    default: {
      const payload = args ? clipInline(JSON.stringify(args), 120) : "";
      return payload ? `${toolName} ${codeInline(payload, 120)}` : toolName;
    }
  }
}

// ============================================================================
// Media Download
// ============================================================================

async function downloadTelegramFile(
  token: string,
  fileId: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    // Get file info
    const infoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!infoRes.ok) return null;
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) return null;

    // Download file
    const url = `https://api.telegram.org/file/bot${token}/${info.result.file_path}`;
    const fileRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!fileRes.ok) return null;

    const buffer = await fileRes.arrayBuffer();
    // Cap at 10MB
    if (buffer.byteLength > 10 * 1024 * 1024) return null;

    const data = Buffer.from(buffer).toString("base64");

    // Guess mime from extension
    const ext = info.result.file_path.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
      mp4: "video/mp4", pdf: "application/pdf",
    };
    const mimeType = mimeMap[ext] ?? "application/octet-stream";

    return { data, mimeType };
  } catch {
    return null;
  }
}

// ============================================================================
// Inbound Debouncer
// ============================================================================

interface DebouncedMessage {
  texts: string[];
  images: ImageContent[];
  ctx: any;
  source: MessageSource;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_DEBOUNCE_MS = 0;
const DEFAULT_EDIT_THROTTLE_MS = 250;
const DEFAULT_STREAM_START_CHARS = 1;
const DEFAULT_STREAM_PLACEHOLDER = "…";
const debounceMap = new Map<string, DebouncedMessage>();

function debounceInbound(
  chatId: string,
  text: string,
  images: ImageContent[],
  ctx: any,
  source: MessageSource,
  debounceMs: number,
  flush: (chatId: string, combined: DebouncedMessage) => void,
): void {
  // Keep OpenClaw-like behavior: when debounce is disabled, flush immediately.
  if (debounceMs <= 0) {
    const existing = debounceMap.get(chatId);
    if (existing) {
      clearTimeout(existing.timer);
      debounceMap.delete(chatId);
    }
    const entry: DebouncedMessage = {
      texts: text ? [text] : [],
      images: [...images],
      ctx,
      source,
      timer: setTimeout(() => {}, 0),
    };
    flush(chatId, entry);
    return;
  }

  const existing = debounceMap.get(chatId);

  if (existing) {
    // Merge into existing
    clearTimeout(existing.timer);
    if (text) existing.texts.push(text);
    existing.images.push(...images);
    existing.ctx = ctx; // Use latest ctx for reply
    existing.timer = setTimeout(() => {
      debounceMap.delete(chatId);
      flush(chatId, existing);
    }, debounceMs);
  } else {
    // New debounce window
    const entry: DebouncedMessage = {
      texts: text ? [text] : [],
      images: [...images],
      ctx,
      source,
      timer: setTimeout(() => {
        debounceMap.delete(chatId);
        flush(chatId, entry);
      }, debounceMs),
    };
    debounceMap.set(chatId, entry);
  }
}

function asNonNegativeInt(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

// ============================================================================
// Channel Plugin
// ============================================================================

const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: {
    label: "Telegram",
    blurb: "Telegram bot via grammy (aligned with OpenClaw)",
  },
  capabilities: {
    direct: true,
    group: true,
    thread: true,
    media: true,
  },
  outbound: {
    maxLength: 4096,
    async sendText(target: string, text: string) {
      if (!bot) return;
      const chunks = splitMessage(text, 4096);
      for (const chunk of chunks) {
        try {
          await bot.api.sendMessage(target, markdownToTelegramHtml(chunk), { parse_mode: "HTML" });
        } catch {
          // Fallback to plain text if HTML parse fails
          await bot.api.sendMessage(target, chunk);
        }
      }
    },
  },

  async init(api: GatewayPluginApi) {
    gatewayApi = api;
    const cfg = api.config.channels.telegram as any;
    if (!cfg?.enabled || !cfg?.botToken) {
      api.logger.info("Telegram: not configured, skipping");
      return;
    }

    const streamDebounceMs = asNonNegativeInt(cfg?.streaming?.debounceMs, DEFAULT_DEBOUNCE_MS);
    const streamEditThrottleMs = asNonNegativeInt(cfg?.streaming?.editThrottleMs, DEFAULT_EDIT_THROTTLE_MS);
    const streamStartChars = asNonNegativeInt(cfg?.streaming?.streamStartChars, DEFAULT_STREAM_START_CHARS);
    const streamPlaceholder = (typeof cfg?.streaming?.placeholder === "string" && cfg.streaming.placeholder.trim())
      ? cfg.streaming.placeholder.trim()
      : DEFAULT_STREAM_PLACEHOLDER;

    bot = new Bot(cfg.botToken);

    // --- Middleware: sequentialize (aligned with OpenClaw) ---
    bot.use(sequentialize((ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId) return undefined;
      // Forum topics get their own sequence
      const threadId = (ctx.message as any)?.message_thread_id;
      return threadId ? `${chatId}:${threadId}` : String(chatId);
    }));

    // --- Middleware: apiThrottler (aligned with OpenClaw) ---
    bot.api.config.use(apiThrottler());

    // Cache bot info to avoid repeated getMe calls
    let botUsername: string | null = null;
    const getBotUsername = async (): Promise<string> => {
      if (!botUsername) {
        const me = await bot!.api.getMe();
        botUsername = me.username ?? "";
      }
      return botUsername;
    };

    // --- Flush handler for debounced messages ---
    const flushDebounced = (chatId: string, debounced: DebouncedMessage) => {
      const combinedText = debounced.texts.join("\n\n");
      if (!combinedText && debounced.images.length === 0) return;

      const sessionKey = resolveSessionKey(debounced.source, api.config);

      // Stream reply: send initial "..." then edit
      handleAgentTurn(debounced.ctx, chatId, sessionKey, combinedText, debounced.images, debounced.source);
    };

    // --- Common message handler ---
    const handleMessage = async (ctx: any, text: string, images: ImageContent[]) => {
      const chatId = String(ctx.chat.id);
      const senderId = String(ctx.from?.id ?? "unknown");
      const senderName = ctx.from?.username ?? ctx.from?.first_name;
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      const topicId = ctx.message?.message_thread_id ? String(ctx.message.message_thread_id) : undefined;

      api.logger.info(
        `Telegram inbound: chat=${chatId} sender=${senderId} type=${isGroup ? "group" : "dm"} textLen=${text?.length ?? 0} images=${images.length}`,
      );

      // Group: check requireMention
      if (isGroup) {
        const username = await getBotUsername();
        const groupCfg = cfg.groups?.[chatId] ?? cfg.groups?.["*"];
        if (groupCfg?.requireMention !== false) {
          if (!text.includes(`@${username}`)) return;
        }
        // Strip mention
        text = text.replace(new RegExp(`@${username}`, "gi"), "").trim();
      }

      // DM: check access policy
      if (!isGroup) {
        const policy: DmPolicy = cfg.dmPolicy ?? "pairing";
        const allowed = isSenderAllowed("telegram", senderId, policy, cfg.allowFrom);
        if (!allowed) {
          api.logger.warn(`Telegram blocked by DM policy: sender=${senderId} policy=${policy}`);
          if (policy === "pairing") {
            const code = createPairingRequest("telegram", senderId, senderName);
            if (code) {
              await ctx.reply(`Pairing required. Send this code to the admin:\n\n<code>${code}</code>`, { parse_mode: "HTML" });
            } else {
              await ctx.reply("Too many pending pairing requests. Please try later.");
            }
          }
          return;
        }
      }

      const source: MessageSource = {
        channel: "telegram",
        chatType: isGroup ? "group" : "dm",
        chatId,
        topicId,
        senderId,
        senderName,
      };

      // Debounce: merge rapid-fire messages
      debounceInbound(chatId, text, images, ctx, source, streamDebounceMs, flushDebounced);
    };

    // --- Agent turn with streaming reply ---
    const handleAgentTurn = async (
      ctx: any,
      chatId: string,
      sessionKey: string,
      text: string,
      images: ImageContent[],
      source: MessageSource,
    ) => {
      const botClient = bot;
      if (!botClient) return;

      // Streaming state
      let replyMsgId: number | null = null;
      let creatingReplyMsg = false;
      let lastEditAt = 0;
      let editInFlight = false;
      let lastTypingAt = 0;
      const MAX_TOOL_LINES = 12;
      let latestAccumulated = "";
      const toolLines: string[] = [];
      const seenToolCalls = new Set<string>();
      const TYPING_MIN_INTERVAL_MS = 3000;

      const pingTyping = () => {
        const now = Date.now();
        if (now - lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
        lastTypingAt = now;
        botClient.api.sendChatAction(chatId, "typing").catch(() => {});
      };

      const ensureReplyMessage = (textForFirstMessage?: string) => {
        if (replyMsgId || creatingReplyMsg) return;
        creatingReplyMsg = true;
        const firstText = textForFirstMessage?.trim() ? textForFirstMessage : streamPlaceholder;
        botClient.api.sendMessage(chatId, firstText).then((sent) => {
          replyMsgId = sent.message_id;
          // Allow immediate first edit after message creation.
          lastEditAt = 0;
          creatingReplyMsg = false;
          if (latestAccumulated || toolLines.length > 0) {
            pushLiveUpdate();
          }
        }).catch(() => {
          creatingReplyMsg = false;
        });
      };

      const buildLiveText = (): string => {
        const toolPart = toolLines.join("\n");
        const textPart = latestAccumulated
          ? (latestAccumulated.length > 4000 ? `${latestAccumulated.slice(0, 4000)}\n...` : `${latestAccumulated} ...`)
          : "";
        if (toolPart && textPart) return `${toolPart}\n\n${textPart}`;
        return toolPart || textPart;
      };

      const pushLiveUpdate = () => {
        const renderedRaw = buildLiveText();
        const rendered = renderedRaw.length > 4000 ? `${renderedRaw.slice(0, 4000)}\n...` : renderedRaw;
        if (!rendered.trim()) return;
        const now = Date.now();

        // First live update: send initial message to get replyMsgId
        if (!replyMsgId) {
          ensureReplyMessage(rendered);
          return;
        }

        // Throttled edit: don't spam Telegram API
        if (editInFlight || now - lastEditAt < streamEditThrottleMs) return;
        editInFlight = true;
        botClient.api.editMessageText(chatId, replyMsgId, rendered).then(() => {
          lastEditAt = Date.now();
          editInFlight = false;
        }).catch(() => {
          editInFlight = false;
        });
      };

      // Typing indicator
      const typingInterval = setInterval(() => {
        pingTyping();
      }, 3500);
      pingTyping();
      // Send placeholder immediately so user can see near-real-time updates.
      ensureReplyMessage();

      await api.dispatch({
        source,
        sessionKey,
        text,
        images: images.length > 0 ? images : undefined,

        // --- Streaming callback: called on each text_delta ---
        onStreamDelta: (accumulated: string, _delta: string) => {
          pingTyping();
          latestAccumulated = accumulated;

          // Wait for enough text before sending first message
          if (!replyMsgId && toolLines.length === 0 && accumulated.length < streamStartChars) return;
          pushLiveUpdate();
        },

        // --- Tool callback: called when a tool starts ---
        onToolStart: (toolName: string, args?: Record<string, unknown>, toolCallId?: string) => {
          pingTyping();
          if (toolCallId) {
            if (seenToolCalls.has(toolCallId)) return;
            seenToolCalls.add(toolCallId);
          }
          const line = `→ ${formatToolStartLine(toolName, args)}`;
          toolLines.push(line);
          if (toolLines.length > MAX_TOOL_LINES) toolLines.shift();
          pushLiveUpdate();
        },

        // --- Final respond callback: called once with full text ---
        respond: async (reply) => {
          clearInterval(typingInterval);
          const finalReply = toolLines.length > 0 ? `${toolLines.join("\n")}\n\n${reply}` : reply;

          if (replyMsgId) {
            // Final edit with full HTML formatting
            try {
              const htmlChunks = splitMessage(finalReply, 4096);
              await botClient.api.editMessageText(
                chatId, replyMsgId,
                markdownToTelegramHtml(htmlChunks[0]),
                { parse_mode: "HTML" },
              );
              // Additional chunks as new messages
              for (let i = 1; i < htmlChunks.length; i++) {
                try {
                  await botClient.api.sendMessage(chatId, markdownToTelegramHtml(htmlChunks[i]), { parse_mode: "HTML" });
                } catch {
                  await botClient.api.sendMessage(chatId, htmlChunks[i]);
                }
              }
            } catch {
              // Edit failed (message too old?), send as new
              const chunks = splitMessage(finalReply, 4096);
              for (const chunk of chunks) {
                await botClient.api.sendMessage(chatId, chunk).catch(() => {});
              }
            }
          } else {
            // No streaming happened (very short response), send directly with HTML
            const chunks = splitMessage(finalReply, 4096);
            for (const chunk of chunks) {
              try {
                await botClient.api.sendMessage(chatId, markdownToTelegramHtml(chunk), { parse_mode: "HTML" });
              } catch {
                await botClient.api.sendMessage(chatId, chunk).catch(() => {});
              }
            }
          }
        },

        setTyping: async (typing) => {
          if (!typing) clearInterval(typingInterval);
        },
      });

      clearInterval(typingInterval);
    };

    // --- Text messages ---
    bot.on("message:text", async (ctx) => {
      await handleMessage(ctx, ctx.message.text, []);
    });

    // --- Photo messages ---
    bot.on("message:photo", async (ctx) => {
      const photos = ctx.message.photo;
      if (!photos || photos.length === 0) return;

      // Get the largest photo
      const largest = photos[photos.length - 1];
      const downloaded = await downloadTelegramFile(cfg.botToken, largest.file_id);

      const images: ImageContent[] = [];
      if (downloaded && downloaded.mimeType.startsWith("image/")) {
        images.push({
          type: "image",
          data: downloaded.data,
          mimeType: downloaded.mimeType,
        });
      }

      const caption = ctx.message.caption ?? "";
      await handleMessage(ctx, caption || "(image)", images);
    });

    // --- Document messages ---
    bot.on("message:document", async (ctx) => {
      const doc = ctx.message.document;
      if (!doc) return;

      const downloaded = await downloadTelegramFile(cfg.botToken, doc.file_id);
      const images: ImageContent[] = [];
      if (downloaded && downloaded.mimeType.startsWith("image/")) {
        images.push({
          type: "image",
          data: downloaded.data,
          mimeType: downloaded.mimeType,
        });
      }

      const caption = ctx.message.caption ?? `(file: ${doc.file_name ?? "document"})`;
      await handleMessage(ctx, caption, images);
    });

    // --- Voice messages ---
    bot.on("message:voice", async (ctx) => {
      const voice = ctx.message.voice;
      const duration = voice?.duration ?? 0;
      const text = `[Voice message received, ${duration}s duration. Voice transcription is not yet supported. Please inform the user that you cannot listen to voice messages yet, and ask them to type their message instead.]`;
      await handleMessage(ctx, text, []);
    });

    // --- Slash commands ---
    bot.command("new", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      try {
        await api.resetSession(sessionKey);
        await ctx.reply("Session reset.");
      } catch (err: any) {
        await ctx.reply(`Failed to reset: ${err?.message ?? "unknown error"}`);
      }
    });

    bot.command("status", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      const state = api.getSessionState(sessionKey);
      if (state) {
        const lines = [
          `<b>Session:</b> <code>${sessionKey}</code>`,
          `<b>Role:</b> ${state.role ?? "default"}`,
          `<b>Messages:</b> ${state.messageCount}`,
          `<b>Streaming:</b> ${state.isStreaming}`,
        ];
        await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
      } else {
        await ctx.reply("No active session.");
      }
    });

    bot.command("compact", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      try {
        await ctx.reply("Compacting context...");
        await api.compactSession(sessionKey);
        await ctx.reply("Context compacted.");
      } catch (err: any) {
        await ctx.reply(`Compact failed: ${err?.message ?? "unknown error"}`);
      }
    });

    // /stop — abort current agent run (aligned with OpenClaw)
    bot.command("stop", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      try {
        await api.abortSession(sessionKey);
        await ctx.reply("Stopped.");
      } catch (err: any) {
        await ctx.reply(`Stop failed: ${err?.message ?? "unknown error"}`);
      }
    });

    // /help — list available commands
    bot.command("help", async (ctx) => {
      const lines = [
        "<b>Available Commands:</b>",
        "",
        "/new — Reset session",
        "/status — Show session status",
        "/think &lt;level&gt; — Set thinking (off/minimal/low/medium/high/xhigh)",
        "/model &lt;provider/model&gt; — Switch model",
        "/compact — Compact context",
        "/stop — Stop current agent run",
        "/help — This message",
        "",
        "<i>Any other text is sent to the AI agent.</i>",
      ];
      await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    });

    // /think off|minimal|low|medium|high|xhigh (aligned with OpenClaw)
    bot.command("think", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      const level = (ctx.match ?? "").trim() || "medium";
      const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      if (!validLevels.includes(level)) {
        await ctx.reply(`Invalid level. Use: ${validLevels.join(", ")}`);
        return;
      }
      try {
        await api.setThinkingLevel(sessionKey, level);
        await ctx.reply(`Thinking: <b>${level}</b>`, { parse_mode: "HTML" });
      } catch (err: any) {
        await ctx.reply(`Failed: ${err?.message ?? "unknown error"}`);
      }
    });

    // /model provider/modelId (aligned with OpenClaw)
    bot.command("model", async (ctx) => {
      const source: MessageSource = {
        channel: "telegram",
        chatType: ctx.chat.type === "private" ? "dm" : "group",
        chatId: String(ctx.chat.id),
        senderId: String(ctx.from?.id ?? "unknown"),
      };
      const sessionKey = resolveSessionKey(source, api.config);
      const modelStr = (ctx.match ?? "").trim();
      if (!modelStr || !modelStr.includes("/")) {
        await ctx.reply("Usage: /model provider/modelId\nExample: /model anthropic/claude-sonnet-4-5");
        return;
      }
      const slashIdx = modelStr.indexOf("/");
      const provider = modelStr.slice(0, slashIdx);
      const modelId = modelStr.slice(slashIdx + 1);
      try {
        await api.setModel(sessionKey, provider, modelId);
        await ctx.reply(`Model: <b>${provider}/${modelId}</b>`, { parse_mode: "HTML" });
      } catch (err: any) {
        await ctx.reply(`Failed: ${err?.message ?? "unknown error"}`);
      }
    });

    api.logger.info("Telegram: initialized with P0 features");
  },

  async start() {
    if (!bot) return;
    gatewayApi?.logger.info("Telegram: starting polling...");

    // Register native commands with Telegram API
    try {
      await bot.api.setMyCommands([
        { command: "new", description: "Reset session" },
        { command: "status", description: "Show session status" },
        { command: "think", description: "Set thinking level (off/minimal/low/medium/high)" },
        { command: "model", description: "Switch model (provider/modelId)" },
        { command: "compact", description: "Compact context" },
        { command: "stop", description: "Stop current agent run" },
        { command: "help", description: "List available commands" },
      ]);
      gatewayApi?.logger.info("Telegram: native commands registered");
    } catch (err: any) {
      gatewayApi?.logger.warn(`Telegram: failed to register commands: ${err?.message}`);
    }

    bot.start({
      onStart: () => gatewayApi?.logger.info("Telegram: bot started"),
    });
  },

  async stop() {
    if (!bot) return;
    // Clear all debounce timers
    for (const [, entry] of debounceMap) {
      clearTimeout(entry.timer);
    }
    debounceMap.clear();
    await bot.stop();
    bot = null;
    gatewayApi?.logger.info("Telegram: stopped");
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(telegramPlugin);
}
