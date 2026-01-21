# Web UI 扩展开发任务清单

本文档包含 Web UI 扩展开发的所有任务，按阶段组织。

---

## 阶段 1: 后端基础设施 (1 周)

### 1.1 项目结构创建

- [ ] 创建 `packages/coding-agent/src/modes/web/` 目录
- [ ] 创建以下文件结构:
  ```
  web/
  ├── index.ts
  ├── server.ts
  ├── sse.ts
  └── routes/
      ├── sessions.ts
      ├── messages.ts
      ├── tools.ts
      └── files.ts
  ```
- [ ] 添加到 `packages/coding-agent/src/modes/index.ts` 导出

### 1.2 依赖安装

- [ ] 在 `packages/coding-agent/package.json` 中添加:
  ```json
  {
    "dependencies": {
      "hono": "^4.0.0",
      "@hono/zod-validator": "^0.2.0",
      "@hono/node-server": "^1.0.0",
      "zod": "^3.0.0"
    }
  }
  ```
- [ ] 运行 `bun install` 安装依赖

### 1.3 WebServer 类实现

- [ ] 实现 `WebServer` 类的基础结构
- [ ] 实现 `setupMiddleware()` 方法
  - [ ] CORS 中间件
  - [ ] 请求日志中间件
  - [ ] 错误处理中间件
  - [ ] 404 处理中间件
- [ ] 实现 `setupRoutes()` 方法
  - [ ] 健康检查端点 `/global/health`
  - [ ] SSE 事件流端点 `/global/event`
- [ ] 实现 `start()` 方法
- [ ] 实现 `stop()` 方法

### 1.4 SSE 事件流

- [ ] 实现 SSE 连接管理
- [ ] 实现 AgentEvent 到 ServerEvent 的转换
  - [ ] `state-update` 事件
  - [ ] `message-start` 事件
  - [ ] `message-update` 事件
  - [ ] `message-end` 事件
  - [ ] `tool-start` 事件
  - [ ] `tool-end` 事件
- [ ] 实现 keep-alive 机制 (每 30 秒发送 ping)
- [ ] 实现连接关闭清理

### 1.5 类型定义

- [ ] 定义 `ServerEvent` 类型
- [ ] 定义 `RpcCommand` 类型
- [ ] 定义 `RpcResponse` 类型
- [ ] 定义 `WebServerOptions` 接口

### 1.6 单元测试

- [ ] 编写 `server.test.ts`
  - [ ] 测试服务器启动
  - [ ] 测试健康检查端点
  - [ ] 测试 SSE 连接
  - [ ] 测试服务器停止

### 阶段 1 验收标准

```bash
# 启动服务器
pi --mode web --port 3721

# 健康检查
curl http://localhost:3721/global/health
# 预期: {"status":"ok","version":"0.45.0"}

# SSE 连接
curl -N http://localhost:3721/global/event
# 预期: 持续接收 ping 事件
```

---

## 阶段 2: 后端 API 开发 (1 周)

### 2.1 会话管理 API

- [ ] 实现 `routes/sessions.ts`
  - [ ] `GET /sessions` - 列出所有会话
  - [ ] `GET /sessions/current` - 获取当前会话
  - [ ] `POST /sessions` - 创建新会话
  - [ ] `POST /sessions/:id/fork` - Fork 会话
  - [ ] `PATCH /sessions/:id` - 更新会话
  - [ ] `DELETE /sessions/:id` - 删除会话
- [ ] 添加 Zod 验证 schema
- [ ] 实现 Session 中间件

### 2.2 消息 API

- [ ] 实现 `routes/messages.ts`
  - [ ] `POST /sessions/:id/messages` - 发送消息
  - [ ] `POST /sessions/:id/bash` - 执行 bash 命令
  - [ ] `POST /sessions/:id/abort` - 中断执行
  - [ ] `POST /sessions/:id/model` - 设置模型
  - [ ] `POST /sessions/:id/thinking` - 设置思考级别
