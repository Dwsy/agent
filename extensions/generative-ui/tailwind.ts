// ── Build-time Tailwind CSS for canvas TSX ────────────────────────────────
// Candidates are scanned from the raw TSX source and only the utilities in use
// are emitted as static CSS. No runtime JIT and no CDN: canvases stay offline
// and the generated stylesheet needs no extra CSP allowance.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = dirname(fileURLToPath(import.meta.url));

// Preflight is excluded on purpose: the canvas shell already owns the page
// baseline and the host light/dark theme.
const TAILWIND_INPUT = `@layer theme, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);`;

/** Compile the Tailwind utilities used by one canvas TSX source into static CSS. */
export async function compileTailwindCss(tsx: string): Promise<string> {
  try {
    // Loaded on demand so extension startup does not pay for Tailwind's native scanner.
    const [{ Scanner }, { compile }] = await Promise.all([
      import("@tailwindcss/oxide"),
      import("@tailwindcss/node"),
    ]);
    const candidates = new Scanner({ sources: [] }).scanFiles([
      { content: tsx, extension: "tsx" },
    ]);
    const compiler = await compile(TAILWIND_INPUT, {
      base: BASE,
      onDependency: () => {},
    });
    return compiler.build(candidates);
  } catch (err) {
    throw new Error("Tailwind CSS compile failed: " + (err instanceof Error ? err.message : String(err)));
  }
}
