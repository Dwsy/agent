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

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const SubagentParamsSchema = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
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
			"Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
			'Default agent scope is "user" (from ~/.pi/agent/agents).',
			'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
		].join(" "),
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
				return singleMode.execute(executionContext, { agent: params.agent, task: params.task, cwd: params.cwd });
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
}