import type { ExtensionAPI, ExtensionContext, Message } from "@mariozechner/pi-coding-agent";

/**
 * Insights Extension for pi
 * 
 * Analyzes your conversation patterns and provides actionable suggestions
 * to improve your prompting and workflow, similar to Claude Code's /insights.
 * 
 * Usage: /insights
 */

interface PromptPattern {
  type: "repetitive" | "vague" | "verbose" | "efficient" | "creative";
  description: string;
  examples: string[];
  suggestion: string;
}

interface ToolUsagePattern {
  tool: string;
  count: number;
  efficiency: "high" | "medium" | "low";
  suggestion?: string;
}

interface InsightSummary {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  patterns: PromptPattern[];
  toolUsage: ToolUsagePattern[];
  recommendations: string[];
  suggestedCommands: { name: string; description: string }[];
}

export default function (pi: ExtensionAPI) {
  // Store analysis state per session
  const sessionAnalyses = new Map<string, InsightSummary>();

  pi.registerCommand("insights", {
    description: "Analyze conversation patterns and get improvement suggestions",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        console.log("Insights command is only available in interactive mode");
        return;
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      const sessionKey = sessionFile || "ephemeral";

      ctx.ui.setStatus("insights", "🔍 Analyzing conversation patterns...");

      try {
        // Analyze the conversation
        const analysis = await analyzeConversation(ctx);
        sessionAnalyses.set(sessionKey, analysis);

        // Display insights
        displayInsights(analysis, ctx);

      } catch (error) {
        ctx.ui.notify(`Failed to generate insights: ${error}`, "error");
      } finally {
        ctx.ui.setStatus("insights", undefined);
      }
    },
  });

  async function analyzeConversation(ctx: ExtensionContext): Promise<InsightSummary> {
    const entries = ctx.sessionManager.getBranch();
    const messages: Message[] = [];
    let toolCallCount = 0;
    const toolUsage = new Map<string, number>();

    for (const entry of entries) {
      if (entry.type === "message") {
        messages.push(entry.message);
        
        if (entry.message.role === "assistant" && entry.message.toolCalls) {
          toolCallCount += entry.message.toolCalls.length;
          for (const tc of entry.message.toolCalls) {
            toolUsage.set(tc.name, (toolUsage.get(tc.name) || 0) + 1);
          }
        }
      }
    }

    const userMessages = messages.filter(m => m.role === "user");
    const assistantMessages = messages.filter(m => m.role === "assistant");

    // Analyze patterns
    const patterns = detectPatterns(userMessages);
    
    // Analyze tool usage
    const toolPatterns = analyzeToolUsage(toolUsage, toolCallCount);
    
    // Generate recommendations
    const recommendations = generateRecommendations(patterns, toolPatterns, messages.length);
    
    // Suggest custom commands
    const suggestedCommands = suggestCustomCommands(patterns, userMessages);

    return {
      totalMessages: messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      toolCalls: toolCallCount,
      patterns,
      toolUsage: toolPatterns,
      recommendations,
      suggestedCommands,
    };
  }

  function detectPatterns(userMessages: Message[]): PromptPattern[] {
    const patterns: PromptPattern[] = [];
    const texts = userMessages
      .filter(m => Array.isArray(m.content))
      .flatMap(m => m.content.filter(c => c.type === "text").map(c => c.text));

    if (texts.length === 0) return patterns;

    // Check for repetitive patterns
    const commonPrefixes = findCommonPrefixes(texts);
    if (commonPrefixes.length > 0) {
      const examples = commonPrefixes.slice(0, 3);
      patterns.push({
        type: "repetitive",
        description: `You often start prompts with similar phrases`,
        examples,
        suggestion: "Consider creating a custom prompt template or skill for these repetitive tasks",
      });
    }

    // Check for vague prompts
    const vagueWords = ["help", "fix", "do", "something", "stuff", "thing"];
    const vaguePrompts = texts.filter(t => 
      vagueWords.some(w => t.toLowerCase().split(/\s+/).includes(w)) && 
      t.length < 50
    );
    if (vaguePrompts.length > 2) {
      patterns.push({
        type: "vague",
        description: "Several prompts were quite vague or short",
        examples: vaguePrompts.slice(0, 3),
        suggestion: "Try to be more specific: include file paths, error messages, or expected outcomes",
      });
    }

    // Check for verbose prompts
    const verbosePrompts = texts.filter(t => t.length > 500);
    if (verbosePrompts.length > 0) {
      patterns.push({
        type: "verbose",
        description: "Some prompts were quite long",
        examples: verbosePrompts.slice(0, 2).map(t => t.slice(0, 100) + "..."),
        suggestion: "Consider breaking complex requests into smaller, focused prompts",
      });
    }

    // Check for efficient prompts (with context)
    const efficientPrompts = texts.filter(t => 
      t.includes("@") || t.includes("file") || t.includes("code") || t.length > 100
    );
    if (efficientPrompts.length > 3) {
      patterns.push({
        type: "efficient",
        description: "You provide good context in your prompts",
        examples: [],
        suggestion: "Great job! Keep including relevant files and specific details",
      });
    }

    return patterns;
  }

  function findCommonPrefixes(texts: string[]): string[] {
    const prefixes = new Map<string, number>();
    
    for (const text of texts) {
      const words = text.split(/\s+/).slice(0, 5);
      for (let i = 2; i <= words.length; i++) {
        const prefix = words.slice(0, i).join(" ");
        prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
      }
    }

    return Array.from(prefixes.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([prefix]) => prefix);
  }

  function analyzeToolUsage(
    toolUsage: Map<string, number>, 
    totalCalls: number
  ): ToolUsagePattern[] {
    const patterns: ToolUsagePattern[] = [];
    
    toolUsage.forEach((count, tool) => {
      let efficiency: "high" | "medium" | "low" = "medium";
      let suggestion: string | undefined;

      if (tool === "bash") {
        if (count > totalCalls * 0.5) {
          efficiency = "low";
          suggestion = "Consider using file references (@) instead of ls/cat commands";
        } else {
          efficiency = "high";
        }
      } else if (tool === "read" || tool === "edit" || tool === "write") {
        efficiency = "high";
      } else if (tool === "grep" || tool === "find") {
        efficiency = "medium";
        suggestion = "For complex searches, consider creating a skill with predefined patterns";
      }

      patterns.push({ tool, count, efficiency, suggestion });
    });

    return patterns.sort((a, b) => b.count - a.count);
  }

  function generateRecommendations(
    patterns: PromptPattern[],
    toolPatterns: ToolUsagePattern[],
    totalMessages: number
  ): string[] {
    const recommendations: string[] = [];

    // Based on conversation length
    if (totalMessages > 50) {
      recommendations.push("This is a long session. Consider using /compact to manage context window");
    }

    // Based on patterns
    for (const pattern of patterns) {
      if (pattern.type === "repetitive") {
        recommendations.push(`Create a custom skill for "${pattern.examples[0]}" tasks to save time`);
      }
      if (pattern.type === "vague") {
        recommendations.push("Be more specific: mention file paths, expected behavior, and error messages");
      }
    }

    // Based on tool usage
    const bashUsage = toolPatterns.find(t => t.tool === "bash");
    if (bashUsage && bashUsage.efficiency === "low") {
      recommendations.push("Use @file references instead of cat/ls commands for better efficiency");
    }

    // Always include some general advice
    if (recommendations.length < 3) {
      recommendations.push("Use /tree to navigate conversation history and jump to previous points");
      recommendations.push("Try different thinking levels (Shift+Tab) for complex vs simple tasks");
    }

    return recommendations.slice(0, 5);
  }

  function suggestCustomCommands(
    patterns: PromptPattern[],
    userMessages: Message[]
  ): { name: string; description: string }[] {
    const suggestions: { name: string; description: string }[] = [];

    // Analyze common task types
    const texts = userMessages
      .filter(m => Array.isArray(m.content))
      .flatMap(m => m.content.filter(c => c.type === "text").map(c => c.text.toLowerCase()));

    const taskTypes = [
      { keywords: ["refactor", "clean", "improve"], name: "refactor", desc: "Code refactoring tasks" },
      { keywords: ["test", "spec", "unit test"], name: "test", desc: "Test creation and updates" },
      { keywords: ["fix", "bug", "error", "issue"], name: "fix", desc: "Bug fixes" },
      { keywords: ["review", "check", "look at"], name: "review", desc: "Code reviews" },
      { keywords: ["explain", "how", "what"], name: "explain", desc: "Explanations and docs" },
    ];

    for (const taskType of taskTypes) {
      const matches = texts.filter(t => 
        taskType.keywords.some(k => t.includes(k))
      ).length;
      
      if (matches >= 3) {
        suggestions.push({
          name: taskType.name,
          description: taskType.desc,
        });
      }
    }

    return suggestions.slice(0, 3);
  }

  function displayInsights(analysis: InsightSummary, ctx: ExtensionContext): void {
    const lines: string[] = [
      "",
      "╔══════════════════════════════════════════════════════════════╗",
      "║                    📊 Conversation Insights                  ║",
      "╚══════════════════════════════════════════════════════════════╝",
      "",
      `📈 Statistics:`,
      `   • Total messages: ${analysis.totalMessages}`,
      `   • Your messages: ${analysis.userMessages}`,
      `   • Assistant responses: ${analysis.assistantMessages}`,
      `   • Tool calls: ${analysis.toolCalls}`,
      "",
    ];

    // Patterns
    if (analysis.patterns.length > 0) {
      lines.push(`🔍 Patterns detected:`);
      for (const pattern of analysis.patterns) {
        const icon = pattern.type === "efficient" ? "✅" : 
                     pattern.type === "vague" ? "⚠️" : 
                     pattern.type === "repetitive" ? "🔄" : "💡";
        lines.push(`   ${icon} ${pattern.description}`);
        if (pattern.examples.length > 0) {
          lines.push(`      Examples: "${pattern.examples[0].slice(0, 60)}${pattern.examples[0].length > 60 ? '...' : ''}"`);
        }
        lines.push(`      💡 ${pattern.suggestion}`);
        lines.push("");
      }
    }

    // Tool usage
    if (analysis.toolUsage.length > 0) {
      lines.push(`🛠️ Tool usage:`);
      for (const tool of analysis.toolUsage.slice(0, 5)) {
        const icon = tool.efficiency === "high" ? "🟢" : 
                     tool.efficiency === "medium" ? "🟡" : "🔴";
        lines.push(`   ${icon} ${tool.tool}: ${tool.count} calls`);
        if (tool.suggestion) {
          lines.push(`      → ${tool.suggestion}`);
        }
      }
      lines.push("");
    }

    // Recommendations
    if (analysis.recommendations.length > 0) {
      lines.push(`💡 Recommendations:`);
      for (let i = 0; i < analysis.recommendations.length; i++) {
        lines.push(`   ${i + 1}. ${analysis.recommendations[i]}`);
      }
      lines.push("");
    }

    // Suggested commands
    if (analysis.suggestedCommands.length > 0) {
      lines.push(`📋 Consider creating these custom commands:`);
      for (const cmd of analysis.suggestedCommands) {
        lines.push(`   • /${cmd.name} — ${cmd.description}`);
      }
      lines.push("");
      lines.push(`   Create with: echo "Your prompt here" > ~/.pi/agent/prompts/<name>.md`);
      lines.push("");
    }

    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");

    ctx.ui.notify(lines.join("\n"), "info");
  }
}
