# Feishu Plugin Full Alignment

## Status: In Progress

## Reference
- Source: https://github.com/openclaw/openclaw/tree/main/extensions/feishu
- Files: 100+ (src/*, index.ts, runtime-api.ts, setup-*.ts, skills/*)

## Current State (pi-gateway)
- Files: 8 (index.ts, bot.ts, client.ts, send.ts, media.ts, actions.ts, card-stream.ts, types.ts)
- Features: Basic messaging, reactions, edit, delete, pin, history
- Limitations: Single account, no tools, no directory API, no setup wizard

## Target State (openclaw parity)
- Multi-account support
- Complete actions (send/read/edit/pin/member-info/channel-info/channel-list/react/reactions)
- Directory API (query users/groups)
- Setup Wizard
- Tool registration (docx/bitable/drive/wiki/perm/chat)
- Advanced features (monitoring, streaming cards, state management)

## Phase 1: Core Messaging (Current)
- [ ] Multi-account config structure
- [ ] Account resolution (resolveFeishuAccount, listEnabledFeishuAccounts)
- [ ] Complete actions implementation
- [ ] Directory API
- [ ] Setup Wizard

## Phase 2: Tool Registration
- [ ] docx tools
- [ ] bitable tools
- [ ] drive tools
- [ ] wiki tools
- [ ] perm tools
- [ ] chat tools

## Phase 3: Advanced Features
- [ ] State management
- [ ] Monitoring & probes
- [ ] Streaming cards

## Progress
- 2026-03-23: Task started, downloading reference implementation
