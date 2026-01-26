# Hash Trigger - 产品需求文档 (PRD)

## 项目概述

为 pi-coding-agent 开发一个基于 `#` 前缀的快速命令系统，提供类似 `@` (文件引用) 和 `/` (斜杠命令) 的自动完成体验。

## 核心需求

### 1. 自动完成体验（关键需求）

**必须实现：**
- 用户输入 `#` 后，编辑器下方**立即**显示命令建议列表
- 继续输入字母时，建议列表**实时过滤**
- 支持键盘导航（↑↓ 或 Tab）选择命令
- 按 Enter 确认选择
- 体验必须与 `@` 和 `/` 完全一致

**示例流程：**
```
用户输入: #
↓ (自动显示建议)
┌─────────────────────────────┐
│ #file - 文件选择器          │
│ #search - 代码搜索          │
│ #git - Git 操作             │
└─────────────────────────────┘

用户继续输入: f
↓ (实时过滤)
┌─────────────────────────────┐
│ #file - 文件选择器          │
└─────────────────────────────┘

用户按 Enter
↓
执行 file 命令
```

### 2. 命令功能

#### 2.1 文件选择器 (#file, #f)
- 使用 fd 快速查找文件
- 支持模式匹配（如 `src/`, `.ts`）
- 显示文件列表供用户选择
- 选择后插入 `@file` 引用

#### 2.2 代码搜索 (#search, #s)
- 使用 ripgrep (rg) 搜索代码
- 显示匹配结果（文件:行号:内容）
- 选择后插入 `@file (line N)` 引用

#### 2.3 Git 操作 (#git, #g)
- status: 显示 Git 状态
- log: 显示 Git 日志
- diff: 显示 Git diff
- branch: 切换分支（交互式）

### 3. 技术要求

#### 3.1 依赖工具
- fd: 文件查找
- rg (ripgrep): 代码搜索
- git: 版本控制

#### 3.2 架构要求
- 插件化设计，易于扩展新命令
- 使用 pi 内置 UI 组件（ctx.ui.select, ctx.ui.input）
- 工具检测与缓存机制
- 友好的错误提示

## 技术挑战

### 核心问题：自动完成实现

**问题描述：**
pi 的自动完成由 `CombinedAutocompleteProvider` 实现，该类：
1. 在 pi 核心代码中定义
2. 只支持 `/` (斜杠命令) 和 `@` (文件引用)
3. 在 `InteractiveMode` 启动时实例化
4. **扩展无法直接修改**

**尝试过的方案：**

1. **输入事件拦截** ❌
   - 使用 `pi.on('input')` 拦截 `#` 输入
   - 显示 `ctx.ui.select()` 选择器
   - 问题：不是真正的自动完成，需要额外的交互步骤

2. **运行时 Monkey Patch** ❌
   - 尝试在运行时修改 `CombinedAutocompleteProvider.prototype.getSuggestions`
   - 问题：provider 在扩展加载前已实例化，patch 无效

3. **自定义 Editor** ❌
   - 理论上可以提供自己的 editor 和 autocomplete provider
   - 问题：过于复杂，需要重新实现整个编辑器

**可行方案：**

1. **修改 pi 源码**（推荐）
   - 直接修改 `CombinedAutocompleteProvider.getSuggestions` 方法
   - 添加对 `#` 前缀的支持
   - 文件位置：`~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js`
   - 优点：完美的自动完成体验
   - 缺点：需要修改 pi 核心代码，更新后需重新修改

2. **向 pi 提交 PR**（长期）
   - 为 pi 添加扩展注册自定义 autocomplete prefix 的 API
   - 例如：`pi.registerAutocompletePrefix('#', provider)`
   - 优点：官方支持，长期可维护
   - 缺点：需要等待 pi 官方接受和发布

## 实现细节

### 修改 pi 源码的具体步骤

1. **找到 CombinedAutocompleteProvider**
   ```bash
   # 文件位置
   ~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js
   ```

