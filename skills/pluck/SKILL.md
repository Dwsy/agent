---
name: pluck
description: "MCP-native 代码检索引擎。AST 感知代码读取、BM25+语义混合搜索、会话去重节省 token。替代 cat/grep 作为 agent 默认代码检索层。触发词：pluck, 代码搜索, 代码检索, symbol search, code read, 智能 outline"
---

# Pluck — MCP-native Code Retrieval Engine

本地 Rust daemon，为 AI agent 提供符号感知的代码读取和搜索。通过 MCP 协议暴露工具。

## 核心优势

- **token 节省 84-88%**：智能 outline 代替 cat 整文件
- **会话去重**：已发过的代码块用 1-token 占位符
- **混合搜索**：BM25F + 静态 embedding (potion-code-16M)
- **AST 分块**：Tree-sitter 语法感知，chunk 粒度到函数/类
- **100% 能力保底**：每个工具有 `--raw` fallback

## MCP 工具

| 工具 | 用途 | 参数 |
|------|------|------|
| `read` | 智能 outline + 按需展开 | path, raw?, lines? |
| `search` | BM25 + 语义混合搜索 | query, top_k?, compact? |
| `grep` | 正则搜索 (ripgrep 包装) | pattern, args?, cwd? |
| `symbol` | 精确提取函数体 | name |
| `peek` | 函数签名 + 调用者 | name |
| `expand` | 展开函数体 + N 跳 callees | name, hop? |
| `digest` | 日志压缩 71% | input, format? |
| `impact` | 调用链分析 | name, depth? |
| `deps` | 前向/反向 import 图 | path, reverse? |
| `plan` | 任务 → 相关代码推荐 | task, top_k? |

## 使用模式

### 优先使用 pluck

```
# 读文件 → 用 pluck.read 代替 cat
mcp__pluck__read path="src/auth/login.ts"

# 搜索代码 → 用 pluck.search 代替 rg/grep
mcp__pluck__search query="auth token validation"

# 找函数 → 用 pluck.symbol 代替 rg + cat
mcp__pluck__symbol name="validate_token"

# 看调用链 → 用 pluck.impact
mcp__pluck__impact name="validate_token" depth=3

# 分析依赖 → 用 pluck.deps
mcp__pluck__deps path="src/auth/login.ts"
```

### Fallback 规则

pluck 工具失败或不适用时（二进制文件、repo 外路径），回退到：
- `rg` 搜索
- `read` 工具读取
- `fd` 找文件

## CLI 使用

```bash
# 初始化（Claude Code）
pluck init --target claude --mode aggressive

# 初始化（Cursor）
pluck init --target cursor --mode strong

# 手动启动 daemon
pluckd --repo /path/to/repo
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `PLUCK_DISABLE_EMBEDDINGS=1` | 禁用语义搜索，仅 BM25 |
| `RUST_LOG=debug` | 调试日志 |

## 配置

MCP 服务器配置（~/.claude.json）：

```json
{
  "pluck": {
    "command": "pluckd",
    "args": ["--repo", "."],
    "env": {}
  }
}
```

## 要求

- Rust 1.75+
- Tree-sitter 语法自动下载
- 首次启动需索引 repo（大 repo 可能需几秒）

## 链接

- GitHub: https://github.com/hunhee98/pluck
- crates.io: https://crates.io/crates/pluck-mcp