- [ ] 添加 Zod 验证 schema
- [ ] 实现错误处理

### 2.3 工具 API

- [ ] 实现 `routes/tools.ts`
  - [ ] `GET /tools` - 列出所有工具
  - [ ] `POST /tools/:toolName` - 执行工具
- [ ] 添加 Zod 验证 schema
- [ ] 实现工具执行逻辑

### 2.4 文件操作 API

- [ ] 实现 `routes/files.ts`
  - [ ] `GET /file` - 列出文件
  - [ ] `GET /file/content` - 读取文件
  - [ ] `PUT /file/content` - 写入文件
  - [ ] `GET /file/status` - Git 状态
- [ ] 添加 Zod 验证 schema
- [ ] 实现文件操作逻辑
- [ ] 实现 Git 状态查询

### 2.5 CORS 和安全

- [ ] 配置 CORS 白名单
- [ ] 添加请求限流 (可选)
- [ ] 添加认证支持 (可选)
- [ ] 添加安全头

### 2.6 API 测试

- [ ] 编写 `sessions.test.ts`
- [ ] 编写 `messages.test.ts`
- [ ] 编写 `tools.test.ts`
- [ ] 编写 `files.test.ts`
- [ ] 目标测试覆盖率 > 80%

### 阶段 2 验收标准

```bash
# 创建会话
curl -X POST http://localhost:3721/sessions
# 预期: 返回会话 ID

# 发送消息
curl -X POST http://localhost:3721/sessions/{id}/messages \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'
# 预期: 返回成功响应

# 列出文件
curl "http://localhost:3721/file?path=./"
# 预期: 返回文件列表
```

---

## 阶段 3: 前端项目搭建 (3 天)

### 3.1 创建包结构

- [ ] 创建 `packages/web-ui-app/` 目录
- [ ] 创建以下文件结构:
  ```
  web-ui-app/
  ├── src/
  │   ├── app.tsx
  │   ├── main.tsx
  │   ├── components/
  │   ├── context/
  │   ├── hooks/
  │   ├── types/
  │   └── utils/
  ├── public/
  ├── index.html
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  └── tailwind.config.js
  ```

### 3.2 配置文件

- [ ] 创建 `package.json`
  - [ ] 添加依赖: solid-js, @solidjs/router, vite, 等
  - [ ] 添加 scripts: dev, build, preview
- [ ] 创建 `tsconfig.json`
  - [ ] 配置 TypeScript 严格模式
  - [ ] 配置 JSX 为 solid-js
- [ ] 创建 `vite.config.ts`
  - [ ] 配置 solid-plugin
  - [ ] 配置代理到后端
- [ ] 创建 `tailwind.config.js`
  - [ ] 配置主题颜色
  - [ ] 配置内容路径

### 3.3 基础应用

- [ ] 创建 `index.html`
  - [ ] 添加 meta 标签
  - [ ] 添加 app 挂载点
- [ ] 创建 `main.tsx`
  - [ ] 导入 app.css
  - [ ] 渲染 App 组件
- [ ] 创建 `app.tsx`
  - [ ] 实现基础布局
  - [ ] 添加加载状态

### 3.4 样式配置

- [ ] 创建 `src/app.css`
  - [ ] 导入 Tailwind
  - [ ] 添加自定义样式
- [ ] 配置暗色模式
- [ ] 配置 CSS 变量

### 3.5 依赖安装

- [ ] 运行 `bun install`
- [ ] 验证所有依赖安装成功

### 阶段 3 验收标准

```bash
# 启动开发服务器
cd packages/web-ui-app
bun run dev

# 访问
open http://localhost:5173
# 预期: 显示应用壳，无错误
```

---

## 阶段 4: ServerContext 和事件适配 (3 天)

### 4.1 ServerContext

- [ ] 创建 `src/context/server.ts`
  - [ ] 实现 `ServerContext`
  - [ ] 实现 `useServer` hook
  - [ ] 实现 `ServerProvider` 组件
