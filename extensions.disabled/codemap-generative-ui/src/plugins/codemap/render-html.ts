import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildCodeMapHtml } from "../../html.ts";
import type { CodeMapDocument, CodeMapIndexDocument, CodeMapIndexEntry } from "../../types.ts";

const CodeMapLocationSchema = Type.Object({
  id: Type.Optional(Type.String()),
  path: Type.String(),
  lineNumber: Type.Optional(Type.Number()),
  lineContent: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
});

const CodeMapTraceSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.Optional(Type.String()),
  locations: Type.Optional(Type.Array(CodeMapLocationSchema)),
  traceTextDiagram: Type.Optional(Type.String()),
  traceGuide: Type.Optional(Type.String()),
});

const CodeMapDocumentSchema = Type.Object({
  title: Type.String(),
  description: Type.Optional(Type.String()),
  mermaidDiagram: Type.Optional(Type.String()),
  traces: Type.Array(CodeMapTraceSchema),
  metadata: Type.Optional(Type.Object({
    id: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    createdAt: Type.Optional(Type.String()),
    updatedAt: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    note: Type.Optional(Type.String()),
  })),
});

function nowStamp() {
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return {
    compact: `${yyyy}${mm}${dd}-${hh}${mi}${ss}`,
    iso: date.toISOString(),
    dateOnly: `${yyyy}${mm}${dd}`,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "codemap";
}

function normalizePath(cwd: string, input: string) {
  return isAbsolute(input) ? input : resolve(cwd, input);
}

async function exists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureParent(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

async function upsertIndex(options: {
  cwd: string;
  jsonPath: string;
  document: CodeMapDocument;
  title: string;
  description: string;
  entryId: string;
  note?: string;
}) {
  const indexPath = resolve(options.cwd, "docs/.codemap/index.json");
  const relativeJson = relative(dirname(indexPath), options.jsonPath);
  const filename = relativeJson.replace(/^codemaps\//, "");

  let index: CodeMapIndexDocument = {
    version: 1,
    projectRoot: options.cwd,
    codemaps: [],
  };

  if (await exists(indexPath)) {
    index = JSON.parse(await readFile(indexPath, "utf8")) as CodeMapIndexDocument;
    index.codemaps = index.codemaps ?? [];
  }

  const entry: CodeMapIndexEntry = {
    id: options.entryId,
    filename,
    title: options.title,
    description: options.description,
    query: options.document.metadata?.query,
    createdAt: options.document.metadata?.createdAt,
    updatedAt: options.document.metadata?.updatedAt,
    tags: options.document.metadata?.tags,
    note: options.note ?? options.document.metadata?.note,
  };

  const existingIndex = (index.codemaps ?? []).findIndex((item) => item.id === entry.id || item.filename === entry.filename);
  if (existingIndex >= 0) {
    index.codemaps![existingIndex] = entry;
  } else {
    index.codemaps!.unshift(entry);
  }

  await ensureParent(indexPath);
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  return indexPath;
}

export function registerCodeMapRenderHtmlTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "codemap_render_html",
    label: "CodeMap Render HTML",
    description: "Persistence/export tool for CodeMap tasks. Render a structured CodeMap document into standalone HTML and optionally save JSON/HTML artifacts into the current project.",
    promptSnippet: "Persistence/export tool for CodeMap tasks. Use mainly when the user wants saved or reusable HTML/JSON artifacts.",
    promptGuidelines: [
      "Use codemap_render_html after you have already generated a full CodeMap structure.",
      "Default to non-persistent rendering for normal visual requests; persist only when the user asks to save/export or when reuse is clearly valuable.",
      "When the user wants persistent results, set persist=true and optionally provide saveJsonPath/saveHtmlPath.",
      "Prefer saving both JSON and HTML so the result can be reopened later.",
    ],
    parameters: Type.Object({
      codemap: CodeMapDocumentSchema,
      persist: Type.Optional(Type.Boolean({ description: "Whether to save JSON/HTML artifacts to disk. Default: false.", default: false })),
      saveJsonPath: Type.Optional(Type.String({ description: "Optional output path for CodeMap JSON" })),
      saveHtmlPath: Type.Optional(Type.String({ description: "Optional output path for standalone HTML" })),
      updateIndex: Type.Optional(Type.Boolean({ description: "Whether to upsert docs/.codemap/index.json when JSON is saved under docs/.codemap", default: true })),
      note: Type.Optional(Type.String({ description: "Optional note stored in the index" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stamp = nowStamp();
      const title = params.codemap.title;
      const description = params.codemap.description ?? "";
      const baseSlug = `${stamp.compact}-${slugify(title)}`;
      const persist = params.persist ?? false;
      const jsonPath = normalizePath(ctx.cwd, params.saveJsonPath ?? `docs/.codemap/codemaps/${baseSlug}.json`);
      const htmlPath = normalizePath(ctx.cwd, params.saveHtmlPath ?? `docs/backend/${baseSlug}-codemap.html`);

      const entryId = params.codemap.metadata?.id ?? baseSlug;
      const metadata = {
        ...(params.codemap.metadata ?? {}),
        id: entryId,
        title,
        description,
        createdAt: params.codemap.metadata?.createdAt ?? stamp.iso,
        updatedAt: stamp.iso,
      };

      const document: CodeMapDocument = {
        ...params.codemap,
        metadata,
      };

      const html = buildCodeMapHtml(document, persist ? jsonPath : `memory://${entryId}.json`);

      let indexPath: string | null = null;
      let savedJsonPath: string | null = null;
      let savedHtmlPath: string | null = null;
      if (persist) {
        await ensureParent(jsonPath);
        await ensureParent(htmlPath);
        await writeFile(jsonPath, JSON.stringify({ schemaVersion: 1, ...document }, null, 2), "utf8");
        await writeFile(htmlPath, html, "utf8");
        savedJsonPath = jsonPath;
        savedHtmlPath = htmlPath;

        const shouldUpdateIndex = params.updateIndex ?? true;
        if (shouldUpdateIndex && jsonPath.includes(`${resolve(ctx.cwd, "docs/.codemap")}`)) {
          indexPath = await upsertIndex({
            cwd: ctx.cwd,
            jsonPath,
            document,
            title,
            description,
            entryId,
            note: params.note,
          });
        }
      }

      const message = persist
        ? `CodeMap artifacts rendered. JSON: ${jsonPath} | HTML: ${htmlPath}`
        : `CodeMap HTML rendered in memory for ${title}.`;

      return {
        content: [{ type: "text", text: message }],
        details: {
          title,
          entryId,
          persist,
          jsonPath: savedJsonPath,
          htmlPath: savedHtmlPath,
          indexPath,
          html,
        },
      };
    },
  });
}
