import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { ensureRoleMemoryFiles } from "./memory-md.ts";
import { getDefaultPrompts, resolveTemplateLanguage } from "./role-template.ts";

function resolveRolesDir(): string {
  const envPath = process.env.PI_AGENT_ROLES_DIR?.trim();
  return envPath || join(homedir(), ".pi", "agent", "roles");
}

export const ROLES_DIR = resolveRolesDir();
export const ROLE_CONFIG_FILE = join(ROLES_DIR, "config.json");
export const DEFAULT_ROLE = "default";

const CORE_DIR = "core";

const PROMPT_FILE_MAP = [
  { legacy: "AGENTS.md", core: "agents.md" },
  { legacy: "IDENTITY.md", core: "identity.md" },
  { legacy: "SOUL.md", core: "soul.md" },
  { legacy: "USER.md", core: "user.md" },
  { legacy: "TOOLS.md", core: "tools.md" },
  { legacy: "HEARTBEAT.md", core: "heartbeat.md" },
] as const;

function coreFilePath(rolePath: string, filename: string): string {
  return join(rolePath, CORE_DIR, filename);
}

function ensureRoleStructure(rolePath: string): void {
  mkdirSync(join(rolePath, CORE_DIR), { recursive: true });
  mkdirSync(join(rolePath, "memory", "daily"), { recursive: true });
  mkdirSync(join(rolePath, "context"), { recursive: true });
  mkdirSync(join(rolePath, "skills"), { recursive: true });
  mkdirSync(join(rolePath, "archive"), { recursive: true });
}

function migrateLegacyPromptFiles(rolePath: string): number {
  ensureRoleStructure(rolePath);

  let migrated = 0;
  for (const mapping of PROMPT_FILE_MAP) {
    const canonicalPath = coreFilePath(rolePath, mapping.core);
    const legacyPath = join(rolePath, mapping.legacy);
    if (!existsSync(legacyPath)) continue;

    const shouldCopy = !existsSync(canonicalPath) || statSync(legacyPath).mtimeMs > statSync(canonicalPath).mtimeMs;
    if (!shouldCopy) continue;

    copyFileSync(legacyPath, canonicalPath);
    migrated += 1;
  }

  const legacyConstraints = join(rolePath, "CONSTRAINTS.md");
  const canonicalConstraints = coreFilePath(rolePath, "constraints.md");
  if (existsSync(legacyConstraints)) {
    const shouldCopy = !existsSync(canonicalConstraints) || statSync(legacyConstraints).mtimeMs > statSync(canonicalConstraints).mtimeMs;
    if (shouldCopy) {
      copyFileSync(legacyConstraints, canonicalConstraints);
      migrated += 1;
    }
  } else if (!existsSync(canonicalConstraints)) {
    writeFileSync(canonicalConstraints, defaultConstraintsTemplate(), "utf-8");
  }

  return migrated;
}

function cleanupLegacyRoleFiles(rolePath: string): number {
  let removed = 0;

  const legacyRootFiles = [
    "AGENTS.md",
    "IDENTITY.md",
    "SOUL.md",
    "USER.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "MEMORY.md",
    "CONSTRAINTS.md",
  ];

  for (const filename of legacyRootFiles) {
    const file = join(rolePath, filename);
    if (!existsSync(file)) continue;
    try {
      unlinkSync(file);
      removed += 1;
    } catch {
      // ignore cleanup failure
    }
  }

  const memoryRoot = join(rolePath, "memory");
  if (existsSync(memoryRoot)) {
    let names: string[] = [];
    try {
      names = readdirSync(memoryRoot);
    } catch {
      names = [];
    }

    for (const name of names) {
      if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
      const file = join(memoryRoot, name);
      if (!existsSync(file)) continue;
      try {
        unlinkSync(file);
        removed += 1;
      } catch {
        // ignore cleanup failure
      }
    }
  }

  return removed;
}

function promptPath(rolePath: string, coreName: string): string {
  return coreFilePath(rolePath, coreName);
}

function languageForRole(): "zh" | "en" {
  return resolveTemplateLanguage();
}

function defaultConstraintsTemplate(): string {
  if (languageForRole() === "zh") {
    return `# constraints.md - Hard Boundaries\n\n- 不泄露隐私和密钥\n- 外部动作前先确认\n- 避免破坏性操作，优先可回滚\n`;
  }
  return `# constraints.md - Hard Boundaries\n\n- Never leak private data or secrets\n- Ask before external actions\n- Prefer reversible operations over destructive ones\n`;
}

