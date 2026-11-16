import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = import.meta.dirname;
const agentRoot = join(root, "../../..");
const load = (name) => import(pathToFileURL(join(root, name)).href + `?t=${Date.now()}-${Math.random()}`);

function kanbanRuntime(state, calls = []) {
  const identity = (text) => text;
  return {
    app: { id: "demo-kanban", name: "Demo Kanban", description: "", scope: "project" },
    palette: {
      accent: identity, dim: identity, muted: identity, warning: identity,
      success: identity, error: identity, text: identity, border: identity, bold: identity,
    },
    getState: () => state,
    getStatus: () => "",
    isBusy: () => false,
    call: async (name, args) => { calls.push({ name, args }); },
    prompt() {}, close() {}, refresh: async () => state,
    key: () => false,
    truncate: (text, width) => String(text).slice(0, width),
    pad: (text, width) => String(text).slice(0, width).padEnd(width),
  };
}

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

test("app session forwards mouse events and honors dispatcher render semantics", async (t) => {
  await withTempStores(t);
  const storage = await load("storage.ts");
  const bundle = await storage.upsertGapp({
    id: "mouse-app", name: "Mouse App", scope: "project", state: {}, html: "<main>mouse</main>",
  });
  await writeFile(
    join(bundle.dir, "tui.mjs"),
    `export default function(runtime) {
      let last = 'none';
      let invalidations = 0;
      return {
        invalidate() { invalidations++; },
        render(width) {
          return [runtime.pad('mouse ' + last, width), runtime.getStatus(), 'invalidations:' + invalidations];
        },
        handleMouse(event) {
          last = event.x + ':' + event.y;
          if (event.type === 'wheel') return { handled: true, render: true };
          if (event.type === 'move') return { handled: true, render: false };
          if (event.type === 'click') return { handled: true, focus: true };
          if (event.type === 'drag') throw new Error('boom');
          return undefined;
        }
      };
    }`,
  );

  const tui = await load("tui.ts");
  const session = await tui.createGappTuiAppSession({ ref: "mouse-app", cwd: process.cwd() });
  let renders = 0;
  session.setRequestRender(() => renders++);
  const base = {
    button: "none", x: 2, y: 1, screenX: 2, screenY: 1,
    width: 40, height: 10, shift: false, alt: false, ctrl: false,
  };

  assert.deepEqual(
    session.component.handleMouse({ ...base, type: "wheel", wheelDelta: -1 }),
    { handled: true, render: true },
  );
  assert.equal(renders, 1);
  // Coordinates reach the app unchanged: the host adds no header or border rows.
  assert.match(session.component.render(40).join("\n"), /mouse 2:1/);
  assert.match(session.component.render(40).join("\n"), /invalidations:1/);

  assert.deepEqual(
    session.component.handleMouse({ ...base, type: "move" }),
    { handled: true, render: false },
  );
  assert.equal(renders, 1, "render:false must not repaint a hover-like move");
  assert.match(session.component.render(40).join("\n"), /invalidations:1/);

  assert.deepEqual(
    session.component.handleMouse({ ...base, type: "click", button: "left" }),
    { handled: true, focus: true },
  );
  assert.equal(renders, 2, "click defaults to render:true");
  assert.equal(session.component.handleMouse({ ...base, type: "release", button: "left" }), undefined);
  assert.equal(renders, 2, "unhandled results must not repaint");

  assert.equal(session.component.handleMouse({ ...base, type: "drag", button: "left" }), undefined);
  assert.equal(renders, 3);
  assert.match(session.component.render(40).join("\n"), /mouse error: boom/);

  const plainBundle = await storage.upsertGapp({
    id: "mouse-less", name: "Mouse Less", scope: "project", state: {}, html: "<main>plain</main>",
  });
  await writeFile(
    join(plainBundle.dir, "tui.mjs"),
    "export default () => ({ invalidate(){}, render(){ return ['plain']; } });",
  );
  const plain = await tui.createGappTuiAppSession({ ref: "mouse-less", cwd: process.cwd() });
  let plainRenders = 0;
  plain.setRequestRender(() => plainRenders++);
  assert.equal(plain.component.handleMouse({ ...base, type: "click", button: "left" }), undefined);
  assert.equal(plainRenders, 0, "apps without handleMouse leave the event to the renderer");
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
    pathToFileURL(join(agentRoot, ".pi/gapp/demo-kanban/tui.mjs")).href + `?t=${Date.now()}`
  );
  const state = {
    boardTitle: "TUI Board",
    cards: [
      { id: "1", title: "Backlog card", status: "backlog", priority: "high", assignee: "Ada" },
      { id: "2", title: "Doing card", status: "in_progress", priority: "medium", assignee: "Lin" },
      { id: "3", title: "Done card", status: "done", priority: "low", assignee: "Kai" },
    ],
  };
  const component = factoryModule.default(kanbanRuntime(state));
  const wide = component.render(120).join("\n");
  assert.match(wide, /待办/);
  assert.match(wide, /进行中/);
  assert.match(wide, /已完成/);
  const narrow = component.render(70).join("\n");
  assert.match(narrow, /窄屏模式/);
});

