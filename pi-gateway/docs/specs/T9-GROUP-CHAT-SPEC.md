# T9: 群聊上下文注入 + SILENT Token

**Owner:** CalmBear  
**文件:** `src/gateway/message-pipeline.ts`  
**改动量:** ~17 行

---

## 改动 1: 群聊上下文前缀注入 (~10 行)

**位置:** `rpc.prompt(promptText, images)` 之前（约 L266）

```typescript
if (source.chatType === "group") {
  const groupCfg = resolveGroupConfig(source, ctx.config);
  const activation = groupCfg?.requireMention !== false ? "mention" : "always";
  const prefix = [
    `[Group: ${source.chatId}]`,
    `[Sender: ${source.senderName ?? source.senderId}]`,
    activation === "always"
      ? "[Mode: always-on — reply NO_REPLY if no response needed]"
      : "[Mode: mention-only — you were explicitly @mentioned]",
  ].join(" ");
  promptText = `${prefix}\n${promptText}`;
}
```

**注意:** `resolveGroupConfig` 需要从 config 中解析 group 配置。参考 `resolveRoleForSession` 的 group 查找逻辑。

---

## 改动 2: SILENT Token 拦截 (~7 行)

**位置:** respond 回调之前（约 L296，outbound.text 已确定）

```typescript
const SILENT_TOKEN = "NO_REPLY";
const silentRe = new RegExp(`(?:^|\\W)${SILENT_TOKEN}(?:$|\\W)`);
if (source.chatType === "group" && silentRe.test(outbound.text)) {
  ctx.log.debug(`Agent chose silence for ${sessionKey}`);
  ctx.transcripts.logMeta(sessionKey, "silent", { text: outbound.text.slice(0, 100) });
  return; // skip delivery
}
```

**规则:** 只在群聊生效，DM 不拦截。

---

## 验收

- 群消息 dispatch 时 promptText 包含 `[Group:` 前缀
- agent 输出 `NO_REPLY` 时不发送到群
- DM 消息不受影响
- 723 tests / 0 fail
