import type { RtkRewriteRule } from "./rewrite-rules.js";

const COMMAND_WORD_PATTERN = /"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|[^\s]+/g;
const BYPASSED_CARGO_SUBCOMMANDS = new Set(["help", "install", "publish"]);
const GH_STRUCTURED_OUTPUT_FLAGS = ["--json", "--jq", "--template"] as const;
const UNSAFE_COMPOUND_REWRITE_COMMANDS = new Set(["find", "grep", "rg", "ls"]);
const BYPASSED_FIND_ACTIONS = new Set([
	"-delete",
	"-exec",
	"-execdir",
	"-fprint",
	"-fprint0",
	"-fprintf",
	"-fls",
	"-ls",
	"-ok",
	"-okdir",
	"-print0",
	"-printf",
	"-prune",
	"-quit",
]);
const BASH_INLINE_COMMAND_FLAGS = new Set(["-c", "-cl", "-lc", "--command"]);
const POWERSHELL_INLINE_COMMAND_FLAGS = new Set(["-c", "-command", "-encodedcommand"]);
const CMD_INLINE_COMMAND_FLAGS = new Set(["/c", "/k"]);
const INTERACTIVE_CONTAINER_SHELLS = new Set([
	"ash",
	"bash",
	"cmd",
	"cmd.exe",
	"fish",
	"powershell",
	"powershell.exe",
	"pwsh",
	"pwsh.exe",
	"sh",
	"zsh",
]);

function splitCommandWords(commandBody: string): string[] {
	return commandBody.match(COMMAND_WORD_PATTERN) ?? [];
}

function splitTopLevelCompoundSegments(command: string): string[] {
	const segments: string[] = [];
	let segmentStart = 0;
	let quote: "'" | '"' | "`" | null = null;
	let escaped = false;

	const pushSegment = (endIndex: number): void => {
		const segment = command.slice(segmentStart, endIndex).trim();
		if (segment) {
			segments.push(segment);
		}
	};

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index] ?? "";
		const nextChar = command[index + 1] ?? "";
		const prevChar = index > 0 ? command[index - 1] ?? "" : "";

		if (escaped) {
			escaped = false;
			continue;
		}

		if (quote !== null) {
			if (char === "\\" && quote !== "'") {
				escaped = true;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === "\\") {
			escaped = true;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			continue;
		}

		let separatorLength = 0;
		if ((char === "&" && nextChar === "&") || (char === "|" && nextChar === "|") || (char === "|" && nextChar === "&")) {
			separatorLength = 2;
		} else if (char === "|" && prevChar !== ">") {
			separatorLength = 1;
		} else if (char === "&" && nextChar !== ">" && prevChar !== ">" && prevChar !== "<") {
			separatorLength = 1;
		}

		// Intentionally ignore semicolons here so unquoted sed scripts remain eligible for
		// segment-level rewriting instead of being treated as unsafe compound shells.
		if (separatorLength === 0) {
			continue;
		}

		pushSegment(index);
		segmentStart = index + separatorLength;
		if (separatorLength === 2) {
			index += 1;
		}
	}

	pushSegment(command.length);
	return segments;
}

function shouldBypassCargoRewrite(tokens: string[]): boolean {
	let index = 1;

	while (index < tokens.length && tokens[index].startsWith("+")) {
		index += 1;
	}

	while (index < tokens.length && tokens[index].startsWith("-")) {
		index += 1;
	}

	const subcommand = tokens[index]?.toLowerCase();
	if (!subcommand) {
		return true;
	}

	return BYPASSED_CARGO_SUBCOMMANDS.has(subcommand);
}

