#!/usr/bin/env bun
/**
 * Visual CLI — the agent-facing bun script surface for generative-ui renders.
 *
 * Replaces the former registered `visualize_read_me` / `show_widget` /
 * `show_canvas` / `browse_widgets` tools: instead of four tool schemas bloating
 * every session's system prompt, the agent runs this script via bash and learns
 * the whole calling system from the visual skill.
 *
 * Plan linkage: `route` persists the plan state to <widgets>/last-plan.json; the
 * next widget/canvas render whose target matches is enforced against it
 * (render-policy.ts) and consumes it. Every render requires a grounding
 * declaration.
 *
 * Window lifecycle: a short-lived CLI cannot own windows (they die with the
 * process), so every window lives in a detached `__hold` child process that
 * outlives this CLI. Interactive renders settle via a result file that __hold
 * writes on the first settling message (or on close/error).
 *
 * Output contract: one JSON document on stdout (`{ ok: true, ... }` or
 * `{ ok: false, error: { message } }`), errors exit 1.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canvasDocumentHTML, transpileCanvas, validateCanvasCode } from "./canvas.js";
import { groundingFooterHTML, validateGroundingDeclaration } from "./grounding.js";
import { openWindow, preloadGlimpseui, timestamp, wrapHTML } from "./html-helpers.js";
import { planVisualGuidance } from "./visual-plan.js";
import { enforceGroundingForPlan, type VisualPlanState } from "./render-policy.js";
import {
  appendWidgetEvent,
  loadActiveWidgetIndex,
  loadWidgetHtml,
  loadWidgetIndex,
  saveWidget,
  widgetsDir,
  type WidgetRecord,
} from "./storage.js";
import { validateWidgetCode } from "./widget-validation.js";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

interface HoldResult {
  messageData: unknown;
  event: unknown;
  closedReason: string;
}

interface OpenOptions {
  floating: boolean;
  interactive: boolean;
  noOpen: boolean;
}

interface RenderOptions extends OpenOptions {
  title: string;
  grounding: unknown;
  width?: number;
  height?: number;
}

interface PersistedPlan extends VisualPlanState {
  modules: string[];
  templates: string[];
}

const VALUE_FLAGS = new Set([
  "modules", "templates", "title", "html", "html-file", "tsx", "tsx-file",
  "grounding", "grounding-file", "width", "height", "limit",
  "widget-file", "result-file",
]);

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${name} requires a value`);
      flags[name] = value;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

function ok(payload: Record<string, unknown>): CliResult {
  return { code: 0, stdout: JSON.stringify({ ok: true, ...payload }, null, 2), stderr: "" };
}

function fail(message: string): CliResult {
  return {
    code: 1,
    stdout: JSON.stringify({ ok: false, error: { message } }, null, 2),
    stderr: "",
  };
}

function usage(): string {
  return [
    "visual-cli — visual routing, renders, and widget browsing",
    "",
    "Usage: bun visual-cli.ts <command> [args] [flags]",
    "",
    "  route '<request>' [--modules a,b] [--templates t1,t2] [--expand]",
    "                                   route the visual goal; persists plan state to",
    "                                   <widgets>/last-plan.json (--expand adds full guidance text)",
    "  widget --title <t> (--html-file <f> | --html '<s>' | stdin)",
    "         [--grounding '<json>' | --grounding-file <f>]",
    "         [--width n] [--height n] [--floating] [--interactive] [--no-open]",
    "  canvas --title <t> (--tsx-file <f> | --tsx '<s>')",
    "         [--grounding '<json>' | --grounding-file <f>]",
    "         [--width n] [--height n] [--floating] [--interactive] [--no-open]",
    "  browse list [--limit n]          saved widget history (newest first)",
    "  browse reopen <file> [--interactive]",
    "  browse html <file>               saved html (canvas returns its TSX source)",
    "  __hold ...                       internal detached window holder — do not call directly",
    "",
    "Grounding is required for every render: status=grounded with concrete sources,",
    "or not_applicable with a reason. Plan state: run `route` first — the next",
    "widget/canvas render whose target matches is enforced against it",
    "(research=required ⇒ grounded sources mandatory) and consumes it; a render",
    "never steals another target's plan. `browse` skips plan enforcement.",
    "",
    "Output: one JSON document on stdout ({ ok: true, ... } | { ok: false, error: { message } }).",
  ].join("\n");
}

// ── Shared input helpers ──────────────────────────────────────────────────

function splitList(value: string | boolean | undefined): string[] {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readJsonFileSync(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(`${label}: cannot read JSON from ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function readTextFileSync(path: string, label: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`${label}: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Accept inline JSON (`--grounding '{…}'`) or a file (`--grounding-file f.json`). */
function jsonPayload(
  flags: Record<string, string | boolean>,
  inlineKey: string,
  fileKey: string,
  label: string,
): unknown {
  const inline = flags[inlineKey];
  const file = flags[fileKey];
  if (inline !== undefined && file !== undefined) {
    throw new Error(`use either --${inlineKey} or --${fileKey}, not both`);
  }
  if (file !== undefined) return readJsonFileSync(String(file), label);
  if (typeof inline === "string") {
    try {
      return JSON.parse(inline);
    } catch (e) {
      throw new Error(`${label}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return undefined;
}

function readStdinText(): string | null {
  try {
    const raw = readFileSync(0, "utf-8");
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

function renderOptions(flags: Record<string, string | boolean>): RenderOptions {
  const title = flags.title;
  if (typeof title !== "string" || !title.trim()) throw new Error("--title <t> is required.");
  const width = flags.width !== undefined ? Number(flags.width) : undefined;
  const height = flags.height !== undefined ? Number(flags.height) : undefined;
  return {
    title,
    grounding: jsonPayload(flags, "grounding", "grounding-file", "grounding"),
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    floating: flags.floating === true,
    interactive: flags.interactive === true,
    noOpen: flags["no-open"] === true,
  };
}

// ── Plan state: <widgets>/last-plan.json ──────────────────────────────────

function lastPlanPath(): string {
  return join(widgetsDir(), "last-plan.json");
}

function writeLastPlan(plan: Record<string, unknown>): void {
  mkdirSync(widgetsDir(), { recursive: true });
  writeFileSync(lastPlanPath(), JSON.stringify(plan, null, 2), "utf-8");
}

function readLastPlan(): PersistedPlan | null {
  try {
    const parsed = JSON.parse(readFileSync(lastPlanPath(), "utf-8")) as Partial<PersistedPlan>;
    if (!parsed || typeof parsed !== "object") return null;
    const target = parsed.target;
    if (target !== "markdown" && target !== "show_widget" && target !== "show_canvas") return null;
    return {
      route: typeof parsed.route === "string" ? parsed.route : null,
      target,
      research: typeof parsed.research === "string" ? parsed.research : null,
      modules: Array.isArray(parsed.modules) ? parsed.modules.filter((m) => typeof m === "string") : [],
      templates: Array.isArray(parsed.templates) ? parsed.templates.filter((t) => typeof t === "string") : [],
    };
  } catch {
    return null;
  }
}

function deleteLastPlan(): void {
  try {
    unlinkSync(lastPlanPath());
  } catch {}
}

// ── Window lifecycle: detached __hold child ───────────────────────────────

function tmpResultFile(): string {
  return join(tmpdir(), "generative-ui-result-" + randomUUID() + ".json");
}

function spawnHold(args: {
  htmlFile: string;
  widgetFile: string;
  title: string;
  width: number;
  height: number;
  floating: boolean;
  resultFile?: string;
}): void {
  const script = fileURLToPath(import.meta.url);
  const argv = [
    script, "__hold",
    "--html-file", args.htmlFile,
    "--widget-file", args.widgetFile,
    "--title", args.title,
    "--width", String(args.width),
    "--height", String(args.height),
  ];
  if (args.floating) argv.push("--floating");
  if (args.resultFile) argv.push("--result-file", args.resultFile);
  spawn("bun", argv, { detached: true, stdio: "ignore" }).unref();
}

/** Poll the __hold result file (200ms interval, 120s timeout). */
async function pollResultFile(path: string): Promise<HoldResult> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as HoldResult;
      if (parsed && typeof parsed === "object" && typeof parsed.closedReason === "string") {
        try {
          unlinkSync(path);
        } catch {}
        return parsed;
      }
    } catch {}
    if (Date.now() >= deadline) return { messageData: null, event: null, closedReason: "Timeout" };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Open (or skip) the window via __hold and shape the command result. */
async function renderOutput(
  details: Record<string, unknown>,
  open: OpenOptions,
  windowArgs: { htmlFile: string; widgetFile: string; title: string; width: number; height: number },
): Promise<CliResult> {
  if (open.noOpen) return ok({ ...details, opened: false });
  const resultFile = open.interactive ? tmpResultFile() : undefined;
  spawnHold({ ...windowArgs, floating: open.floating, resultFile });
  if (!resultFile) return ok({ ...details, opened: true });
  const settled = await pollResultFile(resultFile);
  return ok({
    ...details,
    opened: true,
    messageData: settled.messageData ?? null,
    event: settled.event ?? null,
    closedReason: settled.closedReason,
  });
}

// ── Commands ──────────────────────────────────────────────────────────────

async function cmdRoute(positional: string[], flags: Record<string, string | boolean>): Promise<CliResult> {
  const request = positional[0];
  if (!request) return fail("usage: route '<request>' [--modules a,b] [--templates t1,t2] [--expand]");
  const modules = splitList(flags.modules);
  const templates = splitList(flags.templates);
  const plan = planVisualGuidance({
    request,
    ...(modules.length ? { modules } : {}),
    ...(templates.length ? { templates } : {}),
  });
  writeLastPlan({
    route: plan.details.route,
    target: plan.details.target,
    research: plan.details.research,
    modules: plan.details.modules ?? [],
    templates: plan.details.templates ?? [],
  });
  return ok({
    details: plan.details,
    ...(flags.expand === true ? { content: plan.content } : {}),
    planFile: lastPlanPath(),
  });
}

function widgetCode(flags: Record<string, string | boolean>): string {
  const inline = flags.html;
  const file = flags["html-file"];
  if (inline !== undefined && file !== undefined) throw new Error("use either --html or --html-file, not both");
  if (file !== undefined) return readTextFileSync(String(file), "widget html");
  if (typeof inline === "string") return inline;
  const piped = readStdinText();
  if (piped !== null) return piped;
  throw new Error("provide --html-file <f>, --html '<s>', or pipe the HTML fragment via stdin");
}

function canvasCode(flags: Record<string, string | boolean>): string {
  const inline = flags.tsx;
  const file = flags["tsx-file"];
  if (inline !== undefined && file !== undefined) throw new Error("use either --tsx or --tsx-file, not both");
  if (file !== undefined) return readTextFileSync(String(file), "canvas tsx");
  if (typeof inline === "string") return inline;
  throw new Error("provide --tsx-file <f> or --tsx '<s>'");
}

async function cmdWidget(flags: Record<string, string | boolean>): Promise<CliResult> {
  const opts = renderOptions(flags);
  const code = widgetCode(flags);
  validateWidgetCode(code, opts.interactive);
  const grounding = validateGroundingDeclaration(opts.grounding);
  const plan = readLastPlan();
  enforceGroundingForPlan(grounding, plan, "show_widget");

  const provenanceFooter = groundingFooterHTML(grounding);
  const renderedCode = code + provenanceFooter;
  const isSVG = code.trimStart().startsWith("<svg");
  const title = opts.title.replace(/_/g, " ");
  const width = opts.width ?? 800;
  const height = opts.height ?? 600;
  const ts = timestamp();
  const safeTitle = opts.title.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = ts + "_" + safeTitle + ".html";
  const fullPath = join(widgetsDir(), filename);

  const record: WidgetRecord = {
    id: ts + "_" + safeTitle,
    title,
    timestamp: ts,
    file: filename,
    width,
    height,
    isSVG,
    cwd: process.cwd(),
    grounding,
  };
  await saveWidget(record, wrapHTML(renderedCode, isSVG));
  if (plan?.target === "show_widget") deleteLastPlan();

  return renderOutput(
    { title: opts.title, width, height, isSVG, savedFile: filename, fullPath, grounding },
    opts,
    { htmlFile: fullPath, widgetFile: filename, title, width, height },
  );
}

async function cmdCanvas(flags: Record<string, string | boolean>): Promise<CliResult> {
  const opts = renderOptions(flags);
  const code = canvasCode(flags);
  validateCanvasCode(code, opts.interactive);
  const grounding = validateGroundingDeclaration(opts.grounding);
  const plan = readLastPlan();
  enforceGroundingForPlan(grounding, plan, "show_canvas");

  const provenanceFooter = groundingFooterHTML(grounding);
  // Compile errors surface verbatim ("Canvas compile failed: …") like the old tool.
  const compiled = await transpileCanvas(code);
  const title = opts.title.replace(/_/g, " ");
  const width = opts.width ?? 900;
  const height = opts.height ?? 640;
  const ts = timestamp();
  const safeTitle = opts.title.replace(/[^a-zA-Z0-9_-]/g, "_");
  const canvasStateId = process.cwd() + "::" + safeTitle;
  const filename = ts + "_" + safeTitle + ".html";
  const sourceFile = ts + "_" + safeTitle + ".tsx";
  const fullPath = join(widgetsDir(), filename);

  const record: WidgetRecord = {
    id: ts + "_" + safeTitle,
    title,
    timestamp: ts,
    file: filename,
    width,
    height,
    isSVG: false,
    kind: "canvas",
    sourceFile,
    canvasStateId,
    cwd: process.cwd(),
    grounding,
  };
  await saveWidget(record, canvasDocumentHTML(compiled, canvasStateId, provenanceFooter), code);
  if (plan?.target === "show_canvas") deleteLastPlan();

  return renderOutput(
    { title: opts.title, width, height, kind: "canvas", savedFile: filename, sourceFile, fullPath, canvasStateId, grounding },
    opts,
    { htmlFile: fullPath, widgetFile: filename, title, width, height },
  );
}

async function cmdBrowse(positional: string[], flags: Record<string, string | boolean>): Promise<CliResult> {
  const [action, file] = positional;

  if (action === "list") {
    const limit = flags.limit !== undefined ? Number(flags.limit) : 20;
    const index = await loadActiveWidgetIndex();
    return ok({ widgets: index.slice(0, Number.isFinite(limit) ? limit : 20) });
  }

  if (action === "html") {
    if (!file) return fail("usage: browse html <file>");
    const html = await loadWidgetHtml(file);
    if (!html) return fail("Widget not found: " + file);
    const record = (await loadWidgetIndex()).find((entry) => entry.file === file);
    // Canvases return their TSX source — that is what gets edited and re-shown.
    if (record?.kind === "canvas" && record.sourceFile) {
      const source = await loadWidgetHtml(record.sourceFile);
      if (source) return ok({ filename: file, kind: "canvas", sourceFile: record.sourceFile, html: source });
    }
    return ok({ filename: file, html });
  }

  if (action === "reopen") {
    if (!file) return fail("usage: browse reopen <file> [--interactive]");
    const html = await loadWidgetHtml(file);
    if (!html) return fail("Widget not found: " + file);
    const record = (await loadWidgetIndex()).find((entry) => entry.file === file);
    const title = record?.title ?? "Saved Widget";
    const width = record?.width ?? 800;
    const height = record?.height ?? 600;
    return renderOutput(
      { filename: file, title, width, height, isSVG: record?.isSVG ?? false, reopened: true },
      { floating: false, interactive: flags.interactive === true, noOpen: false },
      { htmlFile: join(widgetsDir(), file), widgetFile: file, title, width, height },
    );
  }

  return fail("usage: browse list [--limit n] | browse reopen <file> [--interactive] | browse html <file>");
}

/** Internal: detached process holding one window open past the CLI's lifetime. */
async function cmdHold(flags: Record<string, string | boolean>): Promise<CliResult> {
  const resultFile = typeof flags["result-file"] === "string" ? flags["result-file"] : undefined;
  let settled = false;
  const writeResult = (value: HoldResult): void => {
    settled = true;
    if (!resultFile) return;
    try {
      const tmp = resultFile + ".tmp";
      writeFileSync(tmp, JSON.stringify(value), "utf-8");
      renameSync(tmp, resultFile);
    } catch {}
  };
  try {
    const htmlFile = flags["html-file"];
    const widgetFile = flags["widget-file"];
    if (typeof htmlFile !== "string" || typeof widgetFile !== "string") {
      throw new Error("usage: __hold --html-file <f> --widget-file <f> --title <t> --width n --height n [--floating] [--result-file <f>]");
    }
    const html = readTextFileSync(htmlFile, "__hold html");
    const width = Number(flags.width);
    const height = Number(flags.height);
    const title = typeof flags.title === "string" ? flags.title : "Widget";
    await preloadGlimpseui();
    const win: any = openWindow(html, {
      width: Number.isFinite(width) ? width : 800,
      height: Number.isFinite(height) ? height : 600,
      title,
      floating: flags.floating === true,
      noDock: true,
    });

    const record = (await loadWidgetIndex()).find((entry) => entry.file === widgetFile);
    const isCanvas = record?.kind === "canvas";

    win.on("message", (data: unknown) => {
      // Settling rule mirrors tools.ts presentWindow: canvas_action traffic never
      // settles; the first other message does.
      const isCanvasAction = isCanvas
        && !!data
        && typeof data === "object"
        && (data as { type?: unknown }).type === "canvas_action";
      const settles = !!resultFile && !settled && !isCanvasAction;
      void appendWidgetEvent(widgetFile, data).then((event) => {
        if (settles) writeResult({ messageData: data, event: event ?? null, closedReason: "User sent data" });
      }).catch((error) => {
        if (settles) {
          writeResult({
            messageData: null,
            event: null,
            closedReason: "Error: " + (error instanceof Error ? error.message : String(error)),
          });
        }
      });
    });
    win.on("closed", () => {
      if (resultFile && !settled) writeResult({ messageData: null, event: null, closedReason: "Window closed" });
      process.exit(0);
    });
    win.on("error", (error: Error) => {
      if (resultFile && !settled) writeResult({ messageData: null, event: null, closedReason: "Error: " + error.message });
      process.exit(0);
    });

    // Keep this process (and the window) alive until closed/error.
    return await new Promise<CliResult>(() => {});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (resultFile && !settled) writeResult({ messageData: null, event: null, closedReason: "Error: " + message });
    return fail(message);
  }
}

/** CLI entry: parse argv, dispatch, never throw (all errors become JSON). */
export async function runVisualCli(argv: string[]): Promise<CliResult> {
  try {
    const { positional, flags } = parseArgs(argv);
    const command = positional.shift();
    if (!command || command === "help" || flags.help === true) {
      return { code: command ? 0 : 1, stdout: usage(), stderr: "" };
    }
    // `return await` (not bare `return`) so async rejections hit the catch below.
    switch (command) {
      case "route":
        return await cmdRoute(positional, flags);
      case "widget":
        return await cmdWidget(flags);
      case "canvas":
        return await cmdCanvas(flags);
      case "browse":
        return await cmdBrowse(positional, flags);
      case "__hold":
        return await cmdHold(flags);
      default:
        return fail(`unknown command: ${command}\n\n${usage()}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

if (import.meta.main) {
  runVisualCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout + "\n");
    if (result.stderr) process.stderr.write(result.stderr + "\n");
    process.exitCode = result.code;
  });
}
