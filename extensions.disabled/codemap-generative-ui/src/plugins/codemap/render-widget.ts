import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildResolvedCodeMap } from "../../codemap.ts";
import { buildCodeMapHtml, buildCodeMapWidgetCode } from "../../html.ts";
import type { CodeMapDocument } from "../../types.ts";
import { consumeStreamingWindow, finalizeStreamingWidget, openHtmlWindow } from "../../runtime/glimpse-window.ts";

export function registerCodeMapShowWidgetTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "codemap_show_widget",
    label: "CodeMap Show Widget",
    description: "Primary visual output tool for CodeMap tasks. Render CodeMap HTML in a native macOS window and support progressive HTML streaming like generative-ui when widget_code is provided.",
    promptSnippet: "Primary visual output for CodeMap tasks. Prefer this tool for user-facing visualization, especially with widget_code for progressive HTML streaming.",
    promptGuidelines: [
      "Use codemap_show_widget as the default visual output tool for CodeMap requests.",
      "For normal visual requests, call this directly after codemap_collect_context and generated structure preparation; do not force persistence first.",
      "When generating a fresh UI, prefer widget_code as raw HTML fragment (no DOCTYPE/html/body) so the window can stream progressively.",
      "If you already have a structured CodeMap object but no widget fragment, you may pass codemap directly; the tool will auto-convert it into a widget-first fragment before falling back to full HTML.",
      "Treat standalone full HTML as a fallback, not the preferred output shape for fresh visual requests.",
      "Commands are only fallback/debug paths. Prefer tool-driven visualization for normal user requests.",
    ],
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Path to CodeMap JSON / index.json / HTML" })),
      id: Type.Optional(Type.String({ description: "Optional id/title when path is an index.json" })),
      codemap: Type.Optional(Type.Any({ description: "Optional structured CodeMap document. Use when you already have the object and want a fallback direct visual render." })),
      html: Type.Optional(Type.String({ description: "Optional standalone HTML to open directly" })),
      widget_code: Type.Optional(Type.String({ description: "Optional HTML fragment for progressive streaming render. Prefer this for fresh generated UI." })),
      title: Type.Optional(Type.String({ description: "Window title override" })),
      width: Type.Optional(Type.Number({ description: "Window width", default: 1360 })),
      height: Type.Optional(Type.Number({ description: "Window height", default: 920 })),
      floating: Type.Optional(Type.Boolean({ description: "Keep window always on top", default: false })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const title = params.title ?? params.codemap?.title ?? "CodeMap";
      let html = params.widget_code ?? params.html;
      let widgetCode = params.widget_code;
      let sourcePath = params.path ?? "inline-html";

      if (!html && params.codemap) {
        widgetCode = buildCodeMapWidgetCode(params.codemap as CodeMapDocument, sourcePath);
        html = buildCodeMapHtml(params.codemap as CodeMapDocument, sourcePath);
      }

      if (!html) {
        const resolved = await buildResolvedCodeMap(params.path, ctx.cwd, params.id);
        html = resolved.html;
        sourcePath = resolved.sourcePath;
      }

      if (widgetCode) {
        await finalizeStreamingWidget(widgetCode);
        const state = consumeStreamingWindow();
        if (state?.window) {
          return {
            content: [{ type: "text", text: `Opened progressive CodeMap widget: ${title}` }],
            details: {
              mode: "progressive_native_window",
              title,
              sourcePath,
              width: params.width ?? state.width,
              height: params.height ?? state.height,
            },
          };
        }
      }

      const window = await openHtmlWindow({
        title: `CodeMap · ${title}`,
        html,
        width: params.width ?? 1360,
        height: params.height ?? 920,
        floating: params.floating ?? false,
      });

      if (!window) {
        return {
          content: [{ type: "text", text: `Current platform has no native Glimpse window support. HTML prepared for ${title}.` }],
          details: { mode: "no_native_window", title, sourcePath },
        };
      }

      return {
        content: [{ type: "text", text: `Opened CodeMap window: ${title}` }],
        details: { mode: "native_window", title, sourcePath },
      };
    },
  });
}
