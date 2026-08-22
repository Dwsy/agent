# Changelog

## [Unreleased]

### Changed (工具重构为渐进式两工具，降低常驻 token)
- **`memory`(20 action) / `knowledge`(4 action) / `role_info` 三工具合并为 `role_search` + `role_exec`**：工具 schema 从三份长描述 + 大参数枚举缩到「search 三参数、exec 两参数」，每轮请求的常驻工具定义 token 大幅下降；详细操作目录与参数规范不再常驻，`role_exec({ op: "help" })` 按需加载（`args.topic: "edit_spec"` 返回直接编辑文件的格式规范）
- **`role_search`**：唯一检索入口，覆盖记忆全层（向量可用时混合检索，保留 auto-reinforce / pending auto-promote）+ 知识库（`scope: all|memory|knowledge`），结果统一带 `[id:...]`
- **`role_exec`**：`{ op, args }` 分发到原有 executor；`OP_CATALOG` 是 help 文本与分发集合的单一事实源，未知 op 返回错误 + 完整目录便于自纠；kb_* 惰性加载 `knowledge.ts`
- **系统提示注入瘦身**：原每轮注入 FILE LOCATIONS（14 行路径清单）+ MEMORY 协议（20 行）+ Memory Edit Spec（25 行）≈ 60 行，压缩为一个 ~12 行的 ROLE & MEMORY 块；Edit Spec 移入 help 按需加载
- 原 `tool-memory / tool-knowledge / tool-role-info` 降级为纯 executor 函数（`executeMemoryOp` / `executeKnowledgeOp` / `executeRoleInfo`），注册逻辑收进 `tool-search.ts` / `tool-exec.ts`；TUI 渲染器同步替换为 role_search（结构化命中列表）与 role_exec（op + 关键参数一行摘要）
- 打包 skills（memory-recall / memory-retro / memory-organize / memory-best-practices）内的调用示例全部迁移到新语法
- 测试：新增 `tool-exec.test.ts`（目录↔分发一致性、read 分发、未知 op 自纠、help/edit_spec 按需加载、无角色 fail-fast），125 tests 全绿

### Added (模型自主编辑记忆)
- **注入的记忆全部带 id**：`readLongTermMemoryBlock` 不再 dump `consolidated.md` 原文，改为结构化渲染，每条 learning / preference / event 前缀 `[id:...]`（High Priority 块同样带 id）。模型在上下文里看到过时或错误的条目，直接拿 id 调 `update_*` / `delete_*` / `reinforce`，省掉先 search 定位的一轮往返；顺带不再把 frontmatter 与机器元数据注释泄进提示词
- **pending 候选进入模型视野**：后台提取 / 压缩抢救的条目此前只能等搜索命中自动晋升或 7 天过期，模型完全不可见。现在注入「Pending Memories Awaiting Review」块（最多列 8 条,带 id），新增 `promote_pending` / `discard_pending` 动作（`ids` 批量），晋升同步向量索引，全部写审计日志
- **`read` 动作**：全量带 id 记忆视图，`section: all|learnings|preferences|events|pending` 过滤，替代「list 只给 20 条摘要」的窘境
- **events 补齐工具侧改删**：`update_event` / `delete_event`（精确 id 匹配,改后同步向量索引）——此前 viewer 能改,模型反而不能
- **提示词从「劝退」改为「授权」**：原注入文案（"Memory is auto-managed in the background… use them only when the user asks"）实质是在禁止模型自主编辑。重写为主动记忆协议：学到耐用的东西立即写、看到错误条目就地修、pending 候选顺手裁决；同时保留噪音红线（不存一次性琐事、删偏好需确认、不做机械性任务末反思）。工具 description 同步重写
- 测试：新增 `memory-autonomy.test.ts`（read 视图 id 完整性与 section 过滤、注入块 id、pending 待审块、promote 返回 learningId），120 tests 全绿

