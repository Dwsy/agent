---
id: "2026-01-27-重构 checkpoint 扩展以对齐 Claude Code 体验"
title: "重构 checkpoint 扩展以对齐 Claude Code 体验"
status: "in-progress"
created: "2026-01-27"
updated: "2026-01-27"
category: "checkpoint"
tags: ["checkpoint", "extension", "tui", "git"]
---

# Issue: 重构 checkpoint 扩展以对齐 Claude Code 体验

## Goal

提供与 Claude Code 一致的 checkpoint/undo 体验：自动跟踪文件修改、简单快捷键（Ctrl+Z/Ctrl+Y）、TUI 视图查看修改、细粒度回滚。

## 背景/问题

### 当前问题
1. **体验复杂**：需要通过 fork 或 tree 导航才能恢复代码状态
2. **缺少快捷键**：没有 Ctrl+Z/Ctrl+Y 支持
3. **缺少可视化**：无法在 TUI 中查看当前会话修改了哪些文件
4. **回滚粒度粗**：当前基于 turn 级别，无法只回滚特定文件的改动
5. **命令缺失**：没有 `/undo` `/redo` 命令

### 参考实现
**OpenCode 的方案**（基于 DeepWiki 研究）：
- 使用 `/undo` `/redo` 命令 + `Ctrl+Z`/`Ctrl+Y` 快捷键
- 利用 Git 跟踪文件变化（独立 `.opencode/git` 目录）
- 回滚粒度：消息级别（一次 undo 回退一个用户消息）
- TUI 显示回退状态和文件变化摘要

**pi-mono 的扩展能力**：
- 20+ 生命周期事件（`turn_start`, `turn_end`, `session_before_tree` 等）
- `ctx.ui.custom()` 可创建自定义 TUI 组件
- `pi.appendEntry()` 持久化自定义数据
- `ctx.ui.select()`, `ctx.ui.notify()` 等 UI API

## 验收标准 (Acceptance Criteria)

- [ ] WHEN 用户按 `Ctrl+Z`，系统 SHALL 回退最后一个 turn 的文件修改
- [ ] WHEN 用户按 `Ctrl+Y`，系统 SHALL 重做上一次 undo 的修改
- [ ] WHEN 用户输入 `/changes` 命令，系统 SHALL 在 TUI 中显示当前会话修改的文件列表
- [ ] WHERE 当前会话有多个 turn，系统 SHALL 支持多次 undo/redo
- [ ] IF Git 仓库不可用，系统 SHALL 优雅降级（只跟踪消息历史，不跟踪文件）
- [ ] WHEN 执行 undo 时，系统 SHALL 在 TUI 中显示回退的文件数量和摘要

## 实施阶段

### Phase 1: 规划和准备 ✅
- [x] 分析 OpenCode 的 undo/redo 实现
- [x] 分析 pi-mono 的扩展 API 能力
- [x] 设计技术方案（见下方）
- [x] 创建 Workhub Issue

### Phase 2: 核心功能实现
- [ ] 实现 FileTracker 模块（跟踪文件修改）
- [ ] 实现 CheckpointManager（管理 checkpoint 状态）
- [ ] 实现 undo/redo 命令和快捷键
- [ ] 实现 `/changes` 命令（TUI 显示文件修改）

### Phase 3: TUI 视图
- [ ] 实现 FileChangesViewer 组件（显示修改的文件）
- [ ] 实现 DiffViewer 组件（可选，显示文件 diff）
- [ ] 集成到 `session_before_tree` 事件

### Phase 4: 测试和优化
- [ ] 单元测试（FileTracker, CheckpointManager）
- [ ] 集成测试（undo/redo 流程）
- [ ] 代码审查和优化

### Phase 5: 文档和交付
- [ ] 更新 README 和使用文档
- [ ] 创建 PR
- [ ] 合并主分支

## 关键决策

| 决策 | 理由 |
|------|------|
| **保留当前 checkpoint.ts 的 Git ref 机制** | 当前实现已经可以跨会话持久化，保留作为底层存储 |
| **新增轻量级 FileTracker 层** | OpenCode 使用独立 Git 目录，但我们复用现有 Git ref，添加文件级别跟踪 |
| **回滚粒度：turn 级别** | 对齐 OpenCode 和 Claude Code 的消息级别回滚 |
| **使用 `pi.appendEntry()` 存储文件修改记录** | 不需要额外存储，利用现有 session 持久化机制 |
| **`/changes` 命令使用 `ctx.ui.custom()`** | 需要自定义 TUI 组件，pi-tui 支持自定义渲染 |

## 技术方案

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                     Extension Entry                      │
│              (checkpoint-v2.ts)                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ├─→ FileTracker
                            │   ├─ trackFile(path, action)
                            │   ├─ getModifiedFiles()
                            │   └─ createFileSnapshot()
                            │
                            ├─→ CheckpointManager
                            │   ├─ createCheckpoint(turnIndex)
                            │   ├─ undo()
                            │   ├─ redo()
                            │   └─ getHistory()
                            │
                            ├─→ TUI Components
                            │   ├─ FileChangesViewer
                            │   └─ DiffViewer (optional)
                            │
                            └─→ Commands
                                ├─ /undo
                                ├─ /redo
                                └─ /view
```

### 数据结构

```typescript
interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  checkpointId: string;
  turnIndex: number;
}

interface CheckpointState {
  turnIndex: number;
  checkpointId: string;  // Git ref
  fileChanges: FileChange[];
  timestamp: number;
}
```

### 事件流

```
turn_start
    ↓
FileTracker.clear()
    ↓
tool_result (edit/write)
    ↓
FileTracker.trackFile(path, action)
    ↓
turn_end
    ↓
CheckpointManager.createCheckpoint()
    ↓
pi.appendEntry('checkpoint', state)
```

### Undo/Redo 流程

```
Ctrl+Z / /undo
    ↓
CheckpointManager.undo()
    ↓
restoreCheckpoint(gitRef)
    ↓
