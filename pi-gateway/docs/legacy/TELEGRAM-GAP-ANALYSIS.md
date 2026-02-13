# Telegram Bot: 对齐状态（pi-gateway vs OpenClaw）

更新时间：2026-02-08

## 结论

`pi-gateway` 的 Telegram 通道已完成一次结构化重构，核心能力对齐到 OpenClaw Telegram 模型：

- 多账号（`channels.telegram.accounts`）
- 入站图片接收（`photo` + 图片 `document`）
- media group 相册聚合
- polling / webhook 双模式按账号独立运行
- callback query（命令分页 + 模型选择）
- edited message / reaction / 群迁移事件处理
- 出站媒体（`/photo`、`/audio`、`[photo]`、`[audio]`）
- 账号隔离会话键、allowlist/pairing 存储、会话迁移

## 当前实现映射

| 能力 | 状态 | 位置 |
|---|---|---|
| Telegram 模块化拆分 | 已完成 | `src/plugins/builtin/telegram/` |
| 入口薄封装 | 已完成 | `src/plugins/builtin/telegram.ts` |
| 多账号解析与默认账号 | 已完成 | `src/plugins/builtin/telegram/accounts.ts` |
| 账号维度启动/停止 | 已完成 | `src/plugins/builtin/telegram/bot.ts` |
| 入站消息统一处理 | 已完成 | `src/plugins/builtin/telegram/handlers.ts` |
| 原生命令与模型按钮 | 已完成 | `src/plugins/builtin/telegram/commands.ts` |
| 媒体下载链路 | 已完成 | `src/plugins/builtin/telegram/media-download.ts` |
| 媒体发送与降级 | 已完成 | `src/plugins/builtin/telegram/media-send.ts` |
| 网络重试与冲突恢复 | 已完成 | `src/plugins/builtin/telegram/monitor.ts` |
| webhook 启停与 health | 已完成 | `src/plugins/builtin/telegram/webhook.ts` |
| Telegram 会话键账号隔离 | 已完成 | `src/core/session-router.ts` |
| 旧会话键自动迁移 | 已完成 | `src/server.ts` |
| allowlist/pairing 账号隔离 | 已完成 | `src/security/allowlist.ts`, `src/security/pairing.ts` |

## 验证

- 类型检查：`bun run check` 通过
- 单元测试：`bun test` 通过（含 Telegram 新增测试）

## 已知限制（后续可优化）

- polling offset 已按账号具备存储模块，但 runner 尚未使用外部 offset 文件进行恢复点接管。
- webhook 场景下，多个账号若配置同端口需通过不同 `webhookPath` 避免冲突。
- reaction 事件目前按文本注入，仍可继续细化成更结构化事件内容。