### Fixed (主内容区无法滚动)
- **超出视口的内容够不着**：`.app` 的隐式行是 `auto`，`.main` 又没有 `min-height: 0`，于是主区按内容撑高而不是被限制在视口内；`.pane` 因此永远不会成为滚动容器（`scrollHeight === clientHeight`），超出部分被 `body { overflow: hidden }` 直接裁掉。给三层各补上缺失的约束：`.app` 加 `grid-template-rows: minmax(0, 1fr)`、`.main` 加 `min-height: 0`、`.workspace` 加 `grid-template-rows: minmax(0, 1fr)`。全用 `minmax(0, 1fr)` 而非裸 `1fr`——后者保留 `auto` 最小值，高内容仍能把轨道顶破
- **角色定义的编辑模式塌成 153px**：`.main` 原本是三行网格（工具栏 / 分面 / 工作区），而分面栏在多数分区是 `display: none`——隐藏元素不再是网格项，工作区于是落进第二行那个 `auto` 轨道，按内容定高。预览模式内容高看不出来，编辑模式内容矮就塌掉。改成纵向 flex，消除整类「隐藏子元素挪动轨道」的问题
- 实测覆盖：列表 / 概览 / 日志 / 标签 / 详情面板 / markdown 预览 / 侧栏导航 / 分面栏横向滚动，以及 1280×420 的矮视口与 390×680 的窄屏抽屉，document 自身不再溢出

### Fixed (记忆持久化的两个长期缺口)
- **每条记忆上的 tags / source / lastAccessed 从不落盘**：`consolidated.md` 的行格式只有 `- [3x] text`，序列化时这三个字段全丢，所以 LLM 打的标签在下一次保存后就消失，`/memory-tags` 标签云与 viewer 的 Tags 视图在实践中永远是空的。现在条目末尾带一段机器维护的 HTML 注释 `<!-- tags: a, b | src: auto | seen: 2026-08-11 -->`：markdown 渲染时不可见、解析上不歧义、人在编辑原始文件时一眼能看出这段不归自己管。没有元数据的旧条目照常解析
  - 去重时合并元数据而不是丢弃：tags 取并集、source 取先到的、seen 取更晚的
  - `reinforceRoleLearning` 现在同时刷新 `lastAccessed`（字段名如此，之前因为不落盘所以无所谓）
  - 编辑、`consolidateRoleMemory`、`repairRoleMemory`、LLM tidy 全部保留元数据，均有回归测试
- **daily 条目只读**：`memory/daily/*.md` 的每个 `##` 块现在可以在 viewer 里改和删。日记条目没有 id，用「日期 + 块序号」定位，并要求请求携带调用方看到的原文，对不上就 409——序号会随 agent 追加而移动，内容才是真正的凭据。改写保留原有时间戳与类型标记，走 `writeCommittedMemoryFile`，Git 审计不断链
  - 顺带修好 `readDailyMemories`：原实现用 `lines.slice(1).join(' ')` 把多行正文压成一行，并丢掉了 EVENT/LESSON 这类类型标记

### Added (Web viewer 可编辑)
- **记忆可直接在浏览器里改**：learning / preference / event 支持编辑正文（preference 带分类、event 带标题与日期）、删除（二次确认并说明会重写 `memory/consolidated.md`）；learning 可 +1 强化；pending 可晋升/丢弃；工具栏 New 按钮按当前分区新建。快捷键 `e` 编辑、`n` 新建、`⌘Enter` 保存、`Esc` 取消
- `POST /api/memory`：单一变更入口，action 为 create/update/delete/reinforce/promote/discard，全部在边界做参数校验
- **精确 id 前置校验**：`updateRoleLearning` 等函数在 id 落空时会退化成文本子串匹配（对 LLM 工具合理，对已知 id 的界面则可能改到相邻的相似记忆）。服务端改为先确认该 id 存在，落空返回 409 让前端重新加载；并发写入撞上 `expectedHash` 同样映射为 409 而不是 500
- `updateRoleEvent` / `deleteRoleEvent`：events 此前只能新增不能改删，补齐并保持 id 与 `parseEventBlocks` 回读一致
- 变更以 `source: "viewer"` 写入 JSONL 审计日志，`/memory-log` 与工具、压缩抢救的操作并排显示（补齐 viewer/promote/discard/update_event/delete_event 图标）
- `memory-viewer-api.test.ts`：8 个真实 HTTP 集成测试，覆盖路由与状态码、CRUD 落盘、陈旧 id 拒绝（并断言没有任何记录被误改）、重复与畸形请求、pending 流转、events markdown 往返、`core/` 路径逃逸防护

