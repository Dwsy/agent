#!/usr/bin/env bun

/**
 * Test TODO monitoring functionality
 */

import {
	extractTodos,
	hasIncompleteTodos,
	getIncompleteTodoCount,
	getIncompleteTodos,
	getCompletedTodos,
	getTodoCompletionRate,
	generateTodoReminder,
	formatTodoStats,
	validateTodoCompletion,
	hasTodos,
	generateTodoProgressBar
} from "./utils/todo.ts";

console.log("=== Testing TODO Monitoring ===\n");

// Test 1: Extract TODOs
console.log("1. Testing TODO extraction...");
const content1 = `
## Task List

- [ ] Read user model file
- [x] Create user service
- [ ] Add validation logic
- [x] Write tests
`;

const todos = extractTodos(content1);
console.log(`✅ Extracted ${todos.length} TODOs:`);
todos.forEach(todo => {
	const status = todo.completed ? "[x]" : "[ ]";
	console.log(`   ${status} ${todo.text}`);
});

// Test 2: Check incomplete TODOs
console.log("\n2. Testing incomplete TODO detection...");
const hasIncomplete = hasIncompleteTodos(content1);
const incompleteCount = getIncompleteTodoCount(content1);
console.log(`✅ Has incomplete TODOs: ${hasIncomplete}`);
console.log(`✅ Incomplete count: ${incompleteCount}`);

// Test 3: Get incomplete TODOs
console.log("\n3. Testing incomplete TODO list...");
const incompleteTodos = getIncompleteTodos(content1);
console.log(`✅ Incomplete TODOs (${incompleteTodos.length}):`);
incompleteTodos.forEach(todo => {
	console.log(`   - ${todo.text}`);
});

// Test 4: Get completed TODOs
console.log("\n4. Testing completed TODO list...");
const completedTodos = getCompletedTodos(content1);
console.log(`✅ Completed TODOs (${completedTodos.length}):`);
completedTodos.forEach(todo => {
	console.log(`   - ${todo.text}`);
});

// Test 5: Calculate completion rate
console.log("\n5. Testing completion rate...");
const rate = getTodoCompletionRate(content1);
console.log(`✅ Completion rate: ${(rate * 100).toFixed(1)}%`);

// Test 6: Generate reminder
console.log("\n6. Testing TODO reminder generation...");
const reminder = generateTodoReminder(content1);
if (reminder) {
	console.log("✅ Reminder generated:");
	console.log(reminder);
} else {
	console.log("❌ No reminder (all TODOs completed)");
}

// Test 7: Format TODO stats
console.log("\n7. Testing TODO stats formatting...");
const stats = formatTodoStats(content1);
console.log("✅ Stats formatted:");
console.log(stats);

// Test 8: Validate completion
console.log("\n8. Testing TODO completion validation...");
const validation = validateTodoCompletion(content1);
console.log(`${validation.valid ? "✅" : "❌"} ${validation.message}`);
if (!validation.valid) {
	console.log(`   Incomplete TODOs: ${validation.incompleteTodos.length}`);
}

// Test 9: Check if has TODOs
console.log("\n9. Testing TODO presence detection...");
const content2 = "No TODOs here";
console.log(`   Content 1 has TODOs: ${hasTodos(content1) ? "✅ Yes" : "❌ No"}`);
console.log(`   Content 2 has TODOs: ${hasTodos(content2) ? "✅ Yes" : "❌ No"}`);

// Test 10: Generate progress bar
console.log("\n10. Testing progress bar generation...");
const progressBar = generateTodoProgressBar(content1);
console.log(`✅ Progress bar: ${progressBar}`);

// Test 11: All completed
console.log("\n11. Testing all completed scenario...");
const content3 = `
- [x] Task 1
- [x] Task 2
- [x] Task 3
`;

const validation3 = validateTodoCompletion(content3);
console.log(`${validation3.valid ? "✅" : "❌"} ${validation3.message}`);
const reminder3 = generateTodoReminder(content3);
console.log(`   Reminder: ${reminder3 ? "Generated" : "✅ None (all completed)"}`);

// Test 12: No TODOs
console.log("\n12. Testing no TODOs scenario...");
const content4 = "Just some regular text without any TODOs";
const validation4 = validateTodoCompletion(content4);
console.log(`${validation4.valid ? "✅" : "❌"} ${validation4.message}`);

// Test 13: Complex TODO format
console.log("\n13. Testing complex TODO formats...");
const content5 = `
## Implementation

- [ ] Step 1: Read files
  - This is a sub-item
- [X] Step 2: Process data (uppercase X)
- [ ] Step 3: Write output
  - Another sub-item
- [x] Step 4: Verify results (lowercase x)
`;

const todos5 = extractTodos(content5);
console.log(`✅ Extracted ${todos5.length} TODOs from complex format`);
const rate5 = getTodoCompletionRate(content5);
console.log(`✅ Completion rate: ${(rate5 * 100).toFixed(1)}%`);

console.log("\n=== Test Complete ===");
