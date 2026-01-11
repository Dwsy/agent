# CodeMap - AI 驱动的代码可视化工具

> 🎯 将复杂的代码执行流转化为清晰的、分步骤的追踪链路

[English](./README.md) | [快速开始](./QUICKSTART.md) | [结构说明](./STRUCTURE.md) | [技能定义](./SKILL.md) | [交付文档](./DELIVERY.md)

---

## 📖 目录

- [🚀 快速开始](#快速开始)
- [📖 项目说明](#项目说明)
- [🏗️ 项目结构](#项目结构)
- [🛠️ 安装](#安装)
- [🚀 启动](#启动)
- [🎯 使用指南](#使用指南)
- [📊 功能特性](#功能特性)
- [🔧 开发指南](#开发指南)
- [🛠️ 故障排查](#故障排查)
- [📚 相关文档](#相关文档)
- [📄 许可证](#许可证)

---

## 📖 项目说明

CodeMap 是一个 AI 驱动的代码可视化工具，使用 Rust + Tauri + React 构建，通过 AI 分析将复杂的代码执行流转化为清晰的、分步骤的追踪链路（Traces），并提供多种可视化表达（文本图、Mermaid 图、Markdown 指南）。

### 🎯 核心功能

- **AI 驱动分析**: 集成 Pi CLI + gemini-3-flash 模型
- **代码浏览器**: 支持目录树浏览和 Monaco Editor 只读查看
- **可视化**: 树形图/图形图展示代码流程
- **追踪指南**: 详细的代码执行路径说明
- **历史记录**: 保存和管理 CodeMap 历史
- **AI 辅助**: Copy Reference + Ask AI 功能

### 🎨 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Rust + Tauri 2.x |
| **前端** | React 18 + TypeScript + Vite 8 |
| **状态管理** | Zustand + Immer |
| **样式** | Tailwind CSS |
| **图标** | Lucide React + @react-symbols/icons |
| **编辑器** | Monaco Editor |
| **AI 集成** | Pi CLI (gemini-3-flash) + Claude Code |
| **构建工具** | Bun + TypeScript |
| **包管理** | pnpm |
| **版本控制** | Git + GitHub |

---

## 🚀 快速开始

### 前置条件

- Node.js 18+
- Rust 1.70+
- pnpm 10+

### 安装依赖

```bash
cd ~/.pi/agent/skills/codemap/client
pnpm install
```

### 启动

```bash
cd ~/.pi/agent/skills/codemap
./run.sh start
```

启动后会显示：

```
╔════════════════════════════════════════════════════════════════╗
║              CodeMap 开发环境已启动                       ║
╠════════════════════════════════════════════════════════════╣
║  前端: http://localhost:1420/                       ║
║  后端: Tauri 桌面已打开                       ║
╠══════════════════════════════════════════════════════════════╣
║  PID - 前端: 12345                                   ║
║  PID - 12346                                         ║
╠════════════════════════════════════════════════════════════╝
```

### 停止

```bash
./run.sh stop
```

### 重启

```bash
./run.sh restart
```

### 查看状态

```bash
./run.sh status
```

### 查看日志

```bash
./run.sh logs
```

### 查看帮助

```bash
./run.sh help
```

---

## 🏗️ 项目结构

```
~/.pi/agent/skills/codemap/
├── run.sh                    # 主控制脚本
├── start.sh                  # 启动脚本
├── stop.sh                   # 停止脚本
├── README.md                  # 项目文档（英文）
├── README.zh.md               # 项目文档（中文，本文件）
├── QUICKSTART.md             # 快速开始
├── SKILL.md                  # 技能定义
├── STRUCTURE.md              # 项目结构
├── DELIVERY.md              # 交付文档
├── client/                   # Tauri 客户端
│   ├── src/                  # React 前端源码
│   │   ├── components/          # React 组件
│   │   ├── stores/             # 状态管理
│   │   ├── utils/             # 工具函数
│   │   ├── types/             # 类型定义
│   │   └── ui/                # UI 组件
│   ├── src-tauri/            # Rust 后端源码
│   │   ├── src/              # Rust 源码
│   │   ├── Cargo.toml          # Rust 项目配置
│   │   ├── tauri.conf.json    # Tauri 配置
│   ├── package.json           # 前端依赖
│   ├── vite.config.ts         # Vite 配置
│   ├── tailwind.config.js      # Tailwind CSS 配置
│   └── tsconfig.json        # TypeScript 配置
├── generator/               # 代码生成器（Bun + TypeScript）
│   ├── src/
│   │   ├── providers/        # AI 提供者
│   │   ├── utils/            # 工具函数
│   │   ├── types.ts          # 类型定义
│   │   ├── index.ts          # 主入口
│   │   └── package.json      # 依赖配置
│   ├── tsconfig.json        # TypeScript 配置
│   └── README.md          # 生成器文档
└── logs/                    # 日志目录（自动创建）
    ├── frontend.log         # 前端日志
    └── backend.log          # 后端日志
```

---

## 🛠️ 安装

### 系统要求

- **操作系统**: macOS, Linux, Windows
- **Node.js**: >= 18.0.0
- **Rust**: >= 1.70.0
- **pnpm**: >= 10.0.0
- **Bun**: >= 1.3.0

### 安装步骤

1. **克隆仓库**（如果还没有）
```bash
git clone https://github.com/Dwsy/codemap.git
cd codemap
```

2. **安装依赖**
```bash
cd client
pnpm install
```

3. **构建 Tauri 后端**
```bash
cd client/src-tauri
cargo build --release
```

4. **启动应用**
```bash
cd ..
./run.sh start
```

---

## 🚀 启动

### 启动

```bash
cd ~/.pi/agent/skills/codemap
./run.sh start
```

启动后会显示：

```
╔══════════════════════════════════════════════════════════════╗
║              CodeMap 开发环境已启动                       ║
╠══════════════════════════════════════════════════════════╣
║  前端: http://localhost:1420/                       ║
║  后端: Tauri 智面已打开                       ║
╠══════════════════════════════════════════════════════════╣
║  PID - 前端: 12345                                   ║
║  │ PID - 后端: 12346                                         ║
╠══════════════════════════════════════════════════════════╣
║  日志位置: /Users/dengwenyu/.codemap/logs/                    ║
╚════════════════════════════════════════════════════════════╝
```

### 停止

```bash
./run.sh stop
```

### 重启

```bash
./run.sh restart
```

### 查看状态

```bash
./run.sh status
```

### 查看日志

```bash
./run.sh logs
```

### 查看帮助

```bash
./run.sh help
```

---

## 🎯 使用指南

### 创建 CodeMap

1. **打开应用**：http://localhost:1420/
2. **点击** `+ Generate CodeMap` 按钮
3. **输入查询**：例如 "用户认证流程"
4. **选择模式**：`Fast`（快速）或 `Smart`（深度）
5. **点击** `Generate CodeMap` 按钮
6. **等待** AI 分析（10-30 秒）
7. **查看结果**：
   - 树形视图：展示代码结构
   - 图形视图：展示依赖关系
   - 点击节点查看详细信息

### 浏览代码

1. **切换到 Code Browser**
2. **浏览目录树**（懒加载）
3. **点击文件**在 Monaco Editor 中打开
4. **使用**：
   - 跳转到指定行（Ctrl/Cmd + G）
   - 查看行批注（info/warn/todo）

### 使用 Ask AI

1. **选择节点**
2. **点击** `Ask AI` 按钮
3. **查看** AI 分析结果
4. **继续** 对话（Ask AI）

### 管理历史

1. **打开** Sidebar
2. **切换到 "History" 标签**
3. **点击** 历史记录加载 CodeMap
4. **点击** 🗑️ 删除按钮删除记录

### 复制引用

1. **选择节点**
2. **点击** `Copy Reference` 按钮
3. **粘贴** 到任意位置

---

## 📊 功能特性

### 核心功能

#### 1. CodeMap 生成

- ✅ **AI 驱动分析**：使用 Pi CLI + gemini-3-flash 模型
- ✅ **自定义系统提示词**：集成新的 Role Prompt
- **输出格式**：中文描述、严格 JSON 格式
- **追踪链路**：3-5 个逻辑阶段
- **可视化**：文本图 + Mermaid 图
- **指南文档**：Markdown 格式详解

#### 2. 代码浏览器

- ✅ **目录树**：懒加载，支持展开/收起
- ✅ **Monaco Editor**：只读模式，支持语法高亮
- **跳转功能**：Ctrl/Cmd + G 跳转并高亮指定行
- **行批注**：info/warn/todo 三种类型

#### 3. 文件和文件夹图标

- ✅ **文件图标**：60+ 种文件类型（JavaScript, TypeScript, Python, Rust, Go, Java 等）
- ✅ **文件夹图标**：根据文件夹名称自动匹配（node_modules, src, client, docker, config 等）

#### 4. AI 辅助功能

- ✅ **Copy Reference**：复制节点信息到剪贴板
- ✅ **Ask AI**：弹出对话框显示 AI 分析

#### 5. 历史管理

- ✅ **加载历史**：从本地存储加载
- ✅ **删除记录**：移除不需要的历史记录
- ✅ **持久化存储**：自动保存到 `docs/.codemap/` 目录

#### 6. UI 组件

- ✅ **TreeView**：树形图展示代码结构
- ✅ **GraphView**：图形化展示依赖关系
- ✅ **NodeDetails**：节点详情面板
- ✅ **Sidebar**：历史记录和建议主题
- ✅ **Select**: Analysis Mode 选择（Fast/Smart）

---

## 🔧 开发指南

### 环境配置

```bash
# 环境变量
export PI_AGENT_SKILL_PATH="/Users/dengwenyu/.pi/agent/skills/codemap"

# 模块路径
export VITE_ROOT="/path/to/modules"
export TAUKIT_ROOT="/path/to/tauri"
```

### 调试

#### 前端调试
```bash
# 开启调试模式
cd client
pnpm run dev --debug
```

#### 后端调试
```bash
# 构建调试版本
cd client/src-tauri
cargo build --debug
```

#### 日志查看
```bash
# 前端日志
tail -f ~/.codemap/logs/frontend.log

# 后端日志
tail -f ~/.codemap/logs/backend.log
```

### 热构建

```bash
# 构建 macOS 应用
cd client/src-tauri
cargo build --release
# 输出: src-tauri/target/release/bundle/macos/CodeMap.app

# 构建 Linux 应用
cargo build --release --target x86_64-unknown-linux-gnu

# 构建 Windows 应用
cargo build --release --target x86_64-pc-windows-msvc
```

---

## 🛠️ 故障排查

### 无法启动

#### 问题：端口被占用

```bash
# 检查端口占用
lsof -ti:1420
lsof -ti:8080

# 强制清理
./run.sh stop
rm -rf ~/.codemap/logs/* ~/.codemap/.pids

# 重新安装依赖
cd client
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### 问题：编译错误

```bash
cd client/src-tauri
cargo clean
cargo check
cargo build
```

#### 问题：前端空白

```bash
# 查看日志
tail -20 ~/.codemap/logs/frontend.log

# 清理缓存
rm -rf client/node_modules/.vite
pnpm install
```

### 常见错误

#### 错误：React does not recognize `isActive` prop

**原因**：DOM 元素上不能有 isActive 属性

**解决**：
```typescript
// ❌ 错误
<div isActive={true} />

// ✅ 正确
<div className={isActive ? 'active' : ''} />
```

#### 错误：Pi CLI 返回 406

**原因**：API 配额超限

**解决**：切换到不同模型或提供商
```rust
// PiProvider.ts
'--model', 'gemini-2.5-flash',  // 或
'--model', 'gemini-2.5-pro',   // 或
'--model', 'claude-3.5-sonnet'
```

#### 错误：Monaco Editor source map 404

**原因**：CDN source map 不存在

**解决**：拦截 fetch 和 XMLHttpRequest
```typescript
// monaco-config.ts
window.addEventListener('fetch', (event) => {
  if (event.url.endsWith('.map')) {
    event.preventDefault()
  }
})
```

---

## 📚 相关文档

- [README.md](./README.md) - 项目文档（英文）
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始
- [STRUCTURE.md](./STRUCTURE.md) - 项目结构
- [SKILL.md](./SKILL.md) - 技能定义
- [DELIVERY.md](./DELIVERY.md) - 交付文档

---

## 📄 许可证

MIT License

Copyright (c) 2025 Dwsy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🌐 GitHub

- **仓库**: https://github.com/Dwsy/codemap
- **License**: MIT
- **Issues**: https://github.com/Dwsy/codemap/issues
- **Releases**: https://github.com/Dwsy/codemap/releases

---

## 📞 联系方式

- **Issues**: https://github.com/Dwsy/codemap/issues
- **Discussions**: https://github.com/Dwsy/codemap/discussions

---

**🎉 享受使用 CodeMap！**