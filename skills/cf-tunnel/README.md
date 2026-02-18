# cf-tunnel README（当前复用逻辑）

本文档说明 `cf-tunnel` 技能当前版本的“复用”行为，避免误解为“永远复用已有进程”。

## 1. 统一入口与职责

- 统一入口：`scripts/cf.ts`
- 底层执行：`scripts/share.ts`
- 面板服务：`scripts/panel.ts`

`cf.ts` 负责命令编排（start/stop/status + panel 子命令），真正启动/停止隧道与本地静态服务由 `share.ts` 完成。

## 2. 当前复用逻辑（重点）

### 2.1 Share 服务（web + tunnel）

固定 tmux session：
- `cf-share-web`
- `cf-share-tunnel`

当执行 `start` 时：
1. `share.ts` 会先检查 session 是否存在；
2. 若存在，**先 kill 再重启**（不是保留原进程）；
3. 新配置写入 `~/.cf-tunnel/share.json`；
4. 隧道日志写入 `~/.cf-tunnel/share-tunnel.log`。

结论：**share 是“同名会话复用（覆盖式）”，不是“无中断复用”。**

### 2.2 Panel 服务

固定 tmux session：
- `cf-share-panel`

当执行 `panel start` 时：
1. 若 `cf-share-panel` 已运行，则直接返回“已运行”；
2. 若未运行，则启动新 panel；
3. 若目标端口占用，自动避让到下一个可用端口；
4. 运行信息保存到 `~/.cf-tunnel/panel.json`。

结论：**panel 是“运行态复用 + 端口自动避让”。**

## 3. 状态与数据文件

目录：`~/.cf-tunnel/`

主要文件：
- `share.json`：当前 share 配置（模式、端口、目录/文件）
- `share-tunnel.log`：cloudflared 输出（用于提取 trycloudflare URL）
- `panel.json`：panel 当前 host/port/session
- `share-history.json`：面板记录的历史暴露记录
- `ports.json`：`lib/port-manager.ts` 的多端口注册状态

## 4. 常用命令

```bash
# 启动 share（目录模式）
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts start --dir ./demos/html

# 查看综合状态
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts status

# 启动 panel
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts panel start --port 8788 --host 127.0.0.1

# 停止 share / panel / 全部
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts stop --share
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts stop --panel
bun ~/.pi/agent/skills/cf-tunnel/scripts/cf.ts stop --all
```

## 5. 维护建议

如果后续要实现“真正复用已有 share（不重启）”，建议增加：
- 配置一致性判断（参数未变则直接返回）
- `--force-restart` 显式重启开关
- 热切换/无中断更新策略

---

更新时间：2026-02-18
