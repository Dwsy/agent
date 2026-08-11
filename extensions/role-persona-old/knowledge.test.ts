import { afterAll, mock, test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Isolated fixture tree (never touches the user's real ~/.pi data).
//
// PI_ROLES_DIR must be set BEFORE knowledge.ts is imported, because
// role-store.ts resolves ROLES_DIR at module load time and knowledge.ts
// derives GLOBAL_KNOWLEDGE_DIR / SKILLS_KNOWLEDGE_DIR from it:
//   GLOBAL_KNOWLEDGE_DIR = <rolesDir>/knowledge
//   SKILLS_KNOWLEDGE_DIR = <rolesDir>/../agent/skills
// ============================================================================

const tempBase = mkdtempSync(join(tmpdir(), "rp-knowledge-test-"));
const rolesDir = join(tempBase, "roles");
mkdirSync(rolesDir, { recursive: true });

function git(args: string[]): string {
  return execFileSync("git", ["-C", rolesDir, ...args], { encoding: "utf-8" }).trim();
}

// writeKnowledge commits through memory-git.ts, which requires the configured
// roles directory to be a Git repository once it exists.
git(["init", "-q"]);
git(["config", "user.name", "Test"]);
git(["config", "user.email", "test@example.invalid"]);

// --- global source fixtures (rolesDir/knowledge) ---
const globalDir = join(rolesDir, "knowledge");
mkdirSync(join(globalDir, "design-systems"), { recursive: true });
mkdirSync(join(globalDir, "ops"), { recursive: true });
mkdirSync(join(globalDir, "shared"), { recursive: true });
mkdirSync(join(globalDir, "_drafts"), { recursive: true });
mkdirSync(join(globalDir, ".secret"), { recursive: true });

writeFileSync(
  join(globalDir, "design-systems", "glassmorphism.md"),
  `---
title: "Glassmorphism"
description: "Frosted glass UI style"
tags: [Design, css]
version: 2
created: 2024-01-05
updated: 2024-02-01
---

Use translucent layers.
`,
);
writeFileSync(
  join(globalDir, "design-systems", "tokens.md"),
  `---
title: "Design Tokens"
description: "Shared visual variables"
tags: [design, tokens]
version: 1
created: 2024-01-06
updated: 2024-01-06
---

Name tokens semantically.
`,
);
writeFileSync(
  join(globalDir, "ops", "deploy.md"),
  `---
title: "Deploy Guide"
description: "How to ship"
tags: [deploy]
version: 1
created: 2024-03-01
updated: 2024-03-01
---

Ship carefully.
`,
);
const standaloneContent = "Just a note.\n";
writeFileSync(join(globalDir, "standalone.md"), standaloneContent);
const globalCommonContent = "GLOBAL COMMON\n";
writeFileSync(join(globalDir, "shared", "common.md"), globalCommonContent);
// Hidden fixtures — must be ignored by the scanner.
writeFileSync(join(globalDir, "_drafts", "draft.md"), "draft\n");
writeFileSync(join(globalDir, ".secret", "secret.md"), "secret\n");
writeFileSync(join(globalDir, ".hidden.md"), "hidden\n");

// --- role source fixtures ---
const rolePath = join(rolesDir, "reader-role");
mkdirSync(join(rolePath, "knowledge", "guides"), { recursive: true });
mkdirSync(join(rolePath, "knowledge", "shared"), { recursive: true });
writeFileSync(
  join(rolePath, "knowledge", "guides", "deploy.md"),
  `---
title: "Deploy Guide"
description: "Role-specific deploy notes"
tags: [deploy]
version: 1
created: 2024-03-02
updated: 2024-03-02
---

Role deploy notes.
`,
);
writeFileSync(join(rolePath, "knowledge", "shared", "common.md"), "ROLE COMMON\n");

// --- project source fixture (discovered via setProjectCwd) ---
const projectDir = join(tempBase, "project");
mkdirSync(join(projectDir, "docs", "knowledge", "decisions"), { recursive: true });
writeFileSync(
  join(projectDir, "docs", "knowledge", "decisions", "adr-001.md"),
  `---
title: "ADR 001"
description: "Use event sourcing"
tags: [architecture]
version: 1
created: 2024-04-01
updated: 2024-04-01
---

Decision body.
`,
);

// --- external source fixture (declared via config file in rolesDir) ---
const externalDir = join(tempBase, "external-kb");
mkdirSync(join(externalDir, "reference"), { recursive: true });
writeFileSync(
  join(externalDir, "reference", "api-spec.md"),
  `---
title: "API Spec"
description: "External reference"
tags: [api]
version: 1
created: 2024-05-01
updated: 2024-05-01
---

External body.
`,
);
writeFileSync(
  join(rolesDir, "pi-role-persona.jsonc"),
  `${JSON.stringify({ knowledge: { externalSources: [{ id: "extkb", path: externalDir, description: "External test KB" }] } }, null, 2)}\n`,
);

// --- skills source fixture (rolesDir/../agent/skills) ---
const skillsDir = join(tempBase, "agent", "skills");
mkdirSync(join(skillsDir, "sample-skill"), { recursive: true });
writeFileSync(
  join(skillsDir, "sample-skill", "SKILL.md"),
  `---
title: "Sample Skill"
description: "A demo skill"
tags: [demo]
---

# Sample Skill

Body here.
`,
);

// ============================================================================
// Environment redirection + module mocks, then import under test.
// ============================================================================

const savedEnv: Record<string, string | undefined> = {
  PI_ROLES_DIR: process.env.PI_ROLES_DIR,
  PI_AGENT_ROLES_DIR: process.env.PI_AGENT_ROLES_DIR,
  ROLE_LOG: process.env.ROLE_LOG,
};
process.env.PI_ROLES_DIR = rolesDir;
delete process.env.PI_AGENT_ROLES_DIR;
process.env.ROLE_LOG = "0";

// knowledge.ts transitively imports memory-tags.ts, which value-imports from
// "@earendil-works/pi-ai/compat" (only resolvable inside the pi loader).
mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({ stopReason: "end", content: [{ type: "text", text: "{}" }] }),
}));
mock.module("@earendil-works/pi-coding-agent", () => ({
  convertToLlm: (messages: unknown[]) => messages,
  serializeConversation: (messages: unknown[]) => JSON.stringify(messages),
}));

