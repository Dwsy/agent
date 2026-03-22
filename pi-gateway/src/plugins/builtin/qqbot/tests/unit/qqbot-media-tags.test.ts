import { describe, expect, test } from "bun:test";
import { normalizeMediaTags } from "../../utils/media-tags.ts";

describe("normalizeMediaTags", () => {
  test("pass-through clean text unchanged", () => {
    expect(normalizeMediaTags("hello world")).toBe("hello world");
    expect(normalizeMediaTags("")).toBe("");
  });

  test("normalizes <qq_img> to <qqimg>", () => {
    const result = normalizeMediaTags("here is <qq_img>image.png</qq_img>");
    expect(result).toBe("here is <qqimg>image.png</qqimg>");
    expect(result).not.toContain("<qq_img>");
  });

  test("normalizes <img src=.../> to <qqimg>", () => {
    const result = normalizeMediaTags("look at <img src='pic.jpg'/>");
    expect(result).toBe("look at <qqimg>pic.jpg</qqimg>");
    expect(result).not.toContain("<img");
  });

  test("normalizes <img src=\"...\"> to <qqimg>", () => {
    const result = normalizeMediaTags("photo <img src=\"http://example.com/a.png\">");
    expect(result).toBe("photo <qqimg>http://example.com/a.png</qqimg>");
  });

  test("normalizes <qqmedia file=.../> to <qqmedia>", () => {
    const result = normalizeMediaTags("file <qqmedia file='doc.pdf'/>");
    expect(result).toBe("file <qqmedia>doc.pdf</qqmedia>");
    expect(result).not.toContain("file=");
  });

  test("normalizes self-closing <qqmedia /> tag", () => {
    const result = normalizeMediaTags("send <qqmedia file='x.mp3'/>");
    expect(result).toBe("send <qqmedia>x.mp3</qqmedia>");
  });

  test("normalizes mixed malformed tags", () => {
    const input = "a <qq_img>1.png</qq_img> b <img src='2.jpg'/> c";
    const output = normalizeMediaTags(input);
    expect(output).toBe("a <qqimg>1.png</qqimg> b <qqimg>2.jpg</qqimg> c");
    expect(output).not.toContain("<qq_img>");
    expect(output).not.toContain("<img");
  });

  test("preserves markdown links and images", () => {
    expect(normalizeMediaTags("![alt](http://example.com/pic.png)")).toBe("![alt](http://example.com/pic.png)");
    expect(normalizeMediaTags("[link](http://example.com)")).toBe("[link](http://example.com)");
  });

  test("normalizes tilde path", () => {
    const result = normalizeMediaTags("<qq_img>~/Documents/pic.png</qq_img>");
    expect(result).toMatch(/<qqimg>.*\/pic\.png<\/qqimg>/);
  });
});
