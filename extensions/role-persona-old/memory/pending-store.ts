/** pending.md serialization and file I/O (module-internal). */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { contentHash, writeCommittedMemoryFile } from "../memory-git.ts";
import { memoryRootDir, pendingMemoryPath } from "./paths.ts";
import { today } from "./text.ts";
import type { PendingMemoryData, PendingMemoryRecord } from "./types.ts";

export function renderPendingMemory(data: PendingMemoryData): string {
  const lines: string[] = [
    "---",
    `role: "${data.roleName}"`,
    `updated: "${data.updated}"`,
    "---",
    "",
    "# Pending Memories",
    "",
    "Auto-extracted memories waiting for usage verification.",
    "Promote to consolidated when used in relevant context.",
    "",
  ];

  if (data.items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of data.items) {
      const status = item.promoted ? "✓" : item.discarded ? "✗" : "○";
      lines.push(`- [${status}] [${item.source}] ${item.text}`);
      if (item.category) {
        lines.push(`  category: ${item.category}`);
      }
      lines.push(`  id: ${item.id}`);
      lines.push(`  created: ${item.createdAt}`);
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

function parsePendingMemory(content: string): PendingMemoryData {
  const lines = content.split(/\r?\n/);
  const items: PendingMemoryRecord[] = [];
  
  let currentItem: Partial<PendingMemoryRecord> | null = null;
  
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    
    // Skip frontmatter and headers
    if (line.startsWith("---") || line.startsWith("#") || !line.trim()) {
      if (currentItem && currentItem.text) {
        items.push(currentItem as PendingMemoryRecord);
        currentItem = null;
      }
      continue;
    }
    
    // Parse item line
    const itemMatch = line.match(/^\- \[([✓✗○])\] \[([^\]]+)\] (.+)$/);
    if (itemMatch) {
      if (currentItem && currentItem.text) {
        items.push(currentItem as PendingMemoryRecord);
      }
      currentItem = {
        promoted: itemMatch[1] === "✓",
        discarded: itemMatch[1] === "✗",
        source: itemMatch[2],
        text: itemMatch[3],
      };
      continue;
    }
    
    // Parse metadata lines
    const metaMatch = line.match(/^\s+(category|id|created): (.+)$/);
    if (metaMatch && currentItem) {
      if (metaMatch[1] === "category") currentItem.category = metaMatch[2];
      if (metaMatch[1] === "id") currentItem.id = metaMatch[2];
      if (metaMatch[1] === "created") currentItem.createdAt = metaMatch[2];
    }
  }
  
  // Don't forget the last item
  if (currentItem && currentItem.text) {
    items.push(currentItem as PendingMemoryRecord);
  }
  
  return {
    roleName: "",
    updated: today(),
    items,
  };
}

export function readPendingMemory(rolePath: string): PendingMemoryData {
  const file = pendingMemoryPath(rolePath);
  if (!existsSync(file)) {
    return { roleName: "", updated: today(), items: [] };
  }
  const content = readFileSync(file, "utf-8");
  const data = parsePendingMemory(content);
  data.sourceHash = contentHash(content);
  return data;
}

export function writePendingMemory(rolePath: string, data: PendingMemoryData): void {
  const file = pendingMemoryPath(rolePath);
  const dir = memoryRootDir(rolePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeCommittedMemoryFile(rolePath, file, renderPendingMemory(data), "update pending memory", {
    expectedHash: data.sourceHash,
  });
}