export interface RoleConfig {
  mappings: Record<string, string>;
  defaultRole?: string;
  disabledPaths?: string[];
}

export interface RoleResolution {
  role: string | null;
  source: "mapped" | "default" | "disabled" | "none";
  matchedPath?: string;
}

export function ensureRolesDir(): void {
  if (!existsSync(ROLES_DIR)) {
    mkdirSync(ROLES_DIR, { recursive: true });
  }
}

export function getRoles(): string[] {
  ensureRolesDir();
  try {
    return readdirSync(ROLES_DIR).filter((name) => {
      const path = join(ROLES_DIR, name);
      return statSync(path).isDirectory();
    });
  } catch {
    return [];
  }
}

export function migrateAllRolesToStructuredLayout(): { roles: number; migratedFiles: number; removedFiles: number } {
  ensureRolesDir();
  const roles = getRoles();
  let migratedFiles = 0;
  let removedFiles = 0;

  for (const roleName of roles) {
    const rolePath = join(ROLES_DIR, roleName);
    migratedFiles += migrateLegacyPromptFiles(rolePath);
    ensureRoleMemoryFiles(rolePath, roleName);
    removedFiles += cleanupLegacyRoleFiles(rolePath);
  }

  return { roles: roles.length, migratedFiles, removedFiles };
}

export function createRole(roleName: string): string {
  const rolePath = join(ROLES_DIR, roleName);
  mkdirSync(rolePath, { recursive: true });
  ensureRoleStructure(rolePath);

  const prompts = getDefaultPrompts();

  for (const mapping of PROMPT_FILE_MAP) {
    const content = prompts[mapping.legacy] || "";
    if (!content) continue;

    const canonicalPath = coreFilePath(rolePath, mapping.core);
    if (!existsSync(canonicalPath)) {
      writeFileSync(canonicalPath, content, "utf-8");
    }
  }

  const bootstrap = prompts["BOOTSTRAP.md"];
  if (bootstrap && !existsSync(join(rolePath, "BOOTSTRAP.md"))) {
    writeFileSync(join(rolePath, "BOOTSTRAP.md"), bootstrap, "utf-8");
  }

  const constraintsPath = coreFilePath(rolePath, "constraints.md");
  if (!existsSync(constraintsPath)) {
    writeFileSync(constraintsPath, defaultConstraintsTemplate(), "utf-8");
  }

  const activeProjectPath = join(rolePath, "context", "active-project.md");
  if (!existsSync(activeProjectPath)) {
    writeFileSync(activeProjectPath, "# Active Project\n\n- (none)\n", "utf-8");
  }

  const sessionStatePath = join(rolePath, "context", "session-state.md");
  if (!existsSync(sessionStatePath)) {
    writeFileSync(sessionStatePath, "# Session State\n\n- (empty)\n", "utf-8");
  }

  const skillsPath = join(rolePath, "skills", "active.json");
  if (!existsSync(skillsPath)) {
    writeFileSync(skillsPath, JSON.stringify({ enabled: [] }, null, 2), "utf-8");
  }

  ensureRoleMemoryFiles(rolePath, roleName);
  return rolePath;
}

export function isFirstRun(rolePath: string): boolean {
  return existsSync(join(rolePath, "BOOTSTRAP.md"));
}

export function getRoleIdentity(rolePath: string): { name?: string; emoji?: string } | null {
  migrateLegacyPromptFiles(rolePath);

  const identityPath = promptPath(rolePath, "identity.md");
  if (!existsSync(identityPath)) return null;

  const content = readFileSync(identityPath, "utf-8");
  const nameMatch =
    content.match(/\*\*(?:Name|名字)：\*\*[\s\S]*?^\s*([^\n*]+)/m) ||
    content.match(/^-\s*\*\*(?:Name|名字)：\*\*\s*(.+)$/m);
  const emojiMatch =
    content.match(/\*\*(?:Emoji|表情符号)：\*\*[\s\S]*?^\s*([^\n*]+)/m) ||
    content.match(/^-\s*\*\*(?:Emoji|表情符号)：\*\*\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim(),
    emoji: emojiMatch?.[1]?.trim(),
  };
}

export function loadRoleConfig(): RoleConfig {
  if (!existsSync(ROLE_CONFIG_FILE)) {
    return { mappings: {}, defaultRole: DEFAULT_ROLE, disabledPaths: [] };
  }
  try {
    const content = readFileSync(ROLE_CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content) as RoleConfig;
    return {
      mappings: parsed?.mappings || {},
      defaultRole: parsed?.defaultRole || DEFAULT_ROLE,
      disabledPaths: Array.isArray(parsed?.disabledPaths) ? parsed.disabledPaths : [],
    };
  } catch {
    return { mappings: {}, defaultRole: DEFAULT_ROLE, disabledPaths: [] };
  }
}

