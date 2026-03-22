# Autoresearch: discord 对齐 openclaw-discord@2026.3.13

## 参考版本
**@openclaw/discord@2026.3.13** — npm 最新版，2026-03 对齐

## 状态：进行中 🔄

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
