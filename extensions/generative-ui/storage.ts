// ── Widget Storage ────────────────────────────────────────────────────────

import { mkdir, writeFile, readFile } from "node:fs/promises";
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
}

export async function ensureWidgetsDir() {
  await mkdir(WIDGETS_DIR, { recursive: true });
}

export async function saveWidget(record: WidgetRecord, html: string) {
  await ensureWidgetsDir();
  await writeFile(join(WIDGETS_DIR, record.file), html, "utf-8");

  let index: WidgetRecord[] = [];
  try {
    const raw = await readFile(WIDGETS_INDEX, "utf-8");
    index = JSON.parse(raw);
  } catch {}
  index.unshift(record);
  if (index.length > 200) index = index.slice(0, 200);
  await writeFile(WIDGETS_INDEX, JSON.stringify(index, null, 2), "utf-8");
}

export async function loadWidgetIndex(): Promise<WidgetRecord[]> {
  try {
    const raw = await readFile(WIDGETS_INDEX, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function loadWidgetHtml(filename: string): Promise<string | null> {
  try {
    return await readFile(join(WIDGETS_DIR, filename), "utf-8");
  } catch {
    return null;
  }
}
