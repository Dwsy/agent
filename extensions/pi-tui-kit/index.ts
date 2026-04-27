/**
 * pi-tui-kit Extension Entry Point
 * 标准 Pi 扩展格式
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { SimpleDemo } from "./examples/demo-simple.js";

export default function piTuiKitExtension(pi: ExtensionAPI): void {
  // Demo command - shows all components
  pi.registerCommand("tui-kit-demo", {
    description: "Show pi-tui-kit full component demo",
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("This demo requires interactive mode", "warning");
        return;
      }

      await ctx.ui.custom<void>(
        (tui, _theme, _kb, done): Component & { wantsKeyRelease?: boolean } => {
          const demo = new SimpleDemo(tui, () => done(undefined));
          demo.focused = true;
          
          return {
            render: (w) => demo.render(w),
            handleInput: (d) => demo.handleInput(d),
            invalidate: () => demo.invalidate(),
            wantsKeyRelease: false,
          };
        },
        {
          overlay: true,
          width: 100,
          maxHeight: "90%",
          anchor: "center",
        }
      );
    },
  });

  // Quick showcase command
  pi.registerCommand("tui-kit", {
    description: "pi-tui-kit quick commands: demo, info",
    handler: async (args: string, ctx: ExtensionContext) => {
      const cmd = args.trim();

      if (cmd === "" || cmd === "demo") {
        // Run demo
        if (!ctx.hasUI) {
          ctx.ui.notify("Demo requires interactive mode", "warning");
          return;
        }

        await ctx.ui.custom<void>(
          (tui, _theme, _kb, done): Component & { wantsKeyRelease?: boolean } => {
            const demo = new SimpleDemo(tui, () => done(undefined));
            demo.focused = true;
            
            return {
              render: (w) => demo.render(w),
              handleInput: (d) => demo.handleInput(d),
              invalidate: () => demo.invalidate(),
              wantsKeyRelease: false,
            };
          },
          {
            overlay: true,
            width: 100,
            maxHeight: "90%",
            anchor: "center",
          }
        );
        return;
      }

      if (cmd === "info" || cmd === "help") {
        ctx.ui.notify(
          "pi-tui-kit: 20+ ANSI-safe TUI components. Try: /tui-kit-demo", 
          "info"
        );
        return;
      }

      ctx.ui.notify(`Unknown command: ${cmd}. Try: demo, info`, "warning");
    },
  });
}
