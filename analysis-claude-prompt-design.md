# Claude Code 提示词设计深度分析

> 「言葉は人間の心を映す鏡」 —— 语言是映照人心的镜子  
> 分析对象: Claude Code Source 提示词系统

---

## 📋 目录

1. [系统提示词架构](#系统提示词架构)
2. [提示词分节与缓存策略](#提示词分节与缓存策略)
3. [工具提示词设计](#工具提示词设计)
4. [子代理提示词](#子代理提示词)
5. [记忆与压缩提示词](#记忆与压缩提示词)
6. [设计哲学与最佳实践](#设计哲学与最佳实践)
7. [对 Pi 的借鉴建议](#对-pi-的借鉴建议)

---

## 系统提示词架构

### 整体结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    系统提示词 (getSystemPrompt)                 │
├─────────────────────────────────────────────────────────────────┤
│  静态部分 (可缓存)                                               │
│  ├── getSimpleIntroSection()        # 身份介绍                  │
│  ├── getSimpleSystemSection()       # 系统规则                  │
│  ├── getSimpleDoingTasksSection()   # 任务执行规范              │
│  ├── getActionsSection()            # 安全操作指南              │
│  ├── getUsingYourToolsSection()     # 工具使用指南              │
│  ├── getSimpleToneAndStyleSection() # 语气风格                  │
│  └── getOutputEfficiencySection()   # 输出效率                  │
├─────────────────────────────────────────────────────────────────┤
│  动态边界标记                                                    │
│  └── SYSTEM_PROMPT_DYNAMIC_BOUNDARY  # 缓存分割点               │
├─────────────────────────────────────────────────────────────────┤
│  动态部分 (每轮重新计算)                                         │
│  ├── session_guidance               # 会话特定指导              │
│  ├── memory                         # 记忆加载                  │
│  ├── env_info_simple                # 环境信息                  │
│  ├── language                       # 语言偏好                  │
│  ├── output_style                   # 输出样式                  │
│  ├── mcp_instructions               # MCP 服务器指令            │
│  └── ...                            # 其他动态内容              │
└─────────────────────────────────────────────────────────────────┘
```

### 核心设计模式

#### 模式 1: 静态/动态分离 + 缓存边界

```typescript
// src/constants/prompts.ts
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = 
  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

export async function getSystemPrompt(tools, model, ...): Promise<string[]> {
  return [
    // --- 静态内容 (跨用户/跨会话可缓存) ---
    getSimpleIntroSection(outputStyleConfig),
    getSimpleSystemSection(),
    getSimpleDoingTasksSection(),
    // ... 更多静态章节
    
    // === 边界标记 ===
    ...(shouldUseGlobalCacheScope() ? [SYSTEM_PROMPT_DYNAMIC_BOUNDARY] : []),
    
    // --- 动态内容 (每轮重新计算) ---
    ...resolvedDynamicSections,
  ].filter(s => s !== null)
}
```

**设计价值:**
- 静态部分可跨用户缓存，节省 token 和延迟
- 动态部分包含会话特定信息（环境、记忆、MCP 状态）
- 边界标记明确告知缓存系统分割点

---

#### 模式 2: 分节解析与独立缓存

```typescript
// src/constants/systemPromptSections.ts
type SystemPromptSection = {
  name: string
  compute: () => string | null | Promise<string | null>
  cacheBreak: boolean  // 是否每轮重新计算
}

// 普通节 - 计算一次，缓存到 /clear 或 /compact
export function systemPromptSection(name, compute): SystemPromptSection {
  return { name, compute, cacheBreak: false }
}

// 易变节 - 每轮重新计算（会打断 prompt cache）
export function DANGEROUS_uncachedSystemPromptSection(
  name, 
  compute, 
  _reason: string  // 必须说明为什么需要缓存打断
): SystemPromptSection {
  return { name, compute, cacheBreak: true }
}

// 解析所有节，自动处理缓存
export async function resolveSystemPromptSections(
  sections: SystemPromptSection[]
): Promise<(string | null)[]> {
  const cache = getSystemPromptSectionCache()
  
  return Promise.all(sections.map(async s => {
    if (!s.cacheBreak && cache.has(s.name)) {
      return cache.get(s.name)  // 命中缓存
    }
    const value = await s.compute()
    setSystemPromptSectionCacheEntry(s.name, value)
    return value
  }))
}
```

**设计价值:**
- 细粒度缓存控制，每个节独立管理
- 显式标记易变节，强制开发者说明原因
- 支持运行时缓存清理 (`clearSystemPromptSections`)

---

#### 模式 3: 提示词构建优先级

```typescript
// src/utils/systemPrompt.ts
export function buildEffectiveSystemPrompt({
  mainThreadAgentDefinition,  // Agent 定义
  toolUseContext,
  customSystemPrompt,         // --system-prompt 自定义
  defaultSystemPrompt,        // 默认系统提示词
  appendSystemPrompt,         // 追加内容
  overrideSystemPrompt,       // 完全覆盖
}: BuildOptions): SystemPrompt {
  // 1. 覆盖提示词 (最高优先级)
  if (overrideSystemPrompt) {
    return asSystemPrompt([overrideSystemPrompt])
  }
  
  // 2. 协调器模式
  if (isCoordinatorMode()) {
    return asSystemPrompt([getCoordinatorSystemPrompt(), ...])
  }
  
  // 3. Agent 提示词 (继承或替换)
  const agentSystemPrompt = mainThreadAgentDefinition?.getSystemPrompt()
  
  // 3a. Proactive 模式: Agent 提示词追加到默认后
  if (isProactiveActive() && agentSystemPrompt) {
    return asSystemPrompt([
      ...defaultSystemPrompt,
      `\n# Custom Agent Instructions\n${agentSystemPrompt}`,
      ...
    ])
  }
  
  // 3b. 普通模式: Agent 提示词替换默认
  return asSystemPrompt([
    ...(agentSystemPrompt || customSystemPrompt || defaultSystemPrompt),
    ...(appendSystemPrompt ? [appendSystemPrompt] : []),
  ])
}
```

**设计价值:**
- 清晰的优先级层次
- Agent 提示词可继承或替换默认提示词
- 支持多种注入点 (覆盖、替换、追加)

---

## 提示词分节与缓存策略

### 静态章节详解

#### 任务执行规范 (Doing Tasks)

```typescript
function getSimpleDoingTasksSection(): string {
  const codeStyleSubitems = [
    `Don't add features, refactor code, or make "improvements" beyond what was asked.`,
    `Don't add error handling for scenarios that can't happen.`,
    `Don't create helpers for one-time operations.`,
    `Default to writing no comments. Only add when WHY is non-obvious.`,
    `Before reporting a task complete, verify it actually works.`,
  ]

  const items = [
    `When given an unclear instruction, consider it in software engineering context.`,
    `If you notice the user's request is based on a misconception, say so.`,
    `Do not create files unless absolutely necessary.`,
    `Avoid giving time estimates.`,
    `If an approach fails, diagnose why before switching tactics.`,
    ...codeStyleSubitems,
    // False-claims mitigation (Capybara v8)
    `Report outcomes faithfully: if tests fail, say so; never claim "all tests pass" when output shows failures.`,
  ]

  return [`# Doing tasks`, ...prependBullets(items)].join(`\n`)
}
```

**设计要点:**
- 否定式指令 (Don't...) 明确禁止过度工程
- "验证优先"原则：先验证，再声明完成
- 防幻觉指令：禁止伪造成功结果

---

#### 安全操作指南 (Actions)

```typescript
function getActionsSection(): string {
  return `# Executing actions with care

Carefully consider the reversibility and blast radius of actions...

Examples of risky actions:
- Destructive operations: deleting files/branches, dropping tables
- Hard-to-reverse operations: force-pushing, git reset --hard
- Actions visible to others: pushing code, creating PRs, sending messages
- Uploading content to third-party tools (may be cached/indexed)

When you encounter an obstacle, do not use destructive actions as a shortcut...

Follow both the spirit and letter of these instructions — measure twice, cut once.`
}
```

**设计要点:**
- 风险分类：破坏性、难撤销、可见性、外部上传
- "三思而后行"原则：measure twice, cut once
- 区分授权范围：单次授权不等同于永久授权

---

#### 工具使用指南 (Using Your Tools)

```typescript
function getUsingYourToolsSection(enabledTools: Set<string>): string {
  const providedToolSubitems = [
    `To read files use ${FILE_READ_TOOL_NAME} instead of cat, head, tail`,
    `To edit files use ${FILE_EDIT_TOOL_NAME} instead of sed or awk`,
    `Reserve using ${BASH_TOOL_NAME} exclusively for system commands`,
  ]

  const items = [
    `Do NOT use ${BASH_TOOL_NAME} when a dedicated tool exists.`,
    providedToolSubitems,
    `Break down work with ${taskToolName} tool. Mark tasks completed ASAP.`,
    `You can call multiple tools in parallel if independent.`,
    `If calls depend on previous results, call sequentially.`,
  ]

  return [`# Using your tools`, ...prependBullets(items)].join(`\n`)
}
```

**设计要点:**
- 工具偏好排序：专用工具 > Bash
- 并行调用指导：独立则并行，依赖则串行
- 任务分解：及时标记完成，不批量囤积

---

### 动态章节详解

#### 环境信息 (Env Info)

```typescript
export async function computeSimpleEnvInfo(modelId: string, ...): Promise<string> {
  const envItems = [
    `Primary working directory: ${cwd}`,
    isWorktree ? `This is a git worktree...` : null,
    `Is a git repository: ${isGit}`,
    `Platform: ${env.platform}`,
    `Shell: ${shellName}`,
    `OS Version: ${unameSR}`,
    modelDescription,  // 模型名称和ID
    knowledgeCutoffMessage,  // 知识截止日期
    `Claude Code is available as CLI, desktop app, web app, IDE extensions.`,
    `Fast mode uses the same ${FRONTIER_MODEL_NAME} model with faster output.`,
  ].filter(item => item !== null)

  return [
    `# Environment`,
    `You have been invoked in the following environment:`,
    ...prependBullets(envItems),
  ].join(`\n`)
}
```

**设计要点:**
- 结构化的环境信息（工作目录、Git 状态、平台、Shell）
- 模型身份说明（名称、ID、知识截止）
- 产品形态说明（CLI/桌面/Web/IDE）

---

#### MCP 服务器指令

```typescript
function getMcpInstructions(mcpClients: MCPServerConnection[]): string | null {
  const connectedClients = mcpClients.filter(
    c => c.type === 'connected' && c.instructions
  )
  
  if (connectedClients.length === 0) return null

  const instructionBlocks = connectedClients
    .map(client => `## ${client.name}\n${client.instructions}`)
    .join('\n\n')

  return `# MCP Server Instructions

The following MCP servers have provided instructions:

${instructionBlocks}`
}
```

**设计要点:**
- 动态注入 MCP 服务器指令
- 仅在连接成功后注入
- 支持 delta 更新（通过附件而非系统提示词）

---

## 工具提示词设计

### Bash Tool 提示词

```typescript
// src/tools/BashTool/prompt.ts
export function getSimplePrompt(): string {
  const toolPreferenceItems = [
    `File search: Use ${GLOB_TOOL_NAME} (NOT find or ls)`,
    `Content search: Use ${GREP_TOOL_NAME} (NOT grep or rg)`,
    `Read files: Use ${FILE_READ_TOOL_NAME} (NOT cat)`,
    `Edit files: Use ${FILE_EDIT_TOOL_NAME} (NOT sed)`,
  ]

  const instructionItems = [
    'If creating new files, first run `ls` to verify parent directory exists.',
    'Always quote file paths with spaces.',
    'Try to maintain current working directory using absolute paths.',
    `Optional timeout up to ${getMaxTimeoutMs()}ms.`,
    'When issuing multiple commands:',
    [
      'Independent commands → multiple parallel Bash calls',
      'Dependent commands → single call with && chaining',
      "Use ';' only when earlier failure doesn't matter",
    ],
    'For git commands:',
    [
      'Prefer creating new commit over amending.',
      'Consider safer alternatives before destructive operations.',
      'Never skip hooks unless explicitly asked.',
    ],
    'Avoid unnecessary sleep commands:',
    [
      'Do not sleep between commands that can run immediately.',
      'Use run_in_background for long-running tasks.',
      'Do not retry failing commands in sleep loops.',
    ],
  ]

  return [
    'Executes a given bash command and returns output.',
    '',
    'Shell environment initialized from user profile.',
    '',
    `IMPORTANT: Avoid using this tool for ${avoidCommands}`,
    '',
    ...prependBullets(toolPreferenceItems),
    '',
    '# Instructions',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),  // 沙箱配置
    getCommitAndPRInstructions(),  // Git 操作指南
  ].join('\n')
}
```

**设计要点:**
- 工具偏好矩阵：明确专用工具替代 Bash 命令
- 命令链指导：并行 vs 串行 vs 无关顺序
- Git 安全协议：禁止跳过 hooks，优先新提交
- 沙箱配置动态注入

---

### 沙箱提示词

```typescript
function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) return ''

  const filesystemConfig = {
    read: { denyOnly: [...], allowWithinDeny: [...] },
    write: { allowOnly: [...], denyWithinAllow: [...] },
  }
  
  const networkConfig = {
    allowedHosts: [...],
    deniedHosts: [...],
    allowUnixSockets: [...],
  }

  return [
    '## Command sandbox',
    'By default, commands run in a sandbox controlling file/network access.',
    '',
    'Restrictions:',
    `Filesystem: ${JSON.stringify(filesystemConfig)}`,
    `Network: ${JSON.stringify(networkConfig)}`,
    '',
    '- Default to running commands within the sandbox.',
    '- Only disable sandbox when explicit evidence of sandbox-caused failure.',
    '- Evidence: "Operation not permitted", access denied, network failures.',
    '- Use $TMPDIR for temporary files, NOT /tmp.',
  ].join('\n')
}
```

**设计要点:**
- JSON 格式的权限配置（便于模型解析）
- 明确禁用沙箱的条件和证据
- 临时目录使用 `$TMPDIR` 而非硬编码 `/tmp`

---

## 子代理提示词

### Explore Agent 提示词

```typescript
// src/tools/AgentTool/built-in/exploreAgent.ts
function getExploreSystemPrompt(): string {
  return `You are a file search specialist for Claude Code...

=== CRITICAL: READ-ONLY MODE ===
You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch)
- Modifying existing files (no Edit)
- Deleting files (no rm)
- Moving/copying files (no mv/cp)
- Creating temporary files anywhere
- Using redirect operators (>, >>)

Your role is EXCLUSIVELY to search and analyze existing code.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code with regex
- Reading and analyzing file contents

Guidelines:
- Use ${GLOB_TOOL_NAME} for broad file patterns
- Use ${GREP_TOOL_NAME} for content search
- Use ${FILE_READ_TOOL_NAME} for specific files
- Use ${BASH_TOOL_NAME} ONLY for read-only operations

NOTE: You are meant to be fast. To achieve this:
- Spawn multiple parallel tool calls
- Be smart about search strategies`
}

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse: 'Fast agent for exploring codebases...',
  disallowedTools: [
    AGENT_TOOL_NAME,      // 禁止递归代理
    FILE_EDIT_TOOL_NAME,  // 禁止编辑
    FILE_WRITE_TOOL_NAME, // 禁止写入
    NOTEBOOK_EDIT_TOOL_NAME,
  ],
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  omitClaudeMd: true,  // 不需要 CLAUDE.md 规则
  getSystemPrompt: () => getExploreSystemPrompt(),
}
```

**设计要点:**
- **角色定位明确**: "file search specialist"
- **严格只读**: 大写强调禁止所有写入操作
- **工具白名单**: 明确允许和禁止的工具
- **性能指导**: 并行调用、高效搜索策略
- **模型选择**: Ant 用户继承主代理模型，外部用户使用 haiku

---

### Agent 提示词增强

```typescript
// src/constants/prompts.ts
export async function enhanceSystemPromptWithEnvDetails(
  existingSystemPrompt: string[],
  model: string,
  additionalWorkingDirectories?: string[],
  enabledToolNames?: ReadonlySet<string>,
): Promise<string[]> {
  const notes = `Notes:
- Agent threads always have cwd reset between bash calls, use absolute paths.
- In final response, share absolute file paths, include code snippets only when load-bearing.
- Do NOT use emojis for clear communication.
- Do not use colon before tool calls.`

  return [
    ...existingSystemPrompt,
    notes,
    ...(discoverSkillsGuidance ? [discoverSkillsGuidance] : []),
    await computeEnvInfo(model, additionalWorkingDirectories),
  ]
}
```

**设计要点:**
- 子代理特定约束（cwd 重置、绝对路径）
- 输出规范（无 emoji、无冒号前置）
- 动态技能发现指导

---

## 记忆与压缩提示词

### 记忆提取 Agent 提示词

```typescript
// src/services/extractMemories/prompts.ts
function opener(newMessageCount: number, existingMemories: string): string {
  return [
    `You are now acting as the memory extraction subagent. ` +
    `Analyze the most recent ~${newMessageCount} messages...`,
    '',
    `Available tools: ${FILE_READ_TOOL_NAME}, ${GREP_TOOL_NAME}, ` +
    `${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME} for memory directory only.`,
    '',
    `Efficient strategy: turn 1 — parallel READ for all files you might update; ` +
    `turn 2 — parallel WRITE/EDIT. Do not interleave.`,
    '',
    `You MUST only use content from the last ~${newMessageCount} messages...`,
  ].join('\n')
}

export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
): string {
  return [
    opener(newMessageCount, existingMemories),
    '',
    ...TYPES_SECTION_INDIVIDUAL,  // 记忆类型定义
    ...WHAT_NOT_TO_SAVE_SECTION,   // 保存排除项
    '',
    '## How to save memories',
    'Step 1 — write memory file with frontmatter',
    'Step 2 — add pointer to MEMORY.md index',
  ].join('\n')
}
```

**设计要点:**
- 角色切换："you are now acting as the memory extraction subagent"
- 工具限制：只允许文件操作工具，禁止 Bash 写入
- 效率指导：两阶段策略（先读、后写）
- 范围限制：仅分析最近 N 条消息

---

### 记忆类型定义

```typescript
// src/memdir/memoryTypes.ts
export const TYPES_SECTION_INDIVIDUAL: readonly string[] = [
  '## Types of memory',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <description>User role, goals, responsibilities...</description>',
  '    <when_to_save>When you learn user details...</when_to_save>',
  '    <how_to_use>Tailor behavior to user profile...</how_to_use>',
  '    <examples>',
  '    user: I\'m a data scientist...',
  '    assistant: [saves user memory: ...]',
  '    </examples>',
  '</type>',
  // ... feedback, project, reference types
  '</types>',
]

export const WHAT_NOT_TO_SAVE_SECTION: readonly string[] = [
  '## What NOT to save in memory',
  '',
  '- Code patterns, conventions, architecture — derivable from project state.',
  '- Git history — git log/blame are authoritative.',
  '- Debugging solutions — the fix is in the code.',
  '- Anything documented in CLAUDE.md.',
  '- Ephemeral task details.',
]
```

**设计要点:**
- XML 结构化定义（<types>, <type>, <name>）
- 四类型系统：user, feedback, project, reference
- 显式排除：可从代码/仓库派生的信息不保存
- 示例驱动：每个类型包含具体对话示例

---

### 会话压缩提示词

```typescript
// src/services/compact/prompt.ts
const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Edit, or ANY other tool.
- You already have all context in the conversation.
- Tool calls will be REJECTED and waste your only turn.
- Your entire response must be plain text: <analysis> + <summary>.

`

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary...

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include:
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and fixes
5. Problem Solving
6. All user messages (non-tool)
7. Pending Tasks
8. Current Work
9. Optional Next Step

<example>
<analysis>
[Your thought process...]
</analysis>

<summary>
1. Primary Request...
...
</summary>
</example>`

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT
  
  if (customInstructions?.trim()) {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }
  
  prompt += NO_TOOLS_TRAILER  // 再次提醒禁止工具
  return prompt
}
```

**设计要点:**
- **强约束前置**: NO_TOOLS_PREAMBLE 放在最前面
- **结构化输出**: <analysis> + <summary> XML 标签
- **详细分析指导**: 按时间线分析消息，提取关键决策
- **9 节标准格式**: 覆盖需求、技术、文件、错误、任务等
- **双保险提醒**: 开头和结尾都强调禁止工具调用

---

## 设计哲学与最佳实践

### 1. 分层约束原则

```
┌────────────────────────────────────────┐
│  硬性约束 (Hard Constraints)            │
│  - CRITICAL/NEVER/MUST NOT             │
│  - 大写强调，放在章节开头                │
├────────────────────────────────────────┤
│  指导原则 (Guidelines)                  │
│  - should/prefer/avoid                 │
│  - 正常大小写，解释性语气                │
├────────────────────────────────────────┤
│  最佳实践 (Best Practices)              │
│  - 示例驱动，说明原因                    │
│  - "For example..."                    │
└────────────────────────────────────────┘
```

### 2. 否定式指令设计

Claude Code 大量使用否定式指令来防止过度工程：

```markdown
- Don't add features beyond what was asked.
- Don't add error handling for scenarios that can't happen.
- Don't create helpers for one-time operations.
- Don't add docstrings to code you didn't change.
- Don't use feature flags when you can just change the code.
```

**优势:**
- 明确边界，减少歧义
- 防止过度设计
- 易于验证和检查

### 3. 防幻觉设计

```typescript
// False-claims mitigation
`Report outcomes faithfully: 
- if tests fail, say so with output
- if you did not run verification, say that
- Never claim "all tests pass" when output shows failures
- Never suppress or simplify failing checks
- Never characterize incomplete work as done`
```

**关键模式:**
- 显式要求报告失败
- 禁止伪造成功结果
- 区分"未验证"和"验证通过"

### 4. 渐进式信息原则

```markdown
# Output efficiency

Go straight to the point. Try the simplest approach first.

Focus text output on:
- Decisions that need user input
- High-level status updates
- Errors or blockers

If you can say it in one sentence, don't use three.
```

**设计要点:**
- 倒金字塔结构：结论先行
- 避免重复用户已知信息
- 工具调用和代码不受此限制

### 5. 缓存感知设计

```typescript
// 明确标记动态内容打断缓存的原因
DANGEROUS_uncachedSystemPromptSection(
  'mcp_instructions',
  () => getMcpInstructions(mcpClients),
  'MCP servers connect/disconnect between turns'  // 必须说明原因
)
```

**策略:**
- 静态内容跨用户缓存
- 动态内容按需计算
- 易变内容显式标记原因

---

## 对 Pi 的借鉴建议

### 🔴 P0 - 立即实施

#### 1. 系统提示词分节化

```typescript
// 当前 Pi 做法 (推测)
const systemPrompt = [
  'You are Pi, an AI coding assistant...',
  'Here are the tools: ...',
  'Environment: ...',
].join('\n')

// 借鉴 Claude Code
type PromptSection = {
  name: string
  content: string | (() => string | Promise<string>)
  cacheable: boolean  // 是否可缓存
}

const sections: PromptSection[] = [
  { name: 'identity', content: getIdentitySection, cacheable: true },
  { name: 'tools', content: getToolsSection, cacheable: true },
  { name: 'env', content: getEnvSection, cacheable: false },
  { name: 'memory', content: getMemorySection, cacheable: false },
]
```

**收益:**
- 细粒度缓存，节省 token
- 动态内容隔离
- 易于 A/B 测试不同章节

---

#### 2. 工具偏好提示词

```typescript
function getToolPreferenceSection(): string {
  return `# Tool preferences

- Use FileRead tool instead of cat/head/tail
- Use FileEdit tool instead of sed
- Use Glob tool instead of find
- Reserve Bash tool for system commands only

IMPORTANT: Do NOT use Bash when a dedicated tool exists.`
}
```

**收益:**
- 引导模型使用专用工具
- 减少 Bash 滥用
- 提升用户体验和可审查性

---

#### 3. 防过度工程提示词

```typescript
function getAntiOverengineeringSection(): string {
  return `# Coding discipline

- Don't add features beyond what was asked.
- Don't refactor code "while you're there".
- Don't create abstractions for one-time operations.
- Don't add comments explaining what the code does.
- Verify before declaring complete: run tests, check output.`
}
```

**收益:**
- 减少无关改动
- 提升代码审查效率
- 防止幻觉式"改进"

---

### 🟡 P1 - 短期实施

#### 4. 子代理专用提示词

```typescript
const AGENT_PROMPTS: Record<string, string> = {
  explore: `You are a file search specialist...

CRITICAL: READ-ONLY MODE
- STRICTLY PROHIBITED from creating/modifying/deleting files
- Use parallel tool calls for efficiency
- Report findings directly, do NOT create files`,

  analyze: `You are a code analysis specialist...

Focus on:
- Architecture patterns
- Design decisions
- Potential issues

Provide structured output with specific file paths and line numbers.`,
}
```

**收益:**
- 专业化子代理
- 明确约束和期望
- 提升任务完成质量

---

#### 5. 记忆系统提示词

```typescript
const MEMORY_EXTRACTION_PROMPT = `You are the memory extraction agent.

Analyze recent messages and extract persistent memories:

Types:
- user: User role, preferences, knowledge
- feedback: Corrections and validated approaches
- project: Ongoing work, goals, deadlines
- reference: External system pointers

Rules:
- Only save what is NOT derivable from code/git
- Include WHY for feedback/project memories
- Update existing memories rather than duplicating`
```

**收益:**
- 结构化记忆类型
- 自动记忆提取
- 跨会话上下文保持

---

#### 6. 压缩/总结提示词

```typescript
const COMPACT_PROMPT = `Summarize this conversation for context restoration.

Structure:
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections (with snippets)
4. Errors and Fixes
5. Pending Tasks
6. Next Steps

IMPORTANT: Respond with TEXT ONLY. Do NOT call tools.`
```

**收益:**
- 长会话压缩
- 上下文恢复
- Token 节省

---

### 🟢 P2 - 中期实施

#### 7. 动态提示词缓存管理

```typescript
class PromptCache {
  private cache = new Map<string, string>()
  
  get(section: string): string | undefined {
    return this.cache.get(section)
  }
  
  set(section: string, content: string): void {
    this.cache.set(section, content)
  }
  
  clear(): void {
    this.cache.clear()
  }
  
  // 细粒度清理
  invalidate(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) this.cache.delete(key)
    }
  }
}
```

**收益:**
- 细粒度缓存控制
- 动态内容隔离
- 性能优化

---

#### 8. 提示词版本与 A/B 测试

```typescript
interface PromptVersion {
  id: string
  sections: PromptSection[]
  targeting?: {
    userType?: 'internal' | 'external'
    model?: string
    featureFlags?: string[]
  }
}

