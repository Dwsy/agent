import { afterAll, mock, test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// role-store.ts transitively imports memory-tags.ts, which has a runtime
// dependency on pi-only modules. Mock them before the dynamic import below.
mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({
    stopReason: "end",
    content: [{ type: "text", text: "{}" }],
  }),
}));

mock.module("@earendil-works/pi-coding-agent", () => ({
  convertToLlm: (messages: unknown[]) => messages,
  serializeConversation: (messages: unknown[]) => JSON.stringify(messages),
}));

// ROLES_DIR is resolved at module load time, so the redirect env var must be
// in place before role-store.ts is imported. The directory is git-initialized
// because writeCommittedMemoryFile (used by ensureRoleMemoryFiles) requires
// the configured roles directory to be a git repository when role paths live
// inside it.
const rolesDir = mkdtempSync(join(tmpdir(), "rp-role-store-"));
execFileSync("git", ["-C", rolesDir, "init", "-q"]);
execFileSync("git", ["-C", rolesDir, "config", "user.name", "Test"]);
execFileSync("git", ["-C", rolesDir, "config", "user.email", "test@example.invalid"]);

const savedRolesDirEnv = process.env.PI_ROLES_DIR;
const savedLegacyRolesDirEnv = process.env.PI_AGENT_ROLES_DIR;
process.env.PI_ROLES_DIR = rolesDir;
delete process.env.PI_AGENT_ROLES_DIR;

// The query suffix gives this file its own module instance, so the canonical
// "./role-store.ts" cache entry stays free for other test files (for example
// knowledge.test.ts) that redirect PI_ROLES_DIR to their own fixture tree.
const roleStoreSpecifier = "./role-store.ts?role-store-test";
const roleStore = (await import(roleStoreSpecifier)) as typeof import("./role-store.ts");
const { getDefaultPrompts, resolveTemplateLanguage } = await import("./role-template.ts");

// Hard safety gate: never run filesystem tests against the user's real roles
// directory. If the module was cached with another ROLES_DIR, fail the whole
// file before any mutating test executes.
if (roleStore.ROLES_DIR !== rolesDir) {
  throw new Error(
    `ROLES_DIR redirect failed: expected ${rolesDir}, got ${roleStore.ROLES_DIR}. ` +
      "role-store.ts was likely imported before PI_ROLES_DIR was set.",
  );
}

const {
  DEFAULT_ROLE,
  ROLE_CONFIG_FILE,
  ROLES_DIR,
  createRole,
  getRoleForCwd,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  isRoleDisabledForCwd,
  loadRoleConfig,
  loadRolePrompts,
  migrateAllRolesToStructuredLayout,
  resolveRoleForCwd,
  saveRoleConfig,
} = roleStore;

afterAll(() => {
  rmSync(rolesDir, { recursive: true, force: true });
  if (savedRolesDirEnv === undefined) delete process.env.PI_ROLES_DIR;
  else process.env.PI_ROLES_DIR = savedRolesDirEnv;
  if (savedLegacyRolesDirEnv !== undefined) process.env.PI_AGENT_ROLES_DIR = savedLegacyRolesDirEnv;
});

function removeConfigFile(): void {
  if (existsSync(ROLE_CONFIG_FILE)) unlinkSync(ROLE_CONFIG_FILE);
}

test("module constants point at the redirected temp directory", () => {
  assert.equal(ROLES_DIR, rolesDir);
  assert.equal(ROLE_CONFIG_FILE, join(rolesDir, "config.json"));
  assert.equal(DEFAULT_ROLE, "default");
});

