/** Core data shapes shared across the memory subsystem. */
import { config } from "../config.ts";

export const DEFAULT_MEMORY_CATEGORIES = config.memory.defaultCategories as unknown as readonly string[];
export type MemoryCategory = (typeof DEFAULT_MEMORY_CATEGORIES)[number] | string;

export interface MemoryLearningRecord {
  id: string;
  text: string;
  used: number;
  source?: string;
  tags?: string[];
  weight?: number;
  lastAccessed?: string;
}

export interface MemoryPreferenceRecord {
  id: string;
  category: string;
  text: string;
  tags?: string[];
}

/** Durable timeline / milestone entries under # Events */
export interface MemoryEventRecord {
  id: string;
  date: string;
  title: string;
  body: string;
}

export function eventSearchText(event: MemoryEventRecord): string {
  return [event.title, event.body].filter(Boolean).join("\n").trim();
}

export interface RoleMemoryMetadata {
  name: string;
  version: string;
  created: string;
  updated: string;
  autoConsolidate: boolean;
  consolidationInterval: string;
  tags: string[];
}

export interface RoleMemoryData {
  roleName: string;
  metadata: RoleMemoryMetadata;
  autoExtracted: boolean;
  lastConsolidated?: string;
  learnings: MemoryLearningRecord[];
  preferences: MemoryPreferenceRecord[];
  events: MemoryEventRecord[];
  issues: string[];
  /** Hash of the file read before a read-modify-write operation. */
  sourceHash?: string;
}

export interface MemorySearchMatch {
  kind: "learning" | "preference" | "event" | "pending";
  id?: string;
  text: string;
  category?: string;
  used?: number;
  date?: string;
  source?: string;
}

export interface ScoredMemoryMatch extends MemorySearchMatch {
  score: number;
}

export interface PendingMemoryRecord {
  id: string;
  text: string;
  source: string;  // "auto" | "compaction" | etc.
  category?: string;  // for preferences
  createdAt: string;
  promoted: boolean;
  discarded: boolean;
}

export interface PendingMemoryData {
  roleName: string;
  updated: string;
  items: PendingMemoryRecord[];
  /** Hash of pending.md read before a read-modify-write operation. */
  sourceHash?: string;
}
