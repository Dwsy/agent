/**
 * The query translation is the part most likely to break silently: a wrong
 * expression returns zero results rather than an error, which looks like
 * "nothing matched" instead of a bug.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMatchExpression,
  buildSnippet,
  extractHighlightTerms,
  findMatches,
} from "../src/query.ts";

test("splits CJK into per-character tokens matching the index", () => {
  // Pi indexes "性能优化" as "性 能 优 化"; a bare phrase would match nothing.
  assert.equal(buildMatchExpression("性能优化"), '"性 能 优 化"');
});

test("keeps Latin words whole and lowercases them", () => {
  assert.equal(buildMatchExpression("Playwright"), '"playwright"');
});

test("ANDs whitespace-separated terms", () => {
  assert.equal(buildMatchExpression("playwright 测试"), '"playwright" "测 试"');
});

test("splits mixed script inside one term but keeps it adjacent", () => {
  assert.equal(buildMatchExpression("GPM连接器"), '"gpm 连 接 器"');
});

test("drops punctuation without splitting the phrase, as the index does", () => {
  // The index strips punctuation too, so these characters end up adjacent
  // there; only whitespace should separate independent terms.
  assert.equal(buildMatchExpression("性能，优化！"), '"性 能 优 化"');
  assert.equal(buildMatchExpression("foo,bar"), '"foo bar"');
});

test("escapes embedded quotes rather than breaking the expression", () => {
  assert.equal(buildMatchExpression('say "hi"'), '"say" "hi"');
});

test("returns null for a query with nothing searchable", () => {
  assert.equal(buildMatchExpression("   "), null);
  assert.equal(buildMatchExpression("!!!"), null);
});

test("highlight terms rejoin without the index separators", () => {
  assert.deepEqual(extractHighlightTerms("GPM连接器"), ["gpm连接器"]);
  assert.deepEqual(extractHighlightTerms("性能优化 test"), ["性能优化", "test"]);
});

test("finds every occurrence, case-insensitively", () => {
  assert.deepEqual(findMatches("Foo foo FOO", ["foo"]), [
    [0, 3],
    [4, 3],
    [8, 3],
  ]);
});

test("merges overlapping matches so marks never nest", () => {
  assert.deepEqual(findMatches("aaaa", ["aa", "aaa"]), [[0, 4]]);
});

test("snippet centres on the match and rebases the offsets", () => {
  const text = `${"x".repeat(400)}性能优化${"y".repeat(400)}`;
  const { snippet, highlights } = buildSnippet(text, ["性能优化"]);

  assert.ok(snippet.length < text.length, "snippet should be shorter than the source");
  assert.equal(highlights.length, 1);

  const [start, length] = highlights[0];
  assert.equal(snippet.slice(start, start + length), "性能优化");
});

test("snippet falls back to the head when the term is not in the text", () => {
  const { snippet, highlights } = buildSnippet("nothing relevant here", ["absent"]);
  assert.equal(highlights.length, 0);
  assert.ok(snippet.startsWith("nothing"));
});

test("snippet collapses whitespace so rows stay one height", () => {
  const { snippet } = buildSnippet("a\n\n\nb   c", ["a"]);
  assert.equal(snippet, "a b c");
});
