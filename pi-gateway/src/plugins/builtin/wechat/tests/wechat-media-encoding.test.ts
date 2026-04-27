import { describe, expect, test } from "bun:test";
import { encodeWechatMediaAesKey } from "../outbound.ts";

describe("wechat media aes key encoding", () => {
  test("encodes raw aes bytes as base64(hex-string) to match openclaw-weixin", () => {
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    expect(encodeWechatMediaAesKey(key)).toBe(Buffer.from("00112233445566778899aabbccddeeff").toString("base64"));
  });
});
