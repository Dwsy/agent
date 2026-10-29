import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { CHUNKER_VERSION, chunkPrompt } from "./chunking.ts";

const STORE_ROOT = join(dirname(getAgentDir()), "system-prompts");
const OBJECTS_ROOT = join(STORE_ROOT, "objects", "sha256");
const PROJECTS_ROOT = join(STORE_ROOT, "projects");
const SESSIONS_ROOT = join(STORE_ROOT, "sessions");
const SCHEMA_VERSION = 1;

interface ChunkRef {
  hash: string;
  bytes: number;
}

interface RevisionManifest {
  schema: 1;
  id: string;
  promptHash: string;
  chunks: ChunkRef[];
  chars: number;
  bytes: number;
  lines: number;
  createdAt: string;
  /** Chunker that produced `chunks`. Absent on manifests written before content-defined chunking. */
  chunker?: string;
}

interface SessionRevisionRef {
  version: number;
  id: string;
  at: string;
}

interface SessionRef {
  schema: 1;
  sessionId: string;
  sessionFile?: string;
  projectKey: string;
  projectRoot: string;
  revisions: SessionRevisionRef[];
}

interface GlobalSessionRef {
  schema: 1;
  sessionId: string;
  projectKey: string;
  projectRoot: string;
  sessionPath: string;
  sessionFile?: string;
  updatedAt: string;
}

