const RTK_HOOK_WARNING_MESSAGES = [
	"No hook installed — run `rtk init -g` for automatic token savings",
	"Hook outdated — run `rtk init -g` to update",
] as const;

const RTK_HOOK_WARNING_PREFIX_MARKERS = ["[rtk] /!\\", "⚠", "[WARN]"] as const;

type HookWarningLineStripResult =
	| {
			removed: false;
			removedLine: false;
			line: string;
	  }
	| {
			removed: true;
			removedLine: boolean;
			line: string;
	  };

function outputContainsKnownHookWarning(output: string): boolean {
	return RTK_HOOK_WARNING_MESSAGES.some((message) => output.includes(message));
}

function isQuotedPrefixBoundary(line: string, prefixIndex: number): boolean {
	if (prefixIndex <= 0) {
		return false;
	}

	const charBefore = line[prefixIndex - 1];
	return charBefore === "\"" || charBefore === "'";
}

function findClosestWarningPrefixIndex(line: string, beforeIndex: number): number {
	let closestIndex = -1;
	for (const marker of RTK_HOOK_WARNING_PREFIX_MARKERS) {
		const index = line.lastIndexOf(marker, beforeIndex);
		if (index > closestIndex) {
			closestIndex = index;
		}
	}

	return closestIndex;
}

function stripHookWarningFromLine(line: string): HookWarningLineStripResult {
	const trimmed = line.trim();
	if (!trimmed) {
		return { removed: false, removedLine: false, line };
	}

	if (RTK_HOOK_WARNING_MESSAGES.some((message) => trimmed === message)) {
		return { removed: true, removedLine: true, line: "" };
	}

	for (const message of RTK_HOOK_WARNING_MESSAGES) {
		const messageIndex = line.indexOf(message);
		if (messageIndex === -1) {
			continue;
		}

		const prefixIndex = findClosestWarningPrefixIndex(line, messageIndex);
		if (prefixIndex === -1) {
			continue;
		}

		if (isQuotedPrefixBoundary(line, prefixIndex)) {
			continue;
		}

		let removalStart = prefixIndex;
		while (removalStart > 0 && /\s/.test(line[removalStart - 1] ?? "")) {
			removalStart -= 1;
		}

		const removalEnd = messageIndex + message.length;
		const before = line.slice(0, removalStart);
		const after = line.slice(removalEnd);

		let nextLine = `${before}${after}`;
		if (before.trim() !== "" && after.trim() !== "") {
			nextLine = `${before.trimEnd()}\n${after}`;
		}

		if (!nextLine.trim()) {
			return { removed: true, removedLine: true, line: "" };
		}

		return { removed: true, removedLine: false, line: nextLine };
	}

	return { removed: false, removedLine: false, line };
}

/**
 * Removes only RTK hook status notices that are not actionable inside Pi.
 * Other RTK warnings should remain visible so the agent can inspect them.
 */
export function stripRtkHookWarnings(output: string, _command: string | undefined | null): string | null {
	if (!outputContainsKnownHookWarning(output)) {
		return null;
	}

	const filteredLines: string[] = [];
	let removedWarning = false;
	let skipImmediateBlankLine = false;

	for (const line of output.split("\n")) {
		if (skipImmediateBlankLine && line.trim() === "") {
			skipImmediateBlankLine = false;
			continue;
		}

		const stripped = stripHookWarningFromLine(line);
		if (stripped.removed) {
			removedWarning = true;
		}

		if (stripped.removedLine) {
			skipImmediateBlankLine = true;
			continue;
		}

		skipImmediateBlankLine = false;
		filteredLines.push(stripped.line);
	}

	if (!removedWarning) {
		return null;
	}

	while (filteredLines.length > 0 && filteredLines[0]?.trim() === "") {
		filteredLines.shift();
	}

	return filteredLines.join("\n");
}
