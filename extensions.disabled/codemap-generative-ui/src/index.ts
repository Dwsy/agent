import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodemapPlugin } from "./plugins/codemap/index.ts";
import { registerPluginModules } from "./host/register-tools.ts";
import { registerSemanticRouter } from "./host/semantic-router.ts";
import { CodemapWebServer } from "./runtime/web-server.ts";
import { beginStreamingWidget, clearStreamingWindow, closeAllHtmlWindows, finalizeStreamingWidget, getStreamingWidgetState, pushStreamingWidgetMarkup } from "./runtime/glimpse-window.ts";
import type { PluginSharedContext } from "./shared/module.ts";

function parseWebCommandArgs(raw: string) {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const action = (parts[0] ?? "start").toLowerCase();
  const port = Number(parts[1] ?? "43118");
  return {
    action,
    port: Number.isFinite(port) && port > 0 ? port : 43118,
  };
}

export default function (pi: ExtensionAPI) {
  let agentBusy = false;
  let webServer: CodemapWebServer | null = null;

  const shared: PluginSharedContext = {
    web: {
      listExisting: async () => ({ indexPath: null, entries: [] }),
      renderExisting: async () => ({ html: "<html><body>Not implemented</body></html>", title: "Not implemented", sourcePath: undefined }),
      openWindow: async () => ({ title: "Not implemented", sourcePath: undefined }),
      generateRequest: async () => ({ queuedPrompt: "" }),
      analyzeLocation: async () => ({ queuedPrompt: "" }),
      refineTrace: async () => ({ queuedPrompt: "" }),
    },
    queueUserPrompt(prompt: string) {
      if (agentBusy) {
        pi.sendUserMessage(prompt, { deliverAs: "followUp" });
        return;
      }
      pi.sendUserMessage(prompt);
    },
  };

  const plugins = [createCodemapPlugin(shared)];
  registerPluginModules(pi, plugins, shared);
  registerSemanticRouter(pi, plugins);

  async function ensureWebServer(port: number) {
    if (webServer?.isRunning()) {
      if (webServer.getPort() === port) {
        return webServer;
      }
      await webServer.stop();
      webServer = null;
    }
    webServer = new CodemapWebServer(port, shared.web);
    await webServer.start();
    return webServer;
  }

  function broadcast(type: string, payload: Record<string, any>) {
    webServer?.broadcast({ type, ...payload });
  }

  function recordHistory(item: { title: string; html: string; sourcePath?: string }) {
    return webServer?.recordHistory(item);
  }

  pi.registerCommand("codemap-web", {
    description: "Start/stop/status for the local CodeMap HTTP + WebSocket portal",
    handler: async (args, ctx) => {
      const { action, port } = parseWebCommandArgs(args);
      try {
        if (action === "stop") {
          if (!webServer?.isRunning()) {
            const message = "CodeMap web portal 未启动";
            ctx.ui.notify(message, "info");
            return;
          }
          await webServer.stop();
          webServer = null;
          ctx.ui.notify("CodeMap web portal 已停止", "success");
          return;
        }

        if (action === "status") {
          const message = webServer?.isRunning()
            ? `CodeMap web portal 运行中：http://127.0.0.1:${webServer.getPort()}`
            : "CodeMap web portal 未启动";
          if (ctx.hasUI) {
            ctx.ui.notify(message, "info");
            ctx.ui.setEditorText?.(message);
          } else {
            console.log(message);
          }
          return;
        }

        const server = await ensureWebServer(port);
        const url = `http://127.0.0.1:${server.getPort()}`;
        if (ctx.hasUI) {
          ctx.ui.notify(`CodeMap web portal 已启动：${url}`, "success");
          ctx.ui.openUrl?.(url);
        } else {
          console.log(`CodeMap web portal started: ${url}`);
        }
      } catch (error: any) {
        const message = `codemap-web failed: ${error.message}`;
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
        } else {
          console.error(message);
        }
      }
    },
  });

  pi.on("message_update", async (event) => {
    const raw: any = event.assistantMessageEvent;
    if (!raw) {
      return;
    }

    if (raw.type === "toolcall_start") {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      if (block?.type === "toolCall" && block?.name === "codemap_show_widget") {
        beginStreamingWidget({ contentIndex: raw.contentIndex });
      }
      return;
    }

    const streaming = getStreamingWidgetState();
    if (!streaming) {
      return;
    }
    if (raw.contentIndex !== streaming.contentIndex) {
      return;
    }

    if (raw.type === "toolcall_delta") {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      const args = block?.arguments ?? {};
      const widgetCode = args.widget_code ?? args.html;
      if (!widgetCode) {
        return;
      }
      await pushStreamingWidgetMarkup(widgetCode, {
        title: args.title ? `CodeMap · ${args.title}` : undefined,
        width: args.width,
        height: args.height,
        floating: args.floating,
      });
      return;
    }

    if (raw.type === "toolcall_end") {
      const toolCall: any = raw.toolCall;
      const args = toolCall?.arguments ?? {};
      const widgetCode = args.widget_code ?? args.html;
      if (widgetCode) {
        await finalizeStreamingWidget(widgetCode);
      }
    }
  });

  pi.on("agent_start", async () => {
    agentBusy = true;
    broadcast("status", { status: "agent_busy", message: "Agent 开始处理请求", kind: "info" });
  });

  pi.on("agent_end", async () => {
    agentBusy = false;
    broadcast("status", { status: "agent_idle", message: "Agent 当前空闲", kind: "success" });
  });

  pi.on("tool_execution_start", async (event) => {
    broadcast("agent_event", {
      message: `Tool start: ${event.toolName}`,
      kind: event.toolName.startsWith("codemap_") ? "success" : "info",
    });
  });

  pi.on("tool_execution_end", async (event) => {
    broadcast("agent_event", {
      message: `Tool end: ${event.toolName} (${event.isError ? "error" : "ok"})`,
      kind: event.isError ? "error" : (event.toolName.startsWith("codemap_") ? "success" : "info"),
    });
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "codemap_render_html") {
      const details = event.details as any;
      if (details?.html) {
        const history = recordHistory({
          title: details.title ?? "CodeMap",
          html: details.html,
          sourcePath: details.jsonPath ?? details.sourcePath,
        });
        broadcast("render_result", {
          html: details.html,
          title: details.title ?? "CodeMap",
          sourcePath: details.jsonPath ?? details.sourcePath,
          historyId: history?.id,
        });
      }
    }
  });

  pi.on("session_shutdown", async () => {
    if (webServer?.isRunning()) {
      await webServer.stop();
      webServer = null;
    }
    await closeAllHtmlWindows();
  });
}