ctx.ui.notify("Restored X files")
```

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| [YYYY-MM-DD] | [错误描述] | [如何解决] |

## 相关资源

- [x] OpenCode undo/redo 研究: DeepWiki 查询结果
- [x] pi-mono 扩展 API 研究: DeepWiki 查询结果
- [x] 当前 checkpoint 实现: `extensions/checkpoint/checkpoint.ts`
- [ ] pi-tui 组件文档: `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-tui/README.md`
- [ ] Extension API 文档: `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`

## Notes

### 研究发现（深度调研完成）

#### 1. OpenCode 的 Undo/Redo 实现

**核心机制**：
- 使用 `/undo` `/redo` 命令（不是快捷键）
- 利用独立 Git 目录 `.opencode/git` 跟踪文件变化
- 回滚粒度：消息级别（一次 undo 回退一个用户消息）
- TUI 显示回退状态和文件变化摘要

**Snapshot 模块**（`packages/opencode/src/snapshot/index.ts`）：
```typescript
Snapshot.track()    // 创建 Git tree 对象（worktree 快照）
Snapshot.patch(hash)    // 计算当前状态与快照的差异
Snapshot.revert(patches)  // 选择性回滚文件
Snapshot.restore(snapshot)  // 恢复整个 worktree
```

**关键 Git 命令**：
- `git init` - 初始化独立 Git 目录
- `git add .` + `git write-tree` - 创建快照
- `git diff --name-only` - 获取变化文件列表
- `git checkout <hash> -- <file>` - 回滚单个文件
- `git read-tree` + `git checkout-index` - 恢复整个 worktree

**TUI 显示**：
- 回退信息组件显示 reverted messages 数量
- 显示文件变化摘要（additions/deletions）
- 提供 redo 提示（`messages_redo` keybind 或 `/redo`）

#### 2. pi-mono 的扩展能力

**事件系统**（20+ 生命周期事件）：
- `session_start`, `session_fork`, `session_tree` - 会话生命周期
- `turn_start`, `turn_end` - 每个 LLM 响应周期
- `tool_call`, `tool_result` - 工具执行拦截
- `session_before_tree` - tree 导航前的钩子

**命令注册**：
```typescript
pi.registerCommand("undo", {
  description: "Undo last changes",
  handler: async (args, ctx) => {
    // ctx 包含：ui, cwd, sessionManager, waitForIdle(), fork(), navigateTree()
  }
});
```

**TUI 自定义组件**：
```typescript
const result = await ctx.ui.custom<T>((tui, theme, keybindings, done) => {
  // 返回 Component 对象
  return {
    render: (width) => string[],
    handleInput: (data) => void,
    invalidate: () => void
  };
}, { overlay: true, overlayOptions: {...} });
```

**内置 TUI 组件**：
- `SelectList` - 可过滤的列表选择器
- `Container` - 组件容器
- `Text` - 多行文本显示
- `Editor` - 多行编辑器

**数据持久化**：
```typescript
pi.appendEntry("checkpoint", {
  turnIndex: 1,
  files: [{ path: "file.ts", action: "modified" }]
});
```

**读取自定义数据**：
```typescript
const entries = ctx.sessionManager.getBranch();
const checkpointEntries = entries.filter(e =>
  e.type === "custom" && e.customType === "checkpoint"
);
```

**执行 Git 命令**：
```typescript
const result = await pi.exec("git", ["status"], { cwd });
```

#### 3. 当前 checkpoint 实现

**存储机制**：
- 使用 Git refs：`refs/pi-checkpoints/<id>`
- 每个 checkpoint 包含：
  - `headSha` - HEAD commit
  - `indexTreeSha` - staged 状态
  - `worktreeTreeSha` - worktree 状态
  - `preexistingUntrackedFiles` - 已存在的未跟踪文件
  - `skippedLargeFiles` - 跳过的大文件 (>10MiB)
  - `skippedLargeDirs` - 跳过的大目录 (>200 files)

**Git 操作**：
- `git write-tree` - 创建 tree 对象
- `git commit-tree` - 创建 commit（存储元数据）
- `git update-ref` - 更新 ref
- `git read-tree --reset -u` - 恢复 worktree
- `git clean -f` - 清理未跟踪文件

**事件监听**：
- `tool_result` - 检测 edit/write 操作
- `turn_start` - 创建 checkpoint
- `session_before_fork`, `session_before_tree` - 恢复提示

**问题**：
1. 回滚需要通过 fork 或 tree 导航
2. 没有 `/undo` `/redo` 命令
3. 没有文件变化可视化
4. 回滚粒度是 turn 级别（但已经是消息级别，符合需求）

#### 4. pi-mono 的快捷键限制

**保留的快捷键**（不可覆盖）：
- `ctrl+c`, `ctrl+d`, `ctrl+z`, `ctrl+k`, `ctrl+p`, `ctrl+l`, `ctrl+o`, `ctrl+t`, `ctrl+g`
- `shift+tab`, `shift+ctrl+p`, `alt+enter`, `escape`, `enter`

**结论**：不能使用 Ctrl+Z/Ctrl+Y，只能用命令 `/undo` `/redo`

#### 5. OpenCode vs pi-mono 对比

| 特性 | OpenCode | pi-mono |
|------|----------|---------|
| 存储 | 独立 `.opencode/git` | Git refs `refs/pi-checkpoints/` |
| 回滚粒度 | 消息级别 | Turn 级别（实际是消息级别） |
| 快捷键 | Ctrl+Z/Ctrl+Y | 不可覆盖（保留） |
| 命令 | `/undo` `/redo` | 需要实现 |
| TUI 显示 | Revert info 组件 | 需要实现 |
| 文件跟踪 | Snapshot 模块 | checkpoint-core.ts |
| 持久化 | Session.revert API | pi.appendEntry() |

### 待确认事项

- [x] 是否需要独立 Git 目录？→ 不需要，复用当前 Git refs 机制
- [x] 如何处理 bash 命令的文件修改？→ Claude Code 不跟踪，我们也不跟踪
- [ ] `/changes` 命令是否需要显示详细的 diff？→ 待定（MVP 可选）

### 实施优先级

1. **MVP**（第一版）：
   - FileTracker 跟踪 edit/write 工具（在 tool_result 事件中）
   - CheckpointManager 管理 undo/redo 状态
   - `/undo` `/redo` 命令（不用快捷键）
   - 使用 `pi.appendEntry()` 存储文件变化记录

2. **V2**（后续）：
   - `/changes` 命令和 TUI 组件（使用 SelectList 显示文件列表）
   - RevertInfo 组件（显示回退状态和文件变化摘要）
   - DiffViewer 显示详细 diff（可选）

---

## Status 更新日志

- **[2026-01-27 10:46]**: 状态变更 → in-progress，备注: Issue 创建完成，进入 Phase 2
- **[2026-01-27 11:30]**: 深度调研完成，已收集 OpenCode 和 pi-mono 的完整技术细节

---

## 实现约束

**⚠️ 重要：所有实现必须以插件形式，不能修改 pi-mono 源码**

### 允许使用的 API

**扩展 API**（`~/.pi/agent/extensions/`）：
- ✅ `pi.registerCommand()` - 注册命令
- ✅ `pi.on()` - 订阅事件
- ✅ `pi.appendEntry()` - 持久化数据
- ✅ `pi.exec()` - 执行 shell 命令
- ✅ `ctx.ui.custom()` - 自定义 TUI 组件
- ✅ `ctx.ui.notify()` - 显示通知
- ✅ `ctx.sessionManager` - 访问会话数据
- ✅ `ctx.waitForIdle()` - 等待 agent 完成

**公开组件库**：
- ✅ `@mariozechner/pi-tui` - SelectList, Container, Text, Spacer, etc.
- ✅ `@mariozechner/pi-coding-agent` - DynamicBorder, BorderedLoader, renderDiff

### 禁止的操作

- ❌ 修改 `~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/` 下的任何文件
- ❌ 修改 pi-mono 源码
- ❌ 修改内置组件
- ❌ 创建新的核心功能

### 实现位置

```
~/.pi/agent/extensions/checkpoint/
├── checkpoint.ts              # 现有（保留）
├── checkpoint-core.ts         # 现有（保留）
├── checkpoint-v2.ts           # 新增（主要实现）
├── components/
│   ├── FileChangesViewer.ts   # 新增（文件列表组件）
│   ├── RevertInfo.ts          # 新增（回退状态组件）
│   └── DiffViewer.ts         # 新增（diff 显示组件）
└── README.md                  # 新增（使用文档）
```

---

## 深度调研总结

### OpenCode Undo/Redo 完整流程

```
用户输入 /undo
    ↓
