# Checkpoint V2 Plugin

> 智能文件快照与回退系统 - 类似 Claude Code 的 undo/redo 体验

## 简介

Checkpoint V2 是一个 pi-mono 插件，提供文件快照、回退和重做功能。它使用独立的 Git 存储来跟踪文件变化，让你可以轻松撤销和重做操作。

## 功能特性

- ✅ **自动快照**: 每次对话结束后自动创建快照
- ✅ **智能回退**: 使用 `/undo` 命令撤销到上一个快照
- ✅ **快速重做**: 使用 `/redo` 命令恢复已撤销的快照
- ✅ **可视化查看**: 使用 `/changes` 命令查看文件变化
- ✅ **独立存储**: 使用 `~/.pt/git` 独立存储，不影响项目 Git
- ✅ **TUI 界面**: 提供友好的终端界面展示变化

## 安装

### 前置要求

- pi-mono 已安装
- Git 已安装

### 安装步骤

1. 确保插件目录存在:
```bash
mkdir -p ~/.pi/agent/extensions/checkpoint-v2
```

2. 插件文件已放置在:
```
~/.pi/agent/extensions/checkpoint-v2/
├── index.ts              # 插件入口
├── types.ts              # 类型定义
├── utils.ts              # 工具函数
├── file-tracker.ts       # 文件跟踪
├── git-storage.ts        # Git 存储
├── checkpoint-manager.ts # 状态管理
├── commands.ts           # 命令处理
├── components/           # TUI 组件
│   ├── file-changes-viewer.ts
│   ├── revert-info.ts
│   └── diff-viewer.ts
└── tsconfig.json         # TypeScript 配置
```

3. pi-mono 会自动加载 `extensions/` 目录下的插件。

## 使用方法

### 基本命令

#### /undo - 撤销到上一个快照

```bash
/undo
```

这将撤销到上一个快照，恢复文件到之前的状态。

#### /redo - 重做已撤销的操作

```bash
/redo
```

这将恢复最近一次撤销的快照。

#### /changes - 查看文件变化

```bash
/changes
```

这将显示当前快照中的所有文件变化。

### 使用示例

#### 示例 1: 修改文件后撤销

```
你: 修改 utils.ts 添加新函数
AI: [创建新函数代码]

你: /undo
系统: ✓ 已撤销 1 条消息
    utils.ts 已恢复
    Press /redo to restore

你: /redo
系统: ✓ 已重做 1 条消息
    utils.ts 已恢复
```

#### 示例 2: 查看文件变化

```
你: /changes
系统:
  Modified Files:
  → utils.ts               +5 -2
  → config.ts              +1 -0
  → README.md              +10 -0

  [↑/↓] 选择  [Enter] 查看差异  [Esc] 关闭
```

## 工作原理

### 文件跟踪

插件在以下情况下跟踪文件变化:

1. **turn_start**: 开始新回合时清空临时跟踪
2. **tool_result**: 当 `edit` 或 `write` 工具执行时记录变化
3. **turn_end**: 回合结束时创建快照

### 存储结构

```
~/.pt/git/
├── .git/                  # Git 仓库
│   ├── objects/           # Git 对象
│   ├── refs/              # Git 引用
│   └── ...
├── checkpoints/           # 快照数据
│   └── checkpoint-*.json  # 快照元数据
└── state.json             # 插件状态
```

### 检查点数据结构

每个快照包含:

```json
{
  "id": "checkpoint-20250127-123456",
  "timestamp": "2025-01-27T12:34:56.789Z",
  "turnId": "turn-123",
  "files": [
    {
      "path": "utils.ts",
      "action": "modified",
      "additions": 5,
      "deletions": 2
    }
  ],
  "messageCount": 1
}
```

## 配置选项

### 自动忽略目录

插件自动忽略以下目录:

- `node_modules/`
- `.git/`
- `dist/`
- `build/`
- `__pycache__/`
- `.venv/`
- `venv/`
- `env/`

### 自定义忽略规则

可以在 `utils.ts` 中修改 `IGNORED_DIRS` 常量。

## TUI 组件

### FileChangesViewer

显示文件变化列表:

```
  Modified Files:
  → utils.ts               +5 -2
  → config.ts              +1 -0
```

### RevertInfo

显示撤销状态:

```
  1 message reverted
  Press /redo to restore

  utils.ts +5 -2
```

### DiffViewer

显示文件差异:

```
  1   1 | function add(a, b) {
  2   2 |   return a + b;
  3     - | }
  4     - |
  5     + |   const result = a + b;
  6     + |   return result;
  7     + | }
```

## API 参考

### CheckpointManager

```typescript
class CheckpointManager {
  createCheckpoint(turnId: string, files: FileChange[]): Promise<Checkpoint>
  undo(): Promise<Checkpoint | null>
  redo(): Promise<Checkpoint | null>
  getCurrentCheckpoint(): Checkpoint | null
  getHistory(): Checkpoint[]
}
```

### GitStorage

```typescript
class GitStorage {
  initialize(): Promise<void>
  createSnapshot(): Promise<string>
  restore(commitHash: string): Promise<void>
  getFileDiff(filePath: string): Promise<string>
  loadCheckpoint(commitHash: string): Promise<CheckpointData | null>
}
```

### FileTracker

```typescript
class FileTracker {
  trackFile(filePath: string, action: FileChange['action']): void
  getChanges(): FileChange[]
  clear(): void
  getSummary(): FileChangeSummary
}
```

## 故障排除

### 问题: 快照创建失败

**原因**: `~/.pt/git` 目录权限问题

**解决**:
```bash
chmod -R 755 ~/.pt/git
```

### 问题: /undo 没有效果

**原因**: 没有可撤销的快照

**解决**: 确保至少有一个快照存在，使用 `/view` 查看快照列表。

### 问题: 文件没有跟踪

**原因**: 文件在自动忽略目录中

**解决**: 检查文件路径是否在 `IGNORED_DIRS` 中。

## 技术细节

### 依赖

- `@mariozechner/pi-tui` - TUI 组件库
- `@mariozechner/pi-coding-agent` - pi-mono 核心 API

### TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 更新日志

### v2.0.0 (2025-01-27)

- ✨ 新增: 完整的 undo/redo 功能
- ✨ 新增: TUI 可视化界面
- ✨ 新增: /view 命令查看文件变化
- 🐛 修复: TypeScript 类型检查问题
- 📝 文档: 完整的使用文档