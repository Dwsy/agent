# QQBot Channel Design

> pi-gateway QQBot 原生频道设计文档

## Overview

将 QQBot 作为 `pi-gateway` 的内置 channel plugin，参考 OpenClaw 社区实现的模块拆分，但直接适配本仓库的 `ChannelPlugin` 接口。

## Protocol Summary

- 鉴权：`appId + clientSecret -> access_token`
- API Base: `https://api.sgroup.qq.com`
- Gateway: `GET /gateway` 获取 WSS 地址
- WebSocket: `op=10` hello, `op=2` identify, `op=1` heartbeat, `op=11` ack
- 入站事件：`C2C_MESSAGE_CREATE`、`GROUP_AT_MESSAGE_CREATE`、`AT_MESSAGE_CREATE`、`DIRECT_MESSAGE_CREATE`
- 出站接口：
  - C2C: `/v2/users/{openid}/messages`
  - Group: `/v2/groups/{group_openid}/messages`
  - Guild channel: `/channels/{channel_id}/messages`
  - Guild DM: `/dms/{guild_id}/messages`

## Target Model

`qqbot` 使用统一的 target 编码：

- `c2c|<openid>|msg=<msgId>|seq=1`
- `group|<group_openid>|msg=<msgId>|seq=1`
- `guild|<channel_id>|guild=<guild_id>|msg=<msgId>|seq=1`
- `dm|<guild_id>|guild=<guild_id>|msg=<msgId>|seq=1`

这样 `ChannelPlugin.resolveTarget()` 和 API 层都能复用同一套目标描述。

## Capability Notes

- 支持：私聊、群聊@、频道@、文本发送、群/私聊媒体上传、消息撤回
- 部分支持：流式通过“删旧重发”模拟 edit-in-place
- 不支持：官方消息 patch/edit、通用历史读取、reaction

## Security

- DM 走 `dmPolicy + allowFrom + pairing`
- Group 走 `groupPolicy + groupAllowFrom + requireMention`
- 凭证只从配置或环境变量读取，不硬编码

## Implementation Files

- `src/plugins/builtin/qqbot/index.ts`
- `src/plugins/builtin/qqbot/config.ts`
- `src/plugins/builtin/qqbot/api.ts`
- `src/plugins/builtin/qqbot/gateway.ts`
- `src/plugins/builtin/qqbot/handlers.ts`
- `src/plugins/builtin/qqbot/outbound.ts`
- `src/plugins/builtin/qqbot/media.ts`
- `src/plugins/builtin/qqbot/actions.ts`
- `src/plugins/builtin/qqbot/streaming.ts`
- `src/plugins/builtin/qqbot/types.ts`
