import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const THEMES_DIR = join(homedir(), ".pi/agent/themes");
const PREVIEW_FILE = join(THEMES_DIR, "_preview.json");

export default function (pi: ExtensionAPI) {
  let wss: any = null;
  let httpSrv: any = null;
  let clients: Set<any> = new Set();
  let WebSocketRef: any = null;
  let originalThemeName: string = "";

  async function loadThemes() {
    const files = await readdir(THEMES_DIR);
    const themes = [];
    for (const f of files) {
      if (f.endsWith(".json") && !f.startsWith("_")) {
        const content = await readFile(join(THEMES_DIR, f), "utf-8");
        themes.push(JSON.parse(content));
      }
    }
    return themes;
  }

  async function startHttp(wsPort: number) {
    const http = await import("node:http");
    const editorPath = join(__dirname, "editor.html");
    const template = await readFile(editorPath, "utf-8");
    httpSrv = http.createServer(async (req, res) => {
      if (req.url === "/" || req.url === "/index.html") {
        const html = template.replace("__WS_PORT__", String(wsPort));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    return new Promise<number>((resolve) => {
      httpSrv.listen(0, () => resolve(httpSrv.address().port));
    });
  }

  async function startWs(): Promise<number> {
    const ws = await import("ws");
    WebSocketRef = ws.WebSocket;
    wss = new ws.WebSocketServer({ port: 0 });

    const wsPort = await new Promise<number>((resolve) => {
      wss.on("listening", () => resolve(wss.address().port));
    });

    wss.on("connection", async (client: any) => {
      clients.add(client);

      const themes = await loadThemes();
      client.send(JSON.stringify({
        type: "themes",
        data: themes.map((t: any) => ({
          name: t.name,
          variant: t.piDesktop?.variant || "dark",
          colors: {
            accent: t.vars?.accent || t.colors?.accent || "#888",
            surface: t.vars?.surface || "#000",
            text: t.vars?.text || "#fff",
            success: t.vars?.success || "#888",
            error: t.vars?.error || "#888",
          }
        }))
      }));

      client.on("message", async (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === "preview") {
            const themeName = msg.name;
            const themePath = join(THEMES_DIR, `${themeName}.json`);

            try {
              const content = await readFile(themePath, "utf-8");
              const themeJson = JSON.parse(content);

              // Save original theme name (first preview only)
              if (!originalThemeName) {
                originalThemeName = themeName;
              }

              // Write to preview file (this triggers watcher)
              themeJson.name = "_preview";
              await writeFile(PREVIEW_FILE, JSON.stringify(themeJson, null, 2), "utf-8");

              // First time: initTheme with watcher enabled
              // After that, the watcher handles refresh automatically
              initTheme("_preview", true);

              clients.forEach(c => {
                if (c.readyState === WebSocketRef.OPEN) {
                  c.send(JSON.stringify({ type: "previewing", name: themeName }));
                }
              });
            } catch (e) {
              client.send(JSON.stringify({ type: "error", message: String(e) }));
            }
          }

          if (msg.type === "restore") {
            if (originalThemeName) {
              const originalPath = join(THEMES_DIR, `${originalThemeName}.json`);
              try {
                const content = await readFile(originalPath, "utf-8");
                const themeJson = JSON.parse(content);
                themeJson.name = "_preview";
                await writeFile(PREVIEW_FILE, JSON.stringify(themeJson, null, 2), "utf-8");
                // Watcher will detect the change and refresh TUI
                clients.forEach(c => {
                  if (c.readyState === WebSocketRef.OPEN) {
                    c.send(JSON.stringify({ type: "restored", name: originalThemeName }));
                  }
                });
              } catch (e) {
                client.send(JSON.stringify({ type: "error", message: String(e) }));
              }
            }
          }
        } catch {}
      });

      client.on("close", () => clients.delete(client));
    });

    return wsPort;
  }

  function stopAll() {
    clients.clear();
    wss?.close();
    httpSrv?.close();
    wss = null;
    httpSrv = null;
  }

  pi.registerCommand("tstudio", {
    description: "Theme Studio - preview themes in TUI",
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();

      if (sub === "stop") {
        stopAll();
        ctx.ui.notify("Theme Studio stopped", "info");
        return;
      }

      if (!httpSrv) {
        const wsPort = await startWs();
        const httpPort = await startHttp(wsPort);

        try {
          const { exec } = await import("node:child_process");
          const { promisify } = await import("node:util");
          await promisify(exec)(`open http://localhost:${httpPort}`);
        } catch {}

        ctx.ui.notify(`Theme Studio: http://localhost:${httpPort}`, "success");
      }
    },
  });

  pi.on("shutdown", () => stopAll());
}
