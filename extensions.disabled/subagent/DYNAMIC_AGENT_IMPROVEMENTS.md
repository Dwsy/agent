# Dynamic Agent Generator - 改进文档

## 概述

本文档详细说明了对 `dynamic-agent.ts` 的改进，主要关注 **动态工具/技能描述** 和 **决策链 (Chain of Thought)** 的添加。

---

## 改进内容

### 1. 动态工具描述 (Dynamic Tool Descriptions)

#### 之前的问题
```typescript
// ❌ 旧代码：只有工具名称列表
const DEFAULT_AVAILABLE_TOOLS = ["read", "bash", "edit", "write", "interview", "subagent", "todo"];
const toolsText = availableTools.length > 0 ? availableTools.join(", ") : "none";
```

**问题：**
- 模型不知道工具的具体功能
- 无法做出准确的工具选择决策
- 缺少使用场景指导

#### 改进后的实现
```typescript
// ✅ 新代码：完整的工具描述结构
interface ToolDescription {
  name: string;
  description: string;
  useCase: string;
}

const DEFAULT_TOOLS: ToolDescription[] = [
  {
    name: "read",
    description: "Read file contents (supports text files and images)",
    useCase: "When you need to examine source code, configuration files, logs, or any file content",
  },
  {
    name: "bash",
    description: "Execute bash commands in the current working directory",
    useCase: "When you need to run shell commands, scripts, build tools, or system operations",
  },
  // ... 更多工具
];
```

**优点：**
- ✅ 每个工具有清晰的描述
- ✅ 明确的使用场景指导
- ✅ 支持环境变量过滤 (`PI_ACTIVE_TOOLS`)
- ✅ 易于扩展和维护

---

### 2. 动态技能描述 (Dynamic Skill Descriptions)

#### 之前的问题
```typescript
// ❌ 旧代码：只有技能名称列表
const skillsText = availableSkills.length > 0 ? availableSkills.join(", ") : "none";
```

**问题：**
- 只有技能名称，完全没有功能描述
- 模型不知道技能的用途
- 缺少何时使用技能的指导

#### 改进后的实现
```typescript
// ✅ 新代码：完整的技能描述结构
interface SkillDescription {
  name: string;
  description: string;
  useCase: string;
}

// 从 SKILL.md frontmatter 动态加载
function parseSkillFrontmatter(content: string): { name?: string; description?: string; useCase?: string } | null {
  const frontmatter: Record<string, string> = {};
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---")) return null;

  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) return null;

  const frontmatterBlock = normalized.slice(4, endIndex);

  for (const line of frontmatterBlock.split("\n")) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match) {
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[match[1]] = value;
    }
  }

  if (!frontmatter.name || !frontmatter.description) return null;

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    useCase: frontmatter.useCase || frontmatter.description,
  };
}

function loadSkillDescriptions(dir: string): SkillDescription[] {
  if (!fs.existsSync(dir)) return [];

  const skills: SkillDescription[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(dir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillFile)) {
      try {
        const content = fs.readFileSync(skillFile, "utf-8");
        const parsed = parseSkillFrontmatter(content);
        if (parsed && parsed.name && parsed.description) {
          skills.push({
            name: parsed.name,
            description: parsed.description,
            useCase: parsed.useCase || parsed.description,
          });
        }
      } catch {
        continue;
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
```

**优点：**
- ✅ 从 SKILL.md 动态加载技能描述
- ✅ 支持用户级和项目级技能目录
- ✅ 自动扫描和解析 frontmatter
- ✅ 包含名称、描述、使用场景

---

### 3. 决策链 (Chain of Thought)

#### 之前的问题
```typescript
// ❌ 旧代码：缺少结构化决策过程
const prompt = `You are an Agent Generator...

**Available Tools:**
${toolsText}

**Available Skills:**
${skillsText}

**IMPORTANT:**
- Only specify "tools" if the task absolutely requires specific tools
...
`;
```

**问题：**
- 没有明确的决策步骤
- 缺少如何选择工具/技能的指导
- 模型无法系统化地思考

#### 改进后的实现
```typescript
// ✅ 新代码：结构化决策链
const prompt = `You are an Agent Generator...

---

## Decision Chain (Chain of Thought)

Follow this structured decision process to generate the optimal agent:

### Step 1: Task Analysis
Analyze the task to understand:
- What is the primary objective?
- What domain knowledge is required?
- What type of operations are needed (file operations, code analysis, testing, etc.)?
- Are there any constraints or special requirements?

### Step 2: Tool Selection
Evaluate which tools are necessary:
- Review each tool's use case
- Match tools to task requirements
- Consider: Does this task need file operations? Command execution? User interaction?
- **Only include tools that are absolutely necessary** - omit the "tools" field if uncertain
- If you specify tools, ensure they are from the Available Tools list above

