# Pi Agent Extensions

本目录包含 Pi Agent 的扩展，用于增强代理的功能和用户体验。

## 📋 扩展列表

### 🎯 核心扩展

#### `answer.ts`
交互式 Q&A TUI，使用 `Ctrl+.` 触发。

#### `qna.ts`
编辑器 Q&A 提取，使用 `Ctrl+,` 触发。

#### `continue.ts` ⭐ 新增
快速继续对话，自动输入"继续"并发送。

**功能**:
- 使用快捷键快速继续对话
- 自动填充编辑器内容为"继续"
- 自动触发下一轮对话

**使用**:
```bash
# 快捷键触发
Ctrl+Option+C

# 命令触发
/continue
```

**快捷键**:
- `Ctrl+Option+C`: 自动输入"继续"并发送

#### `handoff.ts`
上下文传递到新会话，使用 `/handoff <goal>` 命令。

### 🛠️ 工具类扩展

#### `todo.ts` ⭐ 新增
待办事项管理工具。

**功能**:
- LLM 可以使用 `todo` 工具管理待办事项
- 用户可以使用 `/todos` 命令查看待办列表
- 状态持久化到会话（支持分支切换）

**使用**:
```bash
# LLM 会自动使用
"Add a todo: Review the authentication code"

# 用户查看
/todos
```

**状态管理**:
- 状态存储在工具结果的 `details` 中
- 支持分支导航，切换分支时状态自动恢复

#### `git-commit.ts`
自动提交 git 更改。

#### `token-aware-truncation.ts`
感知 token 的输出截断。

#### `workflow-commands.ts`
工作流相关命令。

### 🎮 游戏扩展

#### `games/` ⭐ 新增
可扩展的小游戏框架，支持多个经典游戏。

**功能**:
- 统一的游戏注册和管理系统
- 状态持久化（暂停/恢复）
- 高分记录保存
- 共享游戏工具和类型

**可用游戏**:

##### `/snake` - 贪吃蛇
- 使用方向键或 WASD 控制蛇移动
- 吃到食物得分，防止撞墙或撞到自己
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

##### `/tetris` - 俄罗斯方块
- 使用方向键移动和旋转方块
- Space 快速下落
- 消除行得分，随等级提升速度加快
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

##### `/2048` - 2048 数字游戏
- 使用方向键或 WASD 移动方块
- 相同数字合并，达到 2048 获胜
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

##### `/minesweeper` - 扫雷
- 经典扫雷游戏，中等难度（16x16，40个雷）
- 自动计算周围地雷数量
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

##### `/breakout` - 打砖块
- 控制挡板反弹小球，消除所有砖块
- 3条生命，砖块颜色不同分值不同
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

##### `/pong` - 乒乓球
- 经典乒乓球对战游戏，与电脑对战
- 先得5分获胜
- P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

**使用**:
```bash
# 启动贪吃蛇
/snake

# 启动俄罗斯方块
/tetris
```

**游戏控制**:
- **Snake**: ↑↓←→ 或 WASD 移动，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始
- **Tetris**: ←↓→ 移动，↑ 旋转，Space 快速下落，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始
- **2048**: ↑↓←→ 或 WASD 移动方块，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始
- **Minesweeper**: 点击揭示，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始
- **Breakout**: ←→ 或 AD 移动挡板，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始
- **Pong**: ↑↓ 或 WS 移动挡板，P 暂停（可恢复），ESC 保存并退出，Q 退出不保存，R 重新开始

**状态管理**:
- 按 ESC 暂停并保存游戏状态
- 按 Q 退出并清除保存
- 下次启动时自动恢复上次状态

**目录结构**:
```
extensions/games/
├── index.ts           # 统一注册入口
├── shared/            # 共享代码
│   ├── types.ts      # 通用类型
│   └── utils.ts      # 渲染工具函数
├── snake/            # 贪吃蛇游戏
│   ├── index.ts      # 游戏逻辑
│   ├── types.ts      # 类型定义
│   └── constants.ts  # 常量配置
└── tetris/           # 俄罗斯方块游戏
    ├── index.ts      # 游戏逻辑
    ├── types.ts      # 类型定义
    └── constants.ts  # 常量配置
```

**添加新游戏**:
1. 在 `extensions/games/` 创建新目录
2. 实现 `index.ts` 导出 `handler` 函数
3. 在 `extensions/games/index.ts` 注册新命令
4. 参考现有游戏实现模式

### 🎨 界面定制扩展

#### `rainbow-editor.ts` ⭐ 新增
彩虹编辑器，高亮显示 "ultrathink" 带动画光泽效果。

**功能**:
- 当编辑器中包含 "ultrathink" 时，显示彩虹动画
- 7种颜色循环：coral → yellow → green → teal → blue → purple → pink
- 60fps 动画，光泽从左到右移动

**使用**:
- 自动启用，无需命令
- 在编辑器中输入 "ultrathink" 即可看到效果

#### `custom-footer.ts` ⭐ 新增
自定义 footer 显示上下文使用情况。

**功能**:
- 替换内置 footer
- 显示消息数量和 token 估算
- 使用 `/footer` 命令切换

**使用**:
```bash
# 切换自定义 footer
/footer

# 恢复内置 footer
/builtin-footer
```

