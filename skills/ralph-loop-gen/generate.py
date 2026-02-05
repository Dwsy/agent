#!/usr/bin/env python3
"""
Ralph Loop Gen - 任务管理模板生成器（Python 版本）

支持从 JSON 配置文件生成完整的任务管理结构。
"""

import json
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

# 模板文件路径
TEMPLATES_DIR = Path(__file__).parent / "templates"


def read_template(template_name: str) -> str:
    """读取模板文件"""
    template_path = TEMPLATES_DIR / template_name
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    return template_path.read_text(encoding="utf-8")


def fill_template(template: str, data: dict) -> str:
    """填充模板占位符"""
    result = template
    for key, value in data.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def format_task_id(task_id: str) -> str:
    """格式化任务ID"""
    return f"任务{task_id.zfill(3)}"


def get_current_time() -> str:
    """获取当前时间"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def parse_estimated_time(estimated: str) -> int:
    """解析预计时间，返回小时数"""
    import re
    match = re.search(r"(\d+)", estimated)
    return int(match.group(1)) if match else 2


def generate_task_rows(tasks: list) -> str:
    """生成任务列表表格行"""
    rows = []
    for task in tasks:
        task_id = format_task_id(task["id"])
        deps = ", ".join([format_task_id(d) for d in task.get("dependencies", [])]) or "-"
        status = "Locked" if task["id"] == 1 else "Todo"
        owner = "Agent A" if task["id"] == 1 else "-"
        lock_time = get_current_time() if task["id"] == 1 else "-"

        row = (
            f"| {task_id} | {task['title']} | {status} | "
            f"{task['priority']} | {task['estimated']} | "
            f"{deps} | {owner} | {lock_time} |"
        )
        rows.append(row)
    return "\n".join(rows)


def generate_dep_graph(tasks: list) -> str:
    """生成依赖关系图"""
    lines = []
    for task in tasks:
        task_id = format_task_id(task["id"])
        deps = [format_task_id(d) for d in task.get("dependencies", [])]

        if not deps:
            lines.append(f"{task_id} ({task['title']})")
        else:
            for dep in deps:
                lines.append(f"{dep} └─→ {task_id} ({task['title']})")
    return "\n".join(lines)


def generate_parallel_groups(tasks: list) -> str:
    """生成分组信息"""
    processed = set()
    groups = []
    batch = 1

    while len(processed) < len(tasks):
        # 找出所有依赖都已完成且未处理的任务
        ready_tasks = [
            t for t in tasks
            if t["id"] not in processed
            and all(d in processed for d in t.get("dependencies", []))
        ]

        if not ready_tasks:
            break

        task_list = "\n  ".join([
            f"- {format_task_id(t['id'])}: {t['title']} (依赖: {', '.join([format_task_id(d) for d in t.get('dependencies', [])]) or '无依赖'})"
            for t in ready_tasks
        ])

        parallel_flag = "  ✅ 可并行执行" if len(ready_tasks) > 1 else ""
        wait_text = "初始化" if batch == 1 else f"批次{batch - 1}"

        groups.append(
            f"### 批次 {batch}（等待 {wait_text} 完成）\n"
            f"{task_list}\n"
            f"{parallel_flag}"
        )

        processed.update(t["id"] for t in ready_tasks)
        batch += 1

    return "\n\n".join(groups)


def generate_goals_table(goals: list) -> str:
    """生成目标表格"""
    if not goals:
        return ""

    header = "\n## 项目目标\n\n"
    headers = "| 指标 | 优化前 | 目标 | 提升幅度 | 测量方法 |\n"
    separator = "|------|--------|------|----------|----------|\n"
    rows = []

    for goal in goals:
        row = (
            f"| {goal.get('metric', '')} | {goal.get('before', '')} | "
            f"{goal.get('target', '')} | {goal.get('improvement', '')} | "
            f"{goal.get('method', '')} |"
        )
        rows.append(row)

    return header + headers + separator + "\n".join(rows)


def generate_execution_plan(tasks: list, agent_count: int = 3) -> str:
    """生成执行计划"""
    # 简化版执行计划
    header = "\n## 执行计划（3 Agent 并行）\n\n"
    lines = []

    # 按批次生成
    processed = set()
    batch = 1

    while len(processed) < len(tasks):
        ready_tasks = [
            t for t in tasks
            if t["id"] not in processed
            and all(d in processed for d in t.get("dependencies", []))
        ]

        if not ready_tasks:
            break

        # 分配给不同的 Agent
        task_lines = []
        for i, task in enumerate(ready_tasks):
            agent = f"Agent {chr(65 + i % agent_count)}"
            task_lines.append(
                f"  - {agent}: {format_task_id(task['id'])} ({task['estimated']})"
            )

        lines.append(f"阶段 {batch}:")
        lines.extend(task_lines)
        lines.append("")

        processed.update(t["id"] for t in ready_tasks)
        batch += 1

    return header + "\n".join(lines)


def generate_task_file(config: dict, task: dict, output_dir: Path):
    """生成任务文件"""
    template = read_template("task.md")
    task_id = format_task_id(task["id"])

    # 生成依赖列表
    deps = task.get("dependencies", [])
    if deps:
        deps_list = "\n    ".join([
            f"- [ ] {format_task_id(d)} (状态: Todo) - 必须先完成"
            for d in deps
        ])
    else:
        deps_list = "- 无依赖"

    # 生成步骤列表
    steps = task.get("steps", [
        "分析需求",
        "实施开发",
        "自测验证"
    ])
    steps_list = "\n".join([f"{i+1}. {s}" for i, s in enumerate(steps)])

    # 生成验收标准
    acceptance = task.get("acceptance", [
        "功能正常运行",
        "代码通过 review"
    ])
    criteria_list = "\n- [ ] ".join([""] + acceptance)

    # 生成并行提示
    if deps:
        parallel_hint = f"- 需等待 {', '.join([format_task_id(d) for d in deps])} 完成"
    else:
        parallel_hint = "- 无依赖，可立即开始"

    data = {
        "TASK_ID": task_id,
        "TASK_TITLE": task["title"],
        "STATUS": "Locked" if task["id"] == 1 else "Todo",
        "PRIORITY": task["priority"],
        "ESTIMATED_TIME": task["estimated"],
        "DESCRIPTION": task["description"],
        "DEPENDENCIES_LIST": deps_list,
        "ACCEPTANCE_CRITERIA": criteria_list,
        "IMPLEMENTATION_STEPS": steps_list,
        "PARALLEL_HINT": parallel_hint,
        "LOCK_OWNER": "Agent A" if task["id"] == 1 else "-",
        "LOCK_TIME": get_current_time() if task["id"] == 1 else "-",
        "LOCK_TIMEOUT": parse_estimated_time(task["estimated"]) * 2,
    }

    content = fill_template(template, data)
    output_path = output_dir / f"{task_id}.md"
    output_path.write_text(content, encoding="utf-8")
    print(f"✓ 生成: {output_path}")


def generate_index_file(config: dict, tasks: list, output_dir: Path):
    """生成任务索引文件"""
    template = read_template("index.md")

    total_tasks = len(tasks)
    completed = 0
    in_progress = 0
    todo = total_tasks - 1
    locked = 1

    # 计算总预计时间
    total_hours = sum(parse_estimated_time(t["estimated"]) for t in tasks)

    data = {
        "TOTAL_TASKS": total_tasks,
        "COMPLETED": completed,
        "IN_PROGRESS": in_progress,
        "TODO": todo,
        "LOCKED": locked,
        "PROJECT_NAME": config.get("projectName", "未命名项目"),
        "CREATED_TIME": get_current_time(),
        "TASK_ROWS": generate_task_rows(tasks),
        "DEP_GRAPH": generate_dep_graph(tasks),
        "PARALLEL_GROUPS": generate_parallel_groups(tasks),
        "PROGRESS_PERCENT": 0,
        "ELAPSED_TIME": 0,
        "ESTIMATED_REMAINING": f"{total_hours}h",
        "GOALS_TABLE": generate_goals_table(config.get("goals", [])),
        "EXECUTION_PLAN": generate_execution_plan(tasks),
    }

    content = fill_template(template, data)
    output_path = output_dir / "任务索引.md"
    output_path.write_text(content, encoding="utf-8")
    print(f"✓ 生成: {output_path}")


def generate_current_task(config: dict, tasks: list, output_dir: Path):
    """生成当前任务文件"""
    if not tasks:
        return

    first_task = tasks[0]
    task_id = format_task_id(first_task["id"])
    task_path = output_dir / f"{task_id}.md"
    task_content = task_path.read_text(encoding="utf-8")

    # 更新状态为 In Progress
    updated_content = task_content.replace("**状态**: Locked", "**状态**: In Progress")

    output_path = output_dir / "当前任务.md"
    output_path.write_text(updated_content, encoding="utf-8")
    print(f"✓ 生成: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="生成任务管理模板")
    parser.add_argument("--config", "-c", required=True, help="任务配置文件路径（JSON 格式）")
    parser.add_argument("--output", "-o", default="task", help="输出目录（默认: task）")

    args = parser.parse_args()

    # 读取配置文件
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"✗ 配置文件不存在: {config_path}")
        sys.exit(1)

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"✗ 配置文件格式错误: {e}")
        sys.exit(1)

    # 获取参数
    task_set_name = config.get("taskSetName", "defaultTask")
    output_base_dir = Path(args.output)
    output_dir = output_base_dir / task_set_name
    completed_dir = output_dir / "completed"

    # 创建目录
    output_dir.mkdir(parents=True, exist_ok=True)
    completed_dir.mkdir(parents=True, exist_ok=True)
    print(f"✓ 创建目录: {output_dir}")
    print(f"✓ 创建目录: {completed_dir}")

    # 获取任务列表
    tasks = config.get("tasks", [])
    if not tasks:
        print("✗ 未找到任务列表")
        sys.exit(1)

    print(f"\n解析到 {len(tasks)} 个任务\n")

    # 生成文件
    generate_index_file(config, tasks, output_dir)
    for task in tasks:
        generate_task_file(config, task, output_dir)
    generate_current_task(config, tasks, output_dir)

    print("\n✓ 任务模板生成完成！")
    print(f"\n目录结构:")
    print(f"task/{task_set_name}/")
    print(f"├── 任务索引.md")
    print(f"├── 当前任务.md")
    for task in tasks:
        print(f"├── {format_task_id(task['id'])}.md")
    print(f"└── completed/")


if __name__ == "__main__":
    main()