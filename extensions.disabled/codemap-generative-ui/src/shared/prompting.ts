export interface PortalLocationPayload {
  id?: string;
  title?: string;
  path?: string;
  line?: string;
  description?: string;
  traceId?: string;
  traceTitle?: string;
}

export function buildWebGeneratePrompt(input: {
  query: string;
  roots?: string[];
  saveBaseName?: string;
}) {
  const rootsText = (input.roots ?? []).length > 0
    ? (input.roots ?? []).map((item) => `- ${item}`).join("\n")
    : "- 当前工作目录";

  const saveHint = input.saveBaseName
    ? `保存文件基名建议：${input.saveBaseName}`
    : "如需要落盘，按合适文件名保存到 docs/.codemap/codemaps/ 和 docs/backend/";

  return [
    "请为下面需求生成 CodeMap 可视化结果。",
    "",
    `需求：${input.query}`,
    "",
    "请优先按以下流程执行：",
    "1. 调用 codemap_read_me 读取生成规范",
    "2. 调用 codemap_collect_context 收集上下文",
    "3. 基于上下文生成完整 CodeMap 结构",
    "4. 调用 codemap_render_html 生成并保存 JSON + HTML",
    "5. 如用户明确需要窗口预览，再调用 codemap_show_widget",
    "",
    "搜索根目录：",
    rootsText,
    "",
    saveHint,
    "",
    "输出目标：要有结构化 CodeMap、可读 HTML、关键链路 trace。",
  ].join("\n");
}

export function buildLocationAnalyzePrompt(location: PortalLocationPayload) {
  return [
    "继续深挖下面这个 CodeMap 定位点：",
    `- 定位点标题：${location.title ?? "(unknown)"}`,
    `- Trace：${location.traceTitle ?? location.traceId ?? "(unknown)"}`,
    `- 路径：${location.path ?? "(unknown)"}`,
    `- 代码：${location.line ?? "(none)"}`,
    `- 说明：${location.description ?? "(none)"}`,
    "",
    "请基于这个定位点继续：",
    "1. 追踪它所在方法/类的真实职责",
    "2. 向上找入口，向下找调用收口",
    "3. 如有必要，补充新的 trace 或修正现有 trace",
    "4. 输出结构化分析，不要只泛泛而谈",
  ].join("\n");
}

export function buildTraceRefinePrompt(input: {
  location: PortalLocationPayload;
  sourcePath?: string;
  historyId?: string;
}) {
  const location = input.location;
  const sourceLine = input.sourcePath
    ? `- 当前 CodeMap 来源：${input.sourcePath}`
    : "- 当前 CodeMap 来源：未知（请先判断是否需要重新生成）";
  const historyLine = input.historyId
    ? `- Portal 历史记录：${input.historyId}`
    : "- Portal 历史记录：无";

  return [
    "请基于下面定位点，对现有 CodeMap 做一次增量修正。",
    "",
    sourceLine,
    historyLine,
    `- 定位点标题：${location.title ?? "(unknown)"}`,
    `- Trace：${location.traceTitle ?? location.traceId ?? "(unknown)"}`,
    `- 路径：${location.path ?? "(unknown)"}`,
    `- 代码：${location.line ?? "(none)"}`,
    `- 说明：${location.description ?? "(none)"}`,
    "",
    "请按这个顺序执行：",
    "1. 调用 codemap_read_me 重新确认规范",
    "2. 调用 codemap_collect_context，重点围绕该定位点所在文件、调用入口、调用收口补充上下文",
    "3. 判断现有 trace 是否缺失、命名不准、层级不清，必要时新增或重写 trace",
    "4. 生成修正版 CodeMap 文档",
    "5. 调用 codemap_render_html，把结果重新落盘；如果已知来源路径，则优先覆盖或对齐该来源路径",
    "6. 如有必要，再调用 codemap_show_widget 做预览",
    "",
    "输出目标：不是简单补一句说明，而是对 CodeMap 结构进行真实修正，并产出新的 JSON + HTML。",
  ].join("\n");
}
