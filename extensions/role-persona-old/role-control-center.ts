import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { config, saveConfigPatch, type DeepPartial, type RolePersonaConfig } from "./config.ts";
import {
  getPendingMemories,
  loadHighPriorityMemories,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
  readRoleMemory,
} from "./memory-md.ts";
import { RoleMemoryViewerComponent } from "./memory-viewer.ts";
import {
  createRole,
  DEFAULT_ROLE,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  loadRoleConfig,
  loadRolePrompts,
  resolveRoleForCwd,
  ROLES_DIR,
  saveRoleConfig,
} from "./role-store.ts";

type NoticeType = "info" | "success" | "warning" | "error";

type ConfigFieldKind = "boolean" | "number" | "text" | "secret" | "select" | "json" | "json-or-text";

interface ConfigField {
  label: string;
  path: string;
  kind: ConfigFieldKind;
  choices?: string[];
  min?: number;
  max?: number;
  description?: string;
}

interface ConfigSection {
  label: string;
  fields: ConfigField[];
}

type RoleControlAction = "status" | "map" | "create" | "default" | "disable" | "injection" | "memories" | "config" | "close";

const ROLE_CONTROL_ACTIONS: Array<{ value: RoleControlAction; label: string; description: string }> = [
  { value: "status", label: "查看角色状态与映射", description: "当前角色、来源、记忆数量和目录映射" },
  { value: "map", label: "切换/映射当前目录角色", description: "选择一个角色并立即激活" },
  { value: "create", label: "创建角色", description: "创建新的独立角色目录，可立即映射" },
  { value: "default", label: "设置默认角色", description: "未命中目录映射时使用的角色" },
  { value: "disable", label: "当前目录禁用角色", description: "阻止继承父目录映射与默认角色" },
  { value: "injection", label: "查看当前实际注入内容", description: "Core prompt、长期/高优先级/Daily 记忆" },
  { value: "memories", label: "查看当前角色记忆", description: "打开可滚动的角色记忆查看器" },
  { value: "config", label: "配置全部角色/记忆选项", description: "编辑自动记忆、召回、向量、日志等配置" },
  { value: "close", label: "关闭控制中心", description: "返回当前会话" },
];

export interface RoleControlCenterOptions {
  ctx: any;
  cwd: string;
  extensionDir?: string;
  getCurrentRole: () => string | null;
  getCurrentRolePath: () => string | null;
  activateRole: (roleName: string, rolePath: string) => Promise<void>;
  clearRole: () => void;
  notify: (message: string, type?: NoticeType) => void;
}

