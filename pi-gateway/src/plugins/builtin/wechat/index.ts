import path from "node:path";
import qrcode from "qrcode-terminal";
import type {
  ChannelPlugin,
  GatewayPluginApi,
  MediaSendOptions,
  MediaSendResult,
  MessageActionResult,
  MessageSendResult,
  ReadHistoryResult,
  ChannelSecurityAdapter,
} from "../../types.ts";
import type { WechatChannelConfig, WechatAccountRuntime } from "./types.ts";
import { resolveWechatConfig, hasWechatCredentials } from "./config.ts";
import { resolveWechatAccounts, resolveDefaultAccountId, startWechatLoginWithQr, waitForWechatLogin, saveWechatAccount, type WechatQrStartResult, type WechatQrWaitResult } from "./accounts.ts";
import { sendWechatText, sendWechatMedia, sendWechatKeyboard } from "./outbound.ts";
import { startWechatGateway, stopWechatGateway } from "./gateway.ts";
import { flushWechatKnownUsers } from "./known-users.ts";
import { handleWechatMessage } from "./handlers.ts";
import { logger } from "./logger.ts";
import { initWechatImageServer } from "./image-server.ts";

/**
 * WeChat plugin runtime (multi-account).
 */
interface WechatPluginRuntimeMulti {
  api: GatewayPluginApi;
  channelCfg: WechatChannelConfig;
  accounts: Map<string, WechatAccountRuntime>;
  defaultAccountId: string;
}

let runtime: WechatPluginRuntimeMulti | null = null;

/**
 * Auto-start QR login flow when no token is configured.
 * Displays QR code in terminal and polls for scan result.
 */
