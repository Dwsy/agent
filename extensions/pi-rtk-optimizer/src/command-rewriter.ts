import { shouldBypassRewriteForCommand, shouldBypassWholeCommandRewrite } from "./rewrite-bypass.js";
import { RTK_REWRITE_RULES, type RtkRewriteCategory, type RtkRewriteRule } from "./rewrite-rules.js";
import type { RtkIntegrationConfig } from "./types.js";

const ENV_PREFIX_PATTERN = /^((?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*)/;
const SHELL_ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

type CommandToken =
	| {
			type: "segment";
			value: string;
	  }
	| {
			type: "separator";
			value: string;
	  };

type SedNextTokenMode = "none" | "defaultScript" | "expressionScript" | "fileArgument" | "inPlaceArgument";

interface SegmentParseState {
	commandName?: string;
	sedNextTokenMode: SedNextTokenMode;
	sedScriptSeen: boolean;
}

export interface RewriteDecision {
	changed: boolean;
	originalCommand: string;
	rewrittenCommand: string;
	rule?: RtkRewriteRule;
	reason:
		| "ok"
		| "empty"
		| "already_rtk"
		| "heredoc"
		| "disabled_category"
		| "no_match";
}

interface SegmentRewriteResult {
	value: string;
	changed: boolean;
	rule?: RtkRewriteRule;
	skippedByDisabledCategory: boolean;
	considered: boolean;
	alreadyRtk: boolean;
}

interface SingleSegmentRewriteResult {
	changed: boolean;
	rule?: RtkRewriteRule;
	rewrittenBody?: string;
	skippedByDisabledCategory: boolean;
	alreadyRtk: boolean;
}

function categoryEnabled(config: RtkIntegrationConfig, category: RtkRewriteCategory): boolean {
	switch (category) {
		case "gitGithub":
			return config.rewriteGitGithub;
		case "filesystem":
			return config.rewriteFilesystem;
		case "rust":
			return config.rewriteRust;
		case "javascript":
			return config.rewriteJavaScript;
		case "python":
			return config.rewritePython;
		case "go":
			return config.rewriteGo;
		case "containers":
			return config.rewriteContainers;
		case "network":
			return config.rewriteNetwork;
		case "packageManagers":
			return config.rewritePackageManagers;
		default:
			return true;
	}
}

function createSegmentParseState(): SegmentParseState {
	return {
		sedNextTokenMode: "none",
		sedScriptSeen: false,
	};
}

function normalizeShellWord(word: string): string {
	const unwrapped = word.replace(/^(?:["'`])|(?:["'`])$/g, "");
	const lastPathSeparator = Math.max(unwrapped.lastIndexOf("/"), unwrapped.lastIndexOf("\\"));
	const basename = lastPathSeparator >= 0 ? unwrapped.slice(lastPathSeparator + 1) : unwrapped;
	return basename.toLowerCase();
}

function shouldProtectSedWord(state: SegmentParseState): boolean {
	return (
		state.commandName === "sed" &&
		!state.sedScriptSeen &&
		(state.sedNextTokenMode === "defaultScript" ||
			state.sedNextTokenMode === "expressionScript" ||
			state.sedNextTokenMode === "inPlaceArgument")
	);
}

function isQuotedEmptyToken(word: string): boolean {
	return word === "''" || word === '""';
}

function looksLikeSedBackupExtension(word: string): boolean {
	const normalized = word.replace(/^(?:["'`])|(?:["'`])$/g, "");
	return normalized.startsWith(".") || normalized === "*";
}

function updateSegmentParseState(state: SegmentParseState, word: string): SegmentParseState {
	if (!word) {
		return state;
	}

	if (!state.commandName) {
		if (SHELL_ENV_ASSIGNMENT_PATTERN.test(word)) {
			return state;
		}

		const commandName = normalizeShellWord(word);
		return {
			commandName,
			sedNextTokenMode: "none",
			sedScriptSeen: false,
		};
	}

	if (state.commandName !== "sed" || state.sedScriptSeen) {
		return state;
	}

	if (state.sedNextTokenMode === "expressionScript") {
		return {
			...state,
			sedNextTokenMode: "none",
			sedScriptSeen: true,
		};
	}

	if (state.sedNextTokenMode === "fileArgument") {
		return {
			...state,
			sedNextTokenMode: "none",
		};
	}

	if (state.sedNextTokenMode === "inPlaceArgument") {
		if (isQuotedEmptyToken(word) || looksLikeSedBackupExtension(word)) {
			return {
				...state,
				sedNextTokenMode: "defaultScript",
			};
		}

		return {
			...state,
			sedNextTokenMode: "none",
			sedScriptSeen: true,
		};
	}

	if (state.sedNextTokenMode === "defaultScript") {
		return {
			...state,
			sedNextTokenMode: "none",
			sedScriptSeen: true,
		};
	}

	if (word === "--") {
		return {
			...state,
			sedNextTokenMode: "defaultScript",
		};
	}

	if (word === "-e" || word === "--expression") {
		return {
			...state,
			sedNextTokenMode: "expressionScript",
		};
	}

	if (word.startsWith("--expression=")) {
		return {
			...state,
			sedScriptSeen: true,
		};
	}

	if (/^-[A-Za-z]*e[A-Za-z]*$/.test(word)) {
		return {
			...state,
			sedNextTokenMode: "expressionScript",
		};
	}

	if (word === "-f" || word === "--file") {
		return {
			...state,
			sedNextTokenMode: "fileArgument",
		};
	}

	if (word.startsWith("--file=") || /^-f.+$/.test(word)) {
		return state;
	}

	if (word === "-i" || word === "--in-place") {
		return {
			...state,
			sedNextTokenMode: "inPlaceArgument",
		};
	}

	if (word.startsWith("--in-place=") || /^-i.+$/.test(word)) {
		return {
			...state,
			sedNextTokenMode: "defaultScript",
		};
	}

	if (word.startsWith("-")) {
		return state;
	}

	return {
		...state,
		sedScriptSeen: true,
	};
}

function tokenizeCommand(command: string): CommandToken[] {
	if (!command) {
		return [];
	}

	const tokens: CommandToken[] = [];
	let segmentStart = 0;
	let segmentState = createSegmentParseState();
	let currentWordStart: number | null = null;
	let currentWordProtected = false;
	let quote: "'" | '"' | "`" | null = null;
	let escaped = false;

	const finalizeWord = (endIndexExclusive: number): void => {
		if (currentWordStart === null) {
			return;
		}

		const word = command.slice(currentWordStart, endIndexExclusive);
		segmentState = updateSegmentParseState(segmentState, word);
		currentWordStart = null;
		currentWordProtected = false;
	};

	const pushSeparator = (index: number, length: number): void => {
		finalizeWord(index);
		const segment = command.slice(segmentStart, index);
		if (segment.length > 0) {
			tokens.push({ type: "segment", value: segment });
		}
		tokens.push({ type: "separator", value: command.slice(index, index + length) });
		segmentStart = index + length;
		segmentState = createSegmentParseState();
	};

	const beginWord = (index: number): void => {
		if (currentWordStart !== null) {
			return;
		}

		currentWordStart = index;
		currentWordProtected = shouldProtectSedWord(segmentState);
	};

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
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
			beginWord(index);
			escaped = true;
			continue;
		}

		if (/\s/.test(char)) {
			finalizeWord(index);
			continue;
		}

		if (!currentWordProtected) {
			if (char === "&" && nextChar === "&") {
				pushSeparator(index, 2);
				index += 1;
				continue;
			}

			if (char === "|" && nextChar === "|") {
				pushSeparator(index, 2);
				index += 1;
				continue;
			}

			if (char === "|" && nextChar === "&") {
				pushSeparator(index, 2);
				index += 1;
				continue;
			}

			if (char === "|" && prevChar !== ">") {
				pushSeparator(index, 1);
				continue;
			}

			if (char === "&" && nextChar !== ">" && prevChar !== ">" && prevChar !== "<") {
				pushSeparator(index, 1);
				continue;
			}

			if (char === ";") {
				pushSeparator(index, 1);
				continue;
			}
		}

		if (char === "'" || char === '"' || char === "`") {
			beginWord(index);
			quote = char;
			continue;
		}

		beginWord(index);
	}

	finalizeWord(command.length);

	const tail = command.slice(segmentStart);
	if (tail.length > 0 || tokens.length === 0) {
		tokens.push({ type: "segment", value: tail });
	}

	return tokens;
}

export function isAlreadyRtkCommand(command: string): boolean {
	const trimmed = command.trimStart();
	return /^rtk\s+/.test(trimmed) || /(?:^|\s)[^\s]*\/rtk\s+/.test(trimmed);
}

function applyPlatformProxyCommandFixups(command: string): string {
	if (process.platform !== "win32") {
		return command;
	}

	const windowsProxyExecutables: Array<[string, string]> = [
		["npm", "npm.cmd"],
		["npx", "npx.cmd"],
		["pnpm", "pnpm.cmd"],
		["yarn", "yarn.cmd"],
	];

	let next = command;
	for (const [base, windowsExecutable] of windowsProxyExecutables) {
		next = next.replace(
			new RegExp(`^(rtk\\s+proxy\\s+)${base}(\\b)`, "i"),
			`$1${windowsExecutable}$2`,
		);
	}

	return next;
}

function rewriteSingleSegmentCommand(
	segmentCommand: string,
	config: RtkIntegrationConfig,
): SingleSegmentRewriteResult {
	const envMatch = segmentCommand.match(ENV_PREFIX_PATTERN);
	const envPrefix = envMatch?.[1] ?? "";
	const commandBody = segmentCommand.slice(envPrefix.length);

	if (isAlreadyRtkCommand(segmentCommand) || isAlreadyRtkCommand(commandBody)) {
		return {
			changed: false,
			alreadyRtk: true,
			skippedByDisabledCategory: false,
		};
	}

	let skippedByDisabledCategory = false;

	for (const rule of RTK_REWRITE_RULES) {
		if (!categoryEnabled(config, rule.category)) {
			skippedByDisabledCategory = true;
			continue;
		}

		rule.matcher.lastIndex = 0;
		if (!rule.matcher.test(commandBody)) {
			continue;
		}

		rule.matcher.lastIndex = 0;
		if (shouldBypassRewriteForCommand(commandBody, rule)) {
			continue;
		}

		const rewrittenBody = commandBody.replace(rule.matcher, rule.replacement);
		const finalizedRewrittenBody = applyPlatformProxyCommandFixups(rewrittenBody);
		if (finalizedRewrittenBody === commandBody) {
			continue;
		}

		return {
			changed: true,
			rule,
			rewrittenBody: finalizedRewrittenBody,
			alreadyRtk: false,
			skippedByDisabledCategory,
		};
	}

	return {
		changed: false,
		alreadyRtk: false,
		skippedByDisabledCategory,
	};
}

function rewriteSegment(segment: string, config: RtkIntegrationConfig): SegmentRewriteResult {
	const leadingWhitespace = segment.match(/^\s*/)?.[0] ?? "";
	const trailingWhitespace = segment.match(/\s*$/)?.[0] ?? "";
	const core = segment.trim();

	if (!core) {
		return {
			value: segment,
			changed: false,
			skippedByDisabledCategory: false,
			considered: false,
			alreadyRtk: false,
		};
	}

	const rewrite = rewriteSingleSegmentCommand(core, config);
	if (!rewrite.changed || !rewrite.rule) {
		return {
			value: segment,
			changed: false,
			rule: undefined,
			skippedByDisabledCategory: rewrite.skippedByDisabledCategory,
			considered: true,
			alreadyRtk: rewrite.alreadyRtk,
		};
	}

	const envMatch = core.match(ENV_PREFIX_PATTERN);
	const envPrefix = envMatch?.[1] ?? "";
	const commandBody = core.slice(envPrefix.length);
	rewrite.rule.matcher.lastIndex = 0;
	const rewrittenBody = rewrite.rewrittenBody ?? commandBody.replace(rewrite.rule.matcher, rewrite.rule.replacement);

	return {
		value: `${leadingWhitespace}${envPrefix}${rewrittenBody}${trailingWhitespace}`,
		changed: true,
		rule: rewrite.rule,
		skippedByDisabledCategory: rewrite.skippedByDisabledCategory,
		considered: true,
		alreadyRtk: false,
	};
}

export function computeRewriteDecision(command: string, config: RtkIntegrationConfig): RewriteDecision {
	const original = command;
	const trimmed = command.trim();
	if (!trimmed) {
		return {
			changed: false,
			originalCommand: original,
			rewrittenCommand: original,
			reason: "empty",
		};
	}

	if (trimmed.includes("<<")) {
		return {
			changed: false,
			originalCommand: original,
			rewrittenCommand: original,
			reason: "heredoc",
		};
	}

	if (!isAlreadyRtkCommand(command) && shouldBypassWholeCommandRewrite(command)) {
		return {
			changed: false,
			originalCommand: original,
			rewrittenCommand: original,
			reason: "no_match",
		};
	}

	const tokens = tokenizeCommand(command);
	if (tokens.length === 0) {
		return {
			changed: false,
			originalCommand: original,
			rewrittenCommand: original,
			reason: "no_match",
		};
	}

	let changed = false;
	let skippedByDisabledCategory = false;
	let firstRule: RtkRewriteRule | undefined;
	let consideredSegments = 0;
	let alreadyRtkSegments = 0;

	const rewrittenTokens = tokens.map((token) => {
		if (token.type === "separator") {
			return token;
		}

		const result = rewriteSegment(token.value, config);
		if (result.considered) {
			consideredSegments += 1;
			if (result.alreadyRtk) {
				alreadyRtkSegments += 1;
			}
		}
		if (result.skippedByDisabledCategory) {
			skippedByDisabledCategory = true;
		}
		if (result.changed) {
			changed = true;
			if (!firstRule) {
				firstRule = result.rule;
			}
		}

		return {
			type: "segment" as const,
			value: result.value,
		};
	});

	if (changed) {
		return {
			changed: true,
			originalCommand: original,
			rewrittenCommand: rewrittenTokens.map((token) => token.value).join(""),
			rule: firstRule,
			reason: "ok",
		};
	}

	if (consideredSegments > 0 && consideredSegments === alreadyRtkSegments) {
		return {
			changed: false,
			originalCommand: original,
			rewrittenCommand: original,
			reason: "already_rtk",
		};
	}

	return {
		changed: false,
		originalCommand: original,
		rewrittenCommand: original,
		reason: skippedByDisabledCategory ? "disabled_category" : "no_match",
	};
}
