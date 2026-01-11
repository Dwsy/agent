import { spawn } from "bun";
import { join } from "path";
import { openSync, existsSync, mkdirSync } from "fs";

// 加载配置
// 注意：Client 也需要读一下 env 主要是为了知道端口
// 简单的做法是手动解析 .env，或者直接硬编码默认端口 4231
const PORT = 4231; 
const SERVER_URL = `http://localhost:${PORT}`;

async function isServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

async function startServer() {
  console.error("Starting ace-tool daemon...");
  // 获取 daemon.ts 的绝对路径
  const daemonPath = import.meta.dir + "/daemon.ts";
  
  const logFile = join(import.meta.dir, ".ace-tool/daemon.log");
  const logDir = join(import.meta.dir, ".ace-tool");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  // 使用 bun 启动，完全分离进程
  Bun.spawn(["bun", "run", daemonPath], {
    env: { ...process.env }, // 传递环境变量
    cwd: import.meta.dir,
    detached: true, // 关键：让 daemon 独立运行
    stdout: Bun.file(logFile), 
    stderr: Bun.file(logFile),
    stdin: "ignore"
  }).unref(); // 让主进程不再等待子进程

  // 等待 Server 启动
  let retries = 20;
  while (retries > 0) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerRunning()) {
      console.error("Daemon started successfully.");
      return;
    }
    retries--;
  }
  throw new Error("Failed to start ace-tool daemon");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]; // 例如 "ask" 或 "index"

  // 1. 确保 Daemon 在运行
  if (!(await isServerRunning())) {
    await startServer();
  }

  // 2. 初始化 (如果需要的话，但通常 ace-tool 启动时就 ready 了)
  // 我们发送 initialize 请求来确保 handshake，但这取决于 daemon 是否处理了
  // 我们的 daemon 很傻，只转发。所以我们需要发送 initialize 吗？
  // 标准 MCP 流程是 Client 发 Initialize。Ace-tool 可能需要它。
  // 为了简化，我们假设 daemon 已经把 ace-tool 跑起来了。
  // 但 MCP 协议要求先 handshake。
  
  // 实际上，我们的 daemon 是透明代理。
  // 所以 Client 第一次连接时应该发送 initialize。
  // 但是 Client 是 CLI，每次运行都是新的。
  // 这意味着我们每次运行 CLI 都要 initialize 吗？
  // 不，如果 daemon 保持 ace-tool 运行，那么 ace-tool 状态是**已经初始化**过的吗？
  // 这取决于 Daemon 何时发 initialize。
  // 让我们修改一下策略：Daemon 启动后，应该自己先发一个 Initialize 给 ace-tool。
  // 我们修改 daemon.ts 比较好。但现在我们先在 Client 里尝试直接调 Tool。
  // 如果 ace-tool 需要先 initialize，我们在 Daemon 启动时自动做。

  // 3. 构建工具调用
  let method = "tools/call";
  let params = {};

  // 简单的参数映射
  // ace-tool 似乎没有公开明确的 Tool 列表，我们假设它有标准的 "ask" 或类似功能
  // 根据 README，它是一个 MCP Server。
  // 我们需要知道它有哪些 Tool。通常是 "query" 或 "ask"。
  // 让我们假设我们只要调用它的 listTools 就能知道。
  
  if (command === "search") {
    const query = args[1];
    if (!query) {
      console.error("Usage: bun client.ts search <query>");
      process.exit(1);
    }
    params = {
      name: "search_context",
      arguments: { 
        query,
        project_root_path: process.cwd()
      }
    };
  } else if (command === "enhance") {
    const prompt = args[1];
    if (!prompt) {
      console.error("Usage: bun client.ts enhance <prompt>");
      process.exit(1);
    }
    params = {
      name: "enhance_prompt",
      arguments: {
        prompt,
        project_root_path: process.cwd(),
        conversation_history: JSON.stringify([{ role: "user", content: prompt }]) // 构造一个基本的历史
      }
    };
    console.error(">> Opening Web UI for prompt enhancement...");
  } else {
    console.error("Unknown command. Use 'search' or 'enhance'.");
    process.exit(1);
  }

  // 4. 发送请求
  try {
    const res = await fetch(`${SERVER_URL}/call`, {
      method: "POST",
      body: JSON.stringify({ method, params })
    });
    
    const json = await res.json();
    if (json.error) {
      console.error("RPC Error:", json.error);
      process.exit(1);
    }
    
    // 输出结果
    console.log(JSON.stringify(json.result, null, 2));

  } catch (e) {
    console.error("Communication error:", e);
    process.exit(1);
  }
}

main();
