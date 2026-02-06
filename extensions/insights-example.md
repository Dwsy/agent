# Insights Extension - Quick Start

## 安装 (1分钟)

```bash
# 复制扩展文件到 pi 扩展目录
cp insights.ts ~/.pi/agent/extensions/

# 可选：同时安装深度分析版本
cp insights-llm.ts ~/.pi/agent/extensions/
```

## 使用

启动 pi：

```bash
pi
```

在对话中输入：

```
/insights
```

## 示例输出

```
╔══════════════════════════════════════════════════════════════╗
║                    📊 Conversation Insights                  ║
╚══════════════════════════════════════════════════════════════╝

📈 Statistics:
   • Total messages: 45
   • Your messages: 18
   • Assistant responses: 18
   • Tool calls: 23

🔍 Patterns detected:
   🔄 You often start prompts with similar phrases
      Examples: "Can you help me fix"
      💡 Consider creating a custom prompt template or skill

   ⚠️ Several prompts were quite vague or short
      Examples: "fix this bug"
      💡 Try to be more specific: include file paths, error messages

💡 Recommendations:
   1. Create a custom skill for "Can you help me fix" tasks
   2. Be more specific: mention file paths and expected behavior
   3. Use @file references instead of cat/ls commands
```

## 根据建议行动

### 创建自定义命令

```bash
# 创建一个 /fix 命令
mkdir -p ~/.pi/agent/prompts
cat > ~/.pi/agent/prompts/fix.md << 'EOF'
Debug and fix the following issue:
- Problem: {{describe the problem}}
- Error message: {{paste error}}
- File(s) involved: @file

Steps:
1. Read and understand the relevant code
2. Identify the root cause
3. Implement the minimal fix
4. Verify the fix resolves the issue
EOF
```

现在在 pi 中可以使用 `/fix` 命令了！

### 创建 Skill

```bash
# 创建一个代码审查 skill
mkdir -p ~/.pi/agent/skills/code-review
cat > ~/.pi/agent/skills/code-review/SKILL.md << 'EOF'
# Code Review Skill

Use this skill when the user asks for code review.

## Steps
1. Read the code files specified
2. Check for:
   - Bugs and logic errors
   - Security issues
   - Performance problems
   - Code style consistency
3. Provide specific, actionable feedback

## Example
User: "Review this code @src/auth.ts"
→ Use this skill to perform structured review
EOF
```

## 工作原理

Claude Code 的 `/insights` 命令分析你的会话历史，识别：

1. **重复模式** - 经常重复的任务适合做成模板
2. **模糊提示** - 缺少上下文的提示
3. **低效工具使用** - 可以用 @引用代替的命令
4. **改进机会** - 具体的操作建议

pi 的 insights 扩展在本地完成这些分析，保护隐私的同时提供即时反馈。

## 对比

| 特性 | Claude Code /insights | pi /insights |
|------|----------------------|--------------|
| 速度 | 需要 API 调用 | 本地即时分析 |
| 隐私 | 发送到 Anthropic | 完全本地 |
| 可定制 | 固定功能 | 完全可修改 |
| 深度分析 | 内置 | 可选 LLM 增强 |

## 提示改进技巧

根据 insights 的建议，改进你的提示：

**❌ 改进前：**
```
fix this
```

**✅ 改进后：**
```
Fix the authentication error in @src/auth.ts

Error: "Invalid token signature"
Expected: Should validate JWT tokens correctly
Current: Throws error on valid tokens
```

**❌ 改进前：**
```
how does this work
```

**✅ 改进后：**
```
Explain how the caching mechanism works in @src/cache.ts

Focus on:
- Cache invalidation strategy
- TTL handling
- Memory cleanup
```

## 定期使用

建议定期运行 `/insights`：
- 完成一个任务后
- 会话变得很长时
- 感觉效率不高时

持续改进你的提示技巧！
