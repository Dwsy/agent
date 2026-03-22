/**
 * Discord plugin unit tests
 */
import { describe, expect, test } from "bun:test";
import { splitDiscordText, formatToolLine } from "../format.ts";

test("splitDiscordText splits on newlines within limit", () => {
  const text = "line1\nline2\nline3";
  const chunks = splitDiscordText(text, 10);
  expect(chunks.length).toBeGreaterThan(1);
});

test("splitDiscordText handles empty string", () => {
  const chunks = splitDiscordText("", 2000);
  expect(chunks).toEqual([""]);
});

test("splitDiscordText single chunk when under limit", () => {
  const text = "hello world";
  const chunks = splitDiscordText(text, 2000);
  expect(chunks).toEqual(["hello world"]);
});

test("formatToolLine formats read command", () => {
  const result = formatToolLine("read", { path: "/tmp/test.txt" });
  expect(result).toContain("read");
  expect(result).toContain("test.txt");
});

test("formatToolLine formats bash command", () => {
  const result = formatToolLine("bash", { command: "ls -la" });
  expect(result).toContain("bash");
  expect(result).toContain("ls -la");
});

test("formatToolLine handles unknown tool", () => {
  const result = formatToolLine("unknown_tool", { foo: "bar" });
  expect(result).toContain("unknown_tool");
});

test("formatToolLine handles empty args", () => {
  const result = formatToolLine("tool", {});
  expect(result).toContain("tool");
});
