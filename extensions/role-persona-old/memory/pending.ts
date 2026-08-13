/** Pending memory layer: add / promote / discard / expire auto-extracted items. */
import { log } from "../logger.ts";
import { readRoleMemory, saveRoleMemory } from "./consolidated.ts";
import { readPendingMemory, writePendingMemory } from "./pending-store.ts";
import { hashId, normalizeText, today } from "./text.ts";
import type { PendingMemoryRecord } from "./types.ts";

export function addPendingLearning(
  rolePath: string,
  text: string,
  source: string = "auto",
  category?: string
): { stored: boolean; duplicate?: boolean; id?: string } {
  const normalized = normalizeText(text);
  if (!normalized) return { stored: false };

  const data = readPendingMemory(rolePath);
  
  // Check for duplicate in pending
  const duplicate = data.items.find(
    (item) => normalizeText(item.text).toLowerCase() === normalized.toLowerCase()
  );
  if (duplicate) return { stored: false, duplicate: true, id: duplicate.id };

  // Also check consolidated to avoid adding if already promoted
  const consolidated = readRoleMemory(rolePath, "");
  const alreadyConsolidated = consolidated.learnings.find(
    (l) => normalizeText(l.text).toLowerCase() === normalized.toLowerCase()
  );
  if (alreadyConsolidated) return { stored: false, duplicate: true, id: alreadyConsolidated.id };

  const id = hashId("pending", normalized);
  data.items.push({
    id,
    text: normalized,
    source,
    category,
    createdAt: today(),
    promoted: false,
    discarded: false,
  });

  writePendingMemory(rolePath, data);
  return { stored: true, id };
}

export function promotePendingLearning(
  rolePath: string,
  roleName: string,
  idOrQuery: string
): { promoted: boolean; id?: string; text?: string; learningId?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  const pendingData = readPendingMemory(rolePath);
  
  const index = pendingData.items.findIndex(
    (item) => item.id === idOrQuery || item.text.toLowerCase().includes(query)
  );
  
  if (index < 0) return { promoted: false };
  
  const item = pendingData.items[index];
  if (item.promoted || item.discarded) return { promoted: false };
  
  // Add to consolidated
  const consolidatedData = readRoleMemory(rolePath, roleName);
  
  // Check for duplicate in consolidated
  const duplicate = consolidatedData.learnings.find(
    (l) => normalizeText(l.text).toLowerCase() === item.text.toLowerCase()
  );
  
  const learningId = duplicate?.id ?? hashId("learning", item.text);
  if (!duplicate) {
    consolidatedData.learnings.push({
      id: learningId,
      text: item.text,
      used: 0,
      source: `promoted:${item.source}`,
      lastAccessed: today(),
    });
    saveRoleMemory(rolePath, consolidatedData);
  }
  
  // Mark as promoted in pending
  pendingData.items[index].promoted = true;
  writePendingMemory(rolePath, pendingData);
  
  return { promoted: true, id: item.id, text: item.text, learningId };
}

export function discardPendingLearning(
  rolePath: string,
  idOrQuery: string
): { discarded: boolean; id?: string } {
  const query = normalizeText(idOrQuery).toLowerCase();
  const data = readPendingMemory(rolePath);
  
  const index = data.items.findIndex(
    (item) => item.id === idOrQuery || item.text.toLowerCase().includes(query)
  );
  
  if (index < 0) return { discarded: false };
  
  data.items[index].discarded = true;
  writePendingMemory(rolePath, data);
  
  return { discarded: true, id: data.items[index].id };
}

export function getPendingMemories(rolePath: string): PendingMemoryRecord[] {
  const data = readPendingMemory(rolePath);
  return data.items.filter((item) => !item.promoted && !item.discarded);
}

export function getPendingStats(rolePath: string): { total: number; pending: number; promoted: number; discarded: number } {
  const data = readPendingMemory(rolePath);
  return {
    total: data.items.length,
    pending: data.items.filter((item) => !item.promoted && !item.discarded).length,
    promoted: data.items.filter((item) => item.promoted).length,
    discarded: data.items.filter((item) => item.discarded).length,
  };
}

export function expirePendingMemories(
  rolePath: string,
  maxAgeDays: number = 7
): { expired: number; total: number } {
  const data = readPendingMemory(rolePath);
  const now = new Date();
  let expired = 0;

  for (let i = data.items.length - 1; i >= 0; i--) {
    const item = data.items[i];
    if (item.promoted || item.discarded) continue;

    const created = new Date(item.createdAt);
    const daysOld = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOld > maxAgeDays) {
      data.items[i].discarded = true;
      expired++;
      log("pending-expire", `expired old pending memory: ${item.text.slice(0, 50)} (${daysOld} days old)`);
    }
  }

  if (expired > 0) {
    writePendingMemory(rolePath, data);
  }

  return { expired, total: data.items.length };
}
