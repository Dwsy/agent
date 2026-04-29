# pi-gateway: 多通道 AI Agent 网关 — 申请描述

---

## 项目解决的核心痛点

**单一交互入口瓶颈。** Pi Agent 原生仅支持 CLI 交互，无法在移动端、群聊、Web 等场景中使用。当团队需要 AI 助手 7×24 在线响应时，缺乏一个将 Agent 能力实时分发到多通道的基础设施。

**Agent 孤岛问题。** 单个 Agent 受限于自身知识与工具边界，遇到跨领域任务（如编码 Agent 需要部署信息、文档 Agent 需要生成代码示例）时无法协作，导致问题解决链路断裂。

---

## 核心逻辑流

### 1. 多通道统一接入 + 长链推理

```
Telegram / Discord / 飞书 / WebChat
        ↓
  Message Pipeline（分发、排队、背压控制）
        ↓
  Session Router（agent:channel:scope:id 会话路由）
        ↓
  RPC Pool（pi --mode rpc 进程池，min/max/idle 可配）
        ↓
  Pi Agent 推理（System Prompt 注入 → 工具调用 → 流式输出）
        ↓
  Channel Outbound（Telegram Markdown / Discord Embed / 飞书卡片 / WebChat WS）
```

整个链路从用户消息到达 → Agent 理解意图 → 调用工具（`send_message`、`delegate_to_agent`、`keyboard_select`）→ 格式化输出至目标通道，一气呵成。Agent 可自主决策使用流式输出（>200 字符自动流式）、内联键盘交互、或异步定时任务触发。

### 2. 多 Agent 协作（delegate_to_agent）

当 Agent 识别到自身能力不足时，通过 `delegate_to_agent` 工具将子任务委托给其他专用 Agent：

```
用户提问 → Code Agent 接收
  → 需要部署状态 → delegate_to_agent(agentId: "ops", task: "检查当前服务健康状态")
    → Ops Agent 独立 RPC 进程 → 查询监控 → 返回结果
  → Code Agent 整合结果 → 回复用户
```

支持安全约束（allowlist、maxConcurrent、maxDepth 防递归爆炸）、超时控制、Session 隔离。RPC Pool 保证每个委托任务拥有独立的 Agent 进程上下文，互不污染。

---

## 工程成果

| 维度 | 数据 |
|------|------|
| **代码规模** | 21,000+ 行 TypeScript（严格模式） |
| **架构模式** | Clean Architecture v4.0（Interface → Application → Domain → Infrastructure 四层分离） |
| **测试覆盖** | 422+ 测试用例，43+ 测试文件 |
| **插件体系** | 14 个生命周期 Hook + 8 个注册方法，通道级能力矩阵 |
| **通道支持** | Telegram / Discord / 飞书 / WebChat，统一 ChannelPlugin 接口 |
| **安全防线** | Token 认证 + Allowlist + SSRF 防护 + ExecGuard 命令注入防护 |
| **生产特性** | 插件热加载、Session 持久化/恢复、RPC 日志旋转、定时任务 Cron Engine |

---

## 一句话总结

**基于 Pi Agent 框架，从零构建了一个 Clean Architecture 级别的多通道 AI Agent 网关，打通了 Telegram/Discord/飞书/WebChat 四大通道，实现了多 Agent 跨域协作的长链推理闭环，代码规模 21K+ 行、420+ 测试护航。**
