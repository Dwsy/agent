/**
 * Dynamic Agent Generator
 *
 * Generates temporary agent definitions on-the-fly when requested agents don't exist.
 * Also persists generated agents to ~/.pi/agent/agents/dynamic for future use.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { AgentConfig } from "./agents.js";
import { writePromptToTempFile, cleanupTempFiles } from "./utils/tempfiles.js";

const DYNAMIC_AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents", "dynamic");
const USER_SKILLS_DIR = path.join(os.homedir(), ".pi", "agent", "skills");

interface ToolDescription {
	name: string;
	description: string;
	useCase: string;
}

interface SkillDescription {
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
	{
		name: "edit",
		description: "Edit files by replacing exact text matches (surgical edits)",
		useCase: "When making precise, targeted changes to files with known content",
	},
	{
		name: "write",
		description: "Write content to files (creates if not exists, overwrites if exists)",
		useCase: "When creating new files or completely replacing file contents",
	},
	{
		name: "interview",
		description: "Present interactive forms to gather structured user responses",
		useCase: "When you need to collect user input through structured Q&A forms",
	},
	{
		name: "subagent",
		description: "Delegate tasks to specialized subagents with isolated context",
		useCase: "When you need to offload specialized tasks to dedicated agents",
	},
	{
		name: "todo",
		description: "Manage todo lists (list, add, toggle, clear)",
		useCase: "When tracking tasks or managing a checklist",
	},
];

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

export interface DynamicAgentGeneratorOptions {
	agentName: string;
	task: string;
	targetScope?: "user" | "project" | "dynamic";
}

export interface GeneratedAgentConfig {
	name: string;
	description: string;
	systemPrompt: string;
	model?: string;
	tools?: string[];
	provider?: string;
	filePath?: string;
	origin?: "generated" | "matched";
	availableTools?: string[];
	availableSkills?: string[];
}

function extractTextContent(content: any): string {
	if (!content) return "";
	if (Array.isArray(content)) {
		return content
			.filter((item) => item?.type === "text")
			.map((item) => item.text)
			.join("");
	}
	if (typeof content === "string") return content;
	return "";
}

function parseJsonObject<T>(text: string): T | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]) as T;
	} catch {
		return null;
	}
}

function ensureDynamicAgentsDir(): void {
	if (!fs.existsSync(DYNAMIC_AGENTS_DIR)) {
		fs.mkdirSync(DYNAMIC_AGENTS_DIR, { recursive: true });
	}
}

function getTargetDir(scope: "user" | "project" | "dynamic"): string {
	switch (scope) {
		case "user":
			return path.join(os.homedir(), ".pi", "agent", "agents");
		case "project":
			return path.join(process.cwd(), ".pi", "agents");
		case "dynamic":
		default:
			return DYNAMIC_AGENTS_DIR;
	}
}

export function getAvailableTools(): ToolDescription[] {
	const envValue = process.env.PI_ACTIVE_TOOLS ?? process.env.PI_TOOLS ?? "";
	const fromEnv = envValue
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);

	if (fromEnv.length === 0) {
		return [...DEFAULT_TOOLS];
	}

	return DEFAULT_TOOLS.filter((tool) => fromEnv.includes(tool.name));
}

function listSkillDirs(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	try {
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

export function getAvailableSkills(): SkillDescription[] {
	const skillMap = new Map<string, SkillDescription>();

	loadSkillDescriptions(USER_SKILLS_DIR).forEach((skill) => skillMap.set(skill.name, skill));

	let currentDir = process.cwd();
	while (true) {
		const candidate = path.join(currentDir, ".pi", "skills");
		loadSkillDescriptions(candidate).forEach((skill) => skillMap.set(skill.name, skill));
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	return Array.from(skillMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDynamicAgentPrompt(agentName: string, task: string, availableTools: ToolDescription[], availableSkills: SkillDescription[]): string {
	const toolsList = availableTools.map((t) => `- **${t.name}**: ${t.description}\n  - Use when: ${t.useCase}`).join("\n\n");
	const skillsList = availableSkills.map((s) => `- **${s.name}**: ${s.description}\n  - Use when: ${s.useCase}`).join("\n\n");

	return `You are an Agent Generator. Your task is to create a temporary subagent definition based on the user's request.

**Agent Request:**
- Name: ${agentName}
- Task: ${task}

**Context:**
The user wants to delegate a task to a specialized agent named "${agentName}", but this agent doesn't exist in the agent registry. You need to generate a temporary agent definition that can handle this task effectively.

---

## Available Tools

${toolsList}

---

## Available Skills/Plugins (CLI helpers)

${skillsList}

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

## Output Format

Generate a JSON object with the following structure:
\`\`\`json
{
  "name": "the agent name (use the requested name)",
  "description": "A brief one-line description of this agent's purpose",
  "systemPrompt": "A detailed system prompt that defines the agent's role, responsibilities, constraints, and best practices. Include tool usage guidance and skill invocation examples when relevant.",
  "tools": "(optional) Array of tool names this agent might need - only include if absolutely necessary"
}
\`\`\`

---

## IMPORTANT Constraints

- **Do NOT specify "model" or "provider" fields** - use the user's default model and provider
- **Only specify "tools" if the task absolutely requires specific tools** - otherwise omit the field
- If you specify tools, **only use names from the Available Tools list** above
- **Do NOT include skills in the tools field** - skills are invoked via CLI, suggest them in systemPrompt instead
- Use the requested agent name as the name
- The systemPrompt should be specific to the task domain
- Include relevant constraints, best practices, and tool usage guidance
- Keep the description concise but informative
- The generated agent is temporary and only used for this request

---

## Response Rules

- **Only output valid JSON, nothing else**
- No markdown code blocks
- No explanations
- Valid JSON that can be parsed directly
- Ensure all JSON fields are properly quoted and escaped`;
}

function saveDynamicAgentToFile(generated: GeneratedAgentConfig, targetDir?: string): string {
	const saveDir = targetDir || DYNAMIC_AGENTS_DIR;
	
	// Ensure directory exists
	if (!fs.existsSync(saveDir)) {
		fs.mkdirSync(saveDir, { recursive: true });
	}

	// Keep original name, only replace problematic filesystem characters
	const fileName = `${generated.name.replace(/[\/\\:*?"<>|]/g, "_")}.md`;
	const filePath = path.join(saveDir, fileName);

	const frontmatterFields = [
		`name: "${generated.name}"`,
		`description: "${generated.description}"`,
	];
	if (generated.tools && generated.tools.length > 0) {
		frontmatterFields.push(`tools: ${generated.tools.join(", ")}`);
	}

	const frontmatter = `---\n${frontmatterFields.join("\n")}\n---`;
	const content = `${frontmatter}\n\n${generated.systemPrompt}`;

	fs.writeFileSync(filePath, content, "utf-8");

	return filePath;
}

export function getDynamicAgentsDir(): string {
	ensureDynamicAgentsDir();
	return DYNAMIC_AGENTS_DIR;
}


async function findExistingDynamicAgent(agentName: string, task: string): Promise<GeneratedAgentConfig | null> {
	ensureDynamicAgentsDir();

	try {
		const files = fs.readdirSync(DYNAMIC_AGENTS_DIR);
		const agentFiles = files.filter((f) => f.endsWith(".md"));

		if (agentFiles.length === 0) {
			return null;
		}

		const agentContents: Array<{ file: string; content: string }> = [];
		for (const file of agentFiles) {
			const filePath = path.join(DYNAMIC_AGENTS_DIR, file);
			const content = fs.readFileSync(filePath, "utf-8");
			agentContents.push({ file, content });
		}

		const searchPrompt = `You are searching for an existing dynamic agent.

Requested Agent: "${agentName}"
User Task: "${task}"

Available Dynamic Agents:
${agentContents.map(({ file, content }) => `---
File: ${file}
${content}
---`).join("\n\n")}

Your task: Determine if any of the available dynamic agents can handle the requested task.

Output JSON: { "exists": true/false, "matchedAgent": { "file": "filename", "reason": "why it matches" } }

Only output valid JSON.`;

		return new Promise((resolve) => {
			const tmp = writePromptToTempFile("dynamic-agent-search", searchPrompt);
			const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tmp.filePath, "Return JSON only."];
			let buffer = "";
			let resolved = false;
			const finish = (value: GeneratedAgentConfig | null) => {
				if (resolved) return;
				resolved = true;
				cleanupTempFiles(tmp.filePath, tmp.dir);
				resolve(value);
			};
			const timeout = setTimeout(() => finish(null), 60000);

			const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"], shell: false });

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (resolved) return;
					try {
						const event = JSON.parse(line);
						if (event.type === "message_end" && event.message?.content) {
							const textContent = extractTextContent(event.message.content);
							const parsed = parseJsonObject<{ exists: boolean; matchedAgent?: { file: string; reason: string } }>(textContent);
							if (parsed?.exists && parsed.matchedAgent) {
								const matchedFile = agentContents.find((a) => a.file === parsed.matchedAgent!.file);
								if (matchedFile) {
									const { frontmatter, body } = parseFrontmatter(matchedFile.content);
									clearTimeout(timeout);
									finish({
										name: frontmatter.name || parsed.matchedAgent.file.replace(".md", ""),
										description: frontmatter.description || "Dynamic agent",
										systemPrompt: body,
										model: frontmatter.model,
										tools: frontmatter.tools?.split(",").map((t) => t.trim()).filter(Boolean),
										provider: frontmatter.provider,
										filePath: path.join(DYNAMIC_AGENTS_DIR, parsed.matchedAgent.file),
										origin: "matched",
									});
								}
							}
						}
					} catch {}
				}
			});

			proc.on("close", () => {
				clearTimeout(timeout);
				finish(null);
			});

			proc.on("error", () => {
				clearTimeout(timeout);
				finish(null);
			});
		});
	} catch {
		return null;
	}
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

export async function generateDynamicAgent(options: DynamicAgentGeneratorOptions): Promise<GeneratedAgentConfig | null> {
	const { agentName, task, targetScope = "dynamic" } = options;

	const availableTools = getAvailableTools();
	const availableSkills = getAvailableSkills();

	// 优先查找已存在的动态 agent
	const existing = await findExistingDynamicAgent(agentName, task);
	if (existing) {
		existing.availableTools = availableTools.map((t) => t.name);
		existing.availableSkills = availableSkills.map((s) => s.name);
		return existing;
	}

	// 生成新的动态 agent - prompt 作为参数传递
	const prompt = buildDynamicAgentPrompt(agentName, task, availableTools, availableSkills);

	return new Promise((resolve) => {
		const tmp = writePromptToTempFile("dynamic-agent-generator", prompt);
		const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", tmp.filePath, "Generate the JSON now."];
		let buffer = "";
		let resolved = false;
		const finish = (value: GeneratedAgentConfig | null) => {
			if (resolved) return;
			resolved = true;
			cleanupTempFiles(tmp.filePath, tmp.dir);
			resolve(value);
		};
		const timeout = setTimeout(() => finish(null), 60000);

		const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"], shell: false });

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (resolved) return;
				try {
					const event = JSON.parse(line);
					if (event.type === "message_end" && event.message?.content) {
						const textContent = extractTextContent(event.message.content);
						const parsed = parseJsonObject<Partial<GeneratedAgentConfig>>(textContent);
						if (parsed?.name && parsed.systemPrompt) {
							const result: GeneratedAgentConfig = {
								name: parsed.name || agentName,
								description: parsed.description || `Dynamic agent for: ${task.slice(0, 50)}...`,
								systemPrompt: parsed.systemPrompt,
								tools: parsed.tools,
								origin: "generated",
								availableTools: availableTools.map((t) => t.name),
								availableSkills: availableSkills.map((s) => s.name),
							};
							result.filePath = saveDynamicAgentToFile(result, getTargetDir(targetScope));
							clearTimeout(timeout);
							finish(result);
							return;
						}
					}
				} catch {}
			}
		});

		proc.on("close", () => {
			clearTimeout(timeout);
			finish(null);
		});

		proc.on("error", () => {
			clearTimeout(timeout);
			finish(null);
		});
	});
}

export function dynamicAgentToConfig(generated: GeneratedAgentConfig, requestedName: string): AgentConfig {
	return {
		name: generated.name || requestedName,
		description: generated.description || `Dynamic agent`,
		systemPrompt: generated.systemPrompt,
		model: generated.model,
		tools: generated.tools,
		provider: generated.provider,
		source: "dynamic",
		filePath: generated.filePath ?? "",
	};
}