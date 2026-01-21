# Ralph Loop Gen

任务管理系统模板生成器 - 支持多 Agent 并行开发的任务管理模板。

## 功能特性

- 📋 自动生成任务管理目录结构
- 🔗 支持任务依赖关系定义
- 🔒 内置任务锁定机制（防重复执行）
- 👥 支持多 Agent 并行开发
- 📊 自动生成任务索引、依赖关系图、并行分组
- 📝 支持多种输入格式（简单列表、JSON）
- 🎯 支持任务优先级、预计时间、验收标准

## 快速开始

```bash
# 基本用法
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name myProject

# 指定项目名称
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name myProject --project "我的项目"

# 使用 JSON 格式
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --format json
```

## 输入格式示例

### 简单列表格式

```
任务1: 初始化项目结构
任务2: 安装依赖 -> 依赖: 任务1
任务3: 配置开发环境 -> 依赖: 任务2
任务4: 编写UI组件 (High, 4h) -> 依赖: 任务2
任务5: 编写API接口 (High, 4h) -> 依赖: 任务3
任务6: 集成测试 -> 依赖: 任务4, 任务5
```

### JSON 格式

```json
[
  {
    "id": 1,
    "title": "初始化项目",
    "priority": "High",
    "estimated": "2h",
    "description": "创建项目基础结构",
    "steps": ["创建目录", "初始化git"],
    "dependencies": []
  }
]
```

## 输出结构

```
task/
└── {任务集名}/
    ├── 任务索引.md          # 任务总览和依赖关系
    ├── 当前任务.md          # 第一个任务
    ├── 任务001.md
    ├── 任务002.md
    └── completed/           # 已完成任务目录
```

## 多 Agent 并行开发

### 任务锁定机制

- Agent 领用任务时立即锁定
- 其他 Agent 无法认领已锁定的任务
- 任务完成后释放锁定
- 支持锁定超时自动释放

### 依赖关系

```
任务1: 基础设施
任务2: 前端开发 -> 依赖: 任务1
任务3: 后端开发 -> 依赖: 任务1
任务4: 集成测试 -> 依赖: 任务2, 任务3
```

任务2和任务3可以并行执行（都只依赖任务1）

### Agent 协作流程

1. 各 Agent 读取任务索引
2. 查找可执行的任务（依赖已完成、未被锁定）
3. 锁定任务并开始执行
4. 完成后更新状态并释放锁定
5. 继续下一个任务

## 文档

- [SKILL.md](./SKILL.md) - 技能详细说明
- [EXAMPLES.md](./EXAMPLES.md) - 使用示例和最佳实践

## 目录结构

```
ralph-loop-gen/
├── SKILL.md          # 技能说明文档
├── EXAMPLES.md       # 使用示例
├── lib.ts            # 主程序
└── templates/        # 模板文件
    ├── index.md      # 任务索引模板
    └── task.md       # 单个任务模板
```

## 模板变量

### index.md 模板

- `{{TOTAL_TASKS}}` - 总任务数
- `{{COMPLETED}}` - 已完成数量
- `{{IN_PROGRESS}}` - 进行中数量
- `{{TODO}}` - 待开始数量
- `{{LOCKED}}` - 已锁定数量
- `{{PROJECT_NAME}}` - 项目名称
- `{{TASK_ROWS}}` - 任务列表表格
- `{{DEP_GRAPH}}` - 依赖关系图
- `{{PARALLEL_GROUPS}}` - 并行任务分组

### task.md 模板

- `{{TASK_ID}}` - 任务ID
- `{{TASK_TITLE}}` - 任务标题
- `{{STATUS}}` - 任务状态
- `{{PRIORITY}}` - 优先级
- `{{ESTIMATED_TIME}}` - 预计时间
- `{{DESCRIPTION}}` - 任务描述
- `{{DEPENDENCIES_LIST}}` - 依赖任务列表
- `{{ACCEPTANCE_CRITERIA}}` - 验收标准
- `{{IMPLEMENTATION_STEPS}}` - 实施步骤
- `{{LOCK_OWNER}}` - 占用者
- `{{LOCK_TIME}}` - 锁定时间

## 任务状态

- `Todo` - 待开始
- `Locked` - 已被锁定
- `In Progress` - 进行中
- `Done` - 已完成
- `Blocked` - 已阻塞

## 注意事项

⚠️ 此 skill 仅生成任务模板文件，不负责实际执行任务。

执行时需要其他 agent 手动或自动读取这些模板文件。