# Autoresearch: discord 对齐 openclaw-discord@2026.3.13

## 参考版本
**@openclaw/discord@2026.3.13** — npm 最新版，2026-03 对齐

## 状态：完成 ✅

## 核心指标
```
type_errors        = 0       ← TypeScript 干净
discord_modules    = 7        ← index/handlers/commands/format/types/runtime/subagent-hooks
discord_capabilities = 20      ← nativeCommands/polls/streaming/react 等
discord_tests      = 24       ← 7 个测试文件全部通过
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

## Experiments (14 total)
Baseline + #2-#14: 全部 keep

## 核心指标
```
type_errors        = 0       ← TypeScript 干净
discord_modules    = 7        ← commands/format/handlers/index/types/runtime/subagent-hooks
discord_capabilities = 20      ← nativeCommands/polls/streaming/react 等
discord_tests      = 12        ← 3 个测试文件全部通过
```

## 已对齐模块

| 模块文件 | 功能 |
|---------|------|
| `index.ts` | ChannelPlugin 注册，capabilities/nativeCommands/polls/mentions |
| `handlers.ts` | handleMessage/handleInteraction/sendOutbound/streaming/poll |
| `commands.ts` | registerGuildCommands/STATIC_COMMANDS/helpText |
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

## Experiments (8 total)
Baseline + #2-#8: 全部 keep

## Constraints
- 不修改核心消息管道
- 不新增运行时依赖
- 测试和类型检查必须通过