interface RuntimeState {
  projectRoot: string;
  projectKey: string;
  sessionId: string;
  sessionPath: string;
  session: SessionRef;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensurePrivateDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function atomicWriteJson(path: string, value: unknown): void {
  ensurePrivateDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

function writeObject(hash: string, content: string): void {
  const dir = join(OBJECTS_ROOT, hash.slice(0, 2));
  const path = join(dir, hash.slice(2));
  if (existsSync(path)) return;
  ensurePrivateDir(dir);
  try {
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }
}

function resolveProjectRoot(cwd: string): string {
  try {
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return realpathSync(root);
  } catch {
    // Non-git projects use their Pi cwd as the project identity.
  }

  try {
    return realpathSync(cwd);
  } catch {
    return cwd;
  }
}

function sessionPathFor(projectKey: string, sessionId: string): string {
  return join(PROJECTS_ROOT, projectKey, "sessions", `${sessionId}.json`);
}

function globalSessionPathFor(sessionId: string): string {
  return join(SESSIONS_ROOT, `${sessionId}.json`);
}

function revisionPathFor(projectKey: string, revisionId: string): string {
  return join(PROJECTS_ROOT, projectKey, "revisions", `${revisionId}.json`);
}

function loadSession(path: string, fallback: Omit<SessionRef, "schema" | "revisions">): SessionRef {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SessionRef;
    if (parsed.schema === SCHEMA_VERSION && parsed.sessionId === fallback.sessionId) return parsed;
  } catch {
    // Missing/corrupt state gets recreated from the current Pi session identity.
  }
  return { schema: 1, ...fallback, revisions: [] };
}

function storeRevision(projectKey: string, prompt: string): RevisionManifest {
  const promptHash = sha256(prompt);
  const manifestPath = revisionPathFor(projectKey, promptHash);

  let createdAt = new Date().toISOString();
  if (existsSync(manifestPath)) {
    const existing = JSON.parse(readFileSync(manifestPath, "utf8")) as RevisionManifest;
    if (existing.chunker === CHUNKER_VERSION) return existing;
    // Packed by an older chunker: repack it in place, keeping its original timestamp.
    createdAt = existing.createdAt || createdAt;
  }

  const chunks = chunkPrompt(prompt).map((content) => {
    const hash = sha256(content);
    writeObject(hash, content);
    return { hash, bytes: Buffer.byteLength(content, "utf8") };
  });

  const manifest: RevisionManifest = {
    schema: 1,
    id: promptHash,
    promptHash,
    chunks,
    chars: prompt.length,
    bytes: Buffer.byteLength(prompt, "utf8"),
    lines: prompt.length === 0 ? 0 : prompt.split("\n").length,
    createdAt,
    chunker: CHUNKER_VERSION,
  };

  atomicWriteJson(manifestPath, manifest);
  return manifest;
}

function readRevision(projectKey: string, revisionId: string): { manifest: RevisionManifest; prompt: string } | null {
  try {
    const manifest = JSON.parse(readFileSync(revisionPathFor(projectKey, revisionId), "utf8")) as RevisionManifest;
    const prompt = manifest.chunks
      .map(({ hash }) => readFileSync(join(OBJECTS_ROOT, hash.slice(0, 2), hash.slice(2)), "utf8"))
      .join("");
    if (sha256(prompt) !== manifest.promptHash) return null;
    return { manifest, prompt };
  } catch {
    return null;
  }
}

function createRuntime(ctx: ExtensionContext): RuntimeState {
  const projectRoot = resolveProjectRoot(ctx.cwd);
  const projectKey = sha256(projectRoot);
  const sessionId = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  const sessionPath = sessionPathFor(projectKey, sessionId);
  const session = loadSession(sessionPath, {
    sessionId,
    sessionFile,
    projectKey,
    projectRoot,
  });

  const projectDir = join(PROJECTS_ROOT, projectKey);
  ensurePrivateDir(projectDir);
  const metaPath = join(projectDir, "meta.json");
  if (!existsSync(metaPath)) {
    atomicWriteJson(metaPath, { schema: 1, projectKey, projectRoot, createdAt: new Date().toISOString() });
  }

  return { projectRoot, projectKey, sessionId, sessionPath, session };
}

/**
 * The global index maps a Pi session id to the project record that holds its
 * revisions. It is only meaningful once such a record exists, so it is written
 * from `capturePrompt` rather than on session start: most sessions never run an
 * agent turn, and indexing them left the index half full of dangling entries.
 */
function writeGlobalSessionRef(state: RuntimeState): void {
  const ref: GlobalSessionRef = {
    schema: 1,
    sessionId: state.sessionId,
    projectKey: state.projectKey,
    projectRoot: state.projectRoot,
    sessionPath: `projects/${state.projectKey}/sessions/${state.sessionId}.json`,
    sessionFile: state.session.sessionFile,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(globalSessionPathFor(state.sessionId), ref);
}

function capturePrompt(state: RuntimeState, prompt: string): void {
  const id = sha256(prompt);
  const latest = state.session.revisions.at(-1);
  if (latest?.id === id) return;

  storeRevision(state.projectKey, prompt);
  state.session.revisions.push({
    version: (latest?.version ?? 0) + 1,
    id,
    at: new Date().toISOString(),
  });
  atomicWriteJson(state.sessionPath, state.session);
  writeGlobalSessionRef(state);
}

function reconstructLatest(state: RuntimeState): { prompt: string; manifest: RevisionManifest; version: number } | null {
  const latest = state.session.revisions.at(-1);
  if (!latest) return null;
  const revision = readRevision(state.projectKey, latest.id);
  if (!revision) return null;
  return { ...revision, version: latest.version };
}

function visiblePad(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

class PromptViewer {
  private offset = 0;
  private bodyHeight = 18;
  private lastRenderWidth = 100;

  constructor(
    private readonly prompt: string,
    private readonly title: string,
    private readonly meta: string,
    private readonly theme: Theme,
    private readonly requestRender: () => void,
    private readonly done: () => void,
  ) {}

  private renderPrompt(width: number): string[] {
    const bodyWidth = Math.max(1, width - 4);
    const lines: string[] = [];
    for (const line of this.prompt.split("\n")) {
      const wrapped = wrapTextWithAnsi(line || " ", bodyWidth);
      lines.push(...(wrapped.length ? wrapped : [""]));
    }
    return lines;
  }

  render(width: number): string[] {
    const w = Math.max(4, Math.floor(width));
    this.lastRenderWidth = w;
    const inner = Math.max(1, w - 2);
    const promptLines = this.renderPrompt(w);
    const maxOffset = Math.max(0, promptLines.length - this.bodyHeight);
    this.offset = Math.min(this.offset, maxOffset);
    const body = promptLines.slice(this.offset, this.offset + this.bodyHeight);

    const border = (left: string, fill: string, right: string) => this.theme.fg("border", `${left}${fill.repeat(inner)}${right}`);
    const row = (content: string) => `${this.theme.fg("border", "│")}${visiblePad(content, inner)}${this.theme.fg("border", "│")}`;
    const percentage = promptLines.length <= this.bodyHeight ? 100 : Math.round((this.offset / maxOffset) * 100);
    const footer = ` ↑↓ scroll · PgUp/PgDn page · Home/End · Esc close · ${percentage}%`;

    const out = [
      border("╭", "─", "╮"),
      row(` ${this.theme.fg("accent", this.theme.bold(this.title))}`),
      row(` ${this.theme.fg("dim", this.meta)}`),
      border("├", "─", "┤"),
    ];

    for (let i = 0; i < this.bodyHeight; i++) {
      out.push(row(` ${body[i] ?? ""}`));
    }
    out.push(border("├", "─", "┤"));
    out.push(row(this.theme.fg("dim", footer)));
    out.push(border("╰", "─", "╯"));
    return out;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q") {
      this.done();
      return;
    }

    const lineCount = this.renderPrompt(this.lastRenderWidth).length;
    const maxOffset = Math.max(0, lineCount - this.bodyHeight);
    let next = this.offset;

    if (matchesKey(data, Key.up)) next -= 1;
    else if (matchesKey(data, Key.down)) next += 1;
    else if (matchesKey(data, Key.pageUp)) next -= this.bodyHeight;
    else if (matchesKey(data, Key.pageDown)) next += this.bodyHeight;
    else if (matchesKey(data, Key.home)) next = 0;
    else if (matchesKey(data, Key.end)) next = maxOffset;
    else return;

    this.offset = Math.max(0, Math.min(maxOffset, next));
    this.requestRender();
  }

  invalidate(): void {}
}

async function showPrompt(
  ctx: ExtensionCommandContext,
  prompt: string,
  meta: { sessionId: string; revision?: string; version?: number; source: "stored" | "live" },
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/system-prompt requires Pi TUI mode", "warning");
    return;
  }

  const lineCount = prompt.length === 0 ? 0 : prompt.split("\n").length;
  const bytes = Buffer.byteLength(prompt, "utf8");
  const revision = meta.revision ? meta.revision.slice(0, 10) : "not-recorded";
  const version = meta.version ? `v${meta.version}` : "live";
  const info = `${version} · ${meta.source} · rev ${revision} · ${lineCount} lines · ${bytes.toLocaleString()} bytes · session ${meta.sessionId.slice(0, 8)}`;

  await ctx.ui.custom<void>(
    (tui, theme, _kb, done) =>
      new PromptViewer(prompt, "Current System Prompt", info, theme, () => tui.requestRender(), () => done(undefined)),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: 100, maxHeight: 26, margin: 1 },
    },
  );
}

export default function systemPromptHistory(pi: ExtensionAPI) {
  let state: RuntimeState | null = null;

  pi.on("session_start", async (_event, ctx) => {
    state = createRuntime(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state || state.sessionId !== ctx.sessionManager.getSessionId()) {
      state = createRuntime(ctx);
    }
    capturePrompt(state, event.systemPrompt);
  });

  pi.registerCommand("system-prompt", {
    description: "Show the latest effective system prompt used by this Pi session",
    handler: async (_args, ctx) => {
      if (!state || state.sessionId !== ctx.sessionManager.getSessionId()) {
        state = createRuntime(ctx);
      }

      const latest = reconstructLatest(state);
      if (latest) {
        await showPrompt(ctx, latest.prompt, {
          sessionId: state.sessionId,
          revision: latest.manifest.id,
          version: latest.version,
          source: "stored",
        });
        return;
      }

      const live = ctx.getSystemPrompt();
      await showPrompt(ctx, live, { sessionId: state.sessionId, source: "live" });
    },
  });
}
