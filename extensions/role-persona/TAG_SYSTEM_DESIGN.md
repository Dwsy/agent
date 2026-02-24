# Tag System 设计文档

> 原则：简单、可用、闭环

---

## 1. Behavior（行为定义）

### 1.1 何时生成 Tag

| 触发场景 | 动作 | 说明 |
|---------|------|------|
| 手动添加记忆 (`memory add_learning`) | 自动提取 | 用户显式"记住"时 |
| 自动提取记忆 (`agent_end checkpoint`) | 自动提取 | AI 自动整理对话时 |
| 批量整理 (`memory-tidy-llm`) | 批量提取 | 手动触发整理时 |

### 1.2 如何使用 Tag

**两个出口：**

1. **融合到 `/memories` 导出** - 记忆条目旁显示 `[🏷️ tag1, tag2]`
2. **`/memory-tags` 命令** - 标签云浏览（超出原始设计，但已实现）

```
/memories 命令输出结构：
┌─────────────────────────────────────┐
│  ## Memory: {role}                  │
│                                     │
│  ### Learnings...                   │
│  - [3x] xxx [🏷️ vue, reactivity]    │
│                                     │
│  ### Tag Cloud                      │
│  vue(5) react(3) code-style(4)      │
│                                     │
│  [导出 HTML 包含标签云可视化]         │
└─────────────────────────────────────┘
```

---

## 2. Data（数据设计）

### 2.1 存储位置

```
~/.pi/agent/roles/{role}/
├── memory/consolidated.md    # 主记忆文件
├── memory/daily/
│   └── 2026-02-10.md         # 日常记忆
└── .log/
    └── memory-tags.json      # ← Tag 索引（唯一数据源）
```

### 2.2 数据结构

```typescript
// .log/memory-tags.json
{
  "version": "2.0-simple",
  "lastUpdated": "2026-02-10T10:30:00Z",
  "tags": {
    "vue": {
      "count": 5,                // 出现次数
      "confidence": 0.92,        // LLM 置信度
      "lastUsed": "2026-02-10",  // 最后关联时间
      "memories": ["id1", "id2"] // 关联记忆 ID 列表
    }
  },
  "memoryIndex": {               // 反向索引
    "id1": ["vue", "reactivity"],
    "id2": ["vue", "performance"]
  }
}
```

### 2.3 与 memory/consolidated.md 的关系

```
┌─────────────────┐         ┌─────────────────┐
│ memory/consolidated.md │  │ memory-tags.json│
│  (主记忆)        │ ◄─────► │  (Tag 索引)      │
│                 │  弱关联  │                 │
│ 学习条目可选     │         │  唯一数据源      │
│ 包含 tags 字段   │         │                 │
└─────────────────┘         └─────────────────┘
        │                            │
        │                            │
        └──────────┬─────────────────┘
                   │
              /memories 导出
              /memory-tags 浏览
```

**同步策略**：
- `memory-tags.json` 是唯一数据源
- `memory/consolidated.md` 中的 `tags` 字段是可选的（方便 LLM 读取）
- 不强制双向同步，简化逻辑

---

## 3. Implementation（实现要点）

### 3.1 核心函数

```typescript
// memory-tags.ts

// 统一入口：保存记忆时提取 tag
export async function saveMemoryWithTags(
  ctx: ExtensionContext,
  rolePath: string,
  memory: { id: string; text: string }
): Promise<void>

// 更新 tag 索引
export function updateTagIndex(
  rolePath: string,
  memoryId: string,
  tags: Array<{ tag: string; confidence: number }>
): void

// 获取所有标签
export function getAllTags(rolePath: string): TagIndex

// 构建标签云
export function buildTagCloudHTML(rolePath: string, maxTags?: number): string
```

### 3.2 Tag Cloud 生成

```typescript
// 用于 /memories 导出和 /memory-tags
function generateTagCloudHTML(rolePath: string): string {
  const index = loadTagsIndex(rolePath);
  const sorted = Object.entries(index.tags)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  
  return `
<div class="tag-cloud">
  ${sorted.map(([tag, data]) => `
    <span class="tag" style="font-size: ${Math.min(24, 12 + data.count * 2)}px">
      ${tag} (${data.count})
    </span>
  `).join('')}
