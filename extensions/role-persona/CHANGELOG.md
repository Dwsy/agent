# Changelog

## 2026-02-10

### Fixed
- **memory 工具修复**: 修复了 `memory` 工具执行时的多个错误
  - `execute` 函数参数命名错误 (`_ctx` → `ctx`)
  - `TAG_MODEL` 环境变量为 `null` 时的空值保护 (`TAG_MODEL || ""`)
  - `extractTagsWithLLM` 调用参数顺序错误
  - 返回结果解构错误，正确提取 `tags` 数组中的 `tag` 字段

### Files Modified
- `index.ts` - 修复 `execute` 函数参数命名
- `memory-tags.ts` - 添加 `TAG_MODEL` 空值保护
- `memory-md.ts` - 修复 `extractTagsWithLLM` 调用参数和返回结果解构

---

## 2025-02-10

### Added
- **按需记忆搜索** (`onDemandSearch`): 第一条用户消息时，自动根据内容搜索相关记忆注入
  - 配置项: `memory.onDemandSearch.enabled` (默认: `true`)
  - 配置项: `memory.onDemandSearch.maxResults` (默认: `5`)
  - 配置项: `memory.onDemandSearch.minScore` (默认: `0.2`)
  - 配置项: `memory.onDemandSearch.alwaysLoadHighPriority` (默认: `true`)
  - 新增函数: `loadMemoryOnDemand()` - 基于查询搜索相关记忆
  - 新增函数: `loadHighPriorityMemories()` - 加载 `[3x]` 以上高频记忆
- **智能记忆加载策略**: 
  - 第一条消息: High Priority + 搜索结果 + 最近2日日记
  - 后续消息: 仅最近2日日记（轻量化）
- **最近存在文件加载**: `readMemoryPromptBlocks()` 改为加载最近2个**实际存在**的日记文件，而非固定今天/昨天

### Changed
- **记忆注入逻辑重构**: `before_agent_start` 事件处理器新增 `isFirstUserMessage` 状态跟踪
- **配置扩展**: `MemoryConfig` 新增 `onDemandSearch` 子配置
- **默认行为**: 第一条消息现在会主动搜索 MEMORY.md 中与用户查询相关的记忆

### Files Modified
- `index.ts` - 主逻辑，新增按需搜索注入
- `config.ts` - 配置类型和默认值
- `memory-md.ts` - 新增 `loadMemoryOnDemand()`, `loadHighPriorityMemories()`, `getRecentDailyMemoryFiles()`
- `pi-role-persona.jsonc` - 新增 `onDemandSearch` 配置示例

---

## 2025-02-10

### Added
- **TOOLS.md 注入支持**: 在 `loadRolePrompts` 中加入 TOOLS.md 文件注入
- **文件更新指导**: 所有 bootstrap 模板文件（AGENTS.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md, HEARTBEAT.md）添加 "何时更新/如何更新" 头部提示
- **备份目录结构**: MEMORY.md 备份现在存入 `.backup/memory/` 子目录，避免根目录混乱

### Changed
- **备份路径**: `MEMORY.backup-${timestamp}.md` → `.backup/memory/MEMORY.backup-${timestamp}.md`
- **现有备份**: 已迁移 25 个历史备份文件到新目录

### Migration
```bash
# 旧备份自动迁移（已执行）
mv ~/.pi/agent/roles/zero/MEMORY.backup*.md ~/.pi/agent/roles/zero/.backup/memory/
```

## Previous

- 初始版本
