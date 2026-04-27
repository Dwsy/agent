# Pi Agent 代理系统快速参考

## 代理模式

### Readonly 模式
```markdown
mode: readonly
```
- **禁止**: 创建、修改、删除文件
- **允许**: read, grep, find, ls, bash (只读命令)
- **用途**: 代码探索、安全审查
- **代理**: scout, security-reviewer

### Planning 模式
```markdown
mode: planning
```
- **禁止**: 修改除计划文件外的任何文件
- **允许**: read, grep, find, ls, bash (只读), subagent, interview
- **用途**: 方案设计、任务规划
- **代理**: planner

### Standard 模式
```markdown
mode: standard
```
- **限制**: 无
- **用途**: 代码实现、代码审查
- **代理**: worker, reviewer

## 代理列表

### Scout（侦察员）- v1.2.0
```javascript
subagent({ agent: "scout", task: "查找认证相关代码" })
```
- **模式**: readonly
- **用途**: 快速代码探索
- **输出**: 文件列表、关键代码、架构说明

### Planner（规划师）- v1.0.0
```javascript
subagent({ agent: "planner", task: "实现用户头像上传功能" })
```
- **模式**: planning
- **用途**: 五阶段任务规划
- **工作流**:
  1. Context Discovery（并行探索）
  2. Design & Strategy（方案设计）
  3. Review & Alignment（审查对齐）
  4. Final Plan（最终计划）
  5. Exit Planning（请求批准）

### Security Reviewer（安全审查员）- v1.0.0
```javascript
subagent({ agent: "security-reviewer", task: "审查代码安全漏洞" })
```
- **模式**: readonly
- **用途**: 安全漏洞检测
- **输出**: 结构化漏洞报告（严重性、利用场景、修复建议）

### Worker（工作者）- v1.0.0
```javascript
subagent({ agent: "worker", task: "实现用户注册功能" })
```
- **模式**: standard
- **用途**: 通用代码实现
- **工具**: 所有可用工具

### Reviewer（审查员）- v1.0.0
```javascript
subagent({ agent: "reviewer", task: "审查代码质量" })
```
- **模式**: standard
- **用途**: 代码质量审查
- **输出**: 问题列表、改进建议

## 执行模式

### Single（单一）
```javascript
subagent({
  agent: "scout",
  task: "查找认证代码"
})
```

### Parallel（并行）
```javascript
subagent({
  tasks: [
    { agent: "scout", task: "查找认证代码" },
    { agent: "scout", task: "查找数据库代码" },
    { agent: "scout", task: "查找 API 代码" }
  ]
})
```
- **最大**: 8 个并发
- **用途**: 独立任务

### Chain（链式）
```javascript
subagent({
  chain: [
    { agent: "scout", task: "查找 API 定义" },
    { agent: "analyst", task: "分析模式: {previous}" },
    { agent: "worker", task: "生成文档: {previous}" }
  ]
})
```
- **占位符**: `{previous}` 替换为上一步输出
- **用途**: 依赖任务

## 作用域

### User（用户级）
```javascript
subagent({
  agent: "my-agent",
  task: "任务",
  agentScope: "user"
})
```
- **路径**: `~/.pi/agent/agents/`
- **用途**: 全局共享代理

### Project（项目级）
```javascript
subagent({
  agent: "my-agent",
  task: "任务",
  agentScope: "project"
})
```
- **路径**: `.pi/agents/`
- **用途**: 项目特定代理

### Both（两者）
```javascript
subagent({
  agent: "my-agent",
  task: "任务",
  agentScope: "both"
})
```
- **搜索**: 同时搜索用户和项目目录
- **优先级**: 项目代理优先

## 代理元数据

### 完整配置示例
```markdown
---
name: custom-agent
description: Custom agent description
version: "1.0.0"
tools: read, bash, write, edit
mode: standard
category: general
requires_context: false
max_parallel: 1
model: claude-sonnet-4
provider: anthropic
showInTool: true
registerCommand: true
---

System prompt content...
```

### 字段说明

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ✅ | - | 代理名称 |
| `description` | string | ✅ | - | 代理描述 |
| `version` | string | ❌ | - | 版本号 |
| `tools` | string | ❌ | - | 工具列表（逗号分隔） |
| `mode` | AgentMode | ❌ | standard | 代理模式 |
| `category` | string | ❌ | - | 代理分类 |
| `requires_context` | boolean | ❌ | false | 是否需要上下文 |
| `max_parallel` | number | ❌ | - | 最大并行数 |
| `model` | string | ❌ | - | 使用的模型 |
| `provider` | string | ❌ | - | 模型提供商 |
| `showInTool` | boolean | ❌ | false | 是否在工具描述显示 |
| `registerCommand` | boolean | ❌ | true | 是否注册命令 |

