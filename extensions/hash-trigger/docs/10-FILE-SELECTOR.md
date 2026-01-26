# FileSelector 组件详细设计

## 组件职责

提供类似 fzf 的交互式文件选择体验。

## 状态管理

```typescript
interface FileSelectorState {
  // 数据
  allItems: string[];           // 所有文件
  filteredItems: string[];      // 过滤后的文件
  
  // 选择状态
  selectedIndex: number;        // 当前选中索引
  selectedItems: Set<string>;   // 多选时的已选项
  
  // 输入状态
  filterText: string;           // 过滤文本
  
  // 视图状态
  scrollOffset: number;         // 滚动偏移
  visibleCount: number;         // 可见项数量
  
  // 缓存
  cachedWidth?: number;
  cachedLines?: string[];
}
```

## 键盘交互

```typescript
handleInput(data: string): void {
  // 导航
  if (matchesKey(data, Key.up)) {
    this.moveUp();
  } else if (matchesKey(data, Key.down)) {
    this.moveDown();
  } else if (matchesKey(data, Key.pageUp)) {
    this.pageUp();
  } else if (matchesKey(data, Key.pageDown)) {
    this.pageDown();
  }
  
  // 选择
  else if (matchesKey(data, Key.enter)) {
    this.confirm();
  } else if (matchesKey(data, Key.tab)) {
    if (this.options.multi) {
      this.toggleSelection();
    }
  }
  
  // 取消
  else if (matchesKey(data, Key.escape)) {
    this.cancel();
  }
  
  // 过滤输入
  else if (matchesKey(data, Key.backspace)) {
    this.deleteChar();
  } else if (data.length === 1 && data >= ' ') {
    this.addChar(data);
  }
}
```

## 过滤算法

### 模糊匹配

```typescript
function fuzzyMatch(text: string, pattern: string): {
  matched: boolean;
  score: number;
  positions: number[];
} {
  const textLower = text.toLowerCase();
  const patternLower = pattern.toLowerCase();
  
  let textIndex = 0;
  let patternIndex = 0;
  const positions: number[] = [];
  let score = 0;
  
  while (textIndex < text.length && patternIndex < pattern.length) {
    if (textLower[textIndex] === patternLower[patternIndex]) {
      positions.push(textIndex);
      score += 1;
      
      // 连续匹配加分
      if (positions.length > 1 && 
          positions[positions.length - 1] === positions[positions.length - 2] + 1) {
        score += 5;
      }
      
      // 路径分隔符后匹配加分
      if (textIndex > 0 && text[textIndex - 1] === '/') {
        score += 10;
      }
      
      patternIndex++;
    }
    textIndex++;
  }
  
  return {
    matched: patternIndex === pattern.length,
    score,
    positions
  };
}
```

### 高亮匹配字符

```typescript
function highlightMatches(
  text: string, 
  positions: number[], 
  theme: Theme
): string {
  let result = '';
  let lastPos = 0;
  
  for (const pos of positions) {
    result += text.slice(lastPos, pos);
    result += theme.fg('accent', text[pos]);
    lastPos = pos + 1;
  }
  
  result += text.slice(lastPos);
  return result;
}
```

## 渲染逻辑

```typescript
render(width: number): string[] {
  const lines: string[] = [];
  
  // 1. 输入框
  const inputLine = this.renderInputLine(width);
  lines.push(inputLine);
  
  // 2. 分隔线
  lines.push(theme.dim('─'.repeat(width)));
  
  // 3. 文件列表
  const listLines = this.renderList(width);
  lines.push(...listLines);
  
  // 4. 状态栏
  const statusLine = this.renderStatus(width);
  lines.push(theme.dim('─'.repeat(width)));
  lines.push(statusLine);
  
  return lines;
}

private renderInputLine(width: number): string {
  const prefix = '> ';
  const text = this.state.filterText;
  const cursor = CURSOR_MARKER + '█';
  
  return truncateToWidth(prefix + text + cursor, width);
}

private renderList(width: number): string[] {
  const lines: string[] = [];
  const maxLines = this.options.maxHeight || 10;
  
  // 计算可见范围
  const start = this.state.scrollOffset;
  const end = Math.min(start + maxLines, this.state.filteredItems.length);
  
  for (let i = start; i < end; i++) {
    const item = this.state.filteredItems[i];
    const isSelected = i === this.state.selectedIndex;
    const isMarked = this.state.selectedItems.has(item);
    
    let line = '';
    
    // 选中标记
    if (isSelected) {
      line += theme.fg('accent', '> ');
    } else {
      line += '  ';
    }
    
    // 多选标记
    if (this.options.multi) {
      line += isMarked ? '[✓] ' : '[ ] ';
    }
    
    // 文件名（高亮匹配）
    const match = fuzzyMatch(item, this.state.filterText);
    if (match.matched) {
      line += highlightMatches(item, match.positions, theme);
    } else {
      line += item;
    }
    
    lines.push(truncateToWidth(line, width));
  }
  
  return lines;
}

private renderStatus(width: number): string {
  const filtered = this.state.filteredItems.length;
  const total = this.state.allItems.length;
  const selected = this.state.selectedItems.size;
  
  let status = `${filtered}/${total} files`;
  
  if (this.options.multi && selected > 0) {
    status += ` (${selected} selected)`;
  }
  
  return truncateToWidth(status, width);
}
```

## 滚动管理

```typescript
private ensureVisible(): void {
  const { selectedIndex, scrollOffset, visibleCount } = this.state;
  
  // 向上滚动
  if (selectedIndex < scrollOffset) {
    this.state.scrollOffset = selectedIndex;
  }
  
  // 向下滚动
  else if (selectedIndex >= scrollOffset + visibleCount) {
    this.state.scrollOffset = selectedIndex - visibleCount + 1;
  }
}
```

## 性能优化

### 1. 增量过滤

```typescript
private updateFilter(newText: string): void {
  // 如果是追加字符，只需过滤当前结果
  if (newText.startsWith(this.state.filterText)) {
    this.state.filteredItems = this.state.filteredItems.filter(item =>
      fuzzyMatch(item, newText).matched
    );
  }
  // 否则重新过滤所有项
  else {
    this.state.filteredItems = this.state.allItems.filter(item =>
      fuzzyMatch(item, newText).matched
    );
  }
  
  // 排序
  this.state.filteredItems.sort((a, b) => {
    const scoreA = fuzzyMatch(a, newText).score;
    const scoreB = fuzzyMatch(b, newText).score;
    return scoreB - scoreA;
  });
  
  this.state.filterText = newText;
  this.state.selectedIndex = 0;
  this.state.scrollOffset = 0;
}
```

### 2. 渲染缓存

```typescript
render(width: number): string[] {
  if (this.state.cachedLines && this.state.cachedWidth === width) {
    return this.state.cachedLines;
  }
  
  const lines = this.doRender(width);
  
  this.state.cachedLines = lines;
  this.state.cachedWidth = width;
  
  return lines;
}
```

## 使用示例

```typescript
const selector = new FileSelector({
  items: ['src/index.ts', 'src/utils.ts', 'README.md'],
  preview: false,
  multi: false,
  maxHeight: 10
});

selector.onSelect = (files) => {
  console.log('Selected:', files);
};

selector.onCancel = () => {
  console.log('Cancelled');
};
```

## 下一步

下一个文档将设计 SplitPane 组件。
