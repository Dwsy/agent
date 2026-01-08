---
title: 封装 zai-mcp-server 为技能
status: ✅ 已完成
priority: 🟠 P1
created: 2026-01-07
---

# Issue: 封装 zai-mcp-server 为技能

## 元数据

| 字段 | 内容 |
|------|------|
| **文件名** | 20260107-封装 zai-mcp-server 为技能.md |
| **创建时间** | 2026-01-07 |
| **状态** | ✅ 已完成 |
| **优先级** | 🟠 P1 |
| **预计工时** | 2h |

## Goal

将智谱 AI 的 `@z_ai/mcp-server` MCP 服务器封装为 Claude Skill，提供 8 个多模态视觉分析工具（UI 转代码、OCR、错误诊断、技术图表理解等）。

## 背景/问题

用户需要使用智谱 AI 的多模态视觉分析能力，但直接使用 MCP 会占用大量上下文（所有工具定义在启动时加载）。使用 Skill 方式可以实现渐进式加载，节省 96% 的上下文。

## 验收标准 (Acceptance Criteria)

- [x] WHEN 用户安装技能，系统 SHALL 能够列出所有 8 个可用工具
- [x] WHERE 用户调用工具，系统 SHALL 正确执行并返回结果
- [x] IF 工具执行超时，系统 SHALL 在 15 秒内超时并返回错误
- [x] WHERE 用户查询工具详情，系统 SHALL 返回完整的 inputSchema

## 实施阶段

### Phase 1: 规划和准备
- [x] 分析 `@z_ai/mcp-server` 的工具列表和参数
- [x] 研究 `mcp-to-skill-converter` 的实现方式
- [x] 测试 MCP 服务器的连接和工具调用

### Phase 2: 执行
- [x] 使用 converter 生成基础技能结构
- [x] 修复 executor.py 的 `stdio_client` 上下文管理问题
- [x] 重写 SKILL.md，添加真实的 8 个工具文档
- [x] 测试 `--list`、`--describe` 和 `--call` 命令
- [x] 安装到 `~/.claude/skills/zai-mcp`

### Phase 3: 验证
- [x] 测试 `executor.py --list` 成功返回 8 个工具
- [x] 测试 `executor.py --describe ui_to_artifact` 返回完整 schema
- [x] 使用 tmux 验证后台任务不阻塞

### Phase 4: 交付
- [x] 更新 SKILL.md 文档
- [x] 验证技能可被 Claude 发现
- [x] 创建本 PR

## 关键决策

| 决策 | 理由 |
|------|------|
| 使用简化的 executor.py | 原版 converter 的 executor 有复杂的超时逻辑，简化后更稳定 |
| 使用 async with 上下文 | 确保 MCP 连接正确清理，避免资源泄漏 |
| 添加 timeout 15s | 防止 MCP 服务器无响应时永久阻塞 |
| 保留 stderr 输出 | 便于调试，MCP 服务器的 INFO 日志有助于排查问题 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-01-07 | `object _AsyncGeneratorContextManager can't be used in 'await' expression` | 修复 `stdio_client` 的使用方式，正确处理异步上下文管理器 |
| 2026-01-07 | executor.py 阻塞，无输出 | MCP 服务器的 INFO 日志输出到 stderr，stdout 被阻塞；添加显式 flush |
| 2026-01-07 | `NameError: name 'argparse' is not defined` | 简化版本忘记导入 argparse，补充导入 |

## 相关资源

- [x] 相关文档: `~/.claude/skills/zai-mcp/SKILL.md`
- [x] 参考资料: https://github.com/GBSOSS/-mcp-to-skill-converter
- [x] 参考资料: https://docs.bigmodel.cn/cn/coding-plan/mcp/vision-mcp-server

## Notes

### 工具列表

1. **ui_to_artifact** - UI 截图转代码/提示词/规范/描述
2. **extract_text_from_screenshot** - OCR 文字提取
3. **diagnose_error_screenshot** - 错误诊断
4. **understand_technical_diagram** - 技术图表理解
5. **analyze_data_visualization** - 数据可视化分析
6. **ui_diff_check** - UI 差异对比
7. **analyze_image** - 通用图像分析
8. **analyze_video** - 视频分析（最大 8MB）

### 技能结构

```
~/.claude/skills/zai-mcp/
├── SKILL.md          # 技能文档
├── executor.py       # MCP 通信处理器
├── mcp-config.json   # MCP 服务器配置
└── package.json      # 依赖声明
```

### 使用示例

```bash
# 列出工具
cd ~/.claude/skills/zai-mcp
python executor.py --list

# 查看工具详情
python executor.py --describe ui_to_artifact

# 调用工具
python executor.py --call '{"tool": "ui_to_artifact", "arguments": {"image_source": "/path/to/image.png", "output_type": "code", "prompt": "Generate React code"}}'
```

---

## Status 更新日志

- **2026-01-07 15:38**: 状态变更 → ✅ 已完成，备注: 所有测试通过，技能已安装
- **2026-01-07 15:22**: 状态变更 → 🚧 进行中，备注: 修复 executor.py 的阻塞问题
- **2026-01-07 15:18**: 状态变更 → 📝 待办，备注: 创建 Issue