const { reloadConfig } = await import("./config.ts");
reloadConfig(); // bust any config cached by earlier test files with the real env

const {
  GLOBAL_KNOWLEDGE_DIR,
  buildFrontmatter,
  getRoleKnowledgeDir,
  listKnowledge,
  parseFrontmatter,
  readKnowledge,
  searchKnowledge,
  setProjectCwd,
  writeKnowledge,
} = await import("./knowledge.ts");

// Safety guard: abort everything if redirection did not take effect, so no
// test can ever touch the user's real ~/.pi/roles data.
assert.equal(GLOBAL_KNOWLEDGE_DIR, join(rolesDir, "knowledge"));

setProjectCwd(projectDir);

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  reloadConfig();
  rmSync(tempBase, { recursive: true, force: true });
});

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
}

// ============================================================================
// parseFrontmatter / buildFrontmatter
// ============================================================================

test("parseFrontmatter parses strings, arrays, and numbers", () => {
  const { meta, body } = parseFrontmatter(
    `---
title: "Glassmorphism"
description: 'Frosted glass'
tags: [Design, css]
version: 2
created: 2024-01-05
# a comment line

scope: design
---

Body line 1.
Body line 2.
`,
  );
  assert.equal(meta.title, "Glassmorphism");
  assert.equal(meta.description, "Frosted glass");
  assert.deepEqual(meta.tags, ["Design", "css"]);
  assert.equal(meta.version, 2);
  assert.equal(meta.created, "2024-01-05");
  assert.equal(meta.scope, "design");
  // Only the newline terminating the closing "---" is stripped, so the
  // conventional blank separator line survives as a leading "\n" in the body.
  assert.equal(body, "\nBody line 1.\nBody line 2.\n");
});

test("parseFrontmatter returns empty meta when frontmatter is missing", () => {
  const content = "# Heading\n\nNo frontmatter here.\n";
  const { meta, body } = parseFrontmatter(content);
  assert.deepEqual(meta, {});
  assert.equal(body, content);
});

test("parseFrontmatter returns whole content when frontmatter is unterminated", () => {
  const content = "---\ntitle: broken\nno closing delimiter\n";
  const { meta, body } = parseFrontmatter(content);
  assert.deepEqual(meta, {});
  assert.equal(body, content);
});

