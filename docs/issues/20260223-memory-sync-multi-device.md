# Issue: 记忆同步与多设备一致性

## Goal
实现角色记忆在多设备、多会话间的同步机制，解决记忆碎片化问题，确保用户在任何设备上获得一致体验。

## Background
当前问题：
- 记忆存储在本地 `~/.pi/roles/<role>/`
- 多设备（工作电脑/家庭电脑/服务器）记忆不一致
- 同一设备多会话并发写入可能导致冲突
- 无版本控制，误删难以恢复

用户场景：
```
办公室电脑: 让 Agent 记住"使用 Vue 3 Composition API"
家里电脑: 询问"我应该用什么 Vue 写法？"
→ 家里 Agent 不知道办公室的记忆
```

## Phases

### Phase 1: 冲突检测与基础同步
- [ ] 文件级冲突检测
  - 基于文件修改时间戳
  - MD5 内容哈希比对
- [ ] 乐观锁机制
  ```typescript
  interface MemoryLock {
    role: string;
    deviceId: string;
    sessionId: string;
    acquiredAt: number;
    expiresAt: number;
  }
  ```
- [ ] 最后写入胜出 (Last-Write-Wins) 策略
  - 简单场景默认策略
  - 冲突时提示用户选择

### Phase 2: Git 后端支持（推荐方案）
- [ ] Git 集成 `memory-git.ts`
  - 自动 commit 记忆变更
  - Push/Pull 同步远程仓库
  - 冲突时自动 merge（基于行级）
- [ ] 配置扩展
  ```jsonc
  "sync": {
    "backend": "git", // "git" | "none"
    "remote": "git@github.com:user/pi-memories.git",
    "autoCommit": true,
    "commitIntervalMinutes": 30,
    "conflictStrategy": "merge" // "merge" | "manual"
  }
  ```
- [ ] 隐私保护
  - 敏感记忆加密后再 commit
  - 支持 `.gitignore` 排除特定文件

### Phase 3: 云端同步后端（可选）
- [ ] 抽象 SyncProvider 接口
  ```typescript
  interface SyncProvider {
    pull(rolePath: string): Promise<SyncResult>;
    push(rolePath: string, changes: ChangeSet): Promise<SyncResult>;
    resolveConflict(local: Snapshot, remote: Snapshot): Promise<Snapshot>;
  }
  ```
- [ ] 可能的云端后端
  - iCloud/Dropbox/OneDrive 文件夹同步
  - 自建 Sync Server（WebDAV/S3）
  - 端到端加密同步

### Phase 4: 变更历史与回滚
- [ ] 记忆变更日志
  - 谁、何时、修改了什么
  - 变更 diff 可视化
- [ ] 回滚机制
  ```
  /memory-history          # 查看最近变更
  /memory-rollback <id>    # 回滚到指定版本
  ```
- [ ] 定期备份
  - 自动 `.backup/memory/` 目录
  - 保留最近 N 个版本

### Phase 5: 会话间实时同步
- [ ] 内存缓存同步
  - 同设备多会话共享内存缓存
  - 文件变更监听 (fs.watch)
- [ ] 跨设备通知（长连接/轮询）
  - 记忆更新时通知其他设备
  - 可选自动 pull 或提示用户

## Acceptance Criteria
- [ ] Git 后端：配置后即可自动同步
- [ ] 冲突时用户可清晰看到差异并选择
- [ ] 误删记忆可从 Git 历史恢复
- [ ] 同步失败时不损坏本地数据
- [ ] 大记忆文件（>1MB）同步性能可接受
- [ ] 支持离线编辑，联网后自动同步

## Error Scenarios
| 场景 | 预期行为 |
|------|----------|
| 网络中断 | 本地继续工作，标记待同步 |
| 远程冲突 | 提示用户，显示 diff |
| Git 认证失败 | 清晰错误，引导配置 SSH key |
| 磁盘满 | 保留本地，暂停同步 |
| 多设备同时写 | 后提交者处理冲突 |

## Security Considerations
- 远程仓库应为私有
- 敏感记忆（密码、密钥）不应同步
- 考虑端到端加密（密钥本地存储）

## Estimated Effort
- Phase 1: 2-3 天
- Phase 2: 4-6 天
- Phase 3: 3-5 天（可选）
- Phase 4: 2-3 天
- Phase 5: 3-5 天
- **总计: 14-22 天（Git 方案 8-12 天）**

## Alternatives Considered
1. **纯文件同步** (Dropbox/iCloud)
   - 优点：简单，无需代码
   - 缺点：冲突处理差，无版本历史
2. **数据库后端** (PostgreSQL/SQLite)
   - 优点：结构化，查询强
   - 缺点：增加复杂度，Markdown 可读性丧失
3. **Git 方案**（推荐）
   - 优点：版本控制、diff、成熟工具链
   - 缺点：需要配置，学习曲线

## Notes
- 优先级：P2（提升体验，非阻塞）
- 先实现 Git 方案，云端作为后续扩展
- 保持 "离线优先" 设计原则
