/**
 * Task dependency analysis utilities
 * 
 * Analyzes task dependencies and identifies parallelizable task groups.
 */

export interface Task {
	id: string;
	agent: string;
	task: string;
	files?: string[];
	dependencies?: string[];
	category?: string;
}

export interface TaskGroup {
	id: string;
	tasks: Task[];
	canParallelize: boolean;
	dependencies: string[];
}

/**
 * 分析任务依赖关系
 */
export function analyzeDependencies(tasks: Task[]): Map<string, string[]> {
	const dependencyGraph = new Map<string, string[]>();
	
	tasks.forEach(task => {
		dependencyGraph.set(task.id, task.dependencies || []);
	});
	
	return dependencyGraph;
}

/**
 * 检测文件冲突
 */
export function hasFileConflict(task1: Task, task2: Task): boolean {
	if (!task1.files || !task2.files) return false;
	
	const files1 = new Set(task1.files);
	const files2 = new Set(task2.files);
	
	// 检查是否有共同文件
	for (const file of files1) {
		if (files2.has(file)) return true;
	}
	
	return false;
}

/**
 * 检测依赖冲突
 */
export function hasDependencyConflict(
	task1Id: string,
	task2Id: string,
	dependencyGraph: Map<string, string[]>
): boolean {
	const deps1 = dependencyGraph.get(task1Id) || [];
	const deps2 = dependencyGraph.get(task2Id) || [];
	
	// 检查是否互相依赖
	if (deps1.includes(task2Id) || deps2.includes(task1Id)) {
		return true;
	}
	
	// 检查是否有传递依赖
	const allDeps1 = getAllDependencies(task1Id, dependencyGraph);
	const allDeps2 = getAllDependencies(task2Id, dependencyGraph);
	
	if (allDeps1.has(task2Id) || allDeps2.has(task1Id)) {
		return true;
	}
	
	return false;
}

/**
 * 获取所有传递依赖
 */
function getAllDependencies(
	taskId: string,
	dependencyGraph: Map<string, string[]>,
	visited: Set<string> = new Set()
): Set<string> {
	if (visited.has(taskId)) return visited;
	
	visited.add(taskId);
	const directDeps = dependencyGraph.get(taskId) || [];
	
	for (const dep of directDeps) {
		getAllDependencies(dep, dependencyGraph, visited);
	}
	
	return visited;
}

/**
 * 分析任务组
 */
export function analyzeTaskGroups(tasks: Task[]): TaskGroup[] {
	if (tasks.length === 0) return [];
	
	const dependencyGraph = analyzeDependencies(tasks);
	const groups: TaskGroup[] = [];
	const visited = new Set<string>();
	
	// 按依赖层级分组
	const levels = topologicalSort(tasks, dependencyGraph);
	
	for (const level of levels) {
		const levelTasks = level.map(id => tasks.find(t => t.id === id)!).filter(Boolean);
		
		if (levelTasks.length === 0) continue;
		
		// 在同一层级内，进一步分析文件冲突
		const subGroups = groupByFileConflicts(levelTasks);
		
		subGroups.forEach((subGroup, index) => {
			const groupId = `group-${groups.length}`;
			const canParallelize = subGroup.length > 1;
			
			// 计算组的依赖
			const groupDeps = new Set<string>();
			subGroup.forEach(task => {
				(task.dependencies || []).forEach(dep => {
					// 只包含不在当前组内的依赖
					if (!subGroup.find(t => t.id === dep)) {
						groupDeps.add(dep);
					}
				});
			});
			
			groups.push({
				id: groupId,
				tasks: subGroup,
				canParallelize,
				dependencies: Array.from(groupDeps)
			});
			
			subGroup.forEach(task => visited.add(task.id));
		});
	}
	
	return groups;
}

/**
 * 拓扑排序
 */
