# CodeMap 项目结构

```
~/.pi/agent/skills/codemap/
├── SKILL.md                          # 技能定义文档
├── README.md                         # 完整使用文档
├── QUICKSTART.md                     # 快速开始指南
│
├── client/                           # Tauri 客户端应用
│   ├── package.json                  # NPM 配置
│   │
│   ├── src/                          # Web 前端
│   │   ├── index.html                # 主界面 HTML
│   │   ├── app.js                    # 应用逻辑 (16.8 KB)
│   │   ├── styles/                   # 样式文件
│   │   │   └── app.css               # 主样式 (11.0 KB)
│   │   └── components/               # 组件目录（预留）
│   │
│   └── src-tauri/                    # Rust 后端
│       ├── Cargo.toml                # Rust 依赖配置
│       ├── tauri.conf.json           # Tauri 配置
│       ├── build.rs                  # 构建脚本
│       │
│       └── src/                      # Rust 源码
│           ├── main.rs               # 应用入口 (1.1 KB)
│           ├── commands.rs           # Tauri 命令 API (5.8 KB)
│           ├── analyzer.rs           # 代码分析逻辑 (11.5 KB)
│           ├── codemap.rs            # 数据结构定义 (2.6 KB)
│           └── storage.rs            # 文件存储 (12.5 KB)
│
└── docs/                             # 项目文档（示例）
    ├── issues/                       # Workhub Issues
    │   └── 20250106-创建codemap技能.md
    └── pr/                           # Workhub PRs
        └── 20250106-创建codemap技能.md

项目数据目录（运行时生成）：
项目根目录/
└── docs/
    └── .codemap/                     # CodeMap 数据存储
        ├── index.json                # CodeMap 索引
        ├── codemaps/                 # CodeMap 数据文件
        │   ├── 20250106-001-xxx.json
        │   └── ...
        ├── exports/                  # 导出文件
        │   ├── xxx.html
        │   ├── xxx.md
        │   └── xxx.json
        └── cache/                    # 缓存目录
```

## 文件说明

### 技能文档
- **SKILL.md**: 技能定义，包含 API 文档、使用指南、最佳实践
- **README.md**: 完整的项目文档，包含技术栈、架构设计、使用示例
- **QUICKSTART.md**: 快速开始指南，帮助用户快速上手

### 客户端前端
- **index.html**: 主界面布局，包含目录树、可视化区域、历史版本面板
- **app.js**: 前端逻辑，处理用户交互、API 调用、可视化渲染
- **styles/app.css**: 界面样式，响应式设计，现代化 UI

### 客户端后端
- **main.rs**: Tauri 应用入口，注册所有命令
- **commands.rs**: 8 个 Tauri 命令，处理前端请求
- **analyzer.rs**: 代码分析逻辑，识别关键节点
- **codemap.rs**: CodeMap 数据结构定义
- **storage.rs**: 基于文件系统的存储实现

### 配置文件
- **package.json**: NPM 配置，定义脚本和依赖
- **Cargo.toml**: Rust 依赖配置
- **tauri.conf.json**: Tauri 应用配置

## 代码统计

| 模块 | 文件数 | 代码行数（估算） |
|------|--------|----------------|
| 前端 (HTML/JS/CSS) | 3 | ~1,500 |
| 后端 (Rust) | 5 | ~800 |
| 文档 (Markdown) | 3 | ~1,200 |
| 配置 | 3 | ~100 |
| **总计** | **14** | **~3,600** |

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                        用户界面                          │
│  ┌──────────────┬──────────────────┬─────────────────┐ │
│  │  目录树侧边栏 │   可视化展示区    │  历史版本侧边栏 │ │
│  └──────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Tauri IPC 层                          │
│  analyze_code, save_codemap, list_codemaps, ...          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Rust 后端逻辑                          │
│  ┌──────────┬──────────┬──────────┬──────────────────┐ │
│  │ Analyzer │ CodeMap  │ Storage  │   Commands      │ │
│  └──────────┴──────────┴──────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  文件系统存储                             │
│  docs/.codemap/                                          │
│  ├── index.json                                          │
│  ├── codemaps/                                           │
│  └── exports/                                            │
└─────────────────────────────────────────────────────────┘
```

## 数据流

```
用户输入（文件选择 + 查询）
    ↓
前端发送 IPC 请求
    ↓
Rust 后端接收请求
    ↓
Analyzer 分析代码文件
    ↓
生成 CodeMap JSON
    ↓
Storage 保存到文件系统
    ↓
前端接收响应
    ↓
渲染可视化（Mermaid / 文本图 / Markdown）
```

## 扩展点

### 1. 添加新的代码语言支持
修改 `analyzer.rs` 中的 `is_*` 方法，添加新的识别规则。

### 2. 添加新的可视化形式
在前端添加新的 Tab，在 `app.js` 中实现渲染逻辑。

### 3. 添加新的导出格式
在 `storage.rs` 的 `export_codemap` 方法中添加新的格式处理。

### 4. 添加新的 Tauri 命令
在 `commands.rs` 中添加新命令，在 `main.rs` 中注册。

## 开发工作流

```
1. 修改代码
   ↓
2. npm run dev（启动开发模式）
   ↓
3. 测试功能
   ↓
4. 提交代码
   ↓
5. npm run build（构建生产版本）
```

## 依赖关系

```
前端依赖:
├── @tauri-apps/cli (开发依赖)
├── mermaid.js (CDN)
└── marked.js (CDN)

后端依赖:
├── tauri 2.0
├── serde
├── serde_json
├── tokio
├── chrono
├── anyhow
├── walkdir
├── tree-sitter
├── tree-sitter-*
└── ignore
```