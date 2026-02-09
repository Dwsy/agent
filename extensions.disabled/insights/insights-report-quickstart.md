# Insights Report 快速上手指南

## 一分钟安装

```bash
cp insights-report.ts ~/.pi/agent/extensions/
```

## 使用

```bash
pi
/insights-report
```

你会看到：

```
╔════════════════════════════════════════════════════════════════╗
║              📊 Insights Report Generated!                     ║
╚════════════════════════════════════════════════════════════════╝

✅ Your shareable insights report is ready:

   file:///home/user/.pi/agent/insights-reports/insights-report-...

🌐 Open the file in your browser to view the full report.

Improvement plan: file:///home/user/.pi/agent/insights-reports/improvement-plan-...
```

## 查看报告

### HTML 报告

用浏览器打开 HTML 文件：

```bash
# macOS
open ~/.pi/agent/insights-reports/insights-report-*.html

# Linux
xdg-open ~/.pi/agent/insights-reports/insights-report-*.html

# Windows
start ~/.pi/agent/insights-reports/insights-report-*.html
```

### Markdown 改进计划

用 Markdown 编辑器或 VS Code 打开：

```bash
code ~/.pi/agent/insights-reports/improvement-plan-*.md
```

## 报告包含什么？

### 📊 HTML 报告
- 会话统计（消息数、时长、工具调用）
- 工作内容分析（任务类型、语言、文件）
- 使用模式（响应时间、工具使用）
- 优势和改进空间
- 个性化建议

### 📝 Markdown 改进计划
- 核心目标
- 当前工作模式分析
- 三阶段改进计划
- 成功指标
- 下一步行动清单

## 示例工作流程

### 1. 完成一个任务后

```bash
# 完成开发工作...
/insights-report
# 查看报告，了解自己的模式
# 阅读改进计划
# 执行建议的行动
```

### 2. 每周回顾

```bash
# 周五下班前
/insights-report
# 对比上周报告
# 检查改进计划的执行情况
# 调整下周计划
```

### 3. 团队分享

```bash
# 生成报告
/insights-report

# 复制到项目文档
cp ~/.pi/agent/insights-reports/insights-report-*.html ./docs/
cp ~/.pi/agent/insights-reports/improvement-plan-*.md ./docs/

# 提交到仓库
git add docs/
git commit -m "Add insights report and improvement plan"
```

## 报告文件位置

```
~/.pi/agent/insights-reports/
├── insights-report-2026-02-06T10-30-00.html
├── improvement-plan-2026-02-06T10-30-00.md
├── insights-report-2026-02-05T15-20-00.html
├── improvement-plan-2026-02-05T15-20-00.md
└── ...
```

## 清理旧报告

```bash
# 查看所有报告
ls -la ~/.pi/agent/insights-reports/

# 删除30天前的报告（macOS）
find ~/.pi/agent/insights-reports/ -name "*.html" -mtime +30 -delete
find ~/.pi/agent/insights-reports/ -name "*.md" -mtime +30 -delete

# 删除30天前的报告（Linux）
find ~/.pi/agent/insights-reports/ -name "*.html" -mtime +30 -exec rm {} \;
find ~/.pi/agent/insights-reports/ -name "*.md" -mtime +30 -exec rm {} \;
```

## 故障排除

### 报告未生成

```bash
# 检查目录权限
ls -la ~/.pi/agent/

# 创建目录
mkdir -p ~/.pi/agent/insights-reports
```

### 扩展未加载

```bash
# 重新加载扩展
/reload

# 或重启 pi
exit
pi
```

### 命令不存在

```bash
# 检查扩展文件位置
ls -la ~/.pi/agent/extensions/insights-report.ts

# 确认文件存在后重启 pi
```

## 下一步

1. 运行 `/insights-report` 生成你的第一个报告
2. 在浏览器中查看 HTML 报告
3. 阅读 Markdown 改进计划
4. 执行改进计划中的行动项
5. 定期生成新报告，追踪改进进度

## 更多功能

同时安装其他 insights 扩展：

```bash
# 快速分析（不生成文件）
cp insights.ts ~/.pi/agent/extensions/

# 深度分析（使用 LLM）
cp insights-llm.ts ~/.pi/agent/extensions/

# 然后可以使用：
/insights        # 快速分析
/insights-deep   # 深度分析
/insights-report # 生成报告
```

享受数据驱动的工作流改进！