const CONFIG_SECTIONS: ConfigSection[] = [
  {
    label: "自动记忆",
    fields: [
      { label: "启用自动记忆", path: "autoMemory.enabled", kind: "boolean" },
      { label: "提取模型", path: "autoMemory.model", kind: "json-or-text", description: "单个 provider/model 或 JSON 数组" },
      { label: "标签模型", path: "autoMemory.tagModel", kind: "text", description: "留空表示继承提取模型" },
      { label: "预留 Token", path: "autoMemory.reserveTokens", kind: "number", min: 512 },
      { label: "单次最大条目", path: "autoMemory.maxItems", kind: "number", min: 1, max: 50 },
      { label: "单条最大字符", path: "autoMemory.maxText", kind: "number", min: 20, max: 4000 },
      { label: "批处理轮次", path: "autoMemory.batchTurns", kind: "number", min: 1 },
      { label: "最少轮次", path: "autoMemory.minTurns", kind: "number", min: 1 },
      { label: "检查间隔毫秒", path: "autoMemory.intervalMs", kind: "number", min: 1000 },
      { label: "上下文重叠轮次", path: "autoMemory.contextOverlap", kind: "number", min: 0 },
    ],
  },
  {
    label: "记忆注入与搜索",
    fields: [
      { label: "注入 Daily Memory", path: "memory.dailyInjection.enabled", kind: "boolean" },
      { label: "启用 Daily Summary", path: "memory.dailySummary.enabled", kind: "boolean" },
      { label: "近期天数", path: "memory.dailySummary.recentDays", kind: "number", min: 1, max: 30 },
      { label: "自动生成 Daily Summary", path: "memory.dailySummary.autoGenerate", kind: "boolean" },
      { label: "启用按需搜索", path: "memory.onDemandSearch.enabled", kind: "boolean" },
      { label: "按需最大结果", path: "memory.onDemandSearch.maxResults", kind: "number", min: 1, max: 100 },
      { label: "按需最低分数", path: "memory.onDemandSearch.minScore", kind: "number", min: 0, max: 1 },
      { label: "始终加载高优先级", path: "memory.onDemandSearch.alwaysLoadHighPriority", kind: "boolean" },
      { label: "默认搜索结果数", path: "memory.searchDefaults.maxResults", kind: "number", min: 1, max: 100 },
      { label: "默认搜索最低分数", path: "memory.searchDefaults.minScore", kind: "number", min: 0, max: 1 },
      { label: "搜索包含 Daily", path: "memory.searchDefaults.includeDailyMemory", kind: "boolean" },
      { label: "去重阈值", path: "memory.dedupeThreshold", kind: "number", min: 0, max: 1 },
      { label: "默认分类", path: "memory.defaultCategories", kind: "json", description: "JSON 字符串数组" },
      { label: "Daily 路径模板", path: "memory.dailyPathTemplate", kind: "text" },
    ],
  },
  {
    label: "向量记忆",
    fields: [
      { label: "启用向量记忆", path: "vectorMemory.enabled", kind: "boolean" },
      { label: "Provider", path: "vectorMemory.provider", kind: "select", choices: ["openai", "local", "minilm-direct", "minilm-daemon"] },
      { label: "Embedding 模型", path: "vectorMemory.model", kind: "text" },
      { label: "Base URL", path: "vectorMemory.baseUrl", kind: "text" },
      { label: "API Key", path: "vectorMemory.apiKey", kind: "secret", description: "输入 <clear> 清除；当前值不会显示" },
      { label: "自动召回", path: "vectorMemory.autoRecall", kind: "boolean" },
      { label: "自动索引", path: "vectorMemory.autoIndex", kind: "boolean" },
      { label: "混合搜索", path: "vectorMemory.hybridSearch", kind: "boolean" },
      { label: "召回数量", path: "vectorMemory.recallLimit", kind: "number", min: 1, max: 100 },
      { label: "召回最低分数", path: "vectorMemory.recallMinScore", kind: "number", min: 0, max: 1 },
      { label: "向量权重", path: "vectorMemory.vectorWeight", kind: "number", min: 0, max: 10 },
      { label: "数据库路径", path: "vectorMemory.dbPath", kind: "text" },
      { label: "MiniLM 配置", path: "vectorMemory.minilm", kind: "json", description: "JSON 对象" },
    ],
  },
  {
    label: "外部只读与知识",
    fields: [
      { label: "启用外部只读记忆", path: "externalReadonly.enabled", kind: "boolean" },
      { label: "外部服务 URL", path: "externalReadonly.baseUrl", kind: "text" },
      { label: "外部服务 Token", path: "externalReadonly.token", kind: "secret", description: "输入 <clear> 清除；当前值不会显示" },
      { label: "超时毫秒", path: "externalReadonly.timeoutMs", kind: "number", min: 100 },
      { label: "Top K", path: "externalReadonly.topK", kind: "number", min: 1, max: 100 },
      { label: "Experience Limit", path: "externalReadonly.experienceLimit", kind: "number", min: 1, max: 100 },
      { label: "最低置信度", path: "externalReadonly.minConfidence", kind: "number", min: 0, max: 1 },
      { label: "启用知识系统", path: "knowledge.enabled", kind: "boolean" },
      { label: "知识向量表", path: "knowledge.vectorTable", kind: "text" },
      { label: "知识最大结果", path: "knowledge.search.maxResults", kind: "number", min: 1, max: 100 },
      { label: "知识最低分数", path: "knowledge.search.minScore", kind: "number", min: 0, max: 1 },
      { label: "角色知识加权", path: "knowledge.search.roleBoost", kind: "number", min: 0, max: 10 },
      { label: "外部知识源", path: "knowledge.externalSources", kind: "json", description: "JSON 数组" },
    ],
  },
  {
    label: "日志、界面与高级",
    fields: [
      { label: "启用日志", path: "logging.enabled", kind: "boolean" },
      { label: "日志级别", path: "logging.level", kind: "select", choices: ["debug", "info", "warn", "error"] },
      { label: "日志保留天数", path: "logging.retentionDays", kind: "number", min: 1, max: 3650 },
      { label: "Spinner 间隔毫秒", path: "ui.spinnerIntervalMs", kind: "number", min: 20 },
      { label: "Spinner 帧", path: "ui.spinnerFrames", kind: "json", description: "JSON 字符串数组" },
      { label: "记忆查看器默认过滤", path: "ui.viewerDefaultFilter", kind: "select", choices: ["all", "learnings", "preferences", "events"] },
      { label: "关闭 Flush 超时", path: "advanced.shutdownFlushTimeoutMs", kind: "number", min: 100 },
      { label: "强制提取关键词", path: "advanced.forceKeywords", kind: "text" },
      { label: "进化提醒轮次", path: "advanced.evolutionReminderTurns", kind: "number", min: 1 },
      { label: "角色存储目录", path: "storage.rolesDir", kind: "text", description: "修改后需 reload/restart" },
    ],
  },
];

