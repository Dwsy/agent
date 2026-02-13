/**
 * TUI role selection and role setup logic.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SelectList, Text, Container } from "@mariozechner/pi-tui";
import type { RoleContext } from "./role-context.ts";
import {
  createRole,
  DEFAULT_ROLE,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  ROLES_DIR,
} from "./role-store.ts";
import { ensureRoleMemoryFiles, repairRoleMemory } from "./memory-md.ts";

export async function selectRoleUI(ctx: ExtensionContext): Promise<string | null> {
  const roles = getRoles();

  const items = roles.map(name => {
    const path = join(ROLES_DIR, name);
    const identity = getRoleIdentity(path);
    const firstRun = isFirstRun(path);

    return {
      value: name,
      label: identity?.name ? `${name} (${identity.name})` : name,
      description: firstRun ? "[FIRST RUN] 首次运行 - 需要初始化" : "已配置"
    };
  });

  items.push({
    value: "__create__",
    label: "+ 创建新角色",
    description: "创建自定义角色"
  });

  return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();

    container.addChild(new Text(theme.fg("accent", theme.bold("选择角色"))));
    container.addChild(new Text(theme.fg("muted", "每个角色有独立的记忆和个性")));
    container.addChild(new Text(""));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", theme.bold(text)),
      description: (text) => theme.fg("dim", text),
    });

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(""));
    container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

    return {
      render(width: number) { return container.render(width); },
      invalidate() { container.invalidate(); },
      handleInput(data: string) { selectList.handleInput(data); tui.requestRender(); },
    };
  });
}

export async function selectCreateRoleNameUI(ctx: ExtensionContext): Promise<string | null> {
  const preset = ["architect", "backend", "frontend", "reviewer", "mentor", "assistant"];
  const items = [
    { value: "__custom__", label: "+ 自定义名称", description: "输入任意角色名" },
    ...preset.map((name) => ({ value: name, label: name, description: "预设建议" })),
  ];

  const selected = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", theme.bold("创建角色"))));
    container.addChild(new Text(theme.fg("muted", "先上下选择，再回车确认")));
    container.addChild(new Text(""));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", theme.bold(text)),
      description: (text) => theme.fg("dim", text),
    });

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(""));
    container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

    return {
      render(width: number) { return container.render(width); },
      invalidate() { container.invalidate(); },
      handleInput(data: string) { selectList.handleInput(data); tui.requestRender(); },
    };
  });

  if (!selected) return null;
  if (selected !== "__custom__") return selected;

  const typed = await ctx.ui.input("新角色名称:", "my-assistant");
  if (!typed || !typed.trim()) return null;
  return typed.trim();
}

export async function setupRole(rc: RoleContext, roleName: string, ctx: ExtensionContext): Promise<void> {
  if (roleName === "__create__") {
    const newName = await ctx.ui.input("新角色名称:", "my-assistant");
    if (!newName || newName.trim() === "") {
      rc.notify(ctx, "取消创建，使用默认角色", "warning");
      return setupRole(rc, DEFAULT_ROLE, ctx);
    }

    const trimmedName = newName.trim();
    const newPath = createRole(trimmedName);
    rc.notify(ctx, `[OK] 创建角色: ${trimmedName}`, "success");
    rc.notify(ctx, "BOOTSTRAP.md 将引导初始化过程", "info");

    return activateRole(rc, trimmedName, newPath, ctx);
  }

  const rolePath = join(ROLES_DIR, roleName);
  if (!existsSync(rolePath)) {
    createRole(roleName);
  }

  return activateRole(rc, roleName, rolePath, ctx);
}

export async function activateRole(rc: RoleContext, roleName: string, rolePath: string, ctx: ExtensionContext): Promise<void> {
  rc.currentRole = roleName;
  rc.currentRolePath = rolePath;
  rc.autoMemoryInFlight = false;
  rc.autoMemoryBgScheduled = false;
  rc.autoMemoryPendingTurns = 0;
  rc.autoMemoryLastFlushLen = 0;
  rc.autoMemoryLastMessages = null;
  rc.stopMemoryCheckpointSpinner();

  ensureRoleMemoryFiles(rolePath, roleName);
  const repair = repairRoleMemory(rolePath, roleName);

  if (ctx.hasUI) {
    const identity = getRoleIdentity(rolePath);
    const displayName = identity?.name || roleName;

    ctx.ui.setStatus("role", displayName);
    ctx.ui.setStatus("memory-checkpoint", undefined);

    if (repair.repaired) {
      rc.notify(ctx, `MEMORY.md 已规范化修复 (${repair.issues} issues)`, "info");
    }

    if (isFirstRun(rolePath)) {
      rc.notify(ctx, `${displayName} - [FIRST RUN]`, "info");
      rc.notify(ctx, '发送 "hello" 开始人格设定对话', "info");
    }
  }
}
