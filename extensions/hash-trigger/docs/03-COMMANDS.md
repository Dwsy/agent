# 内置命令设计

## 命令插件架构

每个命令都是独立的插件，遵循统一接口。

## 1. File 命令

### 功能
快速选择和引用文件。

### 依赖工具
- **必需**: 无（有降级方案）
- **可选**: fd, fzf, bat

### 使用方式

```bash
#file                    # 交互式选择文件
#file src/               # 在 src/ 目录下选择
#file *.ts               # 选择 TypeScript 文件
#file --preview          # 启用预览
#file --edit             # 选择后编辑
```

### 工具集成策略

```
有 fd + fzf + bat
  → 使用 fd 查找 + fzf 选择 + bat 预览
  
有 fd + fzf
  → 使用 fd 查找 + fzf 选择（无预览）
  
只有 fzf
  → 使用 find 查找 + fzf 选择
  
都没有
  → 使用 pi 内置文件选择器
```

### 实现要点

```typescript
// 工具检测
const hasFd = await toolManager.has('fd');
const hasFzf = await toolManager.has('fzf');
const hasBat = await toolManager.has('bat');

// 选择策略
if (hasFd && hasFzf) {
  return await fdFzfStrategy(args, ctx);
} else if (hasFzf) {
  return await findFzfStrategy(args, ctx);
} else {
  return await builtinStrategy(args, ctx);
}
```

## 2. Search 命令

### 功能
快速搜索代码内容。

### 依赖工具
- **必需**: 无
- **可选**: rg (ripgrep), fzf

### 使用方式

```bash
#search auth             # 搜索 "auth"
#search "user login"     # 搜索短语
#search auth --case      # 区分大小写
#search auth --type ts   # 只搜索 .ts 文件
```

### 工具集成策略

```
有 rg + fzf
  → 使用 rg 搜索 + fzf 选择结果
  
只有 rg
  → 使用 rg 搜索，直接显示结果
  
都没有
  → 使用 grep 搜索
```

## 3. Git 命令

### 功能
快速执行 Git 操作。

### 依赖工具
- **必需**: git
- **可选**: delta, fzf

### 使用方式

```bash
#git status              # Git 状态
#git log                 # Git 日志
#git diff                # Git diff
#git branch              # 切换分支（交互式）
```

### 工具集成策略

```
有 git + delta + fzf
  → 使用 delta 美化 diff + fzf 选择
  
有 git + fzf
  → 使用 fzf 选择分支/提交
  
只有 git
  → 直接执行 git 命令
```

## 命令插件模板

```typescript
export const myCommand: Command = {
  name: 'my',
  description: 'My custom command',
  aliases: ['m'],
  enabled: true,
  
  dependencies: {
    optional: ['tool1', 'tool2']
  },
  
  async handler(args, ctx) {
    // 1. 检查工具
    const hasTool = await ctx.tools.has('tool1');
    
    // 2. 选择策略
    if (hasTool) {
      return await enhancedStrategy(args, ctx);
    } else {
      return await basicStrategy(args, ctx);
    }
  },
  
  autocomplete(prefix, ctx) {
    // 提供自动补全建议
    return ['option1', 'option2'];
  },
  
  help() {
    return `
Usage: #my [options]

Options:
  --option1    Description
  --option2    Description
    `;
  }
};
```

## 下一步

下一个文档将设计**工具集成层**，定义如何检测、调用和管理外部 CLI 工具。
