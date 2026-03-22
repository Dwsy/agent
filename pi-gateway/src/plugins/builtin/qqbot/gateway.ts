import { ensureAccessToken, fetchGatewayUrl, onMessageSent } from "./api.ts";
import type { QqbotPluginRuntime } from "./types.ts";
import { saveCredentialBackup } from "./credential-backup.ts";
import { setRefIndex, getRefIndex, formatRefEntryForAgent } from "./ref-index-store.ts";

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

function stopHeartbeat(runtime: QqbotPluginRuntime): void {
  if (runtime.heartbeatTimer) {
    clearInterval(runtime.heartbeatTimer);
    runtime.heartbeatTimer = null;
  }
}

function scheduleReconnect(runtime: QqbotPluginRuntime, onDispatch: (eventType: string, data: unknown) => Promise<void>): void {
  if (runtime.disposed) return;
  if (runtime.reconnectTimer) return;
  runtime.reconnectTimer = setTimeout(async () => {
    runtime.reconnectTimer = null;
    try {
      await startQqbotGateway(runtime, onDispatch);
    } catch (err) {
      runtime.api.logger.warn(`QQBot gateway reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
      scheduleReconnect(runtime, onDispatch);
    }
  }, 3000);
}

async function identify(runtime: QqbotPluginRuntime, ws: WebSocket): Promise<void> {
  const token = await ensureAccessToken(runtime);
  runtime.api.logger.info(`QQBot gateway identify: intents=${runtime.intents} appId=${runtime.channelCfg.appId}`);
  ws.send(JSON.stringify({
    op: OP_IDENTIFY,
    d: {
      token: `QQBot ${token.accessToken}`,
      intents: runtime.intents,
      shard: [0, 1],
      properties: {
        $os: process.platform,
        $browser: "pi-gateway",
        $device: "pi-gateway",
      },
    },
  }));
}

export async function startQqbotGateway(runtime: QqbotPluginRuntime, onDispatch: (eventType: string, data: unknown) => Promise<void>): Promise<void> {
  // 注册出站消息 refIdx 缓存钩子（所有 sendQqbotMessage 调用后自动触发）
  onMessageSent((refIdx, meta) => {
    runtime.api.logger.info(`QQBot onMessageSent: refIdx=${refIdx}, text=${(meta.text ?? "").slice(0, 40)}`);
    setRefIndex(refIdx, {
      content: meta.text ?? "",
      senderId: runtime.botId ?? runtime.channelCfg.appId ?? "bot",
      senderName: "Bot",
      timestamp: Date.now(),
      isBot: true,
      attachments: meta.mediaType ? [{
        type: meta.mediaType,
        localPath: meta.mediaLocalPath,
        url: meta.mediaUrl,
      }] : undefined,
    });
  });

  const url = await fetchGatewayUrl(runtime);
  runtime.api.logger.info(`QQBot gateway connecting: ${url}`);
  const ws = new WebSocket(url);
  runtime.ws = ws;

  ws.onmessage = async (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { op?: number; d?: any; s?: number; t?: string };
      if (typeof payload.s === "number") runtime.seq = payload.s;
      if (payload.op === OP_HELLO) {
        runtime.api.logger.info(`QQBot gateway hello: heartbeat=${payload.d?.heartbeat_interval ?? 45000}`);
        runtime.heartbeatIntervalMs = payload.d?.heartbeat_interval ?? 45000;
        stopHeartbeat(runtime);
        runtime.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: OP_HEARTBEAT, d: runtime.seq ?? null }));
          }
        }, runtime.heartbeatIntervalMs);
        await identify(runtime, ws);
        return;
      }
      if (payload.op === OP_HEARTBEAT_ACK) return;
      if (payload.op === OP_DISPATCH && payload.t) {
        if (payload.t === "READY") {
          runtime.sessionId = payload.d?.session_id;
          runtime.botId = payload.d?.user?.id || runtime.botId;
          runtime.api.logger.info(`QQBot gateway ready: botId=${runtime.botId ?? "unknown"} session=${runtime.sessionId ?? "unknown"}`);
          // 启动成功，保存凭证快照供热更新后恢复
          saveCredentialBackup("default", runtime.channelCfg.appId ?? "", runtime.channelCfg.clientSecret ?? "");
          return;
        }
        runtime.api.logger.info(`QQBot gateway dispatch: type=${payload.t} seq=${payload.s ?? "n/a"}`);
        await onDispatch(payload.t, payload.d);
      }
    } catch (err) {
      runtime.api.logger.warn(`QQBot gateway message error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  ws.onopen = () => {
    runtime.api.logger.info("QQBot gateway websocket open");
  };

  ws.onclose = () => {
    runtime.api.logger.warn("QQBot gateway websocket closed");
    stopHeartbeat(runtime);
    runtime.ws = null;
    scheduleReconnect(runtime, onDispatch);
  };

  ws.onerror = (event) => {
    runtime.api.logger.warn(`QQBot gateway websocket error: ${String((event as any)?.message ?? "unknown")}`);
    stopHeartbeat(runtime);
  };
}

export async function stopQqbotGateway(runtime: QqbotPluginRuntime): Promise<void> {
  runtime.disposed = true;
  stopHeartbeat(runtime);
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  if (runtime.ws) {
    try {
      runtime.ws.close();
    } catch {}
    runtime.ws = null;
  }
}
