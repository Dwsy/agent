---
name: grok-pi-herdr-orchestration
description: 使用 Herdr 和 shell 脚本创建、驱动、监控和停止 grok-pi 子代理，适合只读代码探索、仓库研究、资料整理和需要可见终端进度的长任务；当用户提到 grok-pi、Herdr、Grok 子代理、研究代理、后台代理或要求定期检查子代理进度时使用。
compatibility: 需要 macOS/Linux、Python 3、Herdr 0.7+ 和 grok-pi 0.0.13+；脚本依赖 Herdr 的运行中 server。
---

# Herdr + grok-pi 子代理编排

本技能把 `grok-pi` 放进一个由 Herdr 管理的新 tab/pane，并用 shell 脚本提交提示词、读取终端状态、等待完成和清理。它是“可见 PTY 编排”，不是把 TUI 当作普通 stdout 管道。

## 关键约束

1. **禁止失联等待。** 创建子代理或提交 prompt 后，必须立即进入 `wait`/`run` 轮询。轮询间隔默认 5 秒，最大允许 60 秒，绝不使用超过 75 秒的单次 `sleep`。
2. **优先使用 `run`。** `run` 在同一个命令内完成创建、提交、轮询和输出，避免主代理创建后忘记跟踪。
3. **默认只读。** 脚本默认只开放 `read,grep,find,ls`。只有用户明确要求修改代码时，才通过 `--tools` 显式开放写入相关工具，并仍需定期检查。
4. **每个任务独立 tab。** 不要复用用户已有的 pane；脚本会创建自己的 tab，并把 `tab_id`、`pane_id` 和运行状态保存到 `~/.local/state/grok-pi-herdr/`（可用 `GROK_PI_HERDR_STATE_DIR` 覆盖）。
5. **完成判断要有证据。** `idle` 只能表示当前 pane 没有工作指示器；最终报告还应读取最近输出，确认有回答或明确错误。`blocked`、`exited` 和超时都不能报告为成功。
6. **不要把 `grok-pi` 当作普通 headless CLI。** `grok-pi --print-capabilities` 表明它内部使用 Pi JSONL RPC，但 `grok-pi` 自己负责 TUI/PTY；在 Herdr 中通过 `pane send-text` + `pane send-keys` 驱动最稳定。不要直接把用户 prompt 管道到 `grok-pi` 的 stdin。

## 先做环境检查

```bash
herdr --version
grok-pi --version
herdr status --json
herdr api snapshot
```

必须确认 Herdr server 正在运行。需要了解协议边界时运行：

```bash
grok-pi --print-capabilities  # 注意：正确命令是 grok-pi，不是 grok
```

输出应包含 `Pi JSONL RPC over stdio`、`bridge: pi-grok-adapter -> ACP` 和 `prompt`/`get_state` 等 RPC 命令。这个结果只用于研究，不改变编排方式：当前技能通过 Herdr PTY 读取可见进度。

## 脚本位置

```text
~/.pi/agent/skills/grok-pi-herdr-orchestration/scripts/herdr-grok-pi.sh
```

为了便于复制，下面记为 `$RUNNER`：

```bash
RUNNER="$HOME/.pi/agent/skills/grok-pi-herdr-orchestration/scripts/herdr-grok-pi.sh"
```

## 推荐：一次性研究任务

把完整任务放在 `--` 后，脚本会在新 tab 启动只读 grok-pi，并持续轮询到结束：

```bash
"$RUNNER" run \
  --cwd "$PWD" \
  --label "仓库结构研究" \
  --model grok-4.3 \
  --thinking high \
  --timeout 1800 \
  --output /tmp/grok-pi-research.txt \
  -- \
  '只读研究当前仓库：梳理模块、入口、调用关系和风险。不要修改文件。完成后给出有文件路径依据的结构化报告。'
```

`run` 的输出路径是实际从 Herdr pane 读取的终端文本，不是模型 API 的假定响应。成功条件是命令退出码为 0 且输出中有最终回答；超时退出码为 124，`blocked`/`exited` 为非零。

## 分阶段控制

### 1. 创建

