const ENV_PREFIX_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/;
const CHAIN_OPERATORS = ["&&", "||", ";", "|"] as const;

function sliceFirstSegment(command: string): string {
	let cutIndex = -1;
	for (const operator of CHAIN_OPERATORS) {
		const index = command.indexOf(operator);
		if (index === -1) {
			continue;
		}
		if (cutIndex === -1 || index < cutIndex) {
			cutIndex = index;
		}
	}

	if (cutIndex === -1) {
		return command;
	}
	return command.slice(0, cutIndex);
}

export function normalizeCommandForDetection(command: string | undefined | null): string | null {
	if (typeof command !== "string") {
		return null;
	}

	const firstNonEmptyLine = command
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstNonEmptyLine) {
		return null;
	}

	const withoutEnvPrefix = firstNonEmptyLine.replace(ENV_PREFIX_PATTERN, "").trim();
	if (!withoutEnvPrefix) {
		return null;
	}

	const firstSegment = sliceFirstSegment(withoutEnvPrefix).trim().toLowerCase();
	return firstSegment || null;
}

export function matchesCommandPatterns(
	command: string | undefined | null,
	patterns: readonly RegExp[],
): boolean {
	const normalized = normalizeCommandForDetection(command);
	if (!normalized) {
		return false;
	}
	return patterns.some((pattern) => pattern.test(normalized));
}
