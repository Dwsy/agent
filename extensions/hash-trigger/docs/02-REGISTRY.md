# 命令注册表设计

## 核心理念

**完全插件化**：每个命令都是独立的插件，可以动态注册、卸载、启用、禁用。

## 注册表接口

```typescript
interface Command {
  name: string;                    // 命令名称
  description: string;             // 命令描述
  aliases?: string[];              // 命令别名
  enabled: boolean;                // 是否启用
  
  // 依赖的外部工具
  dependencies?: {
    required?: string[];           // 必需工具
    optional?: string[];           // 可选工具
  };
  
  // 参数定义
  parameters?: {
    positional?: ParamDef[];       // 位置参数
    options?: OptionDef[];         // 选项参数
  };
  
  // 命令处理器
  handler: CommandHandler;
  
  // 自动补全
  autocomplete?: AutocompleteProvider;
  
  // 帮助信息
  help?: HelpProvider;
}

interface CommandHandler {
  (args: ParsedArgs, ctx: CommandContext): Promise<CommandResult>;
}

interface CommandResult {
  handled: boolean;                // 是否已处理
  transform?: string;              // 转换后的文本
  message?: string;                // 反馈消息
  error?: string;                  // 错误信息
}
```

## 注册表实现

```typescript
class CommandRegistry {
  private commands = new Map<string, Command>();
  private aliases = new Map<string, string>();
  
  // 注册命令
  register(command: Command): void;
  
  // 注销命令
  unregister(name: string): void;
  
  // 查找命令
  find(name: string): Command | undefined;
  
  // 列出所有命令
  list(): Command[];
  
  // 启用/禁用命令
  enable(name: string): void;
  disable(name: string): void;
  
  // 检查命令是否可用
  isAvailable(name: string): boolean;
}
```

## 插件加载机制

### 1. 内置命令插件

```
commands/
├── file.ts          # 文件操作命令
├── search.ts        # 搜索命令
├── git.ts           # Git 命令
└── index.ts         # 统一导出
```

### 2. 用户自定义命令

```
~/.pi/agent/extensions/hash-trigger/commands/
├── my-command.ts    # 用户自定义命令
└── team-command.ts  # 团队共享命令
```

### 3. 项目级命令

```
.pi/hash-trigger/commands/
└── project-command.ts  # 项目特定命令
```

## 命令生命周期

```
加载阶段
  ↓
注册命令 → registry.register(command)
  ↓
检查依赖 → toolManager.check(command.dependencies)
  ↓
依赖满足? 
  ├─ 是 → 标记为可用
  └─ 否 → 标记为不可用（可选依赖）或禁用（必需依赖）
  ↓
命令就绪
```

## 下一步

下一个文档将设计**内置命令**，定义 file、search、git 等命令的具体实现。
