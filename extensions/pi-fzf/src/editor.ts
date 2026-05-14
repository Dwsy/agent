import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions, TUI } from "@earendil-works/pi-tui";
import type { EditorTheme } from "@earendil-works/pi-tui";
import type { FffRuntime } from "./fff.ts";

const PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);
const MAX_FILE_RESULTS = 20;
const MAX_COMMAND_RESULTS = 40;

type CommandEntry = {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
};

export type PromptOrSkillCommand = {
	name: string;
	description?: string;
	source: "prompt" | "skill";
};

function findLastDelimiter(text: string): number {
	for (let i = text.length - 1; i >= 0; i -= 1) {
		if (PATH_DELIMITERS.has(text[i] ?? "")) return i;
	}
	return -1;
}

function isTokenStart(text: string, index: number): boolean {
	return index === 0 || PATH_DELIMITERS.has(text[index - 1] ?? "");
}

function findUnclosedQuoteStart(text: string): number | null {
	let inQuotes = false;
	let quoteStart = -1;
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === '"') {
			inQuotes = !inQuotes;
			if (inQuotes) quoteStart = i;
		}
	}
	return inQuotes ? quoteStart : null;
}

function extractAtPrefix(text: string): string | null {
	const quoteStart = findUnclosedQuoteStart(text);
	if (quoteStart !== null && quoteStart > 0 && text[quoteStart - 1] === "@" && isTokenStart(text, quoteStart - 1)) {
		return text.slice(quoteStart - 1);
	}

	const lastDelimiterIndex = findLastDelimiter(text);
	const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
	if (text[tokenStart] === "@") return text.slice(tokenStart);
	return null;
}

export function extractDollarPrefix(text: string): string | null {
	const quoteStart = findUnclosedQuoteStart(text);
	if (quoteStart !== null && quoteStart > 0 && text[quoteStart - 1] === "$" && isTokenStart(text, quoteStart - 1)) {
		return text.slice(quoteStart - 1);
	}

	const lastDelimiterIndex = findLastDelimiter(text);
	const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
	if (text[tokenStart] === "$") return text.slice(tokenStart);
	return null;
}

function parseAtPrefix(prefix: string): { rawQuery: string; isQuotedPrefix: boolean } {
	if (prefix.startsWith('@"')) return { rawQuery: prefix.slice(2), isQuotedPrefix: true };
	return { rawQuery: prefix.slice(1), isQuotedPrefix: false };
}

function normalizeInsertedPath(value: string): string {
	let normalized = value.trim();
	if (normalized.startsWith("@")) normalized = normalized.slice(1);
	if (normalized.startsWith('"') && normalized.endsWith('"') && normalized.length >= 2) {
		normalized = normalized.slice(1, -1);
	}
	return normalized;
}

function toFileSuggestion(relativePath: string, label: string, description: string, isQuotedPrefix: boolean): AutocompleteItem {
	const path = relativePath.replace(/\\/g, "/");
	const needsQuotes = isQuotedPrefix || path.includes(" ");
	return {
		value: needsQuotes ? `@"${path}"` : `@${path}`,
		label,
		description,
	};
}

function toPromptOrSkillCommands(commands: CommandEntry[]): PromptOrSkillCommand[] {
	return commands.filter((command): command is PromptOrSkillCommand => command.source === "prompt" || command.source === "skill");
}

function getCommandSearchText(command: PromptOrSkillCommand): string {
	const bareName = command.source === "skill" ? command.name.replace(/^skill:/, "") : command.name;
	return `${bareName} ${command.name} ${command.source} ${command.description ?? ""}`.trim();
}

function getCommandLabel(command: PromptOrSkillCommand): string {
	return `/${command.name}`;
}

function getCommandDescription(command: PromptOrSkillCommand): string {
	const kind = command.source === "skill" ? "skill" : "prompt";
	return command.description ? `${kind} · ${command.description}` : kind;
}

export function buildDollarSuggestions(commands: PromptOrSkillCommand[], query: string): AutocompleteItem[] {
	return fuzzyFilter(commands, query, getCommandSearchText)
		.slice(0, MAX_COMMAND_RESULTS)
		.map((command) => ({
			value: `/${command.name}`,
			label: getCommandLabel(command),
			description: getCommandDescription(command),
		}));
}

export function applyDollarCompletion(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
	item: AutocompleteItem,
	prefix: string,
): { lines: string[]; cursorLine: number; cursorCol: number } {
	const currentLine = lines[cursorLine] ?? "";
	const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
	const afterCursor = currentLine.slice(cursorCol);
	const suffix = afterCursor.startsWith(" ") ? "" : " ";
	const newLine = `${beforePrefix}${item.value}${suffix}${afterCursor}`;
	const nextLines = [...lines];
	nextLines[cursorLine] = newLine;
	return {
		lines: nextLines,
		cursorLine,
		cursorCol: beforePrefix.length + item.value.length + suffix.length,
	};
}

