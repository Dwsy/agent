import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { listNearestCodeMaps, resolveCodeMapInput } from "../../codemap.ts";
import { buildLocationAnalyzePrompt, buildTraceRefinePrompt, buildWebGeneratePrompt } from "../../shared/prompting.ts";
import type { ExtensionPluginModule, PluginSharedContext } from "../../shared/module.ts";
import { matchCodemapPrompt } from "./intent.ts";
import { getCodeMapReadme } from "./readme.ts";
import { registerCodeMapCollectTool } from "./collect.ts";
import { registerCodeMapRenderHtmlTool } from "./render-html.ts";
import { registerCodeMapShowWidgetTool } from "./render-widget.ts";

export function createCodemapPlugin(shared: PluginSharedContext): ExtensionPluginModule {
  return {
    id: "codemap",
    matchPrompt: matchCodemapPrompt,
    register(pi: ExtensionAPI) {
      pi.registerTool({
        name: "codemap_read_me",
        label: "CodeMap Read Me",
        description: "Load the CodeMap generative workflow and schema guidelines before collecting context or generating HTML.",
        promptSnippet: "Load CodeMap-specific generation guidelines before collecting context or rendering artifacts.",
        promptGuidelines: [
          "Call codemap_read_me before a fresh CodeMap generation task.",
          "Use the returned workflow as the basis for tool ordering and artifact structure.",
        ],
        parameters: Type.Object({}),
        async execute() {
          return {
            content: [{ type: "text", text: getCodeMapReadme() }],
            details: { module: "codemap" },
          };
        },
      });

      pi.registerTool({
        name: "codemap_list_existing",
        label: "CodeMap List Existing",
        description: "List the nearest CodeMap entries from docs/.codemap/index.json.",
        parameters: Type.Object({}),
        async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
          const result = await listNearestCodeMaps(ctx.cwd);
          const text = [
            `Index: ${result.indexPath ?? "(not found)"}`,
            ...result.entries.map((entry) => `- ${entry.id}: ${entry.title ?? entry.filename}`),
          ].join("\n");
          return {
            content: [{ type: "text", text }],
            details: result,
          };
        },
      });

      registerCodeMapCollectTool(pi);
      registerCodeMapRenderHtmlTool(pi);
      registerCodeMapShowWidgetTool(pi);

      shared.web.listExisting = async () => {
        return listNearestCodeMaps(process.cwd());
      };

      shared.web.renderExisting = async (payload) => {
        const resolved = await buildResolvedCodeMap(payload.path, process.cwd(), payload.id);
        return { html: resolved.html, title: resolved.title, sourcePath: resolved.sourcePath };
      };

      shared.web.openWindow = async (payload) => {
        const resolved = await buildResolvedCodeMap(payload.path, process.cwd(), payload.id);
        await openHtmlWindow({ title: `CodeMap · ${resolved.title}`, html: resolved.html, width: 1360, height: 920 });
        return { title: resolved.title, sourcePath: resolved.sourcePath };
      };

      shared.web.generateRequest = async (payload) => {
        const prompt = buildWebGeneratePrompt({
          query: payload.query,
          roots: payload.roots,
          saveBaseName: payload.id,
        });
        if (payload.path || payload.id) {
          const resolved = await resolveCodeMapInput(payload.path, process.cwd(), payload.id).catch(() => null);
          if (resolved) {
            const extra = `\n\n如果你发现这是已有 CodeMap 路径，也可以直接走 codemap_show_widget 路径；只有在需要保存/导出时再走 codemap_render_html(persist=true)。`;
            const combined = prompt + extra;
            shared.queueUserPrompt(combined);
            return { queuedPrompt: combined };
          }
        }
        shared.queueUserPrompt(prompt);
        return { queuedPrompt: prompt };
      };

      shared.web.analyzeLocation = async (payload) => {
        const location = payload.location ?? {};
        const prompt = buildLocationAnalyzePrompt(location);
        shared.queueUserPrompt(prompt);
        return { queuedPrompt: prompt };
      };

      shared.web.refineTrace = async (payload) => {
        const prompt = buildTraceRefinePrompt({
          location: payload.location ?? {},
          sourcePath: payload.sourcePath,
          historyId: payload.historyId,
        });
        shared.queueUserPrompt(prompt);
        return { queuedPrompt: prompt };
      };
    },
  };
}
