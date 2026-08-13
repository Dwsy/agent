---
id: "2026-07-31-研究并创建 herdr+grok-pi 子代理编排技能"
title: "研究并创建 herdr+grok-pi 子代理编排技能"
status: "done"
created: "2026-07-31"
updated: "2026-07-31"
category: "agent"
tags: ["workhub", "herdr", "grok-pi", "subagent", "research"]
---

# Issue: 研究并创建 herdr+grok-pi 子代理编排技能

## Goal

研究本机 Herdr 与 grok-pi 的真实控制边界，并交付一个可重复使用、默认只读、严格轮询进度的 Pi skill。

## 背景/问题

`grok-pi` 是由 Grok 原生终端 UI 承载 Pi RPC 的 TUI 组合，而不是可直接把 prompt 管道到 stdin 的普通 headless CLI。需要通过 Herdr 管理独立 pane，以便创建、提交 prompt、读取可见进度和清理，同时满足子代理启动后不超过 75 秒必须检查进度的约束。

## 验收标准 (Acceptance Criteria)

- [x] WHEN skill 启动研究任务，系统 SHALL 在独立 Herdr tab/pane 中运行 grok-pi。
- [x] WHEN 子代理运行，系统 SHALL 默认以不超过 60 秒的轮询间隔检查前台进程和 pane 输出。
- [x] IF 用户未明确要求修改文件，THEN 系统 SHALL 默认只开放 `read,grep,find,ls`。
- [x] WHERE 任务结束、阻塞、退出或超时，系统 SHALL 输出可验证状态并保留最近 pane 输出。
- [x] WHERE 任务需要清理，系统 SHALL 只关闭该 skill 创建的 tab。

## 实施阶段

### Phase 1: 规划和准备

- [x] 分析 Herdr CLI、运行 server、pane/tab/agent API。
- [x] 分析 grok-pi CLI、`--print-capabilities` 和 Pi RPC 边界。
- [x] 确定 PTY 驱动而不是直接 stdin 管道的方案。

### Phase 2: 执行

- [x] 创建 `skills/grok-pi-herdr-orchestration/SKILL.md`。
- [x] 创建 `scripts/herdr-grok-pi.sh`，支持 start/prompt/run/status/wait/read/stop。
- [x] 将默认权限和 <=60 秒轮询约束固化到文档和脚本。

### Phase 3: 验证

- [x] Bash 语法检查。
- [x] ShellCheck 检查。
- [x] 实际启动 grok-pi、提交只读 prompt、轮询到 idle、保存输出并清理 tab。
- [x] 验证轮询间隔大于 60 秒会被拒绝。

### Phase 4: 交付

- [x] 更新本 Issue 的研究结论和验证证据。
- [ ] 创建 PR（当前工作区没有要求提交或创建 PR）。
- [ ] 合并主分支（不在本任务范围内）。

## 关键决策

| 决策 | 理由 |
|------|------|
| 通过 `herdr tab create` + `herdr pane run` 创建独立运行单元 | 不接管用户已有 pane，tab/pane ID 可持久化并可安全清理 |
| 通过 `herdr pane send-text` + `send-keys enter` 提交 prompt | grok-pi 是 TUI；其 `--print-capabilities` 明确说明内部 RPC 被 adapter 管理，不能假设裸 stdin prompt 管道 |
| 通过 `pane process-info` + `pane read` 判断进度 | 禁用扩展时不一定有 Herdr agent lifecycle 记录，但前台进程和可见输出仍然可观测 |
| 默认 `read,grep,find,ls` | 研究/探索任务默认只读，避免子代理意外修改工作树 |
| 默认 5 秒、上限 60 秒轮询 | 满足用户“最大 75 秒检查一次”的硬约束，并给启动/状态判断留出裕量 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-07-31 | 启动后的第一次 process probe 可能发生在 grok-pi 进程尚未出现在 Herdr 快照中 | 将启动阶段和运行阶段分开：启动阶段最多等待 60 秒检测 `grok-pi`/`pi-rpc`，运行阶段再做状态分类 |
| 2026-07-31 | 禁用 Pi 扩展时，Herdr `agent prompt` 不适用于该 pane | 采用 pane 级别的文本提交和输出监控；这也更符合 grok-pi TUI 的实际边界 |

## 相关资源

- [x] `skills/grok-pi-herdr-orchestration/SKILL.md`
- [x] `skills/grok-pi-herdr-orchestration/scripts/herdr-grok-pi.sh`
- [x] `extensions/herdr-agent-state.ts`
- [x] `~/.nvm/versions/node/<version>/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`
- [x] `grok-pi --print-capabilities`
- [x] `herdr agent/pane/tab/api --help`

## Notes

实际验证运行：

- run id：`20260731T131007Z-22240`
- cwd：`~/.pi/agent`
- 命令：grok-pi 0.0.13，thinking `low`，只读工具 `read,grep,find,ls`
- 观察：`t=0s state=working`，`t=5s state=idle`
- 输出：`/tmp/grok-pi-herdr-script-test-2.txt`
- 结果：子代理输出 `READY。我没有修改文件。`，退出码 0；随后仅关闭该运行创建的 tab。

状态文件位于 `~/.local/state/grok-pi-herdr/`，用于从后续命令读取 run id、tab id、pane id 和启动参数。

---

## Status 更新日志

- **2026-07-31 21:00**: 状态变更 → `in_progress`，备注: 完成环境、CLI、RPC 和 Herdr API 研究。
- **2026-07-31 21:11**: 状态变更 → `done`，备注: skill、shell runner 已创建并通过真实 grok-pi 运行验证。