test("createRole creates the v2 structured layout with default templates", () => {
  const rolePath = createRole("alpha");
  assert.equal(rolePath, join(rolesDir, "alpha"));

  for (const dir of ["core", join("memory", "daily"), "context", "skills", "archive"]) {
    assert.ok(statSync(join(rolePath, dir)).isDirectory(), `expected directory ${dir}`);
  }

  const prompts = getDefaultPrompts();
  assert.equal(readFileSync(join(rolePath, "core", "agents.md"), "utf-8"), prompts["AGENTS.md"]);
  assert.equal(readFileSync(join(rolePath, "core", "identity.md"), "utf-8"), prompts["IDENTITY.md"]);
  assert.equal(readFileSync(join(rolePath, "core", "soul.md"), "utf-8"), prompts["SOUL.md"]);
  assert.equal(readFileSync(join(rolePath, "core", "user.md"), "utf-8"), prompts["USER.md"]);
  assert.equal(readFileSync(join(rolePath, "core", "tools.md"), "utf-8"), prompts["TOOLS.md"]);
  assert.equal(readFileSync(join(rolePath, "core", "heartbeat.md"), "utf-8"), prompts["HEARTBEAT.md"]);
  assert.equal(readFileSync(join(rolePath, "BOOTSTRAP.md"), "utf-8"), prompts["BOOTSTRAP.md"]);

  assert.ok(
    readFileSync(join(rolePath, "core", "constraints.md"), "utf-8").includes("constraints.md - Hard Boundaries"),
  );
  assert.equal(
    readFileSync(join(rolePath, "context", "active-project.md"), "utf-8"),
    "# Active Project\n\n- (none)\n",
  );
  assert.equal(
    readFileSync(join(rolePath, "context", "session-state.md"), "utf-8"),
    "# Session State\n\n- (empty)\n",
  );
  assert.deepEqual(JSON.parse(readFileSync(join(rolePath, "skills", "active.json"), "utf-8")), { enabled: [] });

  assert.ok(existsSync(join(rolePath, "memory", "consolidated.md")));
  assert.ok(existsSync(join(rolePath, "memory", "pending.md")));
});

test("getRoles lists role directories and skips reserved, hidden, underscore and plain files", () => {
  createRole("beta");
  mkdirSync(join(rolesDir, "knowledge"), { recursive: true });
  mkdirSync(join(rolesDir, "_drafts"), { recursive: true });
  mkdirSync(join(rolesDir, ".hidden"), { recursive: true });
  writeFileSync(join(rolesDir, "stray.txt"), "not a role\n", "utf-8");

  assert.deepEqual(getRoles().sort(), ["alpha", "beta"]);
});

test("resolveRoleForCwd honors exact and inherited mappings", () => {
  const config = { mappings: { "/tmp/proj/a": "alpha" }, defaultRole: "default", disabledPaths: [] };

  assert.deepEqual(resolveRoleForCwd("/tmp/proj/a", config), {
    role: "alpha",
    source: "mapped",
    matchedPath: "/tmp/proj/a",
  });
  assert.deepEqual(resolveRoleForCwd("/tmp/proj/a/nested/deep", config), {
    role: "alpha",
    source: "mapped",
    matchedPath: "/tmp/proj/a",
  });
  // Prefix without a path-boundary must not match.
  assert.deepEqual(resolveRoleForCwd("/tmp/proj/ab", config), { role: "default", source: "default" });
});

test("resolveRoleForCwd picks the longest matching mapping", () => {
  const config = {
    mappings: { "/tmp/proj": "outer", "/tmp/proj/a": "inner" },
    defaultRole: "default",
    disabledPaths: [],
  };
  assert.deepEqual(resolveRoleForCwd("/tmp/proj/a/x", config), {
    role: "inner",
    source: "mapped",
    matchedPath: "/tmp/proj/a",
  });
  assert.deepEqual(resolveRoleForCwd("/tmp/proj/b", config), {
    role: "outer",
    source: "mapped",
    matchedPath: "/tmp/proj",
  });
});

test("resolveRoleForCwd normalizes trailing slashes in mapping keys", () => {
  const config = { mappings: { "/tmp/proj/b/": "beta" }, defaultRole: "default", disabledPaths: [] };
  assert.deepEqual(resolveRoleForCwd("/tmp/proj/b", config), {
    role: "beta",
    source: "mapped",
    matchedPath: "/tmp/proj/b",
  });
});

