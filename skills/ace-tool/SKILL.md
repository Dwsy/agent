---
name: ace-tool
description: This tool provides semantic, fuzzy search over the codebase. It is designed for high-level understanding and exploration when exact file names, symbols, or locations are unknown. It interprets natural language queries and retrieves conceptually relevant code rather than exact string matches. IMPORTANT: When an exact identifier, symbol name, or literal string is known, ALWAYS prefer using rg (ripgrep) for precise and exhaustive matching. Use this tool only when semantic understanding is required or when rg is insufficient.
---


# Ace Tool (AugmentCode)

Bridged via a persistent Bun daemon to maintain index state.

## 执行环境

| 路径类型 | 路径 | 基准目录 |
|---------|------|---------|
| **技能目录** | `~/.pi/agent/skills/ace-tool/` | 固定位置 |
| **主脚本** | `~/.pi/agent/skills/ace-tool/client.ts` | 技能目录 |
| **守护进程** | `~/.pi/agent/skills/ace-tool/daemon.ts` | 技能目录 |
| **日志文件** | `.ace-tool/ace-tool.log` | **工作目录** (执行命令时的当前目录) |
| **配置目录** | `~/.pi/agent/skills/ace-tool/.env` | 固定位置 |

## 调用命令

```bash
# ✅ 正确：使用 client.ts（注意：不是 lib.ts！）
cd /path/to/your/project
bun ~/.pi/agent/skills/ace-tool/client.ts search "Where is the user authentication handled?"

# ✅ 从技能目录执行
cd ~/.pi/agent/skills/ace-tool && bun run client.ts search "query"

# ❌ 错误：lib.ts 文件不存在
bun ~/.pi/agent/skills/ace-tool/lib.ts search "query"  # No such file or directory
```

## 路径说明

- **日志位置**：``.ace-tool/ace-tool.log`` 位于**执行命令时的当前目录**，即项目根目录
- **项目根目录**：执行命令时的 `process.cwd()`，用于代码检索的上下文
- **技能脚本**：位于固定路径 `~/.pi/agent/skills/ace-tool/`，不会随工作目录变化

## Tools

### 1. Codebase Search (`search_context`)
**IMPORTANT: This is the PRIMARY tool for searching the codebase.**

Use this tool when you need to understand the codebase, find functionality, or locate code based on natural language descriptions. It uses Augment's advanced context engine for high-quality semantic recall.

*   **When to Use:**
    *   You don't know which files contain the info you need.
    *   You need high-level information about a task.
    *   **CRITICAL RULE:** When searching for code/classes/functions, **ALWAYS choose this tool over Bash/Grep**. Bash/Grep are only for exact string matching of non-code content.
    *   **Pre-Edit Rule:** Before editing any file, ALWAYS first call this tool to gather detailed context about the symbols, classes, or methods involved.

*   **Usage:**
    ```bash
    ~/.pi/agent/skills/ace-tool/client.ts search "Where is the user authentication handled?"
    ```

### 2. Prompt Enhancement (`enhance_prompt`)
Enhances user requirements by combining codebase context and conversation history to generate clearer, specific, and actionable prompts via a Web UI.

*   **Trigger Methods:**
    1.  **Explicit Markers:** User message contains `-enhance`, `-enhancer` (case-insensitive). E.g., `"Add login page -enhance"`.
    2.  **Explicit Request:** User asks to "enhance my prompt".
*   **Note:** This is NOT for general code optimization (e.g., "improve this function"), but for **requirement/prompt refinement**.

*   **Usage:**
    ```bash
    ~/.pi/agent/skills/ace-tool/client.ts enhance "Add a login page"
    ```

## Notes
*   **Single Process:** The daemon (`daemon.ts`) starts automatically and stays running.
*   **Logs:** Check `.ace-tool/ace-tool.log` in your project root (where you execute the command).
*   **Path Warning:** Always use the full path `~/.pi/agent/skills/ace-tool/client.ts` or `cd` to the skill directory first.