</div>
  `;
}
```

### 3.3 命令实现

**`/memory-tags [query]`** - 标签云浏览

```typescript
// index.ts 命令注册
pi.registerCommand("memory-tags", {
  handler: async (args, ctx) => {
    const query = args._[0];
    const tags = getAllTags(rolePath);
    
    if (query) {
      // 过滤显示含关键词的标签
      const filtered = filterTags(tags, query);
      ctx.ui.showMarkdown(buildTagCloudMarkdown(filtered));
    } else {
      // 显示全部标签云
      ctx.ui.showMarkdown(buildTagCloudMarkdown(tags));
    }
    
    // --export 选项导出 HTML
    if (args.export) {
      const html = buildTagCloudHTML(rolePath);
      writeFileSync(`${rolePath}/tag-cloud.html`, html);
    }
  }
});
```

---

## 4. 验证闭环

```
生成 ──► 存储 ──► 使用
  ▲            │
  └────────────┘
  （看到 Tag Cloud / /memory-tags 即验证成功）
```

**验证方式**：
1. 添加一条记忆（如"Vue 3 响应式原理"）
2. 执行 `/memories`
3. 检查输出：
   - 记忆条目旁显示 `[🏷️ vue, reactivity]`
   - 底部显示 Tag Cloud 包含 `vue(1)`
4. 执行 `/memory-tags`
5. 确认标签云显示正确
6. 导出 HTML 包含可视化标签云（可选）

---

## 5. 实际功能 vs 原始设计

| 功能 | 原始设计 | 实际实现 | 差异说明 |
|------|----------|----------|----------|
| `/memory-tags` 命令 | ❌ 不做 | ✅ 已实现 | 用户需求驱动，超出原始设计 |
| 标签搜索 | ❌ 不做 | ⚠️ 有限支持 | 可通过 `/memory-tags keyword` 过滤 |
| 标签编辑 | ❌ 不做 | ❌ 未做 | 符合设计，手动整理 memory.md 即可 |
| 标签合并 | ❌ 不做 | ❌ 未做 | 符合设计 |
| 遗忘曲线 | ❌ 不做 | ⚠️ 简化实现 | 只保留 count/lastUsed |
| TUI 界面 | ❌ 不做 | ❌ 未做 | 符合设计，使用 Markdown 渲染 |

---

## 6. 文件修改清单（已实现）

```
memory-tags.ts (682 lines)
  ✓ saveMemoryWithTags - 保存时自动提取
  ✓ updateTagIndex - 更新索引
  ✓ getAllTags - 获取所有标签
  ✓ buildTagCloudHTML - 生成标签云
  ✓ extractTagsWithLLM - LLM 自动打标

memory-md.ts
  ✓ addRoleLearning - 调用 tag 提取
  ✓ addRolePreference - 调用 tag 提取

memory-llm.ts
  ✓ runAutoMemoryExtraction - 提取记忆后提取 tag

memory-viewer.ts
  ✓ buildRoleMemoryViewerMarkdown - 附加 Tag Cloud

index.ts
  ✓ /memory-tags 命令实现
  ✓ --export 选项支持
```

---

## 7. 使用示例

### 查看标签云

```
/memory-tags
```

### 搜索特定标签

```
/memory-tags vue
```

### 导出 HTML

```
/memory-tags --export
# 生成 ~/.pi/agent/roles/{role}/tag-cloud.html
```

### AI 使用标签

```typescript
// AI 添加带标签的记忆
memory({ action: "add_learning", content: "Vue 3 Composition API 最佳实践" })
// 系统自动提取标签：[vue, composition-api]

// AI 搜索特定标签
role_search({ query: "vue", maxResults: 10 })
```

---

## 8. 性能特征

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| Tag 提取 | O(1) API | LLM 调用，异步不阻塞 |
| 索引更新 | O(n) | n = tag 数量，通常 < 100 |
| 标签云生成 | O(n log n) | 排序后取 top 20 |
| 标签搜索 | O(n) | 简单字符串匹配 |

---

## 9. 相关文档

- [README.md](../README.md) - 标签系统使用说明
- [ARCHITECTURE.md](../ARCHITECTURE.md) - 模块架构
- [CHANGELOG.md](../CHANGELOG.md) - 标签系统变更记录
