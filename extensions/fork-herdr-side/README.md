# fork-herdr-side

在 Herdr 的同一 tab 中，将当前会话节点 fork 到相邻 pane。支持 Pi 和 grok-pi。

```text
/fork-herdr-side        # 右侧
/fork-herdr-side right  # 右侧
/fork-herdr-side left   # 左侧
```

扩展放在全局扩展目录，运行 `/reload` 后即可使用。需要当前会话已有持久化内容，且当前进程运行在 Herdr pane 中。

扩展通过当前 pane 的前台进程识别 Pi 或 grok-pi。它使用 Pi 的 `SessionManager.createBranchedSession()` 创建当前节点的新会话，再通过 `--session` 在新 pane 中打开。这样从 `/tree` 切换到历史分支时也会复制正确的节点。原会话不切换；创建 pane 时使用 `--no-focus`。

成功通知表示 Herdr 已接收启动命令；如果启动失败，请查看新 pane。若分屏或启动步骤失败，错误通知会给出已创建的会话文件和 pane ID。

测试：

```bash
bun test extensions/fork-herdr-side/index.test.ts
```
