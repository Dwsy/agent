import type { ExtensionAPI, ExtensionContext, Message, ToolCall } from "@mariozechner/pi-coding-agent";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Insights Report Extension for pi
 * 
 * Generates a shareable HTML report analyzing your conversation patterns,
 * similar to Claude Code's /insights command.
 * 
 * Usage: /insights-report
 */

interface FileTypeStats {
  extension: string;
  count: number;
  category: "code" | "doc" | "config" | "data" | "other";
}

interface LanguageStats {
  language: string;
  files: number;
  percentage: number;
}

interface TaskCategory {
  name: string;
  count: number;
  description: string;
}

interface ResponseTimeBucket {
  range: string;
  count: number;
  percentage: number;
}

interface InsightReport {
  generatedAt: string;
  sessionName: string;
  summary: {
    totalMessages: number;
    totalTurns: number;
    sessionDuration: string;
    toolCalls: number;
    filesReferenced: number;
  };
  workContent: {
    topTasks: TaskCategory[];
    fileTypes: FileTypeStats[];
    languages: LanguageStats[];
  };
  usagePatterns: {
    responseTimeDistribution: ResponseTimeBucket[];
    commonPatterns: string[];
    toolUsage: Record<string, number>;
  };
  strengths: string[];
  problemAreas: string[];
  recommendations: {
    features: string[];
    skills: { name: string; description: string }[];
    claudeMdAdditions: string[];
  };
  futurePossibilities: string[];
  overallAssessment: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("insights-report", {
    description: "Generate a shareable HTML insights report",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        console.log("Insights report command is only available in interactive mode");
        return;
      }

      ctx.ui.setStatus("insights", "📊 Generating insights report...");

      try {
        // Collect and analyze data
        const report = await generateReport(ctx);
        
        // Generate HTML
        const html = generateHTMLReport(report);
        
        // Save to file
        const reportDir = join(homedir(), ".pi", "agent", "insights-reports");
        if (!existsSync(reportDir)) {
          mkdirSync(reportDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const reportPath = join(reportDir, `insights-report-${timestamp}.html`);
        writeFileSync(reportPath, html, "utf-8");
        
        // Display success
        const displayPath = `file://${reportPath}`;
        const lines = [
          "",
          "╔════════════════════════════════════════════════════════════════╗",
          "║              📊 Insights Report Generated!                     ║",
          "╚════════════════════════════════════════════════════════════════╝",
          "",
          `✅ Your shareable insights report is ready:`,
          "",
          `   ${displayPath}`,
          "",
          "📈 Report includes:",
          "   • Work content analysis",
          "   • Usage patterns & trends",
          "   • Strengths & improvement areas",
          "   • Personalized recommendations",
          "   • Future possibilities",
          "",
          "🌐 Open the file in your browser to view the full report.",
          "",
        ];
        
        ctx.ui.notify(lines.join("\n"), "info");
        
        // Also append a clickable link message
        ctx.ui.notify(`Report saved: ${reportPath}`, "success");
        
        // Generate improvement plan
        const planPath = await generateImprovementPlan(report, reportDir, timestamp);
        
        // Display the improvement plan content directly in UI
        const planContent = buildImprovementPlan(report, timestamp);
        const planLines = [
          "",
          "╔════════════════════════════════════════════════════════════════╗",
          "║           📋 Improvement Plan (Markdown Report)                ║",
          "╚════════════════════════════════════════════════════════════════╝",
          "",
          ...planContent.split("\n").slice(0, 80), // Show first 80 lines
          "",
          "... (truncated for display)",
          "",
          `📁 Full plan saved to: file://${planPath}`,
          "",
          "═══════════════════════════════════════════════════════════════════",
          "",
        ];
        ctx.ui.notify(planLines.join("\n"), "info");

      } catch (error) {
        ctx.ui.notify(`Failed to generate report: ${error}`, "error");
      } finally {
        ctx.ui.setStatus("insights", undefined);
      }
    },
  });

