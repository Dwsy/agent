/**
 * Test script to verify skills are discoverable via knowledge search
 */
import { listKnowledge, searchKnowledge } from "./knowledge.ts";

console.log("=== Testing Skills Knowledge Integration ===\n");

// Test 1: List all sources including skills
console.log("Test 1: listKnowledge() - checking if skills source exists");
const list = listKnowledge(null);
const skillsSource = list.sources.find(s => s.id === "skills");
if (skillsSource) {
  console.log("✓ Skills source found:", skillsSource.description);
  const skillsCategory = skillsSource.categories.find(c => c.category === "skills");
  if (skillsCategory) {
    console.log(`✓ Skills category has ${skillsCategory.entries.length} entries`);
    // Show sample
    const samples = skillsCategory.entries.slice(0, 5);
    console.log("Sample skills:", samples.map(e => e.title).join(", "));
  }
} else {
  console.log("✗ Skills source NOT found");
}

// Test 2: Search for specific skills
console.log("\nTest 2: searchKnowledge() - searching for 'browser'");
const results = searchKnowledge(null, { query: "browser", limit: 5 });
const skillResults = results.filter(r => r.entry.source === "skills");
console.log(`Found ${skillResults.length} skill results for "browser":`);
skillResults.forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.entry.meta.title} (${r.relevance.toFixed(2)})`);
});

// Test 3: Search for skill by tags
console.log("\nTest 3: searchKnowledge() - searching by tags=['skill', 'tool']");
const tagResults = searchKnowledge(null, { tags: ["skill", "tool"], limit: 5 });
console.log(`Found ${tagResults.length} results with skill/tool tags`);
tagResults.slice(0, 3).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.entry.source}] ${r.entry.meta.title}`);
});

console.log("\n=== Summary ===");
console.log(`Total entries across all sources: ${list.totalEntries}`);
console.log(`Sources: ${list.sources.map(s => s.id).join(", ")}`);
console.log(`Tags indexed: ${Object.keys(list.tagIndex).length}`);
