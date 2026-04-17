import { matchesCommandPatterns } from "./command-detection.js";

interface BuildStats {
	compiled: number;
	errors: string[][];
	warnings: string[];
}

const BUILD_COMMAND_PATTERNS = [
	/^cargo\s+(build|check)\b/,
	/^bun\s+build\b/,
	/^npm\s+run\s+build\b/,
	/^yarn\s+build\b/,
	/^pnpm\s+build\b/,
	/^(?:npx\s+)?tsc\b/,
	/^make\b/,
	/^cmake\b/,
	/^gradle\b/,
	/^mvn\b/,
	/^go\s+(build|install)\b/,
	/^python\s+setup\.py\s+build\b/,
	/^pip\s+install\b/,
] as const;

const SKIP_PATTERNS = [
	/^\s*Compiling\s+/,
	/^\s*Checking\s+/,
	/^\s*Downloading\s+/,
	/^\s*Downloaded\s+/,
	/^\s*Fetching\s+/,
	/^\s*Fetched\s+/,
	/^\s*Updating\s+/,
	/^\s*Updated\s+/,
	/^\s*Building\s+/,
	/^\s*Generated\s+/,
	/^\s*Creating\s+/,
	/^\s*Running\s+/,
];

const ERROR_START_PATTERNS = [/^error\[/, /^error:/, /^\[ERROR\]/, /^FAIL/];
const WARNING_PATTERNS = [/^warning:/, /^\[WARNING\]/, /^warn:/];

function isSkipLine(line: string): boolean {
	return SKIP_PATTERNS.some((pattern) => pattern.test(line));
}

function isErrorStart(line: string): boolean {
	return ERROR_START_PATTERNS.some((pattern) => pattern.test(line));
}

function isWarning(line: string): boolean {
	return WARNING_PATTERNS.some((pattern) => pattern.test(line));
}

export function isBuildCommand(command: string | undefined | null): boolean {
	return matchesCommandPatterns(command, BUILD_COMMAND_PATTERNS);
}

export function filterBuildOutput(output: string, command: string | undefined | null): string | null {
	if (!isBuildCommand(command)) {
		return null;
	}

	const lines = output.split("\n");
	const stats: BuildStats = {
		compiled: 0,
		errors: [],
		warnings: [],
	};

	let inErrorBlock = false;
	let currentError: string[] = [];
	let blankCount = 0;

	for (const line of lines) {
		if (line.match(/^\s*(Compiling|Checking|Building)\s+/)) {
			stats.compiled++;
			continue;
		}

		if (isSkipLine(line)) {
			continue;
		}

		if (isErrorStart(line)) {
			if (inErrorBlock && currentError.length > 0) {
				stats.errors.push([...currentError]);
			}
			inErrorBlock = true;
			currentError = [line];
			blankCount = 0;
			continue;
		}

		if (isWarning(line)) {
			stats.warnings.push(line);
			continue;
		}

		if (!inErrorBlock) {
			continue;
		}

		if (line.trim() === "") {
			blankCount++;
			if (blankCount >= 2 && currentError.length > 3) {
				stats.errors.push([...currentError]);
				inErrorBlock = false;
				currentError = [];
			} else {
				currentError.push(line);
			}
			continue;
		}

		if (line.match(/^\s/) || line.match(/^-->/)) {
			currentError.push(line);
			blankCount = 0;
			continue;
		}

		stats.errors.push([...currentError]);
		inErrorBlock = false;
		currentError = [];
	}

	if (inErrorBlock && currentError.length > 0) {
		stats.errors.push(currentError);
	}

	if (stats.errors.length === 0 && stats.warnings.length === 0) {
		return `[OK] Build successful (${stats.compiled} units compiled)`;
	}

	const result: string[] = [];

	if (stats.errors.length > 0) {
		result.push(`[ERROR] ${stats.errors.length} error(s):`);
		for (const error of stats.errors.slice(0, 5)) {
			result.push(...error.slice(0, 10));
			if (error.length > 10) {
				result.push("  ...");
			}
		}
		if (stats.errors.length > 5) {
			result.push(`... and ${stats.errors.length - 5} more errors`);
		}
	}

	if (stats.warnings.length > 0) {
		result.push(`\n[WARN] ${stats.warnings.length} warning(s)`);
	}

	return result.join("\n");
}