class RoleControlCenterComponent {
  private selectedIndex = 0;
  private disposed = false;

  constructor(
    private options: RoleControlCenterOptions,
    private tui: any,
    private theme: any,
    private done: (action?: RoleControlAction) => void,
  ) {}

  private close(action?: RoleControlAction): void {
    if (this.disposed) return;
    this.disposed = true;
    this.done(action);
  }

  handleInput(data: string): void {
    if (this.disposed) return;
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.close(undefined);
      return;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = (this.selectedIndex - 1 + ROLE_CONTROL_ACTIONS.length) % ROLE_CONTROL_ACTIONS.length;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = (this.selectedIndex + 1) % ROLE_CONTROL_ACTIONS.length;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.home) || data === "g") {
      this.selectedIndex = 0;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.end) || data === "G") {
      this.selectedIndex = ROLE_CONTROL_ACTIONS.length - 1;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.close(ROLE_CONTROL_ACTIONS[this.selectedIndex]?.value);
    }
  }

  render(width: number): string[] {
    const inner = Math.max(1, width - 2);
    const border = (text: string) => this.theme.fg("border", text);
    const accent = (text: string) => this.theme.fg("accent", text);
    const text = (value: string) => this.theme.fg("text", value);
    const muted = (value: string) => this.theme.fg("muted", value);
    const dim = (value: string) => this.theme.fg("dim", value);
    const row = (content = "") => {
      const fitted = truncateToWidth(content, inner, "…", true);
      return border("│") + fitted + " ".repeat(Math.max(0, inner - visibleWidth(fitted))) + border("│");
    };
    const divider = () => border("├" + "─".repeat(inner) + "┤");

    const roleConfig = loadRoleConfig();
    const resolution = resolveRoleForCwd(this.options.cwd, roleConfig);
    const activeRole = this.options.getCurrentRole() || resolution.role;
    const activePath = this.options.getCurrentRolePath() || (activeRole ? join(ROLES_DIR, activeRole) : null);
    const identity = activePath && existsSync(activePath) ? getRoleIdentity(activePath) : null;
    const memory = activePath && activeRole && existsSync(activePath) ? readRoleMemory(activePath, activeRole) : null;
    const pendingCount = activePath && existsSync(activePath)
      ? getPendingMemories(activePath).filter((item) => !item.discarded).length
      : 0;

    const title = " 角色控制中心 ";
    const left = Math.max(0, Math.floor((inner - visibleWidth(title)) / 2));
    const right = Math.max(0, inner - visibleWidth(title) - left);
    const lines = [border("╭" + "─".repeat(left)) + accent(this.theme.bold(title)) + border("─".repeat(right) + "╮")];

    lines.push(row(` ${accent("当前角色")}  ${text(activeRole || "无")} ${identity?.name ? muted(`· ${identity.name}`) : ""}`));
    lines.push(row(` ${accent("解析来源")}  ${text(resolution.source)}${resolution.matchedPath ? muted(` · ${resolution.matchedPath}`) : ""}`));
    lines.push(row(` ${accent("当前目录")}  ${muted(this.options.cwd)}`));
    lines.push(row(` ${accent("记忆概览")}  ${text(`${memory?.learnings.length || 0} learnings · ${memory?.preferences.length || 0} preferences · ${memory?.events.length || 0} events · ${pendingCount} pending`)}`));
    lines.push(divider());

    ROLE_CONTROL_ACTIONS.forEach((action, index) => {
      const selected = index === this.selectedIndex;
      const prefix = selected ? accent("❯ ") : "  ";
      const label = selected ? accent(this.theme.bold(action.label)) : text(action.label);
      const description = selected ? muted(` — ${action.description}`) : dim(` — ${action.description}`);
      lines.push(row(`${prefix}${label}${description}`));
    });

    lines.push(divider());
    lines.push(row(dim(" ↑↓ / j k 选择 · Enter 执行 · g/G 首尾 · Esc 关闭")));
    lines.push(border("╰" + "─".repeat(inner) + "╯"));
    return lines;
  }

  invalidate(): void {}
}