const PROMPT_VERSIONS: PromptVersion[] = [
  {
    id: 'v1-baseline',
    sections: [...],
  },
  {
    id: 'v2-concise',
    sections: [...],  // 更简洁的变体
    targeting: { userType: 'external' },
  },
]
```

**收益:**
- 提示词迭代优化
- A/B 测试验证效果
- 灰度发布

---

## 总结

Claude Code 的提示词设计体现了以下核心理念：

| 原则 | 实践 |
|------|------|
| **分层约束** | HARD(大写) > Guidelines > Best Practices |
| **否定式指令** | "Don't add..." 防止过度工程 |
| **防幻觉** | 显式要求报告失败，禁止伪造成功 |
| **缓存感知** | 静态/动态分离，细粒度缓存管理 |
| **渐进信息** | 倒金字塔，结论先行 |
| **示例驱动** | 每个类型/规则配具体示例 |

**对 Pi 的最大借鉴:**

1. **系统提示词分节化** - 立即实施，收益最大
2. **防过度工程指令** - 减少无关改动，提升审查效率
3. **工具偏好提示词** - 引导正确使用专用工具
4. **子代理专业化** - 不同任务不同角色和约束
5. **缓存感知设计** - 静态缓存，动态计算

---

*分析完成于 2026-03-31 | 5 个专项分析 | 关键文件 10+*
