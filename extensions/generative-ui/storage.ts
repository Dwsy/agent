// ── Widget Storage ────────────────────────────────────────────────────────

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export const WIDGETS_DIR = join(process.env.HOME || "~", ".pi/widgets");
export const WIDGETS_INDEX = join(WIDGETS_DIR, "index.json");

export interface WidgetRecord {
  id: string;
  title: string;
  timestamp: string;
  file: string;
  width: number;
  height: number;
  isSVG: boolean;
  cwd?: string;
  interactionData?: any;
  archivedAt?: string;
}

export async function ensureWidgetsDir() {
  await mkdir(WIDGETS_DIR, { recursive: true });
}

async function readWidgetIndex(): Promise<WidgetRecord[]> {
  try {
    const raw = await readFile(WIDGETS_INDEX, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeWidgetIndex(index: WidgetRecord[]): Promise<void> {
  await ensureWidgetsDir();
  await writeFile(WIDGETS_INDEX, JSON.stringify(index, null, 2), "utf-8");
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
  await writeFile(join(WIDGETS_DIR, record.file), html, "utf-8");

  let index = await readWidgetIndex();
  index.unshift(record);
  index = uniqueRecords(index);
  if (index.length > 200) index = index.slice(0, 200);
  await writeWidgetIndex(index);
}

export async function loadWidgetIndex(): Promise<WidgetRecord[]> {
  return readWidgetIndex();
}

export async function loadActiveWidgetIndex(): Promise<WidgetRecord[]> {
  return (await readWidgetIndex()).filter((record) => !record.archivedAt);
}

export async function renameWidgetTitle(file: string, title: string): Promise<WidgetRecord | null> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Widget title cannot be empty.");

  const index = await readWidgetIndex();
  const record = index.find((item) => item.file === file);
  if (!record) return null;

  record.title = trimmed;
  await writeWidgetIndex(index);
  return record;
}

export async function setWidgetsArchived(files: string[], archived: boolean): Promise<WidgetRecord[]> {
  const targets = new Set(files);
  if (targets.size === 0) return [];

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
}

export async function deleteWidgets(files: string[]): Promise<WidgetRecord[]> {
  const targets = new Set(files);
  if (targets.size === 0) return [];

  const index = await readWidgetIndex();
  const deleted: WidgetRecord[] = [];
  const kept: WidgetRecord[] = [];

  for (const record of index) {
    if (targets.has(record.file)) deleted.push(record);
    else kept.push(record);
  }

  if (deleted.length === 0) return [];

  await writeWidgetIndex(kept);
  await Promise.all(deleted.map(async (record) => {
    try {
      await unlink(join(WIDGETS_DIR, record.file));
    } catch {}
  }));
  return deleted;
}

export async function loadWidgetHtml(filename: string): Promise<string | null> {
  if (filename.includes("/") || filename.includes("\\")) return null;
  try {
    return await readFile(join(WIDGETS_DIR, filename), "utf-8");
  } catch {
    return null;
  }
}
