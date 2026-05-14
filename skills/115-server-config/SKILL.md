---
name: 115-server-config
description: |
  115.191.43.169 服务器配置参考文档。仅在用户明确要求时读取，不会自动触发。
---

# 115 Server Config

> 服务器: 115.191.43.169 | 用户: root | 系统: Ubuntu

## 快速参考

| 服务 | tmux 会话 | 端口 | 启动命令 |
|------|----------|------|---------|
| pi-agent | `pi-agent` | - | `pi` |
| pi-gateway | `pi-gw` | 52134 | `cd ~/.pi/agent/pi-gateway && bun run start` |
| pi-session-cli | `pi-session` | 52131 | `/tmp/pi-session-cli` |
| herdr | - | - | `herdr` |

## 连接

```bash
ssh root@115.191.43.169
tmux attach -t <session>      # 连接会话
tmux list-sessions            # 查看所有会话
```

---

## 服务器环境

### 系统信息

```bash
uname -a                       # 内核版本
cat /etc/os-release            # 发行版
free -h                        # 内存
df -h                          # 磁盘
nproc                          # CPU 核心数
```

### 已安装运行时

| 组件 | 版本 | 路径 |
|------|------|------|
| Node.js | v24.x | `/root/.nvm/versions/node/v24.13.1/` |
| Bun | latest | `/usr/local/bin/bun` |
| herdr | 0.5.7 | `/root/.local/bin/herdr` |
| pi CLI | 0.74.0 | 全局 npm |

### 代理配置

服务器通过 `127.0.0.1:7890` 代理访问外网（GitHub 等），环境变量已配置：

```bash
echo $HTTPS_PROXY   # http://127.0.0.1:7890
echo $HTTP_PROXY    # http://127.0.0.1:7890
```

如需直连：`unset HTTP_PROXY HTTPS_PROXY`

---

## 部署流程

### 1. 同步 pi agent

```bash
rsync -avz -e 'ssh -o StrictHostKeyChecking=no' \
  --exclude='sessions' --exclude='.git' --exclude='node_modules' \
  ~/.pi/agent/ root@115.191.43.169:~/.pi/agent/
```

### 2. 修复路径引用

服务器上的 `settings.json` 可能包含本地 macOS 路径，需替换为相对路径：

```bash
ssh root@115.191.43.169 "cd ~/.pi/agent && \
  sed -i 's|/Users/dengwenyu/Dev/AI/pi-session-manager/extensions/[^\"|,]*|+extensions/ basename \0|g' settings.json"
```

### 3. 安装依赖

```bash
ssh root@115.191.43.169 "cd ~/.pi/agent && \
  npm install @earendil-works/pi-coding-agent @earendil-works/pi-ai \
  @earendil-works/pi-tui yaml glimpseui --save 2>/dev/null"
```

### 4. 启动 pi-agent

```bash
ssh root@115.191.43.169 "tmux new-session -d -s pi-agent; \
  tmux send-keys -t pi-agent 'pi' Enter"
```

### 5. 安装/更新 herdr

```bash
ssh root@115.191.43.169 "curl -fsSL https://herdr.dev/install.sh | sh"
```

### 6. 安装 pi-session-cli

```bash
# 本地下载（需要代理）
curl -x http://127.0.0.1:7890 -sL -o /tmp/pi-session-cli \
  https://github.com/Dwsy/pi-session-manager/releases/download/v0.6.0/pi-session-cli-linux-x64

# 上传到服务器
rsync -avz -e 'ssh -o StrictHostKeyChecking=no' \
  /tmp/pi-session-cli root@115.191.43.169:/tmp/pi-session-cli

# 启动
ssh root@115.191.43.169 "chmod +x /tmp/pi-session-cli && \
  tmux new-session -d -s pi-session; tmux send-keys -t pi-session '/tmp/pi-session-cli' Enter"
```

### 7. 配置 pi-gateway

```bash
# 本地修改模型配置
# ~/.pi/gateway/pi-gateway.jsonc 中 model 改为 "fufu/mimo-v2.5"

# 同步到服务器
rsync -avz -e 'ssh -o StrictHostKeyChecking=no' \
  ~/.pi/gateway/pi-gateway.jsonc root@115.191.43.169:~/.pi/agent/pi-gateway/

# 启动
ssh root@115.191.43.169 "tmux new-session -d -s pi-gw; \
  tmux send-keys -t pi-gw 'cd ~/.pi/agent/pi-gateway && bun run start' Enter"
```

---

## 系统服务

### 其他运行中的服务

| 服务 | PID | 说明 |
|------|-----|------|
| cli-proxy-api | 632 | CLI 代理 |
| beam.smp | 2347 | RabbitMQ |
| pi-server | 51563 | pi Web UI |
| node dist/index.js | 2101 | 其他 Node 服务 |

### systemd 服务

```bash
systemctl list-units --type=service --state=running
systemctl status <service>
```

---

## 常见问题

| 问题 | 排查 | 解决 |
|------|------|------|
| 端口占用 | `lsof -i :<port>` | `kill <pid>` |
| 扩展加载失败 | 检查 npm 依赖 | `cd ~/.pi/agent && npm install` |
| pi 启动后退出 | `tmux attach -t pi-agent` 查看错误 | 根据错误修复 |
| GitHub 下载失败 | 检查代理 | `export HTTPS_PROXY=http://127.0.0.1:7890` |
| tmux 会话丢失 | `tmux list-sessions` | 重新创建 |
| pi-session 端口冲突 | `lsof -i :52131` | kill 旧进程后重启 |

---

## 关键文件

| 文件 | 位置 |
|------|------|
| pi settings | `~/.pi/agent/settings.json` |
| gateway config | `~/.pi/agent/pi-gateway/pi-gateway.jsonc` |
| session-cli | `/tmp/pi-session-cli` |
| npm 全局包 | `/root/.nvm/versions/node/v24.13.1/lib/node_modules/` |
| bun 缓存 | `~/.pi/agent/pi-gateway/. bun-build` |
| tmux 配置 | `~/.tmux.conf` |

---

## 快速运维命令

```bash
# 查看所有 pi 相关进程
ps aux | grep -E 'pi|bun|node' | grep -v grep

# 查看端口占用
ss -tlnp | grep -E '5213[0-9]'

# 查看 tmux 会话内容
tmux capture-pane -t <session> -p | tail -30

# 强制杀掉所有 pi 进程
pkill -f 'pi-gateway\|pi-session-cli\|bun run start'

# 重启所有服务
tmux kill-session -t pi-gw 2>/dev/null
tmux kill-session -t pi-session 2>/dev/null
# 然后按启动流程重新启动
```
