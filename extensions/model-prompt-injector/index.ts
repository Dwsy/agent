/**
 * Model Prompt Injector
 *
 * 根据当前模型名称，按配置把独立的 md 提示词文件渐进式注入到系统提示词。
 * - 配置与 md 文件放在项目 .pi/model-prompts/ 目录
 * - config.json 定义匹配规则（exact / prefix / glob / regex），支持多文件、多规则叠加
 * - files 支持 glob 展开（基于 Bun.Glob）
 * - 仅在 session_start / model_select 时读取 md（渐进式，不预加载）
 * - before_agent_start 时 append 一次，符合提示词缓存（不修改 base systemPrompt）
 * - 提供 /model-prompt 斜杠命令，向 agent 注入配置指南与当前模型信息
 * - 不注册任何 tool；配置写入通过插件内 bun 脚本 scripts/config-cli.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

interface Rule {
	pattern: string;
	mode?: "exact" | "prefix" | "glob" | "regex";
	files?: string[];
}

interface Config {
	version?: number;
	entries?: Rule[];
	default?: string[];
}

const DIR_NAME = "model-prompts";
const CONFIG_FILE = "config.json";
const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(EXT_DIR, "scripts", "config-cli.ts");

function configDir(cwd: string): string {
	return join(cwd, ".pi", DIR_NAME);
}

function loadConfig(cwd: string): Config {
	const path = join(configDir(cwd), CONFIG_FILE);
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Config;
	} catch {
		return {};
	}
}

function modelKeys(ctx: ExtensionContext): string[] {
	const m = ctx.model;
	if (!m) return [];
	return [`${m.provider}/${m.id}`, m.id];
}

function matchPattern(pattern: string, mode: Rule["mode"], value: string): boolean {
	const m = mode ?? "exact";
	switch (m) {
		case "exact":
			return pattern.toLowerCase() === value.toLowerCase();
		case "prefix":
			return value.toLowerCase().startsWith(pattern.toLowerCase());
		case "glob": {
			const re = new RegExp(
				"^" +
					pattern
						.replace(/[.+^${}()|[\]\\]/g, "\\$&")
						.replace(/\*/g, ".*")
						.replace(/\?/g, ".") +
					"$",
				"i",
			);
			return re.test(value);
		}
		case "regex":
			try {
				return new RegExp(pattern, "i").test(value);
			} catch {
				return false;
			}
		default:
			return false;
	}
}

function expandGlob(baseDir: string, spec: string): string[] {
	if (isAbsolute(spec) || (!spec.includes("*") && !spec.includes("?"))) {
		return [spec];
	}
	const out: string[] = [];
	try {
		const glob = new (Bun as any).Glob(spec);
		for (const rel of glob.scanSync({ cwd: baseDir })) {
			const full = join(baseDir, rel);
			try {
				const st = (require("node:fs") as any).statSync(full);
				if (st.isFile()) out.push(rel);
			} catch {
				/* skip */
			}
		}
	} catch {
		out.push(spec);
	}
	return out.length ? out : [spec];
}

function resolveFileSpecs(cwd: string, specs: string[]): string[] {
	const base = configDir(cwd);
	const result: string[] = [];
	const seen = new Set<string>();
	for (const spec of specs) {
		const expanded = expandGlob(base, spec);
		for (const rel of expanded) {
			if (seen.has(rel)) continue;
			seen.add(rel);
			result.push(rel);
		}
	}
	return result;
}

function resolveFiles(cwd: string, config: Config, keys: string[]): string[] {
	const matched: string[] = [];
	const seenSpec = new Set<string>();
	const entries = config.entries ?? [];
	for (const rule of entries) {
		const hit = keys.some((k) => matchPattern(rule.pattern, rule.mode, k));
		if (hit && rule.files) {
			for (const f of rule.files) {
				if (seenSpec.has(f)) continue;
				seenSpec.add(f);
				matched.push(f);
			}
		}
	}
	if (matched.length === 0 && config.default) {
		for (const f of config.default) {
			if (seenSpec.has(f)) continue;
			seenSpec.add(f);
			matched.push(f);
		}
	}
	return resolveFileSpecs(cwd, matched);
}

function readPromptFile(cwd: string, file: string): string {
	const base = configDir(cwd);
	const path = isAbsolute(file) ? file : join(base, file);
	if (!existsSync(path)) return "";
	try {
		return readFileSync(path, "utf-8").trim();
	} catch {
		return "";
	}
}