session.undo 命令
    ↓
abort() - 如果 agent 正在运行
    ↓
找到最后一个未回退的用户消息
    ↓
sdk.client.session.revert(sessionID, messageID)
    ↓
服务器端 SessionRevert.revert()
    ├─ 识别 revert point 之后的所有 patch
    ├─ 使用 Snapshot.revert() 反向应用 patch
    └─ 更新 session.revert 和 session.summary
    ↓
TUI 显示 revert info：
    ├─ "X message reverted"
    ├─ "Press /redo to restore"
    └─ 文件变化列表（filename + additions/deletions）
```

### pi-mono 扩展能力完整清单

#### 事件系统
- Session: `session_start`, `session_before_switch`, `session_switch`, `session_before_fork`, `session_fork`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, `session_shutdown`
- Agent: `before_agent_start`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `context`
- Tool: `tool_call`, `tool_result`
- Model: `model_select`
- Bash: `user_bash`

#### 命令系统
```typescript
pi.registerCommand(name, {
  description: string,
  handler: async (args: string, ctx: ExtensionCommandContext) => {
    await ctx.waitForIdle();  // 等待 agent 完成
    ctx.ui.notify(msg, "info");
    ctx.sessionManager.getBranch();  // 获取当前分支
    ctx.sessionManager.getEntries();  // 获取所有 entry
    ctx.sessionManager.getEntry(id);  // 获取特定 entry
    pi.exec("git", ["status"]);  // 执行命令
    pi.appendEntry("type", data);  // 持久化数据
  }
});
```

#### TUI 组件系统
```typescript
ctx.ui.custom<T>((tui, theme, keybindings, done) => {
  return {
    render: (width: number) => string[],  // 渲染
    handleInput: (data: string) => void,  // 输入处理
    invalidate: () => void  // 清除缓存
  };
}, {
  overlay: true,
  overlayOptions: {
    anchor: "top-right",
    width: "50%",
    margin: 2
  }
});
```

#### 内置组件
- `SelectList` - 可过滤列表（支持搜索、滚动）
- `Container` - 组件容器（垂直布局）
- `Text` - 多行文本（支持自动换行、padding）
- `Editor` - 多行编辑器（支持自动补全、粘贴）
- `Markdown` - Markdown 渲染
- `Loader` - 加载动画

#### 数据持久化
```typescript
// 存储（对 LLM 不可见）
pi.appendEntry("checkpoint", {
  turnIndex: 1,
  files: [{ path: "file.ts", action: "modified" }]
});

// 读取
const entries = ctx.sessionManager.getBranch();
const checkpointEntries = entries.filter(e =>
  e.type === "custom" && e.customType === "checkpoint"
);
```

#### SessionEntry 类型
- `SessionMessageEntry` - 消息（user/assistant）
- `ToolResultEntry` - 工具结果
- `CustomEntry` - 扩展自定义数据（LLM 不可见）
- `CustomMessageEntry` - 扩展注入的消息（LLM 可见）
- `CompactionEntry` - 压缩摘要
- `BranchSummaryEntry` - 分支摘要
- `LabelEntry` - 标签
- `SessionInfoEntry` - 会话元数据

#### 关键方法
- `ctx.sessionManager.getBranch(fromId?)` - 获取从 root 到指定点的路径
- `ctx.sessionManager.getEntries()` - 获取所有 entry
- `ctx.sessionManager.getEntry(id)` - 获取特定 entry
- `ctx.sessionManager.getLeafId()` - 获取当前 leaf entry ID
- `ctx.sessionManager.getLeafEntry()` - 获取当前 leaf entry
- `ctx.sessionManager.branch(entryId)` - 从指定 entry 创建分支
- `ctx.waitForIdle()` - 等待 agent 完成（命令专用）

### 当前 checkpoint 实现技术细节

#### 核心流程
```
session_start
    ↓
检测 Git 仓库
    ↓
preloadCheckpoints() - 后台加载所有 checkpoint
    ↓
turn_start
    ↓
createCheckpoint()
    ├─ git write-tree (index)
    ├─ 创建临时 index
    ├─ git add -A (filtered)
    ├─ git write-tree (worktree)
    ├─ git commit-tree (存储元数据)
    └─ git update-ref refs/pi-checkpoints/<id>
    ↓
