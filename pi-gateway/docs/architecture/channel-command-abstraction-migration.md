# Channel Command Abstraction Migration

## Summary

本次抽象把原来主要堆在 Telegram 插件内部的三类能力，开始迁到 gateway 通用层：

- 统一命令目录：`src/gateway/command-catalog.ts`
- 统一富响应模型：`src/gateway/command-types.ts` + `src/gateway/response-dispatcher.ts`
- 统一交互动作路由：`src/gateway/interaction-router.ts`

## Landed Pieces

- `CommandCatalog`
  - 网关内建命令元数据已经集中到 `build/getBuiltinCommandCatalog()`。
  - Telegram 原生命令同步改为从统一 catalog 派生，而不是手写本地列表。
  - Help 页开始消费统一 catalog 生成。

- `CommandResponse`
  - `CommandContext.respondWith()` 已接入。
  - `InboundMessage` 增加 `respondWith`，允许命令处理返回 `text + keyboard`。
  - `/role` 已迁到富响应模型，网关侧负责分发到 channel outbound。

- `InteractionActionRouter`
  - 新增统一动作入口 `routeInteractionAction()`。
  - 已承接 `cmd_page:*`、`role:*`、`kb:*`、`mdl_*`、`csm:*`、`skill_run:*` 的第一版路由。
  - Telegram callback_query 与 QQBot interaction 都可以接入该入口。

- `NativeCommandSync`
  - `ChannelPlugin.nativeCommands` 与 `GatewayPluginApi.syncNativeCommands()` 已补齐。
  - Telegram 已实现原生命令同步适配器。
  - QQBot 当前保留接口但未实现原生命令菜单注册，仅继续走消息内按钮/帮助页。

## Current Channel Status

- Telegram
  - 已接统一 native command sync。
  - 已接统一 interaction router。
  - 仍有部分历史 callback 逻辑留在 `telegram/commands.ts`，后续应继续下沉到 gateway 层。

- QQBot
  - 已声明 interaction capability。
  - 已接统一 interaction router。
  - 继续复用统一 keyboard callback (`kb:*`) 与 role/help/model action 命名空间。

## Remaining Migration Work

以下部分仍属于“抽象已立，但尚未完全瘦身”：

- Telegram `commands.ts` 里仍保留较多平台私有 UI 逻辑。
- `rsm:*` 等会话页动作还没有完全迁出到 gateway 通用 action handlers。
- `/help` 虽已复用 catalog，但帮助分页的 message edit/fallback 行为仍在 Telegram 侧处理。
- `mdl_list` / `mdl_back` 仍带有 Telegram 特定 edit-message 行为，需要进一步抽象成“页面响应 + capability 降级”。

## Suggested Next Migration Order

1. 把 `rsm:*` 从 Telegram callback 注册器继续迁到 `interaction-router.ts`
2. 把 model provider/list page 响应抽成通用 `CommandResponse` page model
3. 为 QQBot 增加对 help/model page 的薄适配测试
4. 让 Discord/Feishu 复用同一套 native command/catalog 生成逻辑

## Validation Notes

- `src/gateway/command-handler.test.ts` 当前通过。
- 当前 `tsc` 唯一剩余阻塞为工程内已有生成物 `_web-assets.ts` 缺失，不属于本次抽象改动直接引入的问题。
