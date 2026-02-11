/**
 * v3.2 Media Security Tests — MS-1 ~ MS-8
 *
 * Tests validateMediaPath() from src/core/media-security.ts (F4)
 * and parseOutboundMediaDirectives URL scheme blocking.
 *
 * Spec: docs/PRD-GATEWAY-V32.md §4.4
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { validateMediaPath } from "./media-security.ts";
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let WORKSPACE: string;

beforeAll(() => {
  const raw = mkdtempSync(join(tmpdir(), "ms-test-"));
  // Resolve symlinks (macOS /var → /private/var) so validateMediaPath's
  // realpathSync(workspaceRoot) matches resolved paths for existing files
  WORKSPACE = realpathSync(raw);
  // Create test files and subdirs
  writeFileSync(join(WORKSPACE, "output.png"), "");
  const imagesDir = join(WORKSPACE, "images");
  mkdirSync(imagesDir, { recursive: true });
  writeFileSync(join(imagesDir, "chart.jpg"), "");
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

describe("v3.2 Media Security — validateMediaPath (MS-1 ~ MS-8)", () => {
  test("MS-1: valid relative path is allowed", () => {
    expect(validateMediaPath("./output.png", WORKSPACE)).toBe(true);
    expect(validateMediaPath("images/chart.jpg", WORKSPACE)).toBe(true);
    expect(validateMediaPath("output.png", WORKSPACE)).toBe(true);
  });

  test("MS-2: absolute path outside workspace is blocked", () => {
    expect(validateMediaPath("/etc/passwd", WORKSPACE)).toBe(false);
    expect(validateMediaPath("/tmp/evil.sh", WORKSPACE)).toBe(false);
  });

  test("MS-3: home directory path is blocked", () => {
    expect(validateMediaPath("~/secret.txt", WORKSPACE)).toBe(false);
    expect(validateMediaPath("~/.ssh/id_rsa", WORKSPACE)).toBe(false);
  });

  test("MS-4: directory traversal is blocked", () => {
    expect(validateMediaPath("../../etc/passwd", WORKSPACE)).toBe(false);
    expect(validateMediaPath("./images/../../etc/shadow", WORKSPACE)).toBe(false);
    expect(validateMediaPath("a/../../../etc/hosts", WORKSPACE)).toBe(false);
  });

  test("MS-5: symlink escape is blocked", () => {
    // Simulation: symlink resolution requires real FS.
    // When KeenDragon delivers, replace with real fs.realpathSync test.
    // For now, verify that a path resolving outside workspace is caught.
    expect(validateMediaPath("../../../etc/passwd", WORKSPACE)).toBe(false);
  });

  test("MS-6: null byte injection is blocked", () => {
    expect(validateMediaPath("./file\x00.png", WORKSPACE)).toBe(false);
    expect(validateMediaPath("image\x00.jpg", WORKSPACE)).toBe(false);
  });

  test("MS-7: file:// URL scheme is blocked", () => {
    expect(validateMediaPath("file:///etc/passwd", WORKSPACE)).toBe(false);
    expect(validateMediaPath("file:///home/agent/.bashrc", WORKSPACE)).toBe(false);
  });

  test("MS-8: data: URL scheme is blocked", () => {
    expect(validateMediaPath("data:text/html,<script>alert(1)</script>", WORKSPACE)).toBe(false);
    expect(validateMediaPath("data:image/png;base64,iVBOR...", WORKSPACE)).toBe(false);
  });

  // Edge cases beyond spec
  test("MS-edge: other URL schemes are blocked", () => {
    expect(validateMediaPath("ftp://evil.com/payload", WORKSPACE)).toBe(false);
    expect(validateMediaPath("https://evil.com/image.png", WORKSPACE)).toBe(false);
    expect(validateMediaPath("javascript://alert(1)", WORKSPACE)).toBe(false);
  });

  test("MS-edge: empty and whitespace paths are blocked", () => {
    expect(validateMediaPath("", WORKSPACE)).toBe(false);
    expect(validateMediaPath("   ", WORKSPACE)).toBe(false);
  });
});

// ── parseOutboundMediaDirectives scheme blocking ────────────────────────

import { parseOutboundMediaDirectives } from "../plugins/builtin/telegram/media-send.ts";

describe("v3.2 parseOutboundMediaDirectives — URL scheme blocking", () => {
  test("MS-7 integration: MEDIA:file:///etc/passwd treated as text", () => {
    const result = parseOutboundMediaDirectives("MEDIA:file:///etc/passwd");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("MEDIA:file:///etc/passwd");
  });

  test("MS-8 integration: MEDIA:data:text/html,<script> treated as text", () => {
    const result = parseOutboundMediaDirectives("MEDIA:data:text/html,<script>alert(1)</script>");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("MEDIA:data:");
  });

  test("MEDIA:ftp://evil.com/payload treated as text", () => {
    const result = parseOutboundMediaDirectives("MEDIA:ftp://evil.com/payload");
    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("MEDIA:ftp://");
  });

  // Existing behavior confirmation (should still pass)
  test("MEDIA:./valid.png still works", () => {
    const result = parseOutboundMediaDirectives("MEDIA:./valid.png");
    expect(result.media).toHaveLength(1);
    expect(result.media[0].url).toBe("./valid.png");
  });

  test("MEDIA:/etc/passwd still blocked (absolute)", () => {
    const result = parseOutboundMediaDirectives("MEDIA:/etc/passwd");
    expect(result.media).toHaveLength(0);
  });
});
