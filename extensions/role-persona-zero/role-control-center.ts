import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  Markdown,
  matchesKey,
  truncateToWidth,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { config, DEFAULT_CONFIG, saveConfigPatch, type DeepPartial, type RolePersonaConfig } from "./config.ts";
import {
  getPendingMemories,
  loadHighPriorityMemories,
  readDailyMemoryBlocks,
  readLongTermMemoryBlock,
  readRoleMemory,
} from "./memory-md.ts";
import { RoleMemoryViewerComponent } from "./memory-viewer.ts";
import { showRolePanel, type RolePanelDetail, type RolePanelEntry } from "./role-panel.ts";
import {
  createRole,
  DEFAULT_ROLE,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  loadRoleConfig,
  loadRolePrompts,
  resolveRoleForCwd,
  resolveRoleScopeDir,
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
  description: string;
  fields: ConfigField[];
}

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
    label: "核心提示",
    description: "core/*.md 进入系统提示词的范围",
    fields: [
      { label: "注入 constraints.md", path: "corePrompt.injectConstraints", kind: "boolean", description: "默认关闭，硬约束按需开启" },
    ],
  },
  {
    label: "自动记忆",
    description: "会话后自动提取 learnings / preferences / events",
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
    description: "系统提示记忆注入与首条消息上下文召回",
    fields: [
      { label: "启用记忆注入（总开关）", path: "memory.injection.enabled", kind: "boolean", description: "关闭后系统提示不再注入任何记忆内容（长期/daily/pending/按需召回）" },
      { label: "注入长期记忆", path: "memory.injection.longTerm", kind: "boolean", description: "consolidated.md 的 learnings/preferences/events 与 pending 候选" },
      { label: "注入 Daily Memory", path: "memory.dailyInjection.enabled", kind: "boolean" },
      { label: "启用 Daily Summary", path: "memory.dailySummary.enabled", kind: "boolean" },
      { label: "近期天数", path: "memory.dailySummary.recentDays", kind: "number", min: 1, max: 30 },
      { label: "自动生成 Daily Summary", path: "memory.dailySummary.autoGenerate", kind: "boolean" },
      { label: "首条消息自动注入上下文", path: "memory.onDemandSearch.enabled", kind: "boolean" },
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
    description: "本地/远程 embedding 的语义召回与自动索引",
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
    description: "外部经验只读召回与项目知识库检索",
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
    description: "日志、Spinner、进化提醒等杂项设置",
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

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.disposed || event.type !== "wheel" || !event.wheelDelta) return undefined;

    const max = Math.max(0, this.lines.length - this.visibleLines());
    this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset + event.wheelDelta));
    this.tui.requestRender();
    return { handled: true };
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

/** Build panel entries from the role store (memory counts only for initialized roles). */
export function buildPanelEntries(cwd: string, currentRole: string | null): RolePanelEntry[] {
  const roleConfig = loadRoleConfig();
  const cwdKey = normalizePath(resolveRoleScopeDir(cwd));
  return getRoles().map((role) => {
    const rolePath = join(ROLES_DIR, role);
    const initialized = existsSync(rolePath);
    const identity = initialized ? getRoleIdentity(rolePath) : null;
    let counts = { learnings: 0, preferences: 0, events: 0 };
    // 只统计已存在 consolidated.md 的角色，避免为未初始化角色创建记忆文件
    if (initialized && existsSync(join(rolePath, "memory", "consolidated.md"))) {
      try {
        const memory = readRoleMemory(rolePath, role);
        counts = { learnings: memory.learnings.length, preferences: memory.preferences.length, events: memory.events.length };
      } catch {
        // 记忆文件损坏时显示 0，不阻塞选择
      }
    }
    const pending = initialized
      ? getPendingMemories(rolePath).filter((item) => !item.discarded).length
      : 0;
    return {
      name: role,
      displayName: identity?.name || "",
      emoji: identity?.emoji || undefined,
      ...counts,
      pending,
      firstRun: initialized ? isFirstRun(rolePath) : true,
      isDefault: (roleConfig.defaultRole || DEFAULT_ROLE) === role,
      isCurrent: currentRole === role,
      mappedToCwd: roleConfig.mappings?.[cwdKey] === role,
    };
  });
}

export function buildPanelDetail(roleName: string): RolePanelDetail {
  const roleConfig = loadRoleConfig();
  const rolePath = join(ROLES_DIR, roleName);
  const mappings = Object.entries(roleConfig.mappings || {})
    .filter(([, role]) => role === roleName)
    .map(([path]) => normalizePath(path))
    .sort();
  const corePrompt = existsSync(rolePath) ? loadRolePrompts(rolePath) : "";
  return { mappings, corePrompt };
}

