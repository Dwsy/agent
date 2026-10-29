import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./lifecycle.ts", import.meta.url), "utf8");
const compactionSource = readFileSync(new URL("./compaction.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

test("lifecycle does not run background memory extraction", () => {
  const shutdown = source.match(/pi\.on\("session_shutdown"[\s\S]*?\n  \}\);/);

  assert.ok(shutdown, "session_shutdown handler must exist");
  assert.doesNotMatch(source, /pi\.on\("agent_end"/);
  assert.doesNotMatch(source, /flushAutoMemory|runExternalExperienceExtract/);
  assert.match(shutdown[0], /flushVectorIndex\(\)/);
});

test("compaction memory extraction stays enabled independently of auto-memory", () => {
  assert.match(indexSource, /registerCompaction\(rt\)/);
  assert.doesNotMatch(compactionSource, /!config\.autoMemory\.enabled/);
  assert.match(compactionSource, /if \(!currentRole \|\| !currentRolePath\) return;/);
});
