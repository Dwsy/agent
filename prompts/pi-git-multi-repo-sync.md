---
description: Git multi-repo sync - 自动处理多个独立git仓库的提交、拉取、合并流程
triggers:
  - "同步所有仓库"
  - "git sync"
  - "提交所有仓库"
  - "检查仓库状态"
  - "pull all repos"
---

# 🔄 Git 多仓库同步助手

自动处理以下3个独立 git 仓库的同步：

| 仓库 | 路径 | 说明 |
|-----|------|-----|
| agent | `/Users/dengwenyu/.pi/agent` | 主仓库 |
| agent/roles | `/Users/dengwenyu/.pi/agent/roles` | 角色配置仓库 |
| gateway | `/Users/dengwenyu/.pi/gateway` | 网关仓库 |

## 执行流程

### 1. 状态检查
对每个仓库执行：
```bash
git status --short
git branch -v
git rev-list --left-right --count HEAD...origin/$(git branch --show-current)
```

### 2. 处理本地变更
- **有未提交变更**：
  1. `git add -A`
  2. `git commit -m "描述信息"`
  3. `git push`

- **只有未跟踪文件**：询问用户是否提交

### 3. 拉取远端更新
```bash
git fetch origin
git pull --no-rebase  # 优先使用合并策略
```

**特殊情况处理**：
- `unrelated histories` → 添加 `--allow-unrelated-histories`
- 强制更新警告 → 检查是否需要重新克隆

### 4. 冲突解决（使用LLM智能分析）

**遇到冲突时，必须执行以下步骤：**

1. **提取双方内容**
   ```bash
   git show HEAD:file > /tmp/local_file
   git show origin/main:file > /tmp/remote_file
   ```

2. **读取并分析差异**
   - 使用 `read` 读取两个版本
   - 识别冲突区域的语义差异
   - 判断哪些是本地新增，哪些是远端新增
   - 检查是否有重复或冲突的条目

3. **智能合并策略**
   - **配置/偏好文件**（.md）：整合双方独特内容，去重
   - **代码文件**：分析逻辑，保留功能完整的版本
   - **JSON/YAML**：合并字段，确保结构有效
   - **二进制文件**（.png）：`git checkout --theirs` 接受远端

4. **基于修改时间的判断**
   - `git log --oneline -1 HEAD` 查看本地最后提交时间
   - `git log --oneline -1 origin/main` 查看远端最后提交时间
   - 较新的经验/配置项优先保留

5. **执行合并**
   ```bash
   # 编辑文件解决冲突
   edit <file>  # 精确替换冲突区域
   
   # 标记解决
   git add <file>
   git commit -m "Merge: 智能解决冲突 - 保留双方关键内容"
   ```

### 5. 完成合并
```bash
git add -A
git commit -m "Merge branch 'main' - 描述"
git push
```

## 安全原则

- ⚠️ 强制推送 (`--force`) 需要用户明确确认
- ⚠️ 重要文件删除前提示备份
- ⚠️ 冲突解决后确认文件可正常读取
- ⚠️ 推送前检查是否包含敏感信息

## 输出格式

```
📦 仓库: {name}
📍 路径: {path}
🌿 分支: {branch}
📊 状态: +新增 ~修改 -删除 | ahead N behind M

📝 执行:
  [1/4] 检查状态...
  [2/4] 提交本地变更... (N 文件)
  [3/4] 拉取远端更新...
  [4/4] 推送... ⚠️ 冲突已解决

✅ 结果: 成功 / 冲突已解决 / 失败需手动处理
```
