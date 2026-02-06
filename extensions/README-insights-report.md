# Pi Insights Report Extension

生成可分享的 HTML 报告和 Markdown 改进计划，类似于 Claude Code 的 `/insights` 功能。

## 功能

### `/insights-report` - 生成完整报告

运行后会生成两个文件：
1. **HTML 报告** - 可视化的 insights 分析
2. **Markdown 改进计划** - 基于报告的工作流改进建议

## 安装

```bash
cp insights-report.ts ~/.pi/agent/extensions/
```

## 使用

```bash
pi
/insights-report
```

输出示例：
```
╔════════════════════════════════════════════════════════════════╗
║              📊 Insights Report Generated!                     ║
╚════════════════════════════════════════════════════════════════╝

✅ Your shareable insights report is ready:

   file:///home/user/.pi/agent/insights-reports/insights-report-2026-02-06T10-30-00.html

📈 Report includes:
   • Work content analysis
   • Usage patterns & trends
   • Strengths & improvement areas
   • Personalized recommendations
   • Future possibilities

🌐 Open the file in your browser to view the full report.

Improvement plan: file:///home/user/.pi/agent/insights-reports/improvement-plan-2026-02-06T10-30-00.md
```

## 报告内容

### HTML 报告包含

1. **📈 Summary** - 会话统计概览
2. **💼 Work Content** - 工作内容分析
   - Top Tasks - 最常做的任务
   - Languages - 使用的编程语言
   - File Types - 处理的文件类型
3. **📊 Usage Patterns** - 使用模式
   - Response Time Distribution - 响应时间分布
   - Common Patterns - 常见模式
   - Tool Usage - 工具使用统计
4. **✅ Strengths** - 做得好的地方
5. **⚠️ Areas for Improvement** - 需要改进的地方
6. **💡 Recommendations** - 建议
   - 推荐使用的功能
   - 建议创建的 skills
   - 建议添加到 AGENTS.md 的内容
7. **🚀 Future Possibilities** - 未来可能性
8. **📝 Overall Assessment** - 总体评估

### Markdown 改进计划包含

1. **🎯 核心目标** - 改进的主要方向
2. **📊 当前工作模式分析**
   - 优势（继续保持）
   - 改进空间（需要提升）
3. **🚀 三阶段改进计划**
   - 阶段1：立即改进（本周）
   - 阶段2：流程优化（本月）
   - 阶段3：系统化改进（持续）
4. **📈 成功指标** - 短期/中期/长期目标
5. **🎁 预期收益** - 效率、质量、知识沉淀
6. **🔄 持续改进循环** - PDCA循环
7. **✅ 下一步行动** - 今天/本周/本月可做的事
8. **📚 相关资源** - 相关文件链接

## 文件位置

报告保存在：
```
~/.pi/agent/insights-reports/
├── insights-report-YYYY-MM-DDTHH-MM-SS.html
└── improvement-plan-YYYY-MM-DDTHH-MM-SS.md
```

## 报告示例

### HTML 报告预览

![报告预览](https://via.placeholder.com/800x600/1a1a2e/ffffff?text=Insights+Report+Preview)

包含：
- 深色主题的可视化界面
- 动画效果的图表
- 响应式设计（支持移动端）
- 分类展示的统计数据

### Markdown 改进计划预览

```markdown
# 基于Insights报告的工作流改进计划

生成日期: 2026-02-06
基于: My Project (45 会话轮次, 23 工具调用)

## 🎯 核心目标

**从"假设成功"到"验证成功"**

---

## 📊 当前工作模式分析

### ✅ 优势（继续保持）

1. **良好的上下文管理**
   - 价值：引用12个文件，提供充足上下文
   - 保持：继续使用@file引用，考虑创建文件引用模板

2. **专注于Bug Fixing**
   - 价值：主要工作集中在调试和修复问题，目标明确
   - 保持：继续专注，考虑创建专项skill

### ⚠️ 改进空间（需要提升）

1. **过度依赖bash命令**
   - 影响：15次bash调用vs5次read，效率较低
   - 改进：使用@file引用代替cat/ls命令

---

## 🚀 三阶段改进计划

### 阶段1：立即改进（本周）

#### ✅ 快速胜利
- [ ] 创建 /fix 模板用于调试
- [ ] 设置TypeScript项目的AGENTS.md规范
- [ ] 测试 /compact 命令管理会话长度
...
```

## 与 Claude Code /insights 对比

| 特性 | Claude Code /insights | Pi /insights-report |
|------|----------------------|---------------------|
| 报告格式 | HTML | HTML + Markdown |
| 改进计划 | 内嵌在报告中 | 独立的详细计划 |
| 生成位置 | ~/.claude/usage-data/ | ~/.pi/agent/insights-reports/ |
| 数据隐私 | 发送到 Anthropic | 完全本地分析 |
| 可定制性 | 固定模板 | 完全可定制 |

## 定制报告

要修改报告内容，编辑扩展文件中的以下函数：

- `analyzeFileTypes()` - 修改文件类型分析
- `detectTopTasks()` - 修改任务检测逻辑
- `generateStrengths()` - 修改优势识别
- `generateProblemAreas()` - 修改问题识别
- `generateHTMLReport()` - 修改 HTML 样式
- `buildImprovementPlan()` - 修改改进计划结构

## 提示

1. **定期生成** - 建议每完成一个里程碑生成一次报告
2. **对比进步** - 保存历史报告，对比改进效果
3. **分享团队** - 将报告分享给团队成员
4. **执行计划** - 不要只看报告，要执行改进计划

## 未来增强

可能的改进方向：
- [ ] 历史报告对比功能
- [ ] 趋势分析（多报告对比）
- [ ] 团队聚合报告
- [ ] 更多可视化图表
- [ ] 导出为 PDF
- [ ] 自动定期生成

## 许可证

MIT - 可自由使用和修改
