# pi-gateway 测试体系整理计划

> 生成时间: 2026-02-22
> 更新: 基于 DarkViper core-refactoring-plan.md
> 执行状态: **待 DarkViper Step 2-3 完成后执行**

---

## 📊 审计统计

| 指标 | 数量 |
|------|------|
| BBD 测试文件总数 | 31 |
| 核心(core/) | 24 |
| 网关(gateway/) | 1 |
| 插件(plugins/) | 3 (+ telegram 子目录 2 个) |
| 安全(security/) | 1 |
| 工具(tools/) | 2 |

---

## 🗑️ 删除列表（确认废弃）

| 文件路径 | 原因 |
|---------|------|
| `src/core/bbd-simulation.test.ts` | M1 P0 遗留，功能已被 M2/M3/M4 覆盖 |

---

## 📝 待填充列表（SKELETON 状态）

| 文件路径 | 状态说明 |
|---------|---------|
| `src/core/bbd-v3-routing.test.ts` | SKELETON — 等待 GoldJaguar 完成 Step 2/3 |

---

## 🔄 完整映射表（基于新路径规范）

### src/core/ → core/tests/

| 原路径 | 新路径 | 分类 | 说明 |
|-------|--------|------|------|
| core/bbd-m2-simulation.test.ts | tests/integration/message-queue.test.ts | integration | 消息队列 + Collect 模式 |
| core/bbd-m3-simulation.test.ts | tests/integration/extension-ui.test.ts | integration | Extension UI WS 透传 |
| core/bbd-m4-simulation.test.ts | tests/integration/message-mode.test.ts | integration | Steer/Interrupt/Follow-up |
| ~~core/bbd-simulation.test.ts~~ | ~~删除~~ | — | M1 P0 遗留 |
| core/bbd-v3-routing.test.ts | tests/unit/routing.skeleton.test.ts | unit | **SKELETON** — 等待实现 |
| core/bbd-v3-routing-real.test.ts | tests/integration/routing.test.ts | integration | 真实路由解析 |
| core/bbd-v31-heartbeat-cron-media.test.ts | tests/integration/telegram-integration.test.ts | integration | Heartbeat + Cron + Media |
| core/bbd-v32-cron-api.test.ts | tests/integration/cron-api.test.ts | integration | Cron CLI 管理 |
| core/bbd-v32-media-security.test.ts | tests/unit/media-security.test.ts | unit | 媒体安全策略 |
| core/bbd-v32-webchat-images.test.ts | tests/integration/webchat-images.test.ts | integration | WebChat 图片处理 |
| core/bbd-v33-media-security.test.ts | tests/unit/media-parser.test.ts | unit | 媒体解析安全 |
| core/bbd-v33-media-send.test.ts | tests/integration/media-send.test.ts | integration | 媒体发送功能 |
| core/bbd-v33-system-prompts.test.ts | tests/integration/system-prompts.test.ts | integration | 系统提示词管理 |
| core/bbd-v34-auth.test.ts | tests/unit/auth.test.ts | unit | 认证配置解析 |
| core/bbd-v34-exec-guard.test.ts | tests/unit/exec-guard.test.ts | unit | 命令执行防护 |
| core/bbd-v34-message-send.test.ts | tests/integration/message-send.test.ts | integration | 消息发送流程 |
| core/bbd-v34-ssrf-guard.test.ts | tests/unit/ssrf-guard.test.ts | unit | SSRF 防护 |
| core/bbd-v35-bg002-bg003.test.ts | tests/integration/drift-recovery.test.ts | integration | 漂移检测与恢复 |
| core/bbd-v35-drift-detect.test.ts | tests/unit/drift-detector.test.ts | unit | 漂移检测核心 |
| core/bbd-v36-cron-tool.test.ts | tests/unit/cron-tool.test.ts | unit | Cron 工具函数 |
| core/bbd-v36-gateway-tools.test.ts | tests/integration/gateway-tools.test.ts | integration | 网关工具集 |
| core/bbd-v36-message-action.test.ts | tests/integration/message-action.test.ts | integration | 消息动作处理 |
| core/bbd-v37-cron-completion-sync.test.ts | tests/integration/cron-completion.test.ts | integration | Cron 完成同步 |
| core/bbd-v38-gateway-tool.test.ts | tests/unit/gateway-tool.test.ts | unit | 网关单个工具 |
| core/bbd-v38-message-action-p2.test.ts | tests/integration/message-action-p2.test.ts | integration | 消息动作 Phase 2 |

### src/gateway/ → gateway/tests/

| 原路径 | 新路径 | 分类 | 说明 |
|-------|--------|------|------|
| gateway/bbd-v34-session-reset.test.ts | tests/integration/session-reset.test.ts | integration | Session 重置逻辑 |

### src/plugins/ → plugins/tests/

