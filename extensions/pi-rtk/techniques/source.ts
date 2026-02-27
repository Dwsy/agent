export type Language =
	| "typescript"
	| "javascript"
	| "python"
	| "rust"
	| "go"
	| "java"
	| "c"
	| "cpp"
	| "unknown";

const LANGUAGE_EXTENSIONS: Record<string, Language> = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".py": "python",
	".pyw": "python",
	".rs": "rust",
	".go": "go",
	".java": "java",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".hpp": "cpp",
	".cc": "cpp",
};

interface CommentPatterns {
	line?: string;
	blockStart?: string;
	blockEnd?: string;
	docComment?: string;
}

const COMMENT_PATTERNS: Record<Language, CommentPatterns> = {
	typescript: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "/**" },
	javascript: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "/**" },
	python: { line: "#", docComment: '"""' },
	rust: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "///" },
	go: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "//" },
	java: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "/**" },
	c: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "/*" },
	cpp: { line: "//", blockStart: "/*", blockEnd: "*/", docComment: "/*" },
	unknown: {},
};

export function detectLanguage(filePath: string): Language {
	const lastDot = filePath.lastIndexOf(".");
	if (lastDot === -1) return "unknown";
	const ext = filePath.slice(lastDot).toLowerCase();
	return LANGUAGE_EXTENSIONS[ext] || "unknown";
}

export function filterMinimal(content: string, language: Language): string {
	if (language === "unknown") {
		return content;
	}

	const patterns = COMMENT_PATTERNS[language];
	const lines = content.split("\n");
	const result: string[] = [];
	let inBlockComment = false;
	let inDocstring = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Handle Python docstrings
		if (language === "python" && patterns.docComment) {
			if (trimmed.startsWith(patterns.docComment)) {
				inDocstring = !inDocstring;
				result.push(line);
				continue;
			}
			if (inDocstring) {
				result.push(line);
				continue;
			}
		}

		// Handle block comments
		if (patterns.blockStart && trimmed.startsWith(patterns.blockStart)) {
			// Check if it's a doc comment (keep it)
			if (patterns.docComment && trimmed.startsWith(patterns.docComment)) {
				result.push(line);
				continue;
			}
			inBlockComment = true;
		}

		if (inBlockComment) {
			if (patterns.blockEnd && trimmed.endsWith(patterns.blockEnd)) {
				inBlockComment = false;
			}
			continue;
		}

		// Handle line comments
		if (patterns.line) {
			const commentIndex = line.indexOf(patterns.line);
			if (commentIndex >= 0) {
				// Check if it's a doc comment
				if (patterns.docComment && trimmed.startsWith(patterns.docComment)) {
					result.push(line);
					continue;
				}
				// Remove the comment portion
				result.push(line.slice(0, commentIndex));
				continue;
			}
		}

		result.push(line);
	}

	// Normalize multiple blank lines
	const normalized = result
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return normalized;
}

export function filterAggressive(content: string, language: Language): string {
	if (language === "unknown") {
		return filterMinimal(content, language);
	}

	const minimal = filterMinimal(content, language);
	const lines = minimal.split("\n");
	const result: string[] = [];
	let braceDepth = 0;
	let inImplementation = false;

	// Patterns to preserve
	const importPattern = /^(use\s+|import\s+|from\s+|require\(|#include)/;
	const signaturePattern =
		/^(pub\s+)?(async\s+)?(fn|def|function|func|class|struct|enum|trait|interface|type)\s+\w+/;
	const constPattern = /^(const|static|let|pub\s+const|pub\s+static)\s+/;

	for (const line of lines) {
		const trimmed = line.trim();

		// Always keep imports
		if (importPattern.test(trimmed)) {
			result.push(line);
			continue;
		}

		// Keep function/type signatures
		if (signaturePattern.test(trimmed)) {
			result.push(line);
			inImplementation = true;
			braceDepth = 0;
			continue;
		}

		// Track brace depth for bodies
		if (inImplementation) {
			const openBraces = (trimmed.match(/\{/g) || []).length;
			const closeBraces = (trimmed.match(/\}/g) || []).length;
			braceDepth += openBraces - closeBraces;

			// Only keep opening/closing braces
			if (braceDepth <= 1 && (trimmed === "{" || trimmed === "}" || trimmed.endsWith("{"))) {
				result.push(line);
			}

			if (braceDepth <= 0) {
				inImplementation = false;
				if (trimmed !== "" && trimmed !== "}") {
					result.push("    // ... implementation");
				}
			}
			continue;
		}

		// Keep constants and type definitions
		if (constPattern.test(trimmed)) {
			result.push(line);
		}
	}

	return result.join("\n").trim();
}

export function smartTruncate(content: string, maxLines: number, language: Language): string {
	const lines = content.split("\n");
	if (lines.length <= maxLines) {
		return content;
	}

	const result: string[] = [];
	let keptLines = 0;
	let skippedSection = false;

	// Patterns for important lines
	const importantPattern =
		/^(import|use|from|require|#include|fn|def|function|func|class|struct|enum|trait|interface|type|const|static|let|pub\s)/;

	for (const line of lines) {
		const trimmed = line.trim();
		const isImportant = importantPattern.test(trimmed);

		if (isImportant || keptLines < maxLines / 2) {
			if (skippedSection) {
				result.push(`    // ... ${lines.length - result.length - keptLines} lines omitted`);
				skippedSection = false;
			}
			result.push(line);
			keptLines++;
		} else {
			skippedSection = true;
		}

		if (keptLines >= maxLines - 1) {
			break;
		}
	}

	if (skippedSection || keptLines < lines.length) {
		result.push(`// ... ${lines.length - keptLines} more lines (total: ${lines.length})`);
	}

	return result.join("\n");
}

export function filterSourceCode(
	content: string,
	language: Language,
	level: "none" | "minimal" | "aggressive"
): string {
	switch (level) {
		case "none":
			return content;
		case "minimal":
			return filterMinimal(content, language);
		case "aggressive":
			return filterAggressive(content, language);
		default:
			return content;
	}
}
