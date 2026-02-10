import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { ensureRoleMemoryFiles } from "./memory-md.ts";
import { getDefaultPrompts, resolveTemplateLanguage } from "./role-template.ts";

export const ROLES_DIR = join(homedir(), ".pi", "agent", "roles");
export const ROLE_CONFIG_FILE = join(ROLES_DIR, "config.json");
export const DEFAULT_ROLE = "default";

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

export function createRole(roleName: string): string {
  const rolePath = join(ROLES_DIR, roleName);
  mkdirSync(rolePath, { recursive: true });
  mkdirSync(join(rolePath, "memory"), { recursive: true });

  const prompts = getDefaultPrompts();
  for (const [filename, content] of Object.entries(prompts)) {
    writeFileSync(join(rolePath, filename), content, "utf-8");
  }

  ensureRoleMemoryFiles(rolePath, roleName);
  return rolePath;
}

export function isFirstRun(rolePath: string): boolean {
  return existsSync(join(rolePath, "BOOTSTRAP.md"));
}

export function getRoleIdentity(rolePath: string): { name?: string; emoji?: string } | null {
  const identityPath = join(rolePath, "IDENTITY.md");
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
  const parts: string[] = [];
  const lang = resolveTemplateLanguage();

  const files =
    lang === "zh"
      ? [
          { name: "AGENTS.md", header: "AGENTS.md - 工作空间规则" },
          { name: "IDENTITY.md", header: "IDENTITY.md - 身份" },
          { name: "SOUL.md", header: "SOUL.md - 核心人格" },
          { name: "USER.md", header: "USER.md - 用户画像" },
          { name: "TOOLS.md", header: "TOOLS.md - 工具偏好" },
        ]
      : [
          { name: "AGENTS.md", header: "AGENTS.md - Workspace Rules" },
          { name: "IDENTITY.md", header: "IDENTITY.md - Identity" },
          { name: "SOUL.md", header: "SOUL.md - Personality" },
          { name: "USER.md", header: "USER.md - User Profile" },
          { name: "TOOLS.md", header: "TOOLS.md - Tool Preferences" },
        ];

  for (const { name, header } of files) {
    const path = join(rolePath, name);
    if (existsSync(path)) {
      parts.push(`## ${header}\n\n${readFileSync(path, "utf-8")}`);
    }
  }

  return parts.join("\n\n---\n\n");
}