  async function generateReport(ctx: ExtensionContext): Promise<InsightReport> {
    const entries = ctx.sessionManager.getBranch();
    const sessionName = pi.getSessionName() || "Unnamed Session";
    
    // Collect message data
    const userMessages: { text: string; timestamp: number }[] = [];
    const assistantMessages: { timestamp: number; toolCalls?: ToolCall[] }[] = [];
    const fileReferences = new Set<string>();
    const toolUsage: Record<string, number> = {};
    let totalToolCalls = 0;
    
    let firstTimestamp = Infinity;
    let lastTimestamp = 0;

    for (const entry of entries) {
      if (entry.timestamp < firstTimestamp) firstTimestamp = entry.timestamp;
      if (entry.timestamp > lastTimestamp) lastTimestamp = entry.timestamp;
      
      if (entry.type === "message") {
        const msg = entry.message;
        
        if (msg.role === "user" && Array.isArray(msg.content)) {
          const text = msg.content
            .filter(c => c.type === "text")
            .map(c => c.text)
            .join(" ");
          
          if (text.trim()) {
            userMessages.push({ text, timestamp: entry.timestamp });
            
            // Extract file references
            const matches = text.match(/@([\w.\-\/\\]+)/g);
            if (matches) {
              matches.forEach(m => fileReferences.add(m.slice(1)));
            }
          }
        }
        
        if (msg.role === "assistant") {
          assistantMessages.push({
            timestamp: entry.timestamp,
            toolCalls: msg.toolCalls,
          });
          
          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              toolUsage[tc.name] = (toolUsage[tc.name] || 0) + 1;
              totalToolCalls++;
            }
          }
        }
      }
    }

    // Calculate duration
    const durationMs = lastTimestamp - firstTimestamp;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const sessionDuration = durationHours > 0 
      ? `${durationHours}h ${durationMinutes}m` 
      : `${durationMinutes}m`;

    // Analyze file types
    const fileTypes = analyzeFileTypes(fileReferences);
    
    // Analyze languages
    const languages = analyzeLanguages(fileReferences);
    
    // Detect top tasks
    const topTasks = detectTopTasks(userMessages);
    
    // Calculate response time distribution
    const responseTimeDistribution = calculateResponseTimeDistribution(userMessages, assistantMessages);
    
    // Detect common patterns
    const commonPatterns = detectCommonPatterns(userMessages);
    
    // Generate strengths
    const strengths = generateStrengths(fileReferences.size, toolUsage, userMessages);
    
    // Generate problem areas
    const problemAreas = generateProblemAreas(userMessages, toolUsage);
    
    // Generate recommendations
    const recommendations = generateRecommendations(topTasks, fileTypes, problemAreas);
    
    // Generate future possibilities
    const futurePossibilities = generateFuturePossibilities(topTasks);
    
    // Overall assessment
    const overallAssessment = generateOverallAssessment(userMessages.length, fileReferences.size, strengths.length, problemAreas.length);

    return {
      generatedAt: new Date().toISOString(),
      sessionName,
      summary: {
        totalMessages: entries.length,
        totalTurns: userMessages.length,
        sessionDuration,
        toolCalls: totalToolCalls,
        filesReferenced: fileReferences.size,
      },
      workContent: {
        topTasks,
        fileTypes,
        languages,
      },
      usagePatterns: {
        responseTimeDistribution,
        commonPatterns,
        toolUsage,
      },
      strengths,
      problemAreas,
      recommendations,
      futurePossibilities,
      overallAssessment,
    };
  }

  function analyzeFileTypes(files: Set<string>): FileTypeStats[] {
    const extensions: Record<string, { count: number; category: FileTypeStats["category"] }> = {};
    
    const codeExts = [".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".swift", ".kt", ".scala", ".rb", ".php"];
    const docExts = [".md", ".txt", ".rst", ".adoc"];
    const configExts = [".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".config"];
    const dataExts = [".csv", ".xml", ".sql", ".db"];
    
    for (const file of files) {
      const ext = file.match(/\.\w+$/)?.[0]?.toLowerCase() || "no-extension";
      
      let category: FileTypeStats["category"] = "other";
      if (codeExts.includes(ext)) category = "code";
      else if (docExts.includes(ext)) category = "doc";
      else if (configExts.includes(ext)) category = "config";
      else if (dataExts.includes(ext)) category = "data";
      
      if (!extensions[ext]) {
        extensions[ext] = { count: 0, category };
      }
      extensions[ext].count++;
    }
    
    return Object.entries(extensions)
      .map(([ext, data]) => ({
        extension: ext,
        count: data.count,
        category: data.category,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  function analyzeLanguages(files: Set<string>): LanguageStats[] {
    const langMap: Record<string, string[]> = {
      "TypeScript": [".ts", ".tsx"],
      "JavaScript": [".js", ".jsx", ".mjs", ".cjs"],
      "Python": [".py", ".pyw", ".pyi"],
      "Java": [".java"],
      "Go": [".go"],
      "Rust": [".rs"],
      "C/C++": [".c", ".cpp", ".h", ".hpp", ".cc"],
      "Swift": [".swift"],
      "Kotlin": [".kt", ".kts"],
      "Ruby": [".rb"],
      "PHP": [".php"],
      "Markdown": [".md", ".markdown"],
      "JSON": [".json"],
      "YAML": [".yaml", ".yml"],
      "HTML": [".html", ".htm"],
      "CSS": [".css", ".scss", ".sass", ".less"],
    };
    
    const langCounts: Record<string, number> = {};
    let total = 0;
    
    for (const file of files) {
      const ext = file.match(/\.\w+$/)?.[0]?.toLowerCase();
      if (ext) {
        for (const [lang, exts] of Object.entries(langMap)) {
          if (exts.includes(ext)) {
            langCounts[lang] = (langCounts[lang] || 0) + 1;
            total++;
            break;
          }
        }
      }
    }
    
    return Object.entries(langCounts)
      .map(([language, files]) => ({
        language,
        files,
        percentage: Math.round((files / total) * 100),
      }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 8);
  }

  function detectTopTasks(userMessages: { text: string }[]): TaskCategory[] {
    const texts = userMessages.map(m => m.text.toLowerCase());
    
    const taskKeywords: Record<string, { keywords: string[]; description: string }> = {
      "Code Review": {
        keywords: ["review", "check", "look at", "examine", "inspect"],
        description: "Reviewing and examining code",
      },
      "Bug Fixing": {
        keywords: ["fix", "bug", "error", "issue", "problem", "broken", "not working"],
        description: "Debugging and fixing issues",
      },
      "Refactoring": {
        keywords: ["refactor", "clean up", "improve", "optimize", "restructure"],
        description: "Improving code structure",
      },
      "Feature Development": {
        keywords: ["add", "create", "implement", "build", "develop", "new feature"],
        description: "Building new functionality",
      },
      "Documentation": {
        keywords: ["document", "doc", "readme", "comment", "explain"],
        description: "Writing documentation",
      },
      "Testing": {
        keywords: ["test", "spec", "unit test", "integration test", "jest", "pytest"],
        description: "Creating and running tests",
      },
      "Configuration": {
        keywords: ["config", "setup", "install", "configure", "setting"],
        description: "Setting up and configuring",
      },
    };
    
    const taskCounts: Record<string, { count: number; description: string }> = {};
    
    for (const text of texts) {
      for (const [task, data] of Object.entries(taskKeywords)) {
        if (data.keywords.some(k => text.includes(k))) {
          if (!taskCounts[task]) {
            taskCounts[task] = { count: 0, description: data.description };
          }
          taskCounts[task].count++;
        }
      }
    }
    
    return Object.entries(taskCounts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        description: data.description,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  function calculateResponseTimeDistribution(
    userMessages: { timestamp: number }[],
    assistantMessages: { timestamp: number }[]
  ): ResponseTimeBucket[] {
    const responseTimes: number[] = [];
    
    for (let i = 0; i < userMessages.length && i < assistantMessages.length; i++) {
      const responseTime = assistantMessages[i].timestamp - userMessages[i].timestamp;
      if (responseTime > 0 && responseTime < 300000) { // Ignore outliers > 5 min
        responseTimes.push(responseTime);
      }
    }
    
    const buckets = [
      { range: "< 10s", max: 10000, count: 0 },
      { range: "10-30s", max: 30000, count: 0 },
      { range: "30-60s", max: 60000, count: 0 },
      { range: "1-2m", max: 120000, count: 0 },
      { range: "> 2m", max: Infinity, count: 0 },
    ];
    
    for (const rt of responseTimes) {
      for (const bucket of buckets) {
        if (rt < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }
    
    const total = responseTimes.length || 1;
    
    return buckets.map(b => ({
      range: b.range,
      count: b.count,
      percentage: Math.round((b.count / total) * 100),
    }));
  }

  function detectCommonPatterns(userMessages: { text: string }[]): string[] {
    const patterns: string[] = [];
    const texts = userMessages.map(m => m.text.toLowerCase());
    
    // Check for file reference patterns
    const fileRefCount = texts.filter(t => t.includes("@")).length;
    if (fileRefCount > texts.length * 0.5) {
      patterns.push("Frequently uses @file references for context");
    }
    
    // Check for specific instruction patterns
    const hasSpecificInstructions = texts.filter(t => 
      t.includes("step") || t.includes("first") || t.includes("then")
    ).length;
    if (hasSpecificInstructions > 3) {
      patterns.push("Provides step-by-step instructions");
    }
    
    // Check for question patterns
    const questionCount = texts.filter(t => t.includes("?")).length;
    if (questionCount > texts.length * 0.3) {
      patterns.push("Asks clarifying questions");
    }
    
    // Check for context-rich prompts
    const contextRichCount = texts.filter(t => t.length > 200).length;
    if (contextRichCount > texts.length * 0.3) {
      patterns.push("Provides detailed context in prompts");
    }
    
    return patterns.length > 0 ? patterns : ["Developing communication patterns"];
  }

  function generateStrengths(
    fileRefCount: number,
    toolUsage: Record<string, number>,
    userMessages: { text: string }[]
  ): string[] {
    const strengths: string[] = [];
    
    if (fileRefCount > 5) {
      strengths.push("Consistently provides file context using @ references");
    }
    
    if (toolUsage["read"] && toolUsage["read"] > 10) {
      strengths.push("Thoroughly reads code before making changes");
    }
    
    if (toolUsage["edit"] && toolUsage["write"]) {
      const editRatio = toolUsage["edit"] / (toolUsage["write"] || 1);
      if (editRatio > 0.5) {
        strengths.push("Prefers editing existing files over creating new ones");
      }
    }
    
    const avgLength = userMessages.reduce((sum, m) => sum + m.text.length, 0) / userMessages.length;
    if (avgLength > 100) {
      strengths.push("Provides detailed, context-rich prompts");
    }
    
    return strengths.length > 0 ? strengths : ["Building good coding assistant habits"];
  }

  function generateProblemAreas(
    userMessages: { text: string }[],
    toolUsage: Record<string, number>
  ): string[] {
    const problems: string[] = [];
    const texts = userMessages.map(m => m.text);
    
    // Check for vague prompts
    const vagueCount = texts.filter(t => 
      t.length < 30 && !t.includes("@")
    ).length;
    if (vagueCount > 3) {
      problems.push("Some prompts are quite short and lack context");
    }
    
    // Check for excessive bash usage
    if (toolUsage["bash"] && toolUsage["bash"] > (toolUsage["read"] || 0) * 2) {
      problems.push("Heavy reliance on bash commands; consider using @file references");
    }
    
    // Check for repetitive patterns
    const startsWithCan = texts.filter(t => 
      t.toLowerCase().startsWith("can you") || t.toLowerCase().startsWith("could you")
    ).length;
    if (startsWithCan > texts.length * 0.5) {
      problems.push("Repetitive prompt structure; consider custom templates");
    }
    
    return problems.length > 0 ? problems : ["No major issues detected; keep refining your workflow"];
  }

  function generateRecommendations(
    topTasks: TaskCategory[],
    fileTypes: FileTypeStats[],
    problemAreas: string[]
  ): InsightReport["recommendations"] {
    const features: string[] = [];
    const skills: { name: string; description: string }[] = [];
    const claudeMdAdditions: string[] = [];
    
    // Feature recommendations
    if (topTasks.some(t => t.name === "Code Review")) {
      features.push("Try creating a /review prompt template for consistent code reviews");
      skills.push({
        name: "code-review",
        description: "Structured code review with checklist",
      });
    }
    
    if (topTasks.some(t => t.name === "Bug Fixing")) {
      features.push("Create a /fix template with structured debugging steps");
      skills.push({
        name: "debug-helper",
        description: "Systematic debugging and issue resolution",
      });
    }
    
    if (fileTypes.some(f => f.category === "doc")) {
      features.push("Consider using skills for documentation generation");
    }
    
    features.push("Use /compact for long sessions to manage context window");
    features.push("Try /tree to navigate conversation history");
    
    // CLAUDE.md suggestions
    if (problemAreas.some(p => p.includes("context"))) {
      claudeMdAdditions.push("Add preferred file structure and naming conventions");
    }
    
    if (topTasks.length > 0) {
      claudeMdAdditions.push(`Document common ${topTasks[0].name.toLowerCase()} patterns`);
    }
    
    claudeMdAdditions.push("Include project-specific terminology and abbreviations");
    
    return { features, skills, claudeMdAdditions };
  }

  function generateFuturePossibilities(topTasks: TaskCategory[]): string[] {
    const possibilities: string[] = [
      "Create custom hooks for pre/post tool execution",
      "Build extension for automated testing after edits",
      "Set up git checkpointing before major changes",
    ];
    
    if (topTasks.some(t => t.name === "Feature Development")) {
      possibilities.push("Develop a scaffold generator for new features");
    }
    
    if (topTasks.some(t => t.name === "Testing")) {
      possibilities.push("Create auto-test runner that triggers after file edits");
    }
    
    possibilities.push("Build custom theme matching your IDE preferences");
    possibilities.push("Create project-specific prompt templates shared with your team");
    
    return possibilities;
  }

  function generateOverallAssessment(
    messageCount: number,
    fileRefCount: number,
    strengthCount: number,
    problemCount: number
  ): string {
    if (messageCount < 10) {
      return "You're getting started with pi. As you use it more, insights will help you develop effective patterns.";
    }
    
    if (fileRefCount > 10 && strengthCount > problemCount) {
      return "You're developing strong habits with pi. You consistently provide context and use tools effectively. Keep refining your workflow with custom templates and skills.";
    }
    
    if (problemCount > strengthCount) {
      return "There's room for improvement in your pi workflow. Focus on providing more context and using @file references. Check the recommendations section for specific tips.";
    }
    
    return "You're building a solid workflow with pi. Continue developing your habits and consider creating custom templates for your most common tasks.";
  }

  function generateHTMLReport(report: InsightReport): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi Insights Report - ${escapeHtml(report.sessionName)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #e0e0e0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        
        header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        header .subtitle {
            color: #888;
            font-size: 1.1rem;
        }
        
        header .timestamp {
            color: #666;
            font-size: 0.9rem;
            margin-top: 10px;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .card h2 {
            color: #fff;
            margin-bottom: 16px;
            font-size: 1.4rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .card h3 {
            color: #bbb;
            margin: 20px 0 12px 0;
            font-size: 1.1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-top: 16px;
        }
        
        .stat-item {
            background: rgba(255, 255, 255, 0.05);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            color: #888;
            font-size: 0.9rem;
            margin-top: 4px;
        }
        
        .task-list, .file-list, .pattern-list {
            list-style: none;
        }
        
        .task-list li, .file-list li, .pattern-list li {
            padding: 12px;
            margin-bottom: 8px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border-left: 3px solid #667eea;
        }
        
        .task-name {
            font-weight: 600;
            color: #fff;
        }
        
        .task-desc {
            color: #888;
            font-size: 0.9rem;
        }
        
        .task-count {
            float: right;
            background: #667eea;
            color: white;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.85rem;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        
        .badge-code { background: rgba(102, 126, 234, 0.3); color: #a8b5f0; }
        .badge-doc { background: rgba(118, 75, 162, 0.3); color: #c5a8e0; }
        .badge-config { background: rgba(56, 189, 248, 0.3); color: #7dd3fc; }
        .badge-data { background: rgba(34, 197, 94, 0.3); color: #86efac; }
        .badge-other { background: rgba(156, 163, 175, 0.3); color: #d1d5db; }
        
        .strength {
            border-left-color: #22c55e;
        }
        
        .problem {
            border-left-color: #ef4444;
        }
        
        .recommendation {
            border-left-color: #f59e0b;
        }
        
        .future {
            border-left-color: #8b5cf6;
        }
        
        .chart-bar {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .chart-label {
            width: 80px;
            color: #888;
            font-size: 0.9rem;
        }
        
        .chart-track {
            flex: 1;
            height: 24px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            overflow: hidden;
            margin: 0 12px;
        }
        
        .chart-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            transition: width 0.5s ease;
        }
        
        .chart-value {
            width: 50px;
            text-align: right;
            color: #888;
            font-size: 0.9rem;
        }
        
        .assessment {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
            border: 1px solid rgba(102, 126, 234, 0.3);
            font-size: 1.1rem;
            line-height: 1.8;
        }
        
        .tool-usage {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 12px;
        }
        
        .tool-item {
            background: rgba(255, 255, 255, 0.05);
            padding: 8px 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .tool-name {
            font-weight: 600;
            color: #fff;
        }
        
        .tool-count {
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
        }
        
        footer {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 0.9rem;
        }
        
        footer a {
            color: #667eea;
            text-decoration: none;
        }
        
        @media (max-width: 600px) {
            header h1 {
                font-size: 1.8rem;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .chart-label {
                width: 60px;
                font-size: 0.8rem;
            }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .card {
            animation: fadeIn 0.5s ease forwards;
        }
        
        .card:nth-child(1) { animation-delay: 0.1s; }
        .card:nth-child(2) { animation-delay: 0.2s; }
        .card:nth-child(3) { animation-delay: 0.3s; }
        .card:nth-child(4) { animation-delay: 0.4s; }
        .card:nth-child(5) { animation-delay: 0.5s; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Pi Insights Report</h1>
            <div class="subtitle">${escapeHtml(report.sessionName)}</div>
            <div class="timestamp">Generated: ${new Date(report.generatedAt).toLocaleString()}</div>
        </header>

        <div class="card">
            <h2>📈 Summary</h2>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${report.summary.totalMessages}</div>
                    <div class="stat-label">Total Messages</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${report.summary.totalTurns}</div>
                    <div class="stat-label">Conversation Turns</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${report.summary.sessionDuration}</div>
                    <div class="stat-label">Session Duration</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${report.summary.toolCalls}</div>
                    <div class="stat-label">Tool Calls</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${report.summary.filesReferenced}</div>
                    <div class="stat-label">Files Referenced</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>💼 Work Content</h2>
            
            <h3>Top Tasks</h3>
            <ul class="task-list">
                ${report.workContent.topTasks.map(task => `
                    <li>
                        <span class="task-count">${task.count}</span>
                        <div class="task-name">${escapeHtml(task.name)}</div>
                        <div class="task-desc">${escapeHtml(task.description)}</div>
                    </li>
                `).join("")}
            </ul>
            
            <h3>Languages</h3>
            <div style="margin-top: 12px;">
                ${report.workContent.languages.map(lang => `
                    <span class="badge badge-code">${escapeHtml(lang.language)} (${lang.percentage}%)</span>
                `).join("")}
            </div>
            
            <h3>File Types</h3>
            <div style="margin-top: 12px;">
                ${report.workContent.fileTypes.map(ft => `
                    <span class="badge badge-${ft.category}">${escapeHtml(ft.extension)} (${ft.count})</span>
                `).join("")}
            </div>
        </div>

        <div class="card">
            <h2>📊 Usage Patterns</h2>
            
            <h3>Response Time Distribution</h3>
            ${report.usagePatterns.responseTimeDistribution.map(bucket => `
                <div class="chart-bar">
                    <div class="chart-label">${bucket.range}</div>
                    <div class="chart-track">
                        <div class="chart-fill" style="width: ${bucket.percentage}%"></div>
                    </div>
                    <div class="chart-value">${bucket.percentage}%</div>
                </div>
            `).join("")}
            
            <h3>Common Patterns</h3>
            <ul class="pattern-list">
                ${report.usagePatterns.commonPatterns.map(pattern => `
                    <li>${escapeHtml(pattern)}</li>
                `).join("")}
            </ul>
            
            <h3>Tool Usage</h3>
            <div class="tool-usage">
                ${Object.entries(report.usagePatterns.toolUsage).map(([tool, count]) => `
                    <div class="tool-item">
                        <span class="tool-name">${escapeHtml(tool)}</span>
                        <span class="tool-count">${count}</span>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="card">
            <h2>✅ What You're Doing Well</h2>
            <ul class="pattern-list">
                ${report.strengths.map(strength => `
                    <li class="strength">${escapeHtml(strength)}</li>
                `).join("")}
            </ul>
        </div>

        <div class="card">
            <h2>⚠️ Areas for Improvement</h2>
            <ul class="pattern-list">
                ${report.problemAreas.map(problem => `
                    <li class="problem">${escapeHtml(problem)}</li>
                `).join("")}
            </ul>
        </div>

        <div class="card">
            <h2>💡 Recommendations</h2>
            
            <h3>Try These Features</h3>
            <ul class="pattern-list">
                ${report.recommendations.features.map(feature => `
                    <li class="recommendation">${escapeHtml(feature)}</li>
                `).join("")}
            </ul>
            
            <h3>Suggested Skills</h3>
            <ul class="pattern-list">
                ${report.recommendations.skills.map(skill => `
                    <li>
                        <strong>${escapeHtml(skill.name)}</strong>: ${escapeHtml(skill.description)}
                    </li>
                `).join("")}
            </ul>
            
            <h3>Add to AGENTS.md</h3>
            <ul class="pattern-list">
                ${report.recommendations.claudeMdAdditions.map(addition => `
                    <li>${escapeHtml(addition)}</li>
                `).join("")}
            </ul>
        </div>

        <div class="card">
            <h2>🚀 Future Possibilities</h2>
            <ul class="pattern-list">
                ${report.futurePossibilities.map(possibility => `
                    <li class="future">${escapeHtml(possibility)}</li>
                `).join("")}
            </ul>
        </div>

        <div class="card assessment">
            <h2>📝 Overall Assessment</h2>
            <p>${escapeHtml(report.overallAssessment)}</p>
        </div>

        <footer>
            <p>Generated by <strong>Pi Insights Extension</strong></p>
            <p style="margin-top: 8px;">
                <a href="https://github.com/mariozechner/pi-coding-agent">pi - Minimal Terminal Coding Harness</a>
            </p>
        </footer>
    </div>
    
    <script>
        // Animate chart bars on load
        document.addEventListener('DOMContentLoaded', () => {
            const bars = document.querySelectorAll('.chart-fill');
            bars.forEach((bar, index) => {
                const width = bar.style.width;
                bar.style.width = '0';
                setTimeout(() => {
                    bar.style.width = width;
                }, 500 + index * 100);
            });
        });
    </script>
</body>
</html>`;
  }

  async function generateImprovementPlan(
    report: InsightReport,
    reportDir: string,
    timestamp: string
  ): Promise<string> {
    const planPath = join(reportDir, `improvement-plan-${timestamp}.md`);
    const plan = buildImprovementPlan(report, timestamp);
    writeFileSync(planPath, plan, "utf-8");
    return planPath;
  }

  function buildImprovementPlan(report: InsightReport, timestamp: string): string {
    const now = new Date().toISOString().split("T")[0];
    
    // Analyze patterns to create actionable items
    const strengths = analyzeStrengthsForPlan(report);
    const weaknesses = analyzeWeaknessesForPlan(report);
    const recommendations = buildRecommendations(report);
    
    return `# 基于Insights报告的工作流改进计划

生成日期: ${now}
基于: ${report.sessionName} (${report.summary.totalTurns} 会话轮次, ${report.summary.toolCalls} 工具调用)

## 🎯 核心目标

**从"假设成功"到"验证成功"** - 将每个任务执行都从隐式完成转变为显式验证。

---

## 📊 当前工作模式分析

### ✅ 优势（继续保持）

${strengths.map((s, i) => `${i + 1}. **${s.title}**
   - 价值：${s.value}
   - 保持：${s.action}
`).join("\n")}

### ⚠️ 改进空间（需要提升）

${weaknesses.map((w, i) => `${i + 1}. **${w.title}**
   - 影响：${w.impact}
   - 改进：${w.improvement}
`).join("\n")}

---

## 🚀 三阶段改进计划

### 阶段1：立即改进（本周）

#### ✅ 快速胜利
${recommendations.immediate.map(r => `- [ ] ${r}`).join("\n")}

#### 📋 待实施改进
${generatePhase1Tasks(report)}

### 阶段2：流程优化（本月）

${generatePhase2Content(report)}

### 阶段3：系统化改进（持续）

${generatePhase3Content(report)}

---

## 📈 成功指标

### 短期（1个月）
- [ ] ${report.summary.filesReferenced > 10 ? "保持高频文件引用" : "增加文件引用使用"}
- [ ] 减少重复性bash命令
- [ ] 建立至少3个自定义模板

### 中期（3个月）
- [ ] ${report.workContent.languages.length > 3 ? "多语言项目标准化" : "语言特定最佳实践"}
- [ ] 完整的前置检查流程
- [ ] 文档与代码100%同步

### 长期（6个月）
- [ ] 自动化验证流程
- [ ] 并行测试成为标准实践
- [ ] 零重复性错误

---

## 🎁 预期收益

### 1. 效率提升
- 减少重复性操作
- 快速上下文切换
- 自动化验证

### 2. 质量保证
- 早期发现问题
- 一致的输出
- 可追溯的记录

### 3. 知识沉淀
- 最佳实践记录
- 新成员快速上手
- 减少返工

---

## 🔄 持续改进循环

\`\`\`
发现痛点 (Insights报告)
    ↓
创建解决方案 (自定义技能/模板)
    ↓
实施并测试 (本周使用)
    ↓
收集反馈 (是否有效?)
    ↓
优化迭代 (改进技能)
    ↓
标准化 (加入工作流)
    ↓
回到第一步
\`\`\`

---

## ✅ 下一步行动

**今天就可以做：**
1. 在 ~/.pi/agent/prompts/ 创建第一个自定义模板
2. 测试 /compact 命令管理长会话
3. 尝试 /tree 导航功能

**本周可以做：**
1. 为最常做的任务创建自定义 skill
2. 更新项目 AGENTS.md
3. 建立会话结束检查清单

**本月可以做：**
1. 完善自动化检查流程
2. 建立团队协作规范
3. 集成到CI/CD流程

---

## 📚 相关资源

- HTML报告: \`insights-report-${timestamp}.html\`
- Prompt模板目录: \`~/.pi/agent/prompts/\`
- Skill目录: \`~/.pi/agent/skills/\`
- 项目配置: \`AGENTS.md\`

---

**记住：目标是建立"验证优先"的思维模式，将每次执行都从"假设成功"转变为"证明成功"。**
`;
  }

  function analyzeStrengthsForPlan(report: InsightReport): Array<{ title: string; value: string; action: string }> {
    const strengths: Array<{ title: string; value: string; action: string }> = [];
    
    if (report.summary.filesReferenced > 5) {
      strengths.push({
        title: "良好的上下文管理",
        value: `引用${report.summary.filesReferenced}个文件，提供充足上下文`,
        action: "继续使用@file引用，考虑创建文件引用模板",
      });
    }
    
    if (report.workContent.topTasks.length > 0) {
      const topTask = report.workContent.topTasks[0];
      strengths.push({
        title: `专注于${topTask.name}`,
        value: `主要工作集中在${topTask.description}，目标明确`,
        action: "继续专注，考虑创建专项skill",
      });
    }
    
    if (report.summary.totalTurns > 10) {
      strengths.push({
        title: "深度会话",
        value: `${report.summary.totalTurns}轮对话，深入解决问题`,
        action: "长会话后使用/compact管理上下文",
      });
    }
    
    if (strengths.length === 0) {
      strengths.push({
        title: "积极探索",
        value: "正在建立工作流程",
        action: "继续实验，记录有效模式",
      });
    }
    
    return strengths;
  }

  function analyzeWeaknessesForPlan(report: InsightReport): Array<{ title: string; impact: string; improvement: string }> {
    const weaknesses: Array<{ title: string; impact: string; improvement: string }> = [];
    
    const bashUsage = report.usagePatterns.toolUsage["bash"] || 0;
    const readUsage = report.usagePatterns.toolUsage["read"] || 0;
    
    if (bashUsage > readUsage * 2) {
      weaknesses.push({
        title: "过度依赖bash命令",
        impact: `${bashUsage}次bash调用vs${readUsage}次read，效率较低`,
        improvement: "使用@file引用代替cat/ls命令",
      });
    }
    
    if (report.workContent.fileTypes.length === 0 && report.summary.filesReferenced === 0) {
      weaknesses.push({
        title: "缺少文件上下文",
        impact: "AI缺少项目上下文，建议可能不准确",
        improvement: "开始使用@引用相关文件",
      });
    }
    
    const vaguePatterns = report.usagePatterns.commonPatterns.filter(p => 
      p.includes("short") || p.includes("vague")
    );
    if (vaguePatterns.length > 0) {
      weaknesses.push({
        title: "部分提示过于简短",
        impact: "缺少具体上下文，需要更多轮次澄清",
        improvement: "提供具体文件路径和预期结果",
      });
    }
    
    if (weaknesses.length === 0) {
      weaknesses.push({
        title: "持续优化空间",
        impact: "还有提升效率的机会",
        improvement: "探索pi的高级功能，如自定义模板和skills",
      });
    }
    
    return weaknesses;
  }

  function buildRecommendations(report: InsightReport): { immediate: string[] } {
    const immediate: string[] = [];
    
    // Based on task patterns
    if (report.workContent.topTasks.some(t => t.name === "Code Review")) {
      immediate.push("创建 /review 模板用于代码审查");
    }
    if (report.workContent.topTasks.some(t => t.name === "Bug Fixing")) {
      immediate.push("创建 /fix 模板用于调试");
    }
    if (report.workContent.topTasks.some(t => t.name === "Refactoring")) {
      immediate.push("创建 /refactor 模板用于重构");
    }
    
    // Based on file types
    if (report.workContent.languages.some(l => l.language === "TypeScript" || l.language === "JavaScript")) {
      immediate.push("设置TypeScript项目的AGENTS.md规范");
    }
    
    // Based on tool usage
    if ((report.usagePatterns.toolUsage["bash"] || 0) > 5) {
      immediate.push("为常用bash命令创建快捷模板");
    }
    
    // General recommendations
    immediate.push("测试 /compact 命令管理会话长度");
    immediate.push("尝试 /tree 功能导航会话历史");
    immediate.push("创建一个简单的自定义skill");
    
    return { immediate };
  }

  function generatePhase1Tasks(report: InsightReport): string {
    const tasks: string[] = [];
    
    // Task 1: Create first template
    tasks.push(`- [ ] **创建第一个Prompt模板**
  \`\`\`bash
  mkdir -p ~/.pi/agent/prompts
  cat > ~/.pi/agent/prompts/${report.workContent.topTasks[0]?.name.toLowerCase().replace(/\s+/g, "-") || "task"}.md << 'EOF'
  # ${report.workContent.topTasks[0]?.name || "Task"} Template
  
  ## Context
  - Files: @file
  - Goal: {{describe goal}}
  
  ## Requirements
  1. Step one
  2. Step two
  3. Verification
  EOF
  \`\`\``);
    
    // Task 2: Update AGENTS.md
    tasks.push(`- [ ] **更新项目AGENTS.md**
  添加以下内容:
  \`\`\`markdown
  ## ${report.sessionName} 项目规范
  
  ### 常用文件
  ${report.workContent.fileTypes.slice(0, 3).map(f => `- ${f.extension} 文件: 描述用途`).join("\n  ")}
  
  ### 工作流程
  1. 使用@引用相关文件
  2. 执行后进行验证
  3. 定期使用/compact
  \`\`\``);
    
    // Task 3: Create checklist
    tasks.push(`- [ ] **创建会话结束检查清单**
  \`\`\`markdown
  ## 会话结束前检查
  - [ ] 所有代码变更已验证
  - [ ] 使用/compact管理长会话
  - [ ] 重要节点使用/tree标记
  - [ ] 没有遗留错误
  \`\`\``);
    
    return tasks.join("\n\n");
  }

  function generatePhase2Content(report: InsightReport): string {
    const topTask = report.workContent.topTasks[0];
    
    return `#### 改进的工作流程
\`\`\`
旧流程:
  开始任务 → 多轮对话 → 假设完成 → 结束

新流程:
  开始任务 → 引用上下文 → 执行 → 验证 → 确认完成 → 结束
              ↑                      ↑
          使用@文件            显式检查
\`\`\`

#### ${topTask?.name || "任务"}检查清单
\`\`\`markdown
## ${topTask?.name || "任务"}执行检查清单
- [ ] 阅读相关文件
- [ ] 使用@引用上下文
- [ ] 明确预期结果
- [ ] 执行操作
- [ ] 验证输出
- [ ] 更新文档
- [ ] 标记完成
\`\`\`

#### 自定义Skill开发
\`\`\`bash
mkdir -p ~/.pi/agent/skills/${topTask?.name.toLowerCase().replace(/\s+/g, "-") || "workflow"}
cat > ~/.pi/agent/skills/${topTask?.name.toLowerCase().replace(/\s+/g, "-") || "workflow"}/SKILL.md << 'EOF'
# ${topTask?.name || "Custom"} Skill

Use this skill for ${topTask?.description || "this workflow"}.

## Steps
1. Analyze requirements
2. Reference context files
3. Execute with verification
4. Document changes

## Examples
- "Run ${topTask?.name.toLowerCase() || "task"} for @file"
EOF
\`\`\``;
  }

  function generatePhase3Content(report: InsightReport): string {
    return `#### 1. 自动化检查集成
\`\`\`yaml
# 在项目中添加验证脚本
verify:
  - run: pi -p "Verify changes"
  - run: bash scripts/verify.sh
  - assert: exit_code == 0
\`\`\`

#### 2. 团队协作规范
\`\`\`markdown
## 团队pi使用规范

### 必须使用的模板
- /review - 代码审查
- /fix - Bug修复
- /test - 测试生成

### AGENTS.md要求
- 项目结构说明
- 命名规范
- 常用命令
- 验证流程
\`\`\`

#### 3. 持续改进机制
\`\`\`
每周:
  - 运行/insights-report查看报告
  - 分析新的模式
  - 更新自定义模板
  - 分享给团队

每月:
  - 回顾改进计划
  - 调整工作流程
  - 更新技能库
  - 培训新成员
\`\`\``;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
