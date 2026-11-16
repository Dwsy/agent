# pele-mermaid CLI 契约

把 Markdown 里的 ` ```mermaid ` 代码块（或单个 `.mmd`）渲染成独立可嵌入的 `.svg` 文件。
Bun + Pele，**零运行时依赖**（Pele 已 vendor 进 `vendor/pele.mjs`），不启浏览器、不连网络。

```bash
PM=~/.pi/agent/skills/pele-mermaid/src/cli.ts
bun "$PM" <input.md|input.mmd|-> [options]
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `<input>` | 必填 | `.md` / `.markdown` → 抽取全部 mermaid 块；`.mmd` / `.mermaid` → 整文件当一张图；`-` → 读 stdin（按 Markdown 处理，除非加 `--mmd`） |
| `-o, --out <dir>` | `.md`：`<输入目录>/<stem>-svg/`；`.mmd`：`<输入目录>` | 输出目录，不存在则创建 |
| `--mmd` | 关 | 强制「整份输入 = 单张图」 |
| `--inline` | 关 | 额外写 `<out>/<stem>.md`，每个成功渲染的块替换成 `![diagram N](./<stem>-N.svg)`；渲染失败的块原样保留 |
| `--theme <light\|dark>` | `light` | `dark` 内联 Pele 深色变量（取自官方主题文档） |
| `--font <family>` | 无（sans-serif） | 同时用于 Pele 的字宽测量和输出 `--pele-font`，两者必须一致，否则标签会被裁 |
| `--max-width <n>` | `900` | 布局宽度 px，`0` = 用自然宽度。**注意 < 640 会触发 Pele 的 `autoDirection`，把 `LR` 掰成 `TB`** |
| `--transparent` | 关 | 不插背景 `<rect>`（默认插，让 SVG 脱离宿主页面也能看清） |
| `--label <text>` | 无 | 给图形写 `role="img"` + `aria-label`，供读屏软件说明这张图讲什么 |
| `--audit` | 关 | 静态体检：字号下限、标签重叠、越界、缩放后可读性，结果写进 `files[].warnings` |

`--max-width`、`--theme` 支持 `--flag value` 写法；其余为布尔开关。未知参数、缺值、非法枚举一律直接报错退出。

## 输出

stdout 永远是**一个 JSON 文档**（2 空格缩进），无其它输出：

```json
{
  "ok": true,
  "input": "/abs/doc.md",
  "outDir": "/abs/doc-svg",
  "theme": "light",
  "maxWidth": 900,
  "count": 2,
  "files": [
    { "n": 1, "type": "flowchart", "mermaidType": "flowchart-v2",
      "width": 192, "height": 337, "path": "/abs/doc-svg/doc-1.svg", "bytes": 2930,
      "warnings": [] }
  ],
  "inline": "/abs/doc-svg/doc.md",
  "errors": [
    { "n": 3, "code": "syntax", "message": "...", "line": 2, "column": 11, "snippet": "  A[ --> B[" }
  ]
}
```

- `files[].n` 是块在文档中的序号（1 起），与文件名 `<stem>-<n>.svg` 一致。
- `type` 是 Pele 内部名，`mermaidType` 是 Mermaid 名（如 `class` / `classDiagram`）。
- `warnings` 只在 `--audit` 时有内容；数组为空表示这张图没查出问题。
- `ok: false` 有两种来源：**致命错误**（此时只有 `error.message`，无 `files`）和**部分失败**（`files` + `errors` 并存，成功的照样落盘）。
- 退出码：`0` 全部成功；`1` 有任何失败。

## 输出 SVG 的处理

1. `render(source, { maxWidth, fontFamily?, padding: 8 })` —— 8px 内边距，避免图形贴边。
2. **字号下限**：从 `fontSize: 16` 起逐级放大，直到图里最小的标签 ≥ 12px（上限 24px）。Pele 自己会把某些标签画小，不处理的话手机上根本看不清。
3. 主题内联：Pele 的 SVG 里写的是 `var(--pele-bg,#fff)` 这类引用，脱离宿主页面时配色取决于打开它的应用。`--theme dark` 把 12 个 `--pele-*` 追加进根 `<svg style="…">`；`light` 直接吃 Pele 自带 fallback。
4. 背景：默认在根节点后插 `<rect class="pele-bg" x="0" y="0" width="100%" height="100%" fill="var(--_bg)"/>`，用 `--transparent` 关闭。
5. **单根 XML**：输出永远是**一个** `<svg>` 根元素，可直接被 `xmllint` 校验、被 `<img>` 引用。
6. 文件即成品：`<img src="doc-1.svg">`、`![](doc-1.svg)`、HTML 内联都可用；要对齐页面主题时给 SVG 根加 CSS 变量覆盖即可，不必重渲。

## 体检（`--audit`）

静态读 SVG，不开浏览器。检查项：

| 检查 | 判据 |
|---|---|
| 字号下限 | 任何 `<text>` 的 `font-size` < 12px |
| 标签重叠 | 两个标签的包围盒相交（坐标已沿 `<g transform>` 累加到绝对位置） |
| 越界 | 标签左右超出画布 |
| 缩放可读性 | 缩到 360px 宽后最小字号 < 12px |

第三、四项是**真问题**：C4 这类 784px 宽的图缩进手机栏后字只有 5.5px。处理办法是拆图或调 `--max-width`。

**查不出的**：跨元素压盖、线条穿过文字、横向滚动 —— 这些需要真实浏览器布局。standalone .svg 没有页面上下文，本工具不做假装能查的检查。

## 限制（明确不做）

- **不产 PNG/位图**。需要位图就 `qlmanage -t -s 1600 -o out dir/x.svg`（macOS）或另接 resvg。
- **不解析 Markdown 结构**：只看围栏代码块，`info string` 以 `mermaid` / `mmd` 开头（或 `{.mermaid}`）才算，其余围栏（`ts`、```` ```bash ```` 等）原样跳过。
- **不做交互**：`mount()` / `enableZoom()` / `refresh()` 需要 DOM，落盘场景只用 `render()`。
- **不做响应式双布局**：一个 `.svg` 只有一个宽高比，塞进窄容器必然缩字或裁切。窄屏适配请交给嵌入它的页面（CSS `max-width` + 外层滚动），或用 Pele 自己那份 HTML 方案。
- **不下载外链资源**：Pele 允许 `<img>`/链接，但本工具不预取、不校验可达性；离线查看时会缺图。
- 单次运行串行渲染；32 张图的一个文档实测约 0.15 秒（M 系列）。

## 源码结构

```
src/cli.ts       参数解析、文件读写、JSON 输出
src/markdown.ts  围栏扫描、块提取、inline 改写
src/svg.ts       Pele 渲染、字号下限、主题内联、背景、无障碍名
src/audit.ts     静态体检
vendor/pele.mjs  Pele 1.13.0（MIT，vendor/PELE-LICENSE）
```

改渲染行为改 `src/svg.ts`，改抽取行为改 `src/markdown.ts`。两者都有独立单元测试，`bun test` 全跑。
