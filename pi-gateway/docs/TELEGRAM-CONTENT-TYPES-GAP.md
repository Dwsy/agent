# Telegram Message Content Types — Gap Analysis & Implementation Guide

> Status: Draft | Author: DarkFalcon (OpenClaw Architect) | Date: 2026-02-11
> 
> OpenClaw vs pi-gateway Telegram 内容类型支持对比 + 实现优先级

---

## 1. 接收（Inbound）— 用户发给 Bot 的内容

### OpenClaw 支持的内容类型

| 类型 | 接收 | 处理方式 | 传给 Agent |
|------|------|----------|-----------|
| 文本 | ✅ | 直接传递，支持 text_link 展开、caption 提取 | 原文 |
| 图片 (photo) | ✅ | 下载最大尺寸 → 保存到 media/inbound/ → 传路径 | `<media:photo>` placeholder + 文件路径 |
| 视频 (video) | ✅ | 下载 → 保存 → media-understanding 描述 | `<media:video>` + 描述文本 |
| 视频笔记 (video_note) | ✅ | 同 video | `<media:video_note>` |
| 语音 (voice) | ✅ | 下载 → audio transcription（Whisper/Groq/Deepgram） | 转录文本 |
| 音频文件 (audio) | ✅ | 同 voice | 转录文本 |
| 文档 (document) | ✅ | 下载 → 按 MIME 处理 | `<media:document>` + 文件路径 |
| 贴纸 (sticker) | ✅ | 仅静态 WEBP，跳过 animated/video | `<media:sticker>` + emoji + set_name |
| 位置 (location) | ✅ | 提取经纬度 → 格式化文本 | 文本描述 |
| 转发消息 (forward) | ✅ | 提取来源信息 | `[Forwarded from {from}]` 前缀 |
| 回复消息 (reply) | ✅ | 提取 reply_to_message 上下文 | 回复引用后缀 |
| 媒体组 (media_group) | ✅ | buffer 聚合同组媒体，超时后批量处理 | 多个 media 附件 |
| GIF (animation) | ✅ | 作为 document 处理 | 文件路径 |
| 联系人/投票/场所 | ❌ | 不处理 | — |

### Media Understanding Pipeline

OpenClaw 有完整的 media-understanding 管线（`src/media-understanding/`）：
- image → vision model 描述（OpenAI/Anthropic/Google vision）
- audio → transcription（Whisper/Groq/Deepgram）
- video → 抽帧 + vision 描述
- 可配置 provider、model、maxBytes、scope（DM/group 差异化）

### 文本预处理

- text_link 展开：`[text](url)` 格式
- caption 提取：media 消息的 caption 作为文本内容
- 文本分片聚合：长文本被 Telegram 拆分时聚合（4000 字符阈值，1500ms 间隔）
- inbound debounce：短时间内多条纯文本消息合并

## 2. 发送（Outbound）— Bot 回复用户的内容

| 类型 | OpenClaw | 实现 |
|------|----------|------|
| 文本 | ✅ | sendMessage + Markdown 格式化 + 分块（4096 字符限制） |
| 图片 | ✅ | sendPhoto |
| 视频 | ✅ | sendVideo |
| 语音 | ✅ | sendVoice（圆形播放气泡） |
| 文档 | ✅ | sendDocument |
| 贴纸 | ✅ | sendSticker |
| Inline 按钮 | ✅ | buildInlineKeyboard |
| Streaming 编辑 | ✅ | editMessageText + 1000ms coalescer |

### TTS（文本转语音）

- 支持 Edge TTS（免费）和 OpenAI TTS
- 可配置 voice、mode（auto/always/off）、maxLength、summarize
- 自动摘要长文本后再转语音

## 3. 实现优先级

### P0 — 核心体验

1. 图片接收 + Vision（验证项：链路已通，需端到端测试确认）
2. 语音接收 + 转录（复杂度：中，需 STT provider）
3. 文档接收（复杂度：低）
4. 转发消息上下文（复杂度：极低，纯文本前缀）

### P1 — 增强体验

5. 媒体组聚合（验证项：handlers.ts 已有实现，需确认完整性）
6. 图片/文档发送（复杂度：中）
7. 文本分片聚合（大部分场景被 queue collect mode 覆盖，仅超长文本需要 Telegram 层预处理）

### P2 — 高级功能

8. TTS 语音回复（复杂度：中高）
9. 贴纸支持（复杂度：中）
10. 位置处理（复杂度：极低）

### P3 — 可选

11. 视频处理（资源消耗大）
12. Inline 按钮

## 4. 关键实现模式

### 媒体下载统一流程
```
Telegram msg → getFile(file_id) → fetch file → detectMime → save → 返回 { path, contentType }
```

### Placeholder 模式
`<media:photo>`、`<media:video>` 等标记，agent 看到 placeholder + 文件路径即可处理。

### Media Group Buffer
```typescript
const mediaGroupBuffer = new Map<string, { items: MediaRef[], timer: Timer }>();
// media_group_id → buffer → timer 到期 → 批量处理
```

### 配置建议
```jsonc
{
  "telegram": {
    "media": {
      "maxBytes": 20971520,
      "vision": true,
      "transcription": true,
      "tts": { "enabled": false, "provider": "edge", "voice": "zh-CN-XiaoxiaoNeural" }
    }
  }
}
```

---

*Based on OpenClaw source analysis (src/telegram/, src/media-understanding/, src/tts/). DarkFalcon, 2026-02-11*