function topologicalSort(
	tasks: Task[],
	dependencyGraph: Map<string, string[]>
): string[][] {
	const levels: string[][] = [];
	const inDegree = new Map<string, number>();
	const taskMap = new Map(tasks.map(t => [t.id, t]));
	
	// 计算入度
	tasks.forEach(task => {
		inDegree.set(task.id, 0);
	});
	
	tasks.forEach(task => {
		const deps = dependencyGraph.get(task.id) || [];
		deps.forEach(dep => {
			if (taskMap.has(dep)) {
				inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
			}
		});
	});
	
	// 分层
	const remaining = new Set(tasks.map(t => t.id));
	
	while (remaining.size > 0) {
		const currentLevel: string[] = [];
		
		// 找出入度为 0 的任务
		for (const taskId of remaining) {
			if (inDegree.get(taskId) === 0) {
				currentLevel.push(taskId);
			}
		}
		
		if (currentLevel.length === 0) {
			// 存在循环依赖，将剩余任务放入一个层级
			levels.push(Array.from(remaining));
			break;
		}
		
		levels.push(currentLevel);
		
		// 移除当前层级的任务，更新入度
		currentLevel.forEach(taskId => {
			remaining.delete(taskId);
			
			// 更新依赖此任务的其他任务的入度
			tasks.forEach(task => {
				const deps = dependencyGraph.get(task.id) || [];
				if (deps.includes(taskId)) {
					inDegree.set(task.id, (inDegree.get(task.id) || 0) - 1);
				}
			});
		});
	}
	
	return levels;
}

/**
 * 按文件冲突分组
 */
function groupByFileConflicts(tasks: Task[]): Task[][] {
	if (tasks.length === 0) return [];
	if (tasks.length === 1) return [tasks];
	
	const groups: Task[][] = [];
	const assigned = new Set<string>();
	
	for (const task of tasks) {
		if (assigned.has(task.id)) continue;
		
		const group: Task[] = [task];
		assigned.add(task.id);
		
		// 找出可以与当前任务并行的其他任务
		for (const otherTask of tasks) {
			if (assigned.has(otherTask.id)) continue;
			
			// 检查是否与组内任何任务有文件冲突
			const hasConflict = group.some(t => hasFileConflict(t, otherTask));
			
			if (!hasConflict) {
				group.push(otherTask);
				assigned.add(otherTask.id);
			}
		}
		
		groups.push(group);
	}
	
	return groups;
}

/**
 * 生成执行计划
 */
export function generateExecutionPlan(tasks: Task[]): {
	groups: TaskGroup[];
	totalSteps: number;
	parallelSteps: number;
	estimatedSpeedup: number;
} {
	const groups = analyzeTaskGroups(tasks);
	const totalSteps = groups.length;
	const parallelSteps = groups.filter(g => g.canParallelize).length;
	
	// 估算加速比
	const totalTasks = tasks.length;
	const maxParallelism = Math.max(...groups.map(g => g.tasks.length));
	const estimatedSpeedup = totalTasks / (totalSteps + (maxParallelism - 1) * parallelSteps);
	
	return {
		groups,
		totalSteps,
		parallelSteps,
		estimatedSpeedup: Math.round(estimatedSpeedup * 100) / 100
	};
}

/**
 * 格式化执行计划
 */
export function formatExecutionPlan(plan: ReturnType<typeof generateExecutionPlan>): string {
	let output = "## Execution Plan\n\n";
	output += `**Total Steps**: ${plan.totalSteps}\n`;
	output += `**Parallel Steps**: ${plan.parallelSteps}\n`;
	output += `**Estimated Speedup**: ${plan.estimatedSpeedup}x\n\n`;
	
	plan.groups.forEach((group, index) => {
		output += `### Step ${index + 1}: ${group.id}\n`;
		output += `**Parallelizable**: ${group.canParallelize ? "Yes" : "No"}\n`;
		
		if (group.dependencies.length > 0) {
			output += `**Dependencies**: ${group.dependencies.join(", ")}\n`;
		}
		
		output += `**Tasks** (${group.tasks.length}):\n`;
		group.tasks.forEach(task => {
			output += `  - [${task.agent}] ${task.task.slice(0, 60)}${task.task.length > 60 ? "..." : ""}\n`;
		});
		output += "\n";
	});
	
	return output;
}
