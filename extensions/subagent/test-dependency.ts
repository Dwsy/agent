#!/usr/bin/env bun

/**
 * Test dependency analysis and parallel optimization
 */

import { 
	analyzeDependencies, 
	hasFileConflict, 
	hasDependencyConflict,
	analyzeTaskGroups,
	generateExecutionPlan,
	formatExecutionPlan,
	type Task 
} from "./utils/dependency.ts";

console.log("=== Testing Dependency Analysis ===\n");

// Test 1: Simple tasks without dependencies
console.log("1. Testing simple tasks (no dependencies)...");
const simpleTasks: Task[] = [
	{ id: "task1", agent: "scout", task: "Find auth code" },
	{ id: "task2", agent: "scout", task: "Find db code" },
	{ id: "task3", agent: "scout", task: "Find api code" }
];

const simpleGroups = analyzeTaskGroups(simpleTasks);
console.log(`✅ Generated ${simpleGroups.length} group(s)`);
simpleGroups.forEach(g => {
	console.log(`   - ${g.id}: ${g.tasks.length} tasks, parallelizable: ${g.canParallelize}`);
});

// Test 2: Tasks with file conflicts
console.log("\n2. Testing tasks with file conflicts...");
const conflictTasks: Task[] = [
	{ id: "task1", agent: "worker", task: "Modify user.ts", files: ["src/user.ts"] },
	{ id: "task2", agent: "worker", task: "Modify user.ts again", files: ["src/user.ts"] },
	{ id: "task3", agent: "worker", task: "Modify auth.ts", files: ["src/auth.ts"] }
];

const conflictGroups = analyzeTaskGroups(conflictTasks);
console.log(`✅ Generated ${conflictGroups.length} group(s)`);
conflictGroups.forEach(g => {
	console.log(`   - ${g.id}: ${g.tasks.length} tasks, parallelizable: ${g.canParallelize}`);
	g.tasks.forEach(t => console.log(`     * ${t.task}`));
});

// Test 3: Tasks with dependencies
console.log("\n3. Testing tasks with dependencies...");
const depTasks: Task[] = [
	{ id: "task1", agent: "scout", task: "Find code", dependencies: [] },
	{ id: "task2", agent: "worker", task: "Modify code", dependencies: ["task1"] },
	{ id: "task3", agent: "reviewer", task: "Review code", dependencies: ["task2"] },
	{ id: "task4", agent: "worker", task: "Write tests", dependencies: ["task1"] }
];

const depGroups = analyzeTaskGroups(depTasks);
console.log(`✅ Generated ${depGroups.length} group(s)`);
depGroups.forEach(g => {
	console.log(`   - ${g.id}: ${g.tasks.length} tasks, parallelizable: ${g.canParallelize}`);
	if (g.dependencies.length > 0) {
		console.log(`     Dependencies: ${g.dependencies.join(", ")}`);
	}
	g.tasks.forEach(t => console.log(`     * ${t.task}`));
});

// Test 4: Complex scenario
console.log("\n4. Testing complex scenario...");
const complexTasks: Task[] = [
	{ id: "task1", agent: "scout", task: "Find auth code", dependencies: [] },
	{ id: "task2", agent: "scout", task: "Find db code", dependencies: [] },
	{ id: "task3", agent: "scout", task: "Find api code", dependencies: [] },
	{ id: "task4", agent: "worker", task: "Modify auth", dependencies: ["task1"], files: ["src/auth.ts"] },
	{ id: "task5", agent: "worker", task: "Modify db", dependencies: ["task2"], files: ["src/db.ts"] },
	{ id: "task6", agent: "worker", task: "Modify api", dependencies: ["task3"], files: ["src/api.ts"] },
	{ id: "task7", agent: "reviewer", task: "Review all", dependencies: ["task4", "task5", "task6"] }
];

const complexGroups = analyzeTaskGroups(complexTasks);
console.log(`✅ Generated ${complexGroups.length} group(s)`);
complexGroups.forEach((g, i) => {
	console.log(`   Step ${i + 1}: ${g.id}`);
	console.log(`   - ${g.tasks.length} tasks, parallelizable: ${g.canParallelize}`);
	if (g.dependencies.length > 0) {
		console.log(`   - Dependencies: ${g.dependencies.join(", ")}`);
	}
	g.tasks.forEach(t => console.log(`     * [${t.agent}] ${t.task}`));
});

// Test 5: Generate execution plan
console.log("\n5. Testing execution plan generation...");
const plan = generateExecutionPlan(complexTasks);
console.log(`✅ Execution Plan:`);
console.log(`   - Total Steps: ${plan.totalSteps}`);
console.log(`   - Parallel Steps: ${plan.parallelSteps}`);
console.log(`   - Estimated Speedup: ${plan.estimatedSpeedup}x`);

// Test 6: Format execution plan
console.log("\n6. Testing execution plan formatting...");
const formatted = formatExecutionPlan(plan);
console.log("✅ Formatted Plan:");
console.log(formatted);

// Test 7: File conflict detection
console.log("\n7. Testing file conflict detection...");
const task1: Task = { id: "t1", agent: "worker", task: "Task 1", files: ["a.ts", "b.ts"] };
const task2: Task = { id: "t2", agent: "worker", task: "Task 2", files: ["b.ts", "c.ts"] };
const task3: Task = { id: "t3", agent: "worker", task: "Task 3", files: ["d.ts", "e.ts"] };

console.log(`   task1 vs task2: ${hasFileConflict(task1, task2) ? "❌ Conflict" : "✅ No conflict"}`);
console.log(`   task1 vs task3: ${hasFileConflict(task1, task3) ? "❌ Conflict" : "✅ No conflict"}`);
console.log(`   task2 vs task3: ${hasFileConflict(task2, task3) ? "❌ Conflict" : "✅ No conflict"}`);

// Test 8: Dependency conflict detection
console.log("\n8. Testing dependency conflict detection...");
const depGraph = analyzeDependencies([
	{ id: "a", agent: "worker", task: "A", dependencies: [] },
	{ id: "b", agent: "worker", task: "B", dependencies: ["a"] },
	{ id: "c", agent: "worker", task: "C", dependencies: ["b"] },
	{ id: "d", agent: "worker", task: "D", dependencies: ["a"] }
]);

console.log(`   a vs b: ${hasDependencyConflict("a", "b", depGraph) ? "❌ Conflict" : "✅ No conflict"}`);
console.log(`   b vs c: ${hasDependencyConflict("b", "c", depGraph) ? "❌ Conflict" : "✅ No conflict"}`);
console.log(`   b vs d: ${hasDependencyConflict("b", "d", depGraph) ? "❌ Conflict" : "✅ No conflict"}`);
console.log(`   a vs c: ${hasDependencyConflict("a", "c", depGraph) ? "❌ Conflict" : "✅ No conflict"}`);

console.log("\n=== Test Complete ===");