- [ ] 定义接口
  - [ ] `ServerContextValue` 接口
  - [ ] `RpcCommand` 类型
  - [ ] `RpcResponse` 类型

### 4.2 SSE 连接管理

- [ ] 实现 `connect()` 函数
  - [ ] 创建 EventSource 连接
  - [ ] 处理 onopen 事件
  - [ ] 处理 onmessage 事件
  - [ ] 处理 onerror 事件
- [ ] 实现 `disconnect()` 函数
- [ ] 实现自动重连机制
  - [ ] 重连延迟: 3 秒
  - [ ] 最大重连次数: 10 次
  - [ ] 指数退避 (可选)

### 4.3 事件订阅

- [ ] 实现 `subscribe()` 函数
  - [ ] 管理订阅者列表
  - [ ] 返回取消订阅函数
- [ ] 实现事件分发
  - [ ] 通知所有订阅者
  - [ ] 处理事件解析错误

### 4.4 命令发送

- [ ] 实现 `send()` 函数
  - [ ] 发送 POST 请求
  - [ ] 处理响应
  - [ ] 错误处理
- [ ] 实现 `fetch` 包装器

### 4.5 连接状态

- [ ] 实现连接状态信号
  - [ ] `connected` 信号
  - [ ] `connecting` 信号
  - [ ] `error` 信号
- [ ] 实现状态更新逻辑

### 4.6 生命周期

- [ ] 实现 `onMount` 钩子
  - [ ] 自动连接
- [ ] 实现 `onCleanup` 钩子
  - [ ] 清理连接

### 4.7 测试

- [ ] 编写 `server.test.ts`
  - [ ] 测试连接建立
  - [ ] 测试事件订阅
  - [ ] 测试命令发送
  - [ ] 测试重连机制

### 阶段 4 验收标准

- 打开浏览器后自动连接 SSE
- 断线后自动重连
- 控制台无错误
- 事件正确接收

---

## 阶段 5: 布局组件开发 (4 天)

### 5.1 AppShell

- [ ] 创建 `src/components/Layout/AppShell.tsx`
  - [ ] 实现基础布局结构
  - [ ] 集成 Sidebar
  - [ ] 集成 MainArea
  - [ ] 响应式设计

### 5.2 Sidebar

- [ ] 创建 `src/components/Layout/Sidebar.tsx`
  - [ ] 实现侧边栏结构
  - [ ] 添加 Header
  - [ ] 添加会话列表
  - [ ] 添加底部操作

### 5.3 SidebarHeader

- [ ] 创建 `src/components/Layout/SidebarHeader.tsx`
  - [ ] 显示标题
  - [ ] 显示 Logo/Icon
  - [ ] 样式设计

### 5.4 SidebarItem

- [ ] 创建 `src/components/Layout/SidebarItem.tsx`
  - [ ] 接收 icon, label, onClick props
  - [ ] 实现点击效果
  - [ ] 添加 hover 状态
  - [ ] 添加 active 状态

### 5.5 响应式布局

- [ ] 移动端适配
  - [ ] 侧边栏折叠
  - [ ] 汉堡菜单
- [ ] 平板适配
  - [ ] 侧边栏宽度调整
- [ ] 桌面端优化

### 5.6 暗色模式

- [ ] 实现暗色模式切换
- [ ] 保存用户偏好
- [ ] CSS 变量配置

### 5.7 测试

- [ ] 编写布局组件测试
- [ ] 测试响应式断点
- [ ] 测试暗色模式切换

### 阶段 5 验收标准

- 侧边栏正常显示
- 响应式布局在手机/平板正常
- 暗色模式切换正常
- 所有交互动效流畅

---

## 阶段 6: AgentInterface 集成 (3 天)

### 6.1 依赖配置

- [ ] 在 `package.json` 中添加 `@mariozechner/pi-web-ui`
- [ ] 配置 Vite 别名
- [ ] 导入样式文件

### 6.2 ChatArea 组件

