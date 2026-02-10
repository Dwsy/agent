/**
 * TODO monitoring utilities
 * 
 * Monitors TODO items in agent output and enforces completion.
 */

export interface TodoItem {
	text: string;
	completed: boolean;
	line?: number;
}

/**
 * 从内容中提取 TODO 项
 */
export function extractTodos(content: string): TodoItem[] {
	const todos: TodoItem[] = [];
	
	// 匹配 - [ ] 和 - [x] 格式
	const lines = content.split('\n');
	
	lines.forEach((line, index) => {
		// 匹配 Markdown TODO 格式
		const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.+)$/);
		if (match) {
			const completed = match[2].toLowerCase() === 'x';
			const text = match[3].trim();
			
			todos.push({
				text,
				completed,
				line: index + 1
			});
		}
	});
	
	return todos;
}

/**
 * 检查是否有未完成的 TODO
 */
export function hasIncompleteTodos(content: string): boolean {
	const todos = extractTodos(content);
	return todos.some(t => !t.completed);
}

/**
 * 获取未完成的 TODO 数量
 */
export function getIncompleteTodoCount(content: string): number {
	const todos = extractTodos(content);
	return todos.filter(t => !t.completed).length;
}

/**
 * 获取未完成的 TODO 列表
 */
export function getIncompleteTodos(content: string): TodoItem[] {
	const todos = extractTodos(content);
	return todos.filter(t => !t.completed);
}

/**
 * 获取已完成的 TODO 列表
 */
export function getCompletedTodos(content: string): TodoItem[] {
	const todos = extractTodos(content);
	return todos.filter(t => t.completed);
}

/**
 * 计算 TODO 完成率
 */
export function getTodoCompletionRate(content: string): number {
	const todos = extractTodos(content);
	if (todos.length === 0) return 1.0;
	
	const completed = todos.filter(t => t.completed).length;
	return completed / todos.length;
}

/**
 * 生成 TODO 提醒消息
 */
export function generateTodoReminder(content: string): string | null {
	const incompleteTodos = getIncompleteTodos(content);
	
	if (incompleteTodos.length === 0) {
		return null;
	}
	
	let reminder = "\n\n---\n\n";
	reminder += "## ⚠️ TODO 强制完成提醒\n\n";
	reminder += `你有 **${incompleteTodos.length}** 个未完成的 TODO！\n\n`;
	reminder += "**未完成的 TODO：**\n\n";
	
	incompleteTodos.forEach((todo, index) => {
		reminder += `${index + 1}. [ ] ${todo.text}\n`;
	});
	
	reminder += "\n**重要：**\n";
	reminder += "- 你必须完成所有 TODO 才能结束任务\n";
	reminder += "- 不要在未完成所有 TODO 时返回结果\n";
	reminder += "- 将每个 TODO 标记为 `[x]` 表示完成\n";
	reminder += "\n继续完成剩余的 TODO！\n";
	
	return reminder;
}

/**
 * 格式化 TODO 统计
 */
export function formatTodoStats(content: string): string {
	const todos = extractTodos(content);
	const completed = getCompletedTodos(content);
	const incomplete = getIncompleteTodos(content);
	const rate = getTodoCompletionRate(content);
	
	let stats = "## TODO 统计\n\n";
	stats += `- **总数**: ${todos.length}\n`;
	stats += `- **已完成**: ${completed.length}\n`;
	stats += `- **未完成**: ${incomplete.length}\n`;
	stats += `- **完成率**: ${(rate * 100).toFixed(1)}%\n`;
	
	if (incomplete.length > 0) {
		stats += "\n**未完成的 TODO：**\n\n";
		incomplete.forEach((todo, index) => {
			stats += `${index + 1}. [ ] ${todo.text}\n`;
		});
	}
	
	return stats;
}

/**
 * 验证 TODO 是否全部完成
 */
export function validateTodoCompletion(content: string): {
	valid: boolean;
	message: string;
	incompleteTodos: TodoItem[];
} {
	const incompleteTodos = getIncompleteTodos(content);
	
	if (incompleteTodos.length === 0) {
		return {
			valid: true,
			message: "✅ 所有 TODO 已完成",
			incompleteTodos: []
		};
	}
	
	return {
		valid: false,
		message: `❌ 还有 ${incompleteTodos.length} 个未完成的 TODO`,
		incompleteTodos
	};
}

/**
 * 检查内容是否包含 TODO
 */
export function hasTodos(content: string): boolean {
	const todos = extractTodos(content);
	return todos.length > 0;
}

/**
 * 生成 TODO 进度条
 */
export function generateTodoProgressBar(content: string, width: number = 20): string {
	const rate = getTodoCompletionRate(content);
	const completed = Math.floor(rate * width);
	const remaining = width - completed;
	
	const bar = '█'.repeat(completed) + '░'.repeat(remaining);
	const percentage = (rate * 100).toFixed(1);
	
	return `[${bar}] ${percentage}%`;
}
