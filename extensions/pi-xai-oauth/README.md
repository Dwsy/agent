# pi-xai-oauth

Pi extension that registers an xAI Grok OAuth provider plus xAI helper tools.

## Features

- Registers provider `xai-auth` for xAI Grok via OAuth.
- Supports browser callback login with PKCE.
- Can reuse official Grok CLI credentials from `~/.grok/auth.json`.
- Adds xAI tools for text generation, multi-agent research, web/X search, code analysis, and image generation.

## Install

```bash
npm install -g pi-xai-oauth
```

Pi discovers npm packages that declare `pi.extensions`.

For local development, load this folder directly:

```bash
pi -e ./extensions/xai-oauth/index.ts
```

## Login

Use Pi's model/provider login flow for `xai-auth`. The OAuth flow opens xAI in your browser and listens on a local callback server.

If automatic browser open uses the wrong profile, copy the shown authorization URL into your preferred browser and paste the callback URL or code into Pi's manual input field.

## Provider

Registered provider:

- Name: `xai-auth`
- Display: `xAI (OAuth)`
- Base URL: `https://api.x.ai/v1`
- API surface: `xai-responses`

Bundled models, synced from `https://api.x.ai/v1/models`:

- `grok-4.20-0309-non-reasoning`
- `grok-4.20-0309-reasoning`
- `grok-4.20-multi-agent-0309`
- `grok-4.3`
- `grok-imagine-image` — outputs image
- `grok-imagine-image-quality` — outputs image

## Language policy

Text-oriented tools infer the preferred answer language from the terminal locale (`LC_ALL`, `LC_MESSAGES`, then `LANG`). User-requested language still wins.

## Tools

This extension registers tools with the `xai_` prefix to reduce collision risk:

- `xai_generate_text`
- `xai_multi_agent`
- `xai_web_search`
- `xai_x_search`
- `xai_code_execution`
- `xai_image_generate`

Install this package through one method only. Loading both an npm package and a git/local copy can cause provider or tool conflicts.

## Development

```bash
npm pack --dry-run
```

The extension source is `index.ts`. Pi loads TypeScript extension files directly.
