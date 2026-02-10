/**
 * Agent creation utilities
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type AgentScope = "user" | "project" | "dynamic";
export type AgentTemplate = "worker" | "scout" | "reviewer" | "custom";

export interface CreateAgentOptions {
	name: string;
	description: string;
	tools?: string[];
	template?: AgentTemplate;
	customPrompt?: string;
	scope?: AgentScope;
	model?: string;
	provider?: string;
}

const AGENT_TEMPLATES: Record<AgentTemplate, string> = {
	worker: `You are a worker agent with full capabilities. You operate in an isolated context window.

Work autonomously to complete assigned tasks. Use all available tools as needed.

## Completed
What was done.

## Modified Files
- \`path/to/file\` - What was changed

## Notes
Any important context for the main agent.`,

	scout: `You are a scout agent. Quickly investigate the codebase and return structured findings for other agents.

## Retrieved Files
List with exact line ranges:
1. \`path/to/file.ts\` (10-50 lines) - Description
2. ...

## Key Code
Key types, interfaces, or functions:

\`\`\`typescript
interface Example {
  // Actual code from files
}
\`\`\`

## Architecture
Brief explanation of how parts connect.

## Where to Start
The main file to look at first.`,

	reviewer: `You are a code reviewer. Analyze code and provide structured feedback.

## Files Reviewed
List of files examined with brief descriptions.

## Issues Found
Categorized issues:
- **High**: Critical bugs, security issues
- **Medium**: Performance concerns, code smell
- **Low**: Style, minor improvements

## Recommendations
Suggestions for improvement with examples.`,

	custom: "",
};

function getAgentDir(scope: AgentScope): string {
	const homeDir = os.homedir();
	switch (scope) {
		case "dynamic":
			return path.join(homeDir, ".pi", "agent", "agents", "dynamic");
		case "project":
			return path.join(process.cwd(), ".pi", "agents");
		case "user":
		default:
			return path.join(homeDir, ".pi", "agent", "agents");
	}
}

function sanitizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export function createAgent(options: CreateAgentOptions): { success: boolean; filePath?: string; error?: string } {
	try {
		const scope = options.scope ?? "user";
		const agentDir = getAgentDir(scope);

		// Create directory if needed
		if (!fs.existsSync(agentDir)) {
			fs.mkdirSync(agentDir, { recursive: true });
		}

		// Sanitize name
		const safeName = sanitizeName(options.name);
		if (!safeName) {
			return { success: false, error: "Invalid agent name" };
		}

		// Build frontmatter
		const frontmatterFields: string[] = [
			`name: "${safeName}"`,
			`description: "${options.description}"`,
		];

		if (options.tools && options.tools.length > 0) {
			frontmatterFields.push(`tools: ${options.tools.join(", ")}`);
		}

		if (options.model) {
			frontmatterFields.push(`model: ${options.model}`);
		}

		if (options.provider) {
			frontmatterFields.push(`provider: ${options.provider}`);
		}

		const frontmatter = `---\n${frontmatterFields.join("\n")}\n---`;

		// Get system prompt
		let systemPrompt: string;
		if (options.customPrompt) {
			systemPrompt = options.customPrompt;
		} else if (options.template && options.template !== "custom") {
			systemPrompt = AGENT_TEMPLATES[options.template];
		} else {
			systemPrompt = AGENT_TEMPLATES.worker;
		}

		// Build content
		const content = `${frontmatter}\n\n${systemPrompt}`;

		// Write file
		const filePath = path.join(agentDir, `${safeName}.md`);
		fs.writeFileSync(filePath, content, "utf-8");

		return { success: true, filePath };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function listAgents(scope: AgentScope): string[] {
	const agentDir = getAgentDir(scope);
	if (!fs.existsSync(agentDir)) {
		return [];
	}

	try {
		return fs
			.readdirSync(agentDir)
			.filter((file) => file.endsWith(".md"))
			.map((file) => file.replace(/\.md$/, ""))
			.sort();
	} catch {
		return [];
	}
}

export function deleteAgent(name: string, scope: AgentScope): { success: boolean; error?: string } {
	try {
		const agentDir = getAgentDir(scope);
		const safeName = sanitizeName(name);
		const filePath = path.join(agentDir, `${safeName}.md`);

		if (!fs.existsSync(filePath)) {
			return { success: false, error: `Agent '${name}' not found in ${scope} scope` };
		}

		fs.unlinkSync(filePath);
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function generateInterviewQuestions(tempDir: string): string {
	const questionsPath = path.join(tempDir, "create-agent-questions.json");
	const questions = {
		title: "Create New Agent (AI Generated)",
		questions: [
			{
				id: "name",
				type: "text",
				question: "Agent name (alphanumeric, hyphens, underscores):",
			},
			{
				id: "task",
				type: "text",
				question: "What should this agent do? (AI will generate the agent based on this):",
			},
			{
				id: "scope",
				type: "single",
				question: "Where to save the agent:",
				options: ["user (all projects)", "project (current project)", "dynamic (auto-generated)"],
			},
		],
	};

	fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2), "utf-8");
	return questionsPath;
}

export interface PromoteAgentResult {
	success: boolean;
	filePath?: string;
	error?: string;
	overwritten?: boolean;
}

export function promoteDynamicAgent(
	agentName: string,
	options?: { overwrite?: boolean }
): PromoteAgentResult {
	try {
		const dynamicDir = getAgentDir("dynamic");
		const userDir = getAgentDir("user");

		// Ensure dynamic directory exists
		if (!fs.existsSync(dynamicDir)) {
			return { success: false, error: "Dynamic agents directory does not exist" };
		}

		// Find the agent file (handle special characters in filename)
		const files = fs.readdirSync(dynamicDir);
		let sourceFile: string | null = null;

		// Try exact match first
		const exactMatch = files.find((f) => f === `${agentName}.md`);
		if (exactMatch) {
			sourceFile = exactMatch;
		} else {
			// Try sanitized match
			const sanitized = sanitizeName(agentName);
			const sanitizedMatch = files.find((f) => f === `${sanitized}.md`);
			if (sanitizedMatch) {
				sourceFile = sanitizedMatch;
			}
		}

		if (!sourceFile) {
			return { success: false, error: `Dynamic agent '${agentName}' not found` };
		}

		const sourcePath = path.join(dynamicDir, sourceFile);
		const targetPath = path.join(userDir, sourceFile);

		// Check if target already exists
		if (fs.existsSync(targetPath)) {
			if (!options?.overwrite) {
				return { success: false, error: `Agent '${agentName}' already exists in user scope. Use --overwrite to replace.` };
			}
		}

		// Ensure user directory exists
		if (!fs.existsSync(userDir)) {
			fs.mkdirSync(userDir, { recursive: true });
		}

		// Move file
		fs.renameSync(sourcePath, targetPath);

		return {
			success: true,
			filePath: targetPath,
			overwritten: options?.overwrite ?? false,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export function listPromotableAgents(): Array<{ name: string; filePath: string; description: string }> {
	try {
		const dynamicDir = getAgentDir("dynamic");
		if (!fs.existsSync(dynamicDir)) {
			return [];
		}

		const agents: Array<{ name: string; filePath: string; description: string }> = [];
		const files = fs.readdirSync(dynamicDir).filter((f) => f.endsWith(".md"));

		for (const file of files) {
			const filePath = path.join(dynamicDir, file);
			const content = fs.readFileSync(filePath, "utf-8");

			// Extract description from frontmatter
			const descMatch = content.match(/description:\s*"([^"]+)"/);
			const description = descMatch ? descMatch[1] : "No description";

			agents.push({
				name: file.replace(/\.md$/, ""),
				filePath,
				description,
			});
		}

		return agents.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}
