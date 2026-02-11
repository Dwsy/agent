/**
 * v3.2 WebChat Image Tests — WI-1 ~ WI-5 + media-token unit tests
 *
 * Tests processWebChatMediaDirectives(), signMediaUrl/verifyMediaToken,
 * and handleMediaServe() path security.
 *
 * Spec: docs/PRD-GATEWAY-V32.md §4.3
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { signMediaUrl, verifyMediaToken, getMediaSecret } from "./media-token.ts";
import { validateMediaPath } from "./media-security.ts";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Media Token unit tests ──────────────────────────────────────────────

const SECRET = "test-secret-key-for-hmac";

describe("v3.2 media-token — signMediaUrl / verifyMediaToken", () => {
  test("sign and verify round-trip succeeds", () => {
    const url = signMediaUrl("agent:main:webchat:dm:u1", "./output.png", SECRET, 60_000);
    expect(url).toContain("/api/media/");
    expect(url).toContain("output.png");

    // Parse the signed URL
    const parsed = new URL(url, "http://localhost");
    const token = parsed.pathname.split("/")[3]; // /api/media/{token}/{filename}
    const sk = parsed.searchParams.get("sk")!;
    const path = parsed.searchParams.get("path")!;
    const exp = parsed.searchParams.get("exp")!;

    const result = verifyMediaToken(token, sk, path, exp, SECRET);
    expect(result).toBeTruthy();
    expect(result!.sessionKey).toBe("agent:main:webchat:dm:u1");
    expect(result!.filePath).toBe("./output.png");
  });

  test("expired token is rejected", () => {
    const url = signMediaUrl("agent:main:webchat:dm:u1", "./img.png", SECRET, -1000); // already expired
    const parsed = new URL(url, "http://localhost");
    const token = parsed.pathname.split("/")[3];
    const sk = parsed.searchParams.get("sk")!;
    const path = parsed.searchParams.get("path")!;
    const exp = parsed.searchParams.get("exp")!;

    const result = verifyMediaToken(token, sk, path, exp, SECRET);
    expect(result).toBeNull();
  });

  test("tampered token is rejected", () => {
    const url = signMediaUrl("agent:main:webchat:dm:u1", "./img.png", SECRET, 60_000);
    const parsed = new URL(url, "http://localhost");
    const sk = parsed.searchParams.get("sk")!;
    const path = parsed.searchParams.get("path")!;
    const exp = parsed.searchParams.get("exp")!;

    const result = verifyMediaToken("tampered-token-value", sk, path, exp, SECRET);
    expect(result).toBeNull();
  });

  test("wrong secret is rejected", () => {
    const url = signMediaUrl("agent:main:webchat:dm:u1", "./img.png", SECRET, 60_000);
    const parsed = new URL(url, "http://localhost");
    const token = parsed.pathname.split("/")[3];
    const sk = parsed.searchParams.get("sk")!;
    const path = parsed.searchParams.get("path")!;
    const exp = parsed.searchParams.get("exp")!;

    const result = verifyMediaToken(token, sk, path, exp, "wrong-secret");
    expect(result).toBeNull();
  });

  test("tampered path is rejected", () => {
    const url = signMediaUrl("agent:main:webchat:dm:u1", "./img.png", SECRET, 60_000);
    const parsed = new URL(url, "http://localhost");
    const token = parsed.pathname.split("/")[3];
    const sk = parsed.searchParams.get("sk")!;
    const exp = parsed.searchParams.get("exp")!;

    const result = verifyMediaToken(token, sk, "/etc/passwd", exp, SECRET);
    expect(result).toBeNull();
  });

  test("getMediaSecret returns consistent value", () => {
    const s1 = getMediaSecret("fixed");
    const s2 = getMediaSecret("fixed");
    expect(s1).toBe(s2);
    expect(s1).toBe("fixed");
  });
});

// ── MEDIA directive processing simulation ───────────────────────────────
// Simulates processWebChatMediaDirectives logic from server.ts

function processWebChatMediaDirectives(
  text: string,
  sessionKey: string,
  workspace: string,
  secret: string,
): { text: string; images: string[] } {
  const images: string[] = [];
  const processed = text.replace(/MEDIA:(\S+)/g, (_match, rawPath: string) => {
    if (!validateMediaPath(rawPath, workspace)) {
      return `[blocked: ${rawPath}]`;
    }
    const url = signMediaUrl(sessionKey, rawPath, secret, 3600_000);
    const ext = rawPath.split(".").pop()?.toLowerCase() || "";
    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
    if (imageExts.has(ext)) {
      images.push(url);
      return "";
    }
    return `[📎 ${rawPath.split("/").pop()}](${url})`;
  });
  return { text: processed.trim(), images };
}

let WORKSPACE: string;

beforeAll(() => {
  const raw = mkdtempSync(join(tmpdir(), "wi-test-"));
  WORKSPACE = realpathSync(raw);
  mkdirSync(join(WORKSPACE, "output"), { recursive: true });
  writeFileSync(join(WORKSPACE, "output", "chart.png"), "fake-png");
  writeFileSync(join(WORKSPACE, "report.pdf"), "fake-pdf");
});

afterAll(() => {
  rmSync(WORKSPACE, { recursive: true, force: true });
});

describe("v3.2 WebChat Images — WI-1 ~ WI-5", () => {
  const SK = "agent:main:webchat:dm:user1";

  test("WI-1: MEDIA:./output.png → image URL in images array", () => {
    const { text, images } = processWebChatMediaDirectives(
      "MEDIA:./output/chart.png",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(1);
    expect(images[0]).toContain("/api/media/");
    expect(images[0]).toContain("chart.png");
    expect(text).not.toContain("MEDIA:");
  });

  test("WI-2: mixed text + MEDIA → both text and image preserved", () => {
    const input = "Here is the analysis:\nMEDIA:./output/chart.png\nSee above for details.";
    const { text, images } = processWebChatMediaDirectives(input, SK, WORKSPACE, SECRET);
    expect(images).toHaveLength(1);
    expect(text).toContain("Here is the analysis:");
    expect(text).toContain("See above for details.");
    expect(text).not.toContain("MEDIA:");
  });

  test("WI-3: MEDIA path outside workspace → blocked", () => {
    const { text, images } = processWebChatMediaDirectives(
      "MEDIA:../../etc/passwd",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(0);
    expect(text).toContain("[blocked:");
  });

  test("WI-3b: MEDIA absolute path → blocked", () => {
    const { text, images } = processWebChatMediaDirectives(
      "MEDIA:/etc/shadow",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(0);
    expect(text).toContain("[blocked:");
  });

  test("WI-4: signed URL can be verified (session persistence basis)", () => {
    const { images } = processWebChatMediaDirectives(
      "MEDIA:./output/chart.png",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(1);

    // Verify the signed URL is valid
    const parsed = new URL(images[0], "http://localhost");
    const token = parsed.pathname.split("/")[3];
    const sk = parsed.searchParams.get("sk")!;
    const path = parsed.searchParams.get("path")!;
    const exp = parsed.searchParams.get("exp")!;

    const verified = verifyMediaToken(token, sk, path, exp, SECRET);
    expect(verified).toBeTruthy();
    expect(verified!.sessionKey).toBe(SK);
  });

  test("WI-5: non-image MEDIA → download link, not in images array", () => {
    const { text, images } = processWebChatMediaDirectives(
      "MEDIA:report.pdf",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(0);
    expect(text).toContain("📎");
    expect(text).toContain("report.pdf");
    expect(text).toContain("/api/media/");
  });

  // Edge cases
  test("WI-edge: multiple MEDIA directives in one message", () => {
    const input = "Results:\nMEDIA:./output/chart.png\nMEDIA:report.pdf\nDone.";
    const { text, images } = processWebChatMediaDirectives(input, SK, WORKSPACE, SECRET);
    expect(images).toHaveLength(1); // only the .png
    expect(text).toContain("📎"); // pdf as download link
    expect(text).toContain("Done.");
  });

  test("WI-edge: no MEDIA directives → passthrough", () => {
    const input = "Just a normal message.";
    const { text, images } = processWebChatMediaDirectives(input, SK, WORKSPACE, SECRET);
    expect(images).toHaveLength(0);
    expect(text).toBe("Just a normal message.");
  });

  test("WI-edge: URL scheme in MEDIA → blocked", () => {
    const { text, images } = processWebChatMediaDirectives(
      "MEDIA:file:///etc/passwd",
      SK, WORKSPACE, SECRET,
    );
    expect(images).toHaveLength(0);
    expect(text).toContain("[blocked:");
  });
});
