---
title: 添加 SSE/HTTP 传输协议支持
status: ✅ 已完成
priority: 🟠 P1
created: 2026-01-07
---

# Issue: 添加 SSE/HTTP 传输协议支持

## 元数据

| 字段 | 内容 |
|------|------|
| **文件名** | 20260107-添加 SSE/HTTP 传输协议支持.md |
| **创建时间** | 2026-01-07 |
| **状态** | ✅ 已完成 |
| **优先级** | 🟠 P1 |
| **预计工时** | 3h |

## Goal

为 mcp-to-skill 转换器添加 SSE（Server-Sent Events）和 HTTP 传输协议支持，使其能够连接到使用 SSE/HTTP 的 MCP 服务器（如 DeepWiki）。

## 背景/问题

1. 当前 mcp-to-skill 仅支持 stdio 传输协议
2. DeepWiki 使用 SSE 协议通过 HTTP 连接 MCP 服务器
3. 需要支持多种传输协议以兼容更多 MCP 服务器
4. 参考 deepwiki 技能的实现方式

## 验收标准 (Acceptance Criteria)

- [x] WHEN MCP 配置包含 `transport: "sse"`，系统 SHALL 使用 SSE 协议连接
- [x] WHEN MCP 配置包含 `transport: "http"`，系统 SHALL 使用 HTTP 协议连接
- [x] WHERE 使用 SSE/HTTP，系统 SHALL 支持 endpoint 事件获取 postUrl
- [x] IF 传输协议不支持，系统 SHALL 返回明确的错误信息

## 实施阶段

### Phase 1: 规划和准备
- [x] 分析 DeepWiki 的 SSE 实现方式
- [x] 设计多传输协议支持的架构
- [x] 确定配置格式

### Phase 2: 执行
- [x] 创建 SSE 传输处理器
- [x] 创建 HTTP 传输处理器
- [x] 更新 executor.py 支持多协议
- [x] 更新 lib.ts 支持多协议配置
- [x] 更新模板和文档

### Phase 3: 验证
- [x] 测试 SSE 协议（使用 DeepWiki）
- [x] 测试 HTTP 协议
- [x] 确保向后兼容 stdio

### Phase 4: 交付
- [x] 更新文档
- [x] 创建 PR

## 关键决策

| 决策 | 理由 |
|------|------|
| 保留 stdio 作为默认 | 向后兼容，大多数 MCP 使用 stdio |
| 使用 transport 字段区分 | 清晰明确，易于扩展 |
| 参考 deepwiki 实现 | 已验证的 SSE 实现方式 |
| 添加 httpx 依赖 | SSE/HTTP 需要 HTTP 客户端 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|

## 相关资源

- [x] 参考资料: `~/.pi/agent/skills/deepwiki/dw.js`
- [x] 参考资料: `~/.pi/agent/skills/deepwiki/SKILL.md`
- [x] MCP SSE 规范: https://modelcontextprotocol.io/docs/concepts/transports

## Notes

### SSE 协议流程

1. 连接到 SSE endpoint
2. 监听 `endpoint` 事件获取 postUrl
3. 发送 initialize 请求到 postUrl
4. 发送 tools/call 请求到 postUrl
5. 监听响应消息

### HTTP 配置格式

```json
{
  "name": "deepwiki",
  "transport": "sse",
  "endpoint": "https://mcp.deepwiki.com/sse",
  "env": {}
}
```

### 测试结果

```bash
# 测试 SSE 传输
$ bun lib.ts convert /tmp/deepwiki-test.json --output=/tmp/deepwiki-skill-test
✓ Generated skill at: /tmp/deepwiki-skill-test
✓ Tools available: 3
✓ Dependencies installed
📊 Context savings: 90.0%

# 测试 executor
$ uv run executor.py --list
Using transport: sse
[
  {
    "name": "read_wiki_structure",
    "description": "Get repository documentation structure"
  },
  {
    "name": "read_wiki_contents",
    "description": "Read specific documentation content"
  },
  {
    "name": "ask_question",
    "description": "Ask questions about the repository"
  }
]
```

---

## Status 更新日志

- **2026-01-07 16:08**: 状态变更 → ✅ 已完成，备注: SSE 传输协议测试通过
- **2026-01-07 16:00**: 状态变更 → 🚧 进行中，备注: 开始分析 deepwiki 实现