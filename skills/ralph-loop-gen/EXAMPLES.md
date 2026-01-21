# Ralph Loop Gen - 使用示例

## 快速开始

### 示例 1：简单任务列表

```bash
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name myProject --project "我的项目"
```

输入：
```
任务1: 初始化项目结构
任务2: 安装依赖 -> 依赖: 任务1
任务3: 配置开发环境 -> 依赖: 任务2
任务4: 编写UI组件 -> 依赖: 任务2
任务5: 编写API接口 -> 依赖: 任务3
任务6: 集成测试 -> 依赖: 任务4, 任务5
```

### 示例 2：带优先级和时间的任务

```bash
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name webApp --project "Web应用开发"
```

输入：
```
任务1: 项目初始化 (High, 2h)
任务2: 数据库设计 -> 依赖: 任务1
任务3: API开发 (High, 8h) -> 依赖: 任务2
任务4: 前端开发 (High, 8h) -> 依赖: 任务1
任务5: 测试 (Medium, 4h) -> 依赖: 任务3, 任务4
```

### 示例 3：使用 JSON 格式

```bash
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name apiProject --project "API项目" --format json
```

输入：
```json
[
  {
    "id": 1,
    "title": "需求分析",
    "priority": "High",
    "estimated": "4h",
    "description": "分析项目需求",
    "steps": ["收集需求", "编写文档", "评审"],
    "dependencies": []
  },
  {
    "id": 2,
    "title": "架构设计",
    "priority": "High",
    "estimated": "8h",
    "description": "设计系统架构",
    "steps": ["技术选型", "架构图", "数据库设计"],
    "dependencies": [1]
  },
  {
    "id": 3,
    "title": "开发实现",
    "priority": "High",
    "estimated": "40h",
    "description": "开发核心功能",
    "dependencies": [2]
  }
]
```

### 示例 4：从文件读取

```bash
# 创建任务文件
cat > tasks.txt << 'EOF'
任务1: 环境搭建
任务2: 代码生成 -> 依赖: 任务1
任务3: 测试编写 -> 依赖: 任务2
EOF

# 从文件读取并生成
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name autoProject < tasks.txt
```

## 生成的目录结构

```
task/
└── myProject/
    ├── 任务索引.md          # 查看所有任务和依赖关系
    ├── 当前任务.md          # 当前需要执行的任务
    ├── 任务001.md
    ├── 任务002.md
    ├── 任务003.md
    └── completed/           # 完成的任务移到这里
```

## 多 Agent 协作示例

### 场景：前后端并行开发

```
任务1: 项目初始化
任务2: 设计数据库 -> 依赖: 任务1
任务3: 设计API接口 -> 依赖: 任务2
任务4: 实现后端API (High, 8h) -> 依赖: 任务3
任务5: 实现前端页面 (High, 8h) -> 依赖: 任务1
任务6: 联调测试 -> 依赖: 任务4, 任务5
```

**执行方案：**

阶段 1：
- Agent A: 任务1 (项目初始化)

阶段 2：
- Agent A: 任务2, 任务3 (数据库和API设计)
- Agent B: 任务5 (前端开发，可并行)

阶段 3：
- Agent A: 任务4 (后端实现)
- Agent B: 继续任务5

阶段 4：
- Agent A + Agent B: 任务6 (联调测试)

### Agent 工作流程

```bash
# Agent A 开始工作
1. 读取 task/myProject/任务索引.md
2. 找到状态为 Locked 的任务001
3. 检查依赖（无依赖）
4. 开始执行任务001
5. 完成后更新状态为 Done
6. 提交 git
7. 移动到 task/myProject/completed/
8. 读取任务索引，选择下一个任务

# Agent B 同时工作
1. 读取 task/myProject/任务索引.md
2. 找到状态为 Todo 的任务
3. 检查依赖是否都完成
4. 锁定任务（更新状态为 Locked，记录占用者）
5. 开始执行
6. 完成后更新状态并释放锁定
```

## 任务状态管理

### 状态流转

```
Todo → Locked → In Progress → Done
  ↓        ↓
Blocked  超时释放
```

### 状态更新

**领用任务时：**
```markdown
**状态**: Locked → In Progress
**占用者**: Agent A
**锁定时间**: 2026-01-20 16:00:00
```

**任务完成时：**
```markdown
**状态**: In Progress → Done
**完成时间**: 2026-01-20 18:00:00
**耗时**: 2h
```

**任务阻塞时：**
```markdown
## 阻塞原因
- 等待任务003完成
- 等待API密钥审批

**状态**: In Progress → Blocked
```

## 实用技巧

### 1. 批次查看可并行任务

查看 `任务索引.md` 中的"可并行任务分组"部分：

```markdown
### 批次 3（等待 批次2 完成）
- 任务003: 配置开发环境 (依赖: 任务002)
  - 任务004: 编写UI组件 (依赖: 任务002)
  ✅ 可并行执行
```

### 2. 依赖关系可视化

查看依赖关系图，快速理解任务依赖：

```
任务001 (初始化)
├─→ 任务002 (安装依赖)
│   ├─→ 任务003 (配置)
│   └─→ 任务004 (UI)
└─→ 任务005 (API)
```

### 3. 进度跟踪

定期查看任务索引顶部的统计信息：

```markdown
**总任务数**: 6
**已完成**: 2
**进行中**: 1
**待开始**: 2
**已锁定**: 1
```

### 4. Git 提交策略

每个任务完成后立即提交：

```bash
git add -A
git commit -m "feat(task001): 初始化项目结构"

# 将已完成的任务移动到 completed/
mv task/myProject/任务001.md task/myProject/completed/
```

## 故障排除

### 问题：任务卡在 Locked 状态

**解决**：检查锁定时间，如果超时可以手动释放或重新认领

### 问题：依赖任务状态未更新

**解决**：手动检查并更新前置任务的状态为 Done

### 问题：找不到可执行任务

**解决**：
1. 检查任务索引，确认所有依赖任务都已完成
2. 查看是否有任务被阻塞
3. 检查是否有任务被超时锁定

## 最佳实践

1. **任务粒度适中**：太大影响并行，太小增加协调成本
2. **明确依赖**：避免隐式依赖，所有依赖关系都要显式声明
3. **及时更新状态**：方便其他 Agent 判断是否可开始
4. **定期同步**：各 Agent 定期汇报进度，更新任务索引
5. **预留缓冲**：考虑任务可能超时，预留额外时间
6. **使用独立分支**：每个 Agent 使用独立分支，避免冲突