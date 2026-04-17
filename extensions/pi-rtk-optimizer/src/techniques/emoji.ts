const RTK_COMMAND_PATTERN = /^\s*rtk(?:\.exe)?(?:\s|$)/;
const RTK_OUTPUT_SIGNATURE_PATTERNS = [
	/^📂 PATH Variables:/m,
	/^🔧 Language\/Runtime:/m,
	/^☁️?\s+Cloud\/Services:/m,
	/^🛠️?\s+Tools:/m,
	/^📋 Other:/m,
	/^📊 Total:/m,
	/^📊\s+.+\s+→\s+.+/m,
	/^📌\s+/m,
	/^✅ Files are identical$/m,
	/^✅ Staged:/m,
	/^📝 Modified:/m,
	/^❓ Untracked:/m,
	/^⚠️?\s+Conflicts:/m,
	/^🔍 CI Checks Summary:/m,
	/^🔍\s+\d+\s+in\s+\d+F:/m,
	/^--- Changes ---$/m,
	/^📄\s+.+$/m,
	/^📁\s+\d+F\s+\d+D:/m,
	/^☸️?\s+\d+\s+pods:/m,
	/^📦\s+/m,
] as const;

const LINE_PREFIX_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
	{ pattern: /^🔍\s+/gm, replacement: "" },
	{ pattern: /^📄\s+/gm, replacement: "> " },
	{ pattern: /^📂\s+/gm, replacement: "" },
	{ pattern: /^🔧\s+/gm, replacement: "" },
	{ pattern: /^☁️?\s+/gm, replacement: "" },
	{ pattern: /^🛠️?\s+/gm, replacement: "" },
	{ pattern: /^📋\s+/gm, replacement: "" },
	{ pattern: /^📊\s+/gm, replacement: "" },
	{ pattern: /^📌\s+/gm, replacement: "Branch: " },
	{ pattern: /^📝\s+/gm, replacement: "" },
	{ pattern: /^📦\s+/gm, replacement: "" },
	{ pattern: /^📁\s+/gm, replacement: "" },
	{ pattern: /^☸️?\s+/gm, replacement: "" },
] as const;

const INLINE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
	{ pattern: /✅|✓|✔/g, replacement: "[OK]" },
	{ pattern: /❌|✗|✕/g, replacement: "[ERROR]" },
	{ pattern: /⚠️|⚠/g, replacement: "[WARN]" },
	{ pattern: /❓/g, replacement: "[INFO]" },
	{ pattern: /⏭️|⏭/g, replacement: "[SKIP]" },
	{ pattern: /⏳/g, replacement: "Pending" },
	{ pattern: /⬆️|⬆/g, replacement: "up" },
	{ pattern: /→/g, replacement: "->" },
	{ pattern: /•/g, replacement: "-" },
] as const;

const REMAINING_EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const EMOJI_VARIATION_SELECTOR_PATTERN = /\uFE0F/g;
const INLINE_LABEL_SPACING_PATTERN = /(\[[A-Z]+\])(\S)/g;

function isRtkCommand(command: string | undefined | null): boolean {
	return typeof command === "string" && RTK_COMMAND_PATTERN.test(command);
}

function looksLikeRtkStyledOutput(output: string): boolean {
	return RTK_OUTPUT_SIGNATURE_PATTERNS.some((pattern) => pattern.test(output));
}

/**
 * RTK emits emoji-heavy presentation in several command outputs. Pi should
 * present tool results as plain text, so normalize RTK output markers before
 * the agent consumes them. We apply this to explicit `rtk ...` commands and to
 * recognizable RTK-shaped output that may have been prefixed by another layer.
 */
export function sanitizeRtkEmojiOutput(output: string, command: string | undefined | null): string | null {
	if (!isRtkCommand(command) && !looksLikeRtkStyledOutput(output)) {
		return null;
	}

	let nextText = output;

	for (const { pattern, replacement } of LINE_PREFIX_REPLACEMENTS) {
		nextText = nextText.replace(pattern, replacement);
	}

	for (const { pattern, replacement } of INLINE_REPLACEMENTS) {
		nextText = nextText.replace(pattern, replacement);
	}

	nextText = nextText.replace(REMAINING_EMOJI_PATTERN, "");
	nextText = nextText.replace(EMOJI_VARIATION_SELECTOR_PATTERN, "");
	nextText = nextText.replace(INLINE_LABEL_SPACING_PATTERN, "$1 $2");

	return nextText === output ? null : nextText;
}
