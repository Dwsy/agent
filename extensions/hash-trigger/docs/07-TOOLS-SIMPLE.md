# 工具依赖约定（更新版）

## 核心理念

**约定优于配置**：直接约定使用特定工具，无需复杂的降级策略。

## 工具约定

### File 命令
- **约定工具**: fd + fzf + bat
- **无工具时**: 静默失败，提示一次安装建议

### Search 命令
- **约定工具**: rg + fzf
- **无工具时**: 静默失败，提示一次安装建议

### Git 命令
- **约定工具**: git + delta (可选)
- **无工具时**: 提示安装 git

## 简化的工具检测

```typescript
class ToolManager {
  private cache = new Map<string, boolean>();
  private notifiedMissing = new Set<string>();
  
  async has(name: string): Promise<boolean> {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    
    // 检测工具
    const exists = await this.detect(name);
    this.cache.set(name, exists);
    
    return exists;
  }
  
  async ensureTools(tools: string[], ctx: CommandContext): Promise<boolean> {
    const missing: string[] = [];
    
    for (const tool of tools) {
      if (!await this.has(tool)) {
        missing.push(tool);
      }
    }
    
    if (missing.length > 0) {
      // 只提示一次
      if (!this.notifiedMissing.has(missing.join(','))) {
        ctx.ui.notify(
          `需要安装: ${missing.join(', ')}`,
          'warning'
        );
        this.notifiedMissing.add(missing.join(','));
      }
      return false;
    }
    
    return true;
  }
}
```

## 命令实现简化

```typescript
export const fileCommand: Command = {
  name: 'file',
  description: 'Select files using fd + fzf',
  
  // 明确声明依赖
  dependencies: {
    required: ['fd', 'fzf'],
    optional: ['bat']
  },
  
  async handler(args, ctx) {
    // 检查必需工具
    if (!await ctx.tools.ensureTools(['fd', 'fzf'], ctx)) {
      return { handled: true };
    }
    
    // 直接使用工具
    const files = await ctx.tools.exec('fd', args);
    const selected = await ctx.tools.exec('fzf', ['--preview', 'bat {}'], {
      input: files.stdout
    });
    
    if (selected.exitCode === 0) {
      return {
        handled: true,
        transform: `@${selected.stdout.trim()}`
      };
    }
    
    return { handled: true };
  }
};
```

## 安装提示

首次使用时显示一次性提示：

```
⚠️  Hash Trigger 需要以下工具：

文件操作 (#file):
  - fd: brew install fd
  - fzf: brew install fzf
  - bat: brew install bat (可选)

搜索 (#search):
  - rg: brew install ripgrep
  - fzf: brew install fzf

Git (#git):
  - git: brew install git
  - delta: brew install git-delta (可选)

提示：可以通过 #check 检查工具状态
```

## 工具检查命令

```bash
# 检查所有工具状态
#check

# 输出示例：
✓ fd      /usr/local/bin/fd
✓ fzf     /usr/local/bin/fzf
✓ bat     /usr/local/bin/bat
✓ rg      /usr/local/bin/rg
✗ delta   未安装
```

这样设计更简洁，用户体验也更好。
