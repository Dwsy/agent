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

**唯一出口：融合到 `/memories` 导出**

```
/memories 命令输出结构：
┌─────────────────────────────────────┐
│  ## Memory: {role}                  │
│                                     │
│  ### Learnings...                   │
│  - [3x] xxx [🏷️ tag1, tag2]         │
│                                     │
│  ### Tag Cloud                      │  ← 新增
│  vue(5) react(3) code-style(4)      │  ← Top 20 标签
│                                     │
│  [导出 HTML 包含标签云可视化]         │  ← 新增
└─────────────────────────────────────┘
```

### 1.3 不做什么（边界）

- ❌ 不新增 `/memory-tags` 命令
- ❌ 不新增 `/memory-search` 命令
- ❌ 不做 TUI 交互界面
- ❌ 不做标签编辑/删除功能
- ❌ 不做复杂的遗忘曲线

---

## 2. Data（数据设计）

### 2.1 存储位置

```
~/.pi/agent/roles/{role}/
├── memory/consolidated.md # 主记忆文件
├── memory/daily/
│   └── 2026-02-10.md      # 日常记忆
└── .log/
    └── memory-tags.json   # ← Tag 索引（唯一数据源）
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
              （显示标签云）
```

**同步策略**：
- `memory-tags.json` 是唯一数据源
- `memory/consolidated.md` 中的 `tags` 字段是可选的（方便 LLM 读取）
- 不强制双向同步，简化逻辑

---

## 3. Implementation（实现要点）

### 3.1 修复清单

| 文件 | 修复点 | 优先级 |
|-----|--------|--------|
| `memory-md.ts` | 修复 `extractTagsWithLLM(text, ctx, model)` 参数顺序 | P0 |
| `memory-md.ts` | `addRoleLearningWithTags` 正确调用 tag 提取 | P0 |
| `memory-llm.ts` | `runAutoMemoryExtraction` 提取记忆时同步提取 tag | P0 |
| `memory-tags.ts` | 简化 `updateTagIndex`，只保留核心字段 | P1 |
| `memory-viewer.ts` | `/memories` 导出时附加 Tag Cloud | P1 |

### 3.2 核心函数

```typescript
// 统一入口：保存记忆时提取 tag
async function saveMemoryWithTags(
  ctx: ExtensionContext,
  rolePath: string,
  memory: { id: string; text: string }
): Promise<void> {
  // 1. 保存记忆（已有逻辑）
  await saveMemory(rolePath, memory);
  
  // 2. 提取 tag（异步，不阻塞）
  const result = await extractTagsWithLLM(memory.text, ctx).catch(() => null);
  if (!result || result.tags.length === 0) return;
  
  // 3. 更新索引
  await updateTagIndex(rolePath, memory.id, result.tags);
}

// 更新 tag 索引
function updateTagIndex(
  rolePath: string,
  memoryId: string,
  tags: Array<{ tag: string; confidence: number }>
): void {
  const index = loadTagsIndex(rolePath);
  
  for (const { tag, confidence } of tags) {
    if (!index.tags[tag]) {
      index.tags[tag] = { count: 0, confidence: 0, lastUsed: "", memories: [] };
    }
    index.tags[tag].count++;
    index.tags[tag].confidence = Math.max(index.tags[tag].confidence, confidence);
    index.tags[tag].lastUsed = new Date().toISOString();
    if (!index.tags[tag].memories.includes(memoryId)) {
      index.tags[tag].memories.push(memoryId);
    }
  }
  
  index.memoryIndex[memoryId] = tags.map(t => t.tag);
  saveTagsIndex(rolePath, index);
}
```

### 3.3 Tag Cloud 生成

```typescript
// 用于 /memories 导出的 HTML
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

---

## 4. 验证闭环

```
生成 ──► 存储 ──► 使用
  ▲            │
  └────────────┘
  （看到 Tag Cloud 即验证成功）
```

**验证方式**：
1. 添加一条记忆（如"Vue 3 响应式原理"）
2. 执行 `/memories`
3. 检查输出：
   - 记忆条目旁显示 `[🏷️ vue, reactivity]`
   - 底部显示 Tag Cloud 包含 `vue(1)`
4. 导出 HTML 包含可视化标签云

---

## 5. 不做的功能（明确边界）

| 功能 | 不做原因 |
|-----|---------|
| 标签搜索 | 用全文搜索即可，无需单独实现 |
| 标签编辑 | 复杂度高于收益，重新提取即可 |
| 标签合并 | 使用频次低，手动整理 memory.md 即可 |
| 遗忘曲线 | 简化设计，只保留 count/lastUsed |
| TUI 界面 | 用户明确要求不做 |

---

## 6. 文件修改清单

```
memory-md.ts
  - 修复 extractTagsWithLLM 调用参数
  - addRoleLearningWithTags 调用 saveMemoryWithTags

memory-llm.ts
  - runAutoMemoryExtraction 提取记忆后提取 tag

memory-tags.ts
  - 简化 updateTagIndex
  - 添加 generateTagCloudHTML

memory-viewer.ts
  - buildRoleMemoryViewerMarkdown 附加 Tag Cloud
```
