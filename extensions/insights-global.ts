import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

/**
 * Global Insights Extension
 * 
 * Analyzes ALL sessions across ALL projects for comprehensive insights.
 * 
 * Usage: /insights-global
 */

interface SessionEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp: number;
  message?: any;
}

interface SessionData {
  fileName: string;
  projectPath: string;
  entries: SessionEntry[];
  messageCount: number;
  userMessageCount: number;
  toolCallCount: number;
  duration: number;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("insights-global", {
    description: "Analyze all sessions across all projects",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        console.log("Global insights only available in interactive mode");
        return;
      }

      ctx.ui.setStatus("insights", "🔍 Scanning all sessions...");

      try {
        // 1. Find all session files
        const sessionsDir = join(homedir(), ".pi", "agent", "sessions");
        if (!existsSync(sessionsDir)) {
          ctx.ui.notify("No sessions directory found", "warning");
          return;
        }

        // 2. Get all JSONL files recursively
        const sessionFiles = findAllSessionFiles(sessionsDir);
        
        if (sessionFiles.length === 0) {
          ctx.ui.notify("No session files found", "warning");
          return;
        }

        ctx.ui.notify(`Found ${sessionFiles.length} session files, analyzing...`, "info");

        // 3. Parse all sessions
        const allSessions: SessionData[] = [];
        for (const filePath of sessionFiles.slice(0, 100)) { // Limit to 100 files
          try {
            const session = parseSessionFile(filePath, sessionsDir);
            allSessions.push(session);
          } catch (e) {
            // Skip corrupted files
          }
        }

        // 4. Generate global analysis
        const analysis = analyzeGlobalSessions(allSessions);
        
        // 5. Display results
        displayGlobalInsights(analysis, ctx);

      } catch (error) {
        ctx.ui.notify(`Failed to analyze: ${error}`, "error");
      } finally {
        ctx.ui.setStatus("insights", undefined);
      }
    },
  });

  function findAllSessionFiles(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recurse into subdirectories
          files.push(...findAllSessionFiles(fullPath));
        } else if (entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Directory might not exist or be accessible
    }
    
    return files;
  }

  function parseSessionFile(filePath: string, baseDir: string): SessionData {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    
    const entries: SessionEntry[] = [];
    let messageCount = 0;
    let userMessageCount = 0;
    let toolCallCount = 0;
    let firstTimestamp = Infinity;
    let lastTimestamp = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
        
        if (entry.timestamp) {
          if (entry.timestamp < firstTimestamp) firstTimestamp = entry.timestamp;
          if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
        }
        
        if (entry.type === "message" && entry.message) {
          messageCount++;
          
          if (entry.message.role === "user") {
            userMessageCount++;
          }
          
          if (entry.message.role === "assistant" && entry.message.toolCalls) {
            toolCallCount += entry.message.toolCalls.length;
          }
        }
      } catch (e) {
        // Skip invalid lines
      }
    }

    // Extract project path from directory name
    const relativeDir = filePath.replace(baseDir, "").replace(basename(filePath), "");
    const projectPath = relativeDir.replace(/^--/, "").replace(/--/g, "/").replace(/\/$/, "");

    return {
      fileName: basename(filePath),
      projectPath: projectPath || "unknown",
      entries,
      messageCount,
      userMessageCount,
      toolCallCount,
      duration: lastTimestamp - firstTimestamp,
    };
  }

  function analyzeGlobalSessions(sessions: SessionData[]) {
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const totalUserMessages = sessions.reduce((sum, s) => sum + s.userMessageCount, 0);
    const totalToolCalls = sessions.reduce((sum, s) => sum + s.toolCallCount, 0);
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

    // Group by project
    const projectStats: Record<string, { sessions: number; messages: number }> = {};
    for (const session of sessions) {
      if (!projectStats[session.projectPath]) {
        projectStats[session.projectPath] = { sessions: 0, messages: 0 };
      }
      projectStats[session.projectPath].sessions++;
      projectStats[session.projectPath].messages += session.messageCount;
    }

    // Sort by activity
    const topProjects = Object.entries(projectStats)
      .sort((a, b) => b[1].messages - a[1].messages)
      .slice(0, 10);

    return {
      totalSessions,
      totalMessages,
      totalUserMessages,
      totalToolCalls,
      totalDurationHours: Math.floor(totalDuration / (1000 * 60 * 60)),
      averageMessagesPerSession: totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0,
      topProjects,
    };
  }

  function displayGlobalInsights(analysis: ReturnType<typeof analyzeGlobalSessions>, ctx: ExtensionContext) {
    const lines = [
      "",
      "╔════════════════════════════════════════════════════════════════════╗",
      "║              🌍 Global Insights (All Sessions)                     ║",
      "╚════════════════════════════════════════════════════════════════════╝",
      "",
      `📊 Overall Statistics:`,
      `   • Total sessions: ${analysis.totalSessions}`,
      `   • Total messages: ${analysis.totalMessages}`,
      `   • User messages: ${analysis.totalUserMessages}`,
      `   • Tool calls: ${analysis.totalToolCalls}`,
      `   • Total time: ${analysis.totalDurationHours} hours`,
      `   • Avg messages/session: ${analysis.averageMessagesPerSession}`,
      "",
      `🏆 Top Projects:`,
    ];

    for (let i = 0; i < analysis.topProjects.length; i++) {
      const [project, stats] = analysis.topProjects[i];
      lines.push(`   ${i + 1}. ${project}`);
      lines.push(`      ${stats.sessions} sessions, ${stats.messages} messages`);
    }

    lines.push("");
    lines.push("════════════════════════════════════════════════════════════════════");
    lines.push("");

    ctx.ui.notify(lines.join("\n"), "info");
  }
}
