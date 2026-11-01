# pi-mesh docs

本目录是 pi-mesh 的设计空间。**代码是事实，文档解释「为什么」**；两者冲突时，
改代码的那次提交同时改文档。

## 文档地图

| 文档 | 内容 | 什么时候读 |
| --- | --- | --- |
| [architecture.md](architecture.md) | 运行时拓扑、身份与状态机、wire 契约、8 条数据流、失败语义、模块地图、扩展步骤 | 改协议 / 加请求类型 / 动 hub 或状态机 / 排查跨进程问题 |
| [design.md](design.md) | 产品与工程决策：零 tool、关注图、resume 租约、Session Workbench 信息架构、决策记录、非目标 | 改交互 / 加功能 / 想推翻既有设计前 |
| [style.md](style.md) | 视觉与交互风格（native / 反 slop / token / 组件语法）+ 代码与测试风格 | 动 WebUI 视觉、控件、文案；写新模块前对齐风格 |

## 证据存档（只读）

| 路径 | 内容 |
| --- | --- |
| [ux-rework-spec.md](ux-rework-spec.md) | Session Workbench 的原始规格（布局/交互/组件/迁移序），历史基线 |
| [ux-verify/VERDICT.md](ux-verify/VERDICT.md) | 4 轮真实浏览器验收（loop 0→4）的判定与截图索引 |
| [ux-verify/](ux-verify/) | 验收截图 `v1-*` … `v5-*`（1440 / 900 / 390，双主题） |
| [ux-review-a/](ux-review-a/) | 流程评审①：旅程记分卡 + 真实浏览器截图 |
| [ux-review-b/](ux-review-b/) | 质感评审②：native 评分 + 逐项参数建议 |
| [ux-merge/VERDICT.md](ux-merge/VERDICT.md) | 左栏并入列表（两栏）的真实浏览器验收：loop 0 三个发现 → loop 1 PASS |

存档是历史证据，不追改。新一轮验收**追加**章节，不覆盖旧判定。

## 阅读路径

```text
新接手
  README → AGENTS.md → architecture.md §1-3 → design.md §1-4
要改协议
  architecture.md §4 契约 → src/protocol.ts → §9 扩展步骤
要改界面
  design.md §4 信息架构 → style.md Part A → docs/ux-verify 最新 loop
要改视觉细节
  style.md A1 硬规 → A2 token → A5 组件语法
要验收
  design.md §8 → ux-verify/VERDICT.md 的 loop 结构
```

## 维护约定

1. 只写**当前事实**与**仍然生效的理由**；过期方案进 `design.md` 的决策记录（含被否决项）。
2. 不复制代码：给 `文件:符号`，不给整段实现。
3. 新增顶层模块 / 新请求类型 / 新硬规 → 同一次改动内更新对应文档。
4. 截图与 verdict 留在 `ux-*` 目录，不挪动（历史报告引用这些路径）。