test("parseFrontmatter parses empty and quoted-element tag arrays", () => {
  assert.deepEqual(parseFrontmatter('---\ntags: []\n---\nx\n').meta.tags, []);
  assert.deepEqual(parseFrontmatter('---\ntags: ["a", \'b\', c]\n---\nx\n').meta.tags, ["a", "b", "c"]);
});

test("buildFrontmatter round-trips through parseFrontmatter", () => {
  const meta = {
    title: "Round Trip",
    description: "A full metadata block",
    tags: ["api", "design"],
    category: "guides",
    version: 3,
    created: "2024-01-01",
    updated: "2024-06-01",
    scope: "backend",
    author: "tester",
  };
  const raw = buildFrontmatter(meta);
  assert.ok(raw.startsWith("---\n"));
  assert.ok(raw.endsWith("\n---"));

  const parsed = parseFrontmatter(`${raw}\nbody text\n`);
  assert.equal(parsed.meta.title, "Round Trip");
  assert.equal(parsed.meta.description, "A full metadata block");
  assert.deepEqual(parsed.meta.tags, ["api", "design"]);
  assert.equal(parsed.meta.category, "guides");
  assert.equal(parsed.meta.version, 3);
  assert.equal(parsed.meta.created, "2024-01-01");
  assert.equal(parsed.meta.updated, "2024-06-01");
  assert.equal(parsed.meta.scope, "backend");
  assert.equal(parsed.meta.author, "tester");
  assert.equal(parsed.body, "body text\n");
});

test("buildFrontmatter escapes quotes and backslashes and round-trips losslessly", () => {
  const meta = {
    title: 'He said "quoted" things',
    description: 'Windows path C:\\temp\\file with a "nested" quote',
    tags: ["a,b", "x]y", 'with "quote"', "back\\slash"],
    version: 1,
    created: "2024-01-01",
    updated: "2024-01-01",
  };
  const raw = buildFrontmatter(meta);
  const parsed = parseFrontmatter(`${raw}\nbody\n`);
  assert.equal(parsed.meta.title, meta.title);
  assert.equal(parsed.meta.description, meta.description);
  assert.deepEqual(parsed.meta.tags, meta.tags);
  assert.equal(parsed.body, "body\n");
});

test("parseFrontmatter still reads legacy unquoted tag arrays from old files", () => {
  const { meta } = parseFrontmatter("---\ntags: [alpha, beta gamma, delta]\n---\nx\n");
  assert.deepEqual(meta.tags, ["alpha", "beta gamma", "delta"]);
});

test("buildFrontmatter omits optional fields when absent", () => {
  const raw = buildFrontmatter({
    title: "Minimal",
    description: "",
    tags: [],
    version: 1,
    created: "2024-01-01",
    updated: "2024-01-01",
  });
  assert.ok(!raw.includes("category:"));
  assert.ok(!raw.includes("scope:"));
  assert.ok(!raw.includes("author:"));
  assert.ok(raw.includes("tags: []"));
});

// ============================================================================
// listKnowledge
// ============================================================================

test("listKnowledge aggregates all sources with correct readonly flags", () => {
  const result = listKnowledge(rolePath);

  assert.deepEqual(
    result.sources.map((s) => ({ id: s.id, readonly: s.readonly })),
    [
      { id: "global", readonly: false },
      { id: "role", readonly: false },
      { id: "project", readonly: true },
      { id: "extkb", readonly: true },
      { id: "skills", readonly: true },
    ],
  );
  // 5 global + 2 role + 1 project + 1 external + 1 skill; hidden/_-prefixed excluded
  assert.equal(result.totalEntries, 10);

  const globalSource = result.sources.find((s) => s.id === "global")!;
  const designCat = globalSource.categories.find((c) => c.category === "design-systems")!;
  assert.deepEqual(
    designCat.entries.map((e) => e.file).sort(),
    ["glassmorphism.md", "tokens.md"],
  );
  const glass = designCat.entries.find((e) => e.file === "glassmorphism.md")!;
  assert.equal(glass.title, "Glassmorphism");
  assert.deepEqual(glass.tags, ["Design", "css"]);
  assert.equal(glass.updated, "2024-02-01");

  // Root-level file without frontmatter: category "(root)", slug fallback title.
  const rootCat = globalSource.categories.find((c) => c.category === "(root)")!;
  assert.deepEqual(rootCat.entries.map((e) => ({ file: e.file, title: e.title, tags: e.tags })), [
    { file: "standalone.md", title: "standalone", tags: [] },
  ]);

  // Skills entry gets auto-tags and scope "tools".
  const skillsSource = result.sources.find((s) => s.id === "skills")!;
  const skillEntry = skillsSource.categories[0].entries[0];
  assert.equal(skillEntry.title, "Sample Skill");
  assert.deepEqual(skillEntry.tags, ["demo", "skill", "tool", "capability"]);
  assert.equal(skillEntry.scope, "tools");
});

