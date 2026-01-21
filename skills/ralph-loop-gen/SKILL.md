---
name: "ralph-loop-gen"
description: "任务管理系统模板生成器 - 根据用户输入生成任务索引、当前任务和任务文件模板（模板生成器，非直接执行器）"
---

# Ralph Loop Gen Skill

**任务管理系统模板生成器** - 根据用户输入生成完整的任务管理结构模板。

> ⚠️ **注意**：此 skill 仅生成任务模板文件，不负责实际执行任务。执行时需要其他 agent 手动或自动读取这些模板文件。

## 用法

### 命令行方式

```bash
# 基本用法
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts

# 指定任务集名称
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name myProject

# 指定项目名称
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name myProject --project "我的项目"

# 使用 JSON 格式输入
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --format json
```

### 输入格式

支持多种任务列表输入格式：

#### 格式 1：简单列表（默认）

```
任务1: 初始化项目结构
任务2: 安装依赖 -> 依赖: 任务1
任务3: 配置开发环境 -> 依赖: 任务2
任务4: 编写UI组件 (High, 4h) -> 依赖: 任务2
任务5: 编写API接口 (High, 4h) -> 依赖: 任务3
任务6: 集成测试 -> 依赖: 任务4, 任务5
```

#### 格式 2：JSON 格式

```json
[
  {
    "id": 1,
    "title": "初始化项目结构",
    "priority": "High",
    "estimated": "2h",
    "description": "创建项目基础目录和配置文件",
    "steps": ["创建目录", "初始化git", "创建README"],
    "dependencies": []
  },
  {
    "id": 2,
    "title": "安装依赖",
    "priority": "Medium",
    "estimated": "1h",
    "description": "安装项目所需的npm包",
    "dependencies": [1]
  }
]
```

## 输出结构

生成以下目录结构：

```
task/
└── {任务集名}/
    ├── 任务索引.md          # 任务总览和依赖关系
    ├── 当前任务.md          # 第一个任务（状态 In Progress）
    ├── 任务001.md
    ├── 任务002.md
    ├── 任务003.md
    └── completed/           # 已完成任务目录
```

## 模板文件

模板文件位于 `templates/` 目录：

- `templates/index.md` - 任务索引模板
- `templates/task.md` - 单个任务模板

模板使用 `{{占位符}}` 语法，lib.ts 会自动替换。

### index.md 模板变量

- `{{TOTAL_TASKS}}` - 总任务数
- `{{COMPLETED}}` - 已完成数量
- `{{IN_PROGRESS}}` - 进行中数量
- `{{TODO}}` - 待开始数量
- `{{LOCKED}}` - 已锁定数量
- `{{PROJECT_NAME}}` - 项目名称
- `{{CREATED_TIME}}` - 创建时间
- `{{TASK_ROWS}}` - 任务列表表格行
- `{{DEP_GRAPH}}` - 依赖关系图
- `{{PARALLEL_GROUPS}}` - 并行任务分组
- `{{PROGRESS_PERCENT}}` - 进度百分比
- `{{ELAPSED_TIME}}` - 已用时间
- `{{ESTIMATED_REMAINING}}` - 预计剩余时间

### task.md 模板变量

- `{{TASK_ID}}` - 任务ID（如 任务001）
- `{{TASK_TITLE}}` - 任务标题
- `{{STATUS}}` - 任务状态
- `{{PRIORITY}}` - 优先级
- `{{ESTIMATED_TIME}}` - 预计时间
- `{{DESCRIPTION}}` - 任务描述
- `{{DEPENDENCIES_LIST}}` - 依赖任务列表
- `{{ACCEPTANCE_CRITERIA}}` - 验收标准
- `{{IMPLEMENTATION_STEPS}}` - 实施步骤
- `{{PARALLEL_HINT}}` - 并行提示
- `{{LOCK_OWNER}}` - 占用者
- `{{LOCK_TIME}}` - 锁定时间
- `{{LOCK_TIMEOUT}}` - 锁定超时

---

## 多 Agent 并行开发指南

### 依赖关系定义

在任务列表中指定依赖：

```
任务1: 基础设施 (无依赖)
任务2: 前端开发 -> 依赖: 任务1
任务3: 后端开发 -> 依赖: 任务1
任务4: 集成测试 -> 依赖: 任务2, 任务3
```

### 识别可并行任务

**规则**：如果两个任务依赖的相同任务，且彼此不依赖，则可并行。

**示例**：
- 任务2 依赖 任务1
- 任务3 依赖 任务1
- ✅ 任务2 和 任务3 可并行

### 手动调度策略

#### 策略 1：按批次执行

