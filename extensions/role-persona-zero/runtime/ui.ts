/**
 * UI helpers: TUI availability detection, user notification with headless
 * fallback, and the role selection / creation TUI flows.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { buildPanelDetail, buildPanelEntries, scopeLineFor } from "../role-control-center.ts";
import { showRolePanel } from "../role-panel.ts";
import type { Runtime } from "./context.ts";

/** Check if running in RPC mode */
export function isRpcMode(): boolean {
  return process.argv.includes("--mode") && process.argv.includes("rpc");
}

/** Check if TUI/custom UI methods are actually available */
export function isTuiAvailable(ctx: ExtensionContext): boolean {
  try {
    if (!ctx.hasUI || typeof ctx.ui.custom !== "function") return false;
    // Headless pi RPC exposes ui.custom but resolves it to undefined. However,
    // grok-pi runs pi with `--mode rpc` too (argv sniffing misclassifies it) and
    // installs the Rust TUI bridge, which tags its custom() replacement with
    // __rustTuiBridge. Trust the capability marker over the argv heuristic.
    const custom = ctx.ui.custom as ((...args: unknown[]) => unknown) & { __rustTuiBridge?: boolean };
    if (isRpcMode() && !custom.__rustTuiBridge) return false;
    return true;
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

  // Unified role panel in select mode: Enter picks, ^N creates, Esc cancels.
  const action = await showRolePanel(ctx, {
    entries: buildPanelEntries(ctx.cwd, null),
    detail: buildPanelDetail,
    scopeLine: scopeLineFor(ctx.cwd, null),
    mode: "select",
  });
  if (action?.startsWith("map:")) return action.slice("map:".length);
  if (action === "create") return "__create__";
  return null;
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
      handleMouse(event: TuiMouseEvent) {
        return container.handleMouse(event);
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
