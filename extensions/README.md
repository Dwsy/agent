# Pi Agent Extensions

本目录包含 Pi Agent 的扩展，用于增强代理的功能和用户体验。

## 📋 扩展列表

### 🎯 核心扩展

#### `answer.ts`
交互式 Q&A TUI，使用 `Ctrl+.` 触发。

#### `qna.ts`
编辑器 Q&A 提取，使用 `Ctrl+,` 触发。

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