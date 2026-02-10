#!/usr/bin/env bun

/**
 * Test categories functionality
 */

import { loadCategoriesConfig, resolveCategoryToAgent, listCategories, getCategoriesDescriptionText } from "./utils/categories.ts";

console.log("=== Testing Categories Functionality ===\n");

// Test 1: Load config
console.log("1. Loading categories config...");
const config = loadCategoriesConfig();
if (config) {
	console.log("✅ Config loaded successfully");
	console.log(`   Version: ${config.version}`);
	console.log(`   Categories: ${Object.keys(config.categories).length}`);
} else {
	console.log("❌ Failed to load config");
}

console.log("\n2. Testing category resolution...");
const testCategories = ["architecture", "security", "exploration", "invalid"];
testCategories.forEach(cat => {
	const agent = resolveCategoryToAgent(cat);
	if (agent) {
		console.log(`✅ ${cat} → ${agent}`);
	} else {
		console.log(`❌ ${cat} → (not found)`);
	}
});

console.log("\n3. Listing all categories...");
const categories = listCategories();
categories.forEach(cat => {
	console.log(`   - ${cat.name} → ${cat.agent}`);
	console.log(`     ${cat.description}`);
});

console.log("\n4. Getting description text...");
const descText = getCategoriesDescriptionText();
console.log(descText);

console.log("\n=== Test Complete ===");
