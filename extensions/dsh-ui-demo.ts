import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "dsh-ui-demo";
const ABOVE_KEY = "dsh-ui-demo-above";
const BELOW_KEY = "dsh-ui-demo-below";

function staticComponent(lines: string[]) {
  return {
    render(): string[] {
      // Do not slice ANSI-styled strings by JS code-unit length. The bridge strips
      // terminal styling before rendering in Web, and slicing escape sequences can
      // leave only a single visible character in narrow header slots.
      return lines;
    },
    invalidate() {},
  };
}

export default function (pi: ExtensionAPI) {
  let enabled = false;

  const clear = (ctx: any) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(ABOVE_KEY, undefined);
    ctx.ui.setWidget(BELOW_KEY, undefined);
    ctx.ui.setHeader(undefined);
    enabled = false;
  };

  pi.registerCommand("dsh-ui-demo", {
    description: "Toggle a DSH Web demo for Pi status, header, and widgets",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("DSH Pi UI bridge is not interactive in this session", "error");
        return;
      }

      if (enabled) {
        clear(ctx);
        ctx.ui.notify("DSH Pi UI demo cleared", "info");
        return;
      }

      enabled = true;
      ctx.ui.setStatus(STATUS_KEY, "ready · status bridge OK");
      ctx.ui.setWidget(ABOVE_KEY, [
        "[Pi widget · above editor]",
        "If you can read this, setWidget(..., { placement: 'aboveEditor' }) works in DSH Web.",
      ], { placement: "aboveEditor" });
      ctx.ui.setWidget(BELOW_KEY, [
        "[Pi widget · below editor] setWidget(..., { placement: 'belowEditor' }) works.",
      ], { placement: "belowEditor" });
      ctx.ui.setHeader((_tui: unknown, theme: any) => staticComponent([
        theme.fg("accent", "Pi UI demo · header bridge OK"),
      ]));
      ctx.ui.notify("DSH Pi UI demo enabled. Run /dsh-ui-dialog to test custom TUI input.", "info");
    },
  });

  pi.registerCommand("dsh-ui-dialog", {
    description: "Open an interactive Pi custom TUI overlay in DSH Web",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("DSH Pi UI bridge is not interactive in this session", "error");
        return;
      }

      const result = await ctx.ui.custom((_tui, theme, _keybindings, done) => ({
        render(width: number): string[] {
          const safe = Math.max(24, Math.floor(width));
          const text = [
            theme.fg("accent", "DSH ↔ Pi custom TUI demo"),
            "",
            "This component is rendered by Pi on the Host and displayed by the DSH Web client.",
            "Press Enter to succeed, or q / Esc to close.",
          ];
          return text.map((line) => line.length <= safe ? line : line.slice(0, safe));
        },
        handleInput(data: string) {
          if (data === "\r") done("enter");
          if (data === "q" || data === "\u001b") done("closed");
        },
        invalidate() {},
      }), {
        overlay: true,
        overlayOptions: { anchor: "center", width: 72, maxHeight: 12, margin: 2 },
      });

      ctx.ui.notify(`Custom TUI round-trip OK (${String(result ?? "closed")})`, "info");
    },
  });

  pi.registerCommand("dsh-ui-clear", {
    description: "Clear all persistent DSH Pi UI demo surfaces",
    handler: async (_args, ctx) => {
      clear(ctx);
      ctx.ui.notify("DSH Pi UI demo cleared", "info");
    },
  });
}
