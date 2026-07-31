import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = import.meta.dirname;
const load = (name) => import(pathToFileURL(join(root, name)).href + `?t=${Date.now()}-${Math.random()}`);

async function withTempStores(t) {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-tui-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-tui-global-"));
  process.env.GAPP_PROJECT_DIR = projectDir;
  process.env.GAPP_GLOBAL_DIR = globalDir;
  process.env.GAPP_HOST_BASE = "http://127.0.0.1:1";
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    delete process.env.GAPP_HOST_BASE;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });
  return { projectDir, globalDir };
}

test("TUI text helpers are width-safe", async () => {
  const tui = await load("tui.ts");
  assert.equal(tui.padGappTuiText("abc", 5), "abc  ");
  assert.equal(tui.padGappTuiText("abcdef", 4), "a...");
  assert.equal(tui.matchesGappTuiKey("\u001b[A", "up"), true);
});

test("app session loads tui.mjs, prompts, persists stateOps, and exits", async (t) => {
  await withTempStores(t);
  const storage = await load("storage.ts");
  const bundle = await storage.upsertGapp({
    id: "renderer-test",
    name: "Renderer Test",
    scope: "project",
    state: { items: [] },
    html: "<main>optional browser renderer</main>",
  });
  await writeFile(
    join(bundle.dir, "tools.json"),
    JSON.stringify({
      v: "0.1",
      tools: [
        {
          name: "add_item",
          description: "Add an item",
          inputSchema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
          },
          stateOps: [
            {
              op: "push",
              path: "items",
              value: { id: "$uuid", title: "$args.title" },
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    join(bundle.dir, "tui.mjs"),
    `export default function(runtime) {
      let selected = 0;
      return {
        invalidate() {},
        render(width) {
          const items = runtime.getState().items;
          return [runtime.pad('Renderer Test', width), 'selected:' + selected, ...items.map(i => i.title), runtime.getStatus()];
        },
        handleInput(data) {
          if (runtime.key(data, 'down')) selected += 1;
          if (data === 'a') runtime.prompt({ title: 'Item title', submit: value => runtime.call('add_item', { title: value }) });
          if (data === 'q') runtime.close();
        }
      };
    }`,
  );

  const tui = await load("tui.ts");
  const session = await tui.createGappTuiAppSession({
    ref: "renderer-test",
    cwd: process.cwd(),
  });
  let renders = 0;
  const actions = [];
  session.setRequestRender(() => renders++);
  session.setHostActionHandler((action) => actions.push(action));

  assert.match(session.component.render(40).join("\n"), /Renderer Test/);
  session.component.handleInput("\u001b[B");
  assert.ok(renders > 0, "navigation should request a render");
  assert.match(session.component.render(40).join("\n"), /selected:1/);

  session.component.handleInput("a");
  assert.equal(actions[0].kind, "prompt");
  assert.equal(actions[0].title, "Item title");
  await actions[0].submit("Milk");
  assert.match(session.component.render(40).join("\n"), /Milk/);

  const state = JSON.parse(await readFile(join(bundle.dir, "state.json"), "utf8"));
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].title, "Milk");

  session.component.handleInput("q");
  assert.equal(actions.at(-1).kind, "exit");
});

test("tools.mjs executes declared tools, persists state, and is injected into WebView", async (t) => {
  await withTempStores(t);
  const storage = await load("storage.ts");
  const bundle = await storage.upsertGapp({
    id: "module-tools-test",
    name: "Module Tools Test",
    scope: "project",
    state: { items: [] },
    html: "<main>module tools</main>",
  });
  await writeFile(
    join(bundle.dir, "tools.json"),
    JSON.stringify({
      v: "0.2",
      module: "tools.mjs",
      tools: [
        {
          name: "add_item",
          description: "Add an item through the shared module",
          inputSchema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
          },
        },
      ],
    }),
  );
  await writeFile(
    join(bundle.dir, "tools.mjs"),
    `export const gappToolHandlers = {
      add_item({ state, arguments: args, context }) {
        const item = { id: context.uuid(), title: String(args.title), createdAt: context.now() };
        return { state: { ...state, items: [...(state.items || []), item] }, result: item };
      }
    };`,
  );

  const service = await load("service.ts");
  const result = await service.invokeGappTool(
    { ref: "module-tools-test", tool: "add_item", arguments: { title: "Shared" } },
    { cwd: process.cwd() },
  );
  assert.equal(result.via, "module");
  assert.equal(result.result.title, "Shared");

  const state = JSON.parse(await readFile(join(bundle.dir, "state.json"), "utf8"));
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].title, "Shared");

  const moduleUrl = pathToFileURL(join(bundle.dir, "tools.mjs")).href;
  const injected = storage.injectGappRuntime(bundle.html, bundle.meta, state, { toolsModuleUrl: moduleUrl });
  assert.match(injected, /__GAPP_TOOLS_MODULE_URL__/);
  assert.ok(injected.includes(JSON.stringify(moduleUrl)));
});

