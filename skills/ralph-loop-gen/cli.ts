#!/usr/bin/env bun

import { main } from "./lib.ts";

// 添加 CLI 帮助信息
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Ralph Loop Gen - 任务管理系统模板生成器

用法:
  bun ralph-loop-gen [选项]

选项:
  -n, --name <name>        任务集名称 (默认: defaultTask)
  -p, --project <name>     项目名称 (默认: 未命名项目)
  -f, --format <format>    输入格式: simple | json (默认: simple)
  -h, --help               显示帮助信息

示例:
  # 基本用法
  bun ralph-loop-gen

  # 指定名称
  bun ralph-loop-gen --name myProject

  # 指定项目名称和格式
  bun ralph-loop-gen --name apiProject --project "API项目" --format json

输入格式:
  简单格式 (默认):
    任务1: 初始化项目
    任务2: 安装依赖 -> 依赖: 任务1

  JSON 格式 (--format json):
    [{"id":1,"title":"初始化项目","dependencies":[]}]

输出目录:
  task/{任务集名}/

文档:
  SKILL.md    - 技能详细说明
  EXAMPLES.md - 使用示例
  README.md   - 项目说明
`);
  process.exit(0);
}

main().catch((error) => {
  console.error("错误:", error.message);
  process.exit(1);
});