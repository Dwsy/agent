# 输入拦截器设计

## 职责

输入拦截器是整个系统的入口，负责：
1. 监听用户输入
2. 检测 `#` 前缀
3. 解析命令和参数
4. 决定是否拦截处理

## 工作流程

```
用户输入: "#file src/index.ts"
    ↓
检测前缀: startsWith('#')
    ↓
提取命令: "file"
    ↓
提取参数: "src/index.ts"
    ↓
查找命令: registry.find('file')
    ↓
命令存在? 
    ├─ 是 → 拦截处理
    └─ 否 → 放行（作为普通文本）
```

## 解析策略

### 1. 基础解析

```
输入格式: #<command> [args...]

示例:
#file                    → command: "file", args: []
#file src/               → command: "file", args: ["src/"]
#search auth login       → command: "search", args: ["auth", "login"]
#git status              → command: "git", args: ["status"]
```

### 2. 引号支持

```
#search "user login"     → args: ["user login"]
#file "my file.ts"       → args: ["my file.ts"]
```

### 3. 选项支持

```
#search auth --case-sensitive
#file src/ --preview
#git log --oneline -10
```

### 4. 管道支持（未来）

```
#search auth | #file     → 搜索后选择文件
```

## 拦截时机

基于 pi 的 `input` 事件：

```typescript
pi.on("input", async (event, ctx) => {
  // 1. 检查是否以 # 开头
  if (!event.text.startsWith('#')) {
    return { action: "continue" };
  }

  // 2. 解析命令
  const parsed = parseCommand(event.text);
  
  // 3. 查找命令
  const command = registry.find(parsed.name);
  
  // 4. 命令不存在，放行
  if (!command) {
    return { action: "continue" };
  }

  // 5. 执行命令
  const result = await command.handler(parsed.args, ctx);
  
  // 6. 处理结果
  if (result.handled) {
    return { action: "handled" };
  } else if (result.transform) {
    return { action: "transform", text: result.text };
  }
});
```

## 解析器实现

### 命令解析器接口

```typescript
interface ParsedCommand {
  name: string;           // 命令名称
  args: string[];         // 位置参数
  options: Record<string, any>;  // 选项参数
  raw: string;            // 原始输入
}

interface Parser {
  parse(input: string): ParsedCommand;
}
```

### 解析规则

1. **命令名提取**
   - 从 `#` 后到第一个空格
   - 转换为小写
   - 验证命名规则（字母、数字、连字符）

2. **参数分割**
   - 按空格分割
   - 尊重引号内的空格
   - 支持转义字符

3. **选项解析**
   - `--key value` → `{ key: "value" }`
   - `--flag` → `{ flag: true }`
   - `-abc` → `{ a: true, b: true, c: true }`

4. **特殊字符处理**
   - 路径中的空格
   - 通配符 `*`
   - 环境变量 `$VAR`

## 错误处理

### 1. 命令不存在

```
用户输入: #unknown
处理: 放行，作为普通文本
原因: 可能是用户真的想输入 #unknown
```

### 2. 参数错误

```
用户输入: #file
命令要求: 至少一个参数
处理: 显示错误提示，不拦截
```

### 3. 工具不可用

```
用户输入: #file src/
依赖工具: fd, fzf
工具状态: fd 未安装
处理: 降级到基础实现或提示安装
```

## 性能优化

### 1. 快速路径检测

```typescript
// 快速检查，避免不必要的解析
if (input[0] !== '#') {
  return { action: "continue" };
}

// 只有确认是命令才进行完整解析
if (input.length < 2 || input[1] === ' ') {
  return { action: "continue" };
}
```

### 2. 解析缓存

```typescript
// 缓存最近的解析结果
const parseCache = new Map<string, ParsedCommand>();

function parse(input: string): ParsedCommand {
  if (parseCache.has(input)) {
    return parseCache.get(input)!;
  }
  
  const result = doParse(input);
  parseCache.set(input, result);
  
  // 限制缓存大小
  if (parseCache.size > 100) {
    const firstKey = parseCache.keys().next().value;
    parseCache.delete(firstKey);
  }
  
  return result;
}
```

### 3. 正则表达式优化

```typescript
// 预编译正则表达式
const COMMAND_PATTERN = /^#([a-z0-9-]+)(?:\s+(.*))?$/i;
const QUOTED_ARG_PATTERN = /"([^"]*)"|'([^']*)'|(\S+)/g;
const OPTION_PATTERN = /^--?([a-z0-9-]+)(?:=(.+))?$/i;
```

## 用户体验

### 1. 自动补全

```
用户输入: #f
显示建议: 
  - #file
  - #find
```

### 2. 命令提示

```
用户输入: #file
显示提示: #file <path> [--preview] [--edit]
```

### 3. 实时验证

```
用户输入: #file src/
实时检查: 
  - 命令存在 ✓
  - 参数有效 ✓
  - 工具可用 ✓
```

### 4. 错误友好

```
用户输入: #file
错误提示: 
  ❌ #file 需要至少一个参数
  💡 用法: #file <path>
  📖 示例: #file src/index.ts
```

## 与 pi 集成

### 1. 不干扰原有功能

```typescript
// 只拦截 # 开头的输入
// 其他输入（@file, /command）正常处理
if (!event.text.startsWith('#')) {
  return { action: "continue" };
}
```

### 2. 尊重用户意图

```typescript
// 如果用户真的想输入 #hashtag
// 可以通过 \# 转义
if (event.text.startsWith('\\#')) {
  return { 
    action: "transform", 
    text: event.text.slice(1) 
  };
}
```

### 3. 保持一致性

```typescript
// 使用 pi 的 UI 组件
ctx.ui.notify("命令执行成功", "success");

// 使用 pi 的主题
const theme = ctx.ui.theme;
```

## 测试策略

### 1. 单元测试

```typescript
describe('Parser', () => {
  it('should parse simple command', () => {
    const result = parse('#file src/index.ts');
    expect(result.name).toBe('file');
    expect(result.args).toEqual(['src/index.ts']);
  });

  it('should parse quoted arguments', () => {
    const result = parse('#search "user login"');
    expect(result.args).toEqual(['user login']);
  });

  it('should parse options', () => {
    const result = parse('#file src/ --preview');
    expect(result.options.preview).toBe(true);
  });
});
```

### 2. 集成测试

```typescript
describe('Interceptor', () => {
  it('should intercept hash commands', async () => {
    const result = await interceptor.handle('#file src/');
    expect(result.action).toBe('handled');
  });

  it('should pass through non-hash input', async () => {
    const result = await interceptor.handle('normal text');
    expect(result.action).toBe('continue');
  });
});
```

### 3. 边界测试

```typescript
describe('Edge Cases', () => {
  it('should handle empty command', () => {
    const result = parse('#');
    expect(result.name).toBe('');
  });

  it('should handle special characters', () => {
    const result = parse('#file src/**/*.ts');
    expect(result.args[0]).toContain('*');
  });
});
```

## 下一步

下一个文档将设计**命令注册表**，定义如何注册、查找和管理命令。
