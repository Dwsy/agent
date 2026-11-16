# 把 Pele 接进项目

Pele 只有一条渲染路径：Mermaid 文本 → SVG 字符串。差别只在**怎么拿到它**。四条路，按场景选。

| 方式 | 适用 | 体积（实测，bun build --minify） |
|---|---|---|
| CDN UMD `pele.global.js` | 静态页、widget HTML、无构建步骤 | 734 KB raw / **274 KB** gzip |
| `npm i pele` 全量 ESM | SPA、需要全部 32 种图 | 718 KB / **268 KB** gzip |
| `pele/core` + 按需注册 | 只要两三种图，体积敏感 | core+flowchart 147 KB / **58 KB** gzip；+sequence 190 KB / **74 KB**（每加一种 ≈ +43 KB raw） |
| 本技能 CLI | 一次性落盘 SVG，不想引依赖 | 零前端体积，离线 |

## 1. CDN（最快跑起来）

UMD，定义全局 `pele`。**绝不要加 `type="module"`**：

```html
<pre class="mermaid">
flowchart TD
  A --> B
</pre>
<script src="https://cdn.jsdelivr.net/npm/pele@1/dist/pele.global.js"></script>
<script>
  for (const el of document.querySelectorAll("pre.mermaid")) {
    pele.mount(el, el.textContent);   // 容器自适应 + 宽度变化重排
  }
</script>
```

- `@1` 跟随最新 1.x；上线锁死版本用 `@1.13.0`。
- 也可走 ESM CDN：`<script type="module">import { mount } from "https://cdn.jsdelivr.net/npm/pele@1/dist/pele.js"</script>`。
- **`onload` 可能不触发**（某些壳/webview 的脚本注入会丢事件）。生产代码加轮询兜底：

```js
if (window.pele) init();
else {
  let n = 0;
  const t = setInterval(() => {
    if (window.pele) { clearInterval(t); init(); }
    else if (++n >= 80) { clearInterval(t); showError("Pele CDN timeout"); }
  }, 100);
}
```

- 主题：在 SVG 容器或任意祖先节点上写 `--pele-*`（见 `theming.md`），明暗切换**不需要重渲**。

## 2. npm / Bun 安装

```bash
bun add pele          # 或 npm i pele / pnpm add pele / yarn add pele
```

零依赖，自带 `dist/index.d.ts`，无需 `@types`。Node 侧只支持 `render`/`parse`/`detectType`/`supports`；`mount`/`enableZoom` 需要 DOM。

### 全量

```ts
import { render } from "pele";

const { svg, width, height, type } = render(`flowchart LR
  A[下单] --> B[支付]`);
container.innerHTML = svg;
```

### 按需注册（体积敏感时）

```ts
import { register, render, supports } from "pele/core";
import flowchart from "pele/diagrams/flowchart";
import sequence from "pele/diagrams/sequence";

register(flowchart, sequence);

supports("graph TD\n A-->B");     // true（只认已注册的）
const { svg } = render("graph TD\n A-->B");
```

图型 id 就是 `pele/diagrams/<id>`，注意三个驼峰名：`gitGraph`、`quadrantChart`、`treeView`。其余：`flowchart` `sequence` `class` `state` `er` `gantt` `timeline` `pie` `xychart` `mindmap` `block` `c4` `architecture` `kanban` `sankey` `radar` `venn` `treemap` `packet` `requirement` `journey` `swimlane` `railroad` `usecase` `agentflow` `eventmodeling` `ishikawa` `cynefin` `wardley` `info`。

### 懒加载

```ts
import { renderAsync, load } from "pele/lazy";

await load("sequence");                 // 预取
const { svg } = await renderAsync("sequenceDiagram\n A->>B: hi");
```

`core` 与 `lazy` 的 API 入口要**保持一致**（别一个用 `core` 一个用 `lazy`），否则 `supports()` 看到的注册表和你以为的不是同一份。

### React / Vue

Pele 给的是字符串，用 `dangerouslySetInnerHTML` / `v-html` 之前想清楚 XSS：来源不可信就过一遍 DOMPurify（`<foreignObject>` 会被它删掉，此时公式请让 `math()` 返回 SVG 而不是 MathML）。更稳的做法是把 SVG 当外部资源：

```tsx
<img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="订单流程" />
```

## 3. 本技能 CLI（落盘，不引前端依赖）

```bash
bun ~/.pi/agent/skills/pele-mermaid/pele-mermaid.ts doc.md --inline --theme dark
```

细节见 `cli.md`。它和上面三种方式用的是同一个 `pele` 包，只是跑在 Bun 里、把 JSON 清单吐给调用方。

## 4. 三处容易踩的差异

| 场景 | 有 canvas | 无 canvas（Bun / Node / worker） |
|---|---|---|
| 文本宽度 | canvas 实测 | 内置宽度表估算（CJK 与拉丁混排正确，极端长标签可能差 1–2px） |
| `mount()` / `enableZoom()` | 可用 | 不可用（需要 DOM） |
| `fontFamily` | 可读容器 computed style | 必须显式传，且与 `--pele-font` 一致 |

SVG 的配色全部来自 CSS 变量。**因此：写进文件的 SVG 必须把变量内联**，否则它会跟着打开它的页面变色（本技能 CLI 已内联；前端渲染则由宿主页面提供，无需处理）。
