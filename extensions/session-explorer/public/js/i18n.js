/**
 * Every visible string lives here. Markup and view code carry no copy.
 *
 * Values may be a string or a function of one argument, used for counts and
 * interpolation. Missing keys fall back to the key itself, which makes an
 * omission obvious in the UI instead of silently blank.
 */

const STORAGE_KEY = "session-explorer-locale";

const zh = {
  "search.placeholder": "搜索会话与消息…",
  "search.clear": "清除搜索",
  "search.scope.all": "全部",
  "search.scope.user": "我的消息",
  "search.scope.assistant": "回复",
  "search.scope.thinking": "思考",

  "filters.range": "时间范围",
  "filters.sort": "排序",
  "filters.projects": "项目",
  "filters.clear": "清除",
  "filters.projectPlaceholder": "筛选项目…",

  "range.24h": "24 小时",
  "range.7d": "7 天",
  "range.30d": "30 天",
  "range.90d": "90 天",
  "range.all": "全部",

  "sort.recent": "最近",
  "sort.oldest": "最早",
  "sort.messages": "消息数",
  "sort.cost": "花费",
  "sort.tokens": "Token",

  "results.sessions": "会话",
  "results.searchTitle": "搜索结果",
  "results.count": (n) => `${n.toLocaleString("en-US")} 个会话`,
  "results.hitCount": (n) => `${n.toLocaleString("en-US")} 条消息`,
  "results.took": (ms) => `${ms} ms`,
  "results.matchedSessions": "标题匹配",
  "results.matchedMessages": "消息匹配",
  "results.loadMore": "加载更多",
  "results.loading": "加载中…",
  "results.empty": "没有匹配的会话",
  "results.emptyHint": "试试更短的关键词，或放宽时间范围。",
  "results.searchEmpty": "没有找到匹配的消息",
  "results.untitled": "未命名会话",

  "reader.empty": "选择一个会话开始阅读",
  "reader.emptyHint": "按 / 搜索，按 j / k 在列表中移动。",
  "reader.loading": "正在解析转录…",
  "reader.back": "返回列表",
  "reader.outline": "提问",
  "reader.copyPath": "复制路径",
  "reader.copyText": "复制内容",
  "reader.copied": "已复制到剪贴板",
  "reader.copyFailed": "复制失败",
  "reader.loadMore": (n) => `继续加载（还有 ${n.toLocaleString("en-US")} 条）`,

  "stats.messages": "消息",
  "stats.tools": "工具调用",
  "stats.errors": "工具错误",
  "stats.thinking": "思考",
  "stats.tokens": "Token",
  "stats.cost": "花费",
  "stats.duration": "时长",
  "stats.model": "模型",
  "stats.compactions": "压缩",

  "role.user": "我",
  "role.assistant": "助手",
  "role.thinking": "思考",

  "block.thinking": "思考过程",
  "block.toolResult": "输出",
  "block.arguments": "参数",
  "block.error": "错误",
  "block.image": "图片",
  "block.images": (n) => `${n} 张图片`,
  "block.truncated": (n) => `内容已截断，原文共 ${n} 字符`,
  "block.noOutput": "无输出",

  "source.codexHint": "由 Codex 记录的会话，Pi 的索引同样覆盖",

  "event.compaction": "上下文压缩",
  "event.branchSummary": "分支摘要",
  "event.label": "标记",
  "event.modelChange": "切换模型",
  "event.sessionInfo": "会话命名",
  "event.custom": "扩展消息",

  "status.indexed": (s, m) =>
    `已索引 ${s.toLocaleString("en-US")} 个会话 · ${m.toLocaleString("en-US")} 条消息`,
  "status.indexMissing": "Pi 会话索引不可用",
  "status.offline": "无法连接到服务",

  "error.title": "出错了",
  "error.retry": "重试",

  "theme.light": "浅色主题",
  "theme.dark": "深色主题",
  "theme.system": "跟随系统",
  "locale.toggle": "切换语言",
  "menu.toggle": "筛选",
};