async function startAutoLogin(rt: WechatPluginRuntimeMulti): Promise<void> {
  const baseUrl = rt.channelCfg.baseUrl || "https://ilinkai.weixin.qq.com";
  const accountId = rt.defaultAccountId || "default";

  logger.info(`[wechat:auto-login] starting QR login for accountId=${accountId}`);

  try {
    // Step 1: Get QR code
    const result = await startWechatLoginWithQr({
      accountId,
      apiBaseUrl: baseUrl,
      botType: "3",
    });

    if (!result.qrcodeUrl) {
      logger.error(`[wechat:auto-login] failed to get QR code: ${result.message}`);
      return;
    }

    // Step 2: Display QR code in terminal
    console.log("\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📱 微信扫码登录 (ilink Bot)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("请用微信扫描下方二维码:");
    console.log("");

    // Generate terminal QR code from URL
    qrcode.generate(result.qrcodeUrl, { small: true });

    console.log("");
    console.log(`🔗 或在微信中打开链接:`);
    console.log(`   ${result.qrcodeUrl}`);
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⏳ 等待扫码 (5 分钟超时)...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");

    // Step 3: Poll for scan result
    const loginResult = await waitForWechatLogin({
      sessionKey: result.sessionKey,
      apiBaseUrl: baseUrl,
      timeoutMs: 300000, // 5 minutes
      verbose: true,
    });

    if (loginResult.connected && loginResult.botToken) {
      // Step 4: Save account
      const normalizedId = loginResult.accountId 
        ? loginResult.accountId.replace(/[@.]/g, "-") 
        : accountId;
      
      saveWechatAccount(normalizedId, {
        token: loginResult.botToken,
        baseUrl: loginResult.baseUrl || baseUrl,
        userId: loginResult.userId,
      });

      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ 登录成功！");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`📋 账号ID: ${normalizedId}`);
      console.log("💾 凭证已保存");
      console.log("");
      console.log("🔄 正在重新加载 gateway...");
      console.log("");

      // Step 5: Notify user to restart
      // Note: We can't auto-reload from plugin, user needs to restart gateway
      logger.info("[wechat:auto-login] login successful, please restart gateway");
      console.log("🔄 请重启 gateway 以加载新账号:");
      console.log("   tmux send-keys -t gateway C-c Enter");
      console.log("   tmux send-keys -t gateway 'cd ~/.pi/agent/pi-gateway && bun run dev' Enter");
      console.log("");
    } else {
      logger.error(`[wechat:auto-login] login failed: ${loginResult.message}`);
      console.log("");
      console.log("❌ 登录失败:", loginResult.message);
      console.log("   请重新启动 gateway 重试");
    }
  } catch (err) {
    logger.error(`[wechat:auto-login] error: ${String(err)}`);
    console.log("");
    console.log("❌ 登录出错:", String(err));
  }
}

/**
 * Get account runtime by target string.
 * Target format: "accountId:userId" or just "userId" (uses default account).
 */
function parseAccountFromTarget(target: string): { accountId: string; userId: string } {
  const parts = target.split(":");
  if (parts.length >= 2) {
    return { accountId: parts[0], userId: parts.slice(1).join(":") };
  }
  return { accountId: runtime?.defaultAccountId ?? "default", userId: target };
}

/**
 * Get context token for a user from the appropriate account runtime.
 */
function getContextTokenForUser(accountId: string, userId: string): string | undefined {
  if (!runtime) return undefined;
  const account = runtime.accounts.get(accountId);
  if (!account) return undefined;
  return account.contextTokens.get(userId);
}

/**
 * Weixin channel plugin for pi-gateway.
 *
 * Architecture:
 * - Uses ilink API (https://ilinkai.weixin.qq.com) for HTTP long-poll messaging
 * - Authentication via QR login, which yields a bot_token
 * - Context tokens are CRITICAL: each inbound message has a context_token that
 *   must be echoed in outbound replies to maintain conversation association
 * - Media uses CDN encryption (encrypt_query_param + aes_key)
 *
 * Key differences from QQBot:
 * - Protocol: HTTP long-poll vs WebSocket
 * - Chat types: Direct messages only (no groups or channels)
 * - Streaming: Not natively supported; can simulate via message edits
 * - Media: CDN encryption required for all uploads/downloads
 */
const wechatPlugin: ChannelPlugin = {
  id: "wechat",
  resolveTarget({ chatId, sessionKey, session }) {
    // Weixin only supports direct messages
    // Format: "accountId:userId" or just "userId"
    const lastAccountId = session?.lastAccountId;
    if (lastAccountId && runtime?.accounts.has(lastAccountId)) {
      return `${lastAccountId}:${chatId}`;
    }
    return `${runtime?.defaultAccountId ?? "default"}:${chatId}`;
  },
  meta: {
    label: "WeChat",
    blurb: "WeChat personal account via ilink API (HTTP long-poll)",
    docsUrl: "https://docs.openclaw.ai/channels/wechat",
  },
  capabilities: {
    direct: true,
    group: false,
    thread: false,
    media: true,
    streaming: false, // Not natively supported
    security: true,
    reactions: false,
    editable: false,
    deletable: false,
    pinnable: false,
    history: false,
    matrix: {
      messaging: {
        post: true,
        edit: false,
        delete: false,
        fileUpload: "partial", // Requires CDN encryption
        streaming: "none",
      },
      richContent: {
        cards: "none" as const,
        buttons: "none" as const,
        modals: false,
      },
      conversation: {
        mentions: false,
        reactions: "none" as const,
        dms: true,
        typing: false,
        ephemeral: "none" as const,
      },
      interaction: {
        callbacks: false,
        ack: false,
        messageUpdate: "none",
      },
      history: {
        fetchMessages: "none",
        fetchSingleMessage: "none",
        fetchThreadInfo: "none",
        fetchChannelMessages: "none",
        listThreads: "none",
        fetchChannelInfo: "none",
        postChannelMessage: "none",
      },
    },
  },
  outbound: {
    maxLength: 4000,
    async sendText(target: string, text: string, opts): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "WeChat not initialized" };
      const { accountId, userId } = parseAccountFromTarget(target);
      const account = runtime.accounts.get(accountId);
      if (!account) return { ok: false, error: `Account ${accountId} not found` };
      
      // Create a minimal runtime for the outbound functions
      const accountRuntime = { ...account, channelCfg: runtime.channelCfg };
      return sendWechatText(accountRuntime, userId, text, opts);
    },
    async sendMedia(
      target: string,
      filePath: string,
      opts?: MediaSendOptions
    ): Promise<MediaSendResult> {
      if (!runtime) return { ok: false, error: "WeChat not initialized" };
      const { accountId, userId } = parseAccountFromTarget(target);
      const account = runtime.accounts.get(accountId);
      if (!account) return { ok: false, error: `Account ${accountId} not found` };
      
      const accountRuntime = { ...account, channelCfg: runtime.channelCfg };
      return sendWechatMedia(accountRuntime, userId, filePath, opts);
    },
    async editMessage(): Promise<MessageActionResult> {
      return { ok: false, error: "WeChat does not support message editing" };
    },
    async deleteMessage(): Promise<MessageActionResult> {
      return { ok: false, error: "WeChat does not support message deletion" };
    },
    async readHistory(): Promise<ReadHistoryResult> {
      return { ok: false, error: "WeChat does not support history reading" };
    },
    async sendKeyboard(
      target: string,
      text: string,
      keyboard: import("../../types.ts").InlineKeyboardMarkup
    ): Promise<MessageSendResult> {
      if (!runtime) return { ok: false, error: "WeChat not initialized" };
      const { accountId, userId } = parseAccountFromTarget(target);
      const account = runtime.accounts.get(accountId);
      if (!account) return { ok: false, error: `Account ${accountId} not found` };
      
      const accountRuntime = { ...account, channelCfg: runtime.channelCfg };
      return sendWechatKeyboard(accountRuntime, userId, text, keyboard);
    },
  },
  async init(api: GatewayPluginApi) {
    const channelCfg = resolveWechatConfig(
      api.config.channels.wechat as WechatChannelConfig | undefined
    );

    if (!channelCfg.enabled) {
      api.logger.info("WeChat: disabled or not configured, skipping");
      runtime = null;
      return;
    }

    runtime = {
      api,
      channelCfg,
      accounts: new Map(),
      defaultAccountId: "default",
    };

    // Resolve accounts from config and storage
    const resolved = resolveWechatAccounts(channelCfg);
    const defaultAccountId = resolveDefaultAccountId(channelCfg);
    runtime.defaultAccountId = defaultAccountId;

    // Initialize image server HTTP routes
    initWechatImageServer(api, {
      storageDir: path.join(process.env.PI_STATE_DIR ?? path.join(process.env.HOME ?? "/tmp", ".pi", "state"), "wechat", "images"),
    });

    // Register login HTTP routes (always available for QR login)
    api.registerHttpRoute("GET", "/api/wechat/login", async (req) => {
      try {
        const baseUrl = channelCfg.baseUrl || "https://ilinkai.weixin.qq.com";
        const result = await startWechatLoginWithQr({
          accountId: defaultAccountId || "default",
          apiBaseUrl: baseUrl,
          botType: "3",
        });
        
        if (result.qrcodeUrl) {
          return Response.json({ 
            ok: true, 
            qrcodeUrl: result.qrcodeUrl,
            sessionKey: result.sessionKey,
            message: result.message 
          });
        }
        return Response.json({ ok: false, error: result.message }, { status: 400 });
      } catch (err) {
        logger.error(`[wechat:login] ${String(err)}`);
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
      }
    });

    api.registerHttpRoute("GET", "/api/wechat/login/status", async (req) => {
      try {
        const url = new URL(req.url);
        const sessionKey = url.searchParams.get("sessionKey");
        
        if (!sessionKey) {
          return Response.json({ ok: false, error: "sessionKey required" }, { status: 400 });
        }

        const baseUrl = channelCfg.baseUrl || "https://ilinkai.weixin.qq.com";
        const result = await waitForWechatLogin({
          sessionKey,
          apiBaseUrl: baseUrl,
          timeoutMs: 5000,
          verbose: false,
        });

        if (result.connected && result.botToken) {
          // Save the account
          saveWechatAccount(result.accountId || "default", {
            token: result.botToken,
            baseUrl: result.baseUrl || baseUrl,
            userId: result.userId,
          });
          
          return Response.json({ 
            ok: true, 
            connected: true, 
            accountId: result.accountId,
            message: "Login successful! Restart gateway to use the account."
          });
        }

        return Response.json({ 
          ok: true, 
          connected: false, 
          status: result.message 
        });
      } catch (err) {
        logger.error(`[wechat:login:status] ${String(err)}`);
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
      }
    });

    api.logger.info("WeChat: registered login routes at /api/wechat/login");

    if (resolved.length === 0) {
      api.logger.info("WeChat: no enabled account with token, starting auto-login flow...");
      // Auto-start QR login when no token configured
      startAutoLogin(runtime).catch((err) => {
        logger.error(`[wechat] auto-login failed: ${String(err)}`);
      });
      return;
    }

    // Create account runtimes
    for (const acc of resolved) {
      const accountRuntime: WechatAccountRuntime = {
        api,
        channelCfg,
        accountId: acc.accountId,
        token: acc.token,
        baseUrl: acc.baseUrl,
        cdnBaseUrl: acc.cdnBaseUrl,
        name: acc.name,
        userId: acc.userId,
        dmPolicy: acc.dmPolicy,
        allowFrom: acc.allowFrom,
        pollTimer: null,
        reconnectTimer: null,
        disposed: false,
        contextTokens: new Map(),
        dedup: new Map(),
        streamPlaceholders: new Map(),
        syncBuf: "",
        syncBufPath: "",
        lastEventAt: undefined,
        lastInboundAt: undefined,
        lastOutboundAt: undefined,
        lastError: undefined,
        typingTicket: undefined,
      };
      runtime.accounts.set(acc.accountId, accountRuntime);
    }

    // Set security adapter
    const defaultAccount = resolved.find((a) => a.accountId === defaultAccountId) ?? resolved[0];
    wechatPlugin.security = {
      dmPolicy: defaultAccount.dmPolicy,
      dmAllowFrom: defaultAccount.allowFrom,
      supportsPairing: defaultAccount.dmPolicy === "pairing",
      accountId: defaultAccount.accountId,
    } satisfies ChannelSecurityAdapter;

    api.logger.info(`WeChat: initialized accounts=${Array.from(runtime.accounts.keys()).join(",")}`);
  },
  async start() {
    if (!runtime) return;
    
    // Start gateway for each account
    for (const [accountId, account] of runtime.accounts) {
      if (!account.token) {
        logger.warn(`WeChat: skipping account ${accountId} (no token)`);
        continue;
      }

      await startWechatGateway(account, async (msg) => {
        await handleWechatMessage(account, msg);
      });
    }

    runtime.api.logger.info("WeChat: gateway started");
  },
  async stop() {
    if (!runtime) return;
    
    // Stop all account gateways
    for (const account of runtime.accounts.values()) {
      await stopWechatGateway(account);
    }
    
    // 持久化缓存数据到磁盘
    flushWechatKnownUsers();
    
    runtime.accounts.clear();
    runtime = null;
  },
};

export default function register(api: GatewayPluginApi) {
  api.registerChannel(wechatPlugin);
}

// Re-export for external use
export { resolveWechatAccounts, resolveDefaultAccountId } from "./accounts.ts";
export { startWechatGateway, stopWechatGateway } from "./gateway.ts";
export { handleWechatMessage } from "./handlers.ts";
export { sendWechatText, sendWechatMedia, sendWechatKeyboard } from "./outbound.ts";
export * from "./types.ts";
