# 游戏开发指南

本指南介绍如何在 `extensions/games/` 中添加新游戏。

## 📁 目录结构

```
extensions/games/
├── index.ts           # 统一注册入口
├── shared/            # 共享代码
│   ├── types.ts      # 通用类型
│   └── utils.ts      # 渲染工具函数
├── snake/            # 贪吃蛇游戏
│   ├── index.ts      # 游戏逻辑
│   ├── types.ts      # 类型定义
│   └── constants.ts  # 常量配置
└── tetris/           # 俄罗斯方块游戏
    ├── index.ts      # 游戏逻辑
    ├── types.ts      # 类型定义
    └── constants.ts  # 常量配置
```

## 🎮 游戏模板

### 1. 创建游戏目录

```bash
mkdir -p extensions/games/mygame
```

### 2. 定义类型 (`types.ts`)

```typescript
export interface GameState {
  // 游戏状态定义
  score: number;
  highScore: number;
  gameOver: boolean;
  // ... 其他游戏特定状态
}
```

### 3. 定义常量 (`constants.ts`)

```typescript
export const GAME_WIDTH = 20;
export const GAME_HEIGHT = 10;
export const TICK_MS = 200;
export const CELL_WIDTH = 2;
export const GAME_SAVE_TYPE = "mygame-save";

export const COLORS = {
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export const SYMBOLS = {
  player: "██",
  enemy: "▓▓",
  empty: "  ",
};
```

### 4. 实现游戏逻辑 (`index.ts`)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { GameState } from "./types.js";
import { GAME_WIDTH, GAME_HEIGHT, TICK_MS, GAME_SAVE_TYPE, COLORS, SYMBOLS } from "./constants.js";
import { padLine, createBoxLine, DEFAULT_COLORS } from "../shared/utils.js";

function createInitialState(): GameState {
  return {
    score: 0,
    highScore: 0,
    gameOver: false,
    // ... 初始化其他状态
  };
}

class MyGameComponent {
  private state: GameState;
  private interval: ReturnType<typeof setInterval> | null = null;
  private onClose: () => void;
  private onSave: (state: GameState | null) => void;
  private tui: { requestRender: () => void };
  private cachedLines: string[] = [];
  private cachedWidth = 0;
  private version = 0;
  private cachedVersion = -1;
  private paused: boolean;

  constructor(
    tui: { requestRender: () => void },
    onClose: () => void,
    onSave: (state: GameState | null) => void,
    savedState?: GameState,
  ) {
    this.tui = tui;
    if (savedState && !savedState.gameOver) {
      this.state = savedState;
      this.paused = true;
    } else {
      this.state = createInitialState();
      if (savedState) {
        this.state.highScore = savedState.highScore;
      }
      this.paused = false;
      this.startGame();
    }
    this.onClose = onClose;
    this.onSave = onSave;
  }

  private startGame(): void {
    this.interval = setInterval(() => {
      if (!this.state.gameOver && !this.paused) {
        this.tick();
        this.version++;
        this.tui.requestRender();
      }
    }, TICK_MS);
  }

  private tick(): void {
    // 游戏逻辑更新
  }

  handleInput(data: string): void {
    // 处理输入
    if (this.paused) {
      if (matchesKey(data, "escape") || data === "q" || data === "Q") {
        this.onSave(this.state);
        this.dispose();
        this.onClose();
        return;
      }
      this.paused = false;
      this.startGame();
      this.version++;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "escape") || data === "p" || data === "P") {
      this.paused = true;
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      this.version++;
      this.tui.requestRender();
      return;
    }

    if (data === "q" || data === "Q") {
      this.dispose();
      this.onSave(null);
      this.onClose();
      return;
    }

