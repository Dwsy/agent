// ── Generative UI Extension ───────────────────────────────────────────────
// Composed from: storage.ts, html-helpers.ts, gallery.ts, commands.ts
// Agent-facing render surface: visual-cli.ts + skills/generative-ui (no tools registered).
// GAPP: gapp/ (storage, open, tools, commands, prompt)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preloadGlimpseui } from "./html-helpers.js";
import { getGlimpseuiSource } from "./resolve-glimpseui.js";
import { registerWidgetsCommand } from "./commands.js";
import { registerGapp } from "./gapp/index.js";

const GENERATIVE_UI_DIR = dirname(fileURLToPath(import.meta.url));
const GENERATIVE_UI_SKILL_DIR = join(GENERATIVE_UI_DIR, "skills", "generative-ui");

export default async function (pi: ExtensionAPI) {
  // Headless generate subagents must not re-register this extension:
  // no windows, no gapp host, no skill resources inside worker processes.
  if (process.env.GAPP_SUBAGENT === "1") return;

  // Prefer local/global glimpseui (Dock + control socket fork) over nested registry copy.
  try {
    await preloadGlimpseui();
    const src = getGlimpseuiSource();
    if (src) {
      // Quiet by default; set GLIMPSEUI_DEBUG=1 to surface path
      if (process.env.GLIMPSEUI_DEBUG === "1") {
        console.error(`[generative-ui] using glimpseui: ${src}`);
      }
    }
  } catch (err) {
    console.error(
      `[generative-ui] failed to load glimpseui (${err instanceof Error ? err.message : err}). ` +
        `Install with: npm i -g ~/Dev/AI/glimpse   or set GLIMPSEUI_PATH`,
    );
    throw err;
  }

  // ── Shared state ──────────────────────────────────────────────────────

  const activeWindows: any[] = [];

  // ── Register commands & gapp ──────────────────────────────────────────

  registerWidgetsCommand(pi, activeWindows);
  registerGapp(pi, { activeWindows });

  // ── Skills: generative-ui carries the visual-cli calling system ───────

  pi.on("resources_discover", async () => {
    return { skillPaths: [GENERATIVE_UI_SKILL_DIR] };
  });

  // ── Cleanup on shutdown ───────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    for (const win of activeWindows) {
      try { win.close(); } catch {}
    }
    activeWindows.length = 0;
  });
}