### Step 3: Skill Integration
Determine if any skills would enhance the agent's capabilities:
- Skills are CLI helpers that extend agent capabilities
- Review skill descriptions and use cases
- Suggest relevant skills in the systemPrompt when appropriate
- **Do NOT include skills in the JSON tools field** - they are invoked via CLI, not as tools
- Example suggestions in systemPrompt:
  - "For code analysis tasks, use the ace-tool skill: \`bun ~/.pi/agent/skills/ace-tool/client.ts search <query>\`"
  - "For documentation management, use the workhub skill: \`bun ~/.pi/agent/skills/workhub/lib.ts <command>\`"

### Step 4: System Prompt Construction
Build a comprehensive system prompt:
- Define the agent's role and responsibilities
- Include domain-specific knowledge and best practices
- Add constraints and safety considerations
- Provide clear instructions for tool usage
- Include skill invocation examples when relevant
- Set boundaries and expectations

### Step 5: Validation
Review your decisions:
- Is the agent description clear and concise?
- Are the selected tools minimal but sufficient?
- Is the system prompt comprehensive and actionable?
- Are skill recommendations practical and specific?
- Would this agent successfully complete the task?

---
`;
```

**优点：**
- ✅ 明确的 5 步决策流程
- ✅ 每步都有具体的指导问题
- ✅ 工具选择有明确标准
- ✅ 技能集成有具体示例
- ✅ 最终有验证步骤

---

## 使用示例

### 运行 Demo
```bash
cd extensions/subagent
bun run demo-dynamic-agent.ts
```

### 输出示例
```
================================================================================
Dynamic Agent Generator - Enhanced Demo
================================================================================

📦 Available Tools: 7

  read         - Read file contents (supports text files and images...
  bash         - Execute bash commands in the current working direc...
  edit         - Edit files by replacing exact text matches (surgic...
  write        - Write content to files (creates if not exists, ove...
  interview    - Present interactive forms to gather structured use...
  subagent     - Delegate tasks to specialized subagents with isola...
  todo         - Manage todo lists (list, add, toggle, clear)...

🔌 Available Skills: 28

  ace-tool        - This tool provides semantic, fuzzy search ove...
  ast-grep        - 语法感知的代码搜索、linting 和重写工具...
  codemap         - 代码流程分析与可视化工具...
  context7        - Search GitHub issues, pull requests, and disc...
  ...

Decision Chain Sections:

✓ Step 1: Task Analysis
✓ Step 2: Tool Selection
✓ Step 3: Skill Integration
✓ Step 4: System Prompt Construction
✓ Step 5: Validation
```

---

## 关键改进对比

| 维度 | 改进前 | 改进后 |
|------|--------|--------|
| 工具描述 | 只有名称列表 | 名称 + 描述 + 使用场景 |
| 技能描述 | 只有名称列表 | 从 SKILL.md 动态加载完整描述 |
| 决策流程 | 无结构化指导 | 5 步决策链 (CoT) |
| 工具选择 | 缺少指导 | 明确的选择标准和约束 |
| 技能集成 | 无指导 | 具体示例和最佳实践 |
| 扩展性 | 硬编码 | 动态加载，易于扩展 |

---

## 技术细节

### 导出的函数
```typescript
export function getAvailableTools(): ToolDescription[]
export function getAvailableSkills(): SkillDescription[]
export function buildDynamicAgentPrompt(
  agentName: string,
  task: string,
  availableTools: ToolDescription[],
  availableSkills: SkillDescription[]
): string
export async function generateDynamicAgent(
  options: DynamicAgentGeneratorOptions
): Promise<GeneratedAgentConfig | null>
```

### 环境变量支持
- `PI_ACTIVE_TOOLS`: 逗号分隔的工具列表，用于过滤可用工具
- `PI_TOOLS`: 备用环境变量

### 技能扫描路径
- 用户级: `~/.pi/agent/skills/`
- 项目级: `.pi/skills/` (从当前目录向上查找)

---

## 测试

### 运行测试
```bash
cd extensions/subagent
bun test dynamic-agent.test.ts
```

### 测试覆盖
- ✅ 工具描述结构验证
- ✅ 技能描述动态加载
- ✅ 决策链完整性
- ✅ 环境变量过滤
- ✅ 提示词生成

---

## 未来改进

1. **工具分类**: 将工具按功能分类（文件操作、系统操作、交互等）
2. **技能标签**: 为技能添加标签，便于快速匹配
3. **决策缓存**: 缓存决策结果，避免重复分析
4. **性能优化**: 懒加载技能描述，减少启动时间
5. **决策可视化**: 输出决策过程，便于调试

---

## 总结

通过这次改进，dynamic-agent 生成器现在具备：

1. ✅ **完整的工具描述** - 每个工具都有名称、描述和使用场景
2. ✅ **动态技能加载** - 从 SKILL.md 自动解析技能描述
3. ✅ **结构化决策链** - 5 步 CoT 流程，指导模型做出最佳决策
4. ✅ **明确的指导原则** - 工具选择、技能集成都有具体标准
5. ✅ **易于扩展** - 新增工具/技能只需添加描述，无需修改核心逻辑

这些改进显著提升了动态生成的 agent 的质量和可用性。