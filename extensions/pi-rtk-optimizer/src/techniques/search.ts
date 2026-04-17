import { compactPath } from "./path-utils.js";

interface SearchResult {
	file: string;
	lineNumber: string;
	content: string;
}

export function groupSearchResults(output: string, maxResults = 50): string | null {
	const results: SearchResult[] = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const match = line.match(/^(.+?):(\d+)?:(.+)$/);
		if (!match) {
			continue;
		}
		results.push({
			file: match[1] ?? "unknown",
			lineNumber: match[2] ?? "?",
			content: match[3] ?? "",
		});
	}

	if (results.length === 0) {
		return null;
	}

	const byFile = new Map<string, SearchResult[]>();
	for (const result of results) {
		const existing = byFile.get(result.file) ?? [];
		existing.push(result);
		byFile.set(result.file, existing);
	}

	let outputText = `${results.length} matches in ${byFile.size} files:\n\n`;
	const sortedFiles = Array.from(byFile.entries()).sort((left, right) =>
		left[0].localeCompare(right[0]),
	);

	let shown = 0;
	for (const [file, matches] of sortedFiles) {
		if (shown >= maxResults) {
			break;
		}
		outputText += `> ${compactPath(file, 50)} (${matches.length} matches):\n`;
		for (const match of matches.slice(0, 10)) {
			let cleaned = match.content.trim();
			if (cleaned.length > 70) {
				cleaned = `${cleaned.slice(0, 67)}...`;
			}
			outputText += `    ${match.lineNumber}: ${cleaned}\n`;
			shown++;
		}
		if (matches.length > 10) {
			outputText += `  +${matches.length - 10} more\n`;
		}
		outputText += "\n";
	}

	if (results.length > shown) {
		outputText += `... +${results.length - shown} more\n`;
	}

	return outputText;
}
