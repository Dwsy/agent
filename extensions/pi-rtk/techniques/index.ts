// Re-export all techniques
export { stripAnsi, stripAnsiFast } from "./ansi";
export { truncate, truncateLines } from "./truncate";
export { filterBuildOutput, isBuildCommand } from "./build";
export { aggregateTestOutput, isTestCommand } from "./test-output";
export { aggregateLinterOutput, isLinterCommand } from "./linter";
export {
	detectLanguage,
	filterMinimal,
	filterAggressive,
	smartTruncate,
	filterSourceCode,
	type Language,
} from "./source";
export { compactDiff, compactStatus, compactLog, compactGitOutput, isGitCommand } from "./git";
export { groupSearchResults, isSearchCommand } from "./search";
