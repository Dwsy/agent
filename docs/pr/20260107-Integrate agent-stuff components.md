# Integrate agent-stuff components

> 融合 web-browser、improve-skill、pi-extensions 三个外部组件，增强 Pi Agent 能力

## 背景与目的 (Why)

为增强 Pi Agent 的能力，需要融合以下三个外部组件：
1. **Web Browser Skill** - 通过 CDP 控制浏览器进行网页交互
2. **Improve Skill** - 基于会话记录改进或创建技能
3. **Pi Extensions** - 交互式 Q&A 提取和回答

这些组件来自 [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) 仓库，经过验证可用于增强代理能力。

## 变更内容概述 (What)

### 新增技能
- `skills/web-browser/` - Chrome DevTools Protocol 网页控制
- `skills/improve-skill/` - 会话分析和技能改进

### 新增扩展
- `extensions/` - Pi Agent TypeScript 扩展
  - `answer.ts` - 交互式 Q&A TUI
  - `qna.ts` - 编辑器 Q&A 提取

### 文档更新
- `SYSTEM.md` - Skills Registry 和 Extensions Registry
- `docs/guides/web-browser-guide.md` - Web Browser 使用指南
- `docs/guides/improve-skill-guide.md` - Improve Skill 使用指南
- `docs/guides/pi-extensions-guide.md` - Pi Extensions 使用指南

### 依赖管理
- 使用 pnpm 管理各组件依赖
- 独立依赖管理，避免冲突

## 关联 Issue 与 ToDo 条目 (Links)
- **Issues:** `docs/issues/20260107-Integrate agent-stuff components.md`

## 测试与验证结果 (Test Result)

### Web Browser Skill
- [x] CDP 脚本下载完成
- [x] 依赖安装成功（puppeteer-core, chrome-remote-interface）
- [x] 文档创建完成

### Improve Skill
- [x] 会话提取脚本下载完成
- [x] Pi 会话路径验证通过
- [x] 文档创建完成

### Pi Extensions
- [x] TypeScript 扩展下载完成
- [x] 依赖安装成功（@mariozechner/pi-ai, @mariozechner/pi-coding-agent, @mariozechner/pi-tui）
- [x] 文档创建完成

### 文档
- [x] SYSTEM.md 更新完成
- [x] 使用指南创建完成

## 风险与影响评估 (Risk Assessment)

### 低风险
- 组件独立性强，不影响现有技能
- 依赖隔离，避免冲突
- 文档完善，易于使用

### 需要注意
- Pi Extensions 需要注册机制（待确认）
- Chrome 需要本地安装
- 会话文件路径需要正确编码

## 回滚方案 (Rollback Plan)

如需回滚，执行以下操作：

```bash
# 删除新增技能
rm -rf ~/.pi/agent/skills/web-browser
rm -rf ~/.pi/agent/skills/improve-skill

# 删除新增扩展
rm -rf ~/.pi/agent/extensions

# 恢复 SYSTEM.md
git checkout SYSTEM.md

# 删除使用指南
rm -rf ~/.pi/agent/docs/guides/web-browser-guide.md
rm -rf ~/.pi/agent/docs/guides/improve-skill-guide.md
rm -rf ~/.pi/agent/docs/guides/pi-extensions-guide.md
```

---

## 元数据

| 字段 | 内容 |
|------|------|
| **文件名** | 20260107-Integrate agent-stuff components.md |
| **创建时间** | 2025-01-07 |
| **状态** | 📝 待审查 |
| **类型** | ✨ Feature |
| **审查人** | - |

## 变更类型

- [x] ✨ New Feature
- [x] 📝 Documentation

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `skills/web-browser/` | 新增 | Chrome DevTools Protocol 网页控制技能 |
| `skills/improve-skill/` | 新增 | 会话分析和技能改进技能 |
| `extensions/` | 新增 | Pi Agent TypeScript 扩展目录 |
| `extensions/answer.ts` | 新增 | 交互式 Q&A TUI 扩展 |
| `extensions/qna.ts` | 新增 | 编辑器 Q&A 提取扩展 |
| `SYSTEM.md` | 修改 | 添加 Skills Registry 和 Extensions Registry |
| `docs/guides/web-browser-guide.md` | 新增 | Web Browser 使用指南 |
| `docs/guides/improve-skill-guide.md` | 新增 | Improve Skill 使用指南 |
| `docs/guides/pi-extensions-guide.md` | 新增 | Pi Extensions 使用指南 |

## 详细变更说明

### 1. Web Browser Skill

**问题：** Pi Agent 缺少网页交互能力

**方案：**
- 集成 Chrome DevTools Protocol 脚本
- 支持页面导航、JavaScript 执行、截图、元素选择
- 使用 pnpm 管理依赖

**影响范围：** 新增技能，不影响现有功能

### 2. Improve Skill

**问题：** 缺少基于会话的技能改进工具

**方案：**
- 集成会话提取脚本
- 支持 Claude Code、Pi、Codex 三种代理
- 验证 Pi 会话路径兼容性

**影响范围：** 新增技能，不影响现有功能

### 3. Pi Extensions

**问题：** 缺少交互式 Q&A 工具

**方案：**
- 集成 answer.ts 和 qna.ts 扩展
- 使用 pnpm 安装依赖
- 创建使用指南

**影响范围：** 新增扩展，需要注册机制

### 4. 文档更新

**问题：** 需要记录新组件的使用方法

**方案：**
- 更新 SYSTEM.md 注册新组件
- 创建详细使用指南
- 提供示例和故障排查

**影响范围：** 文档更新，无功能影响

## 破坏性变更

**是否有破坏性变更？**

- [x] 否

## 性能影响

**是否有性能影响？**

- [x] 无影响

## 依赖变更

**是否引入新的依赖？**

- [x] 是

**新增依赖：**
- `puppeteer-core` (Web Browser)
- `chrome-remote-interface` (Web Browser)
- `@mariozechner/pi-ai` (Pi Extensions)
- `@mariozechner/pi-coding-agent` (Pi Extensions)
- `@mariozechner/pi-tui` (Pi Extensions)

**理由：** 各组件独立依赖管理，避免全局依赖冲突

## 安全考虑

**是否有安全影响？**

- [x] 否

## 文档变更

**是否需要更新文档？**

- [x] 是
- `SYSTEM.md` - Skills Registry 和 Extensions Registry
- `docs/guides/web-browser-guide.md` - 新增
- `docs/guides/improve-skill-guide.md` - 新增
- `docs/guides/pi-extensions-guide.md` - 新增

## 代码审查检查清单

### 功能性
- [x] 组件集成完成
- [x] 依赖安装成功
- [x] 文档创建完成

### 代码质量
- [x] 使用 pnpm 管理依赖
- [x] 独立依赖管理
- [x] 文档完善

### 测试
- [x] 会话提取验证通过
- [ ] CDP 连接测试（需要 Chrome）
- [ ] Extensions 注册测试（需要注册机制）

## 审查日志

- **[2025-01-07 13:12] [Pi Agent]**: 创建 PR，等待审查

## 最终状态

- **合并时间:** -
- **合并人:** -
- **Commit Hash:** -
- **部署状态:** 待部署