    // 游戏特定输入处理
  }

  invalidate(): void {
    this.cachedWidth = 0;
  }

  render(width: number): string[] {
    if (width === this.cachedWidth && this.cachedVersion === this.version) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const boxWidth = GAME_WIDTH * CELL_WIDTH;

    // 顶部边框
    lines.push(padLine(DEFAULT_COLORS.dim(` ╭${"─".repeat(boxWidth)}╮`), width));

    // 标题和分数
    const title = `${COLORS.bold(COLORS.green("MY GAME"))} │ Score: ${this.state.score}`;
    lines.push(padLine(createBoxLine(title, boxWidth, COLORS), width));

    // 分隔线
    lines.push(padLine(DEFAULT_COLORS.dim(` ├${"─".repeat(boxWidth)}┤`), width));

    // 游戏区域
    for (let y = 0; y < GAME_HEIGHT; y++) {
      let row = "";
      for (let x = 0; x < GAME_WIDTH; x++) {
        // 渲染每个单元格
        row += SYMBOLS.empty;
      }
      lines.push(padLine(DEFAULT_COLORS.dim(" │") + row + DEFAULT_COLORS.dim("│"), width));
    }

    // 底部信息
    let footer: string;
    if (this.paused) {
      footer = `${COLORS.yellow(COLORS.bold("PAUSED"))} Press any key to continue, ESC save & exit, Q quit`;
    } else if (this.state.gameOver) {
      footer = `${COLORS.red(COLORS.bold("GAME OVER!"))} Press R to restart, Q quit`;
    } else {
      footer = `Use arrow keys to play, P pause, ESC save & exit, Q quit`;
    }
    lines.push(padLine(createBoxLine(footer, boxWidth, COLORS), width));

    // 底部边框
    lines.push(padLine(DEFAULT_COLORS.dim(` ╰${"─".repeat(boxWidth)}╯`), width));

    this.cachedLines = lines;
    this.cachedWidth = width;
    this.cachedVersion = this.version;

    return lines;
  }

  dispose(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const handler = async (_args: unknown, ctx: ExtensionAPI): Promise<void> => {
  if (!ctx.hasUI) {
    ctx.ui.notify("My Game requires interactive mode", "error");
    return;
  }

  const entries = ctx.sessionManager.getEntries();
  let savedState: GameState | undefined;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === GAME_SAVE_TYPE) {
      savedState = entry.data as GameState;
      break;
    }
  }

  await ctx.ui.custom((tui, _theme, _kb, done) => {
    return new MyGameComponent(
      tui,
      () => done(undefined),
      (state) => {
        ctx.appendEntry(GAME_SAVE_TYPE, state);
      },
      savedState,
    );
  });
};
```

### 5. 注册游戏 (`extensions/games/index.ts`)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { handler as snakeHandler } from "./snake/index.js";
import { handler as tetrisHandler } from "./tetris/index.js";
import { handler as mygameHandler } from "./mygame/index.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("snake", {
    description: "Play Snake!",
    handler: snakeHandler,
  });

  pi.registerCommand("tetris", {
    description: "Play Tetris!",
    handler: tetrisHandler,
  });

  pi.registerCommand("mygame", {
    description: "Play My Game!",
    handler: mygameHandler,
  });
}
```

## 🔧 最佳实践

### 1. 状态管理
- 使用 `this.state` 存储游戏状态
- 实现暂停/恢复功能
- 保存高分记录

### 2. 渲染优化
- 使用缓存避免重复渲染
- 仅在状态变化时更新版本号
- 使用共享工具函数（`padLine`, `createBoxLine`）

### 3. 输入处理
- 统一处理暂停/恢复
- ESC 保存并退出，Q 退出不保存
- 支持游戏重新开始

### 4. 颜色和符号
- 使用 ANSI 颜色代码
- 定义清晰的符号常量
- 保持视觉一致性

### 5. 游戏循环
- 使用 `setInterval` 实现游戏循环
- 在游戏结束时停止定时器
- 支持 `dispose` 清理资源

## 📚 参考资料

- [Snake 游戏](./snake/index.ts) - 完整示例
- [Tetris 游戏](./tetris/index.ts) - 完整示例
- [2048 游戏](./2048/index.ts) - 完整示例
- [Minesweeper 游戏](./minesweeper/index.ts) - 完整示例
- [Breakout 游戏](./breakout/index.ts) - 完整示例
- [Pong 游戏](./pong/index.ts) - 完整示例
- [共享工具](./shared/utils.ts) - 渲染辅助函数
- [共享类型](./shared/types.ts) - 通用类型定义

## 🎯 常见问题

### Q: 如何调整游戏速度？
A: 修改 `TICK_MS` 常量，值越小速度越快。

### Q: 如何保存游戏状态？
A: 使用 `ctx.appendEntry(GAME_SAVE_TYPE, state)` 保存状态。

### Q: 如何加载游戏状态？
A: 遍历 `ctx.sessionManager.getEntries()` 查找保存的状态。

### Q: 如何处理高分记录？
A: 在 `GameState` 中存储 `highScore`，并在游戏结束时更新。

---

*更新日期: 2026-01-10*