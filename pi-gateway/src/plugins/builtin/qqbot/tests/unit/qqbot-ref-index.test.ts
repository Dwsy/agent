import { describe, expect, test, beforeEach } from "bun:test";
import { setRefIndex, getRefIndex, parseRefIndices, formatRefEntryForAgent, flushRefIndex } from "../../ref-index-store.ts";

describe("ref-index-store", () => {
  beforeEach(() => {
    flushRefIndex();
  });

  test("stores and retrieves by refIdx key", () => {
    setRefIndex("REFIDX_msg-123", { content: "hello", senderId: "user-1", timestamp: 1_700_000_000_000 });
    const entry = getRefIndex("REFIDX_msg-123");
    expect(entry).not.toBeUndefined();
    expect(entry!.content).toBe("hello");
    expect(entry!.senderId).toBe("user-1");
  });

  test("returns undefined for unknown key", () => {
    expect(getRefIndex("REFIDX_unknown")).toBeUndefined();
  });

  test("parseRefIndices extracts ref_msg_idx and msg_idx", () => {
    const result = parseRefIndices(["", "ref_msg_idx=REFIDX_abc", "msg_idx=REFIDX_def"]);
    expect(result.refMsgIdx).toBe("REFIDX_abc");
    expect(result.msgIdx).toBe("REFIDX_def");
  });

  test("parseRefIndices handles empty/undefined ext", () => {
    expect(parseRefIndices([])).toEqual({});
    expect(parseRefIndices(undefined)).toEqual({});
  });

  test("parseRefIndices returns partial results", () => {
    expect(parseRefIndices(["ref_msg_idx=REFIDX_1"])).toEqual({ refMsgIdx: "REFIDX_1" });
    expect(parseRefIndices(["msg_idx=REFIDX_2"])).toEqual({ msgIdx: "REFIDX_2" });
  });

  test("formatRefEntryForAgent formats entry with sender name", () => {
    const entry = { content: "hello", senderId: "u1", senderName: "Alice", timestamp: 1_700_000_000_000 };
    expect(formatRefEntryForAgent(entry)).toBe("「Alice」: hello");
  });

  test("formatRefEntryForAgent falls back to senderId", () => {
    const entry = { content: "hi", senderId: "user-42", timestamp: 1_700_000_000_000 };
    expect(formatRefEntryForAgent(entry)).toBe("「user-42」: hi");
  });

  test("setRefIndex stores with attachments", () => {
    const attachments = [{ type: "image" as const, url: "http://x.com/pic.jpg", filename: "pic.jpg" }];
    setRefIndex("REFIDX_msg-123", {
      content: "photo",
      senderId: "user-1",
      timestamp: 1_700_000_000_000,
      attachments,
    });
    const entry = getRefIndex("REFIDX_msg-123");
    expect(entry!.attachments).toHaveLength(1);
    expect(entry!.attachments![0].filename).toBe("pic.jpg");
  });
});
