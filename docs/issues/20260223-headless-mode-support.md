# Issue: Headless 模式支持 - RPC/Gateway 环境适配

## Goal
让 role-persona 的 TUI 命令在 RPC/Gateway 模式下可用，实现无缝的多渠道支持（Telegram/Discord/WebChat）。

## Background
当前问题：
- `/role info`, `/role create`, `/role list` 等命令依赖 `ctx.ui` (TUI)
- Gateway 模式下 `ctx.hasUI === false`，这些命令直接返回错误
- Telegram 用户无法查看角色信息、创建新角色、管理角色映射

两套系统割裂：
- Gateway `/role` 只切换 CapabilityProfile，不加载人格文件
- Extension `role-persona` 只在 pi CLI TUI 模式下工作

## Phases

### Phase 1: Headless 检测与降级框架
- [ ] 新增 `isHeadlessMode()` 检测函数
  - 检测 `ctx.hasUI === false`
  - 检测 `process.env.PI_HEADLESS === 'true'`
  - 检测 RPC 模式（通过 `pi.env` 或特定标志）
- [ ] 新增 `headless-responder.ts` 模块
  - 统一文本响应格式（Markdown）
  - 支持分页/截断（避免消息过长）
  - 支持交互式提示（Y/n 转换为文本指令）

### Phase 2: 命令逐一 Headless 适配

#### /role info
- [ ] TUI 模式：保持 SelectList 选择角色
- [ ] Headless 模式：
  - 无参数：列出所有角色 + 当前角色高亮
  - 有参数：直接显示指定角色详情

#### /role create
- [ ] TUI 模式：SelectList 选择模板 + input 输入名称
- [ ] Headless 模式：
  ```
  /role create <name> [template]
  模板可选：architect, backend, frontend, reviewer, mentor, assistant
  ```

#### /role map/unmap/list
- [ ] TUI 模式：保持交互式映射
- [ ] Headless 模式：
  ```
  /role map <role> <path>     # 映射路径到角色
  /role unmap <path>          # 取消映射
  /role list                  # 显示所有映射
  ```

#### /memories
- [ ] TUI 模式：Overlay 查看器
- [ ] Headless 模式：
  ```
  /memories [filter] [limit]
  filter: all | learnings | preferences | events
  ```

### Phase 3: Gateway 集成方案
- [ ] 与 Gateway `/role` 命令整合
  - Gateway 切换角色时同步触发 extension 的角色加载
  - 统一角色源：`~/.pi/roles/` 而非 `pi-gateway.jsonc` 的 workspaceDirs
- [ ] 配置文档更新
  - 如何在 `pi-gateway.jsonc` 中启用 role-persona
  - 推荐的角色映射配置

### Phase 4: 交互式提示处理
- [ ] Y/n 确认转换为指令
  ```
  需要确认的操作：
  "这会覆盖现有角色，继续？"
  → 回复 "/confirm yes" 或 "/confirm no"
  ```
- [ ] 多步骤向导模式
  ```
  /role create wizard
  Step 1/3: 输入角色名称
  → 用户回复名称
  Step 2/3: 选择模板 (回复数字 1-6)
  ...
  ```

## Acceptance Criteria
- [ ] 所有 `/role` 子命令在 Telegram 可用
- [ ] 所有 `/memories` 子命令在 Telegram 可用
- [ ] 角色创建后自动可用，无需重启 Gateway
- [ ] 错误消息清晰，告知用户可用命令格式
- [ ] TUI 模式行为保持不变（向后兼容）

## Errors Encountered
| 日期 | 错误 | 解决方案 |
|------|------|----------|
| 待记录 | | |

## References
- `docs/issues/20260212-telegram-role-investigation.md`
- Gateway `command-handler.ts` 中的 role 处理逻辑
- TUI 组件：SelectList, Text, Container

## Estimated Effort
- Phase 1: 1-2 天
- Phase 2: 3-4 天
- Phase 3: 2-3 天
- Phase 4: 1-2 天
- **总计: 7-11 天**

## Notes
- 优先级：P1（影响多渠道用户体验）
- 保持 TUI 体验的流畅性，Headless 是降级而非替代
- 考虑未来的按钮/内联键盘支持（Telegram Bot API）