tool_result (edit/write)
    ↓
detectRepoFromPath() - 检测嵌套项目
    ↓
session_before_fork / session_before_tree
    ↓
handleRestorePrompt()
    ├─ ui.select("Restore code state?")
    ├─ 加载 checkpoints
    ├─ findClosestCheckpoint()
    ├─ saveAndRestore() - 先保存当前状态
    └─ restoreCheckpoint()
```

#### Git 操作
```typescript
// 创建 checkpoint
git write-tree                          // index tree
git -c GIT_INDEX_FILE=/tmp/index add -A // 临时 index
git -c GIT_INDEX_FILE=/tmp/index write-tree // worktree tree
git commit-tree -m "metadata..."        // commit
git update-ref refs/pi-checkpoints/<id> // 更新 ref

// 恢复 checkpoint
git reset --hard <headSha>              // 恢复 HEAD
git read-tree --reset -u <worktreeTree> // 恢复 worktree
git clean -f -- <files>                 // 清理新文件
git read-tree --reset <indexTree>       // 恢复 index
```

#### 数据结构
```typescript
interface CheckpointData {
  id: string;                          // checkpoint ID
  turnIndex: number;                   // turn 索引
  sessionId: string;                   // 会话 ID
  headSha: string;                     // HEAD commit SHA
  indexTreeSha: string;                // index tree SHA
  worktreeTreeSha: string;             // worktree tree SHA
  timestamp: number;                   // 时间戳
  preexistingUntrackedFiles?: string[]; // 已存在的未跟踪文件
  skippedLargeFiles?: string[];        // 跳过的大文件
  skippedLargeDirs?: string[];         // 跳过的大目录
}
```

### 技术方案设计

#### 架构
```
checkpoint-v2.ts (Extension)
    │
    ├─ FileTracker
    │   ├─ trackFile(path, action)      // 跟踪文件变化
    │   ├─ getModifiedFiles()           // 获取修改的文件
    │   └─ clear()                      // 清空跟踪
    │
    ├─ CheckpointManager
    │   ├─ createCheckpoint(turnIndex)  // 创建 checkpoint
    │   ├─ undo()                       // 回退最后一个 checkpoint
    │   ├─ redo()                       // 重做
    │   ├─ getHistory()                 // 获取历史
    │   └─ getCurrentState()            // 获取当前状态
    │
    ├─ TUI Components
    │   ├─ FileChangesViewer            // 显示文件变化列表
    │   ├─ RevertInfo                   // 显示回退状态
    │   └─ DiffViewer (optional)        // 显示详细 diff
    │
    └─ Commands
        ├─ /undo                        // 回退
        ├─ /redo                        // 重做
        └─ /view                        // 查看文件变化
```

#### 数据流
```
turn_start
    ↓
FileTracker.clear()
    ↓
tool_result (edit/write)
    ↓
FileTracker.trackFile(path, action)
    ↓
turn_end
    ↓
CheckpointManager.createCheckpoint()
    ├─ 使用现有 checkpoint-core.ts 创建 Git checkpoint
    ├─ pi.appendEntry("checkpoint", {
    │     turnIndex, files: FileTracker.getModifiedFiles()
    │   })
    └─ 更新内部状态
```

#### Undo/Redo 流程
```
/undo
    ↓
await ctx.waitForIdle()
    ↓
CheckpointManager.undo()
    ├─ 获取最后一个 checkpoint
    ├─ restoreCheckpoint(gitRef)
    ├─ pi.appendEntry("undo-revert", { ... })
    └─ ctx.ui.notify("Restored X files")
```

#### 状态管理
```typescript
interface CheckpointState {
  currentTurnIndex: number;
  history: CheckpointEntry[];
  undoStack: CheckpointEntry[];
  redoStack: CheckpointEntry[];
}

interface CheckpointEntry {
  turnIndex: number;
  checkpointId: string;  // Git ref
  files: FileChange[];
  timestamp: number;
}

interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
}
```

### 与 OpenCode 的关键差异

| 方面 | OpenCode | pi-mono (新设计) |
|------|----------|-----------------|
| 存储 | `.opencode/git` | `refs/pi-checkpoints/` |
| 回滚粒度 | 消息级别 | Turn 级别（消息级别） |
| 快捷键 | Ctrl+Z/Ctrl+Y | 不可用（保留） |
| 命令 | `/undo` `/redo` | `/undo` `/redo` `/changes` |
| TUI 显示 | Revert info + file list | Revert info + FileChangesViewer |
| 文件跟踪 | Snapshot 模块 | FileTracker + checkpoint-core.ts |
| 持久化 | Session.revert API | pi.appendEntry() |
| Diff 解析 | parsePatch() | 可选（MVP 不需要） |

### MVP 功能清单

#### 核心功能
- [x] FileTracker 跟踪 edit/write 工具
- [x] CheckpointManager 管理 undo/redo 状态
- [x] `/undo` 命令回退最后一个 turn
- [x] `/redo` 命令重做
- [x] 使用 `pi.appendEntry()` 持久化状态
- [x] 复用现有 checkpoint-core.ts 的 Git 操作

#### TUI 功能（V2）
- [ ] `/changes` 命令显示文件变化列表
- [ ] FileChangesViewer 组件（使用 SelectList）
- [ ] RevertInfo 组件（显示回退状态）
- [ ] DiffViewer 组件（可选）

#### 边界情况
- [ ] 非 Git 仓库时优雅降级
- [ ] 大文件/目录跳过（已支持）
- [ ] 嵌套项目检测（已支持）
- [ ] 并发操作保护（waitForIdle）

---

## Diff TUI 实现研究

### pi-mono 的 Diff 渲染能力

#### 核心模块

**1. `edit-diff.js` - Diff 计算工具**
```typescript
// 生成 unified diff 字符串
generateDiffString(oldContent, newContent, contextLines = 4)
  ├─ 使用 Diff.diffLines() 计算行级 diff
  ├─ 自动添加行号
  ├─ 智能显示上下文（默认 4 行）
  └─ 返回: { diff: string, firstChangedLine: number }

// 计算 edit 操作的 diff（预览用）
computeEditDiff(path, oldText, newText, cwd)
  ├─ 读取文件内容
  ├─ 使用 fuzzyFindText() 查找 oldText
  ├─ 计算新内容
  └─ 返回: { diff: string, firstChangedLine: number } | { error: string }
