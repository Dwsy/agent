# CodeMap Generator

使用 Bun + TypeScript 构建的 CodeMap 生成器，支持多个 AI 提供者（Pi CLI、Claude Code）。

## 📁 目录结构

```
generator/
├── src/
│   ├── providers/           # AI 提供者
│   │   ├── BaseProvider.ts  # 基类
│   │   ├── PiProvider.ts    # Pi CLI 实现
│   │   ├── ClaudeProvider.ts # Claude Code 实现
│   │   └── index.ts         # 工厂
│   ├── utils/               # 工具函数
│   │   └── fileUtils.ts     # 文件处理
│   ├── types.ts             # 类型定义
│   └── index.ts             # 主入口
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 使用方法

### 开发模式

```bash
cd generator
bun run dev
```

### 构建

```bash
bun run build
```

### 生成 CodeMap

```bash
# 使用 Pi CLI (默认)
bun run generate "用户认证流程" '["src/App.tsx"]' '/path/to/project' fast

# 使用 Claude Code
bun run generate "用户认证流程" '["src/App.tsx"]' '/path/to/project' fast claude

# 使用 Smart 模型
bun run generate "用户认证流程" '["src/App.tsx"]' '/path/to/project' smart
```

### 分析代码

```bash
# 使用 Pi CLI (默认)
bun run analyze "src/App.tsx"

# 使用 Claude Code
bun run analyze "src/App.tsx" claude
```

## 🎯 架构设计

### 分层架构

```
┌─────────────────────────────────────┐
│         CLI Layer (index.ts)        │  ← 命令行入口
├─────────────────────────────────────┤
│      Provider Layer (providers/)    │  ← AI 提供者抽象
│  ┌──────────────────────────────┐  │
│  │   BaseProvider (抽象基类)    │  │
│  ├──────────────────────────────┤  │
│  │   PiProvider               │  │
│  │   ClaudeProvider            │  │
│  └──────────────────────────────┘  │
├─────────────────────────────────────┤
│       Utils Layer (utils/)         │  ← 工具函数
│  ┌──────────────────────────────┐  │
│  │   fileUtils.ts              │  │
│  │   - readFiles               │  │
│  │   - buildGeneratePrompt     │  │
│  └──────────────────────────────┘  │
├─────────────────────────────────────┤
│       Types Layer (types.ts)       │  ← 类型定义
└─────────────────────────────────────┘
```

### 核心概念

#### 1. Provider Pattern（提供者模式）

```typescript
// 基类定义接口
abstract class BaseProvider {
  abstract name: string;
  abstract generate(prompt: string, modelTier: string): Promise<CodeMap>;
  abstract analyze(prompt: string): Promise<any>;
}

// 具体实现
class PiProvider extends BaseProvider { ... }
class ClaudeProvider extends BaseProvider { ... }

// 工厂创建
const provider = ProviderFactory.create('pi');
```

#### 2. Factory Pattern（工厂模式）

```typescript
class ProviderFactory {
  static create(provider: 'pi' | 'claude'): AIProvider {
    switch (provider) {
      case 'pi': return new PiProvider();
      case 'claude': return new ClaudeProvider();
    }
  }
}
```

#### 3. Strategy Pattern（策略模式）

每个提供者实现自己的解析策略：

- **PiProvider**: 解析流式 JSON 输出
- **ClaudeProvider**: 解析纯 JSON 输出

## 🔧 扩展新的提供者

1. 创建新的提供者类继承 `BaseProvider`：

```typescript
// src/providers/OpenAIProvider.ts
export class OpenAIProvider extends BaseProvider {
  name = 'openai';

  async generate(prompt: string, modelTier: string): Promise<CodeMap> {
    // 实现生成逻辑
  }

  async analyze(prompt: string): Promise<any> {
    // 实现分析逻辑
  }
}
```

2. 在工厂中注册：

```typescript
// src/providers/index.ts
export class ProviderFactory {
  static create(provider: string): AIProvider {
    switch (provider) {
      case 'pi': return new PiProvider();
      case 'claude': return new ClaudeProvider();
      case 'openai': return new OpenAIProvider();  // 新增
    }
  }
}
```

## 📝 类型定义

所有类型定义在 `src/types.ts` 中：

- `CodeMap`: CodeMap 数据结构
- `Node`: 节点定义
- `Edge`: 边定义
- `CodeRef`: 代码引用
- `TraceGuide`: 追踪指南
- `GenerateOptions`: 生成选项
- `AnalyzeOptions`: 分析选项
- `AIProvider`: 提供者接口

## 🧪 测试

```bash
# 测试 Pi CLI
bun run src/index.ts generate "test" '["src/App.tsx"]' '/path/to/project' fast pi

# 测试 Claude Code
bun run src/index.ts generate "test" '["src/App.tsx"]' '/path/to/project' fast claude
```

## 📦 依赖

- Bun (运行时)
- TypeScript (类型系统)
- Node.js (child_process)

无外部依赖，使用 Bun 内置模块。