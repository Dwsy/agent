/**
 * Output Styles Extension
 *
 * @auth dwsy
 *
 * Provides a flexible system for managing and applying different output style templates
 * to AI coding assistant responses. Styles can be:
 *
 * - Built-in: Predefined styles (default, explanatory, learning)
 * - Global: User-defined styles available across all projects
 * - Project: Project-specific styles stored in .pi/output-styles/
 *
 * Features:
 * - Style selection via command or keyboard shortcuts
 * - Custom style creation with frontmatter configuration
 * - Automatic style activation on session start
 * - Cross-platform keyboard shortcut hints (⌥ for macOS, Alt for Windows/Linux)
 *
 * Commands:
 * - /output-style [name] - Switch output style by name or show selector
 * - /output-style:new - Create a new custom output style
 *
 * Shortcuts:
 * - Alt+G / ⌥+G - Select global output style
 * - Alt+P / ⌥+P - Select project output style
 *
 * @module output-styles
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	getSelectListTheme,
	parseFrontmatter,
} from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Spacer, Text, Key, matchesKey } from "@mariozechner/pi-tui";

type OutputStyleSource = "built-in" | "global" | "project";

interface OutputStyleFrontmatter {
	name: string;
	description?: string;
	keepCodingInstructions: boolean;
}

interface OutputStyleDefinition {
	frontmatter: OutputStyleFrontmatter;
	content: string;
	source: OutputStyleSource;
	path?: string;
}

const OUTPUT_STYLE_ENTRY_TYPE = "output-style";
const OUTPUT_STYLES_DIR_NAME = "output-styles";
const ACTIVE_STYLE_FILE = "active.json";
const MAX_STYLE_NAME_LENGTH = 64;
const MAX_SELECT_LIST_ITEMS = 10;

const BUILTIN_OUTPUT_STYLES: OutputStyleDefinition[] = [
	{
		frontmatter: {
			name: "default",
			description: "Completes coding tasks efficiently and provides concise responses",
			keepCodingInstructions: true,
		},
		content: "",
		source: "built-in",
	},
	{
		frontmatter: {
			name: "explanatory",
			description: "Explains implementation choices and codebase patterns",
			keepCodingInstructions: true,
		},
		content: [
			"You are an expert coding assistant.",
			"Explain your reasoning and decisions clearly.",
			"Provide short, well-structured explanations with headers and bullet points.",
			"When presenting code changes, summarize the intent first.",
			"Be concise but do not skip important context.",
		].join("\n"),
		source: "built-in",
	},
	{
		frontmatter: {
			name: "learning",
			description: "Pauses and asks you to write small pieces of code for hands-on practice",
			keepCodingInstructions: true,
		},
		content: [
			"Act as a helpful tutor.",
			"Explain the key concepts before diving into code.",
			"Use examples and short snippets to illustrate ideas.",
			"Pause and ask the user to write small pieces of code for hands-on practice.",
			"Provide guidance and feedback on their attempts.",
			"Summarize the main takeaways at the end.",
		].join("\n"),
		source: "built-in",
	},
	{
		frontmatter: {
			name: "coding-vibes",
			description: "Energetic, casual coding buddy with modern dev vibes - adapts to user's language while keeping the energy",
			keepCodingInstructions: true,
		},
		content: [
			"You're an energetic, casual coding buddy with modern dev vibes.",
			"Use contemporary developer language and expressions.",
			"Keep responses upbeat and encouraging.",
			"Adapt to the user's language and communication style while maintaining energy.",
			"Use emojis sparingly but effectively to convey enthusiasm.",
			"Make coding feel fun and approachable.",
		].join("\n"),
		source: "built-in",
	},
	{
		frontmatter: {
			name: "structural-thinking",
			description: "Structural thinking with architectural clarity - naturally considers foundations, layers, and clean interfaces",
			keepCodingInstructions: true,
		},
		content: [
			"Approach problems with structural thinking and architectural clarity.",
			"Always consider the foundations, layers, and clean interfaces.",
			"Think about separation of concerns and modularity.",
			"Explain the architectural reasoning behind design decisions.",
			"Consider scalability, maintainability, and extensibility.",
			"Use diagrams or structured descriptions to illustrate architecture when helpful.",
		].join("\n"),
		source: "built-in",
	},
];

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
	if (!existsSync(activePath)) {
		return undefined;
	}
	try {
		const content = readFileSync(activePath, "utf-8");
		const parsed = JSON.parse(content) as { name?: string };
		if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) {
			console.error(`Invalid active style file ${activePath}: missing or invalid name`);
			return undefined;
		}
		return parsed.name.trim();
	} catch (error) {
		console.error(`Failed to read ${activePath}: ${error}`);
		return undefined;
	}
}

function loadActiveStyle(cwd: string): string | undefined {
	const projectStyle = loadActiveStyleFromPath(getActiveStylePath(cwd));
	if (projectStyle) {
		return projectStyle;
	}
	return loadActiveStyleFromPath(getGlobalActiveStylePath());
}

function getStyleScope(cwd: string, styleName: string): "built-in" | "global" | "project" {
	// Check if it's set as project style
	const projectStyle = loadActiveStyleFromPath(getActiveStylePath(cwd));
	if (projectStyle === styleName) {
		return "project";
	}
	// Check if it's set as global style
	const globalStyle = loadActiveStyleFromPath(getGlobalActiveStylePath());
	if (globalStyle === styleName) {
		return "global";
	}
	// Otherwise, it's the original source
	const style = findOutputStyle(cwd, styleName);
	return style?.source ?? "built-in";
}

function resolveActiveStyleName(cwd: string): string {
	const candidate = loadActiveStyle(cwd);
	if (candidate && findOutputStyle(cwd, candidate)) {
		return candidate;
	}
	return "default";
}

function getStylePaths(cwd: string, scope: "global" | "project"): { stylesDir: string; activePath: string } {
	const stylesDir = scope === "project" ? getOutputStylesDir(cwd) : getGlobalOutputStylesDir();
	const activePath = scope === "project" ? getActiveStylePath(cwd) : getGlobalActiveStylePath();
	return { stylesDir, activePath };
}

function saveActiveStyle(cwd: string, name: string, scope: "global" | "project"): void {
	const { stylesDir, activePath } = getStylePaths(cwd, scope);
	if (!existsSync(stylesDir)) {
		mkdirSync(stylesDir, { recursive: true });
	}
	writeFileSync(activePath, JSON.stringify({ name }, null, 2), "utf-8");
}

function normalizeStyleName(
	rawName: string,
): { name: string; normalized: boolean } | { error: string } {
	if (!rawName || typeof rawName !== "string") {
		return { error: "Invalid input: name must be a non-empty string." };
	}

	const trimmed = rawName.trim();
	if (!trimmed) {
		return { error: "Invalid name: name cannot be empty or whitespace only." };
	}

	const stripped = trimmed.replace(/^\/?output-style(?::new)?\s*/i, "").trim();
	if (trimmed !== stripped && !stripped) {
		return { error: "Enter a style name like \"my-style\" (do not include /output-style:new)." };
	}

	const baseName = stripped || trimmed;
	const normalized = baseName
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	if (!normalized) {
		return { error: "Invalid name. Use letters, numbers, and hyphens (e.g. \"my-style\")." };
	}

	if (normalized.length > MAX_STYLE_NAME_LENGTH) {
		return { error: `Name is too long. Maximum ${MAX_STYLE_NAME_LENGTH} characters allowed.` };
	}

	return { name: normalized, normalized: normalized !== baseName };
}

