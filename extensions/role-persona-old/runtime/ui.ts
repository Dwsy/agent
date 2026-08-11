/**
 * UI helpers: TUI availability detection, user notification with headless
 * fallback, and the role selection / creation TUI flows.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import { getRoleIdentity, getRoles, isFirstRun, ROLES_DIR } from "../role-store.ts";
import type { Runtime } from "./context.ts";

/** Check if running in RPC mode */
export function isRpcMode(): boolean {
  return process.argv.includes("--mode") && process.argv.includes("rpc");
}

/** Check if TUI/custom UI methods are actually available (not RPC mode) */
export function isTuiAvailable(ctx: ExtensionContext): boolean {
  // RPC mode: hasUI is true but custom() returns undefined
  if (isRpcMode()) return false;
  try {
    return ctx.hasUI && typeof ctx.ui.custom === "function";
  } catch {
    // ctx is stale after session replacement/reload
    return false;
  }
}

/** Notify user — falls back to sendMessage in headless (RPC) mode */
export function notify(rt: Runtime, ctx: ExtensionContext, message: string, level?: string): void {
  if (isTuiAvailable(ctx)) {
    ctx.ui.notify(message, (level as any) ?? "info");
  } else {
    rt.pi.sendMessage({ customType: "role-notify", content: message, display: true }, { triggerTurn: false });
  }
}

export async function selectRoleUI(rt: Runtime, ctx: ExtensionContext): Promise<string | null> {
  if (!isTuiAvailable(ctx)) {
    notify(rt, ctx, "角色选择需要交互模式", "warning");
    return null;
  }

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
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("dim", text),
    });

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(""));
    container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

export async function selectCreateRoleNameUI(rt: Runtime, ctx: ExtensionContext): Promise<string | null> {
  if (!isTuiAvailable(ctx)) {
    notify(rt, ctx, "角色创建需要交互模式", "warning");
    return null;
  }

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
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("dim", text),
    });

    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(""));
    container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (!selected) return null;
  if (selected !== "__custom__") return selected;

  const typed = await ctx.ui.input("新角色名称:", "my-assistant");
  if (!typed || !typed.trim()) return null;
  return typed.trim();
}
