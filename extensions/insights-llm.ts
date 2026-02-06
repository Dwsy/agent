import type { ExtensionAPI, ExtensionContext, Message, ToolCall, ToolResult } from "@mariozechner/pi-coding-agent";

/**
 * Advanced Insights Extension with LLM Analysis
 * 
 * Provides deep analysis of your conversation patterns using an LLM
 * to identify improvement opportunities and suggest custom workflows.
 * 
 * Usage: /insights-deep
 */

interface ConversationAnalysis {
  summary: string;
  promptQuality: {
    score: number; // 1-10
    strengths: string[];
    weaknesses: string[];
  };
  patterns: {
    repetitiveTasks: string[];
    commonRequests: string[];
    fileTypes: string[];
  };
  efficiencyMetrics: {
    avgTurnsPerTask: number;
    toolUsageRatio: Record<string, number>;
    contextUtilization: "high" | "medium" | "low";
  };
  recommendations: {
    immediate: string[];
    skills: { name: string; description: string; template: string }[];
    templates: { name: string; trigger: string; content: string }[];
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("insights-deep", {
    description: "Deep LLM-powered conversation analysis",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        console.log("Insights command is only available in interactive mode");
        return;
      }

      ctx.ui.setStatus("insights", "🧠 Analyzing with LLM...");

      try {
        const conversationData = extractConversationData(ctx);
        
        if (conversationData.userMessages.length < 3) {
          ctx.ui.notify("Need at least 3 user messages to generate meaningful insights.", "warning");
          return;
        }

        const analysis = await analyzeWithLLM(conversationData, ctx, pi);
        displayDeepInsights(analysis, ctx);

      } catch (error) {
        ctx.ui.notify(`Analysis failed: ${error}`, "error");
      } finally {
        ctx.ui.setStatus("insights", undefined);
      }
    },
  });

  function extractConversationData(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    const userMessages: { text: string; timestamp: number }[] = [];
    const assistantMessages: { text: string; toolCalls: ToolCall[] }[] = [];
    const toolResults: { name: string; success: boolean }[] = [];
    const fileReferences = new Set<string>();

    for (const entry of entries) {
      if (entry.type === "message") {
        const msg = entry.message;
        
        if (msg.role === "user" && Array.isArray(msg.content)) {
          const text = msg.content
            .filter(c => c.type === "text")
            .map(c => c.text)
            .join(" ");
          
          if (text.trim()) {
            userMessages.push({ text, timestamp: entry.timestamp });
            
            // Extract @file references
            const matches = text.match(/@([\w./-]+)/g);
            if (matches) {
              matches.forEach(m => fileReferences.add(m.slice(1)));
            }
          }
        }
        
        if (msg.role === "assistant") {
          const text = Array.isArray(msg.content)
            ? msg.content.filter(c => c.type === "text").map(c => c.text).join(" ")
            : msg.content;
          
          assistantMessages.push({
            text: text.slice(0, 200),
            toolCalls: msg.toolCalls || [],
          });
          
          // Track tool results
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              // Tool results come in the next assistant message or separate
            }
          }
        }

        if (msg.role === "toolResult" && msg.toolName) {
          toolResults.push({
            name: msg.toolName,
            success: !msg.isError,
          });
        }
      }
    }

    // Calculate tool usage
    const toolUsage: Record<string, number> = {};
    for (const tr of toolResults) {
      toolUsage[tr.name] = (toolUsage[tr.name] || 0) + 1;
    }

    return {
      userMessages,
      assistantMessages,
      toolResults,
      toolUsage,
      fileReferences: Array.from(fileReferences),
      totalTurns: userMessages.length,
    };
  }

  async function analyzeWithLLM(
    data: ReturnType<typeof extractConversationData>,
    ctx: ExtensionContext,
    pi: ExtensionAPI
  ): Promise<ConversationAnalysis> {
    // Build analysis prompt
    const analysisPrompt = buildAnalysisPrompt(data);
    
    // Use the current model to analyze
    const model = ctx.model;
    if (!model) {
      throw new Error("No model available for analysis");
    }

    try {
      // Send analysis request
      const response = await model.complete({
        messages: [
          {
            role: "system",
            content: `You are an expert prompt engineer analyzing coding assistant conversations. 
Provide detailed, actionable insights in JSON format only.

Respond with a JSON object matching this structure:
{
  "summary": "Brief overview of the conversation pattern",
  "promptQuality": {
    "score": 7,
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"]
  },
  "patterns": {
    "repetitiveTasks": ["task1", "task2"],
    "commonRequests": ["request1", "request2"],
    "fileTypes": [".ts", ".js"]
  },
  "efficiencyMetrics": {
    "avgTurnsPerTask": 3.5,
    "toolUsageRatio": {"read": 10, "edit": 5},
    "contextUtilization": "high"
  },
  "recommendations": {
    "immediate": ["action1", "action2"],
    "skills": [
      {"name": "skill-name", "description": "What it does", "template": "Prompt template"}
    ],
    "templates": [
      {"name": "template-name", "trigger": "/trigger", "content": "Template content"}
    ]
  }
}`,
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.3,
      });

      const content = response.content[0]?.text || "";
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ConversationAnalysis;
      }
      
      throw new Error("Could not parse analysis response");
    } catch (error) {
      // Fallback to local analysis if LLM fails
      return generateFallbackAnalysis(data);
    }
  }

  function buildAnalysisPrompt(data: ReturnType<typeof extractConversationData>): string {
    const recentMessages = data.userMessages.slice(-10);
    
    return `Analyze this coding assistant conversation and provide insights:

CONVERSATION STATISTICS:
- Total user messages: ${data.userMessages.length}
- Tool interactions: ${Object.entries(data.toolUsage).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Files referenced: ${data.fileReferences.join(", ") || "None"}

RECENT USER MESSAGES:
${recentMessages.map((m, i) => `${i + 1}. ${m.text.slice(0, 150)}${m.text.length > 150 ? "..." : ""}`).join("\n")}

Analyze:
1. What types of tasks is the user primarily doing?
2. What patterns indicate inefficient prompting?
3. What repetitive tasks could be automated with skills/templates?
4. How could the user improve their workflow?

Provide your analysis in the required JSON format.`;
  }

  function generateFallbackAnalysis(
    data: ReturnType<typeof extractConversationData>
  ): ConversationAnalysis {
    // Simple heuristic-based fallback
    const texts = data.userMessages.map(m => m.text.toLowerCase());
    
    const hasCodeRequests = texts.some(t => t.includes("code") || t.includes("function"));
    const hasDebugRequests = texts.some(t => t.includes("fix") || t.includes("error") || t.includes("bug"));
    const hasExplainRequests = texts.some(t => t.includes("explain") || t.includes("how") || t.includes("what"));
    
    const fileExts = new Set<string>();
    for (const f of data.fileReferences) {
      const ext = f.match(/\.\w+$/)?.[0];
      if (ext) fileExts.add(ext);
    }

    return {
      summary: `Conversation with ${data.userMessages.length} messages focusing on ${hasCodeRequests ? "coding" : "general"} tasks.`,
      promptQuality: {
        score: 6,
        strengths: ["Engaging with the assistant regularly"],
        weaknesses: ["Could provide more context in prompts"],
      },
      patterns: {
        repetitiveTasks: hasDebugRequests ? ["Debugging errors"] : [],
        commonRequests: [
          ...(hasCodeRequests ? ["Code generation"] : []),
          ...(hasExplainRequests ? ["Explanations"] : []),
        ],
        fileTypes: Array.from(fileExts),
      },
      efficiencyMetrics: {
        avgTurnsPerTask: data.totalTurns / Math.max(1, data.assistantMessages.length),
        toolUsageRatio: data.toolUsage,
        contextUtilization: data.fileReferences.length > 3 ? "high" : "medium",
      },
      recommendations: {
        immediate: [
          "Use @file references more consistently",
          "Break complex tasks into smaller prompts",
        ],
        skills: [],
        templates: [],
      },
    };
  }

  function displayDeepInsights(analysis: ConversationAnalysis, ctx: ExtensionContext): void {
    const scoreColor = analysis.promptQuality.score >= 8 ? "🟢" : 
                       analysis.promptQuality.score >= 5 ? "🟡" : "🔴";
    
    const lines: string[] = [
      "",
      "╔════════════════════════════════════════════════════════════════════╗",
      "║              🧠 Deep Conversation Analysis                         ║",
      "╚════════════════════════════════════════════════════════════════════╝",
      "",
      `📊 Summary: ${analysis.summary}`,
      "",
      `⭐ Prompt Quality Score: ${scoreColor} ${analysis.promptQuality.score}/10`,
      "",
    ];

    if (analysis.promptQuality.strengths.length > 0) {
      lines.push("✅ Strengths:");
      for (const s of analysis.promptQuality.strengths) {
        lines.push(`   • ${s}`);
      }
      lines.push("");
    }

    if (analysis.promptQuality.weaknesses.length > 0) {
      lines.push("⚠️ Areas to improve:");
      for (const w of analysis.promptQuality.weaknesses) {
        lines.push(`   • ${w}`);
      }
      lines.push("");
    }

    // Patterns
    if (analysis.patterns.repetitiveTasks.length > 0) {
      lines.push("🔄 Repetitive tasks detected:");
      for (const task of analysis.patterns.repetitiveTasks) {
        lines.push(`   • ${task}`);
      }
      lines.push("");
    }

    // Efficiency
    lines.push(`📈 Efficiency Metrics:`);
    lines.push(`   • Context utilization: ${analysis.efficiencyMetrics.contextUtilization}`);
    lines.push(`   • Average turns per task: ${analysis.efficiencyMetrics.avgTurnsPerTask.toFixed(1)}`);
    lines.push("");

    // Immediate recommendations
    if (analysis.recommendations.immediate.length > 0) {
      lines.push("💡 Quick wins:");
      for (let i = 0; i < analysis.recommendations.immediate.length; i++) {
        lines.push(`   ${i + 1}. ${analysis.recommendations.immediate[i]}`);
      }
      lines.push("");
    }

    // Suggested skills
    if (analysis.recommendations.skills.length > 0) {
      lines.push("🔧 Suggested Skills to Create:");
      for (const skill of analysis.recommendations.skills) {
        lines.push(`   • ${skill.name}: ${skill.description}`);
        lines.push(`     Template: ${skill.template.slice(0, 60)}...`);
      }
      lines.push("");
      lines.push("   Create: mkdir -p ~/.pi/agent/skills/<name> && cat > ~/.pi/agent/skills/<name>/SKILL.md");
      lines.push("");
    }

    // Suggested templates
    if (analysis.recommendations.templates.length > 0) {
      lines.push("📝 Suggested Prompt Templates:");
      for (const tmpl of analysis.recommendations.templates) {
        lines.push(`   • ${tmpl.trigger} — ${tmpl.name}`);
      }
      lines.push("");
      lines.push('   Create: echo "content" > ~/.pi/agent/prompts/<name>.md');
      lines.push("");
    }

    lines.push("════════════════════════════════════════════════════════════════════");
    lines.push("Run /insights for quick stats, /insights-deep for LLM analysis");
    lines.push("");

    ctx.ui.notify(lines.join("\n"), "info");
  }
}
