# Improve Skill 使用指南

## 概述

Improve Skill 用于分析编码代理会话记录，提取经验教训，改进现有技能或创建新技能。支持 Claude Code、Pi、Codex 三种代理。

## 快速开始

### 提取会话记录

```bash
cd ~/.pi/agent/skills/improve-skill/scripts

# 自动检测（基于当前工作目录）
node extract-session.js

# 指定代理类型
node extract-session.js --agent claude
node extract-session.js --agent pi
node extract-session.js --agent codex

# 指定工作目录
node extract-session.js --cwd /path/to/project

# 直接指定会话文件
node extract-session.js /path/to/session.jsonl
```

### 输出格式

```
# Session Transcript
Agent: pi
File: /Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-.pi-agent--/session.jsonl
Messages: 117

[... earlier messages omitted ...]

### USER:
用户输入内容

### ASSISTANT:
助手回复内容

### TOOLRESULT:
工具执行结果
```

## 工作流

### 改进现有技能

1. **提取会话记录**

```bash
node extract-session.js > /tmp/session-transcript.txt
```

2. **找到现有技能**

技能位置：
- `~/.pi/agent/skills/<skill-name>/SKILL.md`
- `~/.claude/skills/<skill-name>/SKILL.md`
- `~/.codex/skills/<skill-name>/SKILL.md`

3. **生成改进提示**

创建新的代理会话，使用以下提示：

```
我需要基于会话改进 "<skill-name>" 技能。

首先，阅读当前技能：<path-to-skill>

然后分析这个会话记录，理解：
- 我在使用技能时的困难点
- 技能文档中缺失的信息
- 需要补充的示例
- 我自己摸索出的方法

<session_transcript>
<paste transcript here>
</session_transcript>

基于分析，改进技能：
1. 添加缺失的指令或说明
2. 添加常见用例的示例
3. 修正错误的指导
4. 在可能的情况下简化内容

将改进后的技能写回原位置。
```

### 创建新技能

1. **提取会话记录**

```bash
node extract-session.js > /tmp/session-transcript.txt
```

2. **生成创建提示**

创建新的代理会话，使用以下提示：

```
分析这个会话记录，提取可重用的技能 "<skill-name>"：

<session_transcript>
<paste transcript here>
</session_transcript>

创建新技能，包含：
1. 演示的核心能力或工作流
2. 使用的关键命令、API 或模式
3. 常见陷阱及避免方法
4. 典型场景的使用示例

将技能写入：~/.pi/agent/skills/<skill-name>/SKILL.md

使用以下格式：
---
name: <skill-name>
description: "<一行描述>"
---

# <Skill Name> Skill

<概述和快速参考>

## <每个主要能力的章节>

<指令和示例>
```

## 会话文件位置

### Pi Agent

```
~/.pi/agent/sessions/<encoded-cwd>/*.jsonl
```

编码规则：
- 路径前缀：`--`
- 路径分隔符：`-`
- 路径后缀：`--`

示例：
```
/Users/dengwenyu/.pi/agent
→ --Users-dengwenyu-.pi-agent--
```

### Claude Code

```
~/.claude/projects/<encoded-cwd>/*.jsonl
```

编码规则：路径分隔符替换为 `-`

### Codex

```
~/.codex/sessions/YYYY/MM/DD/*.jsonl
```

按日期组织，通过 CWD 匹配

## 分析技巧

### 识别问题模式

在会话记录中寻找：
- **困惑模式**：代理重试或改变方法的地方
- **缺失示例**：发现的具体命令或代码模式
- **变通方法**：代理自己摸索出的方法
- **错误**：失败的原因及解决方案
- **成功模式**：效果好且应突出的方法

### 提取关键信息

1. **命令序列**：实际执行的命令
2. **参数模式**：常用的参数组合
3. **错误处理**：错误消息和解决方案
4. **最佳实践**：发现的有效方法

### 改进原则

- **简洁性**：聚焦最重要的信息和示例
- **完整性**：覆盖常见用例
- **清晰性**：避免歧义，使用明确指令
- **实用性**：提供可直接使用的示例

## 示例

### 改进 tmux 技能

```bash
# 提取会话
cd ~/.pi/agent
node skills/improve-skill/scripts/extract-session.js --agent pi > /tmp/session.txt

# 查看会话
cat /tmp/session.txt | grep -A 5 "tmux"
```

在会话中发现：
- 用户不知道如何创建新会话
- 缺少会话列表的命令
- 分屏操作不清晰

改进技能文档：
- 添加快速创建会话的示例
- 补充会话管理命令
- 提供分屏操作的详细步骤

### 创建新技能

```bash
# 提取一个重复出现的工作流
node skills/improve-skill/scripts/extract-session.js > /tmp/workflow.txt

# 分析工作流步骤
# 1. 检查环境
# 2. 安装依赖
# 3. 配置文件
# 4. 运行测试

# 创建新技能
# name: setup-project
# description: 快速设置新项目环境
```

## 注意事项

1. **会话大小**：默认显示最近 100 条消息，早期消息会被省略
2. **格式兼容**：不同代理的会话格式略有差异，脚本会自动处理
3. **编码路径**：确保 CWD 编码正确，否则找不到会话
4. **权限问题**：确保有读取会话文件的权限

## 故障排查

### 找不到会话

```bash
# 检查会话目录
ls -la ~/.pi/agent/sessions/

# 检查编码路径
node -e "console.log('--' + process.cwd().replace(/^\//, '').replace(/\//g, '-') + '--')"

# 手动指定会话文件
node extract-session.js /path/to/session.jsonl
```

### 解析失败

```bash
# 检查文件格式
head -1 /path/to/session.jsonl | jq .

# 验证 JSON 格式
jq . /path/to/session.jsonl | head -20
```

### 权限问题

```bash
# 检查文件权限
ls -l /path/to/session.jsonl

# 修复权限
chmod 644 /path/to/session.jsonl
```