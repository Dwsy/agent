/**
 * Subagent 配置加载和代理发现
 * 从 .md 文件的 YAML frontmatter 读取配置
 * 支持环境变量覆盖模型配置
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
	const frontmatter: Record<string, string> = {};
	const normalized = content.replace(/\r\n/g, "\n");

	if (!normalized.startsWith("---")) {
		return { frontmatter, body: normalized };
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { frontmatter, body: normalized };
	}

	const frontmatterBlock = normalized.slice(4, endIndex);
	const body = normalized.slice(endIndex + 4).trim();

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

	return { frontmatter, body };
}

function loadAgentsFromDir(dir: string, source: "user" | "project", envOverrides: Record<string, string>): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		// 解析 tools
		let tools: string[] = [];
		if (frontmatter.tools) {
			tools = frontmatter.tools.split(",").map((t: string) => t.trim()).filter(Boolean);
		}

		// 解析 model（支持环境变量覆盖）
		// 默认根据代理类型选择合适模型
		let model = frontmatter.model;
		if (!model) {
			// 根据代理名称选择默认模型
			switch (frontmatter.name) {
				case 'scout':
					model = 'glm-4.7'; // 快速侦察
					break;
				case 'planner':
					model = 'claude-opus-4-5-thinking'; // 推理能力强
					break;
				case 'reviewer':
					model = 'gemini-3-pro-high'; // 审查能力强
					break;
				case 'worker':
					model = 'glm-4.7'; // 通用任务
					break;
				default:
					model = 'glm-4.7';
			}
		}
		const envKey = `MODEL_${frontmatter.name.toUpperCase()}`;
		if (envOverrides[envKey]) {
			model = envOverrides[envKey];
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools.length > 0 ? tools : ["read", "grep", "find", "ls", "bash"],
			model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

/**
 * 收集环境变量覆盖（仅模型配置）
 */
function getEnvOverrides(): Record<string, string> {
	const overrides: Record<string, string> = {};
	const envKeys = ["MODEL_SCOUT", "MODEL_PLANNER", "MODEL_REVIEWER", "MODEL_WORKER"];
	for (const key of envKeys) {
		const value = process.env[key];
		if (value) {
			overrides[key] = value;
		}
	}
	return overrides;
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(os.homedir(), ".pi", "agent", "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);
	const envOverrides = getEnvOverrides();

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user", envOverrides);
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project", envOverrides);

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}