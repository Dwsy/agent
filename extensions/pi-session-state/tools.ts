/**
 * Unified session tag tool
 */
import { Type } from "@sinclair/typebox"
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"
import * as db from "./db.ts"
import type { Tag } from "./types.ts"

let cachedTags: Tag[] = []
let lastCacheTime = 0
const CACHE_TTL = 30000

async function refreshTagCache(): Promise<Tag[]> {
  const now = Date.now()
  if (now - lastCacheTime < CACHE_TTL && cachedTags.length > 0) {
    return cachedTags
  }
  const result = db.getAllTags()
  if (result.success && result.data) {
    cachedTags = result.data
    lastCacheTime = now
  }
  return cachedTags
}

function getSessionId(ctx: ExtensionContext): string {
  const id = ctx.sessionManager.getSessionId()
  const fs = require("node:fs")
  fs.appendFileSync("/tmp/pi-session-state.log", `[getSessionId] id=${id}\n`)
  return id
}

const BUILTIN_TAG_MAP: Record<string, string> = {
  "todo": "builtin-todo", "待处理": "builtin-todo",
  "wip": "builtin-wip", "进行中": "builtin-wip", "in-progress": "builtin-wip",
  "done": "builtin-done", "已完成": "builtin-done", "complete": "builtin-done", "completed": "builtin-done",
  "important": "builtin-important", "重要": "builtin-important",
  "archive": "builtin-archive", "归档": "builtin-archive", "archived": "builtin-archive",
}

const TAG_DESCRIPTIONS: Record<string, string> = {
  "待处理": "等待开始的任务",
  "进行中": "正在处理中",
  "已完成": "任务已完成",
  "重要": "需要优先关注",
  "归档": "已归档记录",
}

function findTag(name: string, tags: Tag[]): Tag | null {
  const normalized = name.toLowerCase().trim()
  const builtinId = BUILTIN_TAG_MAP[normalized]
  
  // 1. Builtin match
  if (builtinId) {
    const found = tags.find(t => t.id === builtinId)
    if (found) return found
  }
  // 2. Exact match
  const exact = tags.find(t => t.name.toLowerCase() === normalized)
  if (exact) return exact
  // 3. Partial match
  return tags.find(t => t.name.toLowerCase().includes(normalized)) || null
}

export function registerTools(pi: ExtensionAPI) {
  refreshTagCache()

  pi.registerTool({
    name: "session_tag",
    label: "会话标签管理",
    description: "管理当前会话的状态标签。支持操作：list(列出标签)、set(设置标签)、remove(移除标签)。系统标签：待处理(todo)、进行中(wip)、已完成(done)、重要(important)、归档(archive)。",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list", { description: "列出当前会话标签和所有可用标签" }),
        Type.Literal("set", { description: "设置/切换会话标签" }),
        Type.Literal("remove", { description: "移除指定标签" }),
      ], { description: "操作类型：list/set/remove" }),
      tag: Type.Optional(Type.String({
        description: "标签名称（set/remove 时必填）。支持中文或英文：todo/待处理, wip/进行中, done/已完成, important/重要, archive/归档",
      })),
      fromTag: Type.Optional(Type.String({
        description: "set时可选：从哪个标签移出（用于工作流流转）",
      })),
    }),
    async execute(_toolCallId, params, _signal, onPartial, ctx) {
      const sessionId = getSessionId(ctx)
      await refreshTagCache()

      // ========== LIST ==========
      if (params.action === "list") {
        const currentResult = db.getTagsForSession(sessionId)
        const currentTags = currentResult.success ? (currentResult.data || []) : []

        const lines = [
          `📋 会话标签 (ID: ${sessionId.slice(0, 8)}...)`,
          "",
          `🎯 当前: ${currentTags.length > 0 ? currentTags.map(t => t.name).join(", ") : "无"}`,
          "",
          `📚 可用标签:`,
          ...cachedTags.map(t => {
            const assigned = currentTags.some(ct => ct.id === t.id)
            const desc = TAG_DESCRIPTIONS[t.name] || ""
            return `  ${assigned ? "✓" : "○"} ${t.name}${desc ? ` - ${desc}` : ""}${t.isBuiltin ? " [系统]" : ""}`
          }),
        ]

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { sessionId, currentTags, availableTags: cachedTags },
        }
      }

      // ========== SET ==========
      if (params.action === "set") {
        if (!params.tag) {
          return { content: [{ type: "text", text: "❌ set 操作需要 tag 参数" }], isError: true }
        }

        onPartial?.({ content: [{ type: "text", text: `🔄 设置标签: ${params.tag}...` }] })

        let targetTag = findTag(params.tag, cachedTags)

        // Auto-create if not found
        if (!targetTag) {
          onPartial?.({ content: [{ type: "text", text: `📝 创建新标签: ${params.tag}...` }] })
          const createResult = db.getOrCreateTag(params.tag, "info")
          if (createResult.success && createResult.data) {
            targetTag = createResult.data
            cachedTags.push(targetTag)
          }
        }

        if (!targetTag) {
          return { content: [{ type: "text", text: `❌ 标签未找到: ${params.tag}` }], isError: true }
        }

        // Determine fromTag
        let fromTagId: string | null = null
        if (params.fromTag) {
          const fromTag = findTag(params.fromTag, cachedTags)
          if (fromTag) fromTagId = fromTag.id
        }

        // Get current for transition message
        const currentResult = db.getTagsForSession(sessionId)
        const currentTags = currentResult.success ? (currentResult.data || []) : []
        const oldTag = fromTagId
          ? currentTags.find(t => t.id === fromTagId)?.name || params.fromTag
          : currentTags[0]?.name || "无"

        const result = db.moveSessionTag(sessionId, fromTagId, targetTag.id)
        if (!result.success) {
          return { content: [{ type: "text", text: `❌ 设置失败: ${result.error}` }], isError: true }
        }

        return {
          content: [{
            type: "text",
            text: [
              `✅ 标签已更新`,
              ``,
              `📍 ${oldTag} → ${targetTag.name}`,
              `🏷️ ${targetTag.name}${targetTag.isBuiltin ? " [系统]" : ""}`,
            ].join("\n"),
          }],
          details: { sessionId, tagId: targetTag.id, tagName: targetTag.name, fromTag: fromTagId },
        }
      }

      // ========== REMOVE ==========
      if (params.action === "remove") {
        if (!params.tag) {
          return { content: [{ type: "text", text: "❌ remove 操作需要 tag 参数" }], isError: true }
        }

        const targetTag = findTag(params.tag, cachedTags)
        if (!targetTag) {
          return { content: [{ type: "text", text: `❌ 标签未找到: ${params.tag}` }], isError: true }
        }

        const result = db.removeTag(sessionId, targetTag.id)
        if (!result.success) {
          return { content: [{ type: "text", text: `❌ 移除失败: ${result.error}` }], isError: true }
        }

        return { content: [{ type: "text", text: `✅ 已移除标签: ${targetTag.name}` }] }
      }

      return { content: [{ type: "text", text: "❌ 未知操作" }], isError: true }
    },
  })
}
