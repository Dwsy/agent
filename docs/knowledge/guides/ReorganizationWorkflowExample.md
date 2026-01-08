# 知识库目录重组工作流 - 实际使用示例

## 🎯 示例场景

将分散在 `docs/knowledge/concepts/` 根目录的文档重新组织到合适的子目录中。

---

## Step 1: 分析当前结构

**指令**:
```
请分析 docs/knowledge/concepts/ 目录的当前结构，列出所有文档及其路径。
帮我识别哪些文档应该移动到子目录中。
```

**Agent 执行**:
```bash
find docs/knowledge/concepts -name "*.md" -type f
```

**输出**:
```
docs/knowledge/concepts/KnowledgeBase.md
docs/knowledge/concepts/CurseOfKnowledge.md
docs/knowledge/concepts/core/tools/AceTool.md
docs/knowledge/concepts/core/architecture/SkillSystem.md
docs/knowledge/concepts/core/workflow/Workhub.md
docs/knowledge/concepts/frontend/responsive/design/MobileFirst.md
docs/knowledge/concepts/frontend/pwa/advanced/optimization/ProgressiveWebApp.md
```

**分析结果**:
- `KnowledgeBase.md` 和 `CurseOfKnowledge.md` 在根目录，应该移动到 `core/` 目录
- 其他文档已经正确分类

---

## Step 2: 制定重组计划

**指令**:
```
请帮我制定一个重组计划，将 KnowledgeBase.md 和 CurseOfKnowledge.md 移动到 core/ 目录下。
```

**计划**:
1. 移动 `KnowledgeBase.md` → `core/management/KnowledgeBase.md`
2. 移动 `CurseOfKnowledge.md` → `core/cognitive/CurseOfKnowledge.md`
3. 创建必要的子目录
4. 更新 index.md

---

## Step 3: 执行移动操作

**指令**:
```
请按照上面的计划执行以下操作：
1. 创建 docs/knowledge/concepts/core/management/ 目录
2. 创建 docs/knowledge/concepts/core/cognitive/ 目录
3. 移动 KnowledgeBase.md 到 core/management/
4. 移动 CurseOfKnowledge.md 到 core/cognitive/
5. 更新 docs/knowledge/index.md
```

**Agent 执行**:
```bash
# 创建目录
mkdir -p docs/knowledge/concepts/core/management
mkdir -p docs/knowledge/concepts/core/cognitive

# 移动文件
mv docs/knowledge/concepts/KnowledgeBase.md docs/knowledge/concepts/core/management/
mv docs/knowledge/concepts/CurseOfKnowledge.md docs/knowledge/concepts/core/cognitive/

# 更新索引
bun ~/.pi/agent/skills/knowledge-base/lib.ts index
```

---

## Step 4: 验证结果

**指令**:
```
请验证重组结果：
1. 列出新的目录结构
2. 确认所有文档都已正确移动
3. 检查 index.md 是否正确更新
```

**验证结果**:
```
✅ docs/knowledge/concepts/core/management/KnowledgeBase.md - 已移动
✅ docs/knowledge/concepts/core/cognitive/CurseOfKnowledge.md - 已移动
✅ docs/knowledge/index.md - 已更新
✅ 所有文档完整
```

---

## Step 5: 生成变更报告

**指令**:
```
请生成一份详细的变更报告。
```

**变更报告**:
```markdown
# 知识库重组变更报告

## 变更时间
2026-01-07

## 移动的文档

| 旧路径 | 新路径 |
|--------|--------|
| docs/knowledge/concepts/KnowledgeBase.md | docs/knowledge/concepts/core/management/KnowledgeBase.md |
| docs/knowledge/concepts/CurseOfKnowledge.md | docs/knowledge/concepts/core/cognitive/CurseOfKnowledge.md |

## 创建的目录

- docs/knowledge/concepts/core/management/
- docs/knowledge/concepts/core/cognitive/

## 更新的文件

- docs/knowledge/index.md

## 影响范围

- 无文档引用需要更新
- 目录结构更加清晰
- 分类更加合理
```

---

## 🎯 完整指令示例

### 简单场景：单个文档移动

```
请将 docs/knowledge/concepts/MobileFirst.md 移动到 docs/knowledge/concepts/frontend/responsive/MobileFirst.md
```

### 中等场景：批量移动

```
请将 docs/knowledge/concepts/ 目录下所有 frontend 相关的文档移动到 docs/knowledge/concepts/frontend/ 目录下。
包括：MobileFirst.md, ResponsiveDesign.md, ProgressiveWebApp.md
移动后请更新 index.md。
```

### 复杂场景：目录重组

```
请重组 docs/knowledge/concepts/ 的目录结构：

1. 将 KnowledgeBase.md 和 CurseOfKnowledge.md 移动到 core/ 下的合适子目录
2. 将所有 frontend 相关文档移动到 frontend/ 目录下
3. 将所有 backend 相关文档移动到 backend/ 目录下

执行后请：
- 验证所有文档都已正确移动
- 删除空目录
- 更新 index.md
- 生成变更报告
```

---

## ⚠️ 注意事项

### 1. 备份重要数据

```
请先备份 docs/knowledge/ 目录到 docs/knowledge-backup-20260107/
然后再执行移动操作。
```

### 2. 检查文档引用

```
在移动文档前，请检查是否有其他文档引用了即将移动的文档。
如果有，请更新这些引用。
```

### 3. 逐步执行

```
请先移动第一批文档，验证结果后再移动第二批文档。
```

---

## 🚀 快速开始

### 最简单的使用方式

```
请将 [文档路径] 移动到 [目标路径]。
```

### 最完整的工作流

```
1. 请分析 docs/knowledge/ 的当前结构
2. 帮我制定重组计划
3. 按照计划执行移动
4. 验证结果
5. 生成变更报告
```

---

## 📚 相关文档

- [[ReorganizationWorkflow]] - 重组工作流完整指南
- [[HowToOrganizeKnowledge]] - 知识组织策略
- [[KnowledgeBase]] - 知识库核心概念

---

**状态**: ✅ 示例已验证

**最后更新**: 2026-01-07