- [ ] 创建 `src/components/MainArea/ChatArea.tsx`
  - [ ] 集成 AgentInterface
  - [ ] 使用 ref 获取组件实例
  - [ ] 配置属性

### 6.3 事件适配

- [ ] 实现 ServerEvent 到 AgentEvent 的适配
  - [ ] `message.updated` 事件
  - [ ] `tool.start` 事件
  - [ ] `tool.end` 事件
- [ ] 订阅 ServerContext 事件
- [ ] 更新 AgentInterface

### 6.4 消息发送

- [ ] 实现消息发送逻辑
  - [ ] 调用 ServerContext.send()
  - [ ] 处理响应
  - [ ] 错误处理

### 6.5 流式消息

- [ ] 实现流式消息显示
  - [ ] 实时更新 DOM
  - [ ] 打字效果
- [ ] 测试流式性能

### 6.6 工具调用显示

- [ ] 确保工具调用正确渲染
- [ ] 测试 BashRenderer
- [ ] 测试其他工具渲染器

### 6.7 测试

- [ ] 编写 ChatArea 测试
- [ ] 测试消息发送
- [ ] 测试流式显示
- [ ] 测试工具渲染

### 阶段 6 验收标准

- 输入消息后按 Enter 发送
- 消息正确显示
- 流式消息显示正常
- 工具调用正确渲染

---

## 阶段 7: FileTree 组件 (3 天)

### 7.1 FileTree 组件

- [ ] 创建 `src/components/MainArea/FileTree.tsx`
  - [ ] 实现文件树结构
  - [ ] 文件节点渲染
  - [ ] 展开/折叠逻辑

### 7.2 文件加载

- [ ] 实现文件列表加载
  - [ ] 调用 `/file` API
  - [ ] 处理响应
  - [ ] 错误处理
- [ ] 添加加载状态

### 7.3 文件节点

- [ ] 实现文件图标
  - [ ] 文件夹图标 (展开/折叠)
  - [ ] 文件图标 (根据类型)
- [ ] 实现节点样式
- [ ] 实现点击效果

### 7.4 展开/折叠

- [ ] 实现展开状态管理
  - [ ] 使用 Set 存储展开路径
  - [ ] toggleExpand 函数
- [ ] 实现递归渲染
  - [ ] 支持多级目录
  - [ ] 缩进计算

### 7.5 文件搜索

- [ ] 添加搜索框
- [ ] 实现搜索逻辑
  - [ ] 过滤文件列表
  - [ ] 高亮匹配项
- [ ] 实时搜索

### 7.6 文件预览

- [ ] 添加文件预览功能 (可选)
  - [ ] 文本文件预览
  - [ ] 图片预览
- [ ] 实现预览面板

### 7.7 测试

- [ ] 编写 FileTree 测试
- [ ] 测试文件加载
- [ ] 测试展开/折叠
- [ ] 测试搜索功能

### 阶段 7 验收标准

- 显示项目文件树
- 点击展开/折叠
- 搜索框过滤文件
- 文件图标正确显示

---

## 阶段 8: Terminal 组件 (2 天)

### 8.1 Terminal 组件

- [ ] 创建 `src/components/MainArea/Terminal.tsx`
  - [ ] 实现终端结构
  - [ ] 黑色背景 + 绿色文字
  - [ ] 等宽字体

### 8.2 命令执行

- [ ] 实现 executeCommand 函数
  - [ ] 调用 `/bash` API
  - [ ] 处理响应
  - [ ] 错误处理
- [ ] 添加命令行提示符

### 8.3 输出显示

- [ ] 实现输出行渲染
  - [ ] input 行 (白色)
  - [ ] output 行 (绿色)
  - [ ] error 行 (红色)
- [ ] 实现时间戳 (可选)

### 8.4 自动滚动

- [ ] 实现自动滚动到底部
- [ ] 使用 MutationObserver
- [ ] 添加手动滚动检测

### 8.5 命令输入

