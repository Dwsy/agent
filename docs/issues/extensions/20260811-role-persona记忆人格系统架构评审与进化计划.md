# role-persona 记忆人格系统架构评审与进化计划

> 日期: 2026-08-11
> 状态: Draft
> 范围: extensions/role-persona-old/ (~17,000 行, 30 文件) + role-persona/ 新包
> 前置文档: [20260429-role-persona-cli-mcp-refactor.md](../20260429-role-persona-cli-mcp-refactor.md)

---

## 一、评审结论（TLDR）

role-persona-old 是一套设计理念优秀、工程结构老化的分层记忆运行时。核心设计
（pending 验证层、零额外调用的 compaction 抢救、文件即状态 + Git 审计、记忆生命周期）
值得完整保留；主要问题集中在工程结构：两个巨型文件、Markdown 即数据库的全量重解析、
跨扩展隐式契约、检索权重无评测回路。

**最大近期风险不在代码里**：`role-persona/` 新包已按 core/service/transport 重写并于
2026-07-29 完成功能对齐（68/68 测试通过），但当前新旧两套实现**都有未提交修改**，
正在双头分叉。P1 的首要任务是结束双实现。

## 二、现状架构

### 2.1 分层结构

```text
Pi Core 事件系统 (7 钩子: session_start / before_agent_start / agent_end /
                  session_before_compact / session_shutdown / turn_end / resources_discover)
    ↓
编排层 index.ts (2793 行)
    事件编排 · 3 工具 (memory/role_*/knowledge) · 13 命令 · compaction handoff (Symbol 握手)
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 基础设施                                                          │
│   config (784)  role-store (458)  role-template (376)            │
│   logger (544)  memory-git (320, Git 审计提交·锁+隔离 index)      │
├─────────────────────────────────────────────────────────────────┤
│ 记忆核心                                                          │
│   memory-md (2564, 真相源解析/写入/搜索/去重)                      │
│   memory-llm (1073, 自动提取/tidy/日摘要)                         │
│   memory-extraction-rules (50, 噪音过滤)                          │
│   memory-tags (771, LLM 打标·共现图·遗忘曲线)                     │
├─────────────────────────────────────────────────────────────────┤
│ 检索与知识                                                        │
│   memory-vector (850, LanceDB·hybrid RRF·auto-recall)            │
│   embedding-* (1419, OpenAI/本地HTTP/MiniLM直连/守护进程)         │
│   knowledge (839, role/global/project/external)                  │
├─────────────────────────────────────────────────────────────────┤
│ 交互层                                                            │
│   role-control-center (668)  memory-viewer (640)                 │
│   memory-export-html (687)   tui-renderers (326)                 │
└─────────────────────────────────────────────────────────────────┘
    ↓
持久化: ~/.pi/roles/<role>/{core,memory,context,skills,archive}/
       .vector-db/ (LanceDB, 派生可重建) · ~/.pi/models + sockets (MiniLM daemon)
```

### 2.2 记忆数据流

```text
写入源: agent_end 自动提取 (5轮/关键词/30min)
       compaction 抢救 (summary + <memory> 同次 LLM, 零额外调用, 支持按 ID 编辑)
       手动工具/命令
    ↓ regex 噪音过滤 · hash 去重 · sourceHash 乐观并发校验
L1 daily/YYYY-MM-DD.md (原始流水, 近 2 天注入每条消息)
pending.md [○] (自动提取的 learning 候选)
    ↓ 搜索命中 score ≥ 0.5 / 显式 reinforce → promote [✓]; 长期未用 → expire [✗]
L2 consolidated.md (High used≥3 / Normal / New + Preferences + Events, 每次写入 Git 提交)
    ↓ 异步派生
L3 TagIndex (打标+共现+遗忘曲线) · VectorDB (keyword+vector RRF)
    ↓ before_agent_start 召回注入
首条消息: 按需搜索 + High Priority + 长期 + 近 2 天 daily
后续消息: 仅长期 + daily; 可选向量 auto-recall / 外部只读 hints
```

