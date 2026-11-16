#!/usr/bin/env bun
/**
 * pele-mermaid — render the ```mermaid blocks of a Markdown file, or one .mmd file,
 * into standalone .svg files. Offline: Pele is vendored, nothing to install.
 *
 * stdout is always one JSON document: { ok: true, ... } or { ok: false, error: {...} }.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { auditSummary, auditSvg } from "./audit.js";
import { blockSource, inlineMarkdown, scanBlocks, type Block } from "./markdown.js";
import { describeError, renderDiagram, type DiagramError, type Theme } from "./svg.js";

const USAGE = `pele-mermaid <input.md|input.mmd|-> [options]

  -o, --out <dir>       Output directory. Default: <inputDir>/<stem>-svg/ for .md, <inputDir> for .mmd.
      --mmd             Treat the input as one diagram, not Markdown.
      --inline          Also write <stem>.md with each mermaid block replaced by an image link.
      --theme <name>    light | dark. Default: light.
      --font <family>   Label font; used for both measurement and output.
      --max-width <n>   Layout width in px. 0 = natural width. Default: 900.
      --transparent     Do not paint an opaque background rect.
      --label <text>    Accessible name for the drawing (role="img" + aria-label).
      --audit           Report label legibility and overlap problems found in the output.
  -h, --help            Show this message.

Output JSON: { ok, input, outDir, theme, srcWidth, count, files[], errors[], inline? }
`;

interface Options {
	input: string;
	out?: string;
	mmd: boolean;
	inline: boolean;
	theme: Theme;
	font?: string;
	maxWidth: number;
	transparent: boolean;
	label?: string;
	audit: boolean;
}

class Fatal extends Error {}

function readTheme(raw: string | undefined): Theme {
	if (raw === "light" || raw === "dark") return raw;
	throw new Fatal(`--theme must be light or dark, got ${JSON.stringify(raw)}`);
}

function readMaxWidth(raw: string | undefined): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) throw new Fatal(`--max-width must be an integer >= 0, got ${JSON.stringify(raw)}`);
	return n;
}

function parseArgs(argv: readonly string[]): Options | "help" {
	const options: Options = { input: "", mmd: false, inline: false, theme: "light", maxWidth: 900, transparent: false, audit: false };
	const positionals: string[] = [];

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const value = (name: string): string => {
			const next = argv[i + 1];
			if (next === undefined) throw new Fatal(`${name} needs a value`);
			i += 1;
			return next;
		};
		if (arg === "-h" || arg === "--help") return "help";
		else if (arg === "--mmd") options.mmd = true;
		else if (arg === "--inline") options.inline = true;
		else if (arg === "--transparent") options.transparent = true;
		else if (arg === "--audit") options.audit = true;
		else if (arg === "-o" || arg === "--out") options.out = value(arg);
		else if (arg === "--font") options.font = value(arg);
		else if (arg === "--label") options.label = value(arg);
		else if (arg === "--theme") options.theme = readTheme(value(arg));
		else if (arg.startsWith("--theme=")) options.theme = readTheme(arg.slice(8));
		else if (arg === "--max-width") options.maxWidth = readMaxWidth(value(arg));
		else if (arg.startsWith("--max-width=")) options.maxWidth = readMaxWidth(arg.slice(12));
		else if (arg === "-") positionals.push(arg);
		else if (arg.startsWith("-")) throw new Fatal(`unknown option ${arg}`);
		else positionals.push(arg);
	}

	if (positionals.length === 0) throw new Fatal("missing input path (use - for stdin)");
	if (positionals.length > 1) throw new Fatal(`expected one input, got ${positionals.length}`);
	options.input = positionals[0];
	return options;
}

function isSingleDiagram(options: Options): boolean {
	if (options.mmd) return true;
	if (options.input === "-") return false;
	const ext = extname(options.input).toLowerCase();
	if (ext === ".mmd" || ext === ".mermaid") return true;
	if (ext === ".md" || ext === ".markdown" || ext === "") return false;
	throw new Fatal(`unsupported input extension ${ext}; expected .md, .markdown, .mmd or -`);
}

function readInput(input: string): string {
	if (input === "-") return readFileSync(0, "utf8");
	try {
		return readFileSync(input, "utf8");
	} catch (error) {
		throw new Fatal(`cannot read ${input}: ${(error as NodeJS.ErrnoException).message}`);
	}
}

function resolveOutDir(options: Options, stem: string, single: boolean): string {
	if (options.out) return resolve(options.out);
	if (options.input === "-") throw new Fatal("stdin input needs --out");
	if (single) return resolve(dirname(options.input));
	return resolve(dirname(options.input), `${stem}-svg`);
}

interface RenderedFile {
	n: number;
	type: string;
	mermaidType: string;
	width: number;
	height: number;
	path: string;
	bytes: number;
	/** Problems found in this file; empty when clean. */
	warnings: string[];
}

function run(): unknown {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed === "help") return { ok: true, usage: USAGE };
	const options = parsed;

	const text = readInput(options.input);
	const single = isSingleDiagram(options);
	const stem = options.input === "-" ? "stdin" : basename(options.input, extname(options.input));
	const lines = text.split(/\r?\n/);
	const blocks: Block[] = single ? [{ n: 1, startLine: -1, endLine: -1 }] : scanBlocks(lines);

	if (blocks.length === 0) {
		throw new Fatal(`no \`\`\`mermaid blocks found in ${options.input} (use --mmd to treat the input as one diagram)`);
	}

	const outDir = resolveOutDir(options, stem, single);
	mkdirSync(outDir, { recursive: true });

	const files: RenderedFile[] = [];
	const errors: DiagramError[] = [];
	const links = new Map<number, string>();

	for (const block of blocks) {
		const source = single ? text : blockSource(lines, block);
		try {
			const results = renderDiagram({
				source,
				theme: options.theme,
				font: options.font,
				maxWidth: options.maxWidth,
				transparent: options.transparent,
				label: options.label,
			});
			const { svg, ...meta } = results;
			const filename = single ? `${stem}.svg` : `${stem}-${block.n}.svg`;
			const path = resolve(outDir, filename);
			writeFileSync(path, svg, "utf8");
			links.set(block.n, `./${filename}`);
			files.push({
				n: block.n,
				...meta,
				path,
				bytes: new TextEncoder().encode(svg).length,
				warnings: options.audit ? auditSummary(auditSvg(svg)) : [],
			});
		} catch (error) {
			errors.push(describeError(error, block.n));
		}
	}

	const inlinePath = options.inline && !single ? resolve(outDir, `${stem}.md`) : undefined;
	if (inlinePath) writeFileSync(inlinePath, inlineMarkdown(lines, blocks, links), "utf8");

	return {
		ok: errors.length === 0,
		input: options.input === "-" ? "<stdin>" : resolve(options.input),
		outDir,
		theme: options.theme,
		maxWidth: options.maxWidth,
		count: files.length,
		files,
		...(inlinePath ? { inline: inlinePath } : {}),
		...(errors.length > 0 ? { errors } : {}),
	};
}

try {
	const payload = run();
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
	process.exit((payload as { ok: boolean }).ok ? 0 : 1);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stdout.write(`${JSON.stringify({ ok: false, error: { message } }, null, 2)}\n`);
	if (error instanceof Fatal) process.stderr.write(`${USAGE}\n`);
	process.exit(1);
}