export function scopeLineFor(cwd: string, currentRole: string | null): string {
  const resolution = resolveRoleForCwd(cwd, loadRoleConfig());
  const role = currentRole || resolution.role || "无";
  return `目录 ${normalizePath(resolveRoleScopeDir(cwd))} → ${role} (${resolution.source})`;
}

async function openRolePanel(options: RoleControlCenterOptions, mode: "control" | "select" = "control"): Promise<string | undefined> {
  return await showRolePanel(options.ctx, {
    entries: buildPanelEntries(options.cwd, options.getCurrentRole()),
    detail: buildPanelDetail,
    scopeLine: scopeLineFor(options.cwd, options.getCurrentRole()),
    mode,
  });
}

async function chooseSection(ctx: any): Promise<number | undefined> {
  const selected = await choose(ctx, "配置分类", CONFIG_SECTIONS.map((section, index) => ({
    label: `${section.label} — ${section.description}（${section.fields.length} 项）`,
    value: String(index),
  })));
  return selected === undefined ? undefined : Number(selected);
}

async function choose(ctx: any, title: string, entries: Array<{ label: string; value: string }>): Promise<string | undefined> {
  const selected = await ctx.ui.select(title, entries.map((entry) => entry.label));
  return entries.find((entry) => entry.label === selected)?.value;
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
    const currentLabel = current ? "开启" : "关闭";
    const targetLabel = current ? "关闭" : "开启";
    const picked = await choose(options.ctx, `${field.label}（当前：${currentLabel}）`, [
      { label: `切换为${targetLabel}`, value: "toggle" },
      { label: "保持不变", value: "keep" },
    ]);
    if (!picked || picked === "keep") return;
    next = !current;
  } else if (field.kind === "select") {
    const selected = await choose(options.ctx, field.label, (field.choices || []).map((value) => ({ label: value, value })));
    if (selected === undefined) return;
    next = selected;
  } else {
    const currentText = field.kind === "secret" ? "" : typeof current === "string" ? current : JSON.stringify(current);
    const kindLabel = field.kind === "secret" ? "密钥" : field.kind === "number" ? "数值" : field.kind === "json" || field.kind === "json-or-text" ? "JSON" : "文本";
    const defaultText = field.kind === "secret" ? "<隐藏>" : formatValue(field, getAtPath(DEFAULT_CONFIG, field.path));
    const rangeText = field.kind === "number" && (field.min !== undefined || field.max !== undefined)
      ? ` · 范围: ${field.min ?? "-∞"}~${field.max ?? "∞"}`
      : "";
    const descText = field.description ? `${field.description} · ` : "";
    const hint = `[${kindLabel}] ${descText}默认: ${defaultText} · 当前: ${field.kind === "secret" ? "<隐藏>" : currentText}${rangeText}`;
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

async function openConfigEditor(options: RoleControlCenterOptions, sectionIndex: number): Promise<void> {
  const selectedSection = CONFIG_SECTIONS[sectionIndex];
  if (!selectedSection) return;
  while (true) {
    const fieldPath = await choose(options.ctx, `配置 · ${selectedSection.label}`, [
      ...selectedSection.fields.map((field) => ({
        label: `${field.label}  ·  ${formatValue(field, getAtPath(config, field.path))}${field.description ? `  ·  ${field.description}` : ""}`,
        value: field.path,
      })),
      { label: "← 返回角色控制中心", value: "back" },
    ]);
    if (!fieldPath || fieldPath === "back") return;
    const field = selectedSection.fields.find((item) => item.path === fieldPath);
    if (field) await editConfigField(options, field);
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
- 注入 constraints.md：${config.corePrompt.injectConstraints ? "开启" : "关闭"}
- 记忆注入总开关：${config.memory.injection.enabled ? "开启" : "关闭"}
- 长期记忆注入：${config.memory.injection.longTerm ? "开启" : "关闭"}
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
  const constraintsNote = config.corePrompt.injectConstraints
    ? ""
    : "\n\n> `core/constraints.md` 当前未注入（`corePrompt.injectConstraints = false`）。";
  const highPriority = loadHighPriorityMemories(rolePath, roleName);
  const injection = config.memory.injection;
  const longTerm = injection.enabled && injection.longTerm
    ? readLongTermMemoryBlock(rolePath, roleName)
    : null;
  const dailyEnabled = injection.enabled && config.memory.dailyInjection.enabled;
  const daily = dailyEnabled ? readDailyMemoryBlocks(rolePath) : [];
  const pending = getPendingMemories(rolePath).filter((item) => !item.discarded && !item.promoted);

  const dynamic = [
    `- 记忆注入总开关：${injection.enabled ? "开启" : "关闭（以下全部失效）"}`,
    `- 长期记忆注入：${injection.enabled && injection.longTerm ? "开启（每轮注入）" : "关闭"}`,
    `- 按需关键词召回：${injection.enabled && config.memory.onDemandSearch.enabled ? "开启（内容取决于下一条用户查询）" : "关闭"}`,
    `- 向量语义召回：${config.vectorMemory.enabled && config.vectorMemory.autoRecall ? "开启（内容取决于下一条用户查询）" : "关闭"}`,
    `- 外部只读提示：${config.externalReadonly.enabled ? "开启（内容取决于下一条用户查询与远端结果）" : "关闭"}`,
    `- Pending 候选：${pending.length} 条（默认不会直接注入，需验证/晋升）`,
  ].join("\n");

  const longTermView = !injection.enabled
    ? "已关闭（`memory.injection.enabled = false`）"
    : !injection.longTerm
      ? "已关闭（`memory.injection.longTerm = false`）"
      : (longTerm || "(none)");

  const content = `# 当前角色注入预览：${roleName}

> 下面展示当前可确定的真实注入块。按需搜索、向量召回和外部只读结果依赖下一条用户查询，因此只展示开关与规则，不伪造召回内容。

## 动态注入状态

${dynamic}

## 角色 Core Prompt

${rolePrompt || "(empty)"}${constraintsNote}

## 首条消息高优先级记忆

${highPriority || "(none)"}

## 长期记忆（每轮注入）

${longTermView}

## Daily Memory

${dailyEnabled ? (daily.join("\n\n---\n\n") || "(none)") : "已关闭"}`;

  await showMarkdown(options.ctx, `注入预览 · ${roleName}`, content);
}

async function mapRoleTo(options: RoleControlCenterOptions, roleName: string): Promise<void> {
  const rolePath = join(ROLES_DIR, roleName);
  if (!existsSync(rolePath)) {
    options.notify(`角色 "${roleName}" 不存在`, "error");
    return;
  }
  const roleConfig = loadRoleConfig();
  const cwdKey = normalizePath(resolveRoleScopeDir(options.cwd));
  roleConfig.mappings[cwdKey] = roleName;
  roleConfig.disabledPaths = (roleConfig.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);
  saveRoleConfig(roleConfig);
  await options.activateRole(roleName, rolePath);
  options.notify(`已映射：${cwdKey} → ${roleName}`, "success");
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
    const cwdKey = normalizePath(resolveRoleScopeDir(options.cwd));
    roleConfig.mappings[cwdKey] = roleName;
    roleConfig.disabledPaths = (roleConfig.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);
    saveRoleConfig(roleConfig);
    await options.activateRole(roleName, rolePath);
  }
}

function toggleDefaultRole(options: RoleControlCenterOptions, roleName: string): void {
  const roleConfig = loadRoleConfig();
  const current = (roleConfig.defaultRole || DEFAULT_ROLE).trim();
  // Toggle semantics: pressing ^D on the default role clears it ("none" = 无默认).
  roleConfig.defaultRole = current.toLowerCase() === roleName.toLowerCase() ? "none" : roleName;
  saveRoleConfig(roleConfig);
  options.notify(
    roleConfig.defaultRole === "none" ? "已取消默认角色" : `默认角色已设置为：${roleName}`,
    "success"
  );
}

async function disableRoleForCwd(options: RoleControlCenterOptions): Promise<void> {
  if (!await options.ctx.ui.confirm("禁用角色", "取消当前目录的精确映射，并禁止继承默认/父目录角色？")) return;
  const roleConfig = loadRoleConfig();
  const cwdKey = normalizePath(resolveRoleScopeDir(options.cwd));
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
    const action = await openRolePanel(options);
    if (!action) return;

    if (action.startsWith("map:")) {
      await mapRoleTo(options, action.slice("map:".length));
      continue;
    }
    if (action.startsWith("default:")) {
      toggleDefaultRole(options, action.slice("default:".length));
      continue;
    }
    switch (action) {
      case "create":
        await createAndMaybeMapRole(options);
        break;
      case "disable":
        await disableRoleForCwd(options);
        break;
      case "injection":
        await showInjectionPreview(options);
        break;
      case "memories":
        await showMemories(options);
        break;
      case "status":
        await showStatus(options);
        break;
      case "config": {
        const section = await chooseSection(options.ctx);
        if (section !== undefined) await openConfigEditor(options, section);
        break;
      }
    }
  }
}
