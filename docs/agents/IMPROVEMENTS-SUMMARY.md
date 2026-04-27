# Pi Agent 代理系统改进总结

## 概述

本次更新借鉴了 Claude Code v2.1.19 的系统提示词设计，为 Pi Agent 代理系统添加了显式模式声明、五阶段计划工作流和专业的安全审查能力。

## 主要改进

### 1. 🔒 只读模式显式声明与约束

#### 改进前
```markdown
---
name: scout
description: 快速代码侦察
tools: read, grep, find, ls, bash
---

你是一名侦察员...
```
**问题**：虽然工具列表中无 write/edit，但 bash 工具仍可执行修改命令。

#### 改进后
```markdown
---
name: scout
description: Fast code reconnaissance agent (READ-ONLY)
version: "1.2.0"
tools: read, grep, find, ls, bash, ace-tool
mode: readonly
category: exploration
requires_context: false
max_parallel: 1
---

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
You are a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:

**File Operations:**
- ❌ Creating new files (no Write, touch, or file creation of any kind)
- ❌ Modifying existing files (no Edit operations)
- ❌ Deleting files (no rm or deletion)
- ❌ Moving or copying files (no mv or cp)
- ❌ Creating temporary files anywhere, including /tmp
- ❌ Using redirect operators (>, >>, |) or heredocs to write to files

**Bash Restrictions:**
- ✅ ALLOWED: ls, find, grep, cat, head, tail, git log, git diff, git show, git status
- ❌ FORBIDDEN: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install
```

**优势**：
- ✅ 显式声明只读模式
- ✅ 详细列出所有禁止操作
- ✅ 明确允许的 bash 命令
- ✅ 添加安全警告

### 2. 📋 五阶段计划模式

#### 新增 Planner 代理

```markdown
---
name: planner
description: Five-phase planning agent with parallel exploration
version: "1.0.0"
tools: read, grep, find, ls, bash, subagent, interview
mode: planning
category: planning
requires_context: true
max_parallel: 3
---

## Five-Phase Planning Workflow

### Phase 1: Context Discovery (Initial Understanding)
**Goal:** Gain comprehensive understanding through parallel exploration.

1. **Assess Task Complexity:**
   - Simple (L1): Single file, <50 lines
   - Medium (L2): 2-5 files, 50-200 lines
   - Complex (L3): 6-10 files, 200-500 lines
   - Highly Complex (L4): 10+ files, 500+ lines

2. **Launch Explore Agents IN PARALLEL:**
   - Use 1 agent: isolated tasks, specific paths
   - Use 2-3 agents: uncertain scope, multiple areas

### Phase 2: Design & Strategy
**Goal:** Design implementation approach.

1. **Launch Plan Agent(s):**
   - Default: at least 1 Plan agent
   - Skip: only for trivial tasks
   - Multiple (up to 3): for complex tasks

2. **Agent Prompt Template:**
   - Files Found (from Phase 1)
   - Patterns Identified
   - User Requirements
   - Constraints

### Phase 3: Review & Alignment
**Goal:** Review plans and ensure alignment with user intent.

1. Read critical files
2. Use interview tool for clarification
3. Validation checklist

### Phase 4: Final Plan
**Goal:** Write final plan to plan file.

**Plan File Structure:**
```markdown
# Implementation Plan

## Approach
[Brief description]

## Critical Files
- `file.ts` - [reason]

## Implementation Steps
### Step 1: [Description]
- Files: ...
- Complexity: ...

## Verification
- [ ] Test scenario 1

## Risks & Mitigation
- Risk: ...
  - Mitigation: ...
```

### Phase 5: Exit Planning
**Goal:** Request user approval.

- Always call interview tool at the end
- Present: approach, files, steps, verification
- Use interview tool ONLY for plan approval
```

**优势**：
- ✅ 结构化工作流，避免混乱
- ✅ 并行探索，提高效率
- ✅ 多代理设计，多种视角
- ✅ 明确的批准流程
- ✅ 完整的验证策略