- [ ] 实现命令输入框
  - [ ] 监听 Enter 键
  - [ ] 清空输入
  - [ ] 历史记录 (可选)
- [ ] 实现命令高亮 (可选)

### 8.6 测试

- [ ] 编写 Terminal 测试
- [ ] 测试命令执行
- [ ] 测试输出显示
- [ ] 测试自动滚动

### 阶段 8 验收标准

- 执行 bash 命令后显示输出
- 语法高亮正常
- 自动滚动到底部
- 错误信息正确显示

---

## 阶段 9: Dialogs 集成 (2 天)

### 9.1 SettingsDialog

- [ ] 导入 SettingsDialog
- [ ] 添加设置按钮
- [ ] 实现打开逻辑
- [ ] 测试功能

### 9.2 SessionListDialog

- [ ] 导入 SessionListDialog
- [ ] 添加会话列表按钮
- [ ] 实现打开逻辑
- [ ] 实现加载/删除回调

### 9.3 ModelSelector

- [ ] 导入 ModelSelector
- [ ] 添加模型选择按钮
- [ ] 实现打开逻辑
- [ ] 实现选择回调

### 9.4 ApiKeyPromptDialog

- [ ] 导入 ApiKeyPromptDialog
- [ ] 实现 API Key 提示逻辑
- [ ] 测试功能

### 9.5 快捷键

- [ ] 添加快捷键支持
  - [ ] Cmd/Ctrl + , : 打开设置
  - [ ] Cmd/Ctrl + K : 打开会话列表
  - [ ] Cmd/Ctrl + M : 打开模型选择
- [ ] 实现快捷键监听

### 9.6 测试

- [ ] 测试所有对话框
- [ ] 测试快捷键
- [ ] 测试回调函数

### 阶段 9 验收标准

- 点击设置按钮打开对话框
- 对话框功能正常
- 快捷键触发正常

---

## 阶段 10: CLI 集成 (2 天)

### 10.1 CLI 选项

- [ ] 修改 `packages/coding-agent/src/main.ts`
- [ ] 添加 `--mode web` 选项
- [ ] 添加 `--port` 选项
- [ ] 添加 `--host` 选项
- [ ] 添加 `--open` 选项

### 10.2 Web 模式入口

- [ ] 修改 `packages/coding-agent/src/modes/index.ts`
- [ ] 导入 `runWebMode`
- [ ] 添加到模式分发逻辑

### 10.3 Web 模式实现

- [ ] 完善 `src/modes/web/index.ts`
  - [ ] 创建 AgentSession
  - [ ] 创建 WebServer
  - [ ] 启动服务器
- [ ] 实现优雅关闭

### 10.4 自动打开浏览器

- [ ] 实现 `--open` 逻辑
- [ ] 使用 `open` 包打开浏览器
- [ ] 构造正确的 URL

### 10.5 帮助文档

- [ ] 更新 CLI 帮助信息
- [ ] 添加 Web 模式说明
- [ ] 添加示例

### 10.6 测试

- [ ] 测试 CLI 选项
- [ ] 测试 Web 模式启动
- [ ] 测试自动打开浏览器
- [ ] 测试优雅关闭

### 阶段 10 验收标准

```bash
# 启动 Web 模式
pi --mode web --port 3721 --open

# 预期: 服务器启动，浏览器自动打开
```

---

## 阶段 11: 优化和测试 (3 天)

### 11.1 性能优化

- [ ] SSE 连接优化
  - [ ] 事件批量处理
  - [ ] 减少 DOM 更新
- [ ] 消息渲染优化
  - [ ] 虚拟滚动 (可选)
  - [ ] 懒加载
- [ ] 文件树优化
  - [ ] 懒加载子目录
  - [ ] 缓存文件列表

### 11.2 内存泄漏检查

- [ ] 检查事件订阅清理
- [ ] 检查定时器清理
- [ ] 检查 SSE 连接清理
- [ ] 使用 Chrome DevTools 检测

### 11.3 错误处理