```
批次 1: 任务1 (所有 Agent 等待)
批次 2: 任务2 (Agent A) + 任务3 (Agent B) 并行
批次 3: 任务4 (等待批次2完成)
```

#### 策略 2：流水线执行

```
Agent A: 任务1 → 任务2 → 任务4
Agent B: 任务1 → 任务3 → 任务5
```

#### 策略 3：任务池模式

```
1. 将所有无依赖任务放入"待执行池"
2. 各 Agent 从池中取任务
3. 任务完成后，将依赖此任务的其他任务放入池
4. 重复直到所有任务完成
```

### 冲突避免

**文件级冲突**：
- 不同 Agent 修改同一文件 → 手动协调，或拆分任务
- 建议：在任务描述中明确涉及的文件

**分支管理建议**：
```bash
# 每个 Agent 使用独立分支
git checkout -b agent-a/task2
git checkout -b agent-b/task3

# 完成后合并到主分支
git checkout main
git merge agent-a/task2
git merge agent-b/task3
```

### 进度跟踪

定期查看 `task/{任务集名}/任务索引.md`：

1. 检查依赖任务是否都已完成
2. 更新任务状态
3. 识别下一个可执行任务

### 任务锁定机制

#### 锁定规则

1. **领用任务时立即锁定**
   ```bash
   # Agent A 领用任务002
   # 更新任务002.md
   状态: Locked → In Progress
   占用者: Agent A
   锁定时间: 2025-01-20 14:30:00
   ```

2. **同时更新任务索引**
   ```markdown
   | 002 | 任务标题 | Locked | ... | ... | Agent A | 14:30:00 |
   ```

3. **锁定超时释放**
   - 默认锁定时长：预计时间 × 2
   - 超时后自动释放，其他 Agent 可认领
   - 可在任务文件中调整锁定超时

4. **解锁条件**
   - 任务完成 → 状态更新为 `Done`，移除锁定
   - 阻塞 → 状态更新为 `Blocked`，释放锁定
   - 超时 → 自动释放
   - 手动释放：Agent 主动放弃

#### 锁定状态流转

```
Todo → Locked → In Progress → Done
  ↓        ↓
Blocked  超时释放
```

#### 阻塞处理

**任务阻塞时**：

1. **记录阻塞原因**
   ```markdown
   ## 阻塞原因
   - 等待任务003完成（状态：In Progress）
   - 等待API密钥审批
   ```

2. **更新状态**
   - 状态：`In Progress` → `Blocked`
   - 释放锁定（占用者清空）

3. **Agent 选择**
   - 等待阻塞解除（推荐）
   - 认领其他可执行任务

**阻塞解除后**：

1. 检查依赖是否都完成
2. 重新锁定任务
3. 继续执行

#### 多 Agent 协作流程

```bash
# Agent A 开始工作
1. 读取 task/{任务集名}/任务索引.md
2. 查找状态为 Todo 的任务
3. 检查依赖任务是否都为 Done
4. 锁定任务（更新状态为 Locked，记录占用者）
5. 更新任务索引
6. 开始执行

# Agent B 同时开始工作
1. 读取 task/{任务集名}/任务索引.md
2. 查找状态为 Todo 的任务
3. 发现任务002已被 Agent A 锁定
4. 寻找下一个可执行任务
5. 锁定任务003
6. 开始执行

# 任务阻塞处理
1. Agent A 发现任务004被阻塞
2. 记录阻塞原因
3. 更新状态为 Blocked
4. 释放锁定
5. 查找其他可执行任务
```

### 示例：3 Agent 并行开发

```
任务列表：
001: 初始化项目 (无依赖)
002: 设计数据库 (依赖 001)
003: 设计 API (依赖 001)
004: 实现 API 接口 (依赖 003)
005: 实现前端页面 (依赖 003)
006: 编写单元测试 (依赖 004, 005)
007: 集成测试 (依赖 006)

调度方案：
阶段 1:
  - Agent A: 任务001

阶段 2:
  - Agent A: 任务002
  - Agent B: 任务003

阶段 3:
  - Agent A: 任务004
  - Agent B: 任务005
  - Agent C: 等待

阶段 4:
  - Agent A: 任务006
  - Agent B: 等待
  - Agent C: 等待

阶段 5:
  - Agent A: 任务007
```

### 最佳实践

1. **任务粒度适中**：太大影响并行，太小增加协调成本
2. **明确依赖**：避免隐式依赖
3. **及时更新状态**：方便其他 Agent 判断是否可开始
4. **定期同步**：各 Agent 定期汇报进度
5. **预留缓冲**：考虑任务可能超时