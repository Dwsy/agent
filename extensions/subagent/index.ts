/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { AgentConfig, AgentScope } from "./agents.js";
import { discoverAgents, loadAgentsFromDir } from "./agents.js";
import type { SubagentParams } from "./types.js";
import { SingleMode } from "./modes/single.js";
import { ParallelMode } from "./modes/parallel.js";
import { ChainMode } from "./modes/chain.js";
import { renderCall, renderResult } from "./ui/renderer.js";
import {
	createAgent,
	listAgents,
	deleteAgent,
	generateInterviewQuestions,
	promoteDynamicAgent,
	listPromotableAgents,
} from "./utils/agent-creator.js";
import type { AgentScope as CreatorScope, AgentTemplate } from "./utils/agent-creator.js";

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke. If it doesn't exist, will be auto-generated based on task" }),
	task: Type.String({ description: "Task to delegate to the agent. Used to generate and execute the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke. If it doesn't exist, will be auto-generated based on task" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output. Used to generate and execute the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const SubagentParamsSchema = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode). If it doesn't exist, will be auto-generated based on task" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode). Used to generate and execute the agent" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
});

export default function (pi: ExtensionAPI) {
	const singleMode = new SingleMode();
	const parallelMode = new ParallelMode();
	const chainMode = new ChainMode();

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to specialized subagents with isolated context.",
			"Modes:",
			"  - Single: {agent, task} - one subagent",
			"  - Parallel: {tasks: [{agent, task}, ...]} - up to 8 concurrent subagents",
			"  - Chain: {chain: [{agent, task}, ...]} - sequential with {previous} placeholder",
			"Dynamic Mode:",
			"  - If the specified agent doesn't exist, it will be auto-generated based on the task description",
			"  - Just provide an agent name and task - the system will create a suitable subagent",
			"Agent Scope:",
			'  - Default: "user" (from ~/.pi/agent/agents)',
			'  - Use agentScope: "both" to include project-local agents in .pi/agents',
			'  - Use agentScope: "project" for project-only agents',
		].join("\n\n"),
		parameters: SubagentParamsSchema,

		async execute(_toolCallId, params, onUpdate, ctx, signal) {
			const agentScope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? true;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails = (mode: "single" | "parallel" | "chain") => (results: any[]) => ({
				mode,
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				results,
			});

			if (modeCount !== 1) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}` }],
					details: makeDetails("single")([]),
				};
			}

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const requestedAgentNames = new Set<string>();
				if (params.chain) for (const step of params.chain) requestedAgentNames.add(step.agent);
				if (params.tasks) for (const t of params.tasks) requestedAgentNames.add(t.agent);
				if (params.agent) requestedAgentNames.add(params.agent);

				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
					const names = projectAgentsRequested.map((a) => a.name).join(", ");
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return {
							content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
							details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([]),
						};
				}
			}

			const executionContext = {
				defaultCwd: ctx.cwd,
				agents,
				signal,
				onUpdate,
			};

			if (params.chain && params.chain.length > 0) {
				return chainMode.execute(executionContext, {
					chain: params.chain,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
				});
			}

			if (params.tasks && params.tasks.length > 0) {
				return parallelMode.execute(executionContext, {
					tasks: params.tasks,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
				});
			}

			if (params.agent && params.task) {
				return singleMode.execute(executionContext, {
					agent: params.agent,
					task: params.task,
					cwd: params.cwd,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
				});
			}

			const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
			return {
				content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
				details: makeDetails("single")([]),
			};
		},

		renderCall(args, theme) {
			return renderCall(args, theme);
		},

		renderResult(result, opts, theme) {
			return renderResult(result, opts, theme);
		},
	});

	registerCommands(pi);
}

function registerCommands(pi: ExtensionAPI): void {
	const userAgentsDir = path.join(os.homedir(), ".pi", "agent", "agents");
	const userAgents = loadAgentsFromDir(userAgentsDir, "user");

	// Try to discover project agents at load time for tab completion
	const currentCwd = process.cwd();
	const projectDiscovery = discoverAgents(currentCwd, "project");
	const projectAgents = projectDiscovery.agents;

	function createAgentCommand(agent: AgentConfig): void {
		const commandName = `sub:${agent.name}`;
		const scopeHint = agent.source === "project" ? `[${agent.source}]` : "";
		pi.registerCommand(commandName, {
			description: `${agent.description} ${scopeHint}`,
			handler: async (args: string, ctx: any) => {
				const task = args.trim();
				if (!task) {
					ctx.ui.notify(`Usage: /${commandName} <task description>`, "error");
					return;
				}
				const agentScope = agent.source === "project" ? "both" : "user";
				pi.sendMessage(
					{
						customType: "subagent-call",
						content: JSON.stringify({ agent: agent.name, task, agentScope }),
						display: true,
					},
					{ triggerTurn: true },
				);
			},
		});
	}

	// Register user agents immediately
	userAgents.forEach(createAgentCommand);

	// Register project agents immediately (for tab completion)
	projectAgents.forEach(createAgentCommand);

	function showAgentList(ctx: any): void {
		const discovery = discoverAgents(ctx.cwd, "both");

		if (discovery.agents.length === 0) {
			ctx.ui.notify("No subagents found", "info");
			return;
		}

		const userAgentsList = discovery.agents.filter((a) => a.source === "user");
		const projectAgentsList = discovery.agents.filter((a) => a.source === "project");

		let helpText = "## Available Subagents\n\n";

		if (userAgentsList.length > 0) {
			helpText += "### User Agents (~/.pi/agent/agents)\n\n";
			helpText += userAgentsList.map((a) => `**/sub:${a.name}**: ${a.description}`).join("\n");
			helpText += "\n\n";
		}

		if (projectAgentsList.length > 0) {
			helpText += "### Project Agents (" + (discovery.projectAgentsDir || ".pi/agents") + ")\n\n";
			helpText += projectAgentsList.map((a) => `**/sub:${a.name}**: ${a.description}`).join("\n");
			helpText += "\n\n";
		}

		helpText += "## Usage\n";
		helpText += "```bash\n";
		helpText += "/sub:worker analyze auth flow\n";
		helpText += "/sub:scout find db code\n";
		helpText += "/sub:reviewer review changes\n";
		helpText += "/sub:log-analyst trace traceId: abc123\n";
		helpText += "```\n\n";
		helpText += "## Scope\n";
		helpText += "- User agents: ~/.pi/agent/agents\n";
		helpText += "- Project agents: " + (discovery.projectAgentsDir || ".pi/agents") + "\n";
		helpText += "- Use agentScope: \"both\" to access both types";

		pi.sendMessage({ customType: "subagent-help", content: helpText, display: true }, { triggerTurn: false });
	}

	pi.registerCommand("sub", {
		description: "List all available subagents (user + project)",
		handler: async (_args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("sub requires interactive mode", "error");
				return;
			}

			// Re-discover agents to get the latest from the current directory
			const discovery = discoverAgents(ctx.cwd, "both");
			const projectAgents = discovery.agents.filter((a) => a.source === "project");

			// Register any newly discovered project agents
			projectAgents.forEach(createAgentCommand);
			showAgentList(ctx);
		},
	});

	pi.registerCommand("create-agent", {
		description: "Create a new agent. Usage: /create-agent <name> <description> [--scope user|project|dynamic] [--template worker|scout|reviewer]",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("create-agent requires interactive mode", "error");
				return;
			}

			// Parse arguments with better handling for multi-word descriptions
			const argStr = args.trim();
			if (!argStr) {
				ctx.ui.notify(
					"Usage: /create-agent <name> <description> [--scope user|project|dynamic] [--template worker|scout|reviewer] [--tools tool1,tool2]\n\nExample: /create-agent myagent \"My agent description\" --scope user --template worker",
					"info",
				);
				return;
			}

			// Split by quotes first to handle multi-word descriptions
			const quotedMatch = argStr.match(/^(\S+)\s+"([^"]+)"(.*)$/);
			let name: string;
			let description: string;
			let remainingArgs: string;

			if (quotedMatch) {
				// Has quoted description
				name = quotedMatch[1];
				description = quotedMatch[2];
				remainingArgs = quotedMatch[3].trim();
			} else {
				// No quotes - split by whitespace
				const parts = argStr.split(/\s+/);
				if (parts.length < 2) {
					ctx.ui.notify('Error: Both name and description are required. Use quotes for multi-word descriptions: /create-agent myagent "My description"', "error");
					return;
				}
				name = parts[0];
				// Find where flags start
				let descEnd = 1;
				while (descEnd < parts.length && !parts[descEnd].startsWith("--")) {
					descEnd++;
				}
				description = parts.slice(1, descEnd).join(" ");
				remainingArgs = parts.slice(descEnd).join(" ");
			}

			// Parse flags
			let scope: CreatorScope = "user";
			let template: AgentTemplate = "worker";
			let tools: string[] = [];

			const flagMatches = remainingArgs.matchAll(/--(\w+)\s+([^\s-][^\s]*)/g);
			for (const match of flagMatches) {
				const flag = match[1];
				const value = match[2];
				if (flag === "scope" && ["user", "project", "dynamic"].includes(value)) {
					scope = value as CreatorScope;
				} else if (flag === "template" && ["worker", "scout", "reviewer", "custom"].includes(value)) {
					template = value as AgentTemplate;
				} else if (flag === "tools") {
					tools = value.split(",").map((t) => t.trim()).filter(Boolean);
				}
			}

			const result = createAgent({ name, description, scope, template, tools });

			if (result.success) {
				ctx.ui.notify(`✓ Created agent '${name}' at ${result.filePath}`, "success");
				ctx.ui.notify(`Usage: /sub:${name} <task>`, "info");
			} else {
				ctx.ui.notify(`✗ Failed to create agent: ${result.error}`, "error");
			}
		},
	});

	pi.registerCommand("list-agents", {
		description: "List agents by scope (user/project/dynamic). Usage: /list-agents [user|project|dynamic]",
		handler: async (args: string, ctx: any) => {
			const scope = (args.trim() || "user") as CreatorScope;
			const agents = listAgents(scope);

			if (agents.length === 0) {
				const message = `No agents found in **${scope}** scope.\n\nTip: Create one with \`/create-agent\``;
				pi.sendMessage(
					{
						customType: "list-agents-result",
						content: message,
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			const message = `## ${scope.toUpperCase()} Agents (${agents.length})\n\n${agents.map((a) => `- **${a}**`).join("\n")}\n\n**Usage:** \`/sub:${agents[0]} <task>\``;
			pi.sendMessage(
				{
					customType: "list-agents-result",
					content: message,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	pi.registerCommand("delete-agent", {
		description: "Delete an agent. Usage: /delete-agent <name> [--scope user|project|dynamic]",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("delete-agent requires interactive mode", "error");
				return;
			}

			const argStr = args.trim();
			if (!argStr) {
				ctx.ui.notify("Usage: /delete-agent <name> [--scope user|project|dynamic]\n\nExample: /delete-agent myagent --scope user", "info");
				return;
			}

			// Parse arguments
			const parts = argStr.split(/\s+/);
			const name = parts[0];
			let scope: CreatorScope = "user";

			// Parse scope flag
			const scopeIndex = parts.indexOf("--scope");
			if (scopeIndex !== -1 && scopeIndex + 1 < parts.length) {
				const scopeValue = parts[scopeIndex + 1];
				if (["user", "project", "dynamic"].includes(scopeValue)) {
					scope = scopeValue as CreatorScope;
				}
			}

			const result = deleteAgent(name, scope);

			if (result.success) {
				ctx.ui.notify(`✓ Deleted agent '${name}' from ${scope} scope`, "success");
			} else {
				ctx.ui.notify(`✗ Failed to delete agent: ${result.error}`, "error");
			}
		},
	});

	pi.registerCommand("create-agent-interview", {
		description: "Create a new agent using AI generation with interactive interview form",
		handler: async (_args: string, ctx: any) => {
			// Generate questions JSON in temp directory
			const tempDir = os.tmpdir();
			const questionsPath = generateInterviewQuestions(tempDir);

			// Send message to trigger interview tool and dynamic generation
			const message = `I'll help you create a new agent using AI generation. Let me start the interactive form.

**Step 1:** Call the interview tool to collect information:
\`\`\`json
{
  "questions": "${questionsPath}"
}
\`\`\`

**Step 2:** After getting the responses, use dynamic agent generation with target scope:
\`\`\`javascript
subagent({
  agent: "<name from interview>",
  task: "<task from interview>",
  agentScope: "both",
  cwd: "<project directory if scope is project>"
})
\`\`\`

The agent will be generated and saved directly to the selected scope:
- "user (all projects)" → ~/.pi/agent/agents/
- "project (current project)" → .pi/agents/
- "dynamic (auto-generated)" → ~/.pi/agent/agents/dynamic/

The generated agent will include AI-generated system prompt, tools, and skills context.`;

			pi.sendMessage(
				{
					customType: "create-agent-interview-trigger",
					content: message,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerCommand("list-promotable-agents", {
		description: "List all dynamic agents that can be promoted to user scope",
		handler: async (_args: string, ctx: any) => {
			const promotable = listPromotableAgents();

			if (promotable.length === 0) {
				const message = `## No Promotable Agents Found\n\nNo dynamic agents available in \`~/.pi/agent/agents/dynamic/\`.\n\n**Tip:** Dynamic agents are auto-generated when you call a non-existent subagent. Try calling a subagent with a descriptive name and task to generate one.`;
				pi.sendMessage(
					{
						customType: "list-promotable-result",
						content: message,
						display: true,
					},
					{ triggerTurn: false },
				);
				return;
			}

			const message = `## Promotable Dynamic Agents (${promotable.length})\n\n${promotable
				.map((a) => `- **${a.name}**: ${a.description}`)
				.join("\n")}\n\n**Promote with:** \`/promote-agent ${promotable[0].name}\``;
			pi.sendMessage(
				{
					customType: "list-promotable-result",
					content: message,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	pi.registerCommand("promote-agent", {
		description: "Promote a dynamic agent to user scope. Usage: /promote-agent [agent-name] [--overwrite]",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("promote-agent requires interactive mode", "error");
				return;
			}

			// Get promotable agents
			const promotable = listPromotableAgents();

			if (promotable.length === 0) {
				ctx.ui.notify("No promotable agents found. Use /list-promotable-agents to check.", "info");
				return;
			}

			let agentName: string | undefined;
			let overwrite = false;

			// Parse arguments
			const argStr = args.trim();
			if (argStr) {
				const parts = argStr.split(/\s+/);
				agentName = parts[0];

				// Parse overwrite flag
				const overwriteIndex = parts.indexOf("--overwrite");
				if (overwriteIndex !== -1) {
					overwrite = true;
				}
			}

			// If no agent name provided, use TUI selection
			if (!agentName) {
				const tempDir = os.tmpdir();
				const questionsPath = path.join(tempDir, "promote-agent-questions.json");

				const questions = {
					title: "Promote Dynamic Agent",
					questions: [
						{
							id: "agent",
							type: "single",
							question: "Select a dynamic agent to promote:",
							options: promotable.map((a) => `${a.name}: ${a.description}`),
						},
						{
							id: "overwrite",
							type: "single",
							question: "Overwrite if agent already exists in user scope?",
							options: ["No (cancel if exists)", "Yes (overwrite)"],
						},
					],
				};

				fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2), "utf-8");

				// Trigger interview tool
				pi.sendMessage(
					{
						customType: "promote-agent-tui",
						content: `Please select an agent to promote using the interview tool:

\`\`\`json
{
  "questions": "${questionsPath}"
}
\`\`\`

After selection, I will promote the selected agent to user scope.`,
						display: false,
					},
					{ triggerTurn: true },
				);
				return;
			}

			// Check if agent exists in dynamic scope
			const exists = promotable.find((a) => a.name === agentName);

			if (!exists) {
				const available = promotable.map((a) => a.name).join(", ") || "none";
				ctx.ui.notify(`✗ Dynamic agent '${agentName}' not found. Available: ${available}`, "error");
				ctx.ui.notify("Use /list-promotable-agents to see all promotable agents", "info");
				return;
			}

			// If overwrite is not set and agent already exists in user scope, confirm
			if (!overwrite) {
				const userAgents = listAgents("user");
				if (userAgents.includes(agentName)) {
					const ok = await ctx.ui.confirm(
						"Overwrite existing agent?",
						`Agent '${agentName}' already exists in user scope. Do you want to overwrite it?`,
					);
					if (!ok) {
						ctx.ui.notify("Promotion canceled", "info");
						return;
					}
					overwrite = true;
				}
			}

			// Promote the agent
			const result = promoteDynamicAgent(agentName, { overwrite });

			if (result.success) {
				const action = result.overwritten ? "replaced" : "promoted";
				ctx.ui.notify(`✓ Successfully ${action} agent '${agentName}' to user scope`, "success");
				ctx.ui.notify(`Location: ${result.filePath}`, "info");
				ctx.ui.notify(`Usage: /sub:${agentName} <task>`, "info");
			} else {
				ctx.ui.notify(`✗ Failed to promote agent: ${result.error}`, "error");
			}
		},
	});

	pi.registerCommand("promote-agent-confirm", {
		description: "Confirm promotion after TUI selection (internal use)",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("promote-agent-confirm requires interactive mode", "error");
				return;
			}

			try {
				const { agent, overwrite } = JSON.parse(args);

				if (!agent) {
					ctx.ui.notify("No agent selected", "error");
					return;
				}

				const promotable = listPromotableAgents();
				const exists = promotable.find((a) => a.name === agent);

				if (!exists) {
					ctx.ui.notify(`✗ Dynamic agent '${agent}' not found`, "error");
					return;
				}

				const overwriteFlag = overwrite === "Yes (overwrite)";

				// Promote the agent
				const result = promoteDynamicAgent(agent, { overwrite: overwriteFlag });

				if (result.success) {
					const action = result.overwritten ? "replaced" : "promoted";
					ctx.ui.notify(`✓ Successfully ${action} agent '${agent}' to user scope`, "success");
					ctx.ui.notify(`Location: ${result.filePath}`, "info");
					ctx.ui.notify(`Usage: /sub:${agent} <task>`, "info");
				} else {
					ctx.ui.notify(`✗ Failed to promote agent: ${result.error}`, "error");
				}
			} catch (error) {
				ctx.ui.notify(`✗ Failed to parse selection: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}