- [ ] 完善后端错误处理
- [ ] 完善前端错误处理
- [ ] 添加错误边界
- [ ] 添加错误日志

### 11.4 E2E 测试

- [ ] 设置 Playwright
- [ ] 编写 E2E 测试
  - [ ] 发送消息流程
  - [ ] 工具执行流程
  - [ ] 会话管理流程
- [ ] 目标: 主要流程 100% 覆盖

### 11.5 代码审查

- [ ] 后端代码审查
- [ ] 前端代码审查
- [ ] 修复审查发现的问题
- [ ] 代码格式化

### 11.6 文档更新

- [ ] 更新 README
- [ ] 更新 API 文档
- [ ] 添加使用示例
- [ ] 添加故障排除指南

### 阶段 11 验收标准

- 无内存泄漏
- E2E 测试全部通过
- 性能指标达标
- 代码审查通过

---

## 阶段 12: 文档和发布 (2 天)

### 12.1 用户文档

- [ ] 编写用户指南
  - [ ] 安装说明
  - [ ] 快速开始
  - [ ] 功能介绍
  - [ ] 常见问题
- [ ] 添加截图/视频

### 12.2 开发者文档

- [ ] 编写开发者指南
  - [ ] 架构说明
  - [ ] 组件文档
  - [ ] API 文档
  - [ ] 贡献指南

### 12.3 API 文档

- [ ] 生成 API 文档
  - [ ] 使用 TypeDoc 或类似工具
  - [ ] 添加 JSDoc 注释
- [ ] 发布 API 文档

### 12.4 README 更新

- [ ] 更新主 README
- [ ] 添加功能特性
- [ ] 添加安装说明
- [ ] 添加使用示例

### 12.5 发布说明

- [ ] 编写 CHANGELOG
- [ ] 添加新功能列表
- [ ] 添加破坏性变更
- [ ] 添加迁移指南

### 12.6 示例项目

- [ ] 创建示例项目
- [ ] 添加常见用例
- [ ] 添加配置示例
- [ ] 发布示例

### 阶段 12 验收标准

- 文档完整
- 示例可运行
- 发布说明清晰
- CHANGELOG 更新

---

## 总体检查清单

### 后端

- [ ] HTTP 服务器正常运行
- [ ] SSE 事件流稳定
- [ ] 所有 API 端点工作正常
- [ ] 错误处理完善
- [ ] 单元测试通过
- [ ] 集成测试通过

### 前端

- [ ] 应用正常启动
- [ ] SSE 连接稳定
- [ ] 自动重连工作正常
- [ ] 所有组件正常工作
- [ ] 响应式布局正常
- [ ] 暗色模式正常
- [ ] 无控制台错误

### 集成

- [ ] CLI 启动 Web 模式正常
- [ ] 消息发送正常
- [ ] 流式显示正常
- [ ] 工具调用正常
- [ ] 文件浏览器正常
- [ ] 终端正常

### 文档

- [ ] README 更新
- [ ] 用户文档完整
- [ ] API 文档完整
- [ ] 代码注释充分
- [ ] 示例项目可运行

### 测试

- [ ] 单元测试覆盖率 > 80%
- [ ] E2E 测试通过
- [ ] 性能测试达标
- [ ] 无内存泄漏

---

## 完成标准

### 功能完整性

- ✅ 所有核心功能实现
- ✅ 所有 API 端点工作正常
- ✅ 所有 UI 组件正常工作
- ✅ 响应式设计正常
- ✅ 暗色模式正常

### 质量

- ✅ 代码质量达标
- ✅ 测试覆盖率达标
- ✅ 无已知严重 bug
- ✅ 性能指标达标
- ✅ 无内存泄漏

### 文档

- ✅ 用户文档完整
- ✅ 开发者文档完整
- ✅ API 文档完整
- ✅ 示例项目可运行
- ✅ README 更新

### 发布准备

- ✅ CHANGELOG 更新
- ✅ 版本号更新
- ✅ 发布说明编写
- ✅ 标签创建

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-17