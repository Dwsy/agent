// ── Widget Storage ────────────────────────────────────────────────────────

import { mkdir, writeFile, readFile, readdir, rmdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

function defaultWidgetsDir(): string {
  return join(process.env.HOME || "~", ".pi/widgets");
}

/** Override with GENERATIVE_UI_WIDGETS_DIR for isolated tests. */
export function widgetsDir(): string {
  return process.env.GENERATIVE_UI_WIDGETS_DIR || defaultWidgetsDir();
}

export function widgetsIndexPath(): string {
  return join(widgetsDir(), "index.json");
}

// Compat for tools/commands that import the constant path (production default).
export const WIDGETS_DIR = defaultWidgetsDir();
export const WIDGETS_INDEX = join(WIDGETS_DIR, "index.json");

export class WidgetEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetEventValidationError";
  }
}

export interface WidgetAnnotationEvent {
  type: "annotation";
  targetId: string;
  comment: string;
  stateId?: string;
  timestamp: string;
}

export interface WidgetInteractionEvent {
  type: "interaction";
  data: unknown;
  timestamp: string;
}

export type WidgetEvent = WidgetAnnotationEvent | WidgetInteractionEvent;

export interface WidgetRecord {
  id: string;
  title: string;
  timestamp: string;
  file: string;
  width: number;
  height: number;
  isSVG: boolean;
  cwd?: string;
  /** Last interaction retained for compatibility with existing widget indexes. */
  interactionData?: unknown;
  events?: WidgetEvent[];
  archivedAt?: string;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function createWidgetEvent(data: unknown, timestamp = new Date().toISOString()): WidgetEvent {
  if (data && typeof data === "object" && (data as { type?: unknown }).type === "annotation") {
    const input = data as { targetId?: unknown; comment?: unknown; stateId?: unknown };
    const targetId = nonEmptyString(input.targetId);
    const comment = nonEmptyString(input.comment);
    if (!targetId || !comment) {
      throw new WidgetEventValidationError("Annotation targetId and comment are required.");
    }
    const stateId = nonEmptyString(input.stateId);
    if (input.stateId !== undefined && !stateId) {
      throw new WidgetEventValidationError("Annotation stateId must be a non-empty string when provided.");
    }
    return {
      type: "annotation",
      targetId,
      comment,
      ...(stateId ? { stateId } : {}),
      timestamp,
    };
  }

  return { type: "interaction", data, timestamp };
}

// Serialize all index.json read-modify-write operations.
// Concurrent show_widget calls previously raced: each read the same snapshot,
// unshifted its own record, and last write won — only 1 of N survived.
let indexQueue: Promise<unknown> = Promise.resolve();

function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = indexQueue.then(fn, fn);
  // Keep the chain alive even if a mutation rejects.
  indexQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function ensureWidgetsDir() {
  await mkdir(widgetsDir(), { recursive: true });
}

async function readWidgetIndex(): Promise<WidgetRecord[]> {
  try {
    const raw = await readFile(widgetsIndexPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeWidgetIndex(index: WidgetRecord[]): Promise<void> {
  await ensureWidgetsDir();
  await writeFile(widgetsIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

function widgetEventsDir(file: string): string {
  return join(widgetsDir(), file + ".events");
}

function isWidgetEvent(value: unknown): value is WidgetEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<WidgetEvent>;
  if (event.type === "interaction") return typeof event.timestamp === "string";
  return event.type === "annotation"
    && typeof event.targetId === "string"
    && typeof event.comment === "string"
    && typeof event.timestamp === "string";
}

async function loadPersistedEvents(record: WidgetRecord): Promise<WidgetEvent[]> {
  try {
    const dir = widgetEventsDir(record.file);
    const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
    const events = await Promise.all(files.map(async (file): Promise<WidgetEvent | null> => {
      try {
        const value = JSON.parse(await readFile(join(dir, file), "utf-8")) as unknown;
        return isWidgetEvent(value) ? value : null;
      } catch {
        return null;
      }
    }));
    return events.filter((event): event is WidgetEvent => event !== null);
  } catch {
    return record.events ?? [];
  }
}

async function deleteWidgetEvents(file: string): Promise<void> {
  const dir = widgetEventsDir(file);
  try {
    const files = await readdir(dir);
    await Promise.all(files.map((eventFile) => unlink(join(dir, eventFile)).catch(() => {})));
    await rmdir(dir);
  } catch {}
}

async function hydrateWidgetEvents(records: WidgetRecord[]): Promise<WidgetRecord[]> {
  return Promise.all(records.map(async (record) => {
    const events = await loadPersistedEvents(record);
    if (events.length === 0) return record;
    const lastInteraction = events.findLast(
      (event): event is WidgetInteractionEvent => event.type === "interaction",
    );
    return {
      ...record,
      events,
      ...(lastInteraction ? { interactionData: lastInteraction.data } : {}),
    };
  }));
}

function uniqueRecords(index: WidgetRecord[]): WidgetRecord[] {
  const seen = new Set<string>();
  return index.filter((record) => {
    const key = record.file || record.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function saveWidget(record: WidgetRecord, html: string) {
  await ensureWidgetsDir();
  // HTML files are unique by filename — safe to write in parallel.
  await writeFile(join(widgetsDir(), record.file), html, "utf-8");

  await withIndexLock(async () => {
    let index = await readWidgetIndex();
    index.unshift(record);
    index = uniqueRecords(index);
    if (index.length > 200) index = index.slice(0, 200);
    await writeWidgetIndex(index);
  });
}

export async function loadWidgetIndex(): Promise<WidgetRecord[]> {
  return hydrateWidgetEvents(await readWidgetIndex());
}

export async function loadActiveWidgetIndex(): Promise<WidgetRecord[]> {
  return (await loadWidgetIndex()).filter((record) => !record.archivedAt);
}

export async function appendWidgetEvent(file: string, data: unknown): Promise<WidgetEvent | null> {
  if (file.includes("/") || file.includes("\\")) return null;
  const index = await readWidgetIndex();
  if (!index.some((item) => item.file === file)) return null;

  const event = createWidgetEvent(data);
  const dir = widgetEventsDir(file);
  await mkdir(dir, { recursive: true });
  const eventFile = event.timestamp.replace(/[:.]/g, "-") + "_" + randomUUID() + ".json";
  await writeFile(join(dir, eventFile), JSON.stringify(event), { encoding: "utf-8", flag: "wx" });
  return event;
}

export async function renameWidgetTitle(file: string, title: string): Promise<WidgetRecord | null> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Widget title cannot be empty.");

  return withIndexLock(async () => {
    const index = await readWidgetIndex();
    const record = index.find((item) => item.file === file);
    if (!record) return null;

    record.title = trimmed;
    await writeWidgetIndex(index);
    return record;
  });
}

export async function setWidgetsArchived(files: string[], archived: boolean): Promise<WidgetRecord[]> {
  const targets = new Set(files);
  if (targets.size === 0) return [];

  return withIndexLock(async () => {
    const index = await readWidgetIndex();
    const changed: WidgetRecord[] = [];
    const archivedAt = new Date().toISOString();

    for (const record of index) {
      if (!targets.has(record.file)) continue;
      if (archived) record.archivedAt = record.archivedAt ?? archivedAt;
      else delete record.archivedAt;
      changed.push(record);
    }

    if (changed.length > 0) await writeWidgetIndex(index);
    return changed;
  });
}

export async function deleteWidgets(files: string[]): Promise<WidgetRecord[]> {
  const targets = new Set(files);
  if (targets.size === 0) return [];

  return withIndexLock(async () => {
    const index = await readWidgetIndex();
    const deleted: WidgetRecord[] = [];
    const kept: WidgetRecord[] = [];

    for (const record of index) {
      if (targets.has(record.file)) deleted.push(record);
      else kept.push(record);
    }

    if (deleted.length === 0) return [];

    await writeWidgetIndex(kept);
    await Promise.all(deleted.flatMap((record) => [
      unlink(join(widgetsDir(), record.file)).catch(() => {}),
      deleteWidgetEvents(record.file),
    ]));
    return deleted;
  });
}

export async function loadWidgetHtml(filename: string): Promise<string | null> {
  if (filename.includes("/") || filename.includes("\\")) return null;
  try {
    return await readFile(join(widgetsDir(), filename), "utf-8");
  } catch {
    return null;
  }
}