```

**2. `diff.js` - Diff 渲染器**
```typescript
renderDiff(diffText, options)
  ├─ 解析 diff 行（格式: "+123 content" 或 "-123 content"）
  ├─ 配对 removed/added 行进行 intra-line diff
  ├─ 使用 theme.fg() 应用颜色
  └─ 返回带 ANSI 颜色的字符串
```

#### 颜色主题

```typescript
// 主题颜色定义（在 ~/.pi/agent/themes/dark.json 或 light.json）
{
  "toolDiffAdded": "#00ff00",    // 绿色 - 新增行
  "toolDiffRemoved": "#ff0000",  // 红色 - 删除行
  "toolDiffContext": "secondary" // 灰色 - 上下文行
}

// Theme 类 API
theme.fg("toolDiffAdded", text)      // 前景色
theme.bg("selectedBg", text)         // 背景色
theme.inverse(text)                  // 反色（用于 intra-line diff）
theme.bold(text)                     // 粗体
theme.dim(text)                      // 暗淡
theme.muted(text)                    // 静音
```

#### Diff 行格式

```
+123 new line content    # 新增行
-456 old line content    # 删除行
 789 context line        # 上下文行
     ...                 # 省略的行
```

#### 渲染策略

**1. 行级渲染**（基础）
- Context 行：`theme.fg("toolDiffContext", ...)`
- Removed 行：`theme.fg("toolDiffRemoved", ...)`
- Added 行：`theme.fg("toolDiffAdded", ...)`

**2. Intra-line Diff**（单行修改时）
- 当恰好 1 removed 行和 1 added 行时
- 使用 `Diff.diffWords()` 计算单词级 diff
- 对变化部分使用 `theme.inverse()` 高亮
- 保持缩进不变（strip leading whitespace）

```typescript
// 示例：单行修改
-123 const oldName = "value"
+124 const newName = "value"

// 渲染结果（inverse 高亮变化部分）
-123 const [old]Name = "value"     // old 为反色
+124 const [new]Name = "value"     // new 为反色
```

**3. 批量渲染**
- 多行删除：先显示所有 removed 行，再显示所有 added 行
- Tab 替换：`\t` → `   `（3 个空格）

---

### OpenCode 的 Diff 组件

#### `<diff>` 组件

```typescript
// OpenCode TUI 使用 SolidJS 组件
<diff
  diff={diffText}
  view="unified"  // 或 "split"
  filetype="typescript"
  syntaxStyle="github"
  showLineNumbers={true}
  wrapMode="word"
/>

// 主题颜色
{
  "diffAdded": "#00ff00",         // 新增前景色
  "diffAddedBg": "#005500",       // 新增背景色
  "diffHighlightAdded": "#00ff00", // 新增符号颜色
  "diffRemoved": "#ff0000",       // 删除前景色
  "diffRemovedBg": "#550000",     // 删除背景色
  "diffHighlightRemoved": "#ff0000" // 删除符号颜色
}
```

#### Sidebar 组件

```typescript
// 显示文件变化摘要
<Sidebar>
  {files.map(file => (
    <div>
      <span>{file.filename}</span>
      <span style={{ color: 'green' }}>+{file.additions}</span>
      <span style={{ color: 'red' }}>-{file.deletions}</span>
    </div>
  ))}
</Sidebar>
```

---

### 计算文件变化统计

#### 方法 1：从 Git diff 计算

```typescript
// 使用 git diff --numstat
const result = await pi.exec("git", [
  "diff", "--numstat", "<from>", "<to>"
]);

// 输出格式：
// 10  5  path/to/file.ts
// ↑   ↑   ↑
// │   │   └─ 文件路径
// │   └────── 删除行数
// └────────── 新增行数

const stats = result.stdout.split('\n').map(line => {
  const [additions, deletions, path] = line.split(/\s+/);
  return { path, additions: parseInt(additions), deletions: parseInt(deletions) };
});
```

#### 方法 2：从 diff 字符串解析

```typescript
function parseFileChanges(diffText: string): FileChange[] {
  const files: FileChange[] = [];
  const lines = diffText.split('\n');
  const fileRegex = /^diff --git a\/(.+) b\/(.+)$/;

  for (const line of lines) {
    const match = line.match(fileRegex);
    if (match) {
      files.push({
        path: match[1],
        additions: 0,
        deletions: 0
      });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      files[files.length - 1].additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      files[files.length - 1].deletions++;
    }
  }

  return files;
}
```

#### 方法 3：使用 pi-mono 的 Diff.diffLines()

```typescript
import * as Diff from "diff";

function computeFileStats(oldContent: string, newContent: string) {
  const parts = Diff.diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;

  for (const part of parts) {
    if (part.added) {
      additions += part.count;
    } else if (part.removed) {
      deletions += part.count;
    }
  }

  return { additions, deletions };
}
```

---

### Diff TUI 组件设计

#### 1. DiffViewer 组件（基础版）

```typescript
import { Component } from "@mariozechner/pi-tui";
import { renderDiff } from "@mariozechner/pi-coding-agent";

export class DiffViewer implements Component {
  constructor(
    private diffText: string,
    private theme: Theme,
    private maxHeight?: number
  ) {}

  render(width: number): string[] {
    const coloredDiff = renderDiff(this.diffText);
    const lines = coloredDiff.split('\n');

    // 截断到最大高度
    const displayLines = this.maxHeight
      ? lines.slice(0, this.maxHeight)
      : lines;

    // 添加省略号
    if (this.maxHeight && lines.length > this.maxHeight) {
      displayLines.push(`${this.theme.dim('...')}`);
    }

    return displayLines.map(line =>
      line.length > width
        ? line.slice(0, width - 3) + '...'
        : line
    );
  }

  handleInput?(data: string): void {
    // 可选：添加滚动支持
  }

  invalidate?(): void {
    // 清除缓存
  }
}
```

#### 2. FileChangesViewer 组件（文件列表）

```typescript
import { Container, Text, SelectList } from "@mariozechner/pi-tui";