export function saveRoleConfig(config: RoleConfig): void {
  ensureRolesDir();

  const normalizedMappings: Record<string, string> = {};
  for (const [path, role] of Object.entries(config.mappings || {})) {
    const key = normalizePath(path);
    if (key && role) normalizedMappings[key] = role;
  }

  const normalizedDisabled = Array.from(
    new Set((config.disabledPaths || []).map((path) => normalizePath(path)).filter(Boolean))
  );

  const payload: RoleConfig = {
    mappings: normalizedMappings,
    defaultRole: config.defaultRole || DEFAULT_ROLE,
    disabledPaths: normalizedDisabled,
  };

  writeFileSync(ROLE_CONFIG_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

function normalizePath(path: string): string {
  return path.replace(/\/$/, "");
}

function pathMatches(cwd: string, basePath: string): boolean {
  const c = normalizePath(cwd);
  const b = normalizePath(basePath);
  return c === b || c.startsWith(b + "/");
}

function findBestMappedRole(cwd: string, mappings: Record<string, string>): { role: string; path: string } | null {
  let best: { role: string; path: string } | null = null;
  for (const [path, role] of Object.entries(mappings)) {
    if (!pathMatches(cwd, path)) continue;
    if (!best || normalizePath(path).length > normalizePath(best.path).length) {
      best = { role, path: normalizePath(path) };
    }
  }
  return best;
}

function findBestDisabledPath(cwd: string, disabledPaths: string[]): string | null {
  let best: string | null = null;
  for (const path of disabledPaths) {
    if (!pathMatches(cwd, path)) continue;
    const n = normalizePath(path);
    if (!best || n.length > best.length) {
      best = n;
    }
  }
  return best;
}

export function resolveRoleForCwd(cwd: string, config?: RoleConfig): RoleResolution {
  const state = config || loadRoleConfig();

  // Explicit mapping has highest priority.
  const mapped = findBestMappedRole(cwd, state.mappings || {});
  if (mapped) {
    return { role: mapped.role, source: "mapped", matchedPath: mapped.path };
  }

  // Explicitly disabled project skips default role.
  const disabled = findBestDisabledPath(cwd, state.disabledPaths || []);
  if (disabled) {
    return { role: null, source: "disabled", matchedPath: disabled };
  }

  const defaultRole = (state.defaultRole || DEFAULT_ROLE).trim();
  if (defaultRole && defaultRole.toLowerCase() !== "none") {
    return { role: defaultRole, source: "default" };
  }

  return { role: null, source: "none" };
}

export function getRoleForCwd(cwd: string, config?: RoleConfig): string | null {
  return resolveRoleForCwd(cwd, config).role;
}

export function isRoleDisabledForCwd(cwd: string, config?: RoleConfig): boolean {
  return resolveRoleForCwd(cwd, config).source === "disabled";
}

export function loadRolePrompts(rolePath: string): string {
  migrateLegacyPromptFiles(rolePath);

  const parts: string[] = [];
  const lang = resolveTemplateLanguage();

  const files =
    lang === "zh"
      ? [
          { core: "agents.md", header: "core/agents.md - 工作空间规则" },
          { core: "identity.md", header: "core/identity.md - 身份" },
          { core: "soul.md", header: "core/soul.md - 核心人格" },
          { core: "user.md", header: "core/user.md - 用户画像" },
          { core: "tools.md", header: "core/tools.md - 工具偏好" },
          { core: "heartbeat.md", header: "core/heartbeat.md - 主动任务" },
          { core: "constraints.md", header: "core/constraints.md - 硬约束" },
        ]
      : [
          { core: "agents.md", header: "core/agents.md - Workspace Rules" },
          { core: "identity.md", header: "core/identity.md - Identity" },
          { core: "soul.md", header: "core/soul.md - Personality" },
          { core: "user.md", header: "core/user.md - User Profile" },
          { core: "tools.md", header: "core/tools.md - Tool Preferences" },
          { core: "heartbeat.md", header: "core/heartbeat.md - Heartbeat" },
          { core: "constraints.md", header: "core/constraints.md - Hard Constraints" },
        ];

  for (const file of files) {
    const path = promptPath(rolePath, file.core);
    if (!existsSync(path)) continue;
    parts.push(`## ${file.header}\n\n${readFileSync(path, "utf-8")}`);
  }

  return parts.join("\n\n---\n\n");
}
