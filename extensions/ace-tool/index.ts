import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "child_process";
import { join } from "path";

const ACE_DAEMON_URL = "http://127.0.0.1:4231";
const ACE_DAEMON_SCRIPT = join(process.env.HOME!, ".pi/agent/extensions/ace-tool/daemon.ts");

/**
 * 流式执行命令
 */
function execStream(
  command: string,
  options: { onData?: (chunk: string) => void; signal?: AbortSignal; timeout?: number } = {}
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (options.timeout && options.timeout > 0) {
      timeoutHandle = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, options.timeout * 1000);
    }
    const decoder = new TextDecoder();
    child.stdout?.on("data", (data: Buffer) => options.onData?.(decoder.decode(data, { stream: true })));
    child.stderr?.on("data", (data: Buffer) => options.onData?.(decoder.decode(data, { stream: true })));
    const onAbort = () => child.kill("SIGTERM");
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) { reject(new Error("aborted")); return; }
      if (timedOut) { reject(new Error(`timeout: ${options.timeout}`)); return; }
      resolve({ exitCode: code });
    });
    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
}

async function isDaemonOnline(): Promise<boolean> {
  try {
    let output = "";
    await execStream(`curl -s -m 2 ${ACE_DAEMON_URL}/health`, { onData: (c) => { output += c; }, timeout: 3 });
    return JSON.parse(output).status === "online";
  } catch { return false; }
}

async function startDaemon(): Promise<void> {
  spawn("bun", ["run", ACE_DAEMON_SCRIPT], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isDaemonOnline()) return;
  }
  throw new Error("ace-tool 守护进程启动超时");
}

async function ensureDaemon(): Promise<void> {
  if (!(await isDaemonOnline())) await startDaemon();
}

async function callAceDaemon(method: string, params: any, signal?: AbortSignal): Promise<any> {
  await ensureDaemon();
  const body = JSON.stringify({ method, params });
  const escaped = body.replace(/'/g, "'\\''");
  let output = "";
  await execStream(
    `curl -s -X POST ${ACE_DAEMON_URL}/call -H 'Content-Type: application/json' -d '${escaped}'`,
    { onData: (c) => { output += c; }, signal, timeout: 30 }
  );
  return JSON.parse(output);
}

/**
 * 将绝对路径缩短为相对路径或文件名
 * /Users/dengwenyu/project/src/components/Box.tsx → src/components/Box.tsx
 */
function abbreviatePath(fullPath: string, projectRoot?: string): string {
  if (projectRoot && fullPath.startsWith(projectRoot)) {
    return fullPath.slice(projectRoot.length + 1); // +1 for trailing slash
  }
  // 取最后 3 段路径
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length <= 3) return fullPath;
  return ".../" + parts.slice(-3).join("/");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ace-tool",
    description: `Semantic code search - retrieves conceptually related code using natural language queries. Use this tool when file names, symbols, or locations are unknown.

Trigger when:
- User asks where something is implemented ("Where is user authentication handled?")
- Need to find code locations ("Find the database connection code")
- Want to understand how something works ("How does the payment processing work?")
- Need to make changes but don't know where ("I need to add a new API endpoint")
- Ask about code structure ("What tests exist for the login feature?")

Query strategies:
- Direct: Use function names, class names, variable names (e.g. "UserService.authenticate")
- Conceptual: Describe what the code does (e.g. "user authentication", "database connection")
- Related: Search for similar functionality or related concepts

Iteration:
- If results aren't helpful, reformulate with different terminology
- Use multiple related queries for completeness
- Never guess - always search before assuming code locations`,
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search description" }),
      project_root_path: Type.Optional(Type.String({ description: "Absolute path to project root directory, defaults to current directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const projectPath = params.project_root_path || ctx.cwd;
      try {
        const result = await callAceDaemon("tools/call", {
          name: "search_context",
          arguments: { query: params.query, project_root_path: projectPath },
        }, signal);
        if (result.error) throw new Error(`ace-tool 错误: ${result.error}`);
        const content = result.result?.content || [];
        const text = content.filter((i: any) => i.type === "text").map((i: any) => i.text).join("\n");
        return { content: [{ type: "text", text: text || "未找到相关代码" }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `搜索失败: ${msg}` }], isError: true };
      }
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("ace "));
      text += theme.fg("accent", `"${args.query}"`);
      if (args.project_root_path) {
        text += theme.fg("dim", ` in ${args.project_root_path}`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const textContent = result.content?.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return new Text("", 0, 0);
      }

      // 提取文件路径和行数
      const lines = textContent.text.trim().split("\n");
      const pathLines: string[] = [];
      const contentLines: string[] = [];
      let inContent = false;

      for (const line of lines) {
        if (line.startsWith("Path:")) {
          pathLines.push(line.slice(5).trim());
          inContent = false;
        } else if (line.startsWith("Lines:") || line.startsWith("Similarity:")) {
          inContent = false;
        } else if (line.trim()) {
          inContent = true;
          contentLines.push(line);
        }
      }

      // 折叠状态：显示文件数摘要
      if (!expanded) {
        if (pathLines.length > 0) {
          return new Text(theme.fg("muted", ` → ${pathLines.length} files`), 0, 0);
        }
        return new Text("", 0, 0);
      }

      // 展开状态：省略显示文件路径
      if (pathLines.length > 0) {
        const projectPath = _context?.cwd;
        const abbreviated = pathLines.map(p => abbreviatePath(p, projectPath));
        const maxShow = Math.min(abbreviated.length, 5); // 最多显示 5 个
        const shown = abbreviated.slice(0, maxShow);
        const remaining = pathLines.length - maxShow;

        let pathSummary = shown
          .map(p => theme.fg("toolOutput", `  ${p}`))
          .join("\n");

        if (remaining > 0) {
          pathSummary += "\n" + theme.fg("dim", `  ... and ${remaining} more`);
        }

        // 内容摘要（前 30 行）
        const contentPreview = contentLines.slice(0, 30)
          .map(l => theme.fg("toolOutput", l))
          .join("\n");

        return new Text(`\n${pathSummary}\n\n${contentPreview}`, 0, 0);
      }

      // 无路径时回退到原始显示
      const output = lines.slice(0, 100)
        .map((line: string) => theme.fg("toolOutput", line))
        .join("\n");
      return new Text(`\n${output}`, 0, 0);
    },
  });
}