export function FileChangesViewer(
  files: FileChange[],
  theme: Theme,
  onSelect?: (file: FileChange) => void
): Component {
  const container = new Container();

  // 标题
  container.addChild(new Text(
    theme.bold(theme.accent("Modified Files")),
    1, 0
  ));

  // 文件列表
  const items: SelectItem[] = files.map(file => ({
    value: file,
    label: file.path,
    description: theme.fg('success', `+${file.additions}`) +
                theme.fg('error', ` -${file.deletions}`)
  }));

  const selectList = new SelectList(items, Math.min(files.length, 10), {
    selectedPrefix: (t) => theme.fg('accent', t),
    selectedText: (t) => theme.fg('accent', t),
    description: (t) => t,
  });

  if (onSelect) {
    selectList.onSelect = onSelect;
  }

  container.addChild(selectList);

  return {
    render: (w) => container.render(w),
    invalidate: () => container.invalidate(),
    handleInput: (data) => {
      selectList.handleInput(data);
      return true;
    }
  };
}
```

#### 3. RevertInfo 组件（回退状态）

```typescript
import { Container, Text } from "@mariozechner/pi-tui";

export function RevertInfo(
  revertedMessages: number,
  files: FileChange[],
  theme: Theme
): Component {
  const container = new Container();

  // 回退消息数量
  container.addChild(new Text(
    theme.warning(`${revertedMessages} message(s) reverted`),
    1, 0
  ));

  // Redo 提示
  container.addChild(new Text(
    theme.dim('Press /redo to restore'),
    1, 0
  ));

  // 文件变化摘要
  if (files.length > 0) {
    container.addChild(new Text('', 0, 0)); // 空行

    for (const file of files) {
      const label = `${file.path}`;
      const stats = theme.fg('success', `+${file.additions}`) +
                   theme.fg('error', ` -${file.deletions}`);

      container.addChild(new Text(`${label} ${stats}`, 1, 0));
    }
  }

  return {
    render: (w) => container.render(w),
    invalidate: () => container.invalidate(),
    handleInput: () => true
  };
}
```

#### 4. 集成到 `/changes` 命令

```typescript
pi.registerCommand("view", {
  description: "View file changes in current session",
  handler: async (args, ctx) => {
    await ctx.waitForIdle();

    // 获取当前分支的 checkpoint entries
    const entries = ctx.sessionManager.getBranch();
    const checkpointEntries = entries.filter(e =>
      e.type === "custom" && e.customType === "checkpoint"
    );

    if (checkpointEntries.length === 0) {
      ctx.ui.notify("No file changes in current session", "warning");
      return;
    }

    // 收集所有变化的文件
    const allFiles = new Map<string, FileChange>();
    for (const entry of checkpointEntries) {
      const data = entry.data as CheckpointEntry;
      for (const file of data.files) {
        const existing = allFiles.get(file.path);
        if (existing) {
          existing.additions += file.additions;
          existing.deletions += file.deletions;
        } else {
          allFiles.set(file.path, { ...file });
        }
      }
    }

    const files = Array.from(allFiles.values());

    // 显示文件列表
    await ctx.ui.custom<FileChange | null>((tui, theme, _kb, done) => {
      const viewer = FileChangesViewer(files, theme, (file) => {
        // 用户选择了一个文件，显示详细 diff
        showFileDiff(file, tui, theme, done);
      });

      return viewer;
    }, { overlay: true, overlayOptions: { width: "80%", maxHeight: 20 } });
  }
});

async function showFileDiff(
  file: FileChange,
  tui: TUI,
  theme: Theme,
  done: (result: FileChange | null) => void
) {
  // 生成 diff
  const diffText = await generateFileDiff(file);

  // 显示 diff viewer
  const diffViewer = new DiffViewer(diffText, theme, 20);

  // 替换当前组件
  tui.replaceComponent(diffViewer);

  // 添加返回提示
  const helpText = new Text(
    theme.dim('Press Escape to return to file list'),
    1, 0
  );

  diffViewer.handleInput = (data) => {
    if (matchesKey(data, "escape")) {
      done(null); // 返回文件列表
    }
    return true;
  };
}
```

---

### 技术选型对比

| 方案 | 优点 | 缺点 | 复杂度 |
|------|------|------|--------|
| **pi-mono renderDiff** | 内置、主题一致、支持 intra-line diff | 需要 diff 字符串 | 低 |
| **Git diff --numstat** | 简单、快速、准确 | 需要执行 git 命令 | 低 |
| **Diff.diffLines()** | 纯 JS、无依赖 | 需要完整文件内容 | 中 |
| **OpenCode `<diff>`** | 功能完整、语法高亮 | 需要 SolidJS、pi-mono 不支持 | 高 |

**推荐方案**：
- MVP：使用 `pi-mono renderDiff()` + `git diff --numstat`
- V2：添加 `Diff.diffLines()` 计算统计
- 未来：考虑集成 OpenCode 的 `<diff>` 组件（如果 pi-mono 支持）

---

### 实现优先级

#### MVP（第一版）
- [x] 使用 `renderDiff()` 显示 diff
- [x] 使用 `git diff --numstat` 计算统计
- [x] FileChangesViewer 显示文件列表
- [x] RevertInfo 显示回退状态

#### V2（增强版）
- [ ] 添加滚动支持（大 diff）
- [ ] 添加搜索/过滤功能
- [ ] 添加语法高亮（使用 shiki）
- [ ] 添加 split view 模式
- [ ] 添加导出 diff 功能

---

## pi-tui 组件深度调研

### 核心组件

#### 1. SelectList - 可选择列表

**位置**: `@mariozechner/pi-tui`

**接口**:
```typescript
interface SelectItem {
  value: T;           // 内部值
  label: string;      // 显示标签
  description?: string; // 可选描述
}

interface SelectListTheme {
  selectedPrefix: (text: string) => string;  // 选中项前缀（箭头）
  selectedText: (text: string) => string;    // 选中文本颜色
  description: (text: string) => string;     // 描述颜色
  scrollInfo: (text: string) => string;      // 滚动信息颜色
  noMatch: (text: string) => string;         // 无匹配项提示颜色
}
```

**使用示例**:
```typescript
import { SelectList, type SelectItem } from "@mariozechner/pi-tui";

const items: SelectItem[] = [
  { value: "opt1", label: "Option 1", description: "First option" },
  { value: "opt2", label: "Option 2", description: "Second option" }
];

