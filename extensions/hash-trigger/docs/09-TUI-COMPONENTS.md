# TUI 原子组件设计

## 设计理念

基于 pi 的 TUI 系统，设计一套可复用的原子级交互组件。

## 组件分类

### 1. 选择器组件 (Selectors)
- FileSelector - 文件选择器
- SearchResultSelector - 搜索结果选择器
- BranchSelector - Git 分支选择器

### 2. 预览组件 (Previews)
- FilePreview - 文件预览（语法高亮）
- DiffPreview - Git diff 预览
- SearchPreview - 搜索结果预览

### 3. 输入组件 (Inputs)
- FilterInput - 过滤输入框
- CommandInput - 命令输入框

### 4. 状态组件 (Status)
- ProgressBar - 进度条
- Spinner - 加载动画
- StatusLine - 状态栏

### 5. 布局组件 (Layouts)
- SplitPane - 分栏布局（左右/上下）
- BorderedBox - 带边框的容器
- FloatingPanel - 浮动面板

## 核心组件设计

### 1. FileSelector

**功能**: 交互式文件选择器，类似 fzf

**特性**:
- 模糊搜索过滤
- 键盘导航（↑↓）
- 文件预览（可选）
- 多选支持（可选）
- 显示文件图标（可选）

**接口**:
```typescript
interface FileSelectorOptions {
  items: string[];              // 文件列表
  preview?: boolean;            // 是否显示预览
  multi?: boolean;              // 是否多选
  placeholder?: string;         // 输入框占位符
  maxHeight?: number;           // 最大高度
}

class FileSelector implements Component {
  constructor(options: FileSelectorOptions);
  
  // 事件
  onSelect?: (files: string[]) => void;
  onCancel?: () => void;
  
  // 方法
  setItems(items: string[]): void;
  getSelected(): string[];
}
```

**布局**:
```
┌─────────────────────────────────────┐
│ > 搜索: src/                        │
├─────────────────────────────────────┤
│ > src/index.ts                      │
│   src/utils.ts                      │
│   src/types.ts                      │
│   ...                               │
├─────────────────────────────────────┤
│ 3/150 files                         │
└─────────────────────────────────────┘
```

### 2. SplitPane

**功能**: 分栏布局，左侧列表，右侧预览

**特性**:
- 左右分栏
- 可调整比例
- 自动适应终端宽度

**接口**:
```typescript
interface SplitPaneOptions {
  left: Component;              // 左侧组件
  right: Component;             // 右侧组件
  ratio?: number;               // 分栏比例 (0-1)
  minLeftWidth?: number;        // 左侧最小宽度
  border?: boolean;             // 是否显示边框
}

class SplitPane implements Component {
  constructor(options: SplitPaneOptions);
  
  setRatio(ratio: number): void;
  setLeft(component: Component): void;
  setRight(component: Component): void;
}
```

**布局**:
```
┌──────────────┬──────────────────────┐
│ > file1.ts   │ // file1.ts          │
│   file2.ts   │ export function...   │
│   file3.ts   │                      │
│              │ function helper() {  │
│              │   ...                │
│              │ }                    │
└──────────────┴──────────────────────┘
```

### 3. SearchResultSelector

**功能**: 搜索结果选择器，显示匹配行

**特性**:
- 显示文件名和行号
- 高亮匹配内容
- 上下文行（可选）
- 跳转到文件

**接口**:
```typescript
interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matches: [number, number][];  // 匹配位置
}

interface SearchResultSelectorOptions {
  results: SearchResult[];
  contextLines?: number;        // 上下文行数
  maxHeight?: number;
}

class SearchResultSelector implements Component {
  constructor(options: SearchResultSelectorOptions);
  
  onSelect?: (result: SearchResult) => void;
  onCancel?: () => void;
}
```

**布局**:
```
┌─────────────────────────────────────┐
│ src/auth.ts:42                      │
│ > function login(user, pass) {      │
│     if (!user || !pass) return;     │
│   }                                 │
├─────────────────────────────────────┤
│ src/utils.ts:15                     │
│   function validateUser(user) {     │
│     return user.length > 0;         │
│   }                                 │
├─────────────────────────────────────┤
│ 2 results in 2 files                │
└─────────────────────────────────────┘
```

### 4. FilterInput

**功能**: 带实时过滤的输入框

**特性**:
- 实时过滤
- 模糊匹配
- 高亮匹配字符
- 历史记录（可选）

**接口**:
```typescript
interface FilterInputOptions {
  placeholder?: string;
  fuzzy?: boolean;              // 模糊匹配
  caseSensitive?: boolean;
}

class FilterInput implements Component, Focusable {
  constructor(options?: FilterInputOptions);
  
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  
  getValue(): string;
  setValue(value: string): void;
}
```

### 5. ProgressBar

**功能**: 进度条显示

**特性**:
- 百分比显示
- 自定义样式
- 动画效果

**接口**:
```typescript
interface ProgressBarOptions {
  total: number;
  current: number;
  width?: number;
  showPercent?: boolean;
  style?: 'bar' | 'dots' | 'spinner';
}

class ProgressBar implements Component {
  constructor(options: ProgressBarOptions);
  
  setProgress(current: number): void;
  setTotal(total: number): void;
}
```

**样式**:
```
[████████████░░░░░░░░] 60% (30/50)
```

## 组合使用示例

### 文件选择器 + 预览

```typescript
const fileSelector = new FileSelector({
  items: files,
  preview: true
});

const filePreview = new FilePreview();

const splitPane = new SplitPane({
  left: fileSelector,
  right: filePreview,
  ratio: 0.4
});

fileSelector.onSelect = (files) => {
  filePreview.setFile(files[0]);
};
```

### 搜索结果 + 过滤

```typescript
const filterInput = new FilterInput({
  placeholder: '过滤结果...'
});

const resultSelector = new SearchResultSelector({
  results: searchResults
});

const container = new Container();
container.addChild(filterInput);
container.addChild(resultSelector);

filterInput.onChange = (value) => {
  const filtered = searchResults.filter(r => 
    r.text.includes(value)
  );
  resultSelector.setResults(filtered);
};
```

## 下一步

下一个文档将详细设计每个组件的实现细节。
