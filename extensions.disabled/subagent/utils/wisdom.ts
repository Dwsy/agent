/**
 * Wisdom accumulation utilities (Three-tier architecture)
 * 
 * Supports three levels of wisdom:
 * 1. Session (memory) - temporary wisdom for current session
 * 2. Project (.pi/notepads/) - project-specific wisdom
 * 3. Global (~/.pi/agent/notepads/) - universal wisdom
 * 
 * Priority: Session > Project > Global
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { SingleResult } from "../types.js";

export type WisdomScope = "session" | "project" | "global";

export interface WisdomNote {
	type: "convention" | "success" | "failure" | "gotcha" | "command" | "decision";
	category: string;
	content: string;
	timestamp: string;
	agent?: string;
	task?: string;
	scope: WisdomScope;
}

// 全局智慧目录
const GLOBAL_NOTEPADS_DIR = path.join(os.homedir(), ".pi", "agent", "notepads");

// 会话智慧（内存中）
let sessionWisdom: WisdomNote[] = [];

/**
 * 获取项目智慧目录
 */
function getProjectNotepadsDir(cwd: string): string {
	return path.join(cwd, ".pi", "notepads");
}

/**
 * 获取智慧文件路径
 */
function getWisdomFilePath(scope: WisdomScope, cwd?: string): string {
	if (scope === "global") {
		return path.join(GLOBAL_NOTEPADS_DIR, "learnings.md");
	} else if (scope === "project" && cwd) {
		return path.join(getProjectNotepadsDir(cwd), "learnings.md");
	}
	throw new Error("Invalid scope or missing cwd for project scope");
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * 初始化项目智慧目录
 */
export function initProjectWisdom(cwd: string): void {
	const projectNotepadsDir = getProjectNotepadsDir(cwd);
	ensureDir(projectNotepadsDir);
	
	const files = [
		"learnings.md",
		"decisions.md",
		"issues.md",
		"verification.md",
		"problems.md"
	];
	
	files.forEach(file => {
		const filePath = path.join(projectNotepadsDir, file);
		if (!fs.existsSync(filePath)) {
			const title = file.replace(".md", "").charAt(0).toUpperCase() + file.replace(".md", "").slice(1);
			fs.writeFileSync(filePath, `# ${title}\n\n项目特定的${title}记录。\n\n---\n`);
		}
	});
}

/**
 * 从子代理输出中提取智慧
 */
export function extractWisdom(result: SingleResult, scope: WisdomScope = "session"): WisdomNote[] {
	const notes: WisdomNote[] = [];
	
	// 获取最终输出
	const output = getFinalOutput(result);
	if (!output) return notes;
	
	// 提取约定 (Convention)
	const conventionMatches = output.match(/(?:Convention|约定):\s*(.*?)(?:\n|$)/gi);
	conventionMatches?.forEach(match => {
		const content = match.replace(/(?:Convention|约定):\s*/i, "").trim();
		if (content) {
			notes.push({
				type: "convention",
				category: "patterns",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	// 提取成功经验 (Success)
	const successMatches = output.match(/(?:Success|成功|✅):\s*(.*?)(?:\n|$)/gi);
	successMatches?.forEach(match => {
		const content = match.replace(/(?:Success|成功|✅):\s*/i, "").trim();
		if (content) {
			notes.push({
				type: "success",
				category: "solutions",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	// 提取失败教训 (Failure)
	const failureMatches = output.match(/(?:Failure|失败|❌):\s*(.*?)(?:\n|$)/gi);
	failureMatches?.forEach(match => {
		const content = match.replace(/(?:Failure|失败|❌):\s*/i, "").trim();
		if (content) {
			notes.push({
				type: "failure",
				category: "pitfalls",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	// 提取陷阱 (Gotcha)
	const gotchaMatches = output.match(/(?:Gotcha|陷阱|⚠️):\s*(.*?)(?:\n|$)/gi);
	gotchaMatches?.forEach(match => {
		const content = match.replace(/(?:Gotcha|陷阱|⚠️):\s*/i, "").trim();
		if (content) {
			notes.push({
				type: "gotcha",
				category: "warnings",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	// 提取命令 (Command)
	const commandMatches = output.match(/(?:Command|命令):\s*`([^`]+)`/gi);
	commandMatches?.forEach(match => {
		const content = match.replace(/(?:Command|命令):\s*`/i, "").replace(/`$/, "").trim();
		if (content) {
			notes.push({
				type: "command",
				category: "commands",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	// 提取决策 (Decision)
	const decisionMatches = output.match(/(?:Decision|决策):\s*(.*?)(?:\n|$)/gi);
	decisionMatches?.forEach(match => {
		const content = match.replace(/(?:Decision|决策):\s*/i, "").trim();
		if (content) {
			notes.push({
				type: "decision",
				category: "architecture",
				content,
				timestamp: new Date().toISOString(),
				agent: result.agent,
				task: result.task,
				scope
			});
		}
	});
	
	return notes;
}

/**
 * 从消息中获取最终输出
 */
function getFinalOutput(result: SingleResult): string {
	if (!result.messages || result.messages.length === 0) return "";
	
	// 查找最后一条 assistant 消息
	for (let i = result.messages.length - 1; i >= 0; i--) {
		const msg = result.messages[i];
		if (msg.role === "assistant" && msg.content) {
			if (Array.isArray(msg.content)) {
				const textContent = msg.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n");
				return textContent;
			} else if (typeof msg.content === "string") {
				return msg.content;
			}
		}
	}
	
	return "";
}

/**
 * 加载全局智慧
 */
export function loadGlobalWisdom(): string {
	const learningsPath = path.join(GLOBAL_NOTEPADS_DIR, "learnings.md");
	
	if (!fs.existsSync(learningsPath)) return "";
	
	try {
		const content = fs.readFileSync(learningsPath, "utf-8");
		return extractWisdomContent(content);
	} catch (error) {
		console.error("Failed to load global wisdom:", error);
		return "";
	}
}

/**
 * 加载项目智慧
 */
export function loadProjectWisdom(cwd: string): string {
	const learningsPath = path.join(getProjectNotepadsDir(cwd), "learnings.md");
	
	if (!fs.existsSync(learningsPath)) return "";
	
	try {
		const content = fs.readFileSync(learningsPath, "utf-8");
		return extractWisdomContent(content);
	} catch (error) {
		console.error("Failed to load project wisdom:", error);
		return "";
	}
}

/**
 * 加载会话智慧
 */
export function loadSessionWisdom(): string {
	if (sessionWisdom.length === 0) return "";
	
	return sessionWisdom.map(note => {
		const emoji = {
			convention: "📋",
			success: "✅",
			failure: "❌",
			gotcha: "⚠️",
			command: "💻",
			decision: "🎯"
		}[note.type] || "📝";
		
		return `${emoji} ${note.content}`;
	}).join("\n");
}

/**
 * 加载所有智慧（按优先级合并）
 */
export function loadAllWisdom(cwd?: string): string {
	const global = loadGlobalWisdom();
	const project = cwd ? loadProjectWisdom(cwd) : "";
	const session = loadSessionWisdom();
	
	const sections: string[] = [];
	
	if (global) {
		sections.push("### 全局智慧 (Global Wisdom)\n\n" + global);
	}
	
	if (project) {
		sections.push("### 项目智慧 (Project Wisdom)\n\n" + project);
	}
	
	if (session) {
		sections.push("### 会话智慧 (Session Wisdom)\n\n" + session);
	}
	
	return sections.join("\n\n");
}

/**
 * 从文件内容中提取智慧条目
 */
function extractWisdomContent(content: string): string {
	const lines = content.split("\n");
	const wisdomLines: string[] = [];
	let inWisdomSection = false;
	
	for (const line of lines) {
		if (line.includes("## 智慧记录") || line.match(/^## [📋✅❌⚠️💻🎯]/)) {
			inWisdomSection = true;
			continue;
		}
		if (line.trim() === "---") {
			inWisdomSection = false;
			continue;
		}
		if (inWisdomSection && line.trim()) {
			wisdomLines.push(line);
		}
	}
	
	return wisdomLines.join("\n").trim();
}

/**
 * 追加智慧到会话
 */
export function appendSessionWisdom(notes: WisdomNote[]): void {
	sessionWisdom.push(...notes.filter(n => n.scope === "session"));
}

/**
 * 追加智慧到项目
 */
export function appendProjectWisdom(notes: WisdomNote[], cwd: string): void {
	if (notes.length === 0) return;
	
	const projectNotepadsDir = getProjectNotepadsDir(cwd);
	ensureDir(projectNotepadsDir);
	
	const learningsPath = path.join(projectNotepadsDir, "learnings.md");
	const content = formatWisdomNotes(notes.filter(n => n.scope === "project"));
	
	try {
		fs.appendFileSync(learningsPath, `\n${content}\n---\n`);
	} catch (error) {
		console.error("Failed to append project wisdom:", error);
	}
}

/**
 * 追加智慧到全局
 */
export function appendGlobalWisdom(notes: WisdomNote[]): void {
	if (notes.length === 0) return;
	
	ensureDir(GLOBAL_NOTEPADS_DIR);
	
	const learningsPath = path.join(GLOBAL_NOTEPADS_DIR, "learnings.md");
	const content = formatWisdomNotes(notes.filter(n => n.scope === "global"));
	
	try {
		fs.appendFileSync(learningsPath, `\n${content}\n---\n`);
	} catch (error) {
		console.error("Failed to append global wisdom:", error);
	}
}

/**
 * 追加智慧（根据作用域）
 */
export function appendWisdom(notes: WisdomNote[], cwd?: string): void {
	const sessionNotes = notes.filter(n => n.scope === "session");
	const projectNotes = notes.filter(n => n.scope === "project");
	const globalNotes = notes.filter(n => n.scope === "global");
	
	if (sessionNotes.length > 0) {
		appendSessionWisdom(sessionNotes);
	}
	
	if (projectNotes.length > 0 && cwd) {
		appendProjectWisdom(projectNotes, cwd);
	}
	
	if (globalNotes.length > 0) {
		appendGlobalWisdom(globalNotes);
	}
}

/**
 * 格式化智慧笔记
 */
function formatWisdomNotes(notes: WisdomNote[]): string {
	const timestamp = new Date().toISOString().split('T')[0];
	
	// 按类型分组
	const groupedNotes = notes.reduce((acc, note) => {
		if (!acc[note.type]) acc[note.type] = [];
		acc[note.type].push(note);
		return acc;
	}, {} as Record<string, WisdomNote[]>);
	
	// 生成内容
	return Object.entries(groupedNotes).map(([type, typeNotes]) => {
		const emoji = {
			convention: "📋",
			success: "✅",
			failure: "❌",
			gotcha: "⚠️",
			command: "💻",
			decision: "🎯"
		}[type] || "📝";
		
		const typeTitle = {
			convention: "Convention",
			success: "Success",
			failure: "Failure",
			gotcha: "Gotcha",
			command: "Command",
			decision: "Decision"
		}[type] || type;
		
		return typeNotes.map(note => {
			let noteText = `## ${emoji} ${typeTitle} (${note.category})\n`;
			noteText += `**Date**: ${timestamp}\n`;
			noteText += `**Scope**: ${note.scope}\n`;
			if (note.agent) noteText += `**Agent**: ${note.agent}\n`;
			if (note.task) noteText += `**Task**: ${note.task.slice(0, 100)}${note.task.length > 100 ? "..." : ""}\n`;
			noteText += `\n${note.content}\n`;
			return noteText;
		}).join("\n");
	}).join("\n");
}

/**
 * 格式化智慧用于注入到代理提示
 */
export function formatWisdomForPrompt(wisdom: string, maxLength: number = 2000): string {
	if (!wisdom) return "";
	
	// 截断过长的智慧
	if (wisdom.length > maxLength) {
		wisdom = wisdom.slice(-maxLength);
		// 找到第一个完整的条目开始位置
		const firstHeader = wisdom.indexOf("###");
		if (firstHeader > 0) {
			wisdom = wisdom.slice(firstHeader);
		}
	}
	
	return `## 累积智慧 (Accumulated Wisdom)

以下是从之前的任务中提取的学习、模式和经验。请遵循这些约定和最佳实践：

${wisdom}

**优先级**: 会话智慧 > 项目智慧 > 全局智慧

---
`;
}

/**
 * 获取智慧统计
 */
export function getWisdomStats(cwd?: string): {
	session: { totalNotes: number; byType: Record<string, number> };
	project: { totalNotes: number; byType: Record<string, number>; lastUpdate: string | null };
	global: { totalNotes: number; byType: Record<string, number>; lastUpdate: string | null };
} {
	// 会话统计
	const sessionByType = sessionWisdom.reduce((acc, note) => {
		acc[note.type] = (acc[note.type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);
	
	// 项目统计
	let projectStats = { totalNotes: 0, byType: {}, lastUpdate: null };
	if (cwd) {
		const projectPath = path.join(getProjectNotepadsDir(cwd), "learnings.md");
		if (fs.existsSync(projectPath)) {
			projectStats = getFileStats(projectPath);
		}
	}
	
	// 全局统计
	const globalPath = path.join(GLOBAL_NOTEPADS_DIR, "learnings.md");
	const globalStats = fs.existsSync(globalPath) ? getFileStats(globalPath) : { totalNotes: 0, byType: {}, lastUpdate: null };
	
	return {
		session: {
			totalNotes: sessionWisdom.length,
			byType: sessionByType
		},
		project: projectStats,
		global: globalStats
	};
}

/**
 * 获取文件统计
 */
function getFileStats(filePath: string): {
	totalNotes: number;
	byType: Record<string, number>;
	lastUpdate: string | null;
} {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const stats = fs.statSync(filePath);
		
		const byType: Record<string, number> = {
			convention: (content.match(/## 📋 Convention/g) || []).length,
			success: (content.match(/## ✅ Success/g) || []).length,
			failure: (content.match(/## ❌ Failure/g) || []).length,
			gotcha: (content.match(/## ⚠️ Gotcha/g) || []).length,
			command: (content.match(/## 💻 Command/g) || []).length,
			decision: (content.match(/## 🎯 Decision/g) || []).length,
		};
		
		const totalNotes = Object.values(byType).reduce((sum, count) => sum + count, 0);
		
		return {
			totalNotes,
			byType,
			lastUpdate: stats.mtime.toISOString()
		};
	} catch (error) {
		return { totalNotes: 0, byType: {}, lastUpdate: null };
	}
}

/**
 * 清除会话智慧
 */
export function clearSessionWisdom(): void {
	sessionWisdom = [];
}

/**
 * 获取会话智慧（用于保存提示）
 */
export function getSessionWisdomNotes(): WisdomNote[] {
	return [...sessionWisdom];
}

/**
 * 将会话智慧保存到项目或全局
 */
export function saveSessionWisdomTo(scope: "project" | "global", cwd?: string): void {
	if (sessionWisdom.length === 0) return;
	
	// 修改作用域
	const notes = sessionWisdom.map(note => ({ ...note, scope }));
	
	if (scope === "project" && cwd) {
		appendProjectWisdom(notes, cwd);
	} else if (scope === "global") {
		appendGlobalWisdom(notes);
	}
	
	// 清除会话智慧
	clearSessionWisdom();
}