const selectList = new SelectList(items, 10, {
  selectedPrefix: (t) => theme.fg("accent", t),
  selectedText: (t) => theme.fg("accent", t),
  description: (t) => theme.fg("muted", t),
  scrollInfo: (t) => theme.fg("dim", t),
  noMatch: (t) => theme.fg("warning", t),
});

// 事件回调
selectList.onSelect = (item) => console.log("Selected:", item.value);
selectList.onCancel = () => console.log("Cancelled");
selectList.onSelectionChange = (index) => console.log("Selection:", index);

// 键盘输入
selectList.handleInput(data);  // 处理上下箭头、Enter、Esc

// 过滤
selectList.setFilter("opt");  // 只显示匹配项
```

**内置功能**:
- ✅ 键盘导航（上下箭头）
- ✅ 自动滚动（保持选中项可见）
- ✅ 过滤支持（`setFilter()`）
- ✅ 滚动指示器（显示 "showing X-Y of Z"）
- ✅ 回环（从底部跳到顶部）

#### 2. Container - 组件容器

**位置**: `@mariozechner/pi-tui`

**使用示例**:
```typescript
import { Container, Text } from "@mariozechner/pi-tui";

const container = new Container();

// 添加子组件
container.addChild(new Text("Line 1", 1, 0));
container.addChild(new Text("Line 2", 1, 0));

// 移除子组件
container.removeChild(childComponent);

// 清空所有子组件
container.clear();

// 渲染（垂直堆叠）
const lines = container.render(width);  // 返回所有子组件的渲染结果
```

**特性**:
- ✅ 垂直堆叠子组件
- ✅ 继承 `Component` 接口
- ✅ 自动调用子组件的 `render()`
- ✅ 自动调用子组件的 `invalidate()`

#### 3. Text - 多行文本

**位置**: `@mariozechner/pi-tui`

**使用示例**:
```typescript
import { Text } from "@mariozechner/pi-tui";

const text = new Text(
  "Hello World",    // 内容
  1,                // paddingX（默认: 1）
  1,                // paddingY（默认: 1）
  (s) => bgGray(s)  // 可选背景函数
);

// 更新内容
text.setText("Updated text");

// 更新背景
text.setCustomBgFn((s) => bgBlue(s));
```

**特性**:
- ✅ 自动换行（`wrapTextWithAnsi`）
- ✅ 支持颜色编码
- ✅ 可选背景色
- ✅ 缓存渲染结果（性能优化）

#### 4. DynamicBorder - 动态边框

**位置**: `@mariozechner/pi-coding-agent`

**使用示例**:
```typescript
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

// 创建边框
const border = new DynamicBorder((s) => theme.fg("border", s));

// 渲染（根据宽度调整）
const lines = border.render(width);  // ["─".repeat(width)]
```

**特性**:
- ✅ 自动适应宽度
- ✅ 支持 custom color 函数（扩展中使用）
- ⚠️ 扩展中必须显式传递 color 函数（jiti 模块缓存问题）

#### 5. BorderedLoader - 加载动画

**位置**: `@mariozechner/pi-coding-agent`

**使用示例**:
```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const loader = new BorderedLoader(
  tui,              // TUI 实例
  theme,            // Theme 实例
  "Loading...",     // 消息
  { cancellable: true }  // 选项
);

// 事件
loader.onAbort = () => console.log("Aborted");

// AbortSignal
const signal = loader.signal;  // 用于取消异步操作

// 清理
loader.dispose();
```

**特性**:
- ✅ 带边框的加载动画
- ✅ 支持取消（Esc 键）
- ✅ 提供 AbortSignal
- ✅ 自动清理

#### 6. Spacer - 空白间距

**位置**: `@mariozechner/pi-tui`

**使用示例**:
```typescript
import { Spacer } from "@mariozechner/pi-tui";

const spacer = new Spacer(2);  // 2 行空行
```

### pi-tui 工具函数

#### 键盘检测

```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

handleInput(data: string) {
  // 基本按键
  if (matchesKey(data, Key.up)) { }
  if (matchesKey(data, Key.down)) { }
  if (matchesKey(data, Key.enter)) { }
  if (matchesKey(data, Key.escape)) { }

  // 组合键
  if (matchesKey(data, Key.ctrl("c"))) { }
  if (matchesKey(data, Key.shift("tab"))) { }
  if (matchesKey(data, Key.ctrlShift("p"))) { }

  // 字符串格式
  if (matchesKey(data, "ctrl+c")) { }
  if (matchesKey(data, "shift+tab")) { }
}
```

#### 宽度处理

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

// 获取显示宽度（忽略 ANSI 码）
const width = visibleWidth("\x1b[31mHello\x1b[0m");  // 5

// 截断到指定宽度
const truncated = truncateToWidth("Very long text", 10, "...");  // "Very long..."

// 换行（保留 ANSI 码）
const wrapped = wrapTextWithAnsi("Long text", 20);
```

### 自定义组件模式

#### 模式 1: 简单选择器（使用 SelectList）

```typescript
import { Container, Text, SelectList, type SelectItem } from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
  const container = new Container();

  // 边框
  container.addChild(new DynamicBorder((s) => theme.fg("border", s)));

  // 标题
  container.addChild(new Text(theme.bold(theme.accent("Select File")), 1, 0));

  // 列表
  const items: SelectItem[] = [
    { value: "file1.ts", label: "file1.ts", description: theme.fg("success", "+10 -5") },
    { value: "file2.ts", label: "file2.ts", description: theme.fg("success", "+5 -2") }
  ];

  const selectList = new SelectList(items, 10, {
    selectedPrefix: (t) => theme.fg("accent", "→ "),
    selectedText: (t) => theme.fg("accent", t),
    description: (t) => t,
  });

  selectList.onSelect = (item) => done(item.value);
  selectList.onCancel = () => done(null);

  container.addChild(selectList);

  // 帮助文本
  container.addChild(new Text(theme.dim("↑↓ navigate • enter select • esc cancel"), 1, 0));

  // 边框
  container.addChild(new DynamicBorder((s) => theme.fg("border", s)));

  return {
    render: (w) => container.render(w),
    invalidate: () => container.invalidate(),
    handleInput: (data) => {
      selectList.handleInput(data);
      tui.requestRender();
    }
  };
}, { overlay: true, overlayOptions: { width: "60%", anchor: "center" } });
```

