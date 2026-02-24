# Role Persona 快速入门

5 分钟上手角色人格系统。

---

## 1. 创建你的第一个角色

```
/role create my-assistant
```

跟随交互提示完成创建。这会生成：

```
~/.pi/agent/roles/my-assistant/
├── core/
│   ├── agents.md         # 工作空间规则
│   ├── identity.md       # AI 身份
│   ├── soul.md           # 核心价值观
│   ├── user.md           # 你的画像
│   ├── tools.md          # 工具偏好
│   ├── heartbeat.md      # 主动任务
│   └── constraints.md    # 硬约束
├── memory/
│   ├── consolidated.md   # 长期记忆
│   └── daily/            # 每日记录
├── context/              # 会话上下文
└── skills/               # 激活技能
```

---

## 2. 映射工作目录

```
cd ~/my-project
/role map my-assistant
```

现在每次在该目录启动 pi，自动加载此角色。

---

## 3. 自定义人格

编辑核心文件：

```bash
# 修改身份
pi -f ~/.pi/agent/roles/my-assistant/core/identity.md

# 修改人格
pi -f ~/.pi/agent/roles/my-assistant/core/soul.md

# 记录你的偏好
pi -f ~/.pi/agent/roles/my-assistant/core/user.md
```

---

## 4. 记忆自动工作

无需手动操作，系统会自动：

| 时机 | 行为 |
|------|------|
| 每 5 轮对话 | 提取学习到 consolidated.md |
| 上下文压缩 | 抢救记忆（零额外调用） |
| 检测到关键词 | 立即提取（结束/总结/exit） |
| 30 分钟间隔 | 批量提取 |

查看记忆：

```
/memories           # 查看所有记忆
/memory-tags        # 查看标签云
/memory-log         # 查看会话操作日志
```

---

## 5. 手动管理记忆

AI 可以调用 memory tool：

```typescript
// 添加学习
memory({ action: "add_learning", content: "用户偏好使用 TypeScript" })

// 添加偏好
memory({ action: "add_preference", content: "简洁回答", category: "Communication" })

// 强化已有记忆
memory({ action: "reinforce", query: "TypeScript" })

// 搜索
memory({ action: "search", query: "部署" })
```

---

## 6. 高级：向量记忆（可选）

启用语义搜索：

```bash
# 1. 安装依赖
cd ~/.pi/agent/extensions/role-persona
npm install @lancedb/lancedb

# 2. 修改配置
pi -f ~/.pi/agent/extensions/role-persona/pi-role-persona.jsonc
# 设置 vectorMemory.enabled = true

# 3. 重启 pi
```

构建向量索引：

```
/memory-vector rebuild
```

---

## 7. 常用配置

编辑 `~/.pi/agent/extensions/role-persona/pi-role-persona.jsonc`：

```jsonc
{
  "autoMemory": {
    "enabled": true,
    "model": "openai-codex/gpt-5.1-codex-mini",
    "batchTurns": 5,        // 每 5 轮提取
    "intervalMs": 1800000   // 或每 30 分钟
  },
  "memory": {
    "onDemandSearch": {
      "enabled": true,      // 第一条消息时搜索相关记忆
      "maxResults": 5
    }
  }
}
```

环境变量覆盖：

```bash
export ROLE_AUTO_MEMORY=true
export ROLE_AUTO_MEMORY_MODEL="anthropic/claude-sonnet-4"
```

---

## 8. 多角色管理

```
/role list          # 查看所有角色
/role info          # 当前角色状态
/role unmap         # 取消当前目录映射
```

切换角色：

```bash
cd ~/project-a    # 自动加载角色 A
cd ~/project-b    # 自动加载角色 B
```

---

## 9. 故障排查

| 问题 | 解决 |
|------|------|
| 记忆未写入 | 检查 `autoMemory.enabled`，查看 `/memory-log` |
| 角色未加载 | 检查 `roles/config.json` 映射，运行 `/role info` |
| 向量搜索失败 | 确认 `@lancedb/lancedb` 已安装，查看日志 |
| 文件损坏 | 运行 `/memory-fix` 修复结构 |

---

## 10. 下一步

- 阅读 [README.md](./README.md) 了解完整功能
- 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 深入架构
- 对比 [ai-runtime-comparison.md](./docs/ai-runtime-comparison.md) 了解设计渊源

---

> "记憶が人を形作る" — 记忆塑造人格
