export type StreamingSequenceItem = { type: "tool" | "thinking" | "text"; content: string };

export function startThinkingBlock(contentSequence: StreamingSequenceItem[]): void {
  contentSequence.push({ type: "thinking", content: "" });
}

export function updateThinkingBlock(contentSequence: StreamingSequenceItem[], accumulated: string): void {
  const thinkingIndex = contentSequence.findLastIndex((item) => item.type === "thinking");
  if (thinkingIndex >= 0) {
    contentSequence[thinkingIndex]!.content = accumulated;
    return;
  }
  contentSequence.push({ type: "thinking", content: accumulated });
}

export function endThinkingBlock(contentSequence: StreamingSequenceItem[]): void {
  const thinkingIndex = contentSequence.findLastIndex((item) => item.type === "thinking");
  if (thinkingIndex >= 0 && !contentSequence[thinkingIndex]!.content) {
    contentSequence.splice(thinkingIndex, 1);
  }
}

export function removeThinkingBlocks(contentSequence: StreamingSequenceItem[]): void {
  for (let i = contentSequence.length - 1; i >= 0; i -= 1) {
    if (contentSequence[i]!.type === "thinking") {
      contentSequence.splice(i, 1);
    }
  }
}
