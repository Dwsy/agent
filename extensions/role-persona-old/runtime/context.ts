/**
 * Shared runtime context for the role-persona extension.
 *
 * All mutable session state that used to live as closure variables in
 * index.ts is held here in a single explicit object, so the event handlers,
 * tools, and commands split across runtime/ modules can share it.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logMemory } from "../logger.ts";

export interface MemoryLogEntry {
  time: string;
  source: "compaction" | "auto-extract" | "tool" | "manual";
  op:
    | "learning"
    | "preference"
    | "event"
    | "knowledge"
    | "reinforce"
    | "consolidate"
    | "update_learning"
    | "update_preference"
    | "delete_learning"
    | "delete_preference";
  content: string;
  previous?: string;
  id?: string;
  oldId?: string;
  category?: string;
  stored: boolean;
  detail?: string; // e.g. category, duplicate reason
}

export interface MemoryDistillMode {
  active: boolean;
  requestedModel?: string;
}

export interface RuntimeState {
  currentRole: string | null;
  currentRolePath: string | null;
  autoMemoryInFlight: boolean;
  autoMemoryBgScheduled: boolean;
  autoMemoryPendingTurns: number;
  autoMemoryLastAt: number;
  autoMemoryLastMessages: unknown[] | null;
  /** 上次 flush 时的消息数组长度 */
  autoMemoryLastFlushLen: number;
  memoryCheckpointSpinner: ReturnType<typeof setInterval> | null;
  memoryCheckpointFrame: number;
  /** 标记是否是第一条用户消息 */
  isFirstUserMessage: boolean;
  /** 会话级缓存：该 rolePath 的 missing summary 已生成过 */
  dailySummaryEnsuredFor: string | null;
  memoryDistillMode: MemoryDistillMode | null;
  /** In-session memory operation log (not persisted; JSONL persistence goes through logMemory) */
  memoryLog: MemoryLogEntry[];
  /** Evolution reminder counters */
  userTurnCount: number;
  lastEvolutionAt: number;
  lastEvolutionDate: string;
}

export interface Runtime {
  pi: ExtensionAPI;
  state: RuntimeState;
  /** Extension root directory (where index.ts lives) */
  extensionDir: string;
  /** Bundled skills directory, exposed via resources_discover */
  skillsDir: string;
}

export function createRuntime(pi: ExtensionAPI, indexModuleUrl: string): Runtime {
  const extensionDir = dirname(fileURLToPath(indexModuleUrl));
  return {
    pi,
    extensionDir,
    skillsDir: join(extensionDir, "skills"),
    state: {
      currentRole: null,
      currentRolePath: null,
      autoMemoryInFlight: false,
      autoMemoryBgScheduled: false,
      autoMemoryPendingTurns: 0,
      autoMemoryLastAt: 0,
      autoMemoryLastMessages: null,
      autoMemoryLastFlushLen: 0,
      memoryCheckpointSpinner: null,
      memoryCheckpointFrame: 0,
      isFirstUserMessage: true,
      dailySummaryEnsuredFor: null,
      memoryDistillMode: null,
      memoryLog: [],
      userTurnCount: 0,
      lastEvolutionAt: 0,
      lastEvolutionDate: "",
    },
  };
}

export function memLogPush(rt: Runtime, entry: Omit<MemoryLogEntry, "time">): void {
  const now = new Date();
  rt.state.memoryLog.push({
    ...entry,
    time: [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":"),
  });

  const operation = entry.op.startsWith("update_")
    ? "update"
    : entry.op.startsWith("delete_")
      ? "delete"
      : entry.op === "consolidate"
        ? "compact"
        : "add";
  logMemory(operation, {
    op: entry.op,
    source: entry.source,
    content: entry.content,
    previous: entry.previous,
    id: entry.id,
    oldId: entry.oldId,
    memoryId: entry.id,
    category: entry.category,
    stored: entry.stored,
    detail: entry.detail,
  });
}
