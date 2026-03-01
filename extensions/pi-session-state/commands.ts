/**
 * Command definitions for session state management
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import * as db from "./db.ts"

function getSessionId(ctx: any): string {
  return ctx.sessionManager?.getSessionId?.() || ctx.session?.id || process.env.PI_SESSION_ID || ""
}

const BUILTIN_MAP: Record<string, string> = {
  "todo": "builtin-todo",
  "wip": "builtin-wip",
  "done": "builtin-done",
  "important": "builtin-important",
  "archive": "builtin-archive",
}

const TAG_NAMES: Record<string, string> = {
  "builtin-todo": "待处理",
  "builtin-wip": "进行中",
  "builtin-done": "已完成",
  "builtin-important": "重要",
  "builtin-archive": "归档",
}

export function registerCommands(pi: ExtensionAPI) {
  // /state - Show current tags
  pi.registerCommand("state", {
    description: "显示当前会话的标签状态",
    handler: async (_args, ctx) => {
      const sessionId = getSessionId(ctx)
      if (!sessionId) {
        ctx.ui.notify("❌ 无法获取会话ID", "error")
        return
      }

      const [tagsResult, allTagsResult] = await Promise.all([
        db.getTagsForSession(sessionId),
        db.getAllTags(),
      ])

      const currentTags = tagsResult.success ? (tagsResult.data || []) : []
      const allTags = allTagsResult.success ? (allTagsResult.data || []) : []

      const lines = [
        `📋 会话: ${sessionId.slice(0, 8)}...`,
        `🎯 当前: ${currentTags.length > 0 ? currentTags.map(t => t.name).join(", ") : "无"}`,
        "",
        "📚 可用:",
        ...allTags.map(t => `  ${currentTags.some(ct => ct.id === t.id) ? "✓" : "○"} ${t.name}`),
      ]

      ctx.ui.notify(lines.join("\n"), "info")
    },
  })

  // /state-set <tag> - Set tag
  pi.registerCommand("state-set", {
    description: "设置会话状态标签",
    getArgumentCompletions: (prefix) => {
      return ["todo", "wip", "done", "important", "archive"]
        .filter(t => t.includes(prefix.toLowerCase()))
        .map(t => ({ value: t, label: t }))
    },
    handler: async (args, ctx) => {
      const tagName = args.trim()
      if (!tagName) {
        ctx.ui.notify("❌ 请指定标签: /state-set wip", "error")
        return
      }

      const sessionId = getSessionId(ctx)
      if (!sessionId) {
        ctx.ui.notify("❌ 无法获取会话ID", "error")
        return
      }

      const normalized = tagName.toLowerCase()
      const builtinId = BUILTIN_MAP[normalized]

      const allTags = db.getAllTags()
      let targetTag = allTags.data?.find(
        t => t.id === builtinId || t.name.toLowerCase() === normalized
      )

      if (!targetTag) {
        const created = db.getOrCreateTag(tagName, "info")
        if (!created.success) {
          ctx.ui.notify(`❌ 创建失败: ${created.error}`, "error")
          return
        }
        targetTag = created.data!
      }

      const result = db.moveSessionTag(sessionId, null, targetTag.id)
      ctx.ui.notify(
        result.success ? `✅ ${targetTag.name}` : `❌ ${result.error}`,
        result.success ? "success" : "error"
      )
    },
  })

  // /state-list - List all tags
  pi.registerCommand("state-list", {
    description: "列出所有可用的状态标签",
    handler: async (_args, ctx) => {
      const result = db.getAllTags()
      if (!result.success) {
        ctx.ui.notify(`❌ ${result.error}`, "error")
        return
      }

      const builtin = result.data?.filter(t => t.isBuiltin) || []
      const custom = result.data?.filter(t => !t.isBuiltin) || []

      ctx.ui.notify([
        "📚 可用标签",
        `🔧 系统: ${builtin.map(t => t.name).join(", ")}`,
        `🏷️ 自定义: ${custom.length > 0 ? custom.map(t => t.name).join(", ") : "无"}`,
      ].join("\n"), "info")
    },
  })

  // /state-clear - Clear all tags
  pi.registerCommand("state-clear", {
    description: "清除当前会话的所有标签",
    handler: async (_args, ctx) => {
      const sessionId = getSessionId(ctx)
      if (!sessionId) {
        ctx.ui.notify("❌ 无法获取会话ID", "error")
        return
      }

      const current = db.getTagsForSession(sessionId)
      const tags = current.success ? (current.data || []) : []

      if (tags.length === 0) {
        ctx.ui.notify("ℹ️ 当前无标签", "info")
        return
      }

      for (const tag of tags) db.removeTag(sessionId, tag.id)
      ctx.ui.notify(`✅ 已清除 ${tags.length} 个标签`, "success")
    },
  })

  // /flow - Quick transitions
  pi.registerCommand("flow", {
    description: "快速流转: start(wip) / done / hold(todo) / important / archive",
    getArgumentCompletions: () => [
      { value: "start", label: "开始 (→ 进行中)" },
      { value: "done", label: "完成 (→ 已完成)" },
      { value: "hold", label: "暂停 (→ 待处理)" },
    ],
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase()
      const sessionId = getSessionId(ctx)

      if (!sessionId) {
        ctx.ui.notify("❌ 无法获取会话ID", "error")
        return
      }

      const transitions: Record<string, { from: string | null; to: string }> = {
        "start": { from: "builtin-todo", to: "builtin-wip" },
        "wip": { from: null, to: "builtin-wip" },
        "done": { from: "builtin-wip", to: "builtin-done" },
        "hold": { from: "builtin-wip", to: "builtin-todo" },
        "todo": { from: null, to: "builtin-todo" },
        "important": { from: null, to: "builtin-important" },
        "archive": { from: null, to: "builtin-archive" },
      }

      const transition = transitions[action]
      if (!transition) {
        ctx.ui.notify("❌ 未知动作: start/done/hold/todo/important/archive", "error")
        return
      }

      const result = db.moveSessionTag(sessionId, transition.from, transition.to)
      if (!result.success) {
        ctx.ui.notify(`❌ ${result.error}`, "error")
        return
      }

      const fromName = transition.from ? (TAG_NAMES[transition.from] || transition.from) : "无"
      const toName = TAG_NAMES[transition.to] || transition.to
      ctx.ui.notify(`✅ ${fromName} → ${toName}`, "success")
    },
  })
}
