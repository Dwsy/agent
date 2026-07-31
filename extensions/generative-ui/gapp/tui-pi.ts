import { createPiGappRuntimeAdapter } from "./runtime-pi.js";
import {
  createGappTuiAppSession,
  listGappTuiApps,
  type GappTuiPalette,
} from "./tui.js";

function sessionCwd(ctx: any): string {
  return typeof ctx?.cwd === "string" && ctx.cwd.trim() ? ctx.cwd : process.cwd();
}

function paletteFromPiTheme(theme: any): GappTuiPalette {
  return {
    accent: (text) => theme.fg("accent", text),
    dim: (text) => theme.fg("dim", text),
    muted: (text) => theme.fg("muted", text),
    warning: (text) => theme.fg("warning", text),
    success: (text) => theme.fg("success", text),
    error: (text) => theme.fg("error", text),
    text: (text) => theme.fg("text", text),
    border: (text) => theme.fg("border", text),
    bold: (text) => theme.bold(text),
  };
}

async function chooseGapp(ctx: any, cwd: string): Promise<string | null> {
  const apps = await listGappTuiApps(cwd);
  if (apps.length === 0) return null;
  const labels = apps.map((app) => `${app.id} — ${app.name} [${app.scope}]`);
  const selected = await ctx.ui.select("GAPP TUI · 选择应用", labels);
  if (!selected) return null;
  return apps[labels.indexOf(selected)]?.id ?? null;
}

export async function runPiGappTuiApp(
  ctx: any,
  activeWindows: any[],
  initialRef?: string,
): Promise<void> {
  const cwd = sessionCwd(ctx);
  if (!ctx.hasUI) {
    ctx.ui.notify("GAPP TUI 需要 Pi 交互模式。", "warning");
    return;
  }

  const ref = initialRef?.trim() || (await chooseGapp(ctx, cwd));
  if (!ref) {
    ctx.ui.notify("没有提供 tui.mjs 的 GAPP。", "info");
    return;
  }

  let session;
  try {
    session = await createGappTuiAppSession({
      ref,
      cwd,
      adapter: createPiGappRuntimeAdapter({ activeWindows }),
    });
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    return;
  }

  for (;;) {
    const action = await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: any) => {
      session.setPalette(paletteFromPiTheme(theme));
      session.setRequestRender(() => tui.requestRender());
      session.setHostActionHandler(done);
      return session.component;
    });
    session.setRequestRender(() => {});
    session.setHostActionHandler(() => {});
    if (!action || action.kind === "exit") return;

    const value = await ctx.ui.editor(action.title, action.initial);
    if (value === undefined) continue;
    try {
      await action.submit(value);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }
}

// Backward-compatible export name; behavior is now direct app rendering.
export const runPiGappControlCenter = runPiGappTuiApp;