function normalizeCommandWord(token: string): string {
	const unwrapped = token.replace(/^(?:["'`])|(?:["'`])$/g, "");
	const lastPathSeparator = Math.max(unwrapped.lastIndexOf("/"), unwrapped.lastIndexOf("\\"));
	const basename = lastPathSeparator >= 0 ? unwrapped.slice(lastPathSeparator + 1) : unwrapped;
	return basename.toLowerCase();
}

function findInteractiveShellIndex(tokens: string[], startIndex: number, endIndex: number): number {
	for (let index = startIndex; index < endIndex; index += 1) {
		if (INTERACTIVE_CONTAINER_SHELLS.has(normalizeCommandWord(tokens[index] ?? ""))) {
			return index;
		}
	}

	return -1;
}

function hasTrailingArguments(tokens: string[], startIndex: number, endIndex: number): boolean {
	return startIndex >= 0 && startIndex < endIndex - 1;
}

function hasStructuredGhOutputFlag(tokens: string[]): boolean {
	return tokens.some((token) => {
		const normalized = token.toLowerCase();
		return GH_STRUCTURED_OUTPUT_FLAGS.some((flag) => normalized === flag || normalized.startsWith(`${flag}=`));
	});
}

function hasShortInteractiveFlag(token: string, flag: "i" | "t"): boolean {
	if (!token.startsWith("-") || token.startsWith("--")) {
		return false;
	}

	return token.slice(1).includes(flag);
}

function hasInteractiveFlagPair(tokens: string[], startIndex: number, endIndex: number): boolean {
	let interactive = false;
	let tty = false;

	for (let index = startIndex; index < endIndex; index += 1) {
		const token = tokens[index] ?? "";
		if (token === "--interactive") {
			interactive = true;
			continue;
		}
		if (token === "--tty") {
			tty = true;
			continue;
		}
		if (hasShortInteractiveFlag(token, "i")) {
			interactive = true;
		}
		if (hasShortInteractiveFlag(token, "t")) {
			tty = true;
		}
	}

	return interactive && tty;
}

function shouldBypassInteractiveContainerRewrite(tokens: string[]): boolean {
	const command = tokens[0]?.toLowerCase();
	if (!command) {
		return false;
	}

	if (command === "docker" || command === "podman") {
		const subcommand = tokens[1]?.toLowerCase();
		if (subcommand === "run" || subcommand === "exec") {
			const interactiveShellIndex = findInteractiveShellIndex(tokens, 2, tokens.length);
			return (
				interactiveShellIndex >= 0 &&
				!hasTrailingArguments(tokens, interactiveShellIndex, tokens.length) &&
				!hasInteractiveFlagPair(tokens, 2, interactiveShellIndex)
			);
		}

		if (subcommand === "compose") {
			const composeSubcommand = tokens[2]?.toLowerCase();
			if (composeSubcommand === "run" || composeSubcommand === "exec") {
				const interactiveShellIndex = findInteractiveShellIndex(tokens, 3, tokens.length);
				return (
					interactiveShellIndex >= 0 &&
					!hasTrailingArguments(tokens, interactiveShellIndex, tokens.length) &&
					!hasInteractiveFlagPair(tokens, 3, interactiveShellIndex)
				);
			}
		}
	}

	if (command === "kubectl" && tokens[1]?.toLowerCase() === "exec") {
		const separatorIndex = tokens.indexOf("--");
		if (separatorIndex === -1 || separatorIndex >= tokens.length - 1) {
			return false;
		}

		const interactiveShellIndex = findInteractiveShellIndex(tokens, separatorIndex + 1, tokens.length);
		if (interactiveShellIndex === -1) {
			return false;
		}

		return !hasTrailingArguments(tokens, interactiveShellIndex, tokens.length) && !hasInteractiveFlagPair(tokens, 2, separatorIndex);
	}

	return false;
}

function shouldBypassFindRewrite(tokens: string[]): boolean {
	return tokens.slice(1).some((token) => {
		const normalized = token.toLowerCase();
		return (
			BYPASSED_FIND_ACTIONS.has(normalized) ||
			normalized.startsWith("-exec") ||
			normalized.startsWith("-ok") ||
			normalized.startsWith("-printf") ||
			normalized.startsWith("-fprint") ||
			normalized.startsWith("-fls")
		);
	});
}

function shouldBypassLsRewrite(tokens: string[]): boolean {
	return tokens.slice(1).some((token) => token.startsWith("-"));
}

function shouldBypassNativeShellProxyRewrite(tokens: string[]): boolean {
	const command = normalizeCommandWord(tokens[0] ?? "");
	const firstArgument = tokens[1]?.toLowerCase();
	if (!command || !firstArgument) {
		return false;
	}

	if (command === "bash") {
		return BASH_INLINE_COMMAND_FLAGS.has(firstArgument);
	}

	if (command === "powershell" || command === "powershell.exe") {
		return POWERSHELL_INLINE_COMMAND_FLAGS.has(firstArgument);
	}

	if (command === "cmd" || command === "cmd.exe") {
		return CMD_INLINE_COMMAND_FLAGS.has(firstArgument);
	}

	return false;
}

/**
 * Skips entire compound commands when any segment depends on native shell piping or
 * formatting-sensitive search/list output that RTK wrappers may not preserve exactly.
 */
export function shouldBypassWholeCommandRewrite(command: string): boolean {
	const segments = splitTopLevelCompoundSegments(command.trim());
	if (segments.length <= 1) {
		return false;
	}

	return segments.some((segment) => {
		const tokens = splitCommandWords(segment);
		const commandName = normalizeCommandWord(tokens[0] ?? "");
		return UNSAFE_COMPOUND_REWRITE_COMMANDS.has(commandName) || shouldBypassNativeShellProxyRewrite(tokens);
	});
}

/**
 * Skips RTK rewrites for command shapes that do not map cleanly to RTK wrappers.
 */
export function shouldBypassRewriteForCommand(commandBody: string, rule: RtkRewriteRule): boolean {
	const tokens = splitCommandWords(commandBody.trim());
	if (tokens.length === 0) {
		return false;
	}

	if (tokens[0]?.toLowerCase() === "gh" && hasStructuredGhOutputFlag(tokens)) {
		return true;
	}

	if (rule.category === "rust" && tokens[0]?.toLowerCase() === "cargo") {
		return shouldBypassCargoRewrite(tokens);
	}

	if (rule.category === "containers") {
		return shouldBypassInteractiveContainerRewrite(tokens);
	}

	if (rule.id === "find") {
		return shouldBypassFindRewrite(tokens);
	}

	if (rule.id === "ls") {
		return shouldBypassLsRewrite(tokens);
	}

	if (rule.id === "bash-proxy" || rule.id === "cmd-proxy" || rule.id === "powershell-proxy") {
		return shouldBypassNativeShellProxyRewrite(tokens);
	}

	return false;
}
