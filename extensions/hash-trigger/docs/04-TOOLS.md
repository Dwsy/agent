# 工具集成层设计

## 核心职责

1. 检测外部工具是否安装
2. 缓存工具路径
3. 提供统一的调用接口
4. 处理工具版本差异
5. 提供降级方案

## 工具管理器接口

```typescript
interface ToolManager {
  // 检查工具是否可用
  has(name: string): Promise<boolean>;
  
  // 获取工具路径
  getPath(name: string): Promise<string | undefined>;
  
  // 执行工具
  exec(name: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  
  // 刷新缓存
  refresh(): Promise<void>;
  
  // 获取工具版本
  getVersion(name: string): Promise<string | undefined>;
}

interface ExecOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
  input?: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cancelled: boolean;
}
```

## 工具检测策略

### 1. 缓存机制

```typescript
class ToolCache {
  private cache = new Map<string, ToolInfo>();
  
  async get(name: string): Promise<ToolInfo | undefined> {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }
    
    // 检测工具
    const info = await this.detect(name);
    
    // 缓存结果
    if (info) {
      this.cache.set(name, info);
    }
    
    return info;
  }
  
  private async detect(name: string): Promise<ToolInfo | undefined> {
    // 使用 which 或 where 命令
    const result = await exec('which', [name]);
    
    if (result.exitCode === 0) {
      return {
        name,
        path: result.stdout.trim(),
        version: await this.getVersion(name)
      };
    }
    
    return undefined;
  }
}
```

### 2. 多路径检测

```typescript
const SEARCH_PATHS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '~/.local/bin',
  '~/.cargo/bin',
  process.env.PATH?.split(':') || []
];

async function findTool(name: string): Promise<string | undefined> {
  for (const dir of SEARCH_PATHS) {
    const fullPath = path.join(dir, name);
    if (await fs.access(fullPath).then(() => true).catch(() => false)) {
      return fullPath;
    }
  }
  return undefined;
}
```

## 工具适配器

每个工具都有一个适配器，封装调用细节。

### FZF 适配器

```typescript
class FzfAdapter {
  async select(items: string[], options?: FzfOptions): Promise<string | undefined> {
    const args = [
      '--height', '40%',
      '--reverse',
      '--border'
    ];
    
    if (options?.preview) {
      args.push('--preview', options.preview);
    }
    
    if (options?.multi) {
      args.push('--multi');
    }
    
    const result = await toolManager.exec('fzf', args, {
      input: items.join('\n')
    });
    
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }
}
```

### RG 适配器

```typescript
class RgAdapter {
  async search(pattern: string, options?: RgOptions): Promise<SearchResult[]> {
    const args = ['--json'];
    
    if (options?.caseInsensitive) {
      args.push('-i');
    }
    
    if (options?.type) {
      args.push('--type', options.type);
    }
    
    args.push(pattern);
    
    const result = await toolManager.exec('rg', args);
    
    return this.parseJsonOutput(result.stdout);
  }
}
```

### FD 适配器

```typescript
class FdAdapter {
  async find(pattern: string, options?: FdOptions): Promise<string[]> {
    const args = [];
    
    if (options?.type) {
      args.push('--type', options.type);
    }
    
    if (options?.hidden) {
      args.push('--hidden');
    }
    
    args.push(pattern);
    
    const result = await toolManager.exec('fd', args);
    
    return result.stdout.split('\n').filter(Boolean);
  }
}
```

## 降级策略

```typescript
class FileCommand {
  async execute(args: string[], ctx: CommandContext) {
    // 尝试最佳策略
    if (await ctx.tools.has('fd') && await ctx.tools.has('fzf')) {
      return await this.fdFzfStrategy(args, ctx);
    }
    
    // 降级到次优策略
    if (await ctx.tools.has('fzf')) {
      return await this.findFzfStrategy(args, ctx);
    }
    
    // 最终降级到内置实现
    return await this.builtinStrategy(args, ctx);
  }
}
```

## 下一步

下一个文档将设计**配置系统**，定义如何管理用户配置和工具偏好。
