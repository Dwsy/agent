/**
 * Category resolution utilities
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export interface CategoryConfig {
	agent: string;
	model?: string;
	description: string;
	temperature?: number;
	maxTokens?: number;
}

export interface CategoriesConfig {
	$schema?: string;
	version: string;
	defaultModel?: string;
	description?: string;
	categories: Record<string, CategoryConfig>;
}

/**
 * 加载类别配置
 */
export function loadCategoriesConfig(): CategoriesConfig | null {
	const configPath = path.join(os.homedir(), ".pi", "agent", "categories.json");
	
	if (!fs.existsSync(configPath)) {
		return null;
	}
	
	try {
		const content = fs.readFileSync(configPath, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		console.error("Failed to load categories.json:", error);
		return null;
	}
}

/**
 * 根据类别解析代理名称
 */
export function resolveCategoryToAgent(category: string | undefined): string | undefined {
	if (!category) return undefined;
	
	const config = loadCategoriesConfig();
	if (!config) return undefined;
	
	const categoryConfig = config.categories[category];
	return categoryConfig?.agent;
}

/**
 * 获取所有可用类别
 */
export function listCategories(): Array<{ name: string; agent: string; description: string }> {
	const config = loadCategoriesConfig();
	if (!config) return [];
	
	return Object.entries(config.categories).map(([name, cfg]) => ({
		name,
		agent: cfg.agent,
		description: cfg.description,
	}));
}

/**
 * 获取类别描述文本（用于工具描述）
 */
export function getCategoriesDescriptionText(): string {
	const categories = listCategories();
	
	if (categories.length === 0) {
		return "  (no categories configured)";
	}
	
	return categories
		.map((c) => `  - ${c.name} → ${c.agent}: ${c.description}`)
		.join("\n");
}
