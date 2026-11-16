import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface FileOperationsLike {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

/** Tool names whose path argument is tracked, mirroring Pi's own compaction tracking. */
const FILE_OP_TOOLS: Record<string, "read" | "written" | "edited"> = {
  read: "read",
  write: "written",
  edit: "edited",
};

interface MessageLike {
  role?: string;
  content?: unknown;
  nestedCalls?: { calls?: Array<{ name?: string; arguments?: unknown }> };
}

function addFileOp(name: string | undefined, args: unknown, fileOps: FileOperationsLike): void {
  if (!name) return;
  const bucket = FILE_OP_TOOLS[name];
  if (!bucket) return;
  const path = (args as { path?: unknown } | undefined)?.path;
  if (typeof path !== "string" || !path) return;
  fileOps[bucket].add(path);
}

/**
 * Extract file operations from raw session entries.
 *
 * Mirrors Pi's own extraction: assistant tool calls are inspected, and codemode
 * scripts report their inner calls on the tool result. Only read/write/edit
 * count, and only their path argument.
 */
export function extractFileOpsFromEntries(entries: SessionEntry[]): FileOperationsLike {
  const fileOps: FileOperationsLike = { read: new Set(), written: new Set(), edited: new Set() };
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = (entry as { message?: MessageLike }).message;
    if (!message) continue;
    if (message.role === "toolResult") {
      for (const call of message.nestedCalls?.calls ?? []) addFileOp(call.name, call.arguments, fileOps);
      continue;
    }
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const candidate = block as { type?: string; name?: string; arguments?: unknown };
      if (candidate.type !== "toolCall") continue;
      addFileOp(candidate.name, candidate.arguments, fileOps);
    }
  }
  return fileOps;
}

export interface FileDetails {
  readFiles: string[];
  modifiedFiles: string[];
}

export function getFileDetails(fileOps: FileOperationsLike): FileDetails {
  const modified = new Set([...fileOps.written, ...fileOps.edited]);
  return {
    readFiles: [...fileOps.read].filter((path) => !modified.has(path)).sort(),
    modifiedFiles: [...modified].sort(),
  };
}

function pathsFromTag(summary: string | undefined, tag: "read-files" | "modified-files"): string[] {
  if (!summary) return [];
  return [...summary.matchAll(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "g"))]
    .flatMap((match) => match[1].split(/\r?\n/))
    .map((path) => path.trim())
    .filter(Boolean);
}

export function mergeFileDetails(current: FileDetails, previousSummary: string | undefined): FileDetails {
  const modified = new Set([...pathsFromTag(previousSummary, "modified-files"), ...current.modifiedFiles]);
  const read = new Set([...pathsFromTag(previousSummary, "read-files"), ...current.readFiles]);
  return {
    readFiles: [...read].filter((path) => !modified.has(path)).sort(),
    modifiedFiles: [...modified].sort(),
  };
}

export function formatFileDetails(details: FileDetails): string {
  const sections: string[] = [];
  if (details.readFiles.length > 0) {
    sections.push(`<read-files>\n${details.readFiles.join("\n")}\n</read-files>`);
  }
  if (details.modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${details.modifiedFiles.join("\n")}\n</modified-files>`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

export function appendFileDetails(summary: string, details: FileDetails): string {
  const withoutExisting = summary
    .replace(/\n*<read-files>[\s\S]*?<\/read-files>/g, "")
    .replace(/\n*<modified-files>[\s\S]*?<\/modified-files>/g, "")
    .trimEnd();
  return `${withoutExisting}${formatFileDetails(details)}`;
}

/**
 * File operations for the entries a ctx compaction actually drops.
 *
 * ctx chooses its own keep point, which differs from Pi's token-based cut
 * point, so `preparation.fileOps` (which covers only Pi's cut range) is not
 * the right source. The discarded branch range is scanned directly:
 *
 * - summary-only keeps only the boundary, so every earlier entry is dropped.
 * - keep-tail keeps everything from the chosen keep point on, so only the
 *   entries before it are dropped.
 *
 * The raw branch still holds entries an earlier compaction already folded
 * into a summary. Those are skipped, and that summary's tags are merged in
 * instead, so the file list stays cumulative across compactions.
 */
export function computeCtxFileDetails(
  branchEntries: SessionEntry[],
  firstKeptEntryId: string | undefined,
): FileDetails {
  const keepIndex = firstKeptEntryId
    ? branchEntries.findIndex((entry) => entry.id === firstKeptEntryId)
    : -1;
  // Without a resolvable keep point every entry is discarded.
  const endIndex = keepIndex >= 0 ? keepIndex : branchEntries.length;

  // The newest compaction inside the discarded range owns the history before
  // it; its summary tags are the cumulative record of that part.
  let startIndex = 0;
  let previousSummary: string | undefined;
  for (let i = endIndex - 1; i >= 0; i--) {
    const entry = branchEntries[i];
    if (entry.type !== "compaction") continue;
    // Entries before this compaction's own keep point were already folded
    // into its summary; the retained tail sits before the compaction entry
    // in raw order and is still part of what ctx drops.
    const keptIndex = branchEntries.findIndex((candidate) => candidate.id === entry.firstKeptEntryId);
    startIndex = keptIndex >= 0 ? keptIndex : i + 1;
    previousSummary = entry.summary;
    break;
  }

  const discarded = branchEntries.slice(startIndex, endIndex);
  const current = getFileDetails(extractFileOpsFromEntries(discarded));
  return mergeFileDetails(current, previousSummary);
}

export function selectSummaryText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

export function buildStructuredPrompt(
  conversation: string,
  previousSummary: string | undefined,
  customInstructions: string | undefined,
  memoryInstructions?: string,
 ): string {
  const previous = previousSummary
    ? `\n\n<previous-summary>\n${previousSummary}\n</previous-summary>`
    : "";
  const focus = customInstructions ? `\n\nAdditional user focus:\n${customInstructions}` : "";
  const memory = memoryInstructions ? `\n\nMandatory memory extraction:\n${memoryInstructions}` : "";

  return `<conversation>\n${conversation}\n</conversation>${previous}${focus}\n\nCreate a concise, structured checkpoint for another coding agent to continue this work. Use exactly these headings:\n\n## Goal\n## Decisions\n## Changes\n## Current State\n## Risks\n## Next Steps\n## Critical Context\n\nRules:\n- Preserve exact file paths, function names, commands, errors, APIs, and unfinished work.\n- Merge new information into <previous-summary> when it exists; do not discard still-valid details.\n- Do not reproduce, rewrite, evaluate, or infer persistent role instructions, persona, system prompts, or long-term memory. Those are injected separately at runtime.\n- Do not answer the conversation or continue its work. Output only this checkpoint in Markdown, followed by any mandatory memory extraction block.${memory}`;
}