function parseOutputStyleFile(content: string, filePath: string): OutputStyleDefinition | undefined {
	const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);
	const nameValue = frontmatter.name;
	if (typeof nameValue !== "string" || !nameValue.trim()) {
		console.error(`Output style in ${filePath} missing name frontmatter`);
		return undefined;
	}

	const descriptionValue = frontmatter.description;
	if (descriptionValue !== undefined && typeof descriptionValue !== "string") {
		console.error(`Output style in ${filePath} has invalid description frontmatter`);
		return undefined;
	}

	const keepCodingValue = frontmatter.keepCodingInstructions;
	if (keepCodingValue !== undefined && typeof keepCodingValue !== "boolean") {
		console.error(`Output style in ${filePath} has invalid keepCodingInstructions frontmatter`);
		return undefined;
	}

	const frontmatterResult: OutputStyleFrontmatter = {
		name: nameValue.trim(),
		description: descriptionValue?.trim() || undefined,
		keepCodingInstructions: keepCodingValue ?? false,
	};

	return {
		frontmatter: frontmatterResult,
		content: body.trim(),
		source: "project",
		path: filePath,
	};
}

function loadProjectOutputStyles(cwd: string): OutputStyleDefinition[] {
	const stylesDir = getOutputStylesDir(cwd);
	return loadOutputStylesFromDir(stylesDir, "project");
}

