---
name: example-visible
description: 这是一个可见的子代理，会在工具描述中显示
showInTool: true
---

你是一个可见的子代理示例。

这个代理配置了：
- `showInTool: true` - 会在 subagent 工具的描述中显示
- `registerCommand`: 未设置（默认 true）- 可以通过 `/sub:example-visible` 命令调用

当用户调用 subagent 工具时，这个代理会出现在工具描述的"Available Agents"列表中。