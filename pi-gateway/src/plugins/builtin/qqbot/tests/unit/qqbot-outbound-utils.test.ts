import { describe, expect, test } from "bun:test";
import { guessFileType, chunkQqbotText } from "../../outbound.ts";

describe("guessFileType", () => {
  test("prefers opts.type over extension", () => {
    expect(guessFileType({ type: "photo" }, "doc.pdf")).toBe(1);
    expect(guessFileType({ type: "video" }, "x.png")).toBe(2);
    expect(guessFileType({ type: "audio" }, "x.mp4")).toBe(3);
  });

  test("detects image by extension", () => {
    expect(guessFileType(undefined, "photo.png")).toBe(1);
    expect(guessFileType(undefined, "photo.jpg")).toBe(1);
    expect(guessFileType(undefined, "photo.jpeg")).toBe(1);
    expect(guessFileType(undefined, "photo.gif")).toBe(1);
    expect(guessFileType(undefined, "photo.webp")).toBe(1);
  });

  test("detects video by extension", () => {
    expect(guessFileType(undefined, "clip.mp4")).toBe(2);
    expect(guessFileType(undefined, "clip.mov")).toBe(2);
    expect(guessFileType(undefined, "clip.webm")).toBe(2);
  });

  test("detects audio by extension", () => {
    expect(guessFileType(undefined, "audio.mp3")).toBe(3);
    expect(guessFileType(undefined, "audio.wav")).toBe(3);
    expect(guessFileType(undefined, "audio.silk")).toBe(3);
    expect(guessFileType(undefined, "audio.amr")).toBe(3);
    expect(guessFileType(undefined, "audio.ogg")).toBe(3);
  });

  test("defaults to file (4) for unknown extension", () => {
    expect(guessFileType(undefined, "document.doc")).toBe(4);
    expect(guessFileType(undefined, "archive.zip")).toBe(4);
    expect(guessFileType(undefined, "noextension")).toBe(4);
  });

  test("case insensitive extension matching", () => {
    expect(guessFileType(undefined, "photo.PNG")).toBe(1);
    expect(guessFileType(undefined, "audio.MP3")).toBe(3);
    expect(guessFileType(undefined, "video.MOV")).toBe(2);
  });
});

describe("chunkQqbotText", () => {
  test("returns single chunk when text fits limit", () => {
    expect(chunkQqbotText("short", 1500)).toEqual(["short"]);
    expect(chunkQqbotText("short", 10)).toEqual(["short"]);
  });

  test("chunks text at boundary", () => {
    expect(chunkQqbotText("abcdefghijk", 4)).toEqual(["abcd", "efgh", "ijk"]);
  });

  test("handles empty string", () => {
    expect(chunkQqbotText("", 10)).toEqual([""]);
  });

  test("handles limit=1", () => {
    expect(chunkQqbotText("abc", 1)).toEqual(["a", "b", "c"]);
  });

  test("negative limit floors to 1 and chunks per-char", () => {
    // Math.max(1, floor(-5)) = 1 → chunks by single char
    expect(chunkQqbotText("abc", -5)).toEqual(["a", "b", "c"]);
  });

  test("handles NaN limit as default", () => {
    const result = chunkQqbotText("hello world", NaN);
    expect(result).toEqual(["hello world"]);
  });

  test("respects custom limit", () => {
    expect(chunkQqbotText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
  });
});
