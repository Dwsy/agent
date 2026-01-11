# CodeMap

**从代码迷宫到认知地图**

---

## 哲学

代码是一维线性的文本，但业务逻辑是多维网状的结构。当开发者阅读一个复杂系统时，真正的挑战不是理解单行代码的语法，而是在脑海中重建散落在数十个文件中的执行流——从入口到出口，从请求到响应，从意图到实现。

CodeMap 的哲学基于一个核心洞察：**追踪即理解**。

传统代码分析工具停留在语法层面——AST、符号表、调用图。它们告诉你"什么调用了什么"，却无法回答"为什么这样设计"和"数据如何流转"。CodeMap 通过 AI 跨越语法到语义的鸿沟，将代码执行流转化为人类可理解的认知地图。

### 三层抽象

```
┌─────────────────────────────────────────────────────────┐
│  全局视角 (Mermaid Graph)                                │
│  回答：系统的整体架构是什么？各层如何协作？                    │
├─────────────────────────────────────────────────────────┤
│  追踪链路 (Traces)                                       │
│  回答：一个业务流程分几个阶段？每个阶段做什么？                 │
├─────────────────────────────────────────────────────────┤
│  精确锚点 (Code References)                              │
│  回答：具体在哪个文件、哪一行、什么代码？                      │
└─────────────────────────────────────────────────────────┘
```

这不是功能的堆砌，而是认知负荷的分层管理。开发者可以从全局鸟瞰开始，逐步下钻到细节，而不会迷失在细节的海洋中。

---

## 核心概念

### Node (节点)
代表一个逻辑单元——可能是一个 API 入口、一个服务方法、一段关键业务逻辑。每个节点包含：
- **title**: 节点名称
- **summary**: 简短描述
- **code_refs**: 精确的代码引用（文件路径 + 行号）
- **trace_guide**: 追踪指南（动机 + 细节）

### Edge (边)
表达节点间的关系：
- `calls`: 调用关系
- `depends`: 依赖关系
- `data_flow`: 数据流向
- `inherits`: 继承关系

### Trace (追踪链路)
将复杂流程拆解为 3-5 个逻辑阶段，每个阶段是一个独立的理解单元。

---

## 架构

```
codemap/
├── client/                 # Tauri 桌面应用
│   ├── src/               # React 前端
│   │   ├── components/    # UI 组件
│   │   └── stores/        # Zustand 状态管理
│   └── src-tauri/         # Rust 后端
│       └── src/
│           ├── codemap_v2.rs   # 核心数据结构
│           ├── executor.rs     # AI 执行器
│           └── code_browser.rs # 代码浏览器
└── generator/              # AI 生成器 (Bun + TypeScript)
    └── src/
        ├── providers/      # AI 提供者 (Pi CLI / Claude)
        └── types.ts        # 类型定义
```

### 技术选型

| 层 | 技术 | 理由 |
|---|---|---|
| 后端 | Rust + Tauri | 性能、安全、跨平台 |
| 前端 | React + TypeScript | 类型安全、生态成熟 |
| 状态 | Zustand + Immer | 简洁、不可变更新 |
| AI | Pi CLI (Gemini) | 灵活的模型切换 |

---

## 快速开始

### 前置条件
- Node.js 18+
- Rust 1.70+
- pnpm

### 启动

```bash
cd ~/.pi/agent/skills/codemap/client
pnpm install
cd ..
./run.sh start
```

### 使用

1. 打开 http://localhost:1420/
2. 点击 `Generate CodeMap`
3. 输入查询（如："用户认证流程"）
4. 选择模式：`Fast`（快速）或 `Smart`（深度）
5. 查看结果：TreeView / GraphView / Code Browser

---

## 数据模型

### CodeMap V2 Schema

```typescript
interface CodeMap {
  schema_version: string;
  codemap_id: string;
  title: string;
  prompt: string;           // 用户原始查询
  created_at: DateTime;
  repo: RepoInfo;
  generation: {
    model_tier: 'fast' | 'smart';
    zdr: boolean;           // Zero Data Retention
    budgets: {
      max_files: number;
      max_chunks: number;
    };
  };
  nodes: Node[];
  edges: Edge[];
}
```

### 存储

CodeMap 持久化到项目的 `docs/.codemap/` 目录，便于版本控制和团队共享。

---

## 脚本

```bash
./run.sh start    # 启动
./run.sh stop     # 停止
./run.sh restart  # 重启
./run.sh status   # 查看状态
./run.sh logs     # 查看日志
```

---

## 构建

```bash
cd client
pnpm run tauri build

# 产物
# macOS: src-tauri/target/release/bundle/macos/CodeMap.app
# Windows: src-tauri/target/release/bundle/msi/CodeMap_x.x.x_x64.msi
# Linux: src-tauri/target/release/bundle/appimage/
```

---

## 许可证

MIT

---

## 链接

- [GitHub](https://github.com/Dwsy/codemap)
- [Issues](https://github.com/Dwsy/codemap/issues)