### Fixed (Web viewer 可编辑)
- 只有标题、没有正文的 event 在服务端被 400 拒绝，而前端表单认为合法——两侧统一为“标题与正文至少有一个”
- 表单有未保存改动时切分区/切分面/选中其他条目会静默丢弃，现在会先确认（显式 Cancel / Esc 仍直接丢弃）
- `[`/`]` 切分面不像点击 chip 那样清除选中项，详情面板会停留在已被筛掉的条目上
- 详情面板关闭时只置 `hidden` 不清空内容，留下带监听器的陈旧 DOM
- 保存角色定义文件时若父目录已被外部删除会抛 ENOENT 返回 500，现按需重建目录

### Changed (Web viewer 重写)
- **模板不再被运行时注入改写**：旧实现把主题 CSS 用 `replace("</style>", …)`、把 Logs 视图用 `replace("</script>", …)` 塞进模板，并在运行时猴补丁 `renderTable`——注入顺序导致整套主题只能靠 `!important` 覆盖。现在界面就是 `templates/viewer.{html,css,js}` 三个文件，`renderMemoryViewerHtml()` 负责装配，零 `!important`（仅 reduced-motion 保留）
- **live 与 static 合并为一套实现**：`memory-viewer.ts` 与 `memory/html-export.ts` 各有一份互相漂移的导出数据构建器，现统一到 `memory/export-data.ts`；`mode: "live" | "static"` 决定是否暴露 Logs / Role definition 与刷新按钮
- **界面重做**：Overview 概览（统计卡、learning 强度、preference 分类、标签、近期日记）+ 分区列表 + 右侧详情面板；分面 chip 取代深层树；表格式布局改为可读的行卡片，长文本在详情面板完整展示
- **去 AI 味**：移除全部 emoji 图标（📚⚙️📅📝⏳🗂️🔴🟡🟢📊…），改用单色描边 SVG 图标集；移除注入脚本里成片的内联 style 字符串；中英混杂的提示（“保存成功”/“Loading...”）统一
- **明暗主题**：用 `light-dark()` + `color-scheme` 单套 token 表达，替代原来 dark 变量声明三遍再互相覆盖的写法；跟随系统、可手动切换并持久化
- **键盘与无障碍**：`/` 过滤、`j/k`、`1..9` 跳分区、`[`/`]` 切分面、`c` 复制、`d` 详情、`t` 主题、`r` 重载、`?` 快捷键表；listbox/option 语义、真实焦点环、`aria-current`/`aria-pressed`、reduced-motion
- **角色定义编辑器**：Read/Edit 双模式（内置极简 markdown 渲染）、脏标记、⌘S 保存、离开前确认、失败可重试
- `buildTagCloudHTML` 重写：标签名不再未转义拼进 HTML，配色与 viewer 统一
- 删除死代码 `memory-export-html.ts`（687 行，无任何引用）与旧模板 `templates/memory-export.html`