#### 模式 2: 自定义滚动选择器

```typescript
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";

class ScrollableSelector {
  private items: string[];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private maxVisible = 10;
  private cachedLines?: string[];

  public onSelect?: (item: string) => void;
  public onCancel?: () => void;

  constructor(items: string[], maxVisible = 10) {
    this.items = items;
    this.maxVisible = maxVisible;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateScrollOffset();
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selectedIndex < this.items.length - 1) {
      this.selectedIndex++;
      this.updateScrollOffset();
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.items[this.selectedIndex]);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  private updateScrollOffset(): void {
    // 保持选中项在可见范围内
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
      this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines;

    const visibleItems = this.items.slice(
      this.scrollOffset,
      this.scrollOffset + this.maxVisible
    );

    this.cachedLines = visibleItems.map((item, i) => {
      const globalIndex = this.scrollOffset + i;
      const isSelected = globalIndex === this.selectedIndex;
      const prefix = isSelected ? "→ " : "  ";
      return truncateToWidth(prefix + item, width);
    });

    // 添加滚动信息
    if (this.items.length > this.maxVisible) {
      const scrollInfo = `Showing ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + this.maxVisible, this.items.length)} of ${this.items.length}`;
      this.cachedLines.push(truncateToWidth(scrollInfo, width));
    }

    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedLines = undefined;
  }
}
```

#### 模式 3: 双视图（列表 + 详情）

```typescript
import { Container, Text } from "@mariozechner/pi-tui";

class ListDetailView {
  private items: FileChange[];
  private selectedIndex = 0;
  private view: "list" | "detail" = "list";
  private container: Container;

  constructor(items: FileChange[], theme: Theme, private tui: TUI, private done: (result: FileChange | null) => void) {
    this.items = items;
    this.container = new Container();
    this.renderList();
  }

  private renderList(): void {
    this.container.clear();
    this.container.addChild(new Text("Modified Files", 1, 0));
    // ... 渲染列表
  }

  private renderDetail(): void {
    this.container.clear();
    this.container.addChild(new Text(`File: ${this.items[this.selectedIndex].path}`, 1, 0));
    // ... 渲染详情
  }

  handleInput(data: string): void {
    if (this.view === "list") {
      // 列表视图输入处理
      if (matchesKey(data, Key.enter)) {
        this.view = "detail";
        this.renderDetail();
        this.tui.requestRender();
      }
      // ...
    } else {
      // 详情视图输入处理
      if (matchesKey(data, Key.escape)) {
        this.view = "list";
        this.renderList();
        this.tui.requestRender();
      }
      // ...
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}
```

### Overlay 模式详解

#### 基础 Overlay

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => {
    return myComponent;
  },
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",      // 居中
      width: "50%",          // 50% 宽度
      maxHeight: "80%",      // 最大 80% 高度
      margin: 2,             // 四周 2 行/列边距
    }
  }
);
```

#### 高级定位

```typescript
overlayOptions: {
  // 方式 1: 锚点定位（9 个位置）
  anchor: "top-left" | "top-center" | "top-right" |
          "left-center" | "center" | "right-center" |
          "bottom-left" | "bottom-center" | "bottom-right",
  offsetX: -2,  // 相对锚点的水平偏移
  offsetY: 1,   // 相对锚点的垂直偏移

  // 方式 2: 百分比定位
  row: "25%",   // 距顶部 25%
  col: "50%",   // 距左侧 50%

  // 方式 3: 绝对定位
  row: 5,       // 第 5 行
  col: 10,      // 第 10 列

  // 尺寸
  width: "50%",           // 50% 宽度
  minWidth: 40,           // 最小 40 列
  maxHeight: "80%",       // 最大 80% 高度

  // 边距
  margin: 2,              // 所有边
  margin: { top: 1, right: 2, bottom: 1, left: 2 },

  // 响应式可见性
  visible: (termWidth, termHeight) => termWidth >= 80 && termHeight >= 24,
}
```

#### 编程控制

```typescript
const handle = await ctx.ui.custom(
  (tui, theme, keybindings, done) => component,
  {
    overlay: true,
    onHandle: (overlayHandle) => {
      // 隐藏
      overlayHandle.setHidden(true);

      // 显示
      overlayHandle.setHidden(false);

      // 永久移除
      overlayHandle.hide();
    }
  }
);
```

### 组件生命周期

#### Overlay 组件

```typescript
// ❌ 错误：重复使用已销毁的组件
let menu: MenuComponent;
await ctx.ui.custom((_, __, ___, done) => {
  menu = new MenuComponent(done);
  return menu;
}, { overlay: true });
setActiveComponent(menu);  // 已销毁！

// ✅ 正确：每次调用创建新实例
const showMenu = () => ctx.ui.custom(
  (tui, theme, keybindings, done) => new MenuComponent(done),
  { overlay: true }
);

await showMenu();  // 第一次显示
await showMenu();  // 第二次显示（新实例）
```

### 状态管理最佳实践

```typescript
class StatefulComponent {
  private state = {
    items: [],
    selected: 0,
    filter: "",
    loading: false
  };

  private cachedLines?: string[];

  // 更新状态并触发重渲染
  private setState(newState: Partial<typeof this.state>): void {
    this.state = { ...this.state, ...newState };
    this.invalidate();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.setState({ selected: this.state.selected - 1 });
    } else if (matchesKey(data, "a")) {
      this.setState({ loading: true });
      fetchData().then(items => this.setState({ items, loading: false }));
    }
  }

  render(width: number): string[] {
    if (this.state.loading) {
      return ["Loading..."];
    }
    // ... 渲染逻辑
  }

  invalidate(): void {
    this.cachedLines = undefined;
  }
}
```

### 关键注意事项

1. **行宽度限制**: 每行不得超过 `width` 参数
2. **缓存清理**: 状态变化时必须调用 `invalidate()`
3. **重渲染请求**: `handleInput` 后调用 `tui.requestRender()`
4. **Overlay 生命周期**: 不要重复使用已销毁的组件
5. **主题颜色传递**: `DynamicBorder` 在扩展中需要显式传递 color 函数
6. **Focusable 接口**: 包含 Input/Editor 的容器需要实现并传播 focused 状态