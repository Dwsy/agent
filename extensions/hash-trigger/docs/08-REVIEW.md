# 设计 Review 与改进建议

## 对比 Pi 的插件机制

### Pi 的核心设计模式

1. **依赖注入** - 通过 ExtensionRuntime 适配不同模式
2. **事件驱动** - 20+ 生命周期事件
3. **上下文传递** - ExtensionContext 提供统一访问
4. **工具包装** - 自动拦截和事件分发
5. **状态持久化** - appendEntry + tool details
6. **模式适配** - interactive/print/RPC 自动适配

### 我的设计问题

#### ❌ 问题 1: 过度设计的注册表
```typescript
// 我的设计
class CommandRegistry {
  register/unregister/find/list/enable/disable
}

// Pi 的方式
pi.registerCommand()  // 简单直接
```

**改进**: 去掉复杂的注册表，直接使用 pi 的注册机制。

#### ❌ 问题 2: 重复造轮子
```typescript
// 我的设计
class ToolManager {
  has/getPath/exec/refresh/getVersion
}

// Pi 已有
ctx.exec()  // 已经提供命令执行
pi.exec()   // 扩展也可以执行命令
```

**改进**: 直接使用 pi 的 exec，不需要自己的 ToolManager。

#### ❌ 问题 3: 配置系统过于复杂
```typescript
// 我的设计
ConfigManager with load/merge/save/watch

// Pi 的方式
settings.json + 环境变量
```

**改进**: 使用 pi 的配置系统，只需要一个简单的配置文件。

#### ❌ 问题 4: 没有利用 pi 的事件系统
```typescript
// 我的设计
自定义的命令生命周期

// Pi 的方式
pi.on('input', handler)  // 拦截输入
pi.on('session_start', handler)  // 初始化
```

**改进**: 完全基于 pi 的事件系统。

## 改进后的架构

### 核心理念
**作为 Pi 的一个扩展，而不是独立系统**

### 简化的架构

```
hash-trigger/
├── index.ts              # Pi 扩展入口
├── types.ts              # 类型定义
├── parser.ts             # 命令解析器
├── commands/             # 命令插件
│   ├── file.ts           # 文件命令
│   ├── search.ts         # 搜索命令
│   └── git.ts            # Git 命令
└── utils/
    ├── tools.ts          # 工具检测辅助
    └── fzf.ts            # FZF 封装
```

### 核心流程

```typescript
// index.ts - Pi 扩展入口
export default function (pi: ExtensionAPI) {
  // 1. 拦截输入
  pi.on('input', async (event, ctx) => {
    if (!event.text.startsWith('#')) {
      return { action: 'continue' };
    }
    
    // 2. 解析命令
    const parsed = parseCommand(event.text);
    
    // 3. 查找命令
    const command = commands.find(c => c.name === parsed.name);
    if (!command) {
      return { action: 'continue' };
    }
    
    // 4. 执行命令
    const result = await command.handler(parsed.args, ctx);
    
    return result;
  });
  
  // 5. 注册帮助命令
  pi.registerCommand('hash-help', {
    description: 'Show hash trigger commands',
    handler: async (args, ctx) => {
      // 显示所有 # 命令
    }
  });
}
```

### 命令插件接口

```typescript
interface HashCommand {
  name: string;
  description: string;
  requiredTools?: string[];
  handler: (args: string[], ctx: ExtensionContext) => Promise<InputResult>;
}

// 命令实现
export const fileCommand: HashCommand = {
  name: 'file',
  description: 'Select files',
  requiredTools: ['fd', 'fzf'],
  
  async handler(args, ctx) {
    // 检查工具
    if (!await hasTools(['fd', 'fzf'], ctx)) {
      return { action: 'handled' };
    }
    
    // 执行 fd + fzf
    const pattern = args.join(' ') || '.';
    const fdResult = await ctx.exec('fd', [pattern]);
    const fzfResult = await ctx.exec('fzf', ['--preview', 'bat {}'], {
      input: fdResult.stdout
    });
    
    if (fzfResult.code === 0) {
      const file = fzfResult.stdout.trim();
      return {
        action: 'transform',
        text: `@${file}`
      };
    }
    
    return { action: 'handled' };
  }
};
```

### 工具检测简化

```typescript
// utils/tools.ts
const toolCache = new Map<string, boolean>();

export async function hasTools(
  tools: string[], 
  ctx: ExtensionContext
): Promise<boolean> {
  for (const tool of tools) {
    if (!toolCache.has(tool)) {
      const result = await ctx.exec('which', [tool]);
      toolCache.set(tool, result.code === 0);
    }
    
    if (!toolCache.get(tool)) {
      ctx.ui.notify(`需要安装: ${tool}`, 'warning');
      return false;
    }
  }
  return true;
}
```

## 关键改进点

### ✅ 1. 完全基于 Pi 的扩展系统
- 使用 `pi.on('input')` 拦截
- 使用 `ctx.exec()` 执行命令
- 使用 `ctx.ui` 交互
- 使用 `pi.registerCommand()` 注册命令

### ✅ 2. 简化的命令系统
- 命令就是简单的对象
- 不需要复杂的注册表
- 不需要生命周期管理

### ✅ 3. 最小化依赖
- 不需要自己的 ToolManager
- 不需要自己的 ConfigManager
- 不需要自己的 UI 组件

### ✅ 4. 插件化命令
- 每个命令是独立文件
- 易于添加新命令
- 易于禁用命令

## 下一步

基于这个改进的架构，开始实现核心代码。
