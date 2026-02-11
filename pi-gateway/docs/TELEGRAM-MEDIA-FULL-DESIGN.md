# Telegram Media Full Support Design

**Status:** Draft
**Author:** DarkFalcon
**Date:** 2026-02-11
**Reference:** OpenClaw `src/media-understanding/`, `src/auto-reply/media-note.ts`, `src/media/parse.ts`

## 1. 架构总览

媒体处理分三层：**接收 → 理解 → 注入**。

```
用户发送媒体
→ Layer 1: 接收（Telegram Bot API 下载 → 保存到临时目录）
→ Layer 2: 理解（vision/STT/文件解析 → 生成文本描述）
→ Layer 3: 注入（文本描述 + 提示词 → 注入 agent prompt）
→ Agent 处理（看到文本描述 + 文件路径，可以读取/分析）
→ Agent 回复（可包含 MEDIA: 指令发送媒体）
```

## 2. Layer 1: 接收（Inbound Media Download）

### 统一下载流程

按优先级取 file_id：photo（最大尺寸）> video > video_note > document > audio > voice。
检测 MIME + 保存到临时目录，返回 `{ path, mime, placeholder }`.

### 贴纸特殊处理

仅支持静态 WEBP 贴纸，跳过动画/视频贴纸。

### 媒体组聚合

`media_group_id` 相同的消息聚合为一组，1500ms 超时后批量处理。

## 3. Layer 2: 理解（Media Understanding）

| 媒体类型 | 理解方式 | Provider | 输出 |
|----------|---------|----------|------|
| 图片 | Vision 描述 | pi agent 内置 vision | 文本描述 |
| 语音/音频 | STT 转录 | Groq Whisper（首选） | 转录文本 |
| 视频 | 抽帧 + Vision | pi agent | 文本描述 |
| 文档（文本类） | 直接读取内容 | 本地解析 | 文件内容 |
| 文档（PDF） | 文本提取 | 本地解析 | 提取文本 |
| 文档（其他） | 仅传路径 | — | 文件路径 |
| 贴纸 | Vision 描述 | pi agent 内置 vision | emoji + 描述 |

文本类 MIME：`text/plain, text/markdown, text/csv, text/yaml, text/xml, application/json, application/xml, application/javascript` 等。

### 音频转录

Groq Whisper API（`whisper-large-v3-turbo`），可选 OpenAI 备选。支持 language hint 提升中文识别率。

## 4. Layer 3: 提示词注入（Prompt Injection）

### Prompt 组装顺序

```
[media attached: /tmp/inbound/photo_123.jpg (image/jpeg)]
When you receive media files, you can:
1. Read/analyze the file at the provided path
2. Reply with text describing what you see/hear
3. To send a file back, use MEDIA:<path> on a separate line
[Image] A screenshot showing a React component with a type error on line 42...
用户原始文本（caption 或 text）
```

即：media note → reply hint → understanding output → user text

## 5. Outbound Media（Agent 发送媒体）

### MEDIA: 指令

Agent 回复中 `MEDIA:<path>` 行被解析，按 MIME 类型通过 Telegram API 发送（photo/video/audio/document）。

### 安全约束

- ❌ 禁止绝对路径（`MEDIA:/etc/passwd`）
- ❌ 禁止 `~` 路径（`MEDIA:~/secret.txt`）
- ✅ 允许相对路径（`MEDIA:./output.png`）
- ✅ 允许 URL（`MEDIA:https://example.com/image.jpg`）

## 6. 配置

```jsonc
{
  "media": {
    "enabled": true,
    "maxBytes": 20971520,
    "tempDir": "data/media/inbound",
    "image": { "enabled": true },
    "audio": {
      "enabled": true,
      "provider": "groq",
      "model": "whisper-large-v3-turbo",
      "language": "zh",
      "timeoutSeconds": 30
    },
    "document": {
      "enabled": true,
      "textMimes": ["text/*", "application/json", "application/xml"],
      "maxChars": 50000
    },
    "sticker": { "enabled": true, "cacheDescriptions": true },
    "outbound": {
      "allowRelativePaths": true,
      "allowUrls": true,
      "blockAbsolutePaths": true,
      "blockHomePaths": true
    }
  }
}
```

## 7. 实现优先级

| 优先级 | 功能 | 预估 |
|--------|------|------|
| P0 | 图片接收 + vision + 提示词注入 + 转发上下文 | 2d |
| P1 | 语音 STT + 文档接收 + 媒体组聚合 + Outbound MEDIA: | 3.5d |
| P2 | 贴纸支持 + TTS 语音回复 | 2d |
| P3 | 视频处理（抽帧 + vision） | 2d |

## 8. OpenClaw 对标

| 能力 | OpenClaw | pi-gateway | 差异 |
|------|----------|-----------|------|
| 图片 + vision | ✅ | ✅ | pi agent 内置 vision |
| 语音 STT | ✅ | ✅ | Groq 首选 |
| 文档读取 | ✅ | ✅ | 对齐 |
| 贴纸 | ✅ | ✅ | 对齐 |
| 视频 | ✅ | P3 | 延后 |
| MEDIA: 回复 | ✅ | ✅ | 对齐 |
| 提示词注入 | ✅ | ✅ | 对齐 |
| 安全约束 | ✅ | ✅ | 对齐 |
| TTS | ✅ | P2 | 延后 |

---

*Based on OpenClaw source analysis. DarkFalcon, 2026-02-11*