### Fixed (Web viewer)
- **事件渲染为 `[object Object]`**：服务端的 `buildExportData` 把整个 `MemoryEventRecord` 塞进 `text` 字段，Events 视图内容与搜索全废；现由共享构建器输出 `title`/`body`/`text`
- **端口探测是竞态**：`findPort` 随机猜端口后 `listen`（异步）再立刻 `close`，`try/catch` 捕不到任何错误就返回该端口；改为 `listen(0)` 由内核分配，`startMemoryServer` 相应改为返回 Promise
- **HTML 注入**：树节点名、面包屑、toast 都用 `innerHTML` 拼未转义文本；现全程 DOM 构建，内嵌 JSON 的 `<` 一律转义为 `\u003c`
- **数据是启动时的快照**：服务只在启动时构建一次 HTML，agent 后续写入的记忆看不到；现每次请求重建，并新增 `GET /api/data` 供前端 `r` 刷新
- `memory/html-export.ts` 在 ESM 下用 `__filename` 解析模板路径（Node 下必然抛错后静默降级到简陋 fallback 页面）；改用 `import.meta.url`，模板缺失直接报错
- Logs 面板的 `logsCache` 一旦加载永不失效

### Added (Web viewer)
- `memory-export-data.test.ts`：events 字符串化回归、learning 分层与统计、pending 计数、live/static 模式差异、模板装配与 `</script>` 逃逸，6 个行为测试
- Tags 视图合并两个来源：`<role>/.log/memory-tags.json` 的历史用量与遗忘曲线强度，加上当前条目实际携带的标签；没有任何当前条目引用的标签标为 idle 且不可点击筛选

### Changed (第二轮并行完善)
- **配置热加载**：runtime 模块（auto-memory / external-readonly / injection / lifecycle / compaction）的模块级 config 常量快照全部改为调用点实时读取，`reloadConfig()` 即刻生效；force-keywords 正则按源字符串 memoize
- **memory/ 清理**：移除 `repairRoleMemory` 从未读取的 `force` 参数及三个调用点；移除 `parsePendingMemory` 恒为空的 `roleName` 参数；conflicts.ts 与 text.ts 的相似度实现差异标注为有意保留
- **文档同步**：README / ARCHITECTURE 按拆分后结构重写（runtime/ 16 模块、memory/ 14 子模块、工程设施、实测行数与命令表）

### Fixed (第二轮)
- `writeKnowledge({ global: false })` 且无 rolePath 时回退写全局目录却标 `source: "role"`，现返回真实来源
- frontmatter 序列化不转义引号/反斜杠、tags 含逗号或 `]` 破坏往返；现转义并保持旧磁盘格式可读

### Added (第二轮)
- `memory-api.test.ts`：pending 生命周期（添加→晋升→过期）、搜索驱动晋升阈值（0.5）、去重、reinforce 分层、repair 幂等，5 个行为测试
- 测试套件 93/93（11 文件）；typecheck OK

### Fixed
- **API 漂移修复（对齐当前安装的 pi）**：
  - `memory-llm.ts` / `memory-tags.ts` 改为显式从 `@earendil-works/pi-ai/compat` 导入 `complete/completeSimple`（pi loader 的根别名注释明确是临时的）；相关测试 mock 同步更新
  - `memory-tags.ts` LLM 打标调用从旧版 API（自造 model 对象 + 字符串返回值）迁移到当前 `completeSimple(model, context, options)` 签名——此前运行时必然抛错静默走规则 fallback
  - **遗忘曲线 NaN bug**：`getAllTags` 调用 `calculateRetention(daysSinceUse)` 时把天数传给了从未使用的 `originalStrength` 参数，导致所有标签权重为 NaN、`forgotten` 永远为 false；移除无用参数并加回归测试
  - `/memory-tags`：移除已安装 pi 不支持的 `args` 对象 schema（`--export` 与关键词过滤此前从未生效），改为手动解析参数字符串；TUI 标签浏览器按当前 `SelectList` API 重写（原实现传 `string[]` + 错误 theme，打开即崩）
  - `SelectListTheme` 补齐必填的 `scrollInfo`/`noMatch`（角色 >10 个滚动时会崩溃）
  - memory viewer 事件过滤视图把 `MemoryEventRecord[]` 直接拼进字符串（渲染 `[object Object]`），改为格式化输出

