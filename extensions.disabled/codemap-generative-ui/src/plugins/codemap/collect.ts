import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface SearchHit {
  path: string;
  lineNumber: number;
  lineText: string;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeRoots(cwd: string, roots?: string[]) {
  const items = (roots ?? []).filter(Boolean).map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    return [cwd];
  }
  return items.map((item) => isAbsolute(item) ? item : resolve(cwd, item));
}

function inferPatterns(query: string) {
  const patterns = new Set<string>();
  const trimmed = query.trim();
  if (trimmed) {
    patterns.add(trimmed);
  }
  const latinTokens = trimmed.match(/[A-Za-z_][A-Za-z0-9_:\-/]{2,}/g) ?? [];
  for (const token of latinTokens.slice(0, 8)) {
    patterns.add(token);
  }
  return Array.from(patterns).slice(0, 8);
}

function buildSnippet(lines: string[], hitLines: number[], radius: number, maxChars: number) {
  const windows: Array<[number, number]> = [];
  for (const lineNumber of hitLines) {
    const start = Math.max(1, lineNumber - radius);
    const end = Math.min(lines.length, lineNumber + radius);
    const last = windows[windows.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
      continue;
    }
    windows.push([start, end]);
  }

  const parts: string[] = [];
  for (const [start, end] of windows) {
    parts.push(`// lines ${start}-${end}`);
    for (let index = start; index <= end; index += 1) {
      parts.push(`${index}: ${lines[index - 1] ?? ""}`);
    }
  }

  let snippet = parts.join("\n");
  if (snippet.length > maxChars) {
    snippet = snippet.slice(0, maxChars) + "\n...<truncated>";
  }
  return snippet;
}

async function collectFileDetails(filePath: string, hits: SearchHit[], maxCharsPerFile: number) {
  const text = await readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const hitLines = Array.from(new Set(hits.map((item) => item.lineNumber))).sort((a, b) => a - b);
  return {
    path: filePath,
    hits,
    snippet: buildSnippet(lines, hitLines, 6, maxCharsPerFile),
  };
}

async function runSearch(pi: ExtensionAPI, roots: string[], pattern: string, signal?: AbortSignal) {
  const command = [
    "rg -n -S -i --no-heading",
    "--glob '!**/target/**'",
    "--glob '!**/node_modules/**'",
    "--glob '!**/.git/**'",
    "--glob '!**/dist/**'",
    "--glob '!**/build/**'",
    "-m 6",
    shellQuote(pattern),
    ...roots.map(shellQuote),
  ].join(" ");
  const result = await pi.exec("bash", ["-lc", command], { signal, timeout: 15000 });
  return result.stdout ?? "";
}

function parseRgOutput(output: string) {
  const hits: SearchHit[] = [];
  const lines = output.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(.*?):(\d+):(.*)$/);
    if (!match) {
      continue;
    }
    hits.push({
      path: match[1] ?? "",
      lineNumber: Number(match[2] ?? "0"),
      lineText: (match[3] ?? "").trim(),
    });
  }
  return hits;
}

export function registerCodeMapCollectTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "codemap_collect_context",
    label: "CodeMap Collect Context",
    description: "Collect code/document context for CodeMap generation by searching query-related files and returning real snippets.",
    promptSnippet: "Collect relevant files and snippets before generating a CodeMap.",
    promptGuidelines: [
      "Call codemap_collect_context before generating a new CodeMap from source code.",
      "Prefer focused roots and a specific query to reduce noise.",
      "Use the returned real file paths and snippets as the basis for trace locations.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language query or target flow name" }),
      roots: Type.Optional(Type.Array(Type.String({ description: "Optional search roots relative to cwd" }))),
      limitFiles: Type.Optional(Type.Number({ description: "Max files to return", default: 8 })),
      maxCharsPerFile: Type.Optional(Type.Number({ description: "Max snippet chars per file", default: 5000 })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const roots = normalizeRoots(ctx.cwd, params.roots);
      const patterns = inferPatterns(params.query);
      const limitFiles = Math.max(1, Math.min(params.limitFiles ?? 8, 20));
      const maxCharsPerFile = Math.max(500, Math.min(params.maxCharsPerFile ?? 5000, 12000));

      const hitsByFile = new Map<string, SearchHit[]>();
      for (const pattern of patterns) {
        const output = await runSearch(pi, roots, pattern, signal);
        const hits = parseRgOutput(output);
        for (const hit of hits) {
          const bucket = hitsByFile.get(hit.path) ?? [];
          bucket.push(hit);
          hitsByFile.set(hit.path, bucket);
        }
        if (hitsByFile.size >= limitFiles) {
          break;
        }
      }

      const fileEntries = Array.from(hitsByFile.entries())
        .map(([path, hits]) => ({ path, hits }))
        .sort((a, b) => b.hits.length - a.hits.length)
        .slice(0, limitFiles);

      const details = [] as Array<{ path: string; hits: SearchHit[]; snippet: string }>;
      for (const entry of fileEntries) {
        details.push(await collectFileDetails(entry.path, entry.hits.slice(0, 8), maxCharsPerFile));
      }

      const contentText = [
        `CodeMap context collected for query: ${params.query}`,
        `Patterns: ${patterns.join(", ") || "(none)"}`,
        `Roots: ${roots.join(", ")}`,
        "",
        ...details.flatMap((item) => [
          `## ${item.path}`,
          ...item.hits.slice(0, 5).map((hit) => `- L${hit.lineNumber}: ${hit.lineText}`),
          "```text",
          item.snippet,
          "```",
          "",
        ]),
      ].join("\n");

      return {
        content: [{ type: "text", text: contentText }],
        details: {
          query: params.query,
          roots,
          patterns,
          files: details,
        },
      };
    },
  });
}
