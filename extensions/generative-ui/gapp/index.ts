import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { registerGappTools, type GappToolContext } from "./tools.js";
import { registerGappCommand } from "./commands.js";
import { getGappPromptAppendix } from "./prompt.js";
import { startGappHostServer, stopGappHostServer, getHostRole, getBoundPort } from "./host-server.js";
import {
  setAgentBridge,
  setHostSessionId,
  getHostSessionId,
  listLiveApps,
  completeGenerateJob,
  getGenerateJob,
} from "./registry.js";
import { GAPP_PROTOCOL_VERSION } from "./protocol.js";
import { GAPP_HOST_BASE, GAPP_PATHS } from "./constants.js";
import { registerHostRpcHandler } from "./host-rpc.js";
import { McpInspectorHost } from "./mcp-inspector.js";
import { NgrokInspectorHost } from "./ngrok-inspector.js";

const GAPP_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATIVE_BRIDGE_SKILL_DIR = join(GAPP_DIR, "skills", "generative-bridge");

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

  // Shared control plane :54888 multipath
  void startGappHostServer({ sessionId, cwd: process.cwd() })
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
    unregisterMcpInspector();
    unregisterNgrokInspector();
    await Promise.all([
      mcpInspector.closeAll().catch(() => {}),
      ngrokInspector.closeAll().catch(() => {}),
    ]);
    if (getHostRole() === "hub") {
      await stopGappHostServer().catch(() => {});
    }
  });

  registerGappTools(pi, ctx);
  registerGappCommand(pi, ctx.activeWindows);

  pi.on("resources_discover", async () => {
    return { skillPaths: [GENERATIVE_BRIDGE_SKILL_DIR] };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const lives = listLiveApps();
      // Progressive: appendix gets live ids only (no tool catalogs — agent uses gapp_list_tools).
      const appendix = await getGappPromptAppendix(ctx.cwd || process.cwd(), {
        liveApps: lives.map((a) => ({
          id: a.appId,
          name: a.appId,
          scope: a.scope,
          live: true,
        })),
        host: {
          base: GAPP_HOST_BASE,
          role: getHostRole(),
          port: getBoundPort(),
          protocolVersion: GAPP_PROTOCOL_VERSION,
        },
      });
      return { systemPrompt: `${event.systemPrompt}\n\n${appendix}` };
    } catch {
      return;
    }
  });
}

export type { GappToolContext } from "./tools.js";