| 原路径 | 新路径 | 分类 | 说明 |
|-------|--------|------|------|
| plugins/bbd-v35-cold-start.test.ts | tests/integration/cold-start.test.ts | integration | 插件冷启动优化 |
| plugins/loader.test.ts | tests/unit/loader.test.ts | unit | 插件加载器 |
| plugins/builtin/telegram/__tests__/bbd-v3-step10.test.ts | tests/integration/telegram-step10.test.ts | integration | Telegram Step 10 |
| plugins/builtin/telegram/bbd-sticker.test.ts | tests/integration/telegram-sticker.test.ts | integration | Telegram 贴纸处理 |
| plugins/builtin/telegram/bbd-v34-media-kind.test.ts | tests/unit/telegram-media-kind.test.ts | unit | 媒体类型识别 |

### src/security/ → security/tests/

| 原路径 | 新路径 | 分类 | 说明 |
|-------|--------|------|------|
| security/bbd-v35-security.test.ts | tests/integration/sender-allowlist.test.ts | integration | 发送者白名单 + Pairing |

### src/tools/ → tools/tests/

| 原路径 | 新路径 | 分类 | 说明 |
|-------|--------|------|------|
| tools/bbd-v3-delegate.test.ts | tests/integration/delegation.test.ts | integration | 委托调度逻辑 |
| tools/bbd-v3-metrics.test.ts | tests/unit/delegation-metrics.test.ts | unit | 委托指标统计 |

---

## 📁 目标目录结构

```
src/
├── core/
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── routing.skeleton.test.ts
│   │   │   ├── auth.test.ts
│   │   │   ├── exec-guard.test.ts
│   │   │   ├── ssrf-guard.test.ts
│   │   │   ├── drift-detector.test.ts
│   │   │   ├── cron-tool.test.ts
│   │   │   ├── gateway-tool.test.ts
│   │   │   ├── media-security.test.ts
│   │   │   └── media-parser.test.ts
│   │   └── integration/
│   │       ├── routing.test.ts
│   │       ├── message-queue.test.ts
│   │       ├── extension-ui.test.ts
│   │       ├── message-mode.test.ts
│   │       ├── telegram-integration.test.ts
│   │       ├── cron-api.test.ts
│   │       ├── webchat-images.test.ts
│   │       ├── media-send.test.ts
│   │       ├── system-prompts.test.ts
│   │       ├── message-send.test.ts
│   │       ├── drift-recovery.test.ts
│   │       ├── gateway-tools.test.ts
│   │       ├── message-action.test.ts
│   │       ├── message-action-p2.test.ts
│   │       └── cron-completion.test.ts
├── gateway/
│   └── tests/
│       └── integration/
│           └── session-reset.test.ts
├── plugins/
│   └── tests/
│       ├── unit/
│       │   └── loader.test.ts
│       └── integration/
│           ├── cold-start.test.ts
│           ├── telegram-step10.test.ts
│           ├── telegram-sticker.test.ts
│           └── telegram-media-kind.test.ts
├── security/
│   └── tests/
│       └── integration/
│           └── sender-allowlist.test.ts
└── tools/
    └── tests/
        ├── unit/
        │   └── delegation-metrics.test.ts
        └── integration/
            └── delegation.test.ts
```

---

## 🎯 分类标准

| 分类 | 定义 | 判断依据 |
|------|------|---------|
| **unit** | 单元测试 | 仅测试单个模块/函数，使用 mock，无外部依赖 |
| **integration** | 集成测试 | 测试模块间交互，可能调用真实依赖 |
| **e2e** | 端到端测试 | 完整流程测试，从入口到出口 |

### 当前归类逻辑

- **Unit**: 纯逻辑测试（auth, exec-guard, ssrf-guard, drift-detector, cron-tool, metrics, media-parser）
- **Integration**: 涉及多模块协调（routing, message-queue, telegram, cron-api, gateway-tools, delegation）

---

## ⚠️ 执行注意事项

1. **等待 DarkViper Step 2-3 完成** — 避免路径冲突
2. **SKELETON 文件保留** — `routing.skeleton.test.ts` 标记待实现
3. **import 路径更新** — 移动后需更新相对路径
4. **测试命令更新** — `package.json` 中的 test 脚本可能需要调整 pattern
5. **loader.test.ts 移动** — 从 `src/plugins/` 移到 `src/plugins/tests/unit/`

---

## ✅ 验收清单

- [ ] bbd-v3*.test.ts 文件数 = 0
- [ ] 所有测试按 `*.test.ts` 规范命名（无 bbd 前缀）
- [ ] 目录结构符合 `*/tests/{unit,integration}/` 规范
- [ ] 所有测试通过 (`bun test`)
- [ ] SKELETON 文件已标记
- [ ] loader.test.ts 已正确移动

---

## 📝 备注

- 映射表中 `~~删除~~` 的文件确认废弃
- 所有 SKELETON 文件保留内容，仅重命名以便后续填充
- 建议执行前创建 Git 分支，便于回滚