### Added (工程设施)
- `scripts/typecheck.sh`：对着实际加载本扩展的 pi 安装做 tsc 全图类型检查，`paths` 镜像 pi loader 的运行时别名；`types/optional-deps.d.ts` 为可选原生依赖（lancedb/onnxruntime/llama）提供 ambient 声明
- 新增测试：`runtime/fs-utils.test.ts`（路径逃逸防护）、`runtime/messages.test.ts`、`memory-tags-retention.test.ts`（NaN 回归）；`bun test` 36/36
- package.json 增加 `test` / `typecheck` scripts

### Changed
- **memory-md.ts 拆分重构（行为不变）**：2564 行单体收敛为 93 行纯 re-export 门面，实现移入 `memory/` 14 个子模块（types/text/paths/consolidated/pending-store/pending/daily/mutations/search/prompt/stats/tidy/conflicts/html-export），公共导出 60 个逐一核对无缺失，12 个导入方零改动；依赖方向单向分层无循环

### Fixed (并行评审发现的运行时 bug)
- **知识库路径穿越**：`readKnowledge` 对模型可控的 path 参数无包含性校验，`../` 可读知识根目录外任意文件；已加逐源包含性检查 + 回归测试
- **角色显示名解析**：`getRoleIdentity` 多行正则会越过同行值捕获下一个列表标签，同行值后还有标签行时返回 `"-"`，空模板返回 `{name:"-"}`；改为同行优先 + 多行负向前瞻，空标签返回 undefined
- **搜索相关标签永不命中**：`searchRoleMemory` 的 relatedTagsSet 存原始大小写但用 lowercase 查询，含大写的关联标签加权（+0.15）从未生效
- **环境变量优先级不一致**：`config.ts` 中 legacy `PI_AGENT_ROLES_DIR` 反而覆盖 `PI_ROLES_DIR`，与 `role-store.ts` 相反，两者同时设置时 ROLES_DIR 与 storage.rolesDir 指向不同目录；已对齐
- 新增测试：`knowledge.test.ts`（25 个：frontmatter、五源聚合、读取优先级、搜索加权、写入版本递增、只读性）、`role-store.test.ts`（23 个：v2 布局、CWD 解析、禁用路径、identity 解析、旧布局迁移）；`bun test` 84/84

### Changed
- **编排层拆分重构（行为不变）**: `index.ts` 从 2793 行收敛为 ~90 行装配层，实现移入 `runtime/` 16 个职责单一模块：
  - `context.ts`（共享 Runtime 状态，替代闭包变量）、`lifecycle.ts`（session/agent/turn 事件）、`injection.ts`（system prompt 注入）、`compaction.ts`（压缩记忆抢救 + handoff）、`auto-memory.ts`（自动记忆检查点）、`role-activation.ts`（角色激活）、`external-readonly.ts`（外部只读记忆）
  - 工具：`tool-memory.ts` / `tool-knowledge.ts` / `tool-role-info.ts`；命令：`commands-memory.ts` / `commands-kb.ts` / `commands-role.ts`；纯工具：`messages.ts` / `fs-utils.ts` / `ui.ts`
  - 移除死代码 `setupRole` / `loadMemoryFiles`；验证：bun test 15/15、全模块图 bundle 通过、tsc 未引入新错误

### Added
- **`/role` TUI 角色控制中心**：无参数 `/role` 现在直接渲染自定义键盘导航 overlay，不再先打开系统 `select`；支持查看状态、切换/映射、创建角色、设置默认角色、禁用当前目录、查看当前角色记忆。
- **全量配置编辑器**：覆盖自动记忆、注入与搜索、向量记忆、外部只读、知识、日志、UI、高级和存储配置；按字段合并持久化到 `pi-role-persona.jsonc`，并保留环境变量最高优先级。
- **实际注入预览**：展示 core prompt、高优先级记忆、长期记忆和 daily memory；查询相关的按需/向量/外部召回只展示规则和开关，预览无搜索或晋升副作用。