class FffAutocompleteProvider implements AutocompleteProvider {
	private readonly baseProvider: AutocompleteProvider;
	private readonly runtime: FffRuntime;
	private readonly getCommands: () => CommandEntry[];

	constructor(baseProvider: AutocompleteProvider, runtime: FffRuntime, getCommands: () => CommandEntry[]) {
		this.baseProvider = baseProvider;
		this.runtime = runtime;
		this.getCommands = getCommands;
	}

	async getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		options: { signal: AbortSignal; force?: boolean },
	): Promise<AutocompleteSuggestions | null> {
		const currentLine = lines[cursorLine] ?? "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);
		const atPrefix = extractAtPrefix(textBeforeCursor);
		if (atPrefix) {
			if (options.signal.aborted) return null;

			const { rawQuery, isQuotedPrefix } = parseAtPrefix(atPrefix);
			const candidatesResult = await this.runtime.searchFileCandidates(rawQuery, MAX_FILE_RESULTS);
			if (options.signal.aborted || candidatesResult.isErr() || candidatesResult.value.length === 0) {
				return this.baseProvider.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				prefix: atPrefix,
				items: candidatesResult.value.map((candidate) => {
					const matchType = candidate.score?.matchType ? ` · ${candidate.score.matchType}` : "";
					return toFileSuggestion(
						candidate.item.relativePath,
						candidate.item.fileName || candidate.item.relativePath,
						`${candidate.item.relativePath}${matchType}`,
						isQuotedPrefix,
					);
				}),
			};
		}

		const dollarPrefix = extractDollarPrefix(textBeforeCursor);
		if (dollarPrefix) {
			const query = dollarPrefix.slice(1);
			const items = buildDollarSuggestions(toPromptOrSkillCommands(this.getCommands()), query);
			if (items.length > 0) {
				return {
					prefix: dollarPrefix,
					items,
				};
			}
		}

		return this.baseProvider.getSuggestions(lines, cursorLine, cursorCol, options);
	}

	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: AutocompleteItem,
		prefix: string,
	): { lines: string[]; cursorLine: number; cursorCol: number } {
		if (prefix.startsWith("$")) {
			return applyDollarCompletion(lines, cursorLine, cursorCol, item, prefix);
		}
		void this.runtime.trackQuery(prefix, normalizeInsertedPath(item.value));
		return this.baseProvider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
	}

	shouldTriggerFileCompletion?(lines: string[], cursorLine: number, cursorCol: number): boolean {
		const candidate = this.baseProvider as AutocompleteProvider & {
			shouldTriggerFileCompletion?: (l: string[], line: number, col: number) => boolean;
		};
		return candidate.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
	}
}

export class FffEditor extends CustomEditor {
	private readonly runtime: FffRuntime;
	private readonly getCommands: () => CommandEntry[];

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		runtime: FffRuntime,
		getCommands: () => CommandEntry[],
	) {
		super(tui, theme, keybindings);
		this.runtime = runtime;
		this.getCommands = getCommands;
	}

	override setAutocompleteProvider(provider: AutocompleteProvider): void {
		super.setAutocompleteProvider(new FffAutocompleteProvider(provider, this.runtime, this.getCommands));
	}

	override handleInput(data: string): void {
		// Check if this is a printable character that should trigger $ autocomplete
		if (data.charCodeAt(0) >= 32 && data.length === 1 && !this.isShowingAutocomplete()) {
			const currentLine = this.getLines()[this.getCursor().line] ?? "";
			const cursorCol = this.getCursor().col;
			const textBeforeCursor = currentLine.slice(0, cursorCol);

			// Auto-trigger for "$" at token boundaries
			if (data === "$") {
				const charBeforeDollar = textBeforeCursor[textBeforeCursor.length - 1];
				if (textBeforeCursor.length === 0 || charBeforeDollar === " " || charBeforeDollar === "\t") {
					// Insert the $ character first
					super.handleInput(data);
					// Then trigger autocomplete using Tab key to invoke the parent's autocomplete flow
					super.handleInput("\t");
					return;
				}
			}
			// Continue typing in $ context - check if we're in a $... context
			else if (/[a-zA-Z0-9.\-_]/.test(data)) {
				if (textBeforeCursor.match(/(?:^|[\s])\$[^\s]*$/)) {
					// Insert the character first
					super.handleInput(data);
					// Then trigger autocomplete update using Tab key
					super.handleInput("\t");
					return;
				}
			}
		}

		// Fall through to parent handling
		super.handleInput(data);
	}
}