function computeFrozen(cwd: string, keys: string[]): string {
	const config = loadConfig(cwd);
	const files = resolveFiles(cwd, config, keys);
	const parts: string[] = [];
	const seenContent = new Set<string>();
	for (const f of files) {
		const content = readPromptFile(cwd, f);
		if (content && !seenContent.has(content)) {
			seenContent.add(content);
			parts.push(content);
		}
	}
	return parts.join("\n\n");
}

const GUIDE = `# model-prompt-injector 配置指南

## 目录结构
\`\`\`
.pi/model-prompts/
├── config.json          # 匹配规则配置（请用 bun 脚本编辑，勿手写）
└── prompts/
    ├── deepseek-zh.md   # 提示词 md 文件
    └── ...
\`\`\`

## config.json 结构
\`\`\`json
{
  "entries": [
    {
      "pattern": "*deepseek*",
      "mode": "glob",
      "files": ["prompts/deepseek-zh.md", "prompts/shared.md"]
    }
  ],
  "default": ["prompts/base.md"]
}
\`\`\`

## 匹配模式 (mode)
- exact: 模型 id 完全相等
- prefix: 模型 id 以 pattern 开头
- glob: 支持 * 和 ? 通配符
- regex: 正则表达式

## 多文件
files 数组支持多个 md 文件，按顺序追加注入；支持 glob 展开（如 "prompts/*.md"）。

## 配置 CLI（bun 脚本，避免手写 JSON 出错）
脚本路径: EXT_DIR/scripts/config-cli.ts
\`\`\`
bun EXT_DIR/scripts/config-cli.ts show [cwd]                          # 显示配置
bun EXT_DIR/scripts/config-cli.ts add <pattern> <mode> <file> [cwd]    # 添加规则
bun EXT_DIR/scripts/config-cli.ts remove <pattern> [cwd]               # 移除规则
bun EXT_DIR/scripts/config-cli.ts set-default <file> [cwd]             # 添加到 default
bun EXT_DIR/scripts/config-cli.ts list-files [cwd]                     # 列出目录文件
\`\`\`
将 EXT_DIR 替换为插件实际目录。

## 当前模型
由 ctx.model 提供 provider/id；环境变量 PI_MODEL 也可参考。
`;

export default function modelPromptInjector(pi: ExtensionAPI): void {
	let frozenSystemPrompt = "";
	let lastModelKey = "";
	let injectedThisTurn = false;

	const recompute = (ctx: ExtensionContext) => {
		const keys = modelKeys(ctx);
		const key = keys.join("|");
		if (key === lastModelKey) return;
		lastModelKey = key;
		frozenSystemPrompt = computeFrozen(ctx.cwd, keys);
	};

	pi.on("session_start", async (_event, ctx) => {
		frozenSystemPrompt = "";
		lastModelKey = "";
		recompute(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		recompute(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!frozenSystemPrompt) return;
		if (injectedThisTurn) return;
		injectedThisTurn = true;
		if (event.systemPrompt.includes(frozenSystemPrompt)) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${frozenSystemPrompt}` };
	});

	pi.on("agent_end", async () => {
		injectedThisTurn = false;
	});

	pi.registerCommand("model-prompt", {
		description: "显示 model-prompt-injector 配置指南与当前模型信息",
		handler: async (_args, ctx) => {
			const m = ctx.model;
			const modelInfo = m
				? `当前模型: ${m.provider}/${m.id}`
				: `当前模型: 未知 (PI_MODEL=${process.env.PI_MODEL ?? "unset"})`;
			const configPath = join(configDir(ctx.cwd), CONFIG_FILE);
			const hasConfig = existsSync(configPath);
			const msg = [
				GUIDE.replace(/EXT_DIR/g, EXT_DIR),
				"",
				"---",
				modelInfo,
				`配置文件: ${configPath} (${hasConfig ? "已存在" : "不存在"})`,
				`CLI 脚本: ${CLI_PATH}`,
				"",
				"请根据以上指南与当前模型信息，帮助用户配置 .pi/model-prompts/config.json。",
				"写入配置时务必使用 bun 脚本 scripts/config-cli.ts，不要手写 JSON。",
			].join("\n");
			ctx.ui.notify("model-prompt-injector: 配置指南已注入", "info");
			// 注入为 user message，触发 agent 帮助配置
			pi.sendUserMessage(msg);
		},
	});
}