test("TUI picker only lists apps that provide tui.mjs", async (t) => {
  await withTempStores(t);
  const storage = await load("storage.ts");
  const browserOnly = await storage.upsertGapp({
    id: "browser-only",
    name: "Browser Only",
    scope: "project",
    state: {},
    html: "<main>browser</main>",
  });
  const terminalApp = await storage.upsertGapp({
    id: "terminal-app",
    name: "Terminal App",
    scope: "project",
    state: {},
    html: "<main>optional</main>",
  });
  await writeFile(
    join(terminalApp.dir, "tui.mjs"),
    "export default () => ({ invalidate(){}, render(){ return ['terminal']; } });",
  );
  assert.ok(browserOnly.dir);

  const tui = await load("tui.ts");
  const apps = await tui.listGappTuiApps(process.cwd());
  assert.deepEqual(apps.map((app) => app.id), ["terminal-app"]);
});

test("demo kanban module renders wide and narrow application layouts", async () => {
  const factoryModule = await import(
    pathToFileURL("/Users/dengwenyu/.pi/agent/.pi/gapp/demo-kanban/tui.mjs").href + `?t=${Date.now()}`
  );
  const state = {
    boardTitle: "TUI Board",
    cards: [
      { id: "1", title: "Backlog card", status: "backlog", priority: "high", assignee: "Ada" },
      { id: "2", title: "Doing card", status: "in_progress", priority: "medium", assignee: "Lin" },
      { id: "3", title: "Done card", status: "done", priority: "low", assignee: "Kai" },
    ],
  };
  const identity = (text) => text;
  const runtime = {
    app: { id: "demo-kanban", name: "Demo Kanban", description: "", scope: "project" },
    palette: {
      accent: identity, dim: identity, muted: identity, warning: identity,
      success: identity, error: identity, text: identity, border: identity, bold: identity,
    },
    getState: () => state,
    getStatus: () => "",
    isBusy: () => false,
    call: async () => {},
    prompt() {}, close() {}, refresh: async () => state,
    key: () => false,
    truncate: (text, width) => String(text).slice(0, width),
    pad: (text, width) => String(text).slice(0, width).padEnd(width),
  };
  const component = factoryModule.default(runtime);
  const wide = component.render(120).join("\n");
  assert.match(wide, /待办/);
  assert.match(wide, /进行中/);
  assert.match(wide, /已完成/);
  const narrow = component.render(70).join("\n");
  assert.match(narrow, /窄屏模式/);
});

test("demo kanban exposes one shared tool implementation and typed client", async () => {
  const module = await import(
    pathToFileURL("/Users/dengwenyu/.pi/agent/.pi/gapp/demo-kanban/tools.mjs").href + `?t=${Date.now()}`
  );
  const context = {
    app: { name: "Shared Board" },
    now: () => "2026-07-30T00:00:00.000Z",
    uuid: () => "card-shared",
  };
  const added = await module.executeKanbanTool(
    "add_card",
    { boardTitle: "Shared Board", cards: [] },
    { title: "One implementation", assignee: "Ada", priority: "high" },
    context,
  );
  assert.equal(added.state.cards[0].id, "card-shared");
  assert.equal(added.state.cards[0].priority, "high");

  const calls = [];
  const tools = module.createKanbanTools(async (name, args) => {
    calls.push({ name, args });
    return { name, args };
  });
  await tools.moveCard("card-shared", "done");
  assert.deepEqual(calls, [
    { name: "move_card", args: { cardId: "card-shared", status: "done" } },
  ]);
});

test("standalone CLI describes direct app rendering", async () => {
  const cli = await load("cli.ts");
  assert.deepEqual(cli.parseGappTuiCliArgs(["todo", "--cwd", "/tmp/project"]), {
    cwd: "/tmp/project",
    ref: "todo",
    help: false,
  });
  assert.equal(cli.parseGappTuiCliArgs(["--help"]).help, true);
  assert.match(cli.gappTuiUsage(), /render a GAPP in the terminal/);
  assert.match(cli.gappTuiUsage(), /tui\.mjs/);
});