### 3. 🛡️ 安全审查代理

#### 新增 Security Reviewer 代理

```markdown
---
name: security-reviewer
description: Security-focused code review agent
version: "1.0.0"
tools: read, grep, find, ls, bash
mode: readonly
category: security
requires_context: true
max_parallel: 1
---

## Objective
Identify HIGH-CONFIDENCE security vulnerabilities (>80% confidence).

## EXCLUSIONS (Do NOT Report)
❌ **HARD EXCLUSIONS:**
1. Denial of Service (DOS) vulnerabilities
2. Rate limiting concerns
3. Memory consumption issues
4. Theoretical race conditions
5. Outdated third-party libraries
6. Memory safety issues in safe languages
7. Unit test vulnerabilities
8. Log spoofing
9. SSRF path-only control
10. AI prompt injection
11. Regex injection
12. Insecure documentation
13. Lack of audit logs

## Security Categories
1. Input Validation (SQL injection, command injection, XSS, etc.)
2. Authentication & Authorization
3. Crypto & Secrets Management
4. Injection & Code Execution
5. Data Exposure

## Output Format
```markdown
# Vuln 1: CATEGORY: `file:line`

* **Severity**: High/Medium/Low
* **Description**: [technical description]
* **Exploit Scenario**: [concrete attack path]
* **Recommendation**: [specific fix]
```

## Confidence Scoring
- 0.9-1.0: Certain exploit path
- 0.8-0.9: Clear vulnerability pattern
- <0.8: Don't report
```

**优势**：
- ✅ 18 项硬性排除规则，减少误报
- ✅ 精确的置信度评分
- ✅ 五大安全类别全面覆盖
- ✅ 结构化漏洞报告
- ✅ 具体的修复建议

### 4. 📊 代理元数据系统

#### 新增字段

```typescript
export interface AgentConfig {
  // 原有字段
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  provider?: string;
  registerCommand?: boolean;
  showInTool?: boolean;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;

  // 新增字段
  mode?: AgentMode;              // standard | readonly | planning | restricted
  version?: string;              // 版本号
  category?: string;             // exploration | planning | security | general
  requires_context?: boolean;    // 是否需要完整上下文
  max_parallel?: number;         // 最大并行实例数
}

export type AgentMode = "standard" | "readonly" | "planning" | "restricted";
```

**优势**：
- ✅ 版本追踪
- ✅ 代理分类
- ✅ 上下文需求声明
- ✅ 并行控制
- ✅ 模式验证（未来）

## 文件清单

### 更新的文件
1. `~/.pi/agent/extensions/subagent/agents.ts`
   - 扩展 `AgentConfig` 接口
   - 添加 `AgentMode` 类型
   - 更新 frontmatter 解析逻辑

### 新建的代理
2. `~/.pi/agent/agents/scout.md` (v1.2.0)
   - 添加只读模式
   - 添加操作约束

3. `~/.pi/agent/agents/planner.md` (v1.0.0)
   - 全新五阶段计划代理

4. `~/.pi/agent/agents/security-reviewer.md` (v1.0.0)
   - 全新安全审查代理

### 新建的文档
5. `~/.pi/agent/agents/README-EXAMPLES.md`
   - 完整使用示例
   - 工作流演示
   - 最佳实践

6. `~/.pi/agent/agents/CHANGELOG.md`
   - 版本历史
   - 改进记录
   - 迁移指南

7. `~/.pi/agent/agents/QUICK-REF.md`
   - 快速参考
   - 命令速查
   - 常见问题

8. `~/.pi/agent/agents/IMPROVEMENTS-SUMMARY.md`
   - 本文档

## 借鉴来源

本次改进主要借鉴了 Claude Code v2.1.19 的以下系统提示词：

### 1. 只读模式约束
**来源**: `agent-prompt-explore.md`
```markdown
=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
...
```

