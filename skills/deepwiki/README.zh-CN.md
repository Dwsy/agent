# DeepWiki

一个强大的 CLI 工具，通过 DeepWiki MCP SSE 协议获取 GitHub 仓库的文档和知识。

## 功能

- 🔍 **探索仓库结构**: 查看所有可用的文档主题
- 📖 **阅读文档内容**: 访问详细的 wiki 内容
- 💬 **提问**: 使用自然语言查询仓库知识

## 安装

```bash
npm install -g deepwiki-cli
```

或使用 pnpm:

```bash
pnpm add -g deepwiki-cli
```

## 使用方法

### 1. 获取仓库文档结构

```bash
deepwiki read_wiki_structure --repoName "owner/repo"
# 或使用简短别名
dw rws -r "owner/repo"
```

### 2. 查看具体文档内容

```bash
deepwiki read_wiki_contents --repoName "owner/repo" --topic "topic_name"
# 或使用简短别名
dw rwc -r "owner/repo" -t "topic_name"
```

### 3. 针对仓库提问

```bash
deepwiki ask_question --repoName "owner/repo" --question "你的问题"
# 或使用简短别名
dw aq -r "owner/repo" -q "你的问题"
```

## 前置条件

- Node.js 14 或更高版本
- DeepWiki MCP 服务器访问权限
- 有效的 GitHub 仓库路径

## 示例

### OpenAI Node.js SDK

```bash
# 探索仓库结构
dw rws -r "openai/openai-node"

# 阅读安装指南
dw rwc -r "openai/openai-node" -t "Installation and Setup"

# 询问认证方法
dw aq -r "openai/openai-node" -q "如何认证?"
```

### Linux 内核

```bash
# 探索 Linux 内核文档
dw rws -r "torvalds/linux"

# 询问 Linux 启动流程
dw aq -r "torvalds/linux" -q "Linux 是如何启动的?"

# 询问内核初始化
dw aq -r "torvalds/linux" -q "Linux 内核在启动过程中是如何初始化的?"
```

### React

```bash
# 探索 React 文档
dw rws -r "facebook/react"

# 询问 React Hooks
dw aq -r "facebook/react" -q "useEffect 和 useState 是如何工作的?"
```

## 命令别名

CLI 为所有命令提供了便捷的别名：

| 完整命令 | 简短别名 | 说明 |
|---------|---------|------|
| `read_wiki_structure` | `rws`, `str` | 获取仓库文档结构 |
| `read_wiki_contents` | `rwc`, `cont` | 查看具体文档内容 |
| `ask_question` | `aq`, `ask` | 针对仓库提问 |

## 参数简写

| 完整参数 | 简短形式 | 说明 |
|---------|---------|------|
| `--repoName` | `-r`, `--repo` | 仓库名称 (例如: "owner/repo") |
| `--topic` | `-t` | 文档主题名称 |
| `--question` | `-q` | 关于仓库的问题 |
| `--lang` | `-l` | 语言 (en|zh, default: auto) |
| `--help` | `-h` | 显示帮助 |

## 依赖

- `axios` - HTTP 客户端
- `eventsource` - SSE 协议支持

## 许可证

ISC

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 仓库

https://github.com/Dwsy/deepwiki-skills

---

[English Documentation](./README.md)