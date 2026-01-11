# CodeMap - 一键启动说明

## 🚀 快速启动

### 前置条件
- Node.js 18+
- Rust 1.70+
- pnpm 10+

### 安装依赖
```bash
cd ~/.pi/agent/skills/codemap/client
pnpm install
```

## 🎮 一键启动

### 启动
```bash
cd ~/.pi/agent/skills/codemap
./run.sh start
```

启动后会显示：
```
╔══════════════════════════════════════════════════════════════╗
║              CodeMap 开发环境已启动                       ║
╠════════════════════════════════════════════════════════════╣
║  前端: http://localhost:1420/                       ║
║  后端: Tauri 桌面已打开                       ║
╠════════════════════════════════════════════════════════════╣
║  PID - 前端: 12345                                   ║
║  PID - 12346                                         ║
╠══════════════════════════════════════════════════════════════╣
║  日志位置: /Users/dengwenyu/.codemap/logs/                    ║
╚════════════════════════════════════════════════════════════╝

提示: 按 Ctrl+C 停止所有进程
前端日志: tail -f /Users/dengwenyu/.codemap/logs/frontend.log
后端日志: tail -f /---------/.codemap/logs/backend.log
```

### 停止
```bash
./run.sh stop
```

### 重启
```bash
./run.sh restart
```

### 查看状态
```bash
./run.sh status
```

### 查看日志
```bash
./run.sh logs
```

### 查看帮助
```bash
./run.sh help
```

## 📂 文件结构

```
~/.pi/agent/skills/codemap/
├── run.sh                    # 主控制脚本
├── start.sh                  # 启动脚本
├── stop.sh                   # 停止脚本
├── README.md                  # 本文档
├── client/                   # Tauri 客户端
│   ├── src/                  # React 前端
│   ├── src-tauri/            # Rust 后端
│   ├── package.json
│   └── vite.config.ts
└── logs/                    # 日志目录（自动创建）
    ├── frontend.log
    └── backend.log
```

## 🔧 工作流

### 开发流程
```bash
# 1. 启动开发环境
cd ~/.pi/agent/skills/codemap
./run.sh start

# 2. 修改代码
# 前端：修改 src/ 下的文件，自动热重载
# 后端：修改 src-tauri/src/ 下的文件，自动重新编译

# 3. 查看日志
./run.sh logs

# 4. 完成工作
# 停止环境
./run.sh stop
```

### 调试流程
```bash
# 查看进程状态
./run.sh status

# 查看前端日志
tail -f ~/.codemap/logs/frontend.log

# 查看后端日志
tail -f ~/.codemap/logs/backend.log

# 强制停止
./run.sh stop
```

## 🛠️ 故障排查

### 无法启动
```bash
# 检查端口占用
lsof -ti:1420
lsof -ti:8080

# 强制清理
./run.sh stop
rm -rf ~/.codemap/logs/* ~/.codemap/.pids

# 重新安装依赖
cd client
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 编译错误
```bash
cd client/src-tauri
cargo clean
cargo check
```

### 前端空白
```bash
# 检查日志
tail -20 ~/.codemap/logs/frontend.log

# 清理缓存
rm -rf client/node_modules/.vite
pnpm install
```

## 📝 相关文档

- [README.md](README.md) - 完整项目文档
- [QUICKSTART.md](QUICKSTART.md) - 快速开始指南
- [STRUCTURE.md](STRUCTURE.md) - 项目结构
- [SKILL.md](SKILL.md) - 技能定义

## 🎯 下一步

1. 启动 CodeMap: `./run.sh start`
2. 打开浏览器访问 http://localhost:1420/
3. 点击 "New CodeMap" 创建代码地图
4. 查看 Tree/Graph 视图
5. 保存到历史记录
6. 导出分享

## 🚀 生产构建

```bash
cd ~/.pi/agent/skills/codemap/client
pnpm run tauri build

# 构建产物位置
# macOS: client/src-tauri/target/release/bundle/macos/CodeMap.app
# Windows: client/src-tauri/target/release/bundle/msi/CodeMap_0.1.0_x64_en-US.msi
# Linux: client/src-tauri/target/release/bundle/appimage/
```
## 📚 相关文档
- [中文文档](./README.zh.md) - 中文版文档
- [README.md](./README.md) - 完整项目文档（英文）
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始指南
- [STRUCTURE.md](./STRUCTURE.md) - 项目结构
- [SKILL.md](./SKILL.md) - 技能定义
- [DELIVERY.md](./DELIVERY.md) - 交付文档
