---
name: jina-reader
description: URL 内容提取 + 网络搜索。读取网页转 Markdown/HTML/Text/JSON，搜索最新网络信息。触发词：read url, scrape, extract content, web search, 网页内容, 搜索
---

# Jina Reader

URL 内容提取 + 网络搜索。

## 执行

```bash
# 读取 URL（转 Markdown）
bun ~/.pi/agent/skills/jina-reader/scripts/reader.ts read "<url>"

# 搜索
bun ~/.pi/agent/skills/jina-reader/scripts/reader.ts search "<query>"

# 选项
read <url> [--format markdown|html|text|json] [--timeout N] [--no-cache] [--selector ".class"]
search <query> [--count N] [--site domain.com] [--type web|images|news]
```

## API Key

`~/.pi/agent/skills/jina-reader/.env` 中配置 `JINA_API_KEY`。

## 示例

```bash
bun scripts/reader.ts read "https://docs.jina.ai"
bun scripts/reader.ts search "AI news" --count 5 --site arxiv.org
bun scripts/reader.ts read "https://example.com" --selector ".article" --format json
```
