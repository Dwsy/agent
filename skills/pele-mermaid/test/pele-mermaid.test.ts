import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditSvg } from "../src/audit.ts";
import { blockSource, inlineMarkdown, scanBlocks } from "../src/markdown.ts";
import { renderDiagram } from "../src/svg.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

interface Manifest {
	ok: boolean;
	count?: number;
	outDir?: string;
	files?: { n: number; type: string; width: number; height: number; path: string; bytes: number; warnings: string[] }[];
	errors?: { n: number; code: string; line?: number }[];
	inline?: string;
	error?: { message: string };
}

function run(args: string[], stdin = ""): { code: number; out: Manifest } {
	const proc = Bun.spawnSync(["bun", CLI, ...args], { stdin: new TextEncoder().encode(stdin) });
	return { code: proc.exitCode ?? 0, out: JSON.parse(proc.stdout.toString()) as Manifest };
}

function dir(): string {
	return mkdtempSync(join(tmpdir(), "pele-mermaid-test-"));
}

const FLOW = "```mermaid\ngraph TD\n  A --> B\n```\n";
const SEQ = "~~~mermaid title='x'\nsequenceDiagram\n  A->>B: hi\n~~~\n";

describe("markdown scanning", () => {
	test("extracts backtick and tilde blocks, ignores other languages", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, `# t\n\n${FLOW}\ntext\n${SEQ}\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`);

		const { code, out } = run([input]);

		expect(code).toBe(0);
		expect(out.ok).toBe(true);
		expect(out.count).toBe(2);
		expect(out.files?.map((f) => f.path.split("/").pop())).toEqual(["doc-1.svg", "doc-2.svg"]);
		expect(out.files?.map((f) => f.type)).toEqual(["flowchart", "sequence"]);
		expect(out.outDir).toBe(join(base, "doc-svg"));
	});

	test("reports an unclosed fence as a block", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, "```mermaid\ngraph TD\n  A --> B\n");

		expect(run([input]).out.count).toBe(1);
	});

	test("ignores non-mermaid info strings and four-space indentation", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, "```mermaidjs\ngraph TD\n```\n\n    ```mermaid\n    graph TD\n    ```\n");

		const { code, out } = run([input]);

		expect(code).toBe(1);
		expect(out.error?.message).toContain("no ```mermaid blocks");
	});

	test("accepts the {.mermaid} info string", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, "```{.mermaid}\ngraph TD\n  A --> B\n```\n");

		expect(run([input]).out.count).toBe(1);
	});

	test("blockSource returns the fence content only", () => {
		const lines = "before\n```mermaid\ngraph TD\n  A --> B\n```\nafter".split("\n");
		const [block] = scanBlocks(lines);

		expect(blockSource(lines, block)).toBe("graph TD\n  A --> B");
	});

	test("inlineMarkdown keeps failed blocks and replaces successful ones", () => {
		const lines = "a\n```mermaid\ngraph TD\n```\nb\n```mermaid\nbroken\n```".split("\n");
		const blocks = scanBlocks(lines);
		const md = inlineMarkdown(lines, blocks, new Map([[1, "./x-1.svg"]]));

		expect(md).toContain("![diagram 1](./x-1.svg)");
		expect(md).toContain("```mermaid\nbroken\n```");
	});
});

describe("svg output", () => {
	test("single .mmd renders next to the input as <stem>.svg", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "mindmap\n  root((r))\n    a\n");

		const { out } = run([input]);

		expect(out.outDir).toBe(base);
		expect(out.files?.[0].path).toBe(join(base, "one.svg"));
		expect(readFileSync(join(base, "one.svg"), "utf8")).toContain("<svg");
	});

	test("light theme keeps Pele fallbacks and paints an opaque background", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input]);
		const svg = readFileSync(join(base, "one.svg"), "utf8");

		expect(svg).not.toContain("--pele-bg:#100f0f");
		expect(svg).toContain('class="pele-bg"');
	});

	test("dark theme inlines the dark variables", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input, "--theme", "dark"]);
		const svg = readFileSync(join(base, "one.svg"), "utf8");

		expect(svg).toContain("--pele-bg:#100f0f");
		expect(svg).toContain("--pele-fg:#cecdc3");
	});

	test("--transparent drops the background rect", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input, "--transparent"]);

		expect(readFileSync(join(base, "one.svg"), "utf8")).not.toContain('class="pele-bg"');
	});

	test("--font is applied to both measurement and output", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input, "--font", "Menlo, monospace"]);

		expect(readFileSync(join(base, "one.svg"), "utf8")).toContain("--pele-font:Menlo, monospace");
	});

	test("--label writes an accessible name and role", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input, "--label", "订单流转"]);
		const svg = readFileSync(join(base, "one.svg"), "utf8");

		expect(svg).toContain('aria-label="订单流转"');
		expect(svg).toContain('role="img"');
	});

	test("no label keeps Pele's own role", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input]);

		expect(readFileSync(join(base, "one.svg"), "utf8")).toContain('role="graphics-document document"');
	});

	test("labels are never drawn under 12px", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "xychart\n  title \"T\"\n  x-axis [a, b]\n  y-axis \"v\" 0 --> 10\n  bar [1, 2]\n");

		run([input]);
		const svg = readFileSync(join(base, "one.svg"), "utf8");
		const sizes = [...svg.matchAll(/font-size(?:="|:\s*)([\d.]+)/g)].map((m) => Number(m[1]));

		expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
	});

	test("the output is one well-formed XML document", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		run([input]);
		const svg = readFileSync(join(base, "one.svg"), "utf8");

		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
		expect(svg.match(/<svg\b/g)?.length).toBe(1);
	});

	test("--inline rewrites rendered blocks and keeps failed ones", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, `# t\n\n${FLOW}\nbroken:\n\n\`\`\`mermaid\nflowchart LR\n  A[ --> B[\n\`\`\`\n`);

		const { code, out } = run([input, "--inline"]);

		expect(code).toBe(1);
		expect(out.inline).toBe(join(base, "doc-svg", "doc.md"));
		const md = readFileSync(out.inline as string, "utf8");
		expect(md).toContain("![diagram 1](./doc-1.svg)");
		expect(md).toContain("A[ --> B[");
	});
});

