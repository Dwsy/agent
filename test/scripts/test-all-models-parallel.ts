#!/usr/bin/env bun

// 并行模型速度测试 (TypeScript + Bun)
// 排除: Claude, Google, OpenAI, Sonnet

interface ModelResult {
  provider: string;
  model: string;
  time: number;
  output: string;
  status: 'success' | 'error' | 'timeout';
}

const PROMPT = "用一句话介绍你自己，不超过50字。";
const TIMEOUT_MS = 30000;
const CONCURRENT_LIMIT = 5;

// 需要测试的模型（排除 Claude, Google, OpenAI, Sonnet）
const MODELS = [
  { provider: "modelscope", model: "Qwen/Qwen3-VL-235B-A22B-Instruct" },
  { provider: "nvidia", model: "minimaxai/minimax-m2.1" },
  { provider: "nvidia", model: "qwen/qwen3-coder-480b-a35b-instruct" },
  { provider: "nvidia", model: "z-ai/glm4.7" },
  { provider: "proxypal", model: "deepseek-r1" },
  { provider: "proxypal", model: "glm-4.7" },
  { provider: "proxypal", model: "kimi-k2-thinking" },
  { provider: "proxypal", model: "minimax-m2.1" },
  { provider: "proxypal", model: "qwen3-coder-plus" },
  { provider: "proxypal", model: "qwen3-max" },
  { provider: "x-aio", model: "GLM-4.7" },
  { provider: "x-aio", model: "MiniMax-M2.1" },
  { provider: "x-aio", model: "XAIO-G-3-Flash-Preview" },
  { provider: "xiaomimimo", model: "mimo-v2-flash" },
];

// 测试单个模型
async function testModel(provider: string, model: string): Promise<ModelResult> {
  const startTime = Date.now();
  
  try {
    const proc = Bun.spawn({
      cmd: ["pi", "--provider", provider, "--model", model, "-p", PROMPT],
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => {
        proc.kill();
        reject(new Error("Timeout"));
      }, TIMEOUT_MS)
    );

    const result = await Promise.race([
      proc.exited.then(async (exitCode) => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        return { exitCode, stdout, stderr };
      }),
      timeoutPromise
    ]);

    if (result === null) {
      return {
        provider,
        model,
        time: (Date.now() - startTime) / 1000,
        output: "TIMEOUT",
        status: 'timeout'
      };
    }

    const { exitCode, stdout, stderr } = result;
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    if (exitCode !== 0) {
      return {
        provider,
        model,
        time: duration,
        output: stderr || stdout || "ERROR",
        status: 'error'
      };
    }

    return {
      provider,
      model,
      time: duration,
      output: stdout.trim(),
      status: 'success'
    };
  } catch (error: any) {
    return {
      provider,
      model,
      time: (Date.now() - startTime) / 1000,
      output: error.message || "ERROR",
      status: 'error'
    };
  }
}

// 并发限制包装器
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// 主函数
async function main() {
  console.log("=========================================");
  console.log("🚀 并行模型速度测试 (Bun + TypeScript)");
  console.log("=========================================");
  console.log("");
  console.log("测试问题: " + PROMPT);
  console.log("超时设置: " + TIMEOUT_MS + "ms");
  console.log("并发限制: " + CONCURRENT_LIMIT);
  console.log("测试模型数: " + MODELS.length);
  console.log("");
  console.log("=========================================");
  console.log("");

  const startTime = Date.now();

  // 创建任务列表
  const tasks = MODELS.map(({ provider, model }) => 
    () => testModel(provider, model)
  );

  // 并行执行
  const results = await runWithConcurrency(tasks, CONCURRENT_LIMIT);

  const totalTime = (Date.now() - startTime) / 1000;

  // 显示结果
  results.forEach((result, index) => {
    const statusIcon = result.status === 'success' ? '✅' : result.status === 'timeout' ? '⏱️' : '❌';
    console.log(statusIcon + " [" + (index + 1) + "/" + results.length + "] " + result.provider + " / " + result.model);
    console.log("   时间: " + result.time.toFixed(3) + "s");
    if (result.status !== 'success') {
      console.log("   状态: " + result.status);
    }
    if (result.output) {
      const output = result.output.substring(0, 80);
      console.log("   输出: " + output + (result.output.length > 80 ? "..." : ""));
    }
    console.log("");
  });

  // 排名
  console.log("=========================================");
  console.log("🏆 速度排名 (从快到慢)");
  console.log("=========================================");
  
  const sorted = results
    .filter(r => r.status === 'success')
    .sort((a, b) => a.time - b.time);

  sorted.forEach((result, index) => {
    console.log((index + 1) + ". " + result.provider + "/" + result.model + " - " + result.time.toFixed(3) + "s");
  });

  // 统计
  console.log("");
  console.log("=========================================");
  console.log("📊 统计信息");
  console.log("=========================================");
  
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const timeoutCount = results.filter(r => r.status === 'timeout').length;
  
  console.log("✅ 成功: " + successCount + "/" + results.length);
  console.log("❌ 错误: " + errorCount + "/" + results.length);
  console.log("⏱️ 超时: " + timeoutCount + "/" + results.length);
  
  if (sorted.length > 0) {
    const times = sorted.map(r => r.time);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log("");
    console.log("平均时间: " + avg.toFixed(3) + "s");
    console.log("最快: " + min.toFixed(3) + "s");
    console.log("最慢: " + max.toFixed(3) + "s");
    console.log("总耗时: " + totalTime.toFixed(3) + "s");
  }
  
  console.log("");
  console.log("测试完成！✅");
}

// 运行
main().catch(console.error);