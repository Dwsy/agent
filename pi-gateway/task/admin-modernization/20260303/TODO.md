# TODO — Admin Modernization + Web Chat Merge

## Status Board

### TODO
- [ ] T6: Implement production static serving strategy for unified UI
- [ ] T7: Add verification checklist and smoke tests

### IN_PROGRESS
- [ ] P2: Split large bundle for chat markdown/highlight via lazy loading

### BLOCKED
- [ ] (none)

### DONE
- [x] D1: Bootstrap program folder and shared context docs
- [x] D2: Baseline scan of existing admin/web/API/WS implementation
- [x] P1: Parallel subagent analysis and implementation plan synthesis
- [x] T1: Build dedicated Chat page in `admin-console` with WS chat parity (session/history/send/abort/stream/image/role)
- [x] T2: Add WS compatibility aliases (`session.listRoles`, `session.setRole`) in gateway methods
- [x] T3: Unify API base to same-origin `/api`
- [x] T4: Wire navigation/routes so Chat is first-class entry
- [x] T5: Keep existing Ops pages functional after Mantine shell migration (overview/agents/plugins/alerts/settings/metrics)
- [x] T8: Migrate admin UI shell to Mantine + add day/night theme toggle

## Risks
- Hardcoded API base in admin breaks non-local deployments
- WS method mismatch already exists (`session.listRoles` vs `roles.list`)
- Static server currently only serves `src/web/*` embedded assets

## Mitigations
- Use same-origin API by default, token from storage
- Add compatibility aliases in WS router
- Introduce clean static serving abstraction with fallback