### 2. 五阶段计划模式
**来源**: `system-reminder-plan-mode-is-active-5-phase.md`
```markdown
## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding...
Launch up to 3 Explore agents IN PARALLEL...

### Phase 2: Design
Goal: Design an implementation approach.
Launch Plan agent(s) to design the implementation...

### Phase 3: Review
Goal: Review the plan(s) from Phase 2...

### Phase 4: Final Plan
Goal: Write your final plan to the plan file...

### Phase 5: Call ExitPlanMode
At the very end of your turn...
```

### 3. 安全审查方法论
**来源**: `agent-prompt-security-review-slash-command.md`
```markdown
## EXCLUSIONS (Do NOT Report)
> HARD EXCLUSIONS - Automatically exclude findings matching these patterns:
> 1. Denial of Service (DOS) vulnerabilities...
> 2. Secrets or credentials stored on disk...

## Confidence Scoring
- 0.9-1.0: Certain exploit path identified...
- 0.8-0.9: Clear vulnerability pattern with known exploitation methods...
- Below 0.7: Don't report (too speculative)...
```

## 使用示例

### 示例 1: 实现新功能

```javascript
// 使用 Planner 进行五阶段规划
subagent({
  agent: "planner",
  task: "实现用户评论功能，支持 CRUD、回复嵌套、点赞"
})

// Planner 会自动：
// 1. 并行调用 Scout 探索代码库
// 2. 设计实现方案
// 3. 审查和对齐
// 4. 生成最终计划
// 5. 请求用户批准

// 用户批准后，使用 Worker 实现
subagent({
  agent: "worker",
  task: "按照 PLAN.md 实现评论功能"
})

// 实现完成后，进行安全审查
subagent({
  agent: "security-reviewer",
  task: "审查评论功能的安全漏洞"
})
```

### 示例 2: 探索代码库

```javascript
// 并行探索多个区域
subagent({
  tasks: [
    { agent: "scout", task: "查找所有 API 路由定义" },
    { agent: "scout", task: "查找数据库模型" },
    { agent: "scout", task: "查找测试文件" }
  ]
})
```

### 示例 3: 链式执行

```javascript
// 顺序依赖任务
subagent({
  chain: [
    { agent: "scout", task: "查找 API 定义" },
    { agent: "analyst", task: "分析模式: {previous}" },
    { agent: "worker", task: "生成文档: {previous}" }
  ]
})
```

## 兼容性

### 向后兼容
- ✅ 旧代理仍然可以正常工作
- ✅ 新字段全部可选
- ✅ 未指定 `mode` 时默认为 `standard`

### 迁移指南
对于现有代理，如需添加新字段：

```markdown
---
name: your-agent
description: Your agent description
version: "1.0.0"
mode: standard  # 或 readonly, planning, restricted
category: general
requires_context: false
max_parallel: 1
---
```

## 下一步计划

### 短期
- [ ] 添加代理模式运行时验证（检查 bash 命令）
- [ ] 创建更多专用代理（analyst, optimizer）
- [ ] 添加代理性能监控

### 中期
- [ ] 实现代理间通信机制
- [ ] 添加代理依赖管理
- [ ] 创建代理市场

### 长期
- [ ] 自动代理选择（基于任务类型）
- [ ] 代理学习和优化
- [ ] 分布式代理执行

## 总结

本次改进成功借鉴了 Claude Code 的系统提示词设计，为 Pi Agent 代理系统添加了：

1. **🔒 只读模式**：显式声明和严格约束
2. **📋 五阶段计划模式**：结构化工作流
3. **🛡️ 安全审查代理**：专业的漏洞检测
4. **📊 代理元数据**：版本、分类、模式

这些改进使 Pi Agent 的代理系统更加专业、可靠和易用，同时保持了向后兼容性。

## 相关资源

- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Pi Agent Extensions](../extensions/subagent/README.md)
- [使用示例](README-EXAMPLES.md)
- [快速参考](QUICK-REF.md)
- [更新日志](CHANGELOG.md)