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
    return { mappings: {} };
  }
  try {
    const content = readFileSync(ROLE_CONFIG_FILE, "utf-8");
    return JSON.parse(content) as RoleConfig;
  } catch {
    return { mappings: {} };
  }
}

export function saveRoleConfig(config: RoleConfig): void {
  ensureRolesDir();
  writeFileSync(ROLE_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function getRoleForCwd(cwd: string, config?: RoleConfig): string | null {
  const state = config || loadRoleConfig();
  let matchedRole: string | null = null;
  let matchedPath = "";

  for (const [path, role] of Object.entries(state.mappings)) {
    const normalizedPath = path.replace(/\/$/, "");
    const normalizedCwd = cwd.replace(/\/$/, "");

    if (normalizedCwd === normalizedPath || normalizedCwd.startsWith(normalizedPath + "/")) {
      if (path.length > matchedPath.length) {
        matchedPath = path;
        matchedRole = role;
      }
    }
  }

  return matchedRole;
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
        ]
      : [
          { name: "AGENTS.md", header: "AGENTS.md - Workspace Rules" },
          { name: "IDENTITY.md", header: "IDENTITY.md - Identity" },
          { name: "SOUL.md", header: "SOUL.md - Personality" },
          { name: "USER.md", header: "USER.md - User Profile" },
        ];

  for (const { name, header } of files) {
    const path = join(rolePath, name);
    if (existsSync(path)) {
      parts.push(`## ${header}\n\n${readFileSync(path, "utf-8")}`);
    }
  }

  return parts.join("\n\n---\n\n");
}