describe("audit", () => {
	test("reports no problem for a small clean diagram", () => {
		const result = renderDiagram({ source: "graph TD\n  A[起] --> B[止]", theme: "light", maxWidth: 900, transparent: false });
		const audit = auditSvg(result.svg);

		expect(audit.tinyLabels).toEqual([]);
		expect(audit.overlaps).toEqual([]);
		expect(audit.overflowing).toEqual([]);
	});

	test("follows ancestor transforms when placing labels", () => {
		const result = renderDiagram({ source: "graph TD\n  A[起] --> B[止]", theme: "light", maxWidth: 900, transparent: false });
		const audit = auditSvg(result.svg);

		// Two nodes side by side would overlap if the group offsets were ignored.
		expect(audit.overlaps).toEqual([]);
		expect(audit.width).toBeGreaterThan(0);
	});

	test("flags a diagram that shrinks below the label floor", () => {
		const wide = "flowchart LR\n" + Array.from({ length: 12 }, (_, i) => `  N${i}[节点${i}]`).join(" --> ");
		const result = renderDiagram({ source: wide, theme: "light", maxWidth: 2000, transparent: false });

		expect(auditSvg(result.svg).unreadableWhenScaled).toBe(true);
	});

	test("--audit fills the warnings field", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		const { out } = run([input, "--audit"]);

		expect(out.files?.[0].warnings).toEqual([]);
	});
});

describe("failures", () => {
	test("partial failure keeps the good files and reports the bad block", () => {
		const base = dir();
		const input = join(base, "doc.md");
		writeFileSync(input, `${FLOW}\n\`\`\`mermaid\nflowchart LR\n  A[ --> B[\n\`\`\`\n`);

		const { code, out } = run([input]);

		expect(code).toBe(1);
		expect(out.ok).toBe(false);
		expect(out.count).toBe(1);
		expect(out.errors?.[0].code).toBe("syntax");
		expect(out.errors?.[0].line).toBeGreaterThan(0);
	});

	test("stdin markdown needs --out", () => {
		const { code, out } = run(["-"], FLOW);

		expect(code).toBe(1);
		expect(out.error?.message).toContain("stdin input needs --out");
	});

	test("stdin single diagram renders with --mmd", () => {
		const base = dir();
		const { code, out } = run(["-", "--mmd", "-o", base], "graph TD\n  A --> B\n");

		expect(code).toBe(0);
		expect(out.files?.[0].path).toBe(join(base, "stdin.svg"));
	});

	test("rejects unknown options and bad values", () => {
		const base = dir();
		const input = join(base, "one.mmd");
		writeFileSync(input, "graph TD\n  A --> B\n");

		expect(run([input, "--bogus"]).out.error?.message).toBe("unknown option --bogus");
		expect(run([input, "--theme", "neon"]).out.error?.message).toContain("--theme must be light or dark");
		expect(run([input, "--max-width", "abc"]).out.error?.message).toContain("--max-width must be an integer");
		expect(run([input, "--out"]).out.error?.message).toContain("--out needs a value");
	});

	test("rejects unsupported extensions", () => {
		const base = dir();
		const input = join(base, "one.txt");
		writeFileSync(input, "graph TD\n  A --> B\n");

		expect(run([input]).out.error?.message).toContain("unsupported input extension .txt");
	});
});
