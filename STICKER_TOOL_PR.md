# PR: Add Sticker Tools to pi-gateway

## Summary

Add unified Telegram sticker pack management tools to pi-gateway.

## Changes

### New Files

```
src/tools/sticker.ts       # Unified tool definitions + implementation (12KB)
src/tools/index.ts         # Export
src/cli/sticker.ts         # CLI commands
```

### Modified Files

```
src/cli.ts                 # Add sticker command import + handler
```

## Usage

### CLI

```bash
pi-gw sticker list <pack>                    # List stickers
pi-gw sticker send <chat> <pack> [idx]       # Send sticker
pi-gw sticker send <chat> <pack> random      # Send random
pi-gw sticker download <pack> [dir]          # Download pack
pi-gw sticker search <query>                 # Search packs
```

### Agent Tools

```typescript
// List pack
sticker_list_pack({ packName: "LINE_HATSUNE_MIKU_Pom_Ver" })

// Send sticker
sticker_send({ chatId: "-5106685069", packName: "...", index: 1 })
sticker_send({ chatId: "...", packName: "...", random: true })
sticker_send({ chatId: "...", batch: [{packName: "...", index: 1}, ...] })

// Download
sticker_download_pack({ packName: "...", outputDir: "./dl" })

// Search
sticker_search_packs({ query: "miku", limit: 10 })
```

## Architecture

```
src/tools/sticker.ts (unified)
├── Tool Definitions (stickerListPackTool, etc.)
├── TelegramApi class
├── StickerTools class
│   ├── listPack()
│   ├── send() / sendSingle() / sendBatch()
│   ├── download()
│   └── search()
└── createStickerTools()
```

## Checklist

- [x] Unified single-file implementation
- [x] 4 tool definitions
- [x] CLI commands
- [x] Rate limiting (500ms)
- [x] Error handling
- [ ] Unit tests
- [ ] Integration tests

## Breaking Changes

None.
