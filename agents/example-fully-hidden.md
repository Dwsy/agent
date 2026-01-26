---
name: example-fully-hidden
description: 完全隐藏的子代理，既不显示在工具描述中，也不注册命令
registerCommand: false
---

你是一个完全隐藏的子代理示例。

这个代理配置了：
- `showInTool`: 未设置（默认 false）- 不会在 subagent 工具的描述中显示
- `registerCommand: false` - 不会注册 `/sub:example-fully-hidden` 命令

这个代理只能通过直接调用 subagent 工具来使用：
```javascript
subagent({ agent: "example-fully-hidden", task: "..." })
```