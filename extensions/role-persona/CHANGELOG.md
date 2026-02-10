# Changelog

## 2025-02-10

### Added
- **TOOLS.md 注入支持**: 在 `loadRolePrompts` 中加入 TOOLS.md 文件注入
- **文件更新指导**: 所有 bootstrap 模板文件（AGENTS.md, IDENTITY.md, USER.md, SOUL.md, TOOLS.md, HEARTBEAT.md）添加 "何时更新/如何更新" 头部提示
- **备份目录结构**: MEMORY.md 备份现在存入 `.backup/memory/` 子目录，避免根目录混乱

### Changed
- **备份路径**: `MEMORY.backup-${timestamp}.md` → `.backup/memory/MEMORY.backup-${timestamp}.md`
- **现有备份**: 已迁移 25 个历史备份文件到新目录

### Migration
```bash
# 旧备份自动迁移（已执行）
mv ~/.pi/agent/roles/zero/MEMORY.backup*.md ~/.pi/agent/roles/zero/.backup/memory/
```

## Previous

- 初始版本
