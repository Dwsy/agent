# Pull Request: 修复 ace-tool Web UI 并验证核心功能

> 修复 Web UI 无法加载和渲染的问题，并验证语义搜索与提示词增强功能。

## 背景与目的 (Why)
用户反馈 `ace-tool` 的 Web UI 完全无法使用（4231 端口访问异常及 JS 报错）。此外需要对新集成的语义搜索和提示词增强功能进行端到端验证。

## 变更内容概述 (What)
1.  **Web UI 重构**:
    *   移除复杂的 TypeScript 模板嵌套，改用单 HTML + CDN (Tailwind CSS + jQuery) 架构。
    *   修复了导致 `Unexpected token` 的字符串转义错误。
    *   重写渲染逻辑，支持 MCP 标准的 `{ result: { content: [...] } }` 响应格式。
2.  **Daemon 增强**:
    *   支持 `~` 路径自动扩展（解决项目路径找不到的问题）。
    *   优化了 `.env` 解析逻辑，支持带引号的配置项。
    *   增加了 `ACE_PATH` 环境变量支持，明确指定底层工具路径。
    *   优化了进程启动和健康检查逻辑。
3.  **功能验证**:
    *   验证了 `search_context` 能够准确找回项目内的代码片段。
    *   验证了 `enhance_prompt` 能够结合上下文将模糊需求转化为详细的技术规格。

## 关联 Issue (Links)
- **Issues:** 
    * `docs/issues/20260107-测试 ace-tool 语义搜索功能.md`
    * `docs/issues/20260107-测试 ace-tool 提示词增强功能.md`

## 测试证明 (Verification)
- [x] 浏览器访问 `http://localhost:4231/` 界面渲染正常，无报错。
- [x] 在 Web UI 中执行搜索，成功渲染代码高亮片段。
- [x] 执行提示词增强，成功生成 5 个维度的技术拆解。
- [x] 终端执行 `bun client.ts search "test"` 返回 JSON 结果正常。

## 回滚计划 (Rollback)
- `git checkout e91e30e` (ace-tool-skill repo)
- 删除 `~/.pi/agent/skills/ace-tool/.ace-tool/` 下的缓存和索引。