const en = {
  "search.placeholder": "Search sessions and messages…",
  "search.clear": "Clear search",
  "search.scope.all": "All",
  "search.scope.user": "My messages",
  "search.scope.assistant": "Replies",
  "search.scope.thinking": "Thinking",

  "filters.range": "Time range",
  "filters.sort": "Sort",
  "filters.projects": "Projects",
  "filters.clear": "Clear",
  "filters.projectPlaceholder": "Filter projects…",

  "range.24h": "24 hours",
  "range.7d": "7 days",
  "range.30d": "30 days",
  "range.90d": "90 days",
  "range.all": "All time",

  "sort.recent": "Recent",
  "sort.oldest": "Oldest",
  "sort.messages": "Messages",
  "sort.cost": "Cost",
  "sort.tokens": "Tokens",

  "results.sessions": "Sessions",
  "results.searchTitle": "Search results",
  "results.count": (n) => `${n.toLocaleString("en-US")} sessions`,
  "results.hitCount": (n) => `${n.toLocaleString("en-US")} messages`,
  "results.took": (ms) => `${ms} ms`,
  "results.matchedSessions": "Matching titles",
  "results.matchedMessages": "Matching messages",
  "results.loadMore": "Load more",
  "results.loading": "Loading…",
  "results.empty": "No sessions match",
  "results.emptyHint": "Try a shorter term, or widen the time range.",
  "results.searchEmpty": "No messages found",
  "results.untitled": "Untitled session",

  "reader.empty": "Pick a session to read",
  "reader.emptyHint": "Press / to search, j / k to move through the list.",
  "reader.loading": "Parsing transcript…",
  "reader.back": "Back to list",
  "reader.outline": "Prompts",
  "reader.copyPath": "Copy path",
  "reader.copyText": "Copy text",
  "reader.copied": "Copied to clipboard",
  "reader.copyFailed": "Could not copy",
  "reader.loadMore": (n) => `Load more (${n.toLocaleString("en-US")} remaining)`,

  "stats.messages": "Messages",
  "stats.tools": "Tool calls",
  "stats.errors": "Tool errors",
  "stats.thinking": "Thinking",
  "stats.tokens": "Tokens",
  "stats.cost": "Cost",
  "stats.duration": "Duration",
  "stats.model": "Model",
  "stats.compactions": "Compactions",

  "role.user": "You",
  "role.assistant": "Assistant",
  "role.thinking": "Thinking",

  "block.thinking": "Thinking",
  "block.toolResult": "Output",
  "block.arguments": "Arguments",
  "block.error": "Error",
  "block.image": "Image",
  "block.images": (n) => `${n} image${n === 1 ? "" : "s"}`,
  "block.truncated": (n) => `Truncated — ${n} characters in the original`,
  "block.noOutput": "No output",

  "source.codexHint": "Recorded by Codex; Pi's index covers these too",

  "event.compaction": "Context compacted",
  "event.branchSummary": "Branch summary",
  "event.label": "Label",
  "event.modelChange": "Model changed",
  "event.sessionInfo": "Session named",
  "event.custom": "Extension message",

  "status.indexed": (s, m) =>
    `${s.toLocaleString("en-US")} sessions · ${m.toLocaleString("en-US")} messages indexed`,
  "status.indexMissing": "Pi session index unavailable",
  "status.offline": "Cannot reach the server",

  "error.title": "Something went wrong",
  "error.retry": "Retry",

  "theme.light": "Light theme",
  "theme.dark": "Dark theme",
  "theme.system": "Match system",
  "locale.toggle": "Switch language",
  "menu.toggle": "Filters",
};

const DICTIONARIES = { zh, en };

/** Chinese unless the browser says otherwise; the choice persists. */
function detect() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let current = detect();

export function locale() {
  return current;
}

export function setLocale(next) {
  current = next === "zh" ? "zh" : "en";
  localStorage.setItem(STORAGE_KEY, current);
  document.documentElement.lang = current;
}

export function toggleLocale() {
  setLocale(current === "zh" ? "en" : "zh");
  return current;
}

/** Look up a key; functions are called with the remaining arguments. */
export function t(key, ...args) {
  const value = DICTIONARIES[current][key];
  if (value === undefined) return key;
  return typeof value === "function" ? value(...args) : value;
}

/** Apply translations to any element carrying `data-i18n`. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
}

document.documentElement.lang = current;