### Fixed
- **向量记忆索引范围修复**: `rebuildVectorIndex` 现在同时索引 `memory/consolidated.md` 和 `memory/daily/*.md`，与架构注释保持一致
  - 原实现只索引 consolidated.md
  - 新实现解析 daily 文件中的 `## [HH:MM] CATEGORY` 条目并全部索引

### Documentation
- 重写 README.md，精简并与 v2 架构同步
- 重写 HANDOFF.md，反映当前完整实现状态
- 大幅扩展 ARCHITECTURE.md，添加详细模块图和数据流
- 新增 QUICKSTART.md，5分钟快速入门指南
- 新增 docs/README.md，文档索引和导航

---

## 2026-02-21

### Added
- **结构化角色目录（v2）**
  - 新建角色默认生成 `core/`、`memory/daily/`、`context/`、`skills/`、`archive/` 层级
  - 新增 `core/constraints.md`、`context/active-project.md`、`context/session-state.md`、`skills/active.json`
- **Role CRUD 工具（可编程操作角色文件）**
  - `role_read`：读取角色文件（默认 `memory/consolidated.md`）
  - `role_write`：覆盖/追加写入角色文件
  - `role_list`：列出角色文件（支持递归）
  - `role_search`：跨文件全文检索

### Changed
- **Memory 存储升级为单一路径（无旧版回退）**
  - 使用 `memory/consolidated.md` + `memory/daily/YYYY-MM-DD.md`
  - 启动时自动迁移历史 `MEMORY.md` 与旧 daily 文件到新结构
- **MEMORY 元数据升级**
  - 支持 YAML frontmatter（name/version/created/updated/autoConsolidate/consolidationInterval/tags）
  - 写入时自动更新 `updated`
- **Gateway 只读访问切换到新路径** (`pi-gateway/src/core/memory-access.ts`)
  - 仅读取 `core/identity.md` / `core/soul.md` 与 `memory/consolidated.md`
  - 日记仅读取 `memory/daily/`

---

## 2026-02-19

### Added
- **外部只读记忆增强** (`externalReadonly`): 可选接入只读记忆服务（如 pi-session-manager）
  - `before_agent_start` 调用 `/v1/memory/unified`，按置信度注入跨会话 hints（evidence + next_actions）
  - `agent_end` 调用 `/v1/experience/extract`，记录候选经验数量（仅日志）
  - 失败自动降级，不影响原有 MEMORY.md 与向量记忆流程
- **配置项**: `pi-role-persona.jsonc` 新增 `externalReadonly` 配置段
  - `enabled` / `baseUrl` / `token` / `timeoutMs` / `topK` / `experienceLimit` / `minConfidence`
  - 环境变量: `ROLE_EXTERNAL_READONLY`, `ROLE_EXTERNAL_BASE_URL`, `ROLE_EXTERNAL_TOKEN`, `ROLE_EXTERNAL_TIMEOUT_MS`, `ROLE_EXTERNAL_TOP_K`, `ROLE_EXTERNAL_EXP_LIMIT`, `ROLE_EXTERNAL_MIN_CONFIDENCE`

---

## 2026-02-16

### Added
- **向量记忆系统** (`memory-vector.ts`): 基于 LanceDB + OpenAI embedding 的语义搜索层
  - 在现有 Markdown 记忆之上叠加向量索引，不替换原有系统
  - 自动召回 (auto-recall): `before_agent_start` 时语义搜索注入相关记忆到 system prompt
  - 自动索引 (auto-index): 写入 learning/preference 时异步生成向量索引
  - 混合搜索 (hybrid search): 关键词 + 向量 → RRF (Reciprocal Rank Fusion) 融合排序
  - 全量重建: `vector_rebuild` action 或 `/memory-vector rebuild` 命令
  - 优雅降级: embedding 不可用时自动回退到纯关键词搜索
  - 安全: prompt injection 防护，XML 转义，输入长度限制
