# GitHub Actions 工作流

本项目使用 GitHub Actions 实现自动化构建和持续集成。

## 工作流说明

### 1. CI (Continuous Integration)

**触发条件：**
- 推送到 `main` 或 `develop` 分支
- 针对 `main` 或 `develop` 的 Pull Request

**功能：**
- 运行测试套件
- 检查 Rust 代码格式 (`cargo fmt --check`)
- 运行 Clippy 静态分析
- 在三个平台（Linux、macOS、Windows）上进行构建检查

**文件：** `.github/workflows/ci.yml`

### 2. Build Release (发布构建)

**触发条件：**
- 推送标签（如 `v0.1.0`）
- 手动触发（workflow_dispatch）

**功能：**
- 构建多平台发布版本：
  - macOS ARM64 (Apple Silicon)
  - macOS x86_64 (Intel)
  - Linux (DEB + AppImage)
  - Windows (MSI + NSIS)
- 上传构建产物
- 自动创建 GitHub Release

**文件：** `.github/workflows/build-release.yml`

### 3. Quick Build (快速构建)

**触发条件：**
- 手动触发（workflow_dispatch）

**功能：**
- 快速构建单个或所有平台
- 适用于测试和预览
- 构建产物保留 7 天

**文件：** `.github/workflows/quick-build.yml`

## 使用指南

### 触发发布构建（推荐）

```bash
# 创建并推送标签
git tag v0.2.0
git push origin v0.2.0
```

这将自动触发 `Build Release` 工作流，构建所有平台并创建 Release。

### 手动触发快速构建

1. 进入 GitHub 仓库的 Actions 页面
2. 选择 `Quick Build` 工作流
3. 点击 "Run workflow"
4. 选择平台（all/macos/linux/windows）
5. 点击 "Run workflow"

### 查看构建状态

```bash
# 查看最近的 Actions 运行
gh run list

# 查看特定运行的详情
gh run view <run-id>

# 下载构建产物
gh run download <run-id>
```

## 构建产物

### macOS
- **DMG**: `CodeMap_<version>_x64.dmg` / `CodeMap_<version>_aarch64.dmg`
- 位置：`client/src-tauri/target/<target>/bundle/dmg/`

### Linux
- **DEB**: `codemap_<version>_amd64.deb`
- **AppImage**: `codemap_<version>_amd64.AppImage`
- 位置：`client/src-tauri/target/release/bundle/`

### Windows
- **MSI**: `CodeMap_<version>_x64_en-US.msi`
- **NSIS**: `CodeMap_<version>_x64-setup.exe`
- 位置：`client/src-tauri/target/release/bundle/`

## 本地构建

### macOS / Linux

```bash
cd client
pnpm install
pnpm run tauri build
```

### Windows

```powershell
cd client
pnpm install
pnpm run tauri build
```

### 构建特定平台

```bash
# macOS ARM64
cd client
pnpm run tauri build --target aarch64-apple-darwin

# macOS x86_64
cd client
pnpm run tauri build --target x86_64-apple-darwin
```

## 环境变量

- `CARGO_INCREMENTAL=0`: 禁用增量编译，加快 CI 速度
- `RUST_BACKTRACE=short`: 简化错误回溯输出

## 故障排查

### 构建失败

1. 检查 Actions 日志中的错误信息
2. 确保所有依赖已正确安装
3. 检查 Rust 版本兼容性

### Linux 构建问题

确保已安装以下依赖：
```bash
sudo apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.0-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

### macOS 签名问题

如需代码签名，请在 `tauri.conf.json` 中配置：
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name"
    }
  }
}
```

## 最佳实践

1. **版本标签**：使用语义化版本（如 `v1.0.0`）
2. **测试先行**：推送前确保 CI 通过
3. **增量发布**：使用 Quick Build 测试后再发布
4. **文档更新**：发布时更新 CHANGELOG

## 相关链接

- [Tauri 构建文档](https://v2.tauri.app/start/build/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [语义化版本](https://semver.org/lang/zh-CN/)