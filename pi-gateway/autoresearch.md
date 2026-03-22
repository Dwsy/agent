# Autoresearch: discord 对齐 openclaw-discord@2026.3.13

## 参考版本
**@openclaw/discord@2026.3.13** — npm 最新版，2026-03 对齐

## 状态：完成 ✅

## Constraints
- 不修改核心消息管道
- 不新增运行时依赖
- `bun test` 和 `bun run tsc --noEmit` 必须通过
- 不作弊 benchmark

## 核心指标
```
type_errors          = 0       ← TypeScript 干净
discord_modules      = 7        ← index/handlers/commands/format/types/runtime/subagent-hooks
discord_capabilities = 20       ← nativeCommands/polls/streaming/react 等
discord_tests        = 24       ← 7 个测试文件全部通过
discord_handler_exports = 11
```

## 已对齐模块 (7/7 参考模块)

| 模块文件 | 功能 |
|---------|------|
| `index.ts` | ChannelPlugin 注册，capabilities/nativeCommands/polls/mentions |
| `handlers.ts` | handleMessage/handleInteraction/sendOutbound/streaming/poll |
| `commands.ts` | registerGuildCommands (REST v10), STATIC_COMMANDS (8命令) |
| `format.ts` | splitDiscordText/formatToolLine |
| `types.ts` | DiscordChannelConfig/DiscordGuildConfig/DiscordPluginRuntime |
| `runtime.ts` | DiscordRuntime store (singleton) |
| `subagent-hooks.ts` | 线程绑定 (createDiscordThreadBinding等) |

## 管道概览
```
入站: Discord Gateway → handlers.ts → dispatch → Agent
出站: Agent → handlers.ts respond → sendOutbound → Discord API
线程绑定: subagent_spawning → createDiscordThreadBinding
```

## 关键 Capabilities (20)
nativeCommands, polls, direct, group, thread, media, streaming, security,
reactions, editable, deletable, pinnable, history, mentions.stripPatterns

## 测试覆盖（7 文件，24 测试）
- discord-format.test.ts — splitDiscordText, formatToolLine
- discord-subagent-hooks.test.ts — thread binding store
- discord-handlers.test.ts — parseDiscordTarget, text chunking
- discord-commands.test.ts — STATIC_COMMANDS, helpText
- discord-types.test.ts — config types, runtime structure
- discord-runtime.test.ts — runtime timestamp tracking
- discord-streaming.test.ts — edit cutoff, throttle debounce, content sequence

## Framework-Level TODOs (SDK 依赖)
- `directory.listPeers/listGroups` — 需要 openclaw/plugin-sdk/discord SDK
- `agentPrompt.messageToolHints` — ChannelCapabilityMatrix 不支持
- `threading.resolveReplyToMode` — ChannelCapabilityMatrix 不支持

## Experiments (15 total)
Baseline + #2-#15: 全部 keep

## 实验记录
| # | 提交 | 描述 |
|---|------|------|
| baseline | dfb5ea7 | 5 modules, 18 capabilities, type_errors=0 |
| #2 | de60d3d | nativeCommands, polls, sendPoll, blockStreaming |
| #3 | 8048208 | subagent-hooks.ts 线程绑定 |
| #4 | 8911683 | runtime.ts singleton store |
| #5 | 80e9b31 | 10 单元测试 format/subagent-hooks |
| #6 | fbfa252 | discord-handlers.test.ts |
| #7 | 78c1aab | mentions.stripPatterns type |
| #8 | 64d2fed | mentions 配置完整 |
| #9 | c539ef1 | Message Content Intent probe |
| #10 | a87a281 | discord-commands.test.ts |
| #11 | eef4743 | discord-streaming.test.ts |
| #12 | bd44eaa | 对齐完成宣言 |
| #13 | 356a8df | runtime connected field |
| #14 | d817268 | baseline 验证 |
| #15 | 当前 | - |
