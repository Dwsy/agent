import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { registerGappCommand } from "./commands.js";
import { listOnlineGapps } from "./storage.js";
import { startGappHostServer, stopGappHostServer, getHostRole, getBoundPort } from "./host-server.js";
import { ensureGappDaemon } from "./daemon-manager.js";
import { startGappSessionBridge, stopGappSessionBridge } from "./session-bridge.js";
import { hostRegisterSession, hostUnregisterSession } from "./host-client.js";
import {
  setAgentBridge,
  setHostSessionId,
  getHostSessionId,
  listLiveApps,
  completeGenerateJob,
  getGenerateJob,
} from "./registry.js";
import { GAPP_PATHS } from "./constants.js";
import { registerHostRpcHandler } from "./host-rpc.js";
import { McpInspectorHost } from "./mcp-inspector.js";
import { NgrokInspectorHost } from "./ngrok-inspector.js";

const GAPP_DIR = dirname(fileURLToPath(import.meta.url));
const GAPP_SKILL_DIR = join(GAPP_DIR, "skills", "gapp");

/** Register GAPP tools, /gapp command, host :54888 multipath, protocol bridges. */
export function registerGapp(pi: ExtensionAPI, ctx: GappToolContext) {
  const sessionId = `pi-${process.pid}-${randomUUID().slice(0, 8)}`;
  setHostSessionId(sessionId);
  const mcpInspector = new McpInspectorHost();
  const unregisterMcpInspector = registerHostRpcHandler(
    "mcp-url-playground",
    (method, args, context) => mcpInspector.handle(method, args, context),
    (context) => mcpInspector.closeApp(context.appId),
  );
  const ngrokInspector = new NgrokInspectorHost();
  const unregisterNgrokInspector = registerHostRpcHandler(
    "ngrok-native-inspector",
    (method, args, context) => ngrokInspector.handle(method, args, context),
    (context) => ngrokInspector.closeApp(context.appId),
  );

  // Agent bridge: generate + events use main-session sendUserMessage only
  let agentBusy = false;
  setAgentBridge({
    notify: (text, opts) => {
      if (opts?.deliverAs === "followUp") {
        pi.sendUserMessage(text, { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage(text);
      }
    },
    busy: () => agentBusy,
  });

  pi.on("agent_start", async () => {
    agentBusy = true;
  });
  pi.on("agent_end", async (event) => {
    agentBusy = false;
    // Capture assistant text for pending [GAPP generate] jobs. Each marker
    // message is paired with the assistant output that follows it (up to the
    // next marker), so queued jobs and trailing user chatter don't cross wires.
    try {
      const messages = ((event as any)?.messages as any[] | undefined) ?? [];
      const textOf = (message: any): string => {
        if (typeof message?.content === "string") return message.content;
        if (Array.isArray(message?.content)) {
          return message.content
            .filter((c: any) => c?.type === "text" || typeof c?.text === "string")
            .map((c: any) => c.text || "")
            .join("");
        }
        return "";
      };

      const markers: { requestId: string; index: number }[] = [];
      messages.forEach((message, index) => {
        if (message?.role !== "user") return;
        const match = textOf(message).match(/\[GAPP generate\][^\n]*requestId=([^\s\n]+)/);
        if (match) markers.push({ requestId: match[1], index });
      });

      for (let k = 0; k < markers.length; k++) {
        const { requestId, index } = markers[k];
        const job = getGenerateJob(requestId);
        if (!job || job.status === "done" || job.status === "error") continue;

        const end = k + 1 < markers.length ? markers[k + 1].index : messages.length;
        const assistants = messages.slice(index + 1, end).filter((m) => m?.role === "assistant");
        if (assistants.length === 0) continue; // job runs in a later turn
        const text = textOf(assistants[assistants.length - 1]).trim();
        completeGenerateJob(requestId, { ok: true, text });
      }
    } catch {
      // non-fatal
    }
  });

  // Shared control plane :54888. Pi starts a detached daemon and only keeps a
  // small loopback bridge for operations that genuinely need this Pi session.
  const sessionCwd = process.cwd();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let embeddedFallback = false;
  const hostStartup = (async () => {
    let bridge: Awaited<ReturnType<typeof startGappSessionBridge>> | null = null;
    try {
      bridge = await startGappSessionBridge(sessionId);
      const bridgeBase = bridge.base;
      await ensureGappDaemon();
      const info = await startGappHostServer({
        sessionId,
        cwd: sessionCwd,
        bridgeBase,
        clientOnly: true,
      });
      heartbeat = setInterval(() => {
        void hostRegisterSession(
          { sessionId, cwd: sessionCwd, bridgeBase },
          false,
        );
      }, 60_000);
      heartbeat.unref?.();
      return info;
    } catch (error) {
      // Keep the plugin usable if Bun/daemon startup is unavailable. This path
      // retains the old in-process host and is visible in debug logs.
      embeddedFallback = true;
      console.error(
        `[gapp] persistent daemon unavailable; using embedded fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return await startGappHostServer({
        sessionId,
        cwd: sessionCwd,
        bridgeBase: bridge?.base,
        mode: "embedded",
      });
    }
  })();

  void hostStartup
    .then((info) => {
      if (process.env.GAPP_HOST_DEBUG === "1") {
        console.error(
          `[gapp] host ${info.role} ${info.base} session=${getHostSessionId()} paths=${GAPP_PATHS.root}`,
        );
      }
    })
    .catch((err) => {
      console.error(`[gapp] host server failed: ${err instanceof Error ? err.message : err}`);
    });

  pi.on("session_shutdown", async () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unregisterMcpInspector();
    unregisterNgrokInspector();
    await Promise.all([
      mcpInspector.closeAll().catch(() => {}),
      ngrokInspector.closeAll().catch(() => {}),
    ]);
    await hostStartup.catch(() => {});
    await hostUnregisterSession(sessionId).catch(() => false);
    await stopGappSessionBridge().catch(() => {});
    if (embeddedFallback && getHostRole() === "hub") {
      await stopGappHostServer().catch(() => {});
    }
  });

  registerGappCommand(pi, ctx.activeWindows);

  pi.on("resources_discover", async () => {
    return { skillPaths: [GAPP_SKILL_DIR] };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    try {
      // Progressive context: current-project app ids only. Everything else —
      // other projects, global scope, disabled — is discovered on demand via
      // `bun gapp-cli.ts list`; the gapp skill carries the
      // full calling system.
      const sessionCwd = ctx.cwd || process.cwd();
      const online = (await listOnlineGapps(sessionCwd)).filter(
        (m) => m.scope === "project" && m.cwd === sessionCwd,
      );
      const projectIds = new Set(online.map((m) => m.id));
      const lives = listLiveApps().filter((a) => projectIds.has(a.appId));
      if (online.length === 0 && lives.length === 0) return undefined;
      const lines = ["# Glimpse-APP (GAPP) · 渐进上下文"];
      if (online.length > 0) {
        lines.push("", "## 当前项目（enabled · 未归档）", "");
        for (const m of [...online].sort((a, b) => a.id.localeCompare(b.id))) {
          lines.push(`- \`${m.id}\` · ${m.name}${m.description ? ` — ${m.description}` : ""}`);
        }
      }
      if (lives.length > 0) {
        lines.push("", "## Live 窗口（仅 id）", "");
        for (const a of [...lives].sort((x, y) => x.appId.localeCompare(y.appId))) {
          lines.push(`- \`${a.appId}\``);
        }
      }
      lines.push(
        "",
        "其他项目/全局 GAPP：`bun gapp-cli.ts list` 查询；调用方式见技能 `gapp`（先读技能，渐进操作）。未读工具目录前勿编造 domain tool 名。",
      );
      return { systemPrompt: `${event.systemPrompt}\n\n${lines.join("\n")}` };
    } catch {
      return undefined;
    }
  });
}

export type { GappToolContext } from "./tools.js";
