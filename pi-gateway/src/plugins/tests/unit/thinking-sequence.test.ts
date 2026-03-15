import { describe, expect, test } from "bun:test";
import {
  endThinkingBlock,
  removeThinkingBlocks,
  startThinkingBlock,
  type StreamingSequenceItem,
  updateThinkingBlock,
} from "../../streaming-thinking.ts";

describe("thinking sequence helpers", () => {
  test("appends each thinking block in order", () => {
    const sequence: StreamingSequenceItem[] = [];

    startThinkingBlock(sequence);
    updateThinkingBlock(sequence, "thinking A");
    sequence.push({ type: "tool", content: "tool B" });
    startThinkingBlock(sequence);
    updateThinkingBlock(sequence, "thinking C");

    expect(sequence).toEqual([
      { type: "thinking", content: "thinking A" },
      { type: "tool", content: "tool B" },
      { type: "thinking", content: "thinking C" },
    ]);
  });

  test("removes empty placeholder when thinking ends without delta", () => {
    const sequence: StreamingSequenceItem[] = [];

    startThinkingBlock(sequence);
    endThinkingBlock(sequence);

    expect(sequence).toEqual([]);
  });

  test("removes all thinking blocks when text starts", () => {
    const sequence: StreamingSequenceItem[] = [
      { type: "thinking", content: "thinking A" },
      { type: "tool", content: "tool B" },
      { type: "thinking", content: "thinking C" },
      { type: "text", content: "reply" },
    ];

    removeThinkingBlocks(sequence);

    expect(sequence).toEqual([
      { type: "tool", content: "tool B" },
      { type: "text", content: "reply" },
    ]);
  });
});
