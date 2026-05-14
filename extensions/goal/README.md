# Goal v2 Extension

目标驱动的自主编码循环，全面对齐 OpenAI Codex `/goal` 系统。

## 使用方式

### 加载扩展

```bash
# 临时加载测试
pi -e ~/.pi/agent/extensions/goal/index.ts

# 自动加载（放置在 extensions 目录下）
# 扩展会自动被 Pi 发现并加载
```

### 命令

| 命令 | 说明 |
|------|------|
| `/goal <objective>` | 设置新目标 |
| `/goal pause` | 暂停目标 |
| `/goal resume` | 恢复目标 |
| `/goal clear` | 清除目标 |
| `/goal status` | 查看状态 |
| `/goal edit` | 修改目标描述 |

### 工具（LLM 调用）

| 工具 | 说明 |
|------|------|
| `create_goal` | 创建新目标（仅在无目标时可用） |
| `get_goal` | 查询当前目标状态 |
| `update_goal` | 标记目标完成或阻塞 |

## 架构

```
index.ts          # 入口文件，组装所有模块
├── types.ts      # 类型定义（GoalStatus, GoalData 等）
├── constants.ts  # 常量配置
├── prompts.ts    # Prompt 模板（对齐 Codex templates）
├── state.ts      # 状态管理
├── tools.ts      # 工具注册（3 个独立工具）
├── commands.ts   # 命令注册（/goal 及子命令）
├── events.ts     # 事件处理
└── ui.ts         # UI 组件
```

## 对齐 Codex 的特性

### 工具分离设计
- `create_goal` - 创建新目标（Codex create_goal.rs）
- `get_goal` - 查询状态（Codex get_goal.rs）
- `update_goal` - 标记完成（Codex update_goal.rs）

### 状态机
- `pursuing` - 正在执行（对应 Codex Active）
- `paused` - 已暂停
- `budget_limited` - 预算耗尽（系统自动）
- `achieved` - 已完成（工具调用）
- `unmet` - 阻塞/未完成（Pi 扩展）

### 模板系统
- `continuation.md` - 继续执行目标
- `budget_limit.md` - 预算耗尽
- `objective_updated.md` - 目标更新

### 事件处理
- `agent_end` - 预算检查 + 卡住检测 + 下一轮注入
- `session_start` - 自动恢复进行中的目标
- `session_switch` - 切换会话时恢复状态
- `session_before_compact` - 保留 goal 上下文

## Pi 扩展特性（Codex 没有的）

- `blocked` 状态 - update_goal 支持标记阻塞
- 卡住检测 - 5 分钟无进展自动提示
- 预算警告 - 80% 阈值提前警告
- `/goal status` - 详细状态通知
- 交互式预算设置 - TUI 输入 token 预算

## 文件结构

```
goal-v2/
├── index.ts          # 3.0 KB - 入口文件
├── types.ts          # 3.4 KB - 类型定义
├── constants.ts      # 3.6 KB - 常量配置
├── prompts.ts        # 10.7 KB - Prompt 模板
├── state.ts          # 6.5 KB - 状态管理
├── tools.ts          # 9.3 KB - 工具注册
├── commands.ts       # 8.5 KB - 命令注册
├── events.ts         # 8.3 KB - 事件处理
├── ui.ts             # 6.0 KB - UI 组件
├── tsconfig.json     # TypeScript 配置
├── typings/          # 类型声明
│   ├── pi-coding-agent.d.ts
│   └── typebox.d.ts
└── README.md         # 本文档
```

## 统计

- **总代码量**: ~59 KB
- **模块数量**: 9 个
- **工具数量**: 3 个
- **命令数量**: 6 个（含子命令）
- **事件处理器**: 4 个
- **状态数量**: 5 种