## 命令行

### 列出代理
```bash
/sub
```

### 调用代理
```bash
/sub:scout 查找认证代码
/sub:planner 实现用户功能
/sub:security-reviewer 审查安全
```

### 创建代理
```bash
/create-agent myagent "描述" --scope user --template worker
```

### 列出代理
```bash
/list-agents user
/list-agents project
/list-agents dynamic
```

### 删除代理
```bash
/delete-agent myagent --scope user
```

## Bash 命令限制

### Readonly 模式允许
```bash
✅ ls, find, grep, cat, head, tail
✅ git log, git diff, git show, git status
✅ fd, rg (ripgrep)
```

### Readonly 模式禁止
```bash
❌ mkdir, touch, rm, cp, mv
❌ git add, git commit, git checkout
❌ npm install, pip install, npm run, cargo build
❌ >, >>, | (重定向和管道写入)
```

## 安全审查要点

### 硬性排除（不报告）
- ❌ DOS 漏洞
- ❌ 速率限制问题
- ❌ 内存消耗问题
- ❌ 理论竞态条件
- ❌ 过时的第三方库
- ❌ 内存安全语言的安全问题
- ❌ 测试文件漏洞
- ❌ 日志欺骗
- ❌ SSRF 路径控制
- ❌ AI 提示词注入
- ❌ Regex 注入
- ❌ 不安全文档

### 应报告
- ✅ SQL 注入
- ✅ 命令注入
- ✅ XSS 漏洞
- ✅ 认证绕过
- ✅ 权限提升
- ✅ 硬编码密钥
- ✅ 弱加密算法
- ✅ 反序列化漏洞

### 置信度评分
- **0.9-1.0**: 确定利用路径
- **0.8-0.9**: 清晰漏洞模式
- **<0.8**: 不报告

## 任务复杂度

### L1 - 简单
- 文件数: 1-2
- 变更行数: <50
- 依赖: 无
- 策略: 直接执行

### L2 - 中等
- 文件数: 3-5
- 变更行数: 50-200
- 依赖: 1-2
- 策略: Phase 1 → Phase 2 → 实现

### L3 - 复杂
- 文件数: 6-10
- 变更行数: 200-500
- 依赖: 3-5
- 策略: 完整五阶段工作流

### L4 - 严重复杂
- 文件数: 10+
- 变更行数: 500+
- 依赖: 5+
- 策略: 完整工作流 + 子任务拆分

## 输出格式

### Scout 输出
```markdown
## Files Retrieved
1. `path/to/file.ts` (10-50行) - 描述

## Key Code
```typescript
code here
```

## Architecture
架构说明

## Where to Start
从哪里开始
```

### Planner 输出
```markdown
# Implementation Plan

## Approach
方案说明

## Critical Files
- `file.ts` - 原因

## Implementation Steps
### Step 1
- Files: ...
- Complexity: ...

## Verification
- [ ] 测试 1

## Risks & Mitigation
- Risk: ...
  - Mitigation: ...
```

### Security Reviewer 输出
```markdown
# Vuln 1: CATEGORY: `file:line`

* **Severity**: High/Medium/Low
* **Description**: 描述
* **Exploit Scenario**: 利用场景
* **Recommendation**: 修复建议

## Summary
总结
```

## 最佳实践

### 选择代理
- 探索代码 → `scout`
- 规划任务 → `planner`
- 实现功能 → `worker`
- 安全审查 → `security-reviewer`
- 代码审查 → `reviewer`

### 选择执行模式
- 独立任务 → `tasks` (并行)
- 依赖任务 → `chain` (链式)
- 单一任务 → `agent` (单一)

### 使用 planner
1. 让 planner 自动调用 scout 并行探索
2. planner 设计方案
3. planner 请求批准
4. 用户批准后实现

### 安全审查
1. 实现完成后调用 `security-reviewer`
2. 只报告高置信度问题（>80%）
3. 提供具体修复建议

## 常见问题

### Q: scout 代理报错？
A: 检查是否尝试修改文件，scout 是只读模式

### Q: planner 代理未生成计划？
A: 检查是否完成了所有五个阶段，特别是 Phase 5 的批准请求

### Q: security-reviewer 无输出？
A: 可能没有高置信度安全问题，或触发了硬性排除规则

### Q: 如何创建自定义代理？
A: 使用 `/create-agent` 命令或手动创建 `.md` 文件

### Q: 动态代理在哪里？
A: 保存到 `~/.pi/agent/agents/dynamic/`

## 相关文档

- `README.md` - 主文档
- `README-EXAMPLES.md` - 使用示例
- `CHANGELOG.md` - 更新日志
- `../extensions/subagent/README.md` - 扩展文档