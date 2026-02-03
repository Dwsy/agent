# Ralph Loop Gen - 任务管理模板生成器

根据用户输入或 JSON 配置生成完整的任务管理结构模板。

## 功能特性

- ✅ 支持交互式输入和 JSON 配置两种方式
- ✅ 自动生成任务索引、任务文件和当前任务文件
- ✅ 自动识别可并行任务批次
- ✅ 生成执行计划和依赖关系图
- ✅ 支持项目目标追踪
- ✅ 内置任务锁定机制

## 快速开始

### 方式 1: 使用 Python 脚本（推荐）

```bash
# 1. 创建任务配置文件
cat > tasks.json << 'EOF'
{
  "taskSetName": "my-project",
  "projectName": "我的项目",
  "outputDir": "./task",
  "tasks": [
    {
      "id": "001",
      "title": "初始化项目",
      "priority": "High",
      "estimated": "2h",
      "description": "初始化项目基础结构",
      "steps": [
        "创建项目目录",
        "初始化 Git",
        "创建 README"
      ],
      "dependencies": [],
      "acceptance": [
        "项目目录创建完成",
        "Git 仓库初始化完成",
        "README 文件创建完成"
      ]
    }
  ]
}
EOF

# 2. 生成任务模板
python3 ~/.pi/agent/skills/ralph-loop-gen/generate.py --config tasks.json

# 3. 查看生成的任务
cat task/my-project/任务索引.md
```

### 方式 2: 使用交互式命令

```bash
# 运行生成器
bun ~/.pi/agent/skills/ralph-loop-gen/lib.ts --name my-project --project "我的项目"

# 输入任务列表（Ctrl+D 结束）
任务1: 初始化项目结构
任务2: 安装依赖 -> 依赖: 任务1
任务3: 配置开发环境 -> 依赖: 任务2
^D
```

## 配置文件格式

```json
{
  "taskSetName": "项目名称",
  "projectName": "项目显示名称",
  "outputDir": "./task",
  "goals": [
    {
      "metric": "性能指标",
      "before": "优化前值",
      "target": "目标值",
      "improvement": "提升幅度",
      "method": "测量方法"
    }
  ],
  "tasks": [
    {
      "id": "001",
      "title": "任务标题",
      "priority": "High|Medium|Low",
      "estimated": "2h",
      "description": "任务描述",
      "steps": ["步骤1", "步骤2"],
      "dependencies": ["001"],
      "acceptance": ["验收标准1", "验收标准2"]
    }
  ]
}
```

## 输出结构

```
task/
└── {任务集名}/
    ├── 任务索引.md          # 任务总览和依赖关系
    ├── 当前任务.md          # 当前待执行任务
    ├── 任务001.md
    ├── 任务002.md
    ├── 任务003.md
    └── completed/           # 已完成任务目录
```

## 多 Agent 协作

### 任务锁定机制

1. **领用任务时立即锁定**
   ```markdown
   状态: Todo → Locked
   占用者: Agent A
   锁定时间: 2025-01-20 14:30:00
   ```

2. **开始执行时**
   ```markdown
   状态: Locked → In Progress
   ```

3. **任务完成时**
   ```markdown
   状态: In Progress → Done
   移动到 completed/ 目录
   ```

4. **任务阻塞时**
   ```markdown
   状态: In Progress → Blocked
   释放锁定
   记录阻塞原因
   ```

### 并行执行示例

```
阶段 1: Agent A (3h)
└── 任务001: 建立性能基准测试

阶段 2: (3h)
├── Agent A: 任务002 (2h) + 等待 (1h)
├── Agent B: 任务003 (2h) + 等待 (1h)
└── Agent C: 任务004 (1.5h) + 任务005 (1.5h)

总耗时: ~18 小时（3 Agent 并行）
```

## 最佳实践

1. **任务粒度适中**：2-4 小时为宜
2. **明确依赖**：避免隐式依赖
3. **可验证验收**：使用可测量的指标
4. **及时更新状态**：方便其他 Agent 判断
5. **预留缓冲**：考虑任务可能超时

## 示例

查看示例配置文件：

```bash
cat ~/.pi/agent/skills/ralph-loop-gen/examples/config-example.json
```

生成示例任务：

```bash
python3 ~/.pi/agent/skills/ralph-loop-gen/generate.py \
  --config ~/.pi/agent/skills/ralph-loop-gen/examples/config-example.json
```

## 许可证

MIT License