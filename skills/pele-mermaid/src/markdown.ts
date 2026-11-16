/**
 * Markdown fence scanning for `pele-mermaid`.
 *
 * Only the fence layer lives here: finding ```mermaid blocks in a document and
 * rewriting them as image links. No rendering, no filesystem.
 */

export interface Block {
	/** 1-based position of the block within the document. */
	n: number;
	/** Index of the opening fence line. */
	startLine: number;
	/** Index of the closing fence line (falls back to the last line when unclosed). */
	endLine: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function isMermaidInfo(info: string): boolean {
	const trimmed = info.trim();
	return /^(mermaid|mmd)\b/i.test(trimmed) || /^\{[^}]*\.mermaid\b/.test(trimmed);
}

/** Returns every mermaid block in order. Non-mermaid fences are skipped and skipped whole. */
export function scanBlocks(lines: readonly string[]): Block[] {
	const blocks: Block[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const open = FENCE.exec(lines[i]);
		if (!open || !isMermaidInfo(open[2] ?? "")) continue;
		const fenceChar = open[1][0];
		const fenceLength = open[1].length;
		let endLine = lines.length;
		for (let j = i + 1; j < lines.length; j += 1) {
			const close = FENCE.exec(lines[j]);
			const closes = close && close[1][0] === fenceChar && close[1].length >= fenceLength && (close[2] ?? "").trim() === "";
			if (closes) {
				endLine = j;
				break;
			}
		}
		blocks.push({ n: blocks.length + 1, startLine: i, endLine });
		i = endLine;
	}
	return blocks;
}

export function blockSource(lines: readonly string[], block: Block): string {
	return lines.slice(block.startLine + 1, block.endLine).join("\n");
}

/** Replaces each block that rendered successfully with an image link; keeps failed blocks verbatim. */
export function inlineMarkdown(
	lines: readonly string[],
	blocks: readonly Block[],
	links: ReadonlyMap<number, string>,
): string {
	const out: string[] = [];
	let cursor = 0;
	for (const block of blocks) {
		out.push(...lines.slice(cursor, block.startLine));
		const href = links.get(block.n);
		if (href) out.push(`![diagram ${block.n}](${href})`);
		else out.push(...lines.slice(block.startLine, block.endLine + 1));
		cursor = block.endLine + 1;
	}
	out.push(...lines.slice(cursor));
	return out.join("\n");
}
