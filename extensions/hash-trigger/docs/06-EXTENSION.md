# 扩展机制设计

## 用户自定义命令

用户可以通过三种方式添加自定义命令：

### 1. TypeScript/JavaScript 文件

```typescript
// ~/.pi/agent/extensions/hash-trigger/commands/my-command.ts

import type { Command } from '../types';

export const myCommand: Command = {
  name: 'my',
  description: 'My custom command',
  
  async handler(args, ctx) {
    // 实现逻辑
    ctx.ui.notify('Hello from my command!', 'info');
    
    return {
      handled: true,
      message: 'Command executed'
    };
  }
};

// 默认导出
export default myCommand;
```

### 2. JSON 配置文件

```json
// ~/.pi/agent/extensions/hash-trigger/commands/simple-command.json
{
  "name": "hello",
  "description": "Say hello",
  "type": "shell",
  "command": "echo 'Hello, World!'"
}
```

### 3. 配置文件定义

```json
// config.json
{
  "customCommands": [
    {
      "name": "deploy",
      "description": "Deploy to production",
      "type": "shell",
      "command": "npm run deploy"
    }
  ]
}
```

## 命令类型

### 1. Shell 命令

```json
{
  "name": "test",
  "type": "shell",
  "command": "npm test",
  "cwd": "."
}
```

### 2. 脚本命令

```json
{
  "name": "build",
  "type": "script",
  "script": "./scripts/build.sh"
}
```

### 3. 函数命令

```typescript
{
  name: 'custom',
  type: 'function',
  handler: async (args, ctx) => {
    // 自定义逻辑
  }
}
```

## 命令加载器

```typescript
class CommandLoader {
  async loadFromDirectory(dir: string): Promise<Command[]> {
    const commands: Command[] = [];
    
    // 加载 .ts/.js 文件
    const tsFiles = await glob(`${dir}/**/*.{ts,js}`);
    for (const file of tsFiles) {
      const module = await import(file);
      const command = module.default || module;
      commands.push(command);
    }
    
    // 加载 .json 文件
    const jsonFiles = await glob(`${dir}/**/*.json`);
    for (const file of jsonFiles) {
      const config = await fs.readFile(file, 'utf-8');
      const command = this.createFromConfig(JSON.parse(config));
      commands.push(command);
    }
    
    return commands;
  }
  
  private createFromConfig(config: any): Command {
    // 根据配置创建命令
  }
}
```

## 命令模板

提供常用命令模板，方便用户快速创建。

### 文件操作模板

```typescript
export function createFileCommand(name: string, pattern: string): Command {
  return {
    name,
    description: `Select ${pattern} files`,
    async handler(args, ctx) {
      // 使用 fd 查找文件
      const files = await ctx.tools.exec('fd', [pattern]);
      // 使用 fzf 选择
      const selected = await ctx.tools.exec('fzf', [], {
        input: files.stdout
      });
      // 返回结果
      return {
        handled: true,
        transform: `@${selected.stdout.trim()}`
      };
    }
  };
}

// 使用模板
const tsCommand = createFileCommand('ts', '*.ts');
```

### 搜索模板

```typescript
export function createSearchCommand(name: string, fileType: string): Command {
  return {
    name,
    description: `Search in ${fileType} files`,
    async handler(args, ctx) {
      const pattern = args.join(' ');
      const result = await ctx.tools.exec('rg', [
        '--type', fileType,
        pattern
      ]);
      return {
        handled: true,
        message: result.stdout
      };
    }
  };
}
```

## 命令生成器

```bash
# 交互式创建命令
#create-command

# 提示：
# 命令名称: my-command
# 命令描述: My custom command
# 命令类型: [shell/script/function]
# ...
```

## 命令市场（未来）

```bash
# 浏览命令市场
#market

# 安装命令
#market install awesome-command

# 分享命令
#market publish my-command
```

## 下一步

架构设计完成！接下来可以开始实现核心代码。
