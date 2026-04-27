/**
 * 简单测试边框显示
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";

class SimpleBorderTest implements Component {
  render(width: number): string[] {
    const tl = "╭", tr = "╮", bl = "╰", br = "╯";
    const h = "─", v = "│";
    const inner = Math.max(0, width - 2);
    
    return [
      tl + h.repeat(inner) + tr,
      v + " ".repeat(inner) + v,
      v + " Hello World ".padEnd(inner) + v,
      v + " ".repeat(inner) + v,
      bl + h.repeat(inner) + br,
    ];
  }
  
  invalidate(): void {}
}

export default function testExtension(pi: ExtensionAPI): void {
  pi.registerCommand("test-border", {
    description: "Test border rendering",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>(
        (tui, _theme, _kb, done): Component & { wantsKeyRelease?: boolean } => {
          const test = new SimpleBorderTest();
          
          return {
            render: (w) => test.render(w),
            handleInput: (d) => {
              if (d === "q" || d === "\x1b") done();
            },
            invalidate: () => {},
            wantsKeyRelease: false,
          };
        },
        {
          overlay: true,
          width: 60,
          maxHeight: 10,
          anchor: "center",
        }
      );
    },
  });
}
