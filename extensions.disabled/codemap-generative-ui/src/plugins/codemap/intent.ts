import type { SemanticRouteMatch } from "../../shared/module.ts";

const CODEMAP_INTENT = /(codemap|调用链|链路|流程图|状态机|架构图|可视化|mermaid|trace|时序图|全链路|深度扫描)/i;
const PERSIST_INTENT = /(保存|落盘|导出|下载|输出文件|生成文件|写入文件|保存成|export|save|persist|artifact)/i;

export function matchCodemapPrompt(prompt: string): SemanticRouteMatch | null {
  if (!CODEMAP_INTENT.test(prompt)) {
    return null;
  }

  const wantsPersistence = PERSIST_INTENT.test(prompt);
  const flowLines = wantsPersistence
    ? [
        "Preferred tool flow for requests that need saved/exportable artifacts:",
        "1. codemap_read_me",
        "2. codemap_collect_context",
        "3. codemap_show_widget with widget_code for the first visual preview",
        "4. codemap_render_html with persist=true only after the structure looks good or when the user explicitly asked to save/export",
      ]
    : [
        "Preferred tool flow for normal visual-only requests:",
        "1. codemap_read_me",
        "2. codemap_collect_context",
        "3. codemap_show_widget with widget_code for progressive HTML streaming",
        "4. Do not call codemap_render_html unless persistence becomes necessary later",
      ];

  return {
    appendSystemPrompt: [
      "[codemap-generative-ui hint]",
      "The user likely wants a CodeMap/diagram style workflow.",
      "Do not tell the user to run slash commands unless they explicitly ask for debug/ops help.",
      "Use tools directly.",
      ...flowLines,
      "Prefer widget_code fragments over full standalone HTML whenever you are producing a fresh visual result.",
      "Favor real file paths and concrete trace locations over abstract summaries.",
    ].join("\n"),
  };
}