### 📋 计划模式扩展

#### `plan-mode.ts` ⭐ 新增
Claude Code 风格的计划模式，用于安全的代码探索。

**功能**:
- **只读工具集**: `read`, `bash`(只读), `grep`, `find`, `ls`
- **危险命令拦截**: 40+ 个破坏性模式（rm, sudo, git commit 等）
- **安全命令白名单**: cat, grep, find, ls 等只读命令
- **Todo 提取**: 从计划中自动提取编号步骤
- **执行追踪**: 自动标记完成步骤
- **状态显示**: Footer 显示进度

**使用**:
```bash
# 切换计划模式
/plan

# 快捷键
Shift+P

# CLI 启动
pi --plan
```

**工作流程**:
1. 启用计划模式
2. LLM 创建详细计划（只读探索）
3. 提取 todo 步骤
4. 选择执行计划
5. 追踪执行进度

**危险命令示例**:
```bash
# 被拦截的命令
rm -rf node_modules/
sudo apt install package
git commit -m "message"
npm install package
```

**安全命令示例**:
```bash
# 允许的命令
cat file.txt
grep "pattern" file.txt
find . -name "*.ts"
ls -la
git status
git log
```

### 🤖 子代理系统

#### `subagent/`
多代理协作系统，支持单一/并行/链式执行。

**内置代理**:
- `scout`: 快速代码侦察
- `planner`: 创建实现计划
- `worker`: 通用执行代理
- `reviewer`: 代码审查

**使用**:
```bash
# 单一模式
subagent({ agent: "scout", task: "查找认证代码" })

# 并行模式
subagent({
  tasks: [
    { agent: "scout", task: "查找后端" },
    { agent: "scout", task: "查找前端" }
  ]
})

# 链式模式
subagent({
  chain: [
    { agent: "scout", task: "侦察代码库" },
    { agent: "planner", task: "基于 {previous} 创建计划" },
    { agent: "worker", task: "执行计划: {previous}" }
  ]
})
```

### 🔧 其他扩展

#### `safety-gates.ts` ⭐ 新增
安全门控扩展，拦截危险命令并提示用户确认。

**功能**:
- 拦截所有 `rm` 命令（包括 `rm -rf`）
- 提示用户使用 `trash` 命令替代
- 允许例外场景（`/tmp/` 和 `/var/cache/` 内的清理）
- 用户可选择允许或阻止命令执行

**使用**:
```bash
# 自动拦截
rm file.txt  # 会弹出确认对话框

# 推荐使用
trash file.txt  # 直接回收文件到垃圾桶

# 例外场景（不会拦截）
rm -rf /tmp/cache/*
```

**拦截的命令**:
- `rm file.txt`
- `rm -rf directory/`
- `sudo rm file`
- 任何包含 `rm ` 的命令

**允许的例外**:
- `/tmp/` 内的清理操作
- `/var/cache/` 内的清理操作

**工作原理**:
1. 扩展监听 `tool_call` 事件
2. 检测 `bash` 工具中的 `rm` 命令
3. 检查是否在例外路径内
4. 如果不在例外路径，弹出确认对话框
5. 用户拒绝时阻止命令执行

**安全建议**:
- ✅ 使用 `trash <file>` 或 `trash <directory>/`
- ✅ 文件会被移动到系统回收站，可恢复
- ❌ 避免使用 `rm`、`rm -rf`、`sudo rm` 等

#### `interview/`
交互式表单收集用户响应。

#### `knowledge-builder/`
知识库构建工具。

#### `ralph/`
Ralph 集成。

---

## 🚀 快速开始

### 安装扩展

扩展已自动安装到 `~/.pi/agent/extensions/`，Pi Agent 会自动加载。

### 使用扩展

1. **自动加载**: 扩展在 Pi Agent 启动时自动加载
2. **命令调用**: 使用 `/command` 格式调用
3. **工具调用**: LLM 可以直接使用扩展注册的工具

### 配置扩展

某些扩展可能需要配置：

```bash
# 编辑扩展配置
vim ~/.pi/agent/extensions/config.json
```

---

## 📖 扩展开发

### 扩展结构

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 监听生命周期事件
  pi.on("session_start", async (event, ctx) => {
    // 会话开始时的逻辑
  });

  // 注册工具
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Tool description",
    parameters: Type.Object({ ... }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      return { content: [...], details: {} };
    }
  });

  // 注册命令
  pi.registerCommand("my_cmd", {
    description: "Command description",
    handler: async (args, ctx) => {
      // 命令处理逻辑
    }
  });
}
```

### 最佳实践

1. **状态管理**: 使用 `details` 存储状态（支持分支）
2. **参数类型**: 使用 `StringEnum`（Google API 兼容）
3. **输出截断**: 使用内置 `truncateHead`/`truncateTail`
4. **错误处理**: 返回 `{ block: true, reason: "..." }`
5. **UI 渲染**: 使用 `renderCall` 和 `renderResult`

---

## 🔗 相关资源

- [Pi Agent 主文档](../README.md)
- [扩展开发指南](../docs/extensions.md)
- [API 参考](../docs/api.md)

---

*最后更新: 2026-01-10*