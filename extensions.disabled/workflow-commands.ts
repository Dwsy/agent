/**
 * Workflow Commands - 工作流命令集合
 *
 * 整合 analyze, brainstorm, research, scout 四个工作流命令
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMANDS = {
	analyze: {
		description: "深度代码分析 - 使用 worker agent 进行架构、模式和依赖分析",
		prompt: `使用 subagent 扩展委托详细分析：

\`\`\`json
{
  "agent": "worker",
  "task": "深度分析: $@\n\n解释:\n1. 工作原理（架构和数据流）\n2. 结构设计原因（设计决策）\n3. 使用的模式（设计模式、惯用法）\n4. 依赖关系和交互\n\n使用 ace-tool 进行语义理解，使用 ast-grep 进行模式分析。"
}
\`\`\`

**前提条件**: 复杂分析需先用 workhub 创建 issue`,
	},
	brainstorm: {
		description: "设计头脑风暴 - 结合 workhub、sequential-thinking、system-design 进行设计探索",
		prompt: `**步骤 1**: 使用 workhub 为设计任务创建 issue
\`\`\`bash
cd <项目根目录>
bun ~/.pi/agent/skills/workhub/lib.ts create issue "设计: $@"
\`\`\`

**步骤 2**: 使用 sequential-thinking skill 进行结构化设计探索
\`\`\`bash
~/.pi/agent/skills/sequential-thinking/lib.ts "为以下内容进行设计头脑风暴: $@\n\n遵循这些阶段:\n1. 问题理解和约束条件\n2. 探索 2-3 种方案及其权衡\n3. 架构概览和组件\n4. 数据流和错误处理\n5. 测试策略"
\`\`\`

**步骤 3**: 使用 system-design skill 生成架构图
\`\`\`bash
~/.pi/agent/skills/system-design/lib.ts "$@"
\`\`\`

**步骤 4**: 在 workhub issue 中记录设计

**原则**:
- 使用 ace-tool 研究现有模式
- 在确定前提出多种方案
- 增量验证设计
- 在 workhub 中文档化以保持可追溯性`,
	},
	research: {
		description: "并行代码库研究 - 使用多个工具并行研究",
		prompt: `**步骤 1**: 使用 workhub 为研究任务创建 issue
\`\`\`bash
cd <项目根目录>
bun ~/.pi/agent/skills/workhub/lib.ts create issue "研究: $@"
\`\`\`

**步骤 2**: 使用多个工具进行并行研究

\`\`\`bash
# 终端 1: 语义搜索
~/.pi/agent/skills/ace-tool/lib.ts "查找与以下内容相关的所有代码: $@"

# 终端 2: 模式搜索
~/.pi/agent/skills/ast-grep/lib.ts "搜索以下内容的模式: $@"

# 终端 3: GitHub 上下文
~/.pi/agent/skills/context7/lib.ts "搜索关于以下内容的 issues 和讨论: $@"
\`\`\`

**步骤 3**: 使用 sequential-thinking 综合发现
\`\`\`bash
~/.pi/agent/skills/sequential-thinking/lib.ts "综合以下内容的研究发现: $@\n\n结合来自:\n1. 语义代码搜索结果\n2. 模式分析\n3. GitHub 上下文\n\n输出: 包含架构、模式和建议的综合研究文档。"
\`\`\`

**步骤 4**: 在 workhub issue 中记录发现

**替代方案**: 使用 subagent 进行并行委托
\`\`\`json
{
  "tasks": [
    {"agent": "scout", "task": "查找与以下内容相关的所有文件: $@"},
    {"agent": "worker", "task": "分析以下内容的模式: $@"}
  ]
}
\`\`\``,
	},
	scout: {
		description: "快速代码库侦察 - 快速定位代码和架构概览",
		prompt: `使用 subagent 扩展委托快速探索：

\`\`\`json
{
  "agent": "scout",
  "task": "快速侦察: $@\n\n使用 ace-tool 进行语义搜索以查找相关代码。\n返回:\n1. 文件路径和行号\n2. 每个发现的简要总结\n3. 需要进一步调查的关键文件\n4. 架构概览\n\n专注于速度和高层理解。"
}
\`\`\`

**针对特定搜索**:
\`\`\`bash
# 语义搜索
~/.pi/agent/skills/ace-tool/lib.ts "$@ 在哪里实现的？"

# AST 模式搜索
~/.pi/agent/skills/ast-grep/lib.ts "查找 $@ 模式"

# 精确标识符搜索
rg -l "identifier" --type ts
\`\`\`

**输出**: 结构化发现，准备好移交给其他 agents。`,
	},
};

export default function (pi: ExtensionAPI) {
	if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;
	// 注册 analyze 命令
	pi.registerCommand("analyze", {
		description: COMMANDS.analyze.description,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("analyze requires interactive mode", "error");
				return;
			}

			const prompt = COMMANDS.analyze.prompt.replace("$@", args);
			pi.sendMessage(
				{
					customType: "analyze-request",
					content: prompt,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	// 注册 brainstorm 命令
	pi.registerCommand("brainstorm", {
		description: COMMANDS.brainstorm.description,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("brainstorm requires interactive mode", "error");
				return;
			}

			const prompt = COMMANDS.brainstorm.prompt.replace(/\$@/g, args);
			pi.sendMessage(
				{
					customType: "brainstorm-request",
					content: prompt,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	// 注册 research 命令
	pi.registerCommand("research", {
		description: COMMANDS.research.description,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("research requires interactive mode", "error");
				return;
			}

			const prompt = COMMANDS.research.prompt.replace(/\$@/g, args);
			pi.sendMessage(
				{
					customType: "research-request",
					content: prompt,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	// 注册 scout 命令
	pi.registerCommand("scout", {
		description: COMMANDS.scout.description,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("scout requires interactive mode", "error");
				return;
			}

			const prompt = COMMANDS.scout.prompt.replace(/\$@/g, args);
			pi.sendMessage(
				{
					customType: "scout-request",
					content: prompt,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	// 注册 workflow 命令（显示所有可用命令）
	pi.registerCommand("workflow", {
		description: "显示所有可用的工作流命令",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("workflow requires interactive mode", "error");
				return;
			}

			const helpText = `## 工作流命令

### /analyze <topic>
${COMMANDS.analyze.description}

### /brainstorm <topic>
${COMMANDS.brainstorm.description}

### /research <topic>
${COMMANDS.research.description}

### /scout <topic>
${COMMANDS.scout.description}

## 使用示例

\`\`\`bash
/analyze authentication flow
/brainstorm caching strategy  
/research error handling patterns
/scout database migrations
\`\`\`
`;

			pi.sendMessage(
				{
					customType: "workflow-help",
					content: helpText,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}