2. **在 getSuggestions 方法中添加 # 支持**
   ```javascript
   // 在现有的 @ 和 / 检测之后添加
   
   // 检测 # 前缀
   const hashMatch = textBeforeCursor.match(/(?:^|[\s])(#[^\s]*)$/);
   if (hashMatch) {
     const prefix = hashMatch[1]; // 包含 #
     const commandPrefix = prefix.substring(1); // 不包含 #
     
     // 获取 hash-trigger 扩展的命令列表
     const hashCommands = [
       { value: '#file', label: '#file', description: '文件选择器' },
       { value: '#f', label: '#f', description: '文件选择器 (别名)' },
       { value: '#search', label: '#search', description: '代码搜索' },
       { value: '#s', label: '#s', description: '代码搜索 (别名)' },
       { value: '#git', label: '#git', description: 'Git 操作' },
       { value: '#g', label: '#g', description: 'Git 操作 (别名)' }
     ];
     
     // 过滤匹配的命令
     const matches = hashCommands.filter(cmd => 
       cmd.value.substring(1).startsWith(commandPrefix)
     );
     
     if (matches.length > 0) {
       return {
         items: matches,
         prefix: textBeforeCursor
       };
     }
   }
   ```

3. **重启 pi 测试**

### 扩展代码结构（已实现）

```
extensions/hash-trigger/
├── index.ts              # 主入口，拦截 # 输入
├── types.ts              # 类型定义
├── parser.ts             # 命令解析器
├── commands/             # 命令实现
│   ├── file.ts          # 文件选择
│   ├── search.ts        # 代码搜索
│   └── git.ts           # Git 操作
├── ui/                   # UI 组件
│   └── CommandSelector.ts
├── utils/                # 工具函数
│   ├── tools.ts         # 工具检测
│   └── fuzzy.ts         # 模糊匹配
└── docs/                 # 设计文档
    ├── 00-OVERVIEW.md
    ├── 01-INTERCEPTOR.md
    ├── 02-REGISTRY.md
    ├── 03-COMMANDS.md
    ├── 04-TOOLS.md
    ├── 05-CONFIG.md
    ├── 06-EXTENSION.md
    ├── 07-TOOLS-SIMPLE.md
    ├── 08-REVIEW.md
    ├── 09-TUI-COMPONENTS.md
    └── 10-FILE-SELECTOR.md
```

## 用户反馈

**用户需求：**
- "我就是要#自动完成"
- "如果不行我宁愿不要这个插件了"

**测试结果：**
- Monkey Patch 方案：无效
- 输入拦截方案：不符合需求（需要额外交互）

**结论：**
必须修改 pi 源码才能实现真正的自动完成体验。

## 后续计划

### 短期（如果用户同意修改 pi 源码）
1. 备份 pi 源码
2. 修改 `CombinedAutocompleteProvider`
3. 测试自动完成功能
4. 完善命令实现

### 中期
1. 向 pi 项目提交 Issue，说明需求
2. 提交 PR，添加扩展注册 autocomplete prefix 的 API
3. 等待官方反馈

### 长期
1. 如果 PR 被接受，重构扩展使用官方 API
2. 添加更多命令（如 #npm, #docker 等）
3. 支持自定义命令配置

## 参考资料

### pi 相关
- pi 文档：`~/.local/share/nvm/v23.11.1/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
- 扩展文档：`docs/extensions.md`
- TUI 文档：`docs/tui.md`

### 自动完成实现
- `CombinedAutocompleteProvider` 源码位置
- `InteractiveMode.setupAutocomplete` 方法
- `Editor.setAutocompleteProvider` 方法

### 类似项目
- VSCode 的命令面板 (Ctrl+Shift+P)
- Vim 的命令模式自动完成
- Emacs 的 M-x 命令补全

## 总结

Hash Trigger 是一个很好的想法，但受限于 pi 的架构设计，无法通过纯扩展方式实现真正的自动完成。

**唯一可行的方案是修改 pi 源码**，或者等待 pi 官方添加相关 API 支持。

如果用户愿意修改 pi 源码，这个功能完全可以实现，并且体验会非常好。
