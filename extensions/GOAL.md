# Goal Extension

目标驱动的自主编码循环，借鉴 Codex `/goal` + GSD auto-mode。

## 使用

```bash
/goal 修复所有 TypeScript 类型错误
/goal 50000 重构用户认证模块 --budget 50000

/goal pause      # 暂停
/goal resume     # 恢复
/goal clear      # 清除
/goal status     # 查看状态
```

## 原理

1. **设定目标** → 注入 continuation prompt
2. **每轮结束** → agent_end 事件触发
3. **检查预算** → 通过 sessionManager.getBranch() 追踪 token
4. **审计完成** → LLM 调用 update_goal(status: "complete")
5. **优雅退出** → 预算耗尽时注入 budget_limit prompt

## 扩展点利用

| 扩展点 | 用途 |
|--------|------|
| `pi.registerTool("update_goal")` | LLM 标记完成/阻塞 |
| `pi.registerCommand("goal")` | /goal 命令 |
| `pi.on("agent_end")` | 注入下一轮 prompt |
| `pi.on("session_before_compact")` | 保留 goal 上下文 |
| `ctx.sessionManager.getBranch()` | token 追踪 |
| `ctx.ui.setWidget()` | 状态栏显示 |
| `pi.appendEntry()` | 状态持久化 |

## 配置

在 `~/.pi/extensions/goal.ts` 中调整常量：

```typescript
const BUDGET_WARN_RATIO = 0.8;      // 预算警告阈值
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;  // 卡住检测阈值
```
