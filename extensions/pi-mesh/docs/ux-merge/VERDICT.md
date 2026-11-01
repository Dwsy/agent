# ux-merge verdict — GroupRail 并入 SessionList（两栏）

真实浏览器验收（headed Chrome + CDP，`vis=visible`）。环境注记：hidden 页面
rAF 停摆会让 Alpine `x-transition` 不收敛（与 LOOP-2 终端结论同类），验收必须
在可见标签页进行。

## Loop 0 — 结构验收：ACCEPT WITH NITS

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 1440 两栏 | PASS | grid `839px 1px 600px`；`.group-rail` 0；`scrollWidth 1440` |
| 状态过滤 | PASS | 列表头一行，37 = 1+4+7+25；按钮 top 全 52，`nowrap` |
| 分组头 | PASS | sticky（滚动后 top=131）；点击过滤 3 行，再点还原 37 |
| 拖拽 | PASS | 1 个 handle；详情 600→664，列表 775≥420；只存 `{detail:664}` |
| 900 浮层 | PASS | 列表 900 全宽；详情 560×856 @x=340 + scrim；Esc/点外关闭 |
| 390 推入 | PASS | `scrollWidth 390`；底栏 49px；详情全屏推入 |
| 硬规 | PASS | emoji 0、`select` 0、glow 0、未水合图标 0、console error 0 |
| 深色 | PASS | 无浅色泄漏；行标题 11.85、分组头 6.92、详情 13.92 |

发现：

- **S1（should-fix）** 390 下 repo chips 条被 `.mobile-only{inline-flex}` 撑成
  1198px 并被 `.session-list` 裁切，不可滚动；首个「全部」chip 被压成 29×22、
  文字两行裁切。
- **N1** 分组头计数缺 `·`（`agentdock / main 3`）。
- **N2** 深色 `--faint` 在选中行仅 2.95:1（<4.5）。

## Loop 1 — 修复与聚焦复验

| 修复 | 结果 |
| --- | --- |
| `.repo-chips.mobile-only{display:flex}` | 条带 366px，`scrollWidth 1198`，可滚 |
| `.filter-chip{flex:0 0 auto;white-space:nowrap}` | 16/16 chip 单行 22px，首 chip 40px |
| 分组头补 `<span class="faint">·</span>` | 文本 `agentdock / main · 3`，15/15 正确 |
| `--faint` 浅 `#65656e` / 深 `#92929e`；深色 sel-soft 0.10 | 深色 6.03 / 选中 4.98；浅色 5.30 / 4.75 |

复验数字：

```text
chips       16/16 单行（scrollHeight == clientHeight == 20），高度均 22
首 chip     40×22，1 行，文字完整
条带        clientWidth 366 / scrollWidth 1610 / maxScrollLeft 1244
末 chip     滚到底位于 322→378，完整可见
页面        390 == scrollWidth == innerWidth；console error 0
```

**Loop 1 verdict: PASS / ACCEPT — 无遗留项。**

## Loop 2 — 左列表 polish + 分组折叠

用户反馈：左侧不够精致、默认宽度不该占一半、分组折叠难用。

### 宽度

- grid 改为 `minmax(360px, var(--pane-list-w, 480px)) 1px minmax(0, 1fr)`。
- 1440：480 / 1 / 959（列表 33.3%）；1180：480 / 1 / 699；拖到上限 579 时详情 600。
- 存储只写 `{list}`；`{detail:664}` 旧值迁移为 720。

### 分组与折叠

```text
▾ agentdock             3       点整行折叠，x-if 从 DOM 移除行
    main · 2             ⧉      分支头静态，悬停出过滤图标
      ● 修复 file_edit…
▸ .pi                   5       折叠后计数保留
```

- `pi-mesh.collapsed` 持久化；搜索非空强制展开、清空恢复、不改存储。
- 键盘顺序（`visiblePeers`）跳过折叠组；chevron 随状态切换。
- 过滤图标 `click.stop`，点图标只过滤不折叠；右键 repo 头仍是新建对话。

### 行

- 行内 branch chip 删除；model chip 限宽 150px；文件计数保留。
- 行动作默认 `opacity:0 + pointer-events:none`，hover/选中/focus 出现；触屏常显。
- 行高 40 / repo 头 30 / 分支头 24；标题 12px/500。
- 同名 repo 仅冲突时显示父目录段（`20261031/1`、`20261030/1`），title 为完整路径。

### 复验（headed Chrome，vis=visible）

| 项 | 结果 | 关键数字 |
| --- | --- | --- |
| 1440 宽度 | PASS | 480 / 1 / 959，`scrollWidth 1440` |
| 1180 拖拽 | PASS | 最大 579 / 600；`{list:579}` 刷新恢复 |
| repo 折叠 | PASS | 37→34 行，3 个 sid DOM 0 个；刷新、搜索展开、键盘跳过均通过 |
| 过滤图标 | PASS | hover 1 / 其他 0；点图标 37→3 且未折叠；accent 常亮 |
| 行视觉 | PASS | branch chip 0；model 150px 省略；动作 opacity 0→1 |
| 900 / 390 / 深色 | PASS | 无溢出；chips 1610/1720 可滚；console error 0 |
| 重名 repo | PASS | 仅 2 个加父目录段，其余 13 个短名；480 内无截断 |

**Loop 2 verdict: PASS / ACCEPT — 无遗留项。**

## 截图索引

| 文件 | 内容 |
| --- | --- |
| `01-desktop-1440.png` | 1440 两栏 + 过滤行 + 分组头 |
| `02-filter-waiting.png` | 状态过滤（等待） |
| `03-section-filter.png` / `03b-search-empty.png` | 分组头过滤 / 搜索空态 |
| `04-drag-detail.png` | 详情拖拽后 |
| `05-900-overlay.png` | 900 列表全宽 + 详情浮层 |
| `06-mobile-390.png` / `06b-mobile-detail.png` | 390 列表 / 推入详情 |
| `07-mobile-filters-scroll.png` | 390 状态过滤横滚 |
| `08-theme-dark.png` | 深色（faint 提亮后） |
| `09c-mobile-chips-nowrap.png` / `09d-mobile-chips-end.png` | chips 单行 / 滚到底 |
| `10-section-head-sep.png` | 分组头 `· N` |
| `11-desktop-1440-polish.png` | 480 列表 + 两层分组 |
| `12-repo-collapsed.png` | repo 折叠 |
| `13-group-filter.png` | 分组过滤图标 |
| `14-desktop-1180.png` | 1180 拖拽上限 |
| `15-row-hover.png` | 行动作 hover |
| `16-mobile-390-polish.png` | 390 polish 回归 |
| `17-dark-collapse.png` / `17b-dark-filter.png` | 深色折叠 / 过滤 |
| `18-repo-disambiguated.png` | 同名 repo 去歧义 |

## 尚未覆盖（非阻塞）

- 双击复位用 `dispatchEvent` 验证（原始 CDP 双击不合并），物理双击未测。
- 触屏真实设备的手势与 44px 触控目标仅按 CSS/模拟视口核对，未上真机。