```bash
run_id=$("$RUNNER" start \
  --cwd "$PWD" \
  --label "探索代理" \
  --model grok-4.3 \
  --thinking high)
printf 'run_id=%s\n' "$run_id"
```

`start` 只负责启动并等待 TUI ready；它返回后不代表任务完成。返回后必须马上提交 prompt 并开始 `wait`，不可在两个命令之间长时间休眠或结束本轮工作。

### 2. 提交任务并等待

```bash
"$RUNNER" prompt "$run_id" \
  '只读阅读 README、入口文件和相关配置，输出研究结论及证据路径。不要写文件。'
"$RUNNER" wait "$run_id" --timeout 1800
```

`wait` 每次检查：

- Herdr pane 的前台进程（`grok-pi`/`pi-rpc`）是否仍存在；
- 最近 pane 输出是否显示 `Thinking`、`Waiting for response`、`Responding` 等工作指示器；
- 是否出现用户选择/批准等阻塞提示；
- 没有工作指示器时是否已经回到输入提示。

### 3. 随时查看进度

```bash
"$RUNNER" status "$run_id"
"$RUNNER" read "$run_id" 120
```

`status` 输出 JSON，其中 `state` 为 `working`、`idle`、`blocked` 或 `exited`。主代理在长任务期间应不晚于 60 秒执行一次 `status` 或 `wait` 轮询；如果需要向用户汇报，读取 `recent_output`，不要仅凭进程存在判断进展。

### 4. 停止和清理

```bash
"$RUNNER" stop "$run_id"
```

脚本先发送 `ctrl+q`，再关闭它自己创建的 tab，并将状态文件标记为 `stopped`。不要关闭或接管其他 tab。

## 编排选择

| 任务 | 方式 | 默认权限 |
|---|---|---|
| 仓库侦察、架构研究、只读审查 | `run` | `read,grep,find,ls` |
| 多轮研究，需要追加问题 | `start` + `prompt` + `wait` | `read,grep,find,ls` |
| 用户明确要求子代理修改代码 | `start --tools ...`，再分阶段 `prompt`/`wait` | 仅显式指定 |
| 需要取消的长任务 | 保存 `run_id`，`status` 后 `stop` | 不扩大权限 |

若明确要让子代理写代码，使用最小工具集，例如：

```bash
run_id=$("$RUNNER" start \
  --cwd "$PWD" \
  --label "实现代理" \
  --tools read,grep,find,ls,bash,edit,write)
"$RUNNER" prompt "$run_id" '先检查现状并提出计划；得到用户确认后再修改。'
"$RUNNER" wait "$run_id" --timeout 1800
```

不要默认开放 `bash/edit/write`，也不要把 `--always-approve` 当作研究任务的必要条件。

## 故障处理

- **`herdr status` 显示 server 未运行**：先启动 Herdr，确认 `herdr status --json` 的 `server.running` 为 `true`，再重试。
- **`grok-pi` 启动后立即退出**：运行 `grok-pi --version`、检查认证和 `herdr pane read <pane>`；不要重复创建大量 tab。
- **状态是 `blocked`**：读取 pane 输出，向用户说明需要什么批准/输入；不要无限轮询掩盖阻塞。
- **状态是 `exited`**：保留 state 文件和 pane 最后输出，报告退出原因；不能把“进程结束”当成“研究成功”。
- **只看到 TUI 没有 `agent` 记录**：这是可能的。若启动时禁用了扩展，Herdr 不会收到 Pi lifecycle hook；本技能仍可通过 pane process/output 监控。不要因此改用用户已有 agent pane。
- **输出不完整**：使用 `read RUN_ID 500` 或指定 `run --output PATH`，并在最终报告中保留输出文件路径。

## 最终报告格式

完成后向用户报告：

1. `run_id`、cwd 和使用的模型/思考级别；
2. 最后一次观测到的状态及轮询是否遵守 <=60 秒约束；
3. 研究结论和关键证据路径；
4. 输出文件路径（如有）；
5. 如果是 `blocked`、`exited`、超时或输出不完整，明确标注，不要包装成成功。
