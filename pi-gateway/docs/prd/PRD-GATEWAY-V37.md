# PRD: pi-gateway v3.7 — Code Quality & Type Safety

**Author:** pi-zero (PM)  
**Date:** 2026-02-13  
**Status:** Active  
**Baseline:** v3.6 (687 tests, tag `923a855`)  
**Consultant:** EpicViper (architecture review, not implementation)

---

## Goal

v3.7 聚焦代码质量：消除 `as any` 类型安全隐患、拆分超长文件、补齐测试覆盖。不加新功能。

---

## Task DAG

```
                    ┌─────────┐
                    │ T1 (✅) │ S3 ExecGuard wiring
                    └─────────┘
                    ┌─────────┐
                    │ T2 (✅) │ handlers.ts 拆分
                    └─────────┘
                    ┌─────────┐
                    │ T3 (✅) │ commands.ts 拆分
                    └─────────┘
                    ┌─────────┐
                    │ T4 (✅) │ Config 类型补全
                    └─────────┘

  ┌──────┐   ┌──────┐   ┌──────┐
  │  T5  │   │  T6  │   │  T7  │    ← 三个独立，可并行
  │ RPC  │   │ pipe │   │ srv  │
  │ 事件 │   │ line │   │ 提取 │
  └──┬───┘   └──────┘   └──────┘
     │
     ▼
  ┌──────┐
  │  T8  │  gateway-tools 拆分（依赖 T5 的 RPC 事件类型）
  └──────┘

  ┌──────┐   ┌──────┐
  │  T9  │   │ T10  │    ← 独立，可并行
  │ sec  │   │  gc  │
  │ test │   │ 定时 │
  └──────┘   └──────┘
```

**并行组：**
- Group A: T5 + T6 + T7 （三个独立，可同时开工）
- Group B: T8 （依赖 T5）
- Group C: T9 + T10 （独立，可同时开工，可与 Group A 并行）

---

## Task Details

### T1 ✅ S3 ExecGuard wiring — `303bcb5`
- **Owner:** EpicViper
- **改动:** daemon.ts + metrics.ts + cli.ts + server.ts, +54/-17

### T2 ✅ handlers.ts 拆分 — `c64e913` + `66c0baf`
- **Owner:** EpicViper
- **结果:** 1199 行 → handlers(528) + streaming(464) + outbound(213)

### T3 ✅ commands.ts 拆分 — `2880d20`
- **Owner:** EpicViper
- **结果:** 650 行 → commands(464) + model-selector(222)

### T4 ✅ Config 类型补全 — `9d063c6`
- **Owner:** EpicViper
- **改动:** 消除 8 处 `as any`, +22/-9

---

### T5 — RPC 事件类型定义
- **优先级:** P1
- **Owner:** 待认领
- **文件:** `src/api/chat-api.ts` (6处), `src/gateway/message-pipeline.ts` (5处)
- **目标:** 定义 RPC 事件联合类型（text_delta / tool_execution_start / agent_end 等），替换 `(event as any).xxx`
- **改动量:** ~40 行类型定义 + ~20 行替换
- **依赖:** 无
- **验收:** `rg "as any" src/api/chat-api.ts src/gateway/message-pipeline.ts` 返回 0 非测试结果

### T6 — message-pipeline.ts `as any` 清理
- **优先级:** P2
- **Owner:** 待认领
- **文件:** `src/gateway/message-pipeline.ts` (322行, 5处 `as any`)
- **目标:** 消除 normalizeOutgoingText 等处的 `as any`，用正确类型替代
- **改动量:** ~15 行
- **依赖:** 无（与 T5 有文件重叠但改动区域不同：T5 改事件解析，T6 改消息处理）
- **验收:** message-pipeline.ts 零 `as any`

### T7 — server.ts cron announcer 提取
- **优先级:** P2
- **Owner:** 待认领
- **文件:** `src/server.ts` (597行)
- **目标:** 提取 cron announcer 逻辑 (~85行) 到 `src/core/cron-announcer.ts`，server.ts 降到 ~510 行
- **改动量:** 新建 1 文件 + server.ts 删减
- **依赖:** 无
- **验收:** `wc -l src/server.ts` < 520

### T8 — gateway-tools 扩展拆分
- **优先级:** P2
- **Owner:** 待认领
- **文件:** `extensions/gateway-tools/index.ts` (538行)
- **目标:** 拆分为 send-media-tool.ts / send-message-tool.ts / message-action-tool.ts / cron-tool.ts + index.ts 注册入口
- **改动量:** 新建 4 文件 + index.ts 重构
- **依赖:** T5（RPC 事件类型可能影响 tool 注册方式，建议 T5 先完成）
- **验收:** 每个文件 < 200 行，`wc -l extensions/gateway-tools/index.ts` < 100

### T9 — security/ 单元测试
- **优先级:** P3
- **Owner:** 待认领
- **文件:** `src/security/allowlist.ts` (129行), `src/security/pairing.ts` (180行)
- **目标:** 补齐 allowlist（DmPolicy CRUD + persistence）和 pairing（code gen/verify/expiration）的单元测试
- **改动量:** 新建 1 测试文件 ~150 行
- **依赖:** 无
- **验收:** `bun test` 新增 ≥15 个 test case

### T10 — SystemEventsQueue gc 自动定时
- **优先级:** P3
- **Owner:** 待认领
- **文件:** `src/core/system-events.ts`
- **目标:** gc 不再依赖外部 keepalive tick，内部 setInterval 自动清理（30s 或 60s）
- **改动量:** ~10 行
- **依赖:** 无
- **验收:** gc 在无外部调用时仍能自动触发

---

## Claim Rules

1. 在 messenger 里发 `认领 T<N>` 即可
2. 认领后 reserve 相关文件
3. 完成后跑 `bun test` 确认 0 fail，发 commit hash
4. 有问题问 EpicViper（咨询专家）
5. 建议并行：一人一个 T，避免文件冲突

---

## Timeline

- T5/T6/T7/T9/T10 可立即开工（无依赖）
- T8 等 T5 完成后开工
- 全部完成后 v3.7 封版