class MarkdownOverlay {
  private md: Markdown;
  private lines: string[] = [];
  private lastWidth = 0;
  private scrollOffset = 0;
  private disposed = false;

  constructor(
    content: string,
    private title: string,
    private tui: any,
    private theme: any,
    private done: () => void,
  ) {
    this.md = new Markdown(content, 1, 0, getMarkdownTheme());
  }

  private visibleLines(): number {
    return Math.max(1, (process.stdout.rows || 40) - 8);
  }

  handleInput(data: string): void {
    if (this.disposed) return;
    const visible = this.visibleLines();
    const page = Math.max(1, visible - 2);
    const max = Math.max(0, this.lines.length - visible);
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.disposed = true;
      this.done();
    } else if (matchesKey(data, Key.up) || data === "k") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    } else if (matchesKey(data, Key.down) || data === "j") {
      this.scrollOffset = Math.min(max, this.scrollOffset + 1);
    } else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
      this.scrollOffset = Math.max(0, this.scrollOffset - page);
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
      this.scrollOffset = Math.min(max, this.scrollOffset + page);
    } else if (matchesKey(data, Key.home) || data === "g") {
      this.scrollOffset = 0;
    } else if (matchesKey(data, Key.end) || data === "G") {
      this.scrollOffset = max;
    } else {
      return;
    }
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const inner = Math.max(1, width - 2);
    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.lines = this.md.render(inner);
    }
    const visible = this.visibleLines();
    const max = Math.max(0, this.lines.length - visible);
    this.scrollOffset = Math.min(this.scrollOffset, max);

    const border = (s: string) => this.theme.fg("border", s);
    const accent = (s: string) => this.theme.fg("accent", s);
    const dim = (s: string) => this.theme.fg("dim", s);
    const title = ` ${this.title} `;
    const titleWidth = visibleWidth(title);
    const left = Math.max(0, Math.floor((inner - titleWidth) / 2));
    const right = Math.max(0, inner - titleWidth - left);
    const result = [border("╭" + "─".repeat(left)) + accent(title) + border("─".repeat(right) + "╮")];

    for (const line of this.lines.slice(this.scrollOffset, this.scrollOffset + visible)) {
      result.push(border("│") + truncateToWidth(line, inner, "…", true) + border("│"));
    }
    while (result.length < visible + 1) {
      result.push(border("│") + " ".repeat(inner) + border("│"));
    }
    result.push(border("├") + border("─".repeat(inner)) + border("┤"));
    result.push(border("│") + truncateToWidth(dim(` ↑↓/jk 滚动 · PgUp/PgDn 翻页 · Esc 关闭 · ${this.scrollOffset + 1}/${Math.max(1, this.lines.length)}`), inner, "", true) + border("│"));
    result.push(border("╰") + border("─".repeat(inner)) + border("╯"));
    return result;
  }

  invalidate(): void {
    this.lastWidth = 0;
    this.md.invalidate();
  }
}

function normalizePath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized || path;
}

function getAtPath(source: any, path: string): any {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function patchAtPath(path: string, value: unknown): DeepPartial<RolePersonaConfig> {
  const root: Record<string, any> = {};
  let cursor = root;
  const parts = path.split(".");
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else cursor = cursor[part] = {};
  });
  return root as DeepPartial<RolePersonaConfig>;
}

function formatValue(field: ConfigField, value: any): string {
  if (field.kind === "secret") return value ? "<已设置>" : "<未设置>";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (typeof value === "string") return value.length > 42 ? `${value.slice(0, 39)}…` : value || "<空>";
  const text = JSON.stringify(value) ?? "<未设置>";
  return text.length > 42 ? `${text.slice(0, 39)}…` : text;
}

async function choose(ctx: any, title: string, entries: Array<{ label: string; value: string }>): Promise<string | undefined> {
  const selected = await ctx.ui.select(title, entries.map((entry) => entry.label));
  return entries.find((entry) => entry.label === selected)?.value;
}