function loadGlobalOutputStyles(): OutputStyleDefinition[] {
	const stylesDir = getGlobalOutputStylesDir();
	return loadOutputStylesFromDir(stylesDir, "global");
}

function loadOutputStylesFromDir(dir: string, source: OutputStyleSource): OutputStyleDefinition[] {
	if (!existsSync(dir)) {
		return [];
	}

	let files: string[];
	try {
		files = readdirSync(dir).filter((file) => file.endsWith(".md"));
	} catch (error) {
		console.error(`Failed to read directory ${dir}: ${error}`);
		return [];
	}

	const styles: OutputStyleDefinition[] = [];

	for (const file of files) {
		const filePath = join(dir, file);
		try {
			const content = readFileSync(filePath, "utf-8");
			const parsed = parseOutputStyleFile(content, filePath);
			if (parsed) {
				styles.push({ ...parsed, source });
			}
		} catch (error) {
			console.error(`Failed to read output style ${filePath}: ${error}`);
		}
	}

	return styles;
}

function loadOutputStyles(cwd: string): OutputStyleDefinition[] {
	const styles = new Map<string, OutputStyleDefinition>();
	for (const style of BUILTIN_OUTPUT_STYLES) {
		styles.set(style.frontmatter.name, style);
	}

	for (const style of loadGlobalOutputStyles()) {
		styles.set(style.frontmatter.name, style);
	}

	for (const style of loadProjectOutputStyles(cwd)) {
		styles.set(style.frontmatter.name, style);
	}

	return Array.from(styles.values());
}

function findOutputStyle(cwd: string, name: string): OutputStyleDefinition | undefined {
	const styles = loadOutputStyles(cwd);
	return styles.find((style) => style.frontmatter.name === name);
}

function formatStyleLabel(
	style: OutputStyleDefinition,
	index: number,
	activeName: string | undefined,
	theme: any,
	cwd: string,
): string {
	const num = index + 1;
	const name = style.frontmatter.name;
	
	// Get actual scope (where it's configured, not where it's defined)
	const actualScope = getStyleScope(cwd, name);
	
	// Source badge based on actual scope
	const sourceBadge = actualScope === "built-in" 
		? theme.fg("dim", "[built-in]")
		: actualScope === "global"
		? theme.fg("accent", "[global]")
		: theme.fg("success", "[project]");
	
	// Active indicator
	const activeIndicator = style.frontmatter.name === activeName 
		? theme.fg("success", " ✔")
		: "";
	
	// Description
	const description = style.frontmatter.description || "";
	
	return `${num}. ${name} ${sourceBadge}${activeIndicator}            ${description}`;
}

function getStyleTags(style: OutputStyleDefinition, activeName: string | undefined): string {
	const tags: string[] = [];
	if (style.frontmatter.name === activeName) {
		tags.push("✔");
	}
	if (style.frontmatter.description) {
		tags.push(style.frontmatter.description);
	}
	return tags.join("            ");
}

function generateStyleFileContent(name: string, content: string, description?: string, keepCodingInstructions = false): string {
	const frontmatter = [
		"---",
		`name: ${name}`,
		description?.trim() ? `description: ${description.trim()}` : undefined,
		`keepCodingInstructions: ${keepCodingInstructions}`,
		"---",
	].filter(Boolean);

	return `${frontmatter.join("\n")}\n\n${content.trim()}\n`;
}

