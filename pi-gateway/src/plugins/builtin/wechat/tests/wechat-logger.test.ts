import { afterEach, describe, expect, mock, test } from "bun:test";
import { logger } from "../logger.ts";

const originalDebug = console.debug;
const debugSpy = mock(() => {});

afterEach(() => {
  console.debug = originalDebug;
  debugSpy.mockClear();
});

describe("wechat logger", () => {
  test("suppresses noisy wechat api debug logs", () => {
    console.debug = debugSpy as typeof console.debug;

    logger.debug("[wechat:api] POST https://example.com body=(none)");

    expect(debugSpy).not.toHaveBeenCalled();
  });

  test("keeps non-api debug logs", () => {
    console.debug = debugSpy as typeof console.debug;

    logger.debug("[wechat:gateway] dropping duplicate message m-1");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(String(debugSpy.mock.calls[0]?.[0] ?? "")).toContain("[wechat:gateway]");
  });
});