async function openControlCenterMenu(options: RoleControlCenterOptions): Promise<RoleControlAction | undefined> {
  const action = await options.ctx.ui.custom(
    (tui: any, theme: any, _kb: any, done: (value?: RoleControlAction) => void) =>
      new RoleControlCenterComponent(options, tui, theme, done),
    { overlay: true, overlayOptions: { anchor: "center", width: "88%", minWidth: 68, maxHeight: "96%" } },
  );
  return action as RoleControlAction | undefined;
}

async function showMarkdown(ctx: any, title: string, content: string): Promise<void> {
  await ctx.ui.custom(
    (tui: any, theme: any, _kb: any, done: () => void) => new MarkdownOverlay(content, title, tui, theme, done),
    { overlay: true, overlayOptions: { anchor: "center", width: "92%", minWidth: 64, maxHeight: "95%" } },
  );
}

async function editConfigField(options: RoleControlCenterOptions, field: ConfigField): Promise<void> {
  const current = getAtPath(config, field.path);
  let next: unknown;

  if (field.kind === "boolean") {
    next = !current;
  } else if (field.kind === "select") {
    const selected = await choose(options.ctx, field.label, (field.choices || []).map((value) => ({ label: value, value })));
    if (selected === undefined) return;
    next = selected;
  } else {
    const currentText = field.kind === "secret" ? "" : typeof current === "string" ? current : JSON.stringify(current);
    const hint = field.description ? `${field.description}；当前: ${field.kind === "secret" ? "<隐藏>" : currentText}` : `当前: ${currentText}`;
    const input = await options.ctx.ui.input(field.label, hint);
    if (input === undefined || input === null) return;
    const trimmed = String(input).trim();
    if (!trimmed) {
      if (field.kind === "text" && field.path === "autoMemory.tagModel") {
        next = null;
      } else {
        return;
      }
    }

    if (next === null) {
      // Nullable text fields use an empty input to clear the persisted value.
    } else if (field.kind === "number") {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || (field.min !== undefined && parsed < field.min) || (field.max !== undefined && parsed > field.max)) {
        options.notify(`无效数值：${trimmed}`, "warning");
        return;
      }
      next = parsed;
    } else if (field.kind === "json") {
      try {
        next = JSON.parse(trimmed);
      } catch (error) {
        options.notify(`JSON 解析失败：${error}`, "error");
        return;
      }
    } else if (field.kind === "json-or-text") {
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          next = JSON.parse(trimmed);
        } catch (error) {
          options.notify(`JSON 解析失败：${error}`, "error");
          return;
        }
      } else {
        next = trimmed;
      }
    } else if (field.kind === "secret") {
      next = trimmed === "<clear>" ? null : trimmed;
    } else {
      next = trimmed;
    }
  }

  saveConfigPatch(patchAtPath(field.path, next), options.extensionDir);
  options.notify(`已保存 ${field.label}：${formatValue(field, getAtPath(config, field.path))}。部分启动期设置需 /reload 或重启生效。`, "success");
}

async function openConfigEditor(options: RoleControlCenterOptions): Promise<void> {
  while (true) {
    const section = await choose(options.ctx, "角色系统配置", [
      ...CONFIG_SECTIONS.map((item, index) => ({ label: `⚙ ${item.label}`, value: String(index) })),
      { label: "← 返回角色控制中心", value: "back" },
    ]);
    if (!section || section === "back") return;

    const selectedSection = CONFIG_SECTIONS[Number(section)];
    while (true) {
      const fieldPath = await choose(options.ctx, selectedSection.label, [
        ...selectedSection.fields.map((field) => ({
          label: `${field.label}  ·  ${formatValue(field, getAtPath(config, field.path))}`,
          value: field.path,
        })),
        { label: "← 返回配置分类", value: "back" },
      ]);
      if (!fieldPath || fieldPath === "back") break;
      const field = selectedSection.fields.find((item) => item.path === fieldPath);
      if (field) await editConfigField(options, field);
    }
  }
}

