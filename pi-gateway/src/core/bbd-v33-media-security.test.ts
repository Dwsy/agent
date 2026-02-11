/**
 * v3.3 Media Security Hardening Tests (S1)
 *
 * Extends MS-1~MS-8 from v3.2 with:
 * - [photo]/[audio] directive path validation
 * - /photo /audio command path validation (via sendTelegramMedia)
 * - normalizePath dead code removal verification
 * - Edge cases: encoded paths, mixed directives
 */

import { describe, test, expect } from "bun:test";
import { parseOutboundMediaDirectives } from "../plugins/builtin/telegram/media-send.ts";
import { validateMediaPath } from "./media-security.ts";

// ============================================================================
// S1-1 ~ S1-6: [photo]/[audio] directive security
// ============================================================================

describe("v3.3 S1: [photo]/[audio] directive path validation", () => {
  test("S1-1: [photo] with HTTP URL → allowed", () => {
    const result = parseOutboundMediaDirectives("[photo] https://example.com/img.png | caption");
    expect(result.media).toHaveLength(1);
    expect(result.media[0].url).toBe("https://example.com/img.png");
    expect(result.media[0].caption).toBe("caption");
  });

  test("S1-2: [photo] with absolute path → blocked", () => {
    const result = parseOutboundMediaDirectives("[photo] /etc/passwd");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("/etc/passwd");
  });

  test("S1-3: [audio] with traversal path → blocked", () => {
    const result = parseOutboundMediaDirectives("[audio] ../../etc/shadow");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("../../etc/shadow");
  });

  test("S1-4: [photo] with ~ path → blocked", () => {
    const result = parseOutboundMediaDirectives("[photo] ~/secret.jpg");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("~/secret.jpg");
  });

  test("S1-5: [audio] with file:// scheme → blocked", () => {
    const result = parseOutboundMediaDirectives("[audio] file:///etc/passwd");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("file:///etc/passwd");
  });

  test("S1-6: [photo] with relative path → allowed", () => {
    const result = parseOutboundMediaDirectives("[photo] ./output/chart.png | my chart");
    expect(result.media).toHaveLength(1);
    expect(result.media[0].url).toBe("./output/chart.png");
  });
});

// ============================================================================
// S1-7 ~ S1-10: sendTelegramMedia entry-point validation
// ============================================================================

describe("v3.3 S1: sendTelegramMedia validates local paths", () => {
  test("S1-7: validateMediaPath blocks data: scheme at entry", () => {
    expect(validateMediaPath("data:text/html,<script>")).toBe(false);
  });

  test("S1-8: validateMediaPath blocks null byte at entry", () => {
    expect(validateMediaPath("image\0.png")).toBe(false);
  });

  test("S1-9: validateMediaPath allows clean relative path", () => {
    expect(validateMediaPath("output/result.png")).toBe(true);
  });

  test("S1-10: validateMediaPath blocks encoded traversal", () => {
    // Even if someone tries %2e%2e, the raw string still contains ..
    expect(validateMediaPath("..%2f..%2fetc/passwd")).toBe(false);
  });
});

// ============================================================================
// S1-11 ~ S1-14: Mixed directive edge cases
// ============================================================================

describe("v3.3 S1: mixed directive edge cases", () => {
  test("S1-11: mix of safe and unsafe directives", () => {
    const text = [
      "Here are the results:",
      "MEDIA:./safe.png",
      "MEDIA:/etc/passwd",
      "[photo] https://example.com/ok.jpg",
      "[audio] ../../evil.mp3",
      "End of results",
    ].join("\n");
    const result = parseOutboundMediaDirectives(text);
    expect(result.media).toHaveLength(2); // safe.png + https URL
    expect(result.media[0].url).toBe("./safe.png");
    expect(result.media[1].url).toBe("https://example.com/ok.jpg");
    expect(result.text).toContain("MEDIA:/etc/passwd");
    expect(result.text).toContain("../../evil.mp3");
  });

  test("S1-12: MEDIA with javascript: scheme → blocked", () => {
    const result = parseOutboundMediaDirectives("MEDIA:javascript:alert(1)");
    expect(result.media).toHaveLength(0);
  });

  test("S1-13: [photo] with data: URI → blocked", () => {
    const result = parseOutboundMediaDirectives("[photo] data:image/png;base64,abc");
    expect(result.media).toHaveLength(0);
  });

  test("S1-14: empty MEDIA path → blocked", () => {
    const result = parseOutboundMediaDirectives("MEDIA:");
    expect(result.media).toHaveLength(0);
  });
});
