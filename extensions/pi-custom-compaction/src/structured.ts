export interface FileOperationsLike {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

export function getFileDetails(fileOps: FileOperationsLike): { readFiles: string[]; modifiedFiles: string[] } {
  const modified = new Set([...fileOps.written, ...fileOps.edited]);
  return {
    readFiles: [...fileOps.read].filter((path) => !modified.has(path)).sort(),
    modifiedFiles: [...modified].sort(),
  };
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
