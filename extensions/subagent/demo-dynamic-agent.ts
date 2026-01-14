/**
 * Demo script for dynamic-agent improvements
 * Shows the enhanced prompt with tool/skill descriptions and decision chain CoT
 */

import {
	getAvailableTools,
	getAvailableSkills,
	buildDynamicAgentPrompt,
	type ToolDescription,
	type SkillDescription,
} from "./dynamic-agent.js";

function formatToolDescription(tool: ToolDescription): string {
	return `  ${tool.name.padEnd(12)} - ${tool.description.substring(0, 50)}...`;
}

function formatSkillDescription(skill: SkillDescription): string {
	return `  ${skill.name.padEnd(15)} - ${skill.description.substring(0, 45)}...`;
}

function demoDynamicAgentGeneration() {
	console.log("\n" + "=".repeat(80));
	console.log("Dynamic Agent Generator - Enhanced Demo");
	console.log("=".repeat(80) + "\n");

	// Get available tools
	const tools = getAvailableTools();
	console.log(`📦 Available Tools: ${tools.length}\n`);
	tools.forEach((tool) => console.log(formatToolDescription(tool)));

	// Get available skills
	const skills = getAvailableSkills();
	console.log(`\n🔌 Available Skills: ${skills.length}\n`);
	skills.slice(0, 10).forEach((skill) => console.log(formatSkillDescription(skill)));
	if (skills.length > 10) {
		console.log(`  ... and ${skills.length - 10} more skills`);
	}

	// Generate a sample prompt
	console.log("\n" + "=".repeat(80));
	console.log("Sample Agent Generation");
	console.log("=".repeat(80) + "\n");

	const agentName = "log-analyst";
	const task = "Analyze application logs to find errors and performance issues related to traceId: abc123";

	console.log(`Agent Name: ${agentName}`);
	console.log(`Task: ${task}\n`);

	const prompt = buildDynamicAgentPrompt(agentName, task, tools, skills);

	console.log("Generated Prompt (first 500 chars):\n");
	console.log(prompt.substring(0, 500) + "...\n");

	console.log("Decision Chain Sections:\n");
	const sections = [
		"Step 1: Task Analysis",
		"Step 2: Tool Selection",
		"Step 3: Skill Integration",
		"Step 4: System Prompt Construction",
		"Step 5: Validation",
	];

	sections.forEach((section) => {
		if (prompt.includes(section)) {
			console.log(`✓ ${section}`);
		} else {
			console.log(`✗ ${section} (missing)`);
		}
	});

	console.log("\n" + "=".repeat(80));
	console.log("Key Improvements");
	console.log("=".repeat(80) + "\n");

	console.log("1. ✅ Dynamic Tool Descriptions");
	console.log("   - Each tool has name, description, and useCase");
	console.log("   - Loaded from DEFAULT_TOOLS array");
	console.log("   - Can be filtered via PI_ACTIVE_TOOLS env var\n");

	console.log("2. ✅ Dynamic Skill Descriptions");
	console.log("   - Loaded from SKILL.md frontmatter");
	console.log("   - Includes name, description, and useCase");
	console.log("   - Scans both user and project skill directories\n");

	console.log("3. ✅ Decision Chain (Chain of Thought)");
	console.log("   - Step 1: Task Analysis");
	console.log("   - Step 2: Tool Selection");
	console.log("   - Step 3: Skill Integration");
	console.log("   - Step 4: System Prompt Construction");
	console.log("   - Step 5: Validation\n");

	console.log("4. ✅ Enhanced Guidance");
	console.log("   - Tool selection criteria");
	console.log("   - Skill integration examples");
	console.log("   - Important constraints");
	console.log("   - Response rules\n");

	console.log("=".repeat(80) + "\n");
}

// Run the demo
demoDynamicAgentGeneration();