# pitui — Pi 扩展:终端内的迷你桌面(悬浮面板)

测试窗口管理能力:鼠标拖拽 / 边框 resize / 最小化 / 最大化(还原) / dock 栏,
内置三个 app:**计算器**、**记事本**、**绘图**。

面板约终端 78% 宽、74% 高,居中悬浮在 pi 聊天之上,四周可见 pi 界面;

## 用法

1. 在 `~/.pi/agent/settings.json` 的 `extensions` 里加一行 `"+extensions/pitui/index.ts"`。
2. 交互式 TUI 里运行 `/pitui`(鼠标需要 fullscreen 模式:`settings.tuiMode = "fullscreen"`,这也是默认值;tmux 下 hover 事件会被过滤,拖拽/点击不受影响)。
3. `Esc` 退出。

面板状态栏右侧实时回显鼠标事件(`click@x,y button`),方便肉眼验收命中区域。
已知宿主层怪癖:overlay 刚打开时的第一次点击可能被焦点流程吞掉(组件收不到事件),再点一次即正常。

## 操作

| 操作 | 鼠标 | 键盘(兜底) |
|---|---|---|
| 移动窗口 | 拖标题栏 | `Alt+↑↓←→`(`Shift` 步进 4) |
| 调整大小 | 拖边框 / 四角 | — |
| 最小化 | 点 `[─]` | `Alt+M` |
| 最大化/还原 | 点 `[□]` / 双击标题栏 | `Alt+Z` |
| 关闭 | 点 `[✕]` | `Alt+W` |
| 切换焦点 | 点窗口 | `Alt+N` |
| 打开应用 | 点 dock 图标 | `Alt+1/2/3` |
| 退出 | — | `Esc` / `Alt+Q` |

dock 行为:点未打开的图标 = 打开;点最小化的 = 还原;点当前焦点 = 最小化。

app 内部:
- 计算器 — 数字/`+ - * /`/回车/退格/`c`,按钮可点。
- 记事本 — 直接打字,方向键移动光标,点击定位光标。
- 绘图 — 按住拖拽作画,`[`/`]` 换笔刷,`1-5` 换颜色,`e` 橡皮,`c` 清空。

## 结构

```
index.ts        扩展入口:/pitui 命令 + 面板适配层(坐标平移/事件回显)
src/wm.ts       窗口管理模型(纯函数):命中测试/拖拽/缩放/最小化/最大化/dock
src/apps.ts     三个 app 的状态与渲染
src/render.ts   桌面合成器 + 悬浮面板外边框(renderPanel)
src/grid.ts     单元格网格(CJK 双宽字符安全)
src/keys.ts     终端按键解码(方向键/Alt 组合)
src/ansi.ts     显示宽度计算 + 调色板契约
test/           bun test(模型/渲染/按键/应用 46 例)
```

## 测试

```bash
cd ~/.pi/agent/extensions/pitui && bun test
```

模型层(wm.ts)不依赖终端,拖拽/resize 的几何、命中顺序、dock 状态机都可单测验证。
