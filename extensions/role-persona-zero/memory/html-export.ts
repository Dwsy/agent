/** Renders the memory viewer as a single self-contained HTML document. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMemoryExportData, type MemoryExportData } from "./export-data.ts";

export {
  buildMemoryExportData,
  CORE_FILE_DIRS,
  type LearningTier,
  type MemoryExportData,
  type ViewerCoreFile,
  type ViewerMode,
} from "./export-data.ts";

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

function readTemplate(name: string): string {
  const path = join(TEMPLATE_DIR, name);
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`memory viewer template missing: ${path} (${err instanceof Error ? err.message : err})`);
  }
}

/** JSON embedded in a <script> block must not be able to close that block. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMemoryViewerHtml(data: MemoryExportData): string {
  const styles = readTemplate("viewer.css");
  const script = readTemplate("viewer.js");

  // Function replacements: a literal `$&` inside memory text must stay literal.
  return readTemplate("viewer.html")
    .replace("/*{{styles}}*/", () => styles)
    .replace("/*{{script}}*/", () => script)
    .replace("{{data}}", () => embedJson(data))
    .replace(/\{\{title\}\}/g, () => escapeHtml(data.title));
}

/** Offline snapshot: no server APIs, everything inlined. */
export function exportMemoryToHtml(rolePath: string, roleName: string): string {
  return renderMemoryViewerHtml(buildMemoryExportData(rolePath, roleName, "static"));
}
