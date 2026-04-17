import { matchesCommandPatterns, normalizeCommandForDetection } from "./command-detection.js";
import { compactPath } from "./path-utils.js";

const LINTER_COMMAND_PATTERNS = [
	/^(?:pnpm\s+)?(?:npx\s+)?eslint\b/,
	/^(?:npx\s+)?prettier\b/,
	/^ruff\b/,
	/^pylint\b/,
	/^mypy\b/,
	/^flake8\b/,
	/^black\b/,
	/^cargo\s+clippy\b/,
	/^golangci-lint\b/,
] as const;

interface Issue {
	severity: "ERROR" | "WARNING";
	rule: string;
	file: string;
	line?: number;
	message: string;
}

export function isLinterCommand(command: string | undefined | null): boolean {
	return matchesCommandPatterns(command, LINTER_COMMAND_PATTERNS);
}

function parseLine(line: string): Issue | null {
	const fileLinePattern = /^(.+):(\d+):(\d+):\s*(.+)$/;
	const rustPattern = /^(error|warning):\s*(.+?)\s+at\s+(.+):(\d+):(\d+)$/;

	const fileLineMatch = line.match(fileLinePattern);
	if (fileLineMatch) {
		const file = fileLineMatch[1] ?? "unknown";
		const lineNumber = Number.parseInt(fileLineMatch[2] ?? "0", 10);
		const content = fileLineMatch[4] ?? line;
		const severity = /warning/i.test(content) ? "WARNING" : "ERROR";
		const rule = content.match(/\[(.+?)\]$/)?.[1] ?? "unknown";
		return {
			severity,
			rule,
			file,
			line: Number.isNaN(lineNumber) ? undefined : lineNumber,
			message: content,
		};
	}

	const rustMatch = line.match(rustPattern);
	if (rustMatch) {
		const severity = (rustMatch[1]?.toUpperCase() ?? "ERROR") as "ERROR" | "WARNING";
		const message = rustMatch[2] ?? line;
		const file = rustMatch[3] ?? "unknown";
		const lineNumber = Number.parseInt(rustMatch[4] ?? "0", 10);
		return {
			severity,
			rule: "unknown",
			file,
			line: Number.isNaN(lineNumber) ? undefined : lineNumber,
			message,
		};
	}

	return null;
}

function parseIssues(output: string): Issue[] {
	const issues: Issue[] = [];
	for (const line of output.split("\n")) {
		const parsed = parseLine(line);
		if (parsed) {
			issues.push(parsed);
		}
	}
	return issues;
}

function detectLinterType(command: string | undefined | null): string {
	const normalized = normalizeCommandForDetection(command);
	if (!normalized) {
		return "Linter";
	}
	if (/(?:^|\s)eslint\b/.test(normalized)) return "ESLint";
	if (/^ruff\b/.test(normalized)) return "Ruff";
	if (/^pylint\b/.test(normalized)) return "Pylint";
	if (/^mypy\b/.test(normalized)) return "MyPy";
	if (/^flake8\b/.test(normalized)) return "Flake8";
	if (/clippy\b/.test(normalized)) return "Clippy";
	if (/^golangci-lint\b/.test(normalized)) return "GolangCI-Lint";
	if (/prettier\b/.test(normalized)) return "Prettier";
	return "Linter";
}

export function aggregateLinterOutput(output: string, command: string | undefined | null): string | null {
	if (!isLinterCommand(command)) {
		return null;
	}

	const linterType = detectLinterType(command);
	const issues = parseIssues(output);

	if (issues.length === 0) {
		return `[OK] ${linterType}: No issues found`;
	}

	const errors = issues.filter((issue) => issue.severity === "ERROR").length;
	const warnings = issues.filter((issue) => issue.severity === "WARNING").length;

	const byRule = new Map<string, number>();
	for (const issue of issues) {
		byRule.set(issue.rule, (byRule.get(issue.rule) ?? 0) + 1);
	}

	const byFile = new Map<string, Issue[]>();
	for (const issue of issues) {
		const existing = byFile.get(issue.file) ?? [];
		existing.push(issue);
		byFile.set(issue.file, existing);
	}

	let result = `${linterType}: ${errors} errors, ${warnings} warnings in ${byFile.size} files\n`;
	result += "═══════════════════════════════════════\n";

	result += "Top rules:\n";
	const sortedRules = Array.from(byRule.entries())
		.sort((left, right) => right[1] - left[1])
		.slice(0, 10);
	for (const [rule, count] of sortedRules) {
		result += `  ${rule} (${count}x)\n`;
	}

	result += "\nTop files:\n";
	const sortedFiles = Array.from(byFile.entries())
		.sort((left, right) => right[1].length - left[1].length)
		.slice(0, 10);

	for (const [file, fileIssues] of sortedFiles) {
		result += `  ${compactPath(file, 40)} (${fileIssues.length} issues)\n`;
		const fileRules = new Map<string, number>();
		for (const issue of fileIssues) {
			fileRules.set(issue.rule, (fileRules.get(issue.rule) ?? 0) + 1);
		}
		const topRules = Array.from(fileRules.entries())
			.sort((left, right) => right[1] - left[1])
			.slice(0, 3);
		for (const [rule, count] of topRules) {
			result += `    ${rule} (${count})\n`;
		}
	}

	return result;
}