test("demo kanban exposes one shared tool implementation and typed client", async () => {
  const module = await import(
    pathToFileURL(join(agentRoot, ".pi/gapp/demo-kanban/tools.mjs")).href + `?t=${Date.now()}`
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

test("demo kanban mouse events use render-time row and column geometry", async () => {
  const factoryModule = await import(
    pathToFileURL(join(agentRoot, ".pi/gapp/demo-kanban/tui.mjs")).href + `?t=${Date.now()}`
  );
  const state = {
    boardTitle: "TUI Board",
    cards: [
      { id: "1", title: "Backlog card", status: "backlog", priority: "high", assignee: "Ada" },
      { id: "2", title: "Doing card", status: "in_progress", priority: "medium", assignee: "Lin" },
      { id: "3", title: "Done card", status: "done", priority: "low", assignee: "Kai" },
    ],
  };
  const calls = [];
  const component = factoryModule.default(kanbanRuntime(state, calls));
  const lines = component.render(120);
  const event = (type, x, y, extra = {}) => ({
    type, button: "left", x, y, screenX: x, screenY: y,
    width: 120, height: lines.length, shift: false, alt: false, ctrl: false, ...extra,
  });

  // Wide layout: columnWidth 38 + gap 3 -> [0..37] [41..78] [82..119].
  assert.deepEqual(
    component.handleMouse(event("wheel", 50, 4, { button: "none", wheelDelta: 1 })),
    { handled: true, render: true },
  );
  assert.match(component.render(120).join("\n"), /▸ 进行中/);
  assert.deepEqual(
    component.handleMouse(event("wheel", 50, 4, { button: "none", wheelDelta: 1 })),
    { handled: true, render: false },
    "a wheel at the last card does not repaint",
  );
  assert.equal(component.handleMouse(event("wheel", 39, 4, { button: "none", wheelDelta: 1 })), undefined);
  assert.equal(component.handleMouse(event("press", 50, 4, { button: "right" })), undefined);
  assert.equal(component.handleMouse(event("move", 50, 4, { button: "none" })), undefined);

  // Header y=2 switches column; card y=4 press+click runs the Enter action.
  assert.deepEqual(component.handleMouse(event("press", 5, 2)), { handled: true, focus: true, render: true });
  assert.deepEqual(component.handleMouse(event("click", 5, 2)), { handled: true, render: true });
  assert.deepEqual(calls, []);
  assert.deepEqual(component.handleMouse(event("press", 5, 4)), { handled: true, focus: true, capture: true, render: true });
  assert.deepEqual(component.handleMouse(event("click", 5, 4)), { handled: true, render: true });
  assert.deepEqual(calls, [{ name: "move_card", args: { cardId: "1", status: "in_progress" } }]);
  assert.equal(component.handleMouse(event("click", 39, 4)), undefined, "gap column is not clickable");
  // A click after a motion event still acts on the pressed card, like SelectList.
  const before = calls.length;
  assert.deepEqual(component.handleMouse(event("press", 5, 4)), { handled: true, focus: true, capture: true, render: true });
  assert.equal(component.handleMouse(event("move", 5, 2, { button: "none" })), undefined);
  assert.deepEqual(component.handleMouse(event("click", 5, 2)), { handled: true, render: true });
  assert.equal(calls.length, before + 1, "click uses the press target, not the row under the pointer");

  // Narrow layout: title, separator and mode hint precede the single column.
  const narrow = factoryModule.default(kanbanRuntime(state));
  const narrowLines = narrow.render(70);
  const narrowEvent = (type, y) => ({
    type, button: "left", x: 5, y, screenX: 5, screenY: y,
    width: 70, height: narrowLines.length, shift: false, alt: false, ctrl: false,
  });
  assert.equal(narrow.handleMouse(narrowEvent("press", 2)), undefined, "mode hint row is not clickable");
  assert.deepEqual(narrow.handleMouse(narrowEvent("press", 3)), { handled: true, focus: true, render: true });
});

test("demo kanban drags cards between wide-layout columns", async () => {
  const factoryModule = await import(
    pathToFileURL(join(agentRoot, ".pi/gapp/demo-kanban/tui.mjs")).href + `?t=${Date.now()}`
  );
  const state = {
    boardTitle: "Drag Board",
    cards: [
      { id: "1", title: "Backlog card", status: "backlog", priority: "high", assignee: "Ada" },
      { id: "2", title: "Doing card", status: "in_progress", priority: "medium", assignee: "Lin" },
      { id: "3", title: "Done card", status: "done", priority: "low", assignee: "Kai" },
    ],
  };
  let current = state;
  const calls = [];
  const runtime = kanbanRuntime(current, calls);
  runtime.getState = () => current;
  runtime.call = async (name, args) => {
    calls.push({ name, args });
    if (name === "move_card") {
      current = {
        ...current,
        cards: current.cards.map((card) =>
          card.id === args.cardId ? { ...card, status: args.status } : card,
        ),
      };
    }
  };
  const component = factoryModule.default(runtime);
  const lines = component.render(120);
  const event = (type, x, y, extra = {}) => ({
    type, button: "left", x, y, screenX: x, screenY: y,
    width: 120, height: lines.length, shift: false, alt: false, ctrl: false, ...extra,
  });

  assert.deepEqual(
    component.handleMouse(event("press", 5, 4)),
    { handled: true, focus: true, capture: true, render: true },
  );
  assert.equal(component.handleMouse(event("move", 50, 4, { button: "none" })), undefined);
  assert.deepEqual(component.handleMouse(event("drag", 50, 4)), { handled: true, render: true });
  assert.match(component.render(120).join("\n"), /⇢ 进行中/);
  assert.deepEqual(component.handleMouse(event("drag", 55, 4)), { handled: true, render: false });
  assert.deepEqual(component.handleMouse(event("drag", 90, 4)), { handled: true, render: true });
  assert.match(component.render(120).join("\n"), /⇢ 已完成/);
  assert.deepEqual(
    component.handleMouse(event("release", 39, 4)),
    { handled: true, render: true },
    "a release in a column gap keeps the last valid drop target",
  );
  assert.deepEqual(calls, [{ name: "move_card", args: { cardId: "1", status: "done" } }]);
  assert.doesNotMatch(component.render(120).join("\n"), /⇢/);

  const sameCalls = [];
  const same = factoryModule.default(kanbanRuntime(state, sameCalls));
  same.render(120);
  assert.deepEqual(
    same.handleMouse(event("press", 50, 4)),
    { handled: true, focus: true, capture: true, render: true },
  );
  assert.deepEqual(same.handleMouse(event("drag", 60, 4)), { handled: true, render: false });
  assert.deepEqual(same.handleMouse(event("release", 60, 4)), { handled: true, render: true });
  assert.deepEqual(sameCalls, [], "a drop in the source column is a no-op");
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
