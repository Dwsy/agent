# Web UI 扩展开发 - 文档索引

本目录包含 pi-mono Web UI 扩展开发的完整文档。

---

## 📚 文档列表

### 1. README.md - 主文档
**文件**: `./README.md`

**内容**:
- 项目概述和目标
- 完整的架构设计
- 技术栈选择
- 目录结构说明
- 详细的 API 设计
- 组件设计规范
- 开发指南
- 测试计划
- 部署指南
- 附录和参考资料

**适合人群**: 所有开发者、项目经理

**阅读时间**: 约 30 分钟

---

### 2. CODE_EXAMPLES.md - 代码示例
**文件**: `./CODE_EXAMPLES.md`

**内容**:
- 后端代码示例
  - WebServer 主类
  - 会话路由
  - 消息路由
  - 文件路由
  - Web 模式入口
- 前端代码示例
  - ServerContext
  - AppShell 组件
  - Sidebar 组件
  - MainArea 组件
  - FileTree 组件
  - Terminal 组件
- 配置文件示例
  - package.json
  - vite.config.ts
  - tsconfig.json
  - tailwind.config.js
- 测试代码示例
  - 后端测试
  - 前端测试

**适合人群**: 开发者

**阅读时间**: 约 45 分钟（配合代码实践）

---

### 3. TASKS.md - 任务清单
**文件**: `./TASKS.md`

**内容**:
- 12 个开发阶段的详细任务
- 每个阶段的子任务清单
- 验收标准
- 测试要求
- 总体检查清单
- 完成标准

**适合人群**: 项目经理、开发者

**阅读时间**: 约 20 分钟

---

## 🚀 快速开始

### 第一步: 了解项目

1. 阅读 `README.md` 的以下部分:
   - 项目概述
   - 架构设计
   - 技术栈

### 第二步: 开始开发

1. 查看 `TASKS.md`，找到你要负责的阶段
2. 阅读 `CODE_EXAMPLES.md` 中对应的代码示例
3. 按照任务清单逐项完成

### 第三步: 验证和测试

1. 每个阶段完成后，按照验收标准进行验证
2. 运行相关测试
3. 确保所有检查项都已完成

---

## 📖 推荐阅读顺序

### 项目经理

1. `README.md` - 完整阅读
2. `TASKS.md` - 了解任务分配
3. `SUMMARY.md` - 快速索引

### 后端开发者

1. `README.md` - 架构设计、API 设计
2. `CODE_EXAMPLES.md` - 后端代码示例
3. `TASKS.md` - 阶段 1-2 任务

### 前端开发者

1. `README.md` - 组件设计
2. `CODE_EXAMPLES.md` - 前端代码示例
3. `TASKS.md` - 阶段 3-9 任务

### 全栈开发者

1. `README.md` - 完整阅读
2. `CODE_EXAMPLES.md` - 所有代码示例
3. `TASKS.md` - 所有阶段任务

---

## 🎯 关键信息

### 项目目标

为 pi-mono/coding-agent 开发一个类似 OpenCodeWebUI 的 Web UI 扩展。

### 核心特性

- ✅ 聊天界面（复用 AgentInterface）
- ✅ 流式消息（SSE）
- ✅ 工具渲染
- ✅ Artifacts
- ✅ 附件支持
- ✅ 会话管理
- ✅ 文件浏览器
- ✅ 终端集成

### 技术栈

**后端**:
- Hono (HTTP 服务器)
- TypeScript
- Deno/Node.js

**前端**:
- SolidJS
- @mariozechner/pi-web-ui (复用)
- Vite
- Tailwind CSS

### 开发周期

**总计**: 6 周

| 周次 | 阶段 | 内容 |
|------|------|------|
| Week 1 | 阶段 1-2 | 后端基础设施 + API 开发 |
| Week 2 | 阶段 3-4 | 前端搭建 + ServerContext |
| Week 3 | 阶段 5-6 | 布局组件 + AgentInterface 集成 |
| Week 4 | 阶段 7-9 | FileTree + Terminal + Dialogs |
| Week 5 | 阶段 10-11 | CLI 集成 + 优化测试 |
| Week 6 | 阶段 12 | 文档 + 发布 |

---

## 🔗 相关链接

### 项目仓库

- [pi-mono](https://github.com/badlogic/pi-mono)
- [OpenCode](https://github.com/anomalyco/opencode)

### 技术文档

- [Hono 文档](https://hono.dev)
- [SolidJS 文档](https://www.solidjs.com)
- [Vite 文档](https://vitejs.dev)
- [Tailwind CSS 文档](https://tailwindcss.com)

### 内部文档

- [pi-web-ui README](/Users/dengwenyu/pi-mono/packages/web-ui/README.md)
- [pi-mono 主 README](/Users/dengwenyu/pi-mono/README.md)

---

## 📝 常见问题

### Q: 为什么要复用 @mariozechner/pi-web-ui？

A: pi-web-ui 已经提供了完整的聊天界面、对话框、存储系统等组件，复用可以节省 80% 的开发时间，同时保持架构一致性。

### Q: 为什么选择 SolidJS 而不是 React？

A: SolidJS 具有更好的性能（无虚拟 DOM）、更小的打包体积，且与 pi-web-ui 的 Web Components 兼容性更好。

### Q: SSE 和 WebSocket 有什么区别？

A: SSE 是单向的（服务器到客户端），更适合消息推送场景；WebSocket 是双向的，更适合实时通讯。我们的场景主要是服务器推送消息，所以选择 SSE。

### Q: 如何调试 SSE 连接？

A: 使用浏览器的 Network 面板，查看 EventStream 请求；或者在控制台查看 ServerContext 的日志。

### Q: 如何添加新的工具渲染器？

A: 参考 pi-web-ui 的工具渲染器注册机制，使用 `registerToolRenderer()` 函数。

---

## 📞 获取帮助

### 文档问题

- 检查 README.md 的附录
- 查看 CODE_EXAMPLES.md 的示例代码

### 开发问题

- 查看 TASKS.md 的验收标准
- 检查测试用例

### 其他问题

- 提交 GitHub Issue
- 查看 pi-mono 的 README

---

## ✅ 检查清单

在开始开发之前，请确认:

- [ ] 已阅读 README.md 的架构设计部分
- [ ] 已了解项目的目录结构
- [ ] 已安装所需的开发工具
- [ ] 已阅读 TASKS.md 中相关的任务
- [ ] 已查看 CODE_EXAMPLES.md 中的示例代码
- [ ] 已了解验收标准

---

## 📊 项目进度跟踪

使用 TASKS.md 中的检查清单来跟踪项目进度:

- 每完成一个子任务，勾选对应的复选框
- 每完成一个阶段，确认所有验收标准
- 定期更新总体检查清单

---

## 🎓 学习资源

### 后端开发

- Hono 官方教程
- REST API 设计最佳实践
- SSE 规范和实现

### 前端开发

- SolidJS 官方教程
- Web Components 规范
- 响应式设计原则

### 测试

- Vitest 文档
- Playwright 文档
- E2E 测试最佳实践

---

## 📄 许可证

遵循 pi-mono 项目的许可证（MIT）。

---

## 🙏 致谢

感谢 pi-mono 团队提供的优秀基础组件和架构设计。

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-17
**维护者**: Pi Agent Team

---

## 快速导航

- [返回主文档](./README.md)
- [查看代码示例](./CODE_EXAMPLES.md)
- [查看任务清单](./TASKS.md)
- [返回项目根](../)