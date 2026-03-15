# Qwen OAuth Provider Refactoring Summary

## Changes

### 1. Plugin Architecture
- Split monolithic `providers.ts` into separate plugin files
- Each provider now lives in `providers/<name>/index.ts`
- Main `providers.ts` is now just a registry

### 2. File Structure
```
model-providers/
├── index.ts                  # Extension entry point + login-qwen command
├── providers.ts              # Provider registry (imports plugins)
├── token-refresh.ts          # Manual token refresh script
├── README.md                 # Documentation
└── providers/
    └── qwen-oauth/
        └── index.ts          # Qwen OAuth plugin (self-contained)
```

### 3. Models (Only 2)
Both with `contextWindow: 256000`:

| ID | Name | Input | Output |
|----|------|-------|--------|
| `coder-model` | Qwen 3.5 Plus | $0.40/1M | $1.20/1M |
| `vision-model` | Qwen Vision | $2.00/1M | $6.00/1M |

### 4. OAuth Flow
- Device Code Flow with PKCE
- Client ID: `f0304373b74a44d2b584a3fb70ca9e56`
- Endpoints:
  - Device Code: `https://chat.qwen.ai/api/v1/oauth2/device/code`
  - Token: `https://chat.qwen.ai/api/v1/oauth2/token`
- Auto-refresh before expiration (5min buffer)

### 5. Commands
- `/login-qwen` - Interactive OAuth login
- `/providers` - Show registered providers

### 6. Token Storage
- Primary: `~/.cli-proxy-api/qwen-<timestamp>.json`
- Fallback: `~/.qwen/oauth_creds.json`

## References
- Based on CLIProxyAPI Qwen OAuth implementation
- Inspired by kilo-pi-provider plugin architecture
