# SYSTEM.md 版本说明

## 文件列表

| 文件名 | 大小 | 说明 |
|--------|------|------|
| `SYSTEM.md` | 9.9KB | **当前使用版本**（最终优化版）⭐ |
| `SYSTEM_REFINED.md` | 8.6KB | 精炼优化版备份 |
| `SYSTEM_LOSSLESS.md` | 9.7KB | 无损压缩版备份 |
| `SYSTEM_FINAL.md` | 9.9KB | 最终优化版备份 |
| `SYSTEM_ORIGINAL.md` | 22KB | 原始版本备份 |

## 版本对比

### SYSTEM_ORIGINAL.md（原始版本）

**特点**：
- 完整详细，包含所有示例和说明
- 大量重复的示例代码
- 详细的 Issue/PR 模板
- 完整的路径验证命令
- 扩展计划等非核心内容

**适用场景**：
- 需要详细了解所有细节时
- 新手学习时
- 需要完整参考时

**Token 消耗**：~15,000+ 字符（~500+ 行）

---

### SYSTEM.md（精炼优化版）- 当前使用

**特点**：
- 删除冗余内容，保留核心信息
- 强化警告和重点（🚨、🔴 标记）
- 精简表格和示例
- 统一命令列表
- 详细模板参考 workhub 技能文档

**主要优化**：
1. **Token 利用率提升 ~59%**：从 ~15,000 字符降至 ~8,814 字符
2. **行数减少 ~57%**：从 500+ 行降至 214 行
3. **核心信息密度提升**：删除冗余，强化重点
4. **置信度提升**：明确标注 ✅ 和 ❌，强化警告

**适用场景**：
- 日常使用（推荐）
- 需要快速查找信息时
- Token 预算有限时

**Token 消耗**：~8,814 字符（~214 行）

---

## 切换版本

### 切换到原始版本

```bash
cd ~/.pi/agent
cp SYSTEM_ORIGINAL.md SYSTEM.md
```

### 切换到精炼版本

```bash
cd ~/.pi/agent
cp SYSTEM_REFINED.md SYSTEM.md
```

### 使用软链接（推荐）

```bash
cd ~/.pi/agent
ln -sf SYSTEM_REFINED.md SYSTEM.md  # 使用精炼版本
# 或
ln -sf SYSTEM_ORIGINAL.md SYSTEM.md   # 使用原始版本
```

## 主要差异

### 1. workhub 执行规范

**原始版本**：
```markdown
**⚠️ 重要：文档存储位置**
- **存储位置**：项目根目录下的 `docs/` 目录
- **执行方式**：从项目根目录执行 workhub 命令
- **错误示例**：文档存储在 `~/.pi/agent/skills/workhub/docs/` 中
```

**精炼版本**：
```markdown
**🚨 严重警告：workhub 命令执行规范（违反此规范将导致文档存储在错误位置）**

**绝对禁止的错误方式**：
# ❌ 致命错误 1：直接执行 TypeScript 文件
~/.pi/agent/skills/workhub/lib.ts create issue "任务描述"

# ❌ 致命错误 2：从技能目录执行
cd ~/.pi/agent/skills/workhub
bun run lib.ts create issue "任务描述"

**唯一正确的执行方式**：
# ✅ 正确：从项目根目录执行，使用 bun + 绝对路径
cd /path/to/your-project
bun ~/.pi/agent/skills/workhub/lib.ts create issue "任务描述"
```

### 2. Resource Matrix

**原始版本**：宽表格，每个单元格包含详细说明

**精炼版本**：紧凑表格，只保留核心信息

### 3. 常用命令

**原始版本**：完整的表格，每个命令都有详细示例

**精炼版本**：统一的命令列表，简洁明了

### 4. Issue/PR 模板

**原始版本**：完整的 Markdown 模板，包含所有字段

**精炼版本**：简要说明，详细模板参考 workhub 技能文档

## 推荐使用策略

### 日常使用（推荐）
- **推荐**：`SYSTEM.md`（最终优化版）
- **原因**：
  - 使用关联引用而非复制，符合 SSOT 原则
  - 详细内容在技能文档中，避免重复
  - Token 利用率高（节省 55%）
  - 易于维护，更新时只需修改技能文档
  - 明确告知用户去哪里找详细信息

### 学习参考
- **推荐**：`SYSTEM_ORIGINAL.md`（原始版本）
- **原因**：详细完整，包含所有示例和说明

### Token 预算有限
- **推荐**：`SYSTEM_REFINED.md`（精炼版本）
- **原因**：最小 Token 消耗（节省 61%）

### 需要模板但不想看原始版本
- **推荐**：`SYSTEM_LOSSLESS.md`（无损压缩版）
- **原因**：保留简化的 Issue/PR 模板，节省 56% Token

## 版本历史

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-01-09 | SYSTEM.md | 切换为使用 fd 替代 find（fd 默认排除 node_modules） |
| 2026-01-09 | SYSTEM.md | 添加 find 命令限制规则（排除 node_modules 等依赖目录） |
| 2026-01-09 | SYSTEM.md | 优化文件读取优先级（使用 bat+sed 进行分页） |
| 2026-01-09 | SYSTEM.md | 添加文件读取优先级规则（优先使用 bat+grep） |
| 2026-01-07 | SYSTEM.md | 最终优化版（当前使用，关联引用）⭐ |
| 2026-01-07 | SYSTEM_FINAL.md | 最终优化版备份 |
| 2026-01-07 | SYSTEM_LOSSLESS.md | 无损压缩版备份 |
| 2026-01-07 | SYSTEM_REFINED.md | 精炼优化版备份 |
| 2026-01-07 | SYSTEM_ORIGINAL.md | 原始版本备份 |

## 注意事项

1. **当前使用版本**：`SYSTEM.md`（精炼优化版）
2. **备份文件**：`SYSTEM_ORIGINAL.md` 和 `SYSTEM_REFINED.md` 是备份，不会自动更新
3. **手动同步**：如果修改了 `SYSTEM.md`，需要手动更新备份文件
4. **Git 版本控制**：建议使用 Git 管理 SYSTEM.md 的历史版本

## 反馈和改进

如果发现精炼版本缺少重要信息，或者有进一步优化的建议，请：

1. 记录缺失的内容
2. 评估是否需要恢复到原始版本
3. 考虑如何在保持精炼的同时添加必要信息

## 相关文档

- `docs/SYSTEM_REFINEMENT_SUMMARY.md` - 精炼优化总结
- `docs/issues/20260107-修复 workhub 文档存储位置错误.md` - workhub 修复 Issue
- `docs/pr/20260107-修复 workhub 文档存储位置错误.md` - workhub 修复 PR