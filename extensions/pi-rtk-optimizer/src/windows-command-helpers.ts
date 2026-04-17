interface WindowsBashCompatibilityResult {
	command: string;
	applied: string[];
}

const PYTHON_UTF8_ENV_PREFIX = "PYTHONIOENCODING=utf-8";

function normalizeWindowsPathForBash(rawPath: string): string {
	const trimmed = rawPath.trim();
	const unquoted =
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
			? trimmed.slice(1, -1)
			: trimmed;
	return unquoted.replace(/\\/g, "/");
}

function quoteForBash(value: string): string {
	const escaped = value.replace(/"/g, '\\"');
	return `"${escaped}"`;
}

function rewriteLeadingCdSlashD(command: string): { command: string; changed: boolean } {
	const withTailMatch = command.match(/^\s*cd\s+\/d\s+(.+?)\s*&&\s*([\s\S]+)$/i);
	if (withTailMatch) {
		const rawPath = withTailMatch[1] ?? "";
		const tail = withTailMatch[2] ?? "";
		const normalizedPath = quoteForBash(normalizeWindowsPathForBash(rawPath));
		return {
			command: `cd ${normalizedPath} && ${tail}`,
			changed: true,
		};
	}

	const onlyCdMatch = command.match(/^\s*cd\s+\/d\s+(.+)$/i);
	if (onlyCdMatch) {
		const rawPath = onlyCdMatch[1] ?? "";
		const normalizedPath = quoteForBash(normalizeWindowsPathForBash(rawPath));
		return {
			command: `cd ${normalizedPath}`,
			changed: true,
		};
	}

	return { command, changed: false };
}

function ensurePythonUtf8(command: string): { command: string; changed: boolean } {
	if (/\bPYTHONIOENCODING\s*=/.test(command)) {
		return { command, changed: false };
	}

	if (!/(^|[;&|]\s*|&&\s*|\|\|\s*)python(?:3(?:\.\d+)?)?\b/i.test(command)) {
		return { command, changed: false };
	}

	return {
		command: `${PYTHON_UTF8_ENV_PREFIX} ${command}`,
		changed: true,
	};
}

export function applyWindowsBashCompatibilityFixes(command: string): WindowsBashCompatibilityResult {
	if (process.platform !== "win32") {
		return { command, applied: [] };
	}

	let nextCommand = command;
	const applied: string[] = [];

	const cdFix = rewriteLeadingCdSlashD(nextCommand);
	if (cdFix.changed) {
		nextCommand = cdFix.command;
		applied.push("cd-/d");
	}

	const pythonFix = ensurePythonUtf8(nextCommand);
	if (pythonFix.changed) {
		nextCommand = pythonFix.command;
		applied.push("python-utf8");
	}

	return { command: nextCommand, applied };
}
