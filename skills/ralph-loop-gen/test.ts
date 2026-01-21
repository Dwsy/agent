#!/usr/bin/env bun

import { spawn } from "child_process";

// 测试用例
const testCases = [
  {
    name: "简单任务列表",
    input: `任务1: 初始化项目结构
任务2: 安装依赖 -> 依赖: 任务1
任务3: 配置开发环境 -> 依赖: 任务2
任务4: 编写UI组件 -> 依赖: 任务2
任务5: 编写API接口 -> 依赖: 任务3
任务6: 集成测试 -> 依赖: 任务4, 任务5`,
    args: ["--name", "simpleTest", "--project", "简单测试"],
  },
  {
    name: "带优先级的任务",
    input: `任务1: 项目初始化 (High, 2h)
任务2: 数据库设计 -> 依赖: 任务1
任务3: API开发 (High, 8h) -> 依赖: 任务2
任务4: 前端开发 (High, 8h) -> 依赖: 任务1
任务5: 测试 (Medium, 4h) -> 依赖: 任务3, 任务4`,
    args: ["--name", "priorityTest", "--project", "优先级测试"],
  },
  {
    name: "JSON格式任务",
    input: JSON.stringify([
      { id: 1, title: "需求分析", priority: "High", estimated: "4h", description: "分析需求", steps: ["收集", "整理"], dependencies: [] },
      { id: 2, title: "架构设计", priority: "High", estimated: "8h", description: "设计架构", dependencies: [1] },
      { id: 3, title: "开发实现", priority: "High", estimated: "40h", description: "开发功能", dependencies: [2] },
    ], null, 2),
    args: ["--name", "jsonTest", "--project", "JSON测试", "--format", "json"],
  },
];

async function runTest(testCase: { name: string; input: string; args: string[] }) {
  console.log(`\n🧪 测试: ${testCase.name}`);
  console.log("─".repeat(50));

  const proc = spawn("bun", ["lib.ts", ...testCase.args], {
    cwd: new URL(".", import.meta.url).pathname,
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdin.write(testCase.input);
  proc.stdin.end();

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  proc.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  return new Promise((resolve) => {
    proc.on("close", (code) => {
      if (code === 0) {
        console.log("✅ 测试通过");
        const lines = stdout.split("\n");
        const successLines = lines.filter((l) => l.includes("✓ 生成:") || l.includes("任务模板生成完成"));
        successLines.forEach((line) => console.log("  " + line));
      } else {
        console.log("❌ 测试失败");
        console.log("  退出码:", code);
        if (stderr) console.log("  错误:", stderr);
      }
      resolve(code === 0);
    });
  });
}

async function main() {
  console.log("🚀 开始运行测试");
  console.log("=".repeat(50));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const success = await runTest(testCase);
    if (success) passed++;
    else failed++;
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);

  // 清理测试输出
  console.log("\n🧹 清理测试输出...");
  const { exec } = await import("child_process");
  exec("trash task/ 2>/dev/null", (err) => {
    if (err) console.log("  (清理失败，可手动删除 task/ 目录)");
    else console.log("  ✓ 清理完成");
  });

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);