import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { CodeMapDocument, CodeMapIndexDocument, CodeMapIndexEntry, ResolvedCodeMap } from "./types.ts";
import { buildCodeMapHtml } from "./html.ts";

async function fileExists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

function normalizePath(input: string, cwd: string) {
  if (isAbsolute(input)) {
    return input;
  }
  return resolve(cwd, input);
}

async function findNearestIndex(cwd: string) {
  let current = resolve(cwd);
  while (true) {
    const candidate = join(current, "docs/.codemap/index.json");
    if (await fileExists(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function listNearestCodeMaps(cwd: string) {
  const indexPath = await findNearestIndex(cwd);
  if (!indexPath) {
    return { indexPath: null, entries: [] as CodeMapIndexEntry[] };
  }
  const index = await readJson<CodeMapIndexDocument>(indexPath);
  return {
    indexPath,
    entries: index.codemaps ?? [],
  };
}

async function loadFromIndex(indexPath: string, idOrTitle?: string) {
  const index = await readJson<CodeMapIndexDocument>(indexPath);
  const entries = index.codemaps ?? [];
  if (entries.length === 0) {
    throw new Error(`CodeMap index has no entries: ${indexPath}`);
  }

  let selected = entries[0]!;
  if (idOrTitle) {
    const query = idOrTitle.toLowerCase();
    const matched = entries.find((entry) => {
      return entry.id.toLowerCase() === query
        || (entry.title ?? "").toLowerCase() === query
        || (entry.filename ?? "").toLowerCase() === query
        || (entry.title ?? "").toLowerCase().includes(query);
    });
    if (!matched) {
      throw new Error(`No CodeMap matched '${idOrTitle}' in ${indexPath}`);
    }
    selected = matched;
  }

  const targetPath = resolve(dirname(indexPath), "codemaps", selected.filename);
  return { targetPath, title: selected.title ?? selected.id };
}

export async function resolveCodeMapInput(rawPath: string | undefined, cwd: string, idOrTitle?: string) {
  if (rawPath) {
    const normalized = normalizePath(rawPath, cwd);
    if (!(await fileExists(normalized))) {
      throw new Error(`Path does not exist: ${normalized}`);
    }
    if (normalized.endsWith("index.json")) {
      return loadFromIndex(normalized, idOrTitle);
    }
    return { targetPath: normalized, title: undefined };
  }

  const indexPath = await findNearestIndex(cwd);
  if (!indexPath) {
    throw new Error("No docs/.codemap/index.json found from current working directory upward");
  }
  return loadFromIndex(indexPath, idOrTitle);
}

export async function buildResolvedCodeMap(rawPath: string | undefined, cwd: string, idOrTitle?: string): Promise<ResolvedCodeMap> {
  const { targetPath, title } = await resolveCodeMapInput(rawPath, cwd, idOrTitle);

  if (targetPath.endsWith(".html")) {
    const html = await readFile(targetPath, "utf8");
    return {
      html,
      sourcePath: targetPath,
      title: title ?? targetPath.split("/").pop() ?? "codemap",
      kind: "html",
    };
  }

  const document = await readJson<CodeMapDocument>(targetPath);
  const html = buildCodeMapHtml(document, targetPath);
  return {
    html,
    sourcePath: targetPath,
    title: document.title ?? title ?? "codemap",
    kind: "json",
  };
}

export async function writeTempHtml(title: string, html: string) {
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "codemap";
  const dir = join(tmpdir(), "pi-codemap-generative-ui");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${safeTitle}-${Date.now()}.html`);
  await writeFile(filePath, html, "utf8");
  return filePath;
}