test("resolveRoleForCwd falls back to defaultRole, and 'none' disables the fallback", () => {
  assert.deepEqual(
    resolveRoleForCwd("/anywhere", { mappings: {}, defaultRole: "beta", disabledPaths: [] }),
    { role: "beta", source: "default" },
  );
  assert.deepEqual(
    resolveRoleForCwd("/anywhere", { mappings: {} }),
    { role: DEFAULT_ROLE, source: "default" },
  );
  assert.deepEqual(
    resolveRoleForCwd("/anywhere", { mappings: {}, defaultRole: "None", disabledPaths: [] }),
    { role: null, source: "none" },
  );
});

test("resolveRoleForCwd reports disabled paths, but explicit mappings win over disabling", () => {
  const disabledOnly = { mappings: {}, defaultRole: "default", disabledPaths: ["/tmp/off"] };
  assert.deepEqual(resolveRoleForCwd("/tmp/off", disabledOnly), {
    role: null,
    source: "disabled",
    matchedPath: "/tmp/off",
  });
  assert.deepEqual(resolveRoleForCwd("/tmp/off/sub/dir", disabledOnly), {
    role: null,
    source: "disabled",
    matchedPath: "/tmp/off",
  });

  const mappedInsideDisabled = {
    mappings: { "/tmp/off/sub": "alpha" },
    defaultRole: "default",
    disabledPaths: ["/tmp/off"],
  };
  assert.deepEqual(resolveRoleForCwd("/tmp/off/sub", mappedInsideDisabled), {
    role: "alpha",
    source: "mapped",
    matchedPath: "/tmp/off/sub",
  });
});

test("isRoleDisabledForCwd and getRoleForCwd reflect the resolution result", () => {
  const config = {
    mappings: { "/tmp/off/sub": "alpha" },
    defaultRole: "default",
    disabledPaths: ["/tmp/off"],
  };
  assert.equal(isRoleDisabledForCwd("/tmp/off", config), true);
  assert.equal(isRoleDisabledForCwd("/tmp/off/other", config), true);
  assert.equal(isRoleDisabledForCwd("/tmp/offbeat", config), false);
  assert.equal(isRoleDisabledForCwd("/tmp/off/sub", config), false);

  assert.equal(getRoleForCwd("/tmp/off", config), null);
  assert.equal(getRoleForCwd("/tmp/off/sub/x", config), "alpha");
  assert.equal(getRoleForCwd("/elsewhere", config), "default");
});

test("loadRoleConfig returns defaults when the config file is missing", () => {
  removeConfigFile();
  assert.deepEqual(loadRoleConfig(), { mappings: {}, defaultRole: "default", disabledPaths: [] });
});

test("saveRoleConfig normalizes paths and round-trips through loadRoleConfig", () => {
  try {
    saveRoleConfig({
      mappings: { "/a/b/": "alpha", "": "ghost", "/c": "" },
      defaultRole: "beta",
      disabledPaths: ["/d/", "/d", "/e"],
    });
    assert.deepEqual(loadRoleConfig(), {
      mappings: { "/a/b": "alpha" },
      defaultRole: "beta",
      disabledPaths: ["/d", "/e"],
    });

    // File-backed resolution (no explicit config argument).
    assert.deepEqual(resolveRoleForCwd("/a/b/sub"), {
      role: "alpha",
      source: "mapped",
      matchedPath: "/a/b",
    });
    assert.equal(isRoleDisabledForCwd("/d/x"), true);
    assert.equal(getRoleForCwd("/unmapped"), "beta");
  } finally {
    removeConfigFile();
  }
});

test("saveRoleConfig falls back to the default role when none is given", () => {
  try {
    saveRoleConfig({ mappings: {} });
    assert.deepEqual(loadRoleConfig(), { mappings: {}, defaultRole: "default", disabledPaths: [] });
  } finally {
    removeConfigFile();
  }
});

