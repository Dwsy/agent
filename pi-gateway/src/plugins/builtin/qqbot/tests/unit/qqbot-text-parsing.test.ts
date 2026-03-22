import { describe, expect, test } from "bun:test";
import { filterInternalMarkers, parseFaceTags, buildAttachmentSummaries } from "../../utils/text-parsing.ts";

describe("filterInternalMarkers", () => {
  test("pass-through clean text unchanged", () => {
    expect(filterInternalMarkers("hello world")).toBe("hello world");
    expect(filterInternalMarkers("")).toBe("");
  });

  test("removes [[reply_to:...]] markers", () => {
    expect(filterInternalMarkers("hi [[reply_to:msg-123]]")).toBe("hi");
    expect(filterInternalMarkers("[[reply_to:abc]] hello")).toBe("hello");
    expect(filterInternalMarkers("[[reply_to:]] plain")).toBe("plain");
  });

  test("removes @image:... markers", () => {
    expect(filterInternalMarkers("see @image:upload-456.png")).toBe("see");
    expect(filterInternalMarkers("@image:file.pdf done")).toBe("done");
    expect(filterInternalMarkers("@voice:audio.silk")).toBe("");
  });

  test("removes mixed internal markers", () => {
    const input = "[[reply_to:123]] hi @image:pic.jpg bye";
    expect(filterInternalMarkers(input)).toBe("hi bye");
  });

  test("handles multiple adjacent markers", () => {
    expect(filterInternalMarkers("[[reply_to:1]][[reply_to:2]]text")).toBe("text");
  });

  test("compresses multiple blank lines", () => {
    const input = "a\n\n\n\nb";
    expect(filterInternalMarkers(input)).toBe("a\n\nb");
  });
});

describe("parseFaceTags", () => {
  test("pass-through text without face tags unchanged", () => {
    expect(parseFaceTags("hello")).toBe("hello");
    expect(parseFaceTags("")).toBe("");
  });

  test("replaces face tag with decoded base64 text", () => {
    // ext is base64 of JSON: {"text": "微笑"}
    const ext = Buffer.from(JSON.stringify({ text: "微笑" })).toString("base64");
    const result = parseFaceTags(`<faceType=1,faceId="13",ext="${ext}">`);
    expect(result).toBe("【表情: 微笑】");
  });

  test("falls back to original for unparseable ext", () => {
    const ext = Buffer.from("not json").toString("base64");
    const result = parseFaceTags(`<faceType=1,faceId="0",ext="${ext}">`);
    expect(result).toBe(`<faceType=1,faceId="0",ext="${ext}">`);
  });

  test("handles multiple face tags", () => {
    const ext1 = Buffer.from(JSON.stringify({ text: "笑" })).toString("base64");
    const ext2 = Buffer.from(JSON.stringify({ text: "哭" })).toString("base64");
    const result = parseFaceTags(
      `<faceType=1,faceId="0",ext="${ext1}"> <faceType=1,faceId="1",ext="${ext2}">`
    );
    expect(result).toBe("【表情: 笑】 【表情: 哭】");
  });
});

describe("buildAttachmentSummaries", () => {
  test("returns undefined for no attachments", () => {
    expect(buildAttachmentSummaries([])).toBeUndefined();
    expect(buildAttachmentSummaries(undefined)).toBeUndefined();
  });

  test("formats image attachment", () => {
    const result = buildAttachmentSummaries(
      [{ content_type: "image/png", url: "http://x.com/pic.png", filename: "pic.png" }],
      ["/tmp/pic.png"]
    );
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("image");
    expect(result![0].filename).toBe("pic.png");
    expect(result![0].localPath).toBe("/tmp/pic.png");
  });

  test("formats voice attachment", () => {
    const result = buildAttachmentSummaries(
      [{ content_type: "voice/silk", filename: "audio.silk" }]
    );
    expect(result![0].type).toBe("voice");
  });

  test("formats file attachment", () => {
    const result = buildAttachmentSummaries(
      [{ content_type: "application/pdf", filename: "doc.pdf" }]
    );
    expect(result![0].type).toBe("file");
  });
});
