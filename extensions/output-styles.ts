/**
 * Output Styles Extension (Single File Mode)
 *
 * @auth dwsy
 *
 * Markdown-based output style system with YAML frontmatter config.
 *
 * Structure:
 * - Global: ~/.pi/agent/output-styles/<style-name>.md
 * - Project: .pi/output-styles/<style-name>.md
 *
 * File format:
 * ---
 * name: style-name
 * description: Style description
 * icon: "🌸"
 * features:
 *   emoji: true
 *   mermaid: false
 * personality:
 *   tone: friendly
 * behavior:
 *   stepByStep: true
 * ---
 * Custom prompt content with template syntax...
 *
 * Template syntax:
 * - {{#if features.emoji}}...{{/if}}
 * - {{#unless features.mermaid}}...{{/unless}}
 * - {{personality.tone}}
 *
 * Commands:
 * - /output-style [name]     - Switch style
 * - /output-style:new        - Create new style
 * - /output-style:toggle     - Feature toggle panel
 *
 * Shortcuts:
 * - Alt+G / ⌥+G - Select global style
 * - Alt+P / ⌥+P - Select project style
 * - Alt+T / ⌥+T - Feature toggle panel
 *
 * @module output-styles
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, basename } from "node:path";
import * as YAML from "yaml";
import {
	DynamicBorder,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	getSelectListTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Spacer, Text, Key, matchesKey } from "@mariozechner/pi-tui";

// ============================================================================
// Types
// ============================================================================

type OutputStyleSource = "built-in" | "global" | "project";

interface StyleFeatures {
	sendImage?: boolean;
	emoji?: boolean;
	mermaid?: boolean;
	asciiArt?: boolean;
	tableFormat?: boolean;
	codeHighlight?: boolean;
	markdownStrict?: boolean;
	stepByStep?: boolean;
}

interface StylePersonality {
	tone?: "formal" | "casual" | "friendly" | "technical" | "playful";
	energy?: "low" | "medium" | "high";
	humorLevel?: "none" | "subtle" | "moderate" | "high";
	directness?: number;
	creativity?: number;
}

interface StyleBehavior {
	pauseBeforeCode?: boolean;
	askClarify?: boolean;
	explainReasoning?: boolean;
	summarizeKeyPoints?: boolean;
	selfCorrect?: boolean;
	showConfidence?: boolean;
}

interface StyleConfig {
	name: string;
	description?: string;
	icon?: string;
	tags?: string[];
	language?: string;
	features?: StyleFeatures;
	personality?: StylePersonality;
	behavior?: StyleBehavior;
	greeting?: string;
	farewell?: string;
	keepCodingInstructions?: boolean;
}

interface OutputStyleDefinition {
	name: string;
	source: OutputStyleSource;
	config: StyleConfig;
	prompt: string;
	path: string;
}

// ============================================================================
// Constants
// ============================================================================

const OUTPUT_STYLE_ENTRY_TYPE = "output-style";
const OUTPUT_STYLES_DIR_NAME = "output-styles";
const ACTIVE_STYLE_FILE = "active.json";
const MAX_SELECT_LIST_ITEMS = 10;

// Toggle definitions
const FEATURE_TOGGLES: Array<{ key: keyof StyleFeatures; label: string; icon: string }> = [
	{ key: "sendImage", label: "Image Sending", icon: "🖼️" },
	{ key: "emoji", label: "Emojis", icon: "😀" },
	{ key: "mermaid", label: "Mermaid Diagrams", icon: "📊" },
	{ key: "asciiArt", label: "ASCII Art", icon: "🎨" },
	{ key: "tableFormat", label: "Table Formatting", icon: "📋" },
	{ key: "codeHighlight", label: "Code Highlight", icon: "🎯" },
	{ key: "markdownStrict", label: "Strict Markdown", icon: "📝" },
	{ key: "stepByStep", label: "Step by Step", icon: "🔢" },
];

const BEHAVIOR_TOGGLES: Array<{ key: keyof StyleBehavior; label: string; icon: string }> = [
	{ key: "pauseBeforeCode", label: "Pause Before Code", icon: "⏸️" },
	{ key: "askClarify", label: "Ask Clarify", icon: "❓" },
	{ key: "explainReasoning", label: "Explain Reasoning", icon: "💭" },
	{ key: "summarizeKeyPoints", label: "Summarize Points", icon: "📌" },
	{ key: "selfCorrect", label: "Self Correct", icon: "🔄" },
	{ key: "showConfidence", label: "Show Confidence", icon: "🎯" },
];

const PERSONALITY_TOGGLES: Array<{ key: keyof StylePersonality; label: string; type: "select" | "slider"; options?: string[] }> = [
	{ key: "tone", label: "Tone", type: "select", options: ["formal", "casual", "friendly", "technical", "playful"] },
	{ key: "energy", label: "Energy", type: "select", options: ["low", "medium", "high"] },
	{ key: "humorLevel", label: "Humor", type: "select", options: ["none", "subtle", "moderate", "high"] },
	{ key: "directness", label: "Directness", type: "slider" },
	{ key: "creativity", label: "Creativity", type: "slider" },
];

// ============================================================================
// Built-in Styles
// ============================================================================

const BUILTIN_STYLES: OutputStyleDefinition[] = [
	{
		name: "default",
		source: "built-in",
		config: {
			name: "default",
			description: "Efficient coding assistant with concise responses",
			keepCodingInstructions: true,
			features: { emoji: true, codeHighlight: true },
			personality: { tone: "technical", energy: "medium", directness: 8 },
			behavior: { explainReasoning: true },
		},
		prompt: "",
		path: "",
	},
	{
		name: "explanatory",
		source: "built-in",
		config: {
			name: "explanatory",
			description: "Explains implementation choices clearly",
			keepCodingInstructions: true,
			features: { codeHighlight: true },
			personality: { tone: "friendly", energy: "medium", directness: 6 },
			behavior: { explainReasoning: true, summarizeKeyPoints: true },
		},
		prompt: "Explain your reasoning and decisions clearly.\nProvide structured explanations with headers and bullet points.",
		path: "",
	},
	{
		name: "learning",
		source: "built-in",
		config: {
			name: "learning",
			description: "Tutor style - pauses for hands-on practice",
			icon: "📚",
			keepCodingInstructions: true,
			features: { emoji: true, codeHighlight: true },
			personality: { tone: "friendly", humorLevel: "subtle" },
			behavior: { pauseBeforeCode: true, askClarify: true, summarizeKeyPoints: true },
		},
		prompt: "Act as a helpful tutor.\nExplain key concepts before diving into code.\nPause and ask user to write small pieces for practice.",
		path: "",
	},
	{
		name: "coding-vibes",
		source: "built-in",
		config: {
			name: "coding-vibes",
			description: "Energetic, casual coding buddy",
			icon: "⚡",
			keepCodingInstructions: true,
			features: { emoji: true, codeHighlight: true, asciiArt: true },
			personality: { tone: "playful", energy: "high", humorLevel: "moderate", creativity: 7 },
			behavior: { explainReasoning: true },
		},
		prompt: "You're an energetic coding buddy.\nKeep responses upbeat and encouraging.\nUse emojis sparingly but effectively.",
		path: "",
	},
	{
		name: "architect",
		source: "built-in",
		config: {
			name: "architect",
			description: "Structural thinking with architectural clarity",
			icon: "🏗️",
			keepCodingInstructions: true,
			features: { codeHighlight: true, mermaid: true, tableFormat: true },
			personality: { tone: "technical", energy: "medium", directness: 9 },
			behavior: { explainReasoning: true, showConfidence: true },
		},
		prompt: "Approach problems with structural thinking.\nAlways consider foundations, layers, and clean interfaces.\nUse diagrams to illustrate architecture.",
		path: "",
	},
];

// ============================================================================
// Helper Functions
// ============================================================================

function getOutputStylesDir(cwd: string): string {
	return join(cwd, ".pi", OUTPUT_STYLES_DIR_NAME);
}

function getGlobalOutputStylesDir(): string {
	return join(homedir(), ".pi", "agent", OUTPUT_STYLES_DIR_NAME);
}

function getActiveStylePath(cwd: string): string {
	return join(getOutputStylesDir(cwd), ACTIVE_STYLE_FILE);
}

function getGlobalActiveStylePath(): string {
	return join(getGlobalOutputStylesDir(), ACTIVE_STYLE_FILE);
}

function loadActiveStyleFromPath(activePath: string): string | undefined {
	if (!existsSync(activePath)) return undefined;
	try {
		const content = readFileSync(activePath, "utf-8");
		const parsed = JSON.parse(content) as { name?: string };
		return parsed?.name?.trim() || undefined;
	} catch {
		return undefined;
	}
}

function getActiveStyleSelections(cwd: string) {
	const project = loadActiveStyleFromPath(getActiveStylePath(cwd));
	const global = loadActiveStyleFromPath(getGlobalActiveStylePath());
	const effective = project || global || "default";
	return { project, global, effective };
}

function resolveActiveStyleName(cwd: string): string {
	const candidate = getActiveStyleSelections(cwd).effective;
	return candidate && findOutputStyle(cwd, candidate) ? candidate : "default";
}

function saveActiveStyle(cwd: string, name: string, scope: "global" | "project"): void {
	const stylesDir = scope === "project" ? getOutputStylesDir(cwd) : getGlobalOutputStylesDir();
	const activePath = scope === "project" ? getActiveStylePath(cwd) : getGlobalActiveStylePath();
	if (!existsSync(stylesDir)) mkdirSync(stylesDir, { recursive: true });
	writeFileSync(activePath, JSON.stringify({ name }, null, 2), "utf-8");
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content };
	try {
		const frontmatter = YAML.parse(match[1]);
		return { frontmatter: frontmatter || {}, body: match[2] || "" };
	} catch {
		return { frontmatter: {}, body: content };
	}
}

function parseStyleFile(filePath: string, source: OutputStyleSource): OutputStyleDefinition | undefined {
	try {
		const content = readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(content);

		const name = (frontmatter.name as string) || basename(filePath, ".md");
		if (!name) return undefined;

		const config: StyleConfig = {
			name,
			description: frontmatter.description as string | undefined,
			icon: frontmatter.icon as string | undefined,
			tags: frontmatter.tags as string[] | undefined,
			language: frontmatter.language as string | undefined,
			keepCodingInstructions: frontmatter.keepCodingInstructions as boolean | undefined,
			features: frontmatter.features as StyleFeatures | undefined,
			personality: frontmatter.personality as StylePersonality | undefined,
			behavior: frontmatter.behavior as StyleBehavior | undefined,
			greeting: frontmatter.greeting as string | undefined,
			farewell: frontmatter.farewell as string | undefined,
		};

		return {
			name: config.name,
			source,
			config,
			prompt: body.trim(),
			path: filePath,
		};
	} catch (error) {
		console.error(`Failed to parse style file ${filePath}: ${error}`);
		return undefined;
	}
}

function loadStylesFromDir(dir: string, source: OutputStyleSource): OutputStyleDefinition[] {
	if (!existsSync(dir)) return [];
	try {
		const entries = readdirSync(dir);
		return entries
			.filter((entry) => entry.endsWith(".md"))
			.map((entry) => parseStyleFile(join(dir, entry), source))
			.filter((s): s is OutputStyleDefinition => s !== undefined);
	} catch (error) {
		console.error(`Failed to read styles directory ${dir}: ${error}`);
		return [];
	}
}

function loadAllStyles(cwd: string): OutputStyleDefinition[] {
	const styles = new Map<string, OutputStyleDefinition>();
	for (const style of BUILTIN_STYLES) styles.set(style.name, style);
	for (const style of loadStylesFromDir(getGlobalOutputStylesDir(), "global")) styles.set(style.name, style);
	for (const style of loadStylesFromDir(getOutputStylesDir(cwd), "project")) styles.set(style.name, style);
	return Array.from(styles.values());
}

function findOutputStyle(cwd: string, name: string): OutputStyleDefinition | undefined {
	return loadAllStyles(cwd).find((s) => s.name === name);
}

function normalizeStyleName(rawName: string): { name: string; normalized: boolean } | { error: string } {
	if (!rawName?.trim()) return { error: "Invalid input: name must be a non-empty string." };
	const trimmed = rawName.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
	if (!trimmed) return { error: "Invalid name. Use letters, numbers, and hyphens." };
	if (trimmed.length > 64) return { error: "Name is too long. Maximum 64 characters allowed." };
	return { name: trimmed, normalized: trimmed !== rawName.trim().toLowerCase() };
}

// ============================================================================
// Template Engine
// ============================================================================

interface TemplateContext {
	features: Record<string, boolean | number | string | undefined>;
	personality: Record<string, unknown>;
	behavior: Record<string, unknown>;
}

function buildTemplateContext(style: OutputStyleDefinition): TemplateContext {
	return {
		features: (style.config.features || {}) as Record<string, boolean | number | string | undefined>,
		personality: (style.config.personality || {}) as Record<string, unknown>,
		behavior: (style.config.behavior || {}) as Record<string, unknown>,
	};
}

function renderTemplate(template: string, context: TemplateContext): string {
	let result = template;
	// {{#if path}}...{{/if}}
	result = result.replace(/{{#if\s+(\w+(?:\.\w+)*)\s*}}([\s\S]*?){{\/if\s*}}/g, (_, path, content) => {
		const value = getNestedValue(context, path);
		return value ? content : "";
	});
	// {{#unless path}}...{{/unless}}
	result = result.replace(/{{#unless\s+(\w+(?:\.\w+)*)\s*}}([\s\S]*?){{\/unless\s*}}/g, (_, path, content) => {
		const value = getNestedValue(context, path);
		return !value ? content : "";
	});
	// {{path}} - inline value
	result = result.replace(/{{(\w+(?:\.\w+)*)}}/g, (_, path) => {
		const value = getNestedValue(context, path);
		return value !== undefined ? String(value) : "";
	});
	return result.trim();
}

function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

// ============================================================================
// Style Prompt Generation
// ============================================================================

function generateStyleSystemPrompt(style: OutputStyleDefinition): string {
	const parts: string[] = [];
	const { config, prompt } = style;
	const ctx = buildTemplateContext(style);

	if (config.icon) {
		parts.push(`${config.icon} ${config.name.toUpperCase()} MODE`);
	} else {
		parts.push(`## Output Style: ${config.name}`);
	}

	if (config.description) parts.push(config.description);

	if (config.personality) {
		const p = config.personality;
		const traits: string[] = [];
		if (p.tone) traits.push(`Tone: ${p.tone}`);
		if (p.energy) traits.push(`Energy: ${p.energy}`);
		if (p.humorLevel && p.humorLevel !== "none") traits.push(`Humor: ${p.humorLevel}`);
		if (p.directness) traits.push(`Directness: ${p.directness}/10`);
		if (p.creativity) traits.push(`Creativity: ${p.creativity}/10`);
		if (traits.length) parts.push("\n**Personality:** " + traits.join(" · "));
	}

	if (config.features) {
		const f = config.features;
		const enabled: string[] = [];
		if (f.sendImage) enabled.push("🖼️ image sending");
		if (f.emoji) enabled.push("😀 emojis");
		if (f.mermaid) enabled.push("📊 Mermaid diagrams");
		if (f.asciiArt) enabled.push("🎨 ASCII art");
		if (f.tableFormat) enabled.push("📋 tables");
		if (enabled.length) parts.push("\n**Enabled:** " + enabled.join(", "));
	}

	if (config.behavior) {
		const b = config.behavior;
		const behaviors: string[] = [];
		if (config.features?.stepByStep) behaviors.push("step-by-step");
		if (b.askClarify) behaviors.push("ask clarifying questions");
		if (b.explainReasoning) behaviors.push("explain reasoning");
		if (b.summarizeKeyPoints) behaviors.push("summarize key points");
		if (b.pauseBeforeCode) behaviors.push("pause before code");
		if (b.selfCorrect) behaviors.push("self-correct");
		if (behaviors.length) parts.push("\n**Behavior:** " + behaviors.join(" · "));
	}

	// Render template in prompt
	if (prompt) {
		const rendered = renderTemplate(prompt, ctx);
		if (rendered) parts.push("\n" + rendered);
	}

	if (config.greeting) parts.push(`\n**Greeting:** ${config.greeting}`);
	if (config.farewell) parts.push(`\n**Farewell:** ${config.farewell}`);
	if (!config.keepCodingInstructions) parts.push("\n*Note: Ignore prior coding-style instructions.*");

	return parts.join("\n\n");
}

// ============================================================================
// UI Helpers
// ============================================================================

function getStyleBadge(style: OutputStyleDefinition, theme: any): string {
	const badge = { builtin: theme.fg("dim", "[builtin]"), global: theme.fg("accent", "[user]"), project: theme.fg("success", "[local]") }[style.source];
	return style.config.icon ? `${style.config.icon} ${badge}` : badge;
}

function getStyleStatusBadge(name: string, selections: ReturnType<typeof getActiveStyleSelections>, theme: any): string | undefined {
	if (selections.project === name) return theme.fg("success", "[active local]");
	if (selections.global === name) {
		return selections.project ? theme.fg("accent", "[saved global]") : theme.fg("success", "[active global]");
	}
	return undefined;
}

function formatStyleLabel(style: OutputStyleDefinition, index: number, selections: ReturnType<typeof getActiveStyleSelections>, theme: any): string {
	const badges = [getStyleBadge(style, theme), getStyleStatusBadge(style.name, selections, theme)].filter(Boolean).join(" ");
	const desc = style.config.description ? ` — ${style.config.description.slice(0, 35)}${style.config.description.length > 35 ? "..." : ""}` : "";
	return `${index + 1}. ${style.name}${badges ? ` ${badges}` : ""}${desc}`;
}

const SHORTCUT_HINT = platform() === "darwin"
	? "Enter apply · ⌃G global · ⌃P local · Esc cancel"
	: "Enter apply · Ctrl+G global · Ctrl+P local · Esc cancel";

// ============================================================================
// Feature Toggle Panel
// ============================================================================

type ToggleSection = "features" | "behavior" | "personality" | "done";

interface ToggleState {
	section: ToggleSection;
	cursor: number;
	features: StyleFeatures;
	behavior: StyleBehavior;
	personality: StylePersonality;
	modified: boolean;
}

function createTogglePanel(ctx: ExtensionContext, style: OutputStyleDefinition, theme: any) {
	const selections = getActiveStyleSelections(ctx.cwd);

	const state: ToggleState = {
		section: "features",
		cursor: 0,
		features: style.config.features ? { ...style.config.features } : {},
		behavior: style.config.behavior ? { ...style.config.behavior } : {},
		personality: style.config.personality ? { ...style.config.personality } : {},
		modified: false,
	};

	const sections: ToggleSection[] = ["features", "behavior", "personality", "done"];
	const sectionTitles: Record<ToggleSection, string> = {
		features: "🖼️ Features",
		behavior: "⚙️ Behavior",
		personality: "🎭 Personality",
		done: "✓ Done",
	};

	function renderPanel(width: number): string {
		const lines: string[] = [];
		const innerWidth = width - 4;

		lines.push(theme.fg("accent", "╭" + "─".repeat(width - 2) + "╮"));
		lines.push(theme.fg("accent", "│") + theme.fg("accent", theme.bold(` Feature Toggles: ${style.name}`)).padEnd(width - 2) + theme.fg("accent", "│"));
		const statusBadge = getStyleStatusBadge(style.name, selections, theme);
		if (statusBadge) {
			lines.push(theme.fg("accent", "│") + `  ${statusBadge}`.padEnd(width - 2) + theme.fg("accent", "│"));
		}
		lines.push(theme.fg("accent", "│") + "─".repeat(width - 2) + theme.fg("accent", "│"));

		// Section tabs
		const tabLine = sections.map((s) => {
			const title = sectionTitles[s];
			const isActive = s === state.section;
			const prefix = isActive ? "▶ " : "  ";
			return prefix + (isActive ? theme.fg("accent", theme.bold(title)) : theme.fg("dim", title));
		}).join("  ");
		lines.push(theme.fg("accent", "│") + tabLine.padEnd(width - 2) + theme.fg("accent", "│"));
		lines.push(theme.fg("accent", "│") + "─".repeat(width - 2) + theme.fg("accent", "│"));

		// Content
		if (state.section === "features") {
			for (let i = 0; i < FEATURE_TOGGLES.length; i++) {
				const t = FEATURE_TOGGLES[i];
				const isOn = state.features[t.key] === true;
				const isCursor = i === state.cursor;
				const marker = isCursor ? "❯ " : "  ";
				const status = isOn ? theme.fg("success", "ON ") : theme.fg("dim", "OFF");
				const prefix = isCursor ? theme.fg("accent", marker) : marker;
				const line = `${prefix}${t.icon} ${t.label.padEnd(18)} [${status}]`;
				lines.push(theme.fg("accent", "│") + " " + line.padEnd(innerWidth) + theme.fg("accent", "│"));
			}
		} else if (state.section === "behavior") {
			for (let i = 0; i < BEHAVIOR_TOGGLES.length; i++) {
				const t = BEHAVIOR_TOGGLES[i];
				const isOn = state.behavior[t.key] === true;
				const isCursor = i === state.cursor;
				const marker = isCursor ? "❯ " : "  ";
				const status = isOn ? theme.fg("success", "ON ") : theme.fg("dim", "OFF");
				const prefix = isCursor ? theme.fg("accent", marker) : marker;
				const line = `${prefix}${t.icon} ${t.label.padEnd(18)} [${status}]`;
				lines.push(theme.fg("accent", "│") + " " + line.padEnd(innerWidth) + theme.fg("accent", "│"));
			}
		} else if (state.section === "personality") {
			for (let i = 0; i < PERSONALITY_TOGGLES.length; i++) {
				const t = PERSONALITY_TOGGLES[i];
				const isCursor = i === state.cursor;
				const marker = isCursor ? "❯ " : "  ";
				const prefix = isCursor ? theme.fg("accent", marker) : marker;

				let value: string;
				const currentValue = state.personality[t.key];

				if (t.type === "select" && t.options) {
					value = String(currentValue || t.options[0]);
					const line = `${prefix}${t.label}: ${theme.fg("accent", value)}`;
					lines.push(theme.fg("accent", "│") + " " + line.padEnd(innerWidth) + theme.fg("accent", "│"));
					if (isCursor) {
						const opts = t.options.join(" | ");
						lines.push(theme.fg("accent", "│") + "   " + theme.fg("dim", opts).padEnd(innerWidth) + theme.fg("accent", "│"));
					}
				} else {
					value = String(currentValue || 5);
					const bar = "█".repeat(Number(value)) + "░".repeat(10 - Number(value));
					const line = `${prefix}${t.label}: [${theme.fg("accent", bar)}] ${value}`;
					lines.push(theme.fg("accent", "│") + " " + line.padEnd(innerWidth) + theme.fg("accent", "│"));
				}
			}
		} else if (state.section === "done") {
			lines.push(theme.fg("accent", "│") + " ".repeat(innerWidth) + theme.fg("accent", "│"));
			const msg = state.modified ? theme.fg("accent", "Changes will be saved on Done") : theme.fg("dim", "No changes");
			lines.push(theme.fg("accent", "│") + "  ✓ Save & Apply".padEnd(innerWidth) + theme.fg("accent", "│"));
			lines.push(theme.fg("accent", "│") + " ".repeat(innerWidth) + theme.fg("accent", "│"));
			lines.push(theme.fg("accent", "│") + `  ${msg}`.padEnd(innerWidth) + theme.fg("accent", "│"));
		}

		// Footer
		lines.push(theme.fg("accent", "│") + "─".repeat(width - 2) + theme.fg("accent", "│"));
		const footer = "←→ section · ↑↓ nav · Space toggle/cycle · Esc cancel";
		lines.push(theme.fg("accent", "│") + theme.fg("dim", footer).padEnd(width - 2) + theme.fg("accent", "│"));
		lines.push(theme.fg("accent", "╰" + "─".repeat(width - 2) + "╯"));

		return lines.join("\n");
	}

	function getSectionItemCount(section: ToggleSection): number {
		return section === "features" ? FEATURE_TOGGLES.length :
			section === "behavior" ? BEHAVIOR_TOGGLES.length :
				section === "personality" ? PERSONALITY_TOGGLES.length : 1;
	}

	function toggleCurrent(): void {
		if (state.section === "features") {
			const t = FEATURE_TOGGLES[state.cursor];
			state.features[t.key] = !state.features[t.key];
			state.modified = true;
		} else if (state.section === "behavior") {
			const t = BEHAVIOR_TOGGLES[state.cursor];
			state.behavior[t.key] = !state.behavior[t.key];
			state.modified = true;
		}
	}

	function cycleValue(): void {
		if (state.section !== "personality") return;
		const t = PERSONALITY_TOGGLES[state.cursor];
		if (t.type === "select" && t.options) {
			const current = String(state.personality[t.key as keyof StylePersonality] || t.options[0]);
			const idx = t.options.indexOf(current);
			const next = t.options[(idx + 1) % t.options.length];
			(state.personality as any)[t.key] = next;
			state.modified = true;
		} else {
			const current = Number(state.personality[t.key as keyof StylePersonality] || 5);
			const next = current >= 10 ? 1 : current + 1;
			(state.personality as any)[t.key] = next;
			state.modified = true;
		}
	}

	function saveChanges(): void {
		if (!state.modified || style.source === "built-in" || !style.path) return;

		try {
			const content = readFileSync(style.path, "utf-8");
			const { frontmatter, body } = parseFrontmatter(content);

			const newConfig: StyleConfig = {
				name: style.config.name,
				description: frontmatter.description as string | undefined,
				icon: frontmatter.icon as string | undefined,
				tags: frontmatter.tags as string[] | undefined,
				language: frontmatter.language as string | undefined,
				keepCodingInstructions: frontmatter.keepCodingInstructions as boolean | undefined,
				greeting: frontmatter.greeting as string | undefined,
				farewell: frontmatter.farewell as string | undefined,
				features: state.features,
				behavior: state.behavior,
				personality: state.personality,
			};

			const yamlStr = YAML.stringify(newConfig, { indent: 2 });
			const newContent = `---\n${yamlStr}---\n\n${body}`;
			writeFileSync(style.path, newContent, "utf-8");
		} catch (error) {
			console.error("Failed to save toggle changes:", error);
		}
	}

	return {
		render: (width: number) => renderPanel(width),
		getState: () => state,
		toggleCurrent,
		cycleValue,
		isDone: () => state.section === "done",
		saveChanges,
		getSectionItemCount,
	};
}

// ============================================================================
// Main Extension
// ============================================================================

export default function outputStylesExtension(pi: ExtensionAPI): void {
	if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;

	let activeStyleName: string | undefined;

	function applyStyle(name: string, ctx: ExtensionContext, scopeOverride?: "global" | "project"): boolean {
		const style = findOutputStyle(ctx.cwd, name);
		if (!style) {
			ctx.ui.notify(`Output style "${name}" not found`, "error");
			return false;
		}
		if (scopeOverride === "global" && style.source === "project") {
			ctx.ui.notify("Project styles cannot be activated globally", "error");
			return false;
		}
		activeStyleName = style.name;
		const scope = scopeOverride ?? (style.source === "project" ? "project" : "global");
		saveActiveStyle(ctx.cwd, style.name, scope);
		pi.appendEntry(OUTPUT_STYLE_ENTRY_TYPE, { name: style.name });
		ctx.ui.notify(`Output style "${style.name}" ${scope === "global" ? "saved as global default" : "saved as local override"}`, "info");
		return true;
	}

	async function showSelector(ctx: ExtensionContext, scope?: "global" | "project"): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Interactive mode required", "error");
			return;
		}

		const styles = loadAllStyles(ctx.cwd);
		const visibleStyles = scope === "global" ? styles.filter((s) => s.source !== "project") : styles;
		if (!visibleStyles.length) {
			ctx.ui.notify("No output styles found", "warning");
			return;
		}

		// @ts-ignore
		await ctx.ui.custom((tui, theme, _kb, done) => {
			const selections = getActiveStyleSelections(ctx.cwd);
			const resolvedActiveName = activeStyleName ?? selections.effective;

			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild(new Text(theme.fg("accent", theme.bold(" Output Styles")), 1, 0));
			container.addChild(new Text(theme.fg("muted", "↑↓ navigate · Enter apply · ⌃G global · ⌃P local"), 1, 0));
			container.addChild(new Spacer(1));

			const items = visibleStyles.map((style, index) => ({
				value: style.name,
				label: formatStyleLabel(style, index, selections, theme),
				description: style.config.description,
			}));

			const selectList = new SelectList(items, Math.min(items.length, MAX_SELECT_LIST_ITEMS), getSelectListTheme(), { minPrimaryColumnWidth: 32, maxPrimaryColumnWidth: 72 });
			const currentIndex = items.findIndex((item) => item.value === resolvedActiveName);
			if (currentIndex !== -1) selectList.setSelectedIndex(currentIndex);
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(undefined);

			container.addChild(selectList);
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", SHORTCUT_HINT), 1, 0));
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					if (matchesKey(data, Key.ctrl("g")) || matchesKey(data, Key.ctrl("p"))) {
						const item = selectList.getSelectedItem();
						if (item && applyStyle(item.value, ctx, matchesKey(data, Key.ctrl("g")) ? "global" : "project")) {
							done(undefined);
						}
						return;
					}
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		const selected = undefined; // Will be handled by callback
		if (selected) applyStyle(selected, ctx, scope);
	}

	async function showTogglePanel(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Interactive mode required", "error");
			return;
		}

		const styleName = activeStyleName ?? resolveActiveStyleName(ctx.cwd);
		const style = findOutputStyle(ctx.cwd, styleName);
		if (!style) {
			ctx.ui.notify("No active style found", "error");
			return;
		}

		// @ts-ignore
		await ctx.ui.custom((tui, theme, _kb, done) => {
			const panel = createTogglePanel(ctx, style, theme);

			return {
				render: (width: number) => panel.render(width),
				invalidate: () => {},
				handleInput: (data: string) => {
					const state = panel.getState();

					if (matchesKey(data, Key.escape)) {
						done(undefined);
						return;
					}

					if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
						const sections: ToggleSection[] = ["features", "behavior", "personality", "done"];
						const idx = sections.indexOf(state.section);
						const delta = matchesKey(data, Key.left) ? -1 : 1;
						state.section = sections[(idx + delta + sections.length) % sections.length];
						state.cursor = 0;
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.up)) {
						const max = panel.getSectionItemCount(state.section) - 1;
						state.cursor = state.cursor <= 0 ? max : state.cursor - 1;
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.down)) {
						const max = panel.getSectionItemCount(state.section) - 1;
						state.cursor = state.cursor >= max ? 0 : state.cursor + 1;
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
						if (panel.isDone()) {
							panel.saveChanges();
							ctx.ui.notify("Feature toggles saved", "info");
							done(undefined);
							return;
						}
						panel.toggleCurrent();
						panel.cycleValue();
						tui.requestRender();
						return;
					}
				},
			};
		});
	}

	async function createStyle(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Interactive mode required", "error");
			return;
		}

		const nameInput = await ctx.ui.input("Style name", "my-style");
		if (!nameInput?.trim()) {
			ctx.ui.notify("Creation cancelled", "warning");
			return;
		}

		const nameResult = normalizeStyleName(nameInput);
		if ("error" in nameResult) {
			ctx.ui.notify(nameResult.error, "error");
			return;
		}

		if (findOutputStyle(ctx.cwd, nameResult.name)) {
			ctx.ui.notify(`Style "${nameResult.name}" already exists`, "error");
			return;
		}

		const description = await ctx.ui.input("Description (optional)");
		const icon = await ctx.ui.input("Icon emoji (optional)", "💡");

		const config: StyleConfig = {
			name: nameResult.name,
			description: description?.trim() || undefined,
			icon: icon?.trim() || undefined,
			keepCodingInstructions: true,
			features: {},
			personality: {},
			behavior: {},
		};

		const prompt = await ctx.ui.editor("Style prompt", "Describe the desired output style...");
		if (prompt === undefined) {
			ctx.ui.notify("Creation cancelled", "warning");
			return;
		}

		// Write single md file with frontmatter
		const stylesDir = getOutputStylesDir(ctx.cwd);
		if (!existsSync(stylesDir)) mkdirSync(stylesDir, { recursive: true });

		const filePath = join(stylesDir, `${nameResult.name}.md`);
		const yamlStr = YAML.stringify(config, { indent: 2 });
		const content = `---\n${yamlStr}---\n\n${prompt.trim()}`;
		writeFileSync(filePath, content, "utf-8");

		ctx.ui.notify(`Created style "${nameResult.name}"`, "info");
		applyStyle(nameResult.name, ctx);
	}

	// Session events
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "custom" && entry.customType === OUTPUT_STYLE_ENTRY_TYPE) {
				activeStyleName = (entry.data as { name?: string })?.name;
				return;
			}
		}
		activeStyleName = resolveActiveStyleName(ctx.cwd);
	});

	pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
		const styleName = activeStyleName ?? resolveActiveStyleName(ctx.cwd);
		const style = findOutputStyle(ctx.cwd, styleName);
		if (!style) return;

		activeStyleName = style.name;
		const systemPrompt = generateStyleSystemPrompt(style);
		if (!systemPrompt) return;

		return { systemPrompt: `${event.systemPrompt}\n\n${systemPrompt}` };
	});

	// Commands
	pi.registerCommand("output-style", {
		description: "Switch output style",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed) {
				const result = normalizeStyleName(trimmed);
				if ("error" in result) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				applyStyle(result.name, ctx);
				return;
			}
			await showSelector(ctx);
		},
	});

	pi.registerCommand("output-style:new", {
		description: "Create a new output style",
		handler: async (_args, ctx) => { await createStyle(ctx); },
	});

	pi.registerCommand("output-style:toggle", {
		description: "Open feature toggle panel",
		handler: async (_args, ctx) => { await showTogglePanel(ctx); },
	});

	// Shortcuts
	pi.registerShortcut("alt+g", {
		description: "Set global output style",
		handler: async (ctx) => { if (ctx.hasUI) await showSelector(ctx, "global"); },
	});

	pi.registerShortcut("alt+p", {
		description: "Set project output style",
		handler: async (ctx) => { if (ctx.hasUI) await showSelector(ctx, "project"); },
	});

	pi.registerShortcut("alt+t", {
		description: "Open feature toggle panel",
		handler: async (ctx) => { if (ctx.hasUI) await showTogglePanel(ctx); },
	});
}
