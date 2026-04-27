# Issue: PI-INSIGHTS - Pi Agent Insights 系统

## Meta

| 字段 | 值 |
|------|-----|
| **创建日期** | 2026-04-01 |
| **优先级** | P1 |
| **状态** | ✅ Phase 1-5 Complete |
| **标签** | extension, insights, analytics |
| **预估工时** | 8-12 小时 |

---

## Goal

开发完整的 Pi Agent Insights 插件，实现类 Claude Code `/insights` 功能：

1. **三层数据收集**：Lite Scan → SessionMeta → AI Facets
2. **多会话检测**：检测并行使用模式
3. **AI 洞察生成**：并行生成 8 个维度的结构化洞察
4. **HTML 报告**：自包含、可分享的分析报告

---

## 参考架构

Claude Code Insights (`/Users/dengwenyu/Downloads/claude-code-source/src/commands/insights.ts`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INSIGHTS 架构流程                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: 数据收集                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│  │ Lite Scan    │───▶│ SessionMeta  │───▶│ Full Logs    │                 │
│  │ (文件系统)    │    │ (元数据缓存) │    │ (消息解析)   │                 │
│  └──────────────┘    └──────────────┘    └──────────────┘                 │
│         │                  │                  │                            │
│         ▼                  ▼                  ▼                            │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │  Phase 2: Facet Extraction (AI 提取结构化 facet)           │          │
│  │  - underlying_goal       - outcome                          │          │
│  │  - goal_categories       - user_satisfaction_counts         │          │
│  │  - friction_counts       - session_type                    │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │  Phase 3: 聚合统计 (AggregatedData)                        │          │
│  │  - tool_counts        - languages                           │          │
│  │  - outcomes           - satisfaction                        │          │
│  │  - multi_clauding     - response_times                      │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │  Phase 4: 并行洞察生成 (8 sections, Promise.all)           │          │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐            │          │
│  │  │project_    │ │interaction │ │what_works  │ ...        │          │
│  │  │areas       │ │_style      │ │            │            │          │
│  │  └────────────┘ └────────────┘ └────────────┘            │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │  Phase 5: HTML 报告生成 (自包含，可分享)                   │          │
│  │  - At a Glance  - Charts   - Suggestions                   │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phases

### Phase 1: 基础架构 ⚡
- [x] 创建插件目录结构
- [x] 定义核心类型 (SessionMeta, SessionFacets, AggregatedData)
- [x] 实现数据存储层 (缓存机制)
- [x] `/insights` 命令基础框架
- [x] Lite Scan: 扫描会话文件获取基础统计
- [x] SessionMeta: 提取工具调用、代码变更量等
- [x] 多会话检测算法 (30分钟滑动窗口)
- [x] 批量加载与缓存机制
- [x] 长会话分块摘要逻辑
- [x] Facet 提取 prompt 模板
- [x] JSON schema 验证
- [x] Facet 缓存与回退
- [x] 8 个并行洞察 section 定义
- [x] Prompt 模板设计
- [x] Promise.all 并行执行
- [x] 洞察结果聚合
- [x] 报告模板设计
- [x] Chart.js 图表集成 (CSS 实现)
- [x] 可复制内容块
- [x] 时区与国际化
- [ ] 端到端测试
- [ ] 性能基准
- [ ] 错误处理
- [ ] 用户体验优化

---

## 验收标准

| # | 标准 | 验证方法 |
|---|------|---------|
| 1 | `/insights` 命令可执行 | 运行命令无报错 |
| 2 | 生成 HTML 报告 | 报告文件存在且可打开 |
| 3 | 包含 8 个洞察维度 | 检查报告内容 |
| 4 | 多会话检测正确 | 使用多个会话测试 |
| 5 | 缓存机制生效 | 第二次运行更快 |
| 6 | 支持取消/进度 | Ctrl+C 可中断 |

---

## 技术约束

- **Pi 版本**: 0.52.9+
- **存储**: `~/.pi/agent/usage-data/`
- **报告格式**: 自包含 HTML
- **无外部依赖**: 不依赖 puppeteer 等

---

## Errors Encountered

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| - | - | - |

---

## Notes

### Pi 插件开发参考
- Quickstart: `~/.pi/agent/skills/pi-extensions/guides/01-quickstart.md`
- Paradigms: `~/.pi/agent/skills/pi-extensions/guides/02-paradigms.md`
- API: `~/.pi/agent/skills/pi-extensions/references/api.md`

### Claude Code 参考
- 入口: `src/commands/insights.ts` (3201 行)
- SessionMeta: `SessionMeta` 类型定义
- Facet 提取: `extractFacetsFromAPI()`
- 多会话检测: `detectMultiClauding()`
- 洞察 section: `INSIGHT_SECTIONS` 数组
