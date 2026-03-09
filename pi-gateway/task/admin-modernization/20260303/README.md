# pi-gateway Admin Modernization Program

- Owner: PM (pi agent)
- Date: 2026-03-03
- Status: In Progress
- Scope: Merge `admin-console` and online Web UI chat into one modern full-function gateway console

## North Star

One unified console for operations + chat + observability:
- `/` lands in modern admin shell
- Chat is first-class inside admin
- Existing gateway HTTP + WS APIs fully wired
- Missing APIs are extended with backward compatibility

## Complexity Assessment (L4)

| Dimension | Assessment |
|---|---|
| Scope | 10+ files (frontend + gateway API + static serving) |
| Dependencies | React/Vite + existing Bun gateway + WS protocol |
| Change Size | 500+ LOC expected |
| Risk | Cross-module (UI + API + serving pipeline) |
| Uncertainty | Medium-high (serving strategy + backward compatibility) |
| Coordination | 3 parallel streams |
| Testing | typecheck + build + gateway tests |

Decision: L4 workflow, split into parallel tracks, strict to-do state and shared context.

## Workstreams

1. **Architecture & UI Merge Plan**
2. **API/WS Gap Closure**
3. **Delivery & Build/Serve Integration**

## Acceptance Criteria

- [ ] Unified admin includes full chat experience (session list/history/send/abort/stream/media/role)
- [ ] Core ops pages still work (overview/agents/plugins/alerts/settings/metrics)
- [ ] Gateway APIs/WS methods support frontend needs without hacks
- [ ] Static serving path can serve unified UI in production runtime
- [ ] `bun run check` and targeted verification pass

## Shared Context

- Gateway HTTP router: `src/api/http-router.ts`
- Gateway WS methods: `src/ws/ws-methods.ts`
- Gateway static serving: `src/core/static-server.ts`
- Legacy online UI: `src/web/*`
- Modern admin shell: `admin-console/src/*`
