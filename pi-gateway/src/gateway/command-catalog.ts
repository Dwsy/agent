import type { CommandCatalogEntry, NativeCommandSpec } from "./command-types.ts";

const BUILTIN_COMMANDS: CommandCatalogEntry[] = [
  { name: "help", description: "显示帮助", source: "builtin", exposeInNativeUi: true, group: "general" },
  { name: "new", description: "重置会话", source: "builtin", exposeInNativeUi: true, group: "general" },
  { name: "stop", description: "中断当前输出", source: "builtin", exposeInNativeUi: true, group: "general" },
  { name: "model", description: "查看/切换模型", source: "builtin", exposeInNativeUi: true, group: "model", supportsArgs: true },
  { name: "models", description: "搜索模型", source: "builtin", exposeInNativeUi: true, group: "model", supportsArgs: true },
  { name: "setmodel", description: "按关键词切换模型", source: "builtin", exposeInNativeUi: true, group: "model", supportsArgs: true },
  { name: "think", description: "设置思考等级", source: "builtin", exposeInNativeUi: true, group: "model", supportsArgs: true },
  { name: "compact", description: "压缩上下文", source: "builtin", exposeInNativeUi: true, group: "session" },
  { name: "status", description: "查看会话状态", source: "builtin", exposeInNativeUi: true, group: "session" },
  { name: "context", description: "上下文使用情况", source: "builtin", exposeInNativeUi: true, group: "session" },
  { name: "queue", description: "会话并发策略", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "whoami", description: "查看发送者信息", source: "builtin", exposeInNativeUi: true, group: "general" },
  { name: "bash", description: "执行 shell 命令", source: "builtin", exposeInNativeUi: true, group: "admin", supportsArgs: true },
  { name: "config", description: "查看运行配置", source: "builtin", exposeInNativeUi: true, group: "admin", supportsArgs: true },
  { name: "restart", description: "重启 gateway", source: "builtin", exposeInNativeUi: true, group: "admin" },
  { name: "sys", description: "系统状态", source: "builtin", exposeInNativeUi: true, group: "admin" },
  { name: "role", description: "切换/查看角色", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "cron", description: "定时任务管理", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "skills", description: "查看/调用技能", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "sessions", description: "查看所有会话", source: "builtin", exposeInNativeUi: true, group: "session" },
  { name: "resume", description: "恢复指定会话", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "concise", description: "简洁模式开关", source: "builtin", exposeInNativeUi: true, group: "session", supportsArgs: true },
  { name: "refresh", description: "刷新命令列表", source: "builtin", exposeInNativeUi: true, group: "general" },
  { name: "reload_session", description: "重载 agent 运行时", source: "builtin", exposeInNativeUi: true, group: "admin" },
];

const GROUPED_PI_PREFIXES = ["skill:"];

export function getBuiltinCommandCatalog(): CommandCatalogEntry[] {
  return BUILTIN_COMMANDS.map((entry) => ({ ...entry }));
}

export function getBuiltinCommandNames(): string[] {
  return BUILTIN_COMMANDS.map((entry) => entry.name);
}

export function buildAgentPrefixCommands(agentIds?: string[]): CommandCatalogEntry[] {
  return (agentIds ?? [])
    .filter((id) => id && id !== "main")
    .map((id) => ({
      name: id.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: `Switch to agent: ${id}`,
      source: "agent-prefix" as const,
      exposeInNativeUi: true,
      group: "agents",
      supportsArgs: true,
    }));
}

export function buildPiNativeAliasCommands(piCommands: Array<{ name: string; description?: string }>): CommandCatalogEntry[] {
  return piCommands
    .filter((cmd) => typeof cmd.name === "string" && cmd.name.trim().startsWith("/") && !cmd.name.startsWith("game:"))
    .filter((cmd) => !GROUPED_PI_PREFIXES.some((prefix) => cmd.name.replace(/^\//, "").startsWith(prefix)))
    .map((cmd) => ({
      name: `pi_${cmd.name.replace(/^\//, "")}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
      description: cmd.description ?? `pi: ${cmd.name}`,
      source: "pi-native" as const,
      exposeInNativeUi: true,
      group: "pi-native",
      supportsArgs: true,
    }));
}

export function buildNativeCommandSpecs(input: {
  builtin?: CommandCatalogEntry[];
  piNative?: Array<{ name: string; description?: string }>;
  agentIds?: string[];
}): NativeCommandSpec[] {
  const all = [
    ...(input.builtin ?? getBuiltinCommandCatalog()),
    ...buildAgentPrefixCommands(input.agentIds),
    ...buildPiNativeAliasCommands(input.piNative ?? []),
  ];
  const deduped = new Map<string, NativeCommandSpec>();
  for (const entry of all) {
    if (entry.exposeInNativeUi === false) continue;
    if (!deduped.has(entry.name)) {
      deduped.set(entry.name, {
        name: entry.name,
        description: entry.description,
        source: entry.source,
      });
    }
  }
  return Array.from(deduped.values());
}


function chunkCommands<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildCommandHelpPage(page = 1): { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; callbackData: string }>> } } {
  const groups: Array<{ title: string; items: CommandCatalogEntry[] }> = [
    { title: 'General', items: BUILTIN_COMMANDS.filter((item) => item.group === 'general') },
    { title: 'Model', items: BUILTIN_COMMANDS.filter((item) => item.group === 'model') },
    { title: 'Session', items: BUILTIN_COMMANDS.filter((item) => item.group === 'session') },
    { title: 'Admin', items: BUILTIN_COMMANDS.filter((item) => item.group === 'admin') },
  ].filter((entry) => entry.items.length > 0);

  const pages = chunkCommands(groups, 2).map((entries, idx, arr) => {
    const lines: string[] = [`<b>Gateway Commands (${idx + 1}/${arr.length})</b>`, ''];
    for (const section of entries) {
      lines.push(`<b>${section.title}</b>`);
      for (const item of section.items) {
        const usage = item.supportsArgs ? `/${item.name} ...` : `/${item.name}`;
        lines.push(`${usage} — ${item.description}`);
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  });

  const index = Math.max(0, Math.min(page - 1, pages.length - 1));
  const prev = Math.max(1, index);
  const next = Math.min(pages.length, index + 2);
  return {
    text: pages[index] ?? '<b>Gateway Commands</b>',
    keyboard: {
      inline_keyboard: [[
        { text: '◀', callbackData: `cmd_page:${prev}` },
        { text: `${index + 1}/${Math.max(1, pages.length)}`, callbackData: `cmd_page:${index + 1}` },
        { text: '▶', callbackData: `cmd_page:${next}` },
      ]],
    },
  };
}