test("listKnowledge builds a lowercase tag index across sources", () => {
  const { tagIndex } = listKnowledge(rolePath);

  // "Design" (mixed case) and "design" collapse into one lowercase key.
  assert.ok(!("Design" in tagIndex));
  assert.deepEqual(
    [...tagIndex["design"]].sort(),
    ["global:design-systems/glassmorphism.md", "global:design-systems/tokens.md"],
  );
  assert.deepEqual(
    [...tagIndex["deploy"]].sort(),
    ["global:ops/deploy.md", "role:guides/deploy.md"],
  );
  assert.deepEqual(tagIndex["architecture"], ["project:decisions/adr-001.md"]);
  assert.deepEqual(tagIndex["api"], ["extkb:reference/api-spec.md"]);
  assert.deepEqual(tagIndex["demo"], ["skills:sample-skill/SKILL.md"]);
});

test("listKnowledge without a role path omits the role source", () => {
  const result = listKnowledge(null);
  assert.ok(!result.sources.some((s) => s.id === "role"));
  assert.equal(result.totalEntries, 8);
});

// ============================================================================
// readKnowledge
// ============================================================================

test("readKnowledge resolves a category/file path from the global source first", () => {
  const result = readKnowledge("shared/common.md", rolePath);
  assert.ok(result);
  assert.equal(result.source, "global");
  assert.equal(result.readonly, false);
  assert.equal(result.body, globalCommonContent);
  assert.equal(result.absolutePath, join(globalDir, "shared", "common.md"));
  assert.equal(result.charCount, globalCommonContent.length);
  assert.equal(result.lineCount, 2);
});

test("readKnowledge honors a source: prefix to bypass precedence", () => {
  const roleHit = readKnowledge("role:shared/common.md", rolePath);
  assert.ok(roleHit);
  assert.equal(roleHit.source, "role");
  assert.equal(roleHit.body, "ROLE COMMON\n");

  const projectHit = readKnowledge("project:decisions/adr-001.md", rolePath);
  assert.ok(projectHit);
  assert.equal(projectHit.source, "project");
  assert.equal(projectHit.readonly, true);
  assert.equal(projectHit.frontmatter.title, "ADR 001");

  const externalHit = readKnowledge("extkb:reference/api-spec.md", rolePath);
  assert.ok(externalHit);
  assert.equal(externalHit.source, "extkb");
  assert.equal(externalHit.readonly, true);

  const skillHit = readKnowledge("skills:sample-skill/SKILL.md", rolePath);
  assert.ok(skillHit);
  assert.equal(skillHit.source, "skills");
  assert.equal(skillHit.frontmatter.title, "Sample Skill");
});

test("readKnowledge falls through to the role source for role-only paths", () => {
  const result = readKnowledge("guides/deploy.md", rolePath);
  assert.ok(result);
  assert.equal(result.source, "role");
  assert.equal(result.frontmatter.description, "Role-specific deploy notes");
});

test("readKnowledge returns null for missing paths and unresolvable prefixes", () => {
  assert.equal(readKnowledge("nope/missing.md", rolePath), null);
  // Unknown prefix is treated as a literal path, which does not exist.
  assert.equal(readKnowledge("bogus:shared/common.md", rolePath), null);
  // role: prefix without a role path leaves no candidate sources.
  assert.equal(readKnowledge("role:shared/common.md", null), null);
});

test("readKnowledge rejects path traversal outside the source roots", () => {
  // A real file one level above the global knowledge dir must be unreachable.
  const secretPath = join(rolesDir, "secret-outside.md");
  writeFileSync(secretPath, "---\ntitle: \"Secret\"\n---\n\nnot knowledge", "utf-8");
  try {
    assert.equal(readKnowledge("../secret-outside.md", rolePath), null);
    assert.equal(readKnowledge("global:../secret-outside.md", rolePath), null);
    assert.equal(readKnowledge("role:../../../secret-outside.md", rolePath), null);
    assert.equal(readKnowledge("shared/../../secret-outside.md", rolePath), null);
  } finally {
    rmSync(secretPath, { force: true });
  }
});

