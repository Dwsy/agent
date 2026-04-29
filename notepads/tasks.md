# Tasks

- [x] 梳理 pi-fff 当前 autocomplete 结构与数据来源
- [x] 为 `$` fuzzy 搜索 Prompts + Skills 补全写测试
- [x] 实现 `$` 补全并插入 `/prompt` 或 `/skill:name`
- [x] 更新 README，补充 `$` 补全说明与示例
- [x] 修复 `$` 补全触发逻辑，对齐 `@` 的引号边界检测
- [x] 实现 `$` 自动触发补全（输入 `$` 后自动弹出，无需按 Tab）
- [x] 运行 typecheck 与测试验证

## Review

- `$xxx` 现在会在编辑器里从 `pi.getCommands()` 抓取 `prompt` + `skill` 两类命令做 fuzzy 补全。
- 选中 prompt 会插入 `/promptName `，选中 skill 会插入 `/skill:skill-name `。
- `@...` 的 FFF 文件补全逻辑保持不变。
- README 已补充 `$handoff` / `$writing` 示例和行为说明。
- 修复了 `extractDollarPrefix`，使其与 `extractAtPrefix` 保持一致，支持引号边界检测。
- 在 `FffEditor.handleInput` 中重写了 `$` 的自动触发逻辑：
  - 输入 `$` 且在 token 边界时，先插入字符，再模拟 Tab 键触发补全
  - 在 `$...` 上下文中继续输入字母/数字时，自动更新补全列表
- 验证通过：`cd extensions/pi-fff && npm run typecheck && npm test`