test("loadRoleConfig tolerates corrupt or partial config files", () => {
  try {
    writeFileSync(ROLE_CONFIG_FILE, "{ not json", "utf-8");
    assert.deepEqual(loadRoleConfig(), { mappings: {}, defaultRole: "default", disabledPaths: [] });

    writeFileSync(ROLE_CONFIG_FILE, "{}", "utf-8");
    assert.deepEqual(loadRoleConfig(), { mappings: {}, defaultRole: "default", disabledPaths: [] });
  } finally {
    removeConfigFile();
  }
});

test("getRoleIdentity returns null when core/identity.md is missing", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-missing-"));
  try {
    assert.equal(getRoleIdentity(rolePath), null);
    // Side effect: the structured layout is created even for empty roles.
    assert.ok(statSync(join(rolePath, "core")).isDirectory());
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("getRoleIdentity parses name and emoji from multi-line list values", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-multiline-"));
  try {
    mkdirSync(join(rolePath, "core"), { recursive: true });
    writeFileSync(
      join(rolePath, "core", "identity.md"),
      "# core/identity.md\n\n- **名字：**\n  小飞\n- **表情符号：**\n  🐦\n",
      "utf-8",
    );
    assert.deepEqual(getRoleIdentity(rolePath), { name: "小飞", emoji: "🐦" });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("getRoleIdentity parses a same-line value on the last line", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-inline-"));
  try {
    mkdirSync(join(rolePath, "core"), { recursive: true });
    writeFileSync(join(rolePath, "core", "identity.md"), "# core/identity.md\n\n- **名字：** 小飞\n", "utf-8");
    assert.deepEqual(getRoleIdentity(rolePath), { name: "小飞", emoji: undefined });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("getRoleIdentity parses a same-line value followed by more label lines", () => {
  // Regression: the multi-line pattern used to skip past the inline value and
  // capture the next list label, yielding a garbage name of "-".
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-inline-mixed-"));
  try {
    mkdirSync(join(rolePath, "core"), { recursive: true });
    writeFileSync(
      join(rolePath, "core", "identity.md"),
      "# core/identity.md\n\n- **名字：** 小飞\n- **定位：** 工程助理\n- **表情符号：** 🐦\n",
      "utf-8",
    );
    assert.deepEqual(getRoleIdentity(rolePath), { name: "小飞", emoji: "🐦" });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("getRoleIdentity returns undefined fields for empty template labels", () => {
  // Regression: empty labels used to parse as {name: "-", emoji: "-"}.
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-empty-"));
  try {
    mkdirSync(join(rolePath, "core"), { recursive: true });
    writeFileSync(
      join(rolePath, "core", "identity.md"),
      "# core/identity.md\n\n- **名字：**\n- **表情符号：**\n",
      "utf-8",
    );
    assert.deepEqual(getRoleIdentity(rolePath), { name: undefined, emoji: undefined });
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("getRoleIdentity migrates a legacy root IDENTITY.md before reading", () => {
  const rolePath = mkdtempSync(join(tmpdir(), "rp-identity-legacy-"));
  try {
    writeFileSync(join(rolePath, "IDENTITY.md"), "- **名字：** 旧角色\n", "utf-8");
    assert.deepEqual(getRoleIdentity(rolePath), { name: "旧角色", emoji: undefined });
    assert.equal(readFileSync(join(rolePath, "core", "identity.md"), "utf-8"), "- **名字：** 旧角色\n");
  } finally {
    rmSync(rolePath, { recursive: true, force: true });
  }
});

test("isFirstRun is true only while BOOTSTRAP.md exists", () => {
  const rolePath = join(rolesDir, "beta");
  assert.equal(isFirstRun(rolePath), true);
  unlinkSync(join(rolePath, "BOOTSTRAP.md"));
  assert.equal(isFirstRun(rolePath), false);
});

test("loadRolePrompts concatenates all seven core files with localized headers", () => {
  const rolePath = join(rolesDir, "alpha");
  const prompts = loadRolePrompts(rolePath);
  const sections = prompts.split("\n\n---\n\n");
  assert.equal(sections.length, 7);

  const lang = resolveTemplateLanguage();
  const expectedHeaders =
    lang === "zh"
      ? [
          "core/agents.md - 工作空间规则",
          "core/identity.md - 身份",
          "core/soul.md - 核心人格",
          "core/user.md - 用户画像",
          "core/tools.md - 工具偏好",
          "core/heartbeat.md - 主动任务",
          "core/constraints.md - 硬约束",
        ]
      : [
          "core/agents.md - Workspace Rules",
          "core/identity.md - Identity",
          "core/soul.md - Personality",
          "core/user.md - User Profile",
          "core/tools.md - Tool Preferences",
          "core/heartbeat.md - Heartbeat",
          "core/constraints.md - Hard Constraints",
        ];
  sections.forEach((section, index) => {
    assert.ok(
      section.startsWith(`## ${expectedHeaders[index]}\n\n`),
      `section ${index} should start with header "${expectedHeaders[index]}"`,
    );
  });

  const identityContent = readFileSync(join(rolePath, "core", "identity.md"), "utf-8");
  assert.equal(sections[1], `## ${expectedHeaders[1]}\n\n${identityContent}`);
});

test("migrateAllRolesToStructuredLayout moves legacy files into the v2 layout", () => {
  const legacyPath = join(rolesDir, "legacy");
  mkdirSync(join(legacyPath, "memory"), { recursive: true });
  writeFileSync(join(legacyPath, "IDENTITY.md"), "- **名字：** 旧身份\n", "utf-8");
  writeFileSync(join(legacyPath, "SOUL.md"), "# old soul\n", "utf-8");
  writeFileSync(join(legacyPath, "MEMORY.md"), "# Memory: legacy\n\n- old note\n", "utf-8");
  writeFileSync(join(legacyPath, "memory", "2024-01-01.md"), "# daily legacy\n", "utf-8");

  const result = migrateAllRolesToStructuredLayout();
  // Roles at this point: alpha, beta, legacy. Only "legacy" has legacy files:
  // IDENTITY.md + SOUL.md are migrated (2); IDENTITY.md, SOUL.md, MEMORY.md
  // and memory/2024-01-01.md are removed afterwards (4).
  assert.deepEqual(result, { roles: 3, migratedFiles: 2, removedFiles: 4 });

  assert.equal(readFileSync(join(legacyPath, "core", "identity.md"), "utf-8"), "- **名字：** 旧身份\n");
  assert.equal(readFileSync(join(legacyPath, "core", "soul.md"), "utf-8"), "# old soul\n");
  assert.equal(readFileSync(join(legacyPath, "memory", "consolidated.md"), "utf-8"), "# Memory: legacy\n\n- old note\n");
  assert.equal(readFileSync(join(legacyPath, "memory", "daily", "2024-01-01.md"), "utf-8"), "# daily legacy\n");
  assert.ok(readFileSync(join(legacyPath, "core", "constraints.md"), "utf-8").includes("Hard Boundaries"));

  for (const removed of ["IDENTITY.md", "SOUL.md", "MEMORY.md", join("memory", "2024-01-01.md")]) {
    assert.equal(existsSync(join(legacyPath, removed)), false, `${removed} should be removed`);
  }
});

test("migrateAllRolesToStructuredLayout keeps newer canonical files over older legacy copies", () => {
  const rolePath = createRole("gamma");
  const canonicalIdentity = readFileSync(join(rolePath, "core", "identity.md"), "utf-8");

  const legacyIdentity = join(rolePath, "IDENTITY.md");
  writeFileSync(legacyIdentity, "- **名字：** 过期身份\n", "utf-8");
  const past = new Date("2000-01-01T00:00:00Z");
  utimesSync(legacyIdentity, past, past);

  const result = migrateAllRolesToStructuredLayout();
  // Roles: alpha, beta, legacy, gamma. The stale legacy IDENTITY.md is not
  // copied over the newer canonical file, but it is still cleaned up.
  assert.deepEqual(result, { roles: 4, migratedFiles: 0, removedFiles: 1 });
  assert.equal(readFileSync(join(rolePath, "core", "identity.md"), "utf-8"), canonicalIdentity);
  assert.equal(existsSync(legacyIdentity), false);
});