## 三、设计亮点（迁移中必须保留的资产）

| 资产 | 说明 |
|------|------|
| Pending 验证层 | 自动提取先隔离，被真实使用验证后才晋升，防止长期记忆变垃圾场。系统最有价值的决策 |
| 零额外调用 compaction 抢救 | 压缩 LLM 调用同时产出 summary + memory JSON，支持按 ID 编辑既有记忆 |
| 记忆生命周期 | 使用频次 [Nx] 驱动 High/Normal/New 分层；标签遗忘曲线；pending 过期 |
| Git 审计 | 每次记忆写入生成 `docs(<role>):` 提交，仓库锁 + 隔离 index + 失败回滚 |
| 全链路静默降级 | 向量/外部服务/LLM 打标失败均不打断主流程 |
| 可观测性 | JSONL 审计日志、/memory-log、viewer、tag cloud、vector stats |

## 四、问题清单

| # | 严重度 | 问题 | 证据与影响 |
|---|--------|------|-----------|
| 1 | 高 | 编排层上帝对象 | index.ts 2793 行集事件编排、工具 schema、13 命令、compaction 协议于一体 |
| 2 | 高 | Markdown 即数据库 | memory-md.ts 2564 行；每次读写全量重解析 consolidated.md，规模增长后性能/一致性恶化 |
| 3 | 中 | 隐式跨扩展契约 | 与 pi-custom-compaction 通过 `globalThis[Symbol.for(...)]` 握手，无类型无版本，改动即静默失效 |
| 4 | 中 | 配置 import 时固化 | index.ts 顶部展开 20+ const，运行时改配置需 /reload |
| 5 | 中 | 检索权重无评测回路 | tag +0.3/+0.15、minScore 0.2、晋升阈值 0.5 均手拍，无 golden query 验证 |
| 6 | 中 | 按需搜索只覆盖首条消息 | 长会话话题漂移后关键词召回失效，只剩可选向量兜底；注入无统一 token 预算 |
| 7 | 低 | 测试稀薄 | 17k 行仅 6 个真实 *.test.ts；根目录 test-*.ts 为临时脚本 |
| 8 | 低 | 并发无单写者 | sourceHash 乐观锁 + Git 锁，多会话同时写仍有竞争窗口，冲突即拒绝写入 |

## 五、进化目标

1. 单一实现：role-persona 包成为唯一活跃代码库，-old 退役。
2. 真相源与索引分离：Markdown 保持人类可读真相源，检索走派生增量索引。
3. 召回质量可度量：统一召回 API + golden query 评测集，权重可调可验。
4. 记忆全生命周期闭环：衰减/归档作用于记忆本体，召回效果反馈晋升决策。
5. 多代理共享：memory daemon 单写者，MCP 为主要外部界面。

## 六、分阶段计划

### P1 收敛（1-2 周）— 结束双实现

| 任务 | 说明 | 验收标准 |
|------|------|---------|
| 冻结 -old | 停止向 extensions/role-persona-old/ 提交新功能，标记为只读参照 | git log 无新功能提交 |
| Parity 清单复核 | 对照 CHANGES-SUMMARY.md 逐项验证新包行为（含 7 钩子、3 工具、13 命令、bundled skills、TUI 控制中心） | 清单全勾 + `bun test` 通过 |
| 双向未提交改动合流 | 处理当前两目录的未提交修改：有价值的移植到新包，其余丢弃 | git status 干净 |
| compaction 契约显式化 | Symbol 握手改为 pi adapter 层的显式类型化接口（`CompactionMemoryHandoff` 导出类型 + 版本字段） | pi-custom-compaction 侧同步更新，类型检查通过 |
| 切换与退役 | pi 配置指向新包 adapter；-old 移入 extensions.disabled/ 或删除 | 日常会话运行 1 周无回归 |