test("readKnowledge applies frontmatter defaults for files without frontmatter", () => {
  const result = readKnowledge("standalone.md", rolePath);
  assert.ok(result);
  assert.equal(result.frontmatter.title, "standalone");
  assert.equal(result.frontmatter.version, 1);
  assert.deepEqual(result.frontmatter.tags, []);
  assert.equal(result.body, standaloneContent);
});

// ============================================================================
// searchKnowledge
// ============================================================================

test("searchKnowledge boosts role entries above equally matching global entries", () => {
  const results = searchKnowledge(rolePath, { query: "deploy guide" });
  assert.ok(results.length >= 2);

  // Both title-match entries score 0.5 (keywords) + 0.2 (title); role × 1.2.
  assert.equal(results[0].entry.source, "role");
  assert.equal(results[0].entry.relativePath, "guides/deploy.md");
  assertClose(results[0].relevance, 0.84);
  assert.ok(results[0].matchedOn.includes("keyword"));
  assert.ok(results[0].matchedOn.includes("title"));

  assert.equal(results[1].entry.source, "global");
  assert.equal(results[1].entry.relativePath, "ops/deploy.md");
  assertClose(results[1].relevance, 0.7);
});

test("searchKnowledge matches tags case-insensitively", () => {
  const results = searchKnowledge(rolePath, { tags: ["CSS"] });
  assert.equal(results.length, 1);
  assert.equal(results[0].entry.meta.title, "Glassmorphism");
  assert.deepEqual(results[0].matchedOn, ["tag:css"]);
  assertClose(results[0].relevance, 0.3);
});

test("searchKnowledge browse mode applies default and explicit limits", () => {
  const browseDefault = searchKnowledge(rolePath, {});
  assert.equal(browseDefault.length, 5); // default limit, 10 entries available
  assert.deepEqual(browseDefault[0].matchedOn, ["browse"]);

  const browseLimited = searchKnowledge(rolePath, { limit: 3 });
  assert.equal(browseLimited.length, 3);

  // Role entries float to the top in browse mode too (0.5 × 1.2 vs 0.5).
  assert.equal(browseDefault[0].entry.source, "role");
  assertClose(browseDefault[0].relevance, 0.6);
});

test("searchKnowledge filters by category and returns [] for no matches", () => {
  const results = searchKnowledge(rolePath, { query: "design", category: "design-systems" });
  assert.ok(results.length >= 1);
  for (const r of results) assert.equal(r.entry.category, "design-systems");

  assert.deepEqual(searchKnowledge(rolePath, { query: "zzz-no-such-token" }), []);
});

// ============================================================================
// writeKnowledge (role and global sources)
// ============================================================================

const writerRolePath = join(rolesDir, "writer-role");

test("writeKnowledge creates a new role entry with version 1 in the category dir", () => {
  const result = writeKnowledge(writerRolePath, {
    title: "Deployment Checklist",
    description: "Release steps",
    content: "1. build",
    category: "guides",
    tags: ["deploy", "release"],
    global: false,
  });

  const expectedPath = join(getRoleKnowledgeDir(writerRolePath), "guides", "deployment-checklist.md");
  assert.deepEqual(
    { written: result.written, category: result.category, isNew: result.isNew, version: result.version, source: result.source },
    { written: expectedPath, category: "guides", isNew: true, version: 1, source: "role" },
  );

  const content = readFileSync(expectedPath, "utf-8");
  assert.ok(content.includes('title: "Deployment Checklist"'));
  assert.ok(content.includes("version: 1"));
  assert.ok(content.includes('tags: ["deploy", "release"]'));
  assert.ok(content.endsWith("\n\n1. build"));

  // The write is committed into the roles Git repository.
  assert.equal(git(["log", "-1", "--format=%s"]), "docs(writer-role): add knowledge");
});

test("writeKnowledge updating the same title bumps the version", () => {
  const result = writeKnowledge(writerRolePath, {
    title: "Deployment Checklist",
    content: "1. build\n2. ship",
    category: "guides",
    tags: ["deploy", "release"],
    global: false,
  });

  assert.equal(result.isNew, false);
  assert.equal(result.version, 2);

  const content = readFileSync(result.written, "utf-8");
  assert.ok(content.includes("version: 2"));
  assert.ok(content.endsWith("\n\n1. build\n2. ship"));
  assert.equal(git(["log", "-1", "--format=%s"]), "docs(writer-role): update knowledge");
});

