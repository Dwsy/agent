#!/usr/bin/env bun
import {
  Input,
  Key,
  matchesKey,
  ProcessTerminal,
  SelectList,
  Text,
  TUI,
  type SelectListTheme,
} from "@earendil-works/pi-tui";
import { createHostGappRuntimeAdapter } from "./runtime-host.js";
import {
  createGappTuiAppSession,
  listGappTuiApps,
  type GappTuiAppSession,
  type GappTuiHostAction,
  type GappTuiPalette,
} from "./tui.js";

const ansi = (code: number) => (text: string) => `\u001b[${code}m${text}\u001b[0m`;
const standalonePalette: GappTuiPalette = {
  accent: ansi(36),
  dim: ansi(2),
  muted: ansi(90),
  warning: ansi(33),
  success: ansi(32),
  error: ansi(31),
  text: (text) => text,
  border: ansi(90),
  bold: ansi(1),
};
const selectTheme: SelectListTheme = {
  selectedPrefix: ansi(36),
  selectedText: (text) => ansi(1)(ansi(36)(text)),
  description: ansi(90),
  scrollInfo: ansi(90),
  noMatch: ansi(33),
};

export interface GappTuiCliOptions {
  cwd: string;
  ref?: string;
  help: boolean;
}

export function parseGappTuiCliArgs(argv: string[]): GappTuiCliOptions {
  let cwd = process.cwd();
  let ref: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--cwd") {
      const value = argv[++index];
      if (!value) throw new Error("--cwd requires a path");
      cwd = value;
    } else if (!arg.startsWith("-") && !ref) ref = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { cwd, ref, help };
}

export function gappTuiUsage(): string {
  return [
    "gapp-tui — render a GAPP in the terminal",
    "",
    "Usage:",
    "  gapp-tui [app-id] [--cwd <project>]",
    "  gapp-tui --help",
    "",
    "The app must provide tui.mjs. The same renderer runs in Pi via /gapp tui [app-id].",
  ].join("\n");
}

function withTerminal<T>(mount: (tui: TUI, finish: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal);
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      tui.stop();
      resolve(value);
    };
    mount(tui, finish);
    tui.start();
  });
}

async function chooseGapp(cwd: string): Promise<string | null> {
  const apps = await listGappTuiApps(cwd);
  if (apps.length === 0) return null;
  return withTerminal<string | null>((tui, finish) => {
    const list = new SelectList(
      apps.map((app) => ({
        value: app.id,
        label: `${app.id} — ${app.name}`,
        description: `${app.scope} · TUI app`,
      })),
      12,
      selectTheme,
    );
    list.onSelect = (item) => finish(item.value);
    list.onCancel = () => finish(null);
    tui.addChild(new Text(standalonePalette.bold("GAPP TUI · 选择应用")));
    tui.addChild(list);
    tui.setFocus(list);
    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        finish(null);
        return { consume: true };
      }
    });
  });
}

async function mountApp(session: GappTuiAppSession): Promise<GappTuiHostAction> {
  const action = await withTerminal<GappTuiHostAction>((tui, finish) => {
    session.setPalette(standalonePalette);
    session.setRequestRender(() => tui.requestRender());
    session.setHostActionHandler(finish);
    tui.addChild(session.component);
    tui.setFocus(session.component);
    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        finish({ kind: "exit" });
        return { consume: true };
      }
    });
  });
  session.setRequestRender(() => {});
  session.setHostActionHandler(() => {});
  return action;
}

async function promptValue(title: string, initial: string): Promise<string | undefined> {
  return withTerminal<string | undefined>((tui, finish) => {
    const input = new Input();
    input.setValue(initial);
    input.onSubmit = finish;
    input.onEscape = () => finish(undefined);
    tui.addChild(new Text(standalonePalette.bold(title)));
    tui.addChild(new Text(standalonePalette.dim("Enter 提交 · Esc/Ctrl+C 取消")));
    tui.addChild(input);
    tui.setFocus(input);
    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        finish(undefined);
        return { consume: true };
      }
    });
  });
}

export async function runStandaloneGappTuiApp(options: {
  cwd: string;
  initialRef?: string;
}): Promise<void> {
  const ref = options.initialRef?.trim() || (await chooseGapp(options.cwd));
  if (!ref) return;

  const session = await createGappTuiAppSession({
    ref,
    cwd: options.cwd,
    adapter: createHostGappRuntimeAdapter(),
    palette: standalonePalette,
  });

  for (;;) {
    const action = await mountApp(session);
    if (action.kind === "exit") return;
    const value = await promptValue(action.title, action.initial);
    if (value === undefined) continue;
    try {
      await action.submit(value);
    } catch {
      // Runtime status is rendered by the app on the next mount.
    }
  }
}

async function main() {
  const options = parseGappTuiCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(gappTuiUsage());
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("gapp-tui requires an interactive terminal");
  }
  await runStandaloneGappTuiApp({ cwd: options.cwd, initialRef: options.ref });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