async function showStatus(options: RoleControlCenterOptions): Promise<void> {
  const roleConfig = loadRoleConfig();
  const resolution = resolveRoleForCwd(options.cwd, roleConfig);
  const roleName = options.getCurrentRole() || resolution.role;
  const rolePath = options.getCurrentRolePath() || (roleName ? join(ROLES_DIR, roleName) : null);
  const identity = rolePath && existsSync(rolePath) ? getRoleIdentity(rolePath) : null;
  const memory = rolePath && roleName && existsSync(rolePath) ? readRoleMemory(rolePath, roleName) : null;
  const pending = rolePath && existsSync(rolePath) ? getPendingMemories(rolePath).filter((item) => !item.discarded) : [];

  const mappings = Object.entries(roleConfig.mappings || {}).map(([path, role]) => `- \`${normalizePath(path)}\` → **${role}**`).join("\n") || "- 无";
  const text = `# 角色控制中心状态

- **当前目录**：\`${options.cwd}\`
- **生效角色**：${roleName || "无"}
- **显示名称**：${identity?.name || "未设置"}
- **解析来源**：${resolution.source}${resolution.matchedPath ? `（${resolution.matchedPath}）` : ""}
- **默认角色**：${roleConfig.defaultRole || DEFAULT_ROLE}
- **首次运行**：${rolePath && existsSync(rolePath) && isFirstRun(rolePath) ? "是" : "否"}

## 记忆概览

- Learnings：${memory?.learnings.length || 0}
- Preferences：${memory?.preferences.length || 0}
- Events：${memory?.events.length || 0}
- Pending：${pending.length}

## 当前注入开关

- 自动记忆：${config.autoMemory.enabled ? "开启" : "关闭"}
- 按需搜索：${config.memory.onDemandSearch.enabled ? "开启" : "关闭"}
- Daily 注入：${config.memory.dailyInjection.enabled ? "开启" : "关闭"}
- Daily Summary：${config.memory.dailySummary.enabled ? "开启" : "关闭"}
- 向量召回：${config.vectorMemory.enabled && config.vectorMemory.autoRecall ? "开启" : "关闭"}
- 外部只读：${config.externalReadonly.enabled ? "开启" : "关闭"}
- 知识系统：${config.knowledge.enabled ? "开启" : "关闭"}

## 目录映射

${mappings}`;
  await showMarkdown(options.ctx, "角色状态", text);
}

async function showInjectionPreview(options: RoleControlCenterOptions): Promise<void> {
  const roleName = options.getCurrentRole();
  const rolePath = options.getCurrentRolePath();
  if (!roleName || !rolePath) {
    options.notify("当前目录没有已激活角色", "warning");
    return;
  }

  const rolePrompt = await loadRolePrompts(rolePath);
  const highPriority = loadHighPriorityMemories(rolePath, roleName);
  const longTerm = readLongTermMemoryBlock(rolePath);
  const daily = config.memory.dailyInjection.enabled ? readDailyMemoryBlocks(rolePath) : [];
  const pending = getPendingMemories(rolePath).filter((item) => !item.discarded && !item.promoted);

  const dynamic = [
    `- 按需关键词召回：${config.memory.onDemandSearch.enabled ? "开启（内容取决于下一条用户查询）" : "关闭"}`,
    `- 向量语义召回：${config.vectorMemory.enabled && config.vectorMemory.autoRecall ? "开启（内容取决于下一条用户查询）" : "关闭"}`,
    `- 外部只读提示：${config.externalReadonly.enabled ? "开启（内容取决于下一条用户查询与远端结果）" : "关闭"}`,
    `- Pending 候选：${pending.length} 条（默认不会直接注入，需验证/晋升）`,
  ].join("\n");

  const content = `# 当前角色注入预览：${roleName}

> 下面展示当前可确定的真实注入块。按需搜索、向量召回和外部只读结果依赖下一条用户查询，因此只展示开关与规则，不伪造召回内容。

## 动态注入状态

${dynamic}

## 角色 Core Prompt

${rolePrompt || "(empty)"}

## 首条消息高优先级记忆

${highPriority || "(none)"}

## 长期记忆（每轮注入）

${longTerm || "(none)"}

## Daily Memory

${config.memory.dailyInjection.enabled ? (daily.join("\n\n---\n\n") || "(none)") : "已关闭"}`;

  await showMarkdown(options.ctx, `注入预览 · ${roleName}`, content);
}