test("writeKnowledge without category matches an existing category by tag overlap", () => {
  const result = writeKnowledge(writerRolePath, {
    title: "Rollback Plan",
    content: "Revert the release.",
    tags: ["deploy"],
    global: false,
  });

  assert.equal(result.category, "guides");
  assert.equal(typeof result.suggestion, "string");
  assert.equal(result.written, join(getRoleKnowledgeDir(writerRolePath), "guides", "rollback-plan.md"));
});

test("writeKnowledge without category falls back to (root) when nothing matches", () => {
  const freshRolePath = join(rolesDir, "rooty-role");
  const result = writeKnowledge(freshRolePath, {
    title: "Loose Note",
    content: "No category anywhere.",
    global: false,
  });

  assert.equal(result.category, "(root)");
  assert.equal(result.suggestion, undefined);
  assert.equal(result.written, join(getRoleKnowledgeDir(freshRolePath), "loose-note.md"));
  assert.ok(existsSync(result.written));
});

test("writeKnowledge defaults to the global source and the entry is readable back", () => {
  const result = writeKnowledge(null, {
    title: "Shared Tip",
    content: "Applies everywhere.",
    category: "tips",
    tags: ["general"],
  });

  assert.equal(result.source, "global");
  assert.equal(result.isNew, true);
  assert.equal(result.written, join(GLOBAL_KNOWLEDGE_DIR, "tips", "shared-tip.md"));

  const readBack = readKnowledge("global:tips/shared-tip.md", null);
  assert.ok(readBack);
  assert.equal(readBack.source, "global");
  assert.equal(readBack.frontmatter.title, "Shared Tip");
  // writeKnowledge stores "<frontmatter>\n\n<content>" and parseFrontmatter
  // strips only one newline, so the blank separator remains in the body.
  assert.equal(readBack.body, "\nApplies everywhere.");
});

test("writeKnowledge with global=false but no role falls back to global and labels it", () => {
  const result = writeKnowledge(null, {
    title: "Orphan Role Note",
    content: "No role available.",
    category: "tips",
    global: false,
  });

  assert.equal(result.source, "global");
  assert.equal(result.written, join(GLOBAL_KNOWLEDGE_DIR, "tips", "orphan-role-note.md"));
  assert.ok(existsSync(result.written));
  assert.ok(result.suggestion?.includes("wrote to global knowledge"));
});

test("writeKnowledge round-trips special characters through readKnowledge", () => {
  const title = 'Escaping "Guide"';
  const description = 'Contains \\ backslash and "quotes"';
  const tags = ["a,b", "x]y"];
  const result = writeKnowledge(null, {
    title,
    description,
    content: "Body content.",
    category: "escaping",
    tags,
  });

  assert.equal(result.written, join(GLOBAL_KNOWLEDGE_DIR, "escaping", "escaping-guide.md"));

  const readBack = readKnowledge("global:escaping/escaping-guide.md", null);
  assert.ok(readBack);
  assert.equal(readBack.frontmatter.title, title);
  assert.equal(readBack.frontmatter.description, description);
  assert.deepEqual(readBack.frontmatter.tags, tags);
  assert.equal(readBack.body, "\nBody content.");
});

// ============================================================================
// setProjectCwd / project source discovery
// ============================================================================

test("setProjectCwd toggles project source discovery and keeps it readonly", () => {
  // A cwd without docs/knowledge removes the project source.
  setProjectCwd(join(tempBase, "not-a-project"));
  const without = listKnowledge(rolePath);
  assert.ok(!without.sources.some((s) => s.id === "project"));
  assert.equal(readKnowledge("project:decisions/adr-001.md", rolePath), null);

  // Re-discover the fixture project.
  setProjectCwd(projectDir);
  const withProject = listKnowledge(rolePath);
  const project = withProject.sources.find((s) => s.id === "project");
  assert.ok(project);
  assert.equal(project.readonly, true);
  assert.deepEqual(
    project.categories.map((c) => c.category),
    ["decisions"],
  );
  assert.equal(project.categories[0].entries[0].title, "ADR 001");
});
