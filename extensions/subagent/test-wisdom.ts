#!/usr/bin/env bun

/**
 * Test wisdom accumulation functionality
 */

import { extractWisdom, appendWisdom, loadWisdom, formatWisdomForPrompt, getWisdomStats } from "./utils/wisdom.ts";
import type { SingleResult } from "./types.ts";

console.log("=== Testing Wisdom Accumulation ===\n");

// Test 1: Extract wisdom from mock result
console.log("1. Testing wisdom extraction...");
const mockResult: SingleResult = {
	agent: "test-agent",
	agentSource: "user",
	task: "Test task for wisdom extraction",
	exitCode: 0,
	messages: [
		{
			role: "assistant",
			content: [
				{
					type: "text",
					text: `
I've completed the task. Here are some learnings:

Convention: Always use TypeScript strict mode for better type safety
Success: ✅ Using async/await makes code more readable than callbacks
Failure: ❌ Don't use any type, it defeats the purpose of TypeScript
Gotcha: ⚠️ Remember to handle promise rejections to avoid unhandled errors
Command: \`npm run test -- --coverage\` to generate coverage reports
Decision: We decided to use Bun instead of Node.js for better performance
					`
				}
			]
		}
	],
	stderr: "",
	usage: {
		input: 100,
		output: 200,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0.001,
		contextTokens: 100,
		turns: 1
	}
};

const wisdomNotes = extractWisdom(mockResult);
console.log(`✅ Extracted ${wisdomNotes.length} wisdom notes:`);
wisdomNotes.forEach(note => {
	console.log(`   - ${note.type}: ${note.content.slice(0, 50)}...`);
});

// Test 2: Append wisdom
console.log("\n2. Testing wisdom append...");
appendWisdom(wisdomNotes);
console.log("✅ Wisdom appended to learnings.md");

// Test 3: Load wisdom
console.log("\n3. Testing wisdom load...");
const wisdom = loadWisdom();
if (wisdom) {
	console.log(`✅ Loaded wisdom (${wisdom.length} characters)`);
	console.log("   Preview:", wisdom.slice(0, 100) + "...");
} else {
	console.log("❌ No wisdom loaded");
}

// Test 4: Format wisdom for prompt
console.log("\n4. Testing wisdom formatting...");
const formatted = formatWisdomForPrompt(wisdom, 500);
console.log(`✅ Formatted wisdom (${formatted.length} characters)`);
console.log("   Preview:", formatted.slice(0, 150) + "...");

// Test 5: Get wisdom stats
console.log("\n5. Testing wisdom stats...");
const stats = getWisdomStats();
console.log(`✅ Total notes: ${stats.totalNotes}`);
console.log("   By type:");
Object.entries(stats.byType).forEach(([type, count]) => {
	if (count > 0) {
		console.log(`   - ${type}: ${count}`);
	}
});
console.log(`   Last update: ${stats.lastUpdate}`);

console.log("\n=== Test Complete ===");
console.log("\nYou can view the accumulated wisdom at:");
console.log("~/.pi/agent/notepads/learnings.md");
