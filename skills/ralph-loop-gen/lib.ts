#!/usr/bin/env bun

import fs from "fs";
import path from "path";

// 模板文件路径
const TEMPLATES_DIR = path.join(import.meta.dir, "templates");

// 类型定义
interface Task {
  id: number;
  title: string;
  priority: string;
  estimated: string;
  description: string;
  dependencies: number[];
  steps?: string[];
  acceptanceCriteria?: string[];
}

interface Config {
  taskSetName: string;
  projectName: string;
  outputDir: string;
}

// 读取模板文件
function readTemplate(templateName: string): string {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, "utf-8");
}

// 填充模板占位符
function fillTemplate(template: string, data: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replaceAll(placeholder, String(value));
  }
  return result;
}

// 格式化任务ID
function formatTaskId(id: number): string {
  return `任务${String(id).padStart(3, "0")}`;
}

// 获取当前时间
function getCurrentTime(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

// 解析任务输入（简单格式）
function parseSimpleInput(input: string): Task[] {
  const tasks: Task[] = [];
  const lines = input.trim().split("\n");
  let id = 1;

  for (const line of lines) {
    const cleanedLine = line.trim();
    if (!cleanedLine || cleanedLine.startsWith("#")) continue;

    // 移除任务编号前缀，获取任务内容
    const taskMatch = cleanedLine.match(/^任务(\d+)[:：]\s+(.+)$/);
    if (!taskMatch) continue;

    let content = taskMatch[2].trim();
    const dependencies: number[] = [];

    // 移除括号中的优先级和时间信息
    content = content.replace(/\([^)]*\)/g, "").trim();

    // 处理 -> 或 依赖: 后面的内容
    let title = content;
    const arrowIndex = content.indexOf("->");
    if (arrowIndex !== -1) {
      title = content.substring(0, arrowIndex).trim();
      const afterArrow = content.substring(arrowIndex + 2).trim();

      // 提取依赖任务
      const depMatch = afterArrow.match(/(?:依赖|depend)[:：]\s*(.+)$/i);
      if (depMatch) {
        const depsStr = depMatch[1];
        depsStr.split(/[,\s，]+/).forEach((d) => {
          const num = parseInt(d.replace(/\D/g, ""));
          if (num && !isNaN(num)) {
            dependencies.push(num);
          }
        });
      }
    } else {
      // 没有 ->，检查是否有 依赖: 关键字
      const depMatch = content.match(/(?:依赖|depend)[:：]\s*(.+)$/i);
      if (depMatch) {
        title = content.substring(0, depMatch.index).trim();
        const depsStr = depMatch[1];
        depsStr.split(/[,\s，]+/).forEach((d) => {
          const num = parseInt(d.replace(/\D/g, ""));
          if (num && !isNaN(num)) {
            dependencies.push(num);
          }
        });
      }
    }

    tasks.push({
      id: id++,
      title: title.trim(),
      priority: "Medium",
      estimated: "2h",
      description: title.trim(),
      dependencies,
    });
  }

  return tasks;
}

// 解析任务输入（JSON格式）
function parseJsonInput(input: string): Task[] {
  const data = JSON.parse(input);
  return data.map((item: any, index: number) => ({
    id: item.id || index + 1,
    title: item.title,
    priority: item.priority || "Medium",
    estimated: item.estimated || "2h",
    description: item.description || item.title,
    dependencies: item.dependencies || [],
    steps: item.steps,
    acceptanceCriteria: item.acceptanceCriteria,
  }));
}

// 生成任务索引
function generateTaskIndex(config: Config, tasks: Task[]): void {
  const template = readTemplate("index.md");

  // 生成任务列表表格行
  const taskRows = tasks.map((task) => {
    const deps = task.dependencies.map(formatTaskId).join(", ") || "-";
    const formattedId = formatTaskId(task.id);
    const status = task.id === 1 ? "Locked" : "Todo";
    const owner = task.id === 1 ? "Agent A" : "-";
    const lockTime = task.id === 1 ? getCurrentTime() : "-";

    return `| ${formattedId} | ${task.title} | ${status} | ${task.priority} | ${task.estimated} | ${deps} | ${owner} | ${lockTime} |`;
  }).join("\n");

  // 生成依赖关系图
  const depGraph = generateDepGraph(tasks);

  // 生成分组信息
  const groups = generateParallelGroups(tasks);

  const data = {
    TOTAL_TASKS: tasks.length,
    COMPLETED: 0,
    IN_PROGRESS: 0,
    TODO: tasks.length - 1,
    LOCKED: 1,
    PROJECT_NAME: config.projectName,
    CREATED_TIME: getCurrentTime(),
    TASK_ROWS: taskRows,
    DEP_GRAPH: depGraph,
    PARALLEL_GROUPS: groups,
    PROGRESS_PERCENT: 0,
    ELAPSED_TIME: 0,
    ESTIMATED_REMAINING: tasks.reduce((sum, t) => sum + parseEstimatedTime(t.estimated), 0) + "h",
  };

  const content = fillTemplate(template, data);
  const outputPath = path.join(config.outputDir, config.taskSetName, "任务索引.md");
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log(`✓ 生成: ${outputPath}`);
}

// 生成依赖关系图
function generateDepGraph(tasks: Task[]): string {
  const lines: string[] = [];

  for (const task of tasks) {
    const id = formatTaskId(task.id);
    const deps = task.dependencies.map(formatTaskId);

    if (deps.length === 0) {
      lines.push(`${id} (${task.title})`);
    } else {
      for (const dep of deps) {
        lines.push(`${dep} └─→ ${id} (${task.title})`);
      }
    }
  }

  return lines.join("\n");
}