- **`/memory-vector` 命令**: 向量记忆管理
  - `/memory-vector stats` — 查看向量记忆状态
  - `/memory-vector rebuild` — 从 MEMORY.md 全量重建向量索引
- **memory tool 新增 actions**: `vector_rebuild`, `vector_stats`
- **配置**: `pi-role-persona.jsonc` 新增 `vectorMemory` 配置段
  - `enabled` / `provider` / `model` / `apiKey` / `autoRecall` / `autoIndex` / `hybridSearch` / `vectorWeight` / `recallLimit` / `recallMinScore` / `dbPath`
  - 环境变量: `ROLE_VECTOR_MEMORY`, `ROLE_VECTOR_API_KEY`

### Changed
- **search action 升级**: 当向量记忆激活时自动使用混合搜索 (keyword + vector → RRF)
- **session_shutdown**: 新增向量索引 flush 和资源释放
- **auto-memory extraction**: 提取后自动将新记忆写入向量索引

### Dependencies
- `@lancedb/lancedb` — 本地向量数据库 (可选，仅 vectorMemory.enabled=true 时需要)
- OpenAI Embeddings API — text-embedding-3-small ($0.02/1M tokens)

### Files Added
- `memory-vector.ts` — 向量记忆核心模块 (VectorDB, EmbeddingProvider, hybrid search, auto-recall)

### Files Modified
- `index.ts` — 集成向量记忆 init/recall/index/flush/dispose + 新增 tool actions 和命令
- `config.ts` — 新增 `VectorMemoryConfig` 类型和默认值 + 环境变量覆盖
- `pi-role-persona.jsonc` — 新增 `vectorMemory` 配置段

---

## 2026-02-13

### Added
- **压缩时记忆抢救** (`session_before_compact`): 拦截上下文压缩流程，在压缩提示词中注入 `<memory>` 提取指令，让同一次 LLM 调用同时生成 summary 和结构化记忆 JSON。解析后写入 MEMORY.md + daily memory，再从 summary 中剥离 `<memory>` 块。零额外 LLM 调用。
  - 提取类型: learning / preference / event
- **`/memory-log` 命令**: 查看近期持久化与当前会话记忆操作日志。新增/编辑/删除均写入 `.log/YYYY-MM-DD.jsonl`，保留来源、ID、旧值、新值、分类和存储状态。
- **Git memory commits**: 当 `~/.pi/roles` 是 Git 仓库时，每次 consolidated/pending/daily memory 写入自动生成 `docs(<role>): ...` 提交，并使用仓库锁、隔离 index 和冲突检测保护其他暂存改动；提交失败会恢复本次写入。
  - 每次最多 5 条，单条 ≤120 字符
  - 仅提取持久可复用的洞察，跳过一次性任务细节
  - 失败时静默回退到 pi 默认压缩逻辑

### Changed
- **evolution-reminder 重构**: 从"命令式注入"改为"低优先级备注"，避免劫持 AI 注意力
  - 计数改为用户输入轮次（非 AI 轮次）
  - 新增 60 分钟冷却期（每天最多触发一次）
  - 提示语降级: `[Daily Reflection] Consider maintaining...` → `[Low-priority note] ... always prioritize the user's current question first`
- **system prompt 记忆指令精简**: 将冗长的 `HOW TO SAVE MEMORIES` 段落替换为简短声明，明确后台自动管理记忆，除非用户要求否则不主动操作

### Files Modified
- `index.ts` - 新增 `session_before_compact` 钩子、重构 `turn_end` evolution-reminder、精简 `before_agent_start` 记忆指令、新增 `appendDailyRoleMemory` 导入

---

## 2026-02-10

### Fixed
- **memory 工具修复**: 修复了 `memory` 工具执行时的多个错误
  - `execute` 函数参数命名错误 (`_ctx` → `ctx`)
  - `TAG_MODEL` 环境变量为 `null` 时的空值保护 (`TAG_MODEL || ""`)
  - `extractTagsWithLLM` 调用参数顺序错误
  - 返回结果解构错误，正确提取 `tags` 数组中的 `tag` 字段

