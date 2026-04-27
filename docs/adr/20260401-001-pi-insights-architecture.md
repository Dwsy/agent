# ADR-001: Pi Insights 插件架构决策

## Status

Accepted - 2026-04-01

## Context

基于 Claude Code Insights 源码分析，需要为 Pi Agent 设计类似的洞察系统。

**Claude Code 原型特点：**
- 3201 行 TypeScript
- 三层缓存：Lite Scan → SessionMeta → Facets
- 8 个并行洞察 section
- 自包含 HTML 报告
- 30 分钟多会话检测

## Decisions

### 1. 插件结构

```
extensions/pi-insights/
├── src/
│   ├── index.ts              # 插件入口
│   ├── types.ts              # 类型定义
│   ├── storage.ts            # 数据存储层
│   ├── collector/
│   │   ├── lite-scan.ts      # 快速扫描
│   │   ├── session-meta.ts   # 会话元数据
│   │   └── facets.ts         # AI facet 提取
│   ├── analyzer/
│   │   ├── multi-session.ts  # 多会话检测
│   │   └── aggregator.ts     # 数据聚合
│   ├── insights/
│   │   ├── sections.ts       # 洞察 section 定义
│   │   └── generator.ts     # 并行生成器
│   └── reporter/
│       ├── template.ts       # HTML 模板
│       └── charts.ts         # 图表生成
├── package.json
└── tsconfig.json
```

### 2. 缓存策略

| 层 | 内容 | TTL | 路径 |
|----|------|-----|------|
| Lite Scan | 会话列表 | 1h | memory |
| SessionMeta | 工具统计 | 7d | `~/.pi/agent/usage-data/session-meta/` |
| Facets | AI 提取 | 30d | `~/.pi/agent/usage-data/facets/` |

### 3. 数据模型

```typescript
interface SessionMeta {
  session_id: string
  project_path: string
  start_time: string
  duration_minutes: number
  user_message_count: number
  assistant_message_count: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  lines_added: number
  lines_removed: number
  error_count: number
}

interface SessionFacets {
  session_id: string
  goal: string
  outcome: 'fully_achieved' | 'mostly_achieved' | 'partially_achieved' | 'not_achieved'
  session_type: 'single_task' | 'multi_task' | 'iterative_refinement'
  friction_points: string[]
  highlights: string[]
}

interface AggregatedData {
  total_sessions: number
  date_range: { start: string; end: string }
  tool_counts: Record<string, number>
  lines_added: number
  lines_removed: number
  multi_session_ratio: number
  avg_session_duration: number
  top_languages: string[]
}
```

### 4. 洞察 Section (8个)

| # | Section | Prompt 主题 |
|----|---------|-------------|
| 1 | `project_areas` | 工作领域分布 |
| 2 | `interaction_style` | 交互模式叙述 |
| 3 | `what_works` | 成功的工作流 |
| 4 | `friction_analysis` | 摩擦点分析 |
| 5 | `suggestions` | 功能建议 |
| 6 | `on_the_horizon` | 前瞻性洞察 |
| 7 | `quick_wins` | 快速改进点 |
| 8 | `fun_ending` | 有趣的发现 |

### 5. 多会话检测算法

```typescript
// 滑动窗口检测
const OVERLAP_WINDOW_MS = 30 * 60 * 1000  // 30 分钟

// 模式识别：s1 -> s2 -> s1 表示多会话使用
// 返回：overlap_events, sessions_involved, user_messages_during
```

### 6. UI/UX 决策

- **命令**: `/insights [time-range]`
- **输出**: 打开浏览器查看 HTML 报告
- **进度**: 使用 `ctx.ui.setStatus()` 显示
- **取消**: AbortSignal 支持

## Consequences

### Positive
- 模块化设计便于测试和维护
- 缓存策略减少 API 调用
- 并行生成提升响应速度

### Negative
- 实现复杂度较高
- 需要处理边界情况（无数据、损坏数据）

### Risks
- 长会话 facet 提取可能超时
- HTML 报告在某些终端显示不佳

## References

- Claude Code Insights: `/Users/dengwenyu/Downloads/claude-code-source/src/commands/insights.ts`
- Pi Extensions Guide: `~/.pi/agent/skills/pi-extensions/guides/`