// 生成并行任务分组
function generateParallelGroups(tasks: Task[]): string {
  const processed = new Set<number>();
  const groups: string[] = [];
  let batch = 1;

  while (processed.size < tasks.length) {
    // 找出所有依赖都已完成且未处理的任务
    const readyTasks = tasks.filter(
      (task) =>
        !processed.has(task.id) &&
        task.dependencies.every((dep) => processed.has(dep))
    );

    if (readyTasks.length === 0) {
      // 避免死循环
      break;
    }

    const taskList = readyTasks
      .map((t) => {
        const deps = t.dependencies.map(formatTaskId).join(", ") || "无依赖";
        return `- ${formatTaskId(t.id)}: ${t.title} (依赖: ${deps})`;
      })
      .join("\n  ");

    const parallelFlag = readyTasks.length > 1 ? "  ✅ 可并行执行" : "";

    groups.push(`### 批次 ${batch}（等待 ${batch > 1 ? `批次${batch - 1}` : "初始化"} 完成）
${taskList}
${parallelFlag}`);

    readyTasks.forEach((t) => processed.add(t.id));
    batch++;
  }

  return groups.join("\n\n");
}

// 解析预计时间
function parseEstimatedTime(estimated: string): number {
  const match = estimated.match(/(\d+)/);
  return match ? parseInt(match[1]) : 2;
}

// 生成任务文件
function generateTaskFile(config: Config, task: Task): void {
  const template = readTemplate("task.md");
  const formattedId = formatTaskId(task.id);

  const depsList = task.dependencies.map((dep) => {
    const depId = formatTaskId(dep);
    return `- [ ] ${depId} (状态: Todo) - 必须先完成`;
  }).join("\n    ");

  const stepsList = task.steps
    ? task.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "1. 分析需求\n2. 实施开发\n3. 自测验证";

  const criteriaList = task.acceptanceCriteria
    ? task.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")
    : "- [ ] 功能正常运行\n- [ ] 代码通过 review";

  const parallelHint = task.dependencies.length === 0
    ? "- 无依赖，可立即开始"
    : `- 需等待 ${task.dependencies.map(formatTaskId).join(", ")} 完成`;

  const data = {
    TASK_ID: formattedId,
    TASK_TITLE: task.title,
    STATUS: task.id === 1 ? "Locked" : "Todo",
    PRIORITY: task.priority,
    ESTIMATED_TIME: task.estimated,
    DESCRIPTION: task.description,
    DEPENDENCIES_LIST: depsList || "- 无依赖",
    ACCEPTANCE_CRITERIA: criteriaList,
    IMPLEMENTATION_STEPS: stepsList,
    PARALLEL_HINT: parallelHint,
    LOCK_OWNER: task.id === 1 ? "Agent A" : "-",
    LOCK_TIME: task.id === 1 ? getCurrentTime() : "-",
    LOCK_TIMEOUT: parseEstimatedTime(task.estimated) * 2 + " 分钟",
  };

  const content = fillTemplate(template, data);
  const outputPath = path.join(config.outputDir, config.taskSetName, `${formattedId}.md`);
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log(`✓ 生成: ${outputPath}`);
}

// 生成当前任务文件
function generateCurrentTask(config: Config, firstTask: Task): void {
  const taskPath = path.join(config.outputDir, config.taskSetName, `${formatTaskId(firstTask.id)}.md`);
  const taskContent = fs.readFileSync(taskPath, "utf-8");

  // 更新状态为 In Progress
  const updatedContent = taskContent.replace("**状态**: Locked", "**状态**: In Progress");

  const outputPath = path.join(config.outputDir, config.taskSetName, "当前任务.md");
  fs.writeFileSync(outputPath, updatedContent, "utf-8");
  console.log(`✓ 生成: ${outputPath}`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  // 解析参数
  let taskSetName = "defaultTask";
  let projectName = "未命名项目";
  let inputFormat = "simple";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" || args[i] === "-n") {
      taskSetName = args[++i];
    } else if (args[i] === "--project" || args[i] === "-p") {
      projectName = args[++i];
    } else if (args[i] === "--format" || args[i] === "-f") {
      inputFormat = args[++i];
    }
  }

  const config: Config = {
    taskSetName,
    projectName,
    outputDir: "task",
  };

  // 创建目录
  const taskDir = path.join(config.outputDir, config.taskSetName);
  const completedDir = path.join(taskDir, "completed");

  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(completedDir, { recursive: true });
  console.log(`✓ 创建目录: ${taskDir}`);
  console.log(`✓ 创建目录: ${completedDir}`);

  // 读取输入
  console.log("\n请输入任务列表（Ctrl+D 结束输入）：");
  let input = "";
  for await (const line of console) {
    input += line + "\n";
  }

  // 解析任务
  let tasks: Task[];
  try {
    if (inputFormat === "json") {
      tasks = parseJsonInput(input);
    } else {
      tasks = parseSimpleInput(input);
    }
  } catch (e) {
    console.error("✗ 解析任务失败:", e);
    process.exit(1);
  }

  if (tasks.length === 0) {
    console.error("✗ 未找到有效任务");
    process.exit(1);
  }

  console.log(`\n解析到 ${tasks.length} 个任务\n`);

  // 生成文件
  generateTaskIndex(config, tasks);
  tasks.forEach((task) => generateTaskFile(config, task));
  generateCurrentTask(config, tasks[0]);

  console.log("\n✓ 任务模板生成完成！");
  console.log(`\n目录结构:`);
  console.log(`task/${taskSetName}/`);
  console.log(`├── 任务索引.md`);
  console.log(`├── 当前任务.md`);
  tasks.forEach((t) => console.log(`├── ${formatTaskId(t.id)}.md`));
  console.log(`└── completed/`);
}

main().catch(console.error);