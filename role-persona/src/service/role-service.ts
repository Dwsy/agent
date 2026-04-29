/**
 * Role Service — role CRUD, mapping, resolution.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ActiveRole,
  RoleConfig,
  RoleResolution,
  RoleIdentity,
  RoleCreateResult,
  MapResult,
  UnmapResult,
  DirectoryListing,
  MigrationResult,
} from "../core/types.ts";
import {
  createRole,
  DEFAULT_ROLE,
  ensureRolesDir,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  isRoleDisabledForCwd,
  loadRoleConfig,
  loadRolePrompts,
  migrateAllRolesToStructuredLayout,
  resolveRoleForCwd,
  ROLES_DIR,
  saveRoleConfig,
} from "../core/role-store.ts";
import type { ServiceContext } from "./context.ts";

export interface RoleService {
  list(): string[];
  get(): ActiveRole | null;
  create(name: string): RoleCreateResult;
  activate(name: string): ActiveRole;
  map(cwd: string, roleName: string): MapResult;
  unmap(cwd: string): UnmapResult;
  resolve(cwd: string): RoleResolution;
  getIdentity(rolePath: string): RoleIdentity | null;
  getPrompts(rolePath: string): string;
  getStructure(rolePath: string, subPath?: string): DirectoryListing;
  loadConfig(): RoleConfig;
  saveConfig(config: RoleConfig): void;
  migrateAll(): MigrationResult;
}

function normalizePath(path: string): string {
  return path.replace(/\/$/, "");
}

export function createRoleService(ctx: ServiceContext): RoleService {
  return {
    list() {
      return getRoles();
    },

    get() {
      return ctx.activeRole;
    },

    create(name: string) {
      const rolePath = join(ctx.rolesDir, name);
      if (existsSync(rolePath)) {
        return { ok: false, path: rolePath, name };
      }
      createRole(name);
      return { ok: true, path: rolePath, name };
    },

    activate(name: string) {
      const rolePath = join(ctx.rolesDir, name);
      if (!existsSync(rolePath)) {
        createRole(name);
      }
      const identity = getRoleIdentity(rolePath);
      const firstRun = isFirstRun(rolePath);
      const active: ActiveRole = { name, path: rolePath, identity, isFirstRun: firstRun };
      ctx.activeRole = active;
      return active;
    },

    map(cwd: string, roleName: string) {
      const rolePath = join(ctx.rolesDir, roleName);
      if (!existsSync(rolePath)) {
        throw new Error(`Role "${roleName}" does not exist.`);
      }
      const config = loadRoleConfig();
      const cwdKey = normalizePath(cwd);
      config.mappings[cwdKey] = roleName;
      config.disabledPaths = (config.disabledPaths || []).filter((p) => normalizePath(p) !== cwdKey);
      saveRoleConfig(config);
      this.activate(roleName);
      return { ok: true, cwd: cwdKey, role: roleName };
    },

    unmap(cwd: string) {
      const config = loadRoleConfig();
      const cwdKey = normalizePath(cwd);
      let removedMapping = false;
      for (const [path] of Object.entries(config.mappings)) {
        if (normalizePath(path) === cwdKey) {
          delete config.mappings[path];
          removedMapping = true;
        }
      }
      const disabled = new Set((config.disabledPaths || []).map((p) => normalizePath(p)));
      disabled.add(cwdKey);
      config.disabledPaths = Array.from(disabled);
      saveRoleConfig(config);
      ctx.activeRole = null;
      return { ok: true, removedMapping };
    },

    resolve(cwd: string) {
      const config = loadRoleConfig();
      return resolveRoleForCwd(cwd, config);
    },

    getIdentity(rolePath: string) {
      return getRoleIdentity(rolePath);
    },

    getPrompts(rolePath: string) {
      return loadRolePrompts(rolePath);
    },

    getStructure(rolePath: string, subPath?: string) {
      const { readdirSync, statSync } = require("node:fs");
      const { resolve, relative, join: pathJoin } = require("node:path");

      const target = subPath ? pathJoin(rolePath, subPath) : rolePath;
      const resolvedTarget = resolve(target);
      const resolvedRoot = resolve(rolePath);

      // Security: prevent path escape
      const rel = relative(resolvedRoot, resolvedTarget);
      if (rel.startsWith("..")) {
        throw new Error("Path escapes role directory.");
      }

      if (!existsSync(resolvedTarget)) {
        throw new Error(`Path not found: ${subPath || "."}`);
      }

      const st = statSync(resolvedTarget);
      let files: string[] = [];
      if (st.isFile()) {
        files = [resolvedTarget];
      } else {
        const entries = readdirSync(resolvedTarget, { withFileTypes: true });
        files = entries
          .filter((e: any) => e.isFile())
          .map((e: any) => pathJoin(resolvedTarget, e.name))
          .sort();
      }

      const relFiles = files.map((p: string) => relative(resolvedRoot, p) || ".");

      return {
        path: rolePath,
        base: subPath || ".",
        files: relFiles,
        count: relFiles.length,
        recursive: false,
      };
    },

    loadConfig() {
      return loadRoleConfig();
    },

    saveConfig(config: RoleConfig) {
      saveRoleConfig(config);
    },

    migrateAll() {
      return migrateAllRolesToStructuredLayout();
    },
  };
}
