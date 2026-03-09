# Shared Context Pack

## Current State Summary

1. `admin-console` is modern React shell but lacks full chat workflow parity with `src/web/app.js`.
2. Legacy `src/web/app.js` has rich chat features (streaming, tools rendering, image upload, session sidebar, role switching).
3. WS backend supports `roles.list` and `roles.set`, but legacy web calls `session.listRoles` and `session.setRole`.
4. `admin-console/src/lib/api.ts` hardcodes `http://127.0.0.1:52134/api`.
5. Gateway static server serves only embedded `src/web/*` assets.

## Must Keep

- Existing gateway protocols and external API compatibility
- Security/auth flow in gateway (`Authorization` token)
- Current observability and controller capabilities

## Modernization Direction

- Port rich chat features into admin React page/components
- Keep single source of truth for API/WS clients
- Add WS method aliases for backward compatibility
- Move runtime landing UI to unified admin package
