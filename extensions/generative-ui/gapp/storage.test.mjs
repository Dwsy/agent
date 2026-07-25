import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const storagePath = join(import.meta.dirname, "storage.ts");
const promptPath = join(import.meta.dirname, "prompt.ts");

async function loadStorage(projectDir, globalDir) {
  process.env.GAPP_PROJECT_DIR = projectDir;
  process.env.GAPP_GLOBAL_DIR = globalDir;
  return import(pathToFileURL(storagePath).href + "?t=" + Date.now());
}

test("upsert + online list + lifecycle", async (t) => {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-global-"));
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });

  const s = await loadStorage(projectDir, globalDir);

  const bundle = await s.upsertGapp({
    id: "kanban-demo",
    name: "Kanban Demo",
    description: "temp board",
    scope: "project",
    state: { columns: { todo: ["a"], doing: [], done: [] } },
    html: "<div id=app>kanban</div><script>GappStore.set({ready:true})</script>",
  });

  assert.equal(bundle.meta.id, "kanban-demo");
  assert.equal(bundle.meta.enabled, true);
  assert.equal(bundle.meta.scope, "project");

  const metaRaw = JSON.parse(await readFile(join(projectDir, "kanban-demo", "meta.json"), "utf8"));
  const stateRaw = JSON.parse(await readFile(join(projectDir, "kanban-demo", "state.json"), "utf8"));
  assert.equal(metaRaw.name, "Kanban Demo");
  assert.deepEqual(stateRaw.columns.todo, ["a"]);

  let online = await s.listOnlineGapps();
  assert.equal(online.length, 1);
  assert.equal(online[0].id, "kanban-demo");

  await s.setGappStatus("kanban-demo", { enabled: false });
  online = await s.listOnlineGapps();
  assert.equal(online.length, 0);

  await s.setGappStatus("kanban-demo", { enabled: true });
  await s.setGappState("kanban-demo", { columns: { todo: ["b"], doing: [], done: [] } });
  const st = await s.loadGappState("project", "kanban-demo");
  assert.deepEqual(st.columns.todo, ["b"]);

  await s.setGappStatus("kanban-demo", { archived: true });
  online = await s.listOnlineGapps();
  assert.equal(online.length, 0);
  const all = await s.listGapps({ includeArchived: true, includeDisabled: true });
  assert.equal(all.find((m) => m.id === "kanban-demo")?.archived, true);

  const html = s.injectGappRuntime("<p>hi</p>", bundle.meta, { x: 1 });
  assert.match(html, /GappStore/);
  assert.match(html, /__GAPP_STATE__/);
  assert.match(html, /"x":1/);

  const full = s.injectGappRuntime(
    "<!DOCTYPE html><html><head><title>t</title></head><body><h1>x</h1><script>load()</script></body></html>",
    bundle.meta,
    { data: { board: {}, tasks: [] } },
  );
  const bridgeAt = full.indexOf('id="gapp-runtime"');
  const appScriptAt = full.indexOf("<script>load()");
  assert.ok(bridgeAt >= 0 && appScriptAt >= 0 && bridgeAt < appScriptAt, "bridge before app script");
  assert.match(full, /"board"/);
});

test("project wins over global on same id for resolve", async (t) => {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-global-"));
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });
  const s = await loadStorage(projectDir, globalDir);

  await s.upsertGapp({
    id: "shared",
    name: "Global One",
    scope: "global",
    state: { from: "global" },
    html: "<p>g</p>",
  });
  await s.upsertGapp({
    id: "shared",
    name: "Project One",
    scope: "project",
    state: { from: "project" },
    html: "<p>p</p>",
  });

  const resolved = await s.resolveGapp("shared");
  assert.equal(resolved.meta.scope, "project");
  assert.equal(resolved.state.from, "project");
});

test("resolveGappRef supports 1-based index and #n", async (t) => {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-global-"));
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });
  const s = await loadStorage(projectDir, globalDir);
  await s.upsertGapp({ id: "alpha-app", name: "Alpha", state: { n: 1 }, html: "<p>a</p>" });
  await s.upsertGapp({ id: "beta-app", name: "Beta", state: { n: 2 }, html: "<p>b</p>" });

  const byId = await s.resolveGappRef("beta-app");
  assert.equal(byId.meta.id, "beta-app");

  const first = await s.resolveGappRef("1");
  assert.equal(first.meta.id, "beta-app");
  const second = await s.resolveGappRef("#2");
  assert.equal(second.meta.id, "alpha-app");

  assert.equal(await s.resolveGappRef("99"), null);
  assert.equal(await s.resolveGappRef("1x"), null);
});

test("prompt lists online apps", async (t) => {
  const projectDir = await mkdtemp(join(tmpdir(), "gapp-project-"));
  const globalDir = await mkdtemp(join(tmpdir(), "gapp-global-"));
  t.after(async () => {
    delete process.env.GAPP_PROJECT_DIR;
    delete process.env.GAPP_GLOBAL_DIR;
    await rm(projectDir, { recursive: true, force: true });
    await rm(globalDir, { recursive: true, force: true });
  });
  const s = await loadStorage(projectDir, globalDir);
  await s.upsertGapp({
    id: "plan-x",
    name: "Plan X",
    description: "sprint",
    state: {},
    html: "<div/>",
  });
  process.env.GAPP_LANG = "zh";
  const i18nPath = join(import.meta.dirname, "i18n.ts");
  const i18n = await import(pathToFileURL(i18nPath).href + "?t=" + Date.now());
  i18n.setGappLang("zh");
  const prompt = await import(pathToFileURL(promptPath).href + "?t=" + Date.now());
  const text = await prompt.getGappPromptAppendix();
  assert.match(text, /plan-x/);
  assert.match(text, /当前在线/);
  assert.match(text, /渐进/);
  assert.match(text, /gapp_list_tools/);
  assert.match(text, /gapp_call/);
  assert.match(text, /\[GAPP event\]/);
  assert.match(text, /\[GAPP generate\]/);
  // progressive: no full tool catalogs / anti-pattern essays / HTML samples
  assert.doesNotMatch(text, /反模式/);
  assert.doesNotMatch(text, /registerTools\(\[/);

  i18n.setGappLang("en");
  const textEn = prompt.buildGappSystemPrompt([{
    id: "plan-x", name: "Plan X", description: "sprint",
    scope: "project", enabled: true, archived: false, instances: "single",
  }], {
    liveApps: [{ id: "plan-x", live: true, tools: [{ name: "secret_tool", description: "should not appear", inputSchema: {} }] }],
  });
  assert.match(textEn, /Currently online/);
  assert.match(textEn, /Progressive/);
  assert.match(textEn, /gapp_list_tools/);
  assert.doesNotMatch(textEn, /secret_tool/);
  assert.doesNotMatch(textEn, /Anti-patterns/);
  i18n.setGappLang(null);
  delete process.env.GAPP_LANG;
});
