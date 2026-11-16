#!/usr/bin/env bun
/**
 * model-prompt-injector 配置 CLI（bun 脚本）
 *
 * 用法：
 *   bun scripts/config-cli.ts show [cwd]
 *   bun scripts/config-cli.ts add <pattern> <mode> <file> [cwd]
 *   bun scripts/config-cli.ts remove <pattern> [cwd]
 *   bun scripts/config-cli.ts set-default <file> [cwd]
 *   bun scripts/config-cli.ts list-files [cwd]
 *
 * 所有写操作都做 JSON 校验与原子写入，避免手写 JSON 出错。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const DIR_NAME = "model-prompts";
const CONFIG_FILE = "config.json";

function baseDir(cwd: string): string {
	return join(cwd, ".pi", DIR_NAME);
}

function configPath(cwd: string): string {
	return join(baseDir(cwd), CONFIG_FILE);
}

function loadConfig(cwd: string): any {
	const p = configPath(cwd);
	if (!existsSync(p)) return { entries: [], default: [] };
	try {
		return JSON.parse(readFileSync(p, "utf-8"));
	} catch (e) {
		console.error("配置文件解析失败:", e);
		process.exit(1);
	}
}

function saveConfig(cwd: string, cfg: any): void {
	const dir = baseDir(cwd);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const p = configPath(cwd);
	const tmp = p + ".tmp";
	writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
	// 原子替换
	const { renameSync } = require("node:fs");
	renameSync(tmp, p);
}

function ensureArray(v: any): any[] {
	return Array.isArray(v) ? v : [];
}

const cmd = process.argv[2];
const cwd = process.argv[process.argv.length - 1] && existsSync(process.argv[process.argv.length - 1])
	? process.argv[process.argv.length - 1]
	: process.cwd();

// 修正：如果最后一个参数不是目录，则用 cwd
const lastArg = process.argv[process.argv.length - 1];
const resolvedCwd = existsSync(lastArg) && statSync(lastArg).isDirectory() ? lastArg : process.cwd();

switch (cmd) {
	case "show": {
		const cfg = loadConfig(resolvedCwd);
		console.log(JSON.stringify(cfg, null, 2));
		break;
	}
	case "add": {
		const pattern = process.argv[3];
		const mode = process.argv[4] ?? "exact";
		const file = process.argv[5];
		if (!pattern || !file) {
			console.error("用法: add <pattern> <mode> <file> [cwd]");
			process.exit(1);
		}
		const cfg = loadConfig(resolvedCwd);
		cfg.entries = ensureArray(cfg.entries);
		// 去重：同 pattern+mode 已存在则追加 file
		let rule = cfg.entries.find((r: any) => r.pattern === pattern && r.mode === mode);
		if (!rule) {
			rule = { pattern, mode, files: [] };
			cfg.entries.push(rule);
		}
		rule.files = ensureArray(rule.files);
		if (!rule.files.includes(file)) rule.files.push(file);
		saveConfig(resolvedCwd, cfg);
		console.log("OK: 已添加", pattern, mode, file);
		break;
	}
	case "remove": {
		const pattern = process.argv[3];
		if (!pattern) {
			console.error("用法: remove <pattern> [cwd]");
			process.exit(1);
		}
		const cfg = loadConfig(resolvedCwd);
		cfg.entries = ensureArray(cfg.entries).filter((r: any) => r.pattern !== pattern);
		saveConfig(resolvedCwd, cfg);
		console.log("OK: 已移除", pattern);
		break;
	}
	case "set-default": {
		const file = process.argv[3];
		if (!file) {
			console.error("用法: set-default <file> [cwd]");
			process.exit(1);
		}
		const cfg = loadConfig(resolvedCwd);
		cfg.default = ensureArray(cfg.default);
		if (!cfg.default.includes(file)) cfg.default.push(file);
		saveConfig(resolvedCwd, cfg);
		console.log("OK: 已设置 default", file);
		break;
	}
	case "list-files": {
		const dir = baseDir(resolvedCwd);
		if (!existsSync(dir)) {
			console.log("目录不存在:", dir);
			break;
		}
		const files: string[] = [];
		function walk(d: string, prefix: string) {
			for (const e of readdirSync(d)) {
				const full = join(d, e);
				const st = statSync(full);
				if (st.isDirectory()) walk(full, prefix ? prefix + "/" + e : e);
				else if (e.endsWith(".md") || e.endsWith(".json")) files.push(prefix ? prefix + "/" + e : e);
			}
		}
		walk(dir, "");
		for (const f of files) console.log(f);
		break;
	}
	default:
		console.log(`model-prompt-injector config CLI
用法:
  show [cwd]                                    显示当前配置
  add <pattern> <mode> <file> [cwd]              添加规则 (mode: exact|prefix|glob|regex)
  remove <pattern> [cwd]                         移除规则
  set-default <file> [cwd]                      添加到 default 列表
  list-files [cwd]                              列出目录下所有 md/json 文件

示例:
  bun scripts/config-cli.ts add "*deepseek*" glob prompts/zh.md
  bun scripts/config-cli.ts show
  bun scripts/config-cli.ts list-files`);
}