### Files Modified
- `index.ts` - 修复 `execute` 函数参数命名
- `memory-tags.ts` - 添加 `TAG_MODEL` 空值保护
- `memory-md.ts` - 修复 `extractTagsWithLLM` 调用参数和返回结果解构

---

## 2025-02-10

### Added
- **按需记忆搜索** (`onDemandSearch`): 第一条用户消息时，自动根据内容搜索相关记忆注入
  - 配置项: `memory.onDemandSearch.enabled` (默认: `true`)
  - 配置项: `memory.onDemandSearch.maxResults` (默认: `5`)
  - 配置项: `memory.onDemandSearch.minScore` (默认: `0.2`)
  - 配置项: `memory.onDemandSearch.alwaysLoadHighPriority` (默认: `true`)
  - 新增函数: `loadMemoryOnDemand()` - 基于查询搜索相关记忆
  - 新增函数: `loadHighPriorityMemories()` - 加载 `[3x]` 以上高频记忆
- **智能记忆加载策略**: 
  - 第一条消息: High Priority + 搜索结果 + 最近2日日记
  - 后续消息: 仅最近2日日记（轻量化）
- **最近存在文件加载**: `readMemoryPromptBlocks()` 改为加载最近2个**实际存在**的日记文件，而非固定今天/昨天

### Changed
- **记忆注入逻辑重构**: `before_agent_start` 事件处理器新增 `isFirstUserMessage` 状态跟踪
- **配置扩展**: `MemoryConfig` 新增 `onDemandSearch` 子配置
- **默认行为**: 第一条消息现在会主动搜索 MEMORY.md 中与用户查询相关的记忆

### Files Modified
- `index.ts` - 主逻辑，新增按需搜索注入
- `config.ts` - 配置类型和默认值
- `memory-md.ts` - 新增 `loadMemoryOnDemand()`, `loadHighPriorityMemories()`, `getRecentDailyMemoryFiles()`
- `pi-role-persona.jsonc` - 新增 `onDemandSearch` 配置示例

---

## 2025-02-10

### Added
- **TOOLS.md 注入支持**: 在 `loadRolePrompts` 中加入 TOOLS.md 文件注入
- **文件更新指导**: 所有 bootstrap 模板文件（AGENTS.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md, HEARTBEAT.md）添加 "何时更新/如何更新" 头部提示
- **备份目录结构**: MEMORY.md 备份现在存入 `.backup/memory/` 子目录，避免根目录混乱

### Changed
- **备份路径**: `MEMORY.backup-${timestamp}.md` → `.backup/memory/MEMORY.backup-${timestamp}.md`
- **现有备份**: 已迁移 25 个历史备份文件到新目录

### Migration
```bash
# 旧备份自动迁移（已执行）
mv ~/.pi/agent/roles/zero/MEMORY.backup*.md ~/.pi/agent/roles/zero/.backup/memory/
```

---

## 2025-02-06

### 初始版本
- 基础角色系统：创建、映射、加载
- OpenClaw 风格的文件结构（AGENTS, IDENTITY, SOUL, USER）
- 自动记忆提取（5轮/关键词/30分钟触发）
- 基础 TUI 支持

---

## 版本汇总

| 版本 | 日期 | 核心特性 |
|------|------|----------|
| v2.0 | 2026-02-21 | 结构化目录 v2、Role CRUD Tools |
| v1.5 | 2026-02-19 | 外部只读记忆增强 |
| v1.4 | 2026-02-16 | 向量记忆系统 |
| v1.3 | 2026-02-13 | 压缩时记忆抢救 |
| v1.2 | 2026-02-10 | Bug 修复、按需搜索 |
| v1.1 | 2025-02-10 | TOOLS.md 支持、备份目录 |
| v1.0 | 2025-02-06 | 初始版本 |