### P2 存储与检索（2-4 周）

| 任务 | 说明 | 验收标准 |
|------|------|---------|
| 派生索引层 | consolidated/pending/daily 解析结果落入统一派生索引（SQLite 或复用 LanceDB 元数据表），写入时增量更新，Markdown 仍是真相源 | 读路径不再全量重解析；rebuild 命令可从 Markdown 全量重建 |
| 统一召回 API | `recall(query, budget)` 单入口融合 keyword/tags/vector，内置 token 预算与去重；每条消息可召回（带查询缓存） | before_agent_start 只调用一个召回入口 |
| 评测回路 | 建 golden query 集（query → 期望命中记忆 ID），CI 跑 recall@k / MRR；权重常量收进配置 | 基线报告产出；调参有据可依 |
| 配置热加载 | 消除 import 时 const 固化，配置读取走 getter | 改配置无需 /reload（启动期常量除外，显式标注） |

### P3 记忆生命周期（2-3 周）

| 任务 | 说明 | 验收标准 |
|------|------|---------|
| 遗忘曲线扩展到记忆本体 | learning 按 lastAccessed + used 计算保留度：衰减 → 降级（High→Normal→New）→ 归档 archive/ | 长期未用记忆自动降级，可从归档恢复 |
| 定期 consolidation | llm_tidy 定时化（周级），冲突检测（/memory-conflicts）纳入同一 job | job 有运行记录与摘要日志 |
| 召回效果反馈 | 统计注入记忆是否被后续回答实际引用（引用检测可先用简单文本匹配），反哺 promote/decay | pending 晋升率、召回命中率进入 stats |

### P4 多代理（3-4 周，可与 P3 并行）

| 任务 | 说明 | 验收标准 |
|------|------|---------|
| memory daemon 单写者 | 所有写路径经 daemon（transport 层已有 daemon.ts/memory-server.ts 基础），文件级乐观锁降级为 daemon 内部串行化 | 多会话并发写无冲突拒绝 |
| MCP 为主要外部界面 | mcp-server.ts 暴露 memory/knowledge/role 工具，Cursor/Claude/Cline 共享同一角色记忆 | 至少两个宿主接入验证 |
| 宿主 adapter 瘦身 | pi/Cline adapter 只做事件桥接与注入格式化，业务全部下沉 service 层 | adapter 单文件 < 500 行 |

## 七、里程碑

| 里程碑 | 标志 |
|--------|------|
| M1 (P1 完成) | -old 退役，单一实现，compaction 显式契约 |
| M2 (P2 完成) | 召回走统一 API + 派生索引，评测基线建立 |
| M3 (P3 完成) | 记忆生命周期闭环，stats 含召回命中率 |
| M4 (P4 完成) | 多宿主共享 memory daemon |

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| 迁移期功能回归 | P1 保留 -old 只读参照 + parity 清单逐项验证；切换后观察一周再删除 |
| 派生索引与 Markdown 失同步 | 写路径单点（daemon/service 层），rebuild 命令兜底；索引带真相源 contentHash 校验 |
| 引用检测误判影响晋升 | P3 反馈初期只做统计不做自动决策，人工确认后再启用自动 promote/decay |
| pi-custom-compaction 联动改动 | 契约升级与其同一 PR/同一批提交完成，避免中间态 |

## 九、关联文档

- 评审画布: `~/.cursor/projects/Users-dengwenyu-pi-agent/canvases/role-persona-old-architecture-review.canvas.tsx`
- 旧架构文档: `extensions/role-persona-old/ARCHITECTURE.md` / `README.md` / `CHANGELOG.md`
- 新包对齐记录: `role-persona/CHANGES-SUMMARY.md`（2026-07-29 功能对齐）
- 前置重构计划: `docs/issues/20260429-role-persona-cli-mcp-refactor.md`