function formatStylePrompt(style: OutputStyleDefinition): string {
	const header = "## Output Style";
	if (!style.content) {
		return header;
	}
	if (!style.frontmatter.keepCodingInstructions) {
		return `${header}\n\nIgnore prior coding-style instructions. Focus on the output style below.\n\n${style.content}`;
	}
	return `${header}\n\n${style.content}`;
}

const SHORTCUT_HINT = (() => {
	const os = platform();
	switch (os) {
		case "darwin":
			return "Enter select · ^G set global · ^P set project · Esc cancel";
		case "win32":
			return "Enter select · Ctrl+G set global · Ctrl+P set project · Esc cancel";
		default:
			return "Enter select · Ctrl+G set global · Ctrl+P set project · Esc cancel";
	}
})();

export default function outputStylesExtension(pi: ExtensionAPI): void {
	let activeStyleName: string | undefined;

	function applyStyle(
		name: string,
		ctx: ExtensionContext,
		scopeOverride?: "global" | "project",
	): boolean {
		const style = findOutputStyle(ctx.cwd, name);
		if (!style) {
			ctx.ui.notify(`Output style \"${name}\" not found`, "error");
			return false;
		}

		if (scopeOverride === "global" && style.source === "project") {
			ctx.ui.notify("Project output styles cannot be activated globally", "error");
			return false;
		}

		activeStyleName = style.frontmatter.name;
		const scope = scopeOverride ?? (style.source === "project" ? "project" : "global");
		saveActiveStyle(ctx.cwd, style.frontmatter.name, scope);
		pi.appendEntry(OUTPUT_STYLE_ENTRY_TYPE, { name: style.frontmatter.name });
		ctx.ui.notify(`Output style set to ${style.frontmatter.name}`, "info");
		return true;
	}

	async function showSelector(ctx: ExtensionContext, scope?: "global" | "project"): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Output style selector requires interactive mode", "error");
			return;
		}

		const styles = loadOutputStyles(ctx.cwd);
		const visibleStyles =
			scope === "global" ? styles.filter((style) => style.source !== "project") : styles;
		if (visibleStyles.length === 0) {
			ctx.ui.notify("No output styles found", "warning");
			return;
		}

		const selected = await ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
			const container = new Container();
			const titleSuffix = scope === "global" ? " (global)" : scope === "project" ? " (project)" : "";
			container.addChild(new Text(theme.fg("accent", `Output Style${titleSuffix}`), 1, 0));
			container.addChild(new Spacer(1));

			const items = visibleStyles.map((style, index) => ({
				value: style.frontmatter.name,
				label: formatStyleLabel(style, index, activeStyleName, theme, ctx.cwd),
			}));
			const selectList = new SelectList(items, Math.min(items.length, MAX_SELECT_LIST_ITEMS), getSelectListTheme());
			const currentIndex = items.findIndex((item) => item.value === activeStyleName);
			if (currentIndex !== -1) {
				selectList.setSelectedIndex(currentIndex);
			}
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(undefined);

			container.addChild(selectList);
			container.addChild(new Spacer(1));
			container.addChild(
				new Text(
					theme.fg(
						"dim",
						SHORTCUT_HINT,
					),
					1,
					0,
				),
			);

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					// Handle Ctrl+G (set as global) and Ctrl+P (set as project)
					if (matchesKey(data, Key.ctrl("g"))) {
						const selectedItem = selectList.getSelectedItem();
						if (selectedItem) {
							applyStyle(selectedItem.value, ctx, "global");
							// Refresh list items to show updated scope badges
							const refreshedItems = visibleStyles.map((style, index) => ({
								value: style.frontmatter.name,
								label: formatStyleLabel(style, index, activeStyleName, theme, ctx.cwd),
							}));
							// Directly update items
							selectList.items = refreshedItems;
							selectList.filteredItems = refreshedItems;
							tui.requestRender();
						}
						return;
					}
					if (matchesKey(data, Key.ctrl("p"))) {
						const selectedItem = selectList.getSelectedItem();
						if (selectedItem) {
							applyStyle(selectedItem.value, ctx, "project");
							// Refresh list items to show updated scope badges
							const refreshedItems = visibleStyles.map((style, index) => ({
								value: style.frontmatter.name,
								label: formatStyleLabel(style, index, activeStyleName, theme, ctx.cwd),
							}));
							// Directly update items
							selectList.items = refreshedItems;
							selectList.filteredItems = refreshedItems;
							tui.requestRender();
						}
						return;
					}
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selected) {
			return;
		}

		applyStyle(selected, ctx, scope);
	}

	async function createStyle(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) {
			ctx.ui.notify("Output style creation requires interactive mode", "error");
			return;
		}

		const nameInput = await ctx.ui.input("Output style name", "my-style");
		if (!nameInput?.trim()) {
			ctx.ui.notify("Output style creation cancelled", "warning");
			return;
		}

		const nameResult = normalizeStyleName(nameInput);
		if ("error" in nameResult) {
			ctx.ui.notify(nameResult.error, "error");
			return;
		}

		if (nameResult.normalized) {
			ctx.ui.notify(`Normalized output style name to \"${nameResult.name}\"`, "info");
		}

		const existing = findOutputStyle(ctx.cwd, nameResult.name);
		if (existing) {
			if (existing.source === "built-in") {
				ctx.ui.notify(`Cannot override built-in output style \"${nameResult.name}\"`, "error");
				return;
			}
			ctx.ui.notify(`Output style \"${nameResult.name}\" already exists`, "error");
			return;
		}

		const description = await ctx.ui.input("Description (optional)");
		const keepCoding = await ctx.ui.confirm(
			"Keep coding instructions?",
			"Select yes to keep the default coding rules in the system prompt.",
		);
		const content = await ctx.ui.editor("Output style instructions", "Describe the desired output style...");
		if (content === undefined) {
			ctx.ui.notify("Output style creation cancelled", "warning");
			return;
		}

		const stylesDir = getOutputStylesDir(ctx.cwd);
		if (!existsSync(stylesDir)) {
			mkdirSync(stylesDir, { recursive: true });
		}

		const fileContent = generateStyleFileContent(nameResult.name, content, description, keepCoding);
		const filePath = join(stylesDir, `${nameResult.name}.md`);

		try {
			writeFileSync(filePath, fileContent, "utf-8");
		} catch (error) {
			ctx.ui.notify(`Failed to create output style file: ${error}`, "error");
			return;
		}

		ctx.ui.notify(`Created output style ${nameResult.name}`, "info");
		applyStyle(nameResult.name, ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const entry = entries[i];
			if (entry.type === "custom" && entry.customType === OUTPUT_STYLE_ENTRY_TYPE) {
				const data = entry.data as { name?: string } | undefined;
				activeStyleName = data?.name;
				return;
			}
		}
		activeStyleName = resolveActiveStyleName(ctx.cwd);
	});

	pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
		const resolvedStyleName = activeStyleName ?? resolveActiveStyleName(ctx.cwd);
		const style = findOutputStyle(ctx.cwd, resolvedStyleName);
		if (!style) {
			return;
		}
		activeStyleName = style.frontmatter.name;
		const appended = formatStylePrompt(style);
		return { systemPrompt: `${event.systemPrompt}\n\n${appended}` };
	});

	pi.registerCommand("output-style", {
		description: "Switch output style",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (trimmed) {
				const normalized = normalizeStyleName(trimmed);
				if ("error" in normalized) {
					ctx.ui.notify(normalized.error, "error");
					return;
				}
				applyStyle(normalized.name, ctx);
				return;
			}

			await showSelector(ctx);
		},
	});

	pi.registerShortcut("alt+g", {
		description: "Set global output style",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Global output style selection requires interactive mode", "error");
				return;
			}
			await showSelector(ctx, "global");
		},
	});

	pi.registerShortcut("alt+p", {
		description: "Set project output style",
		handler: async (ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Project output style selection requires interactive mode", "error");
				return;
			}
			await showSelector(ctx, "project");
		},
	});

	pi.registerCommand("output-style:new", {
		description: "Create a new output style",
		handler: async (_args, ctx) => {
			await createStyle(ctx);
		},
	});
}