async function mapRole(options: RoleControlCenterOptions): Promise<void> {
  const roles = getRoles();
  if (roles.length === 0) {
    options.notify("尚无角色，请先创建", "warning");
    return;
  }
  const selected = await choose(options.ctx, "映射当前目录到角色", roles.map((role) => {
    const identity = getRoleIdentity(join(ROLES_DIR, role));
    return { label: `${role}${identity?.name ? ` · ${identity.name}` : ""}`, value: role };
  }));
  if (!selected) return;

  const roleConfig = loadRoleConfig();
  const cwdKey = normalizePath(options.cwd);
  roleConfig.mappings[cwdKey] = selected;
  roleConfig.disabledPaths = (roleConfig.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);
  saveRoleConfig(roleConfig);
  await options.activateRole(selected, join(ROLES_DIR, selected));
  options.notify(`已映射：${cwdKey} → ${selected}`, "success");
}

async function createAndMaybeMapRole(options: RoleControlCenterOptions): Promise<void> {
  const input = await options.ctx.ui.input("创建角色", "输入角色目录名（不可包含路径分隔符）");
  const roleName = String(input || "").trim();
  if (!roleName) return;
  if (roleName === "." || roleName === ".." || roleName.includes("/") || roleName.includes("\\")) {
    options.notify("角色名不能包含路径分隔符", "error");
    return;
  }
  const rolePath = join(ROLES_DIR, roleName);
  if (existsSync(rolePath)) {
    options.notify(`角色 ${roleName} 已存在`, "warning");
    return;
  }

  createRole(roleName);
  options.notify(`已创建角色：${roleName}`, "success");
  if (await options.ctx.ui.confirm("映射角色", `立即映射当前目录到 ${roleName}？`)) {
    const roleConfig = loadRoleConfig();
    const cwdKey = normalizePath(options.cwd);
    roleConfig.mappings[cwdKey] = roleName;
    roleConfig.disabledPaths = (roleConfig.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);
    saveRoleConfig(roleConfig);
    await options.activateRole(roleName, rolePath);
  }
}

async function setDefaultRole(options: RoleControlCenterOptions): Promise<void> {
  const roles = getRoles();
  const selected = await choose(options.ctx, "设置默认角色", [
    ...roles.map((role) => ({ label: role, value: role })),
    { label: "不使用默认角色", value: "none" },
  ]);
  if (!selected) return;
  const roleConfig = loadRoleConfig();
  roleConfig.defaultRole = selected;
  saveRoleConfig(roleConfig);
  options.notify(`默认角色已设置为：${selected}`, "success");
}

async function disableRoleForCwd(options: RoleControlCenterOptions): Promise<void> {
  if (!await options.ctx.ui.confirm("禁用角色", "取消当前目录的精确映射，并禁止继承默认/父目录角色？")) return;
  const roleConfig = loadRoleConfig();
  const cwdKey = normalizePath(options.cwd);
  for (const path of Object.keys(roleConfig.mappings || {})) {
    if (normalizePath(path) === cwdKey) delete roleConfig.mappings[path];
  }
  roleConfig.disabledPaths = Array.from(new Set([...(roleConfig.disabledPaths || []).map(normalizePath), cwdKey]));
  saveRoleConfig(roleConfig);
  options.clearRole();
  options.notify("当前目录已禁用角色", "success");
}

async function showMemories(options: RoleControlCenterOptions): Promise<void> {
  const roleName = options.getCurrentRole();
  const rolePath = options.getCurrentRolePath();
  if (!roleName || !rolePath) {
    options.notify("当前目录没有已激活角色", "warning");
    return;
  }
  await options.ctx.ui.custom(
    (tui: any, theme: any, _kb: any, done: () => void) => new RoleMemoryViewerComponent(rolePath, roleName, tui, theme, done),
    { overlay: true, overlayOptions: { anchor: "center", width: "92%", minWidth: 64, maxHeight: "95%" } },
  );
}

export async function openRoleControlCenter(options: RoleControlCenterOptions): Promise<void> {
  while (true) {
    const action = await openControlCenterMenu(options);

    if (!action || action === "close") return;
    if (action === "status") await showStatus(options);
    else if (action === "map") await mapRole(options);
    else if (action === "create") await createAndMaybeMapRole(options);
    else if (action === "default") await setDefaultRole(options);
    else if (action === "disable") await disableRoleForCwd(options);
    else if (action === "injection") await showInjectionPreview(options);
    else if (action === "memories") await showMemories(options);
    else if (action === "config") await openConfigEditor(options);
  }
}
