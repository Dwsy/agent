# ux_verify verdict — Session Workbench (real Chrome CDP, 2025-10-30)

Env note: system proxy (127.0.0.1:7897) is dead in this browser profile → CDN scripts
(tailwind/alpine/lucide) fail → app renders blank (body[x-cloak] never lifted).
Verified via dedicated headless Chrome 156 on CDP :9333 (`--no-proxy-server`),
agent-browser --session uxv connect 9333. App itself loads fine with network.

## Per-item verdict
1. Desktop 1440×900 three-pane — PASS (01/02/28). Rail 240 | list 739 | detail 461 (spec 420–560), rows exactly 40px, selected row = --sel-soft bg + 2px accent ::after left bar (animated sel-bar), hairline dividers, no card soup. Nit: model/sid chips use mono.
2a. 概览 — PASS (01,02). 身份/Git/恢复记录/关注/文件活动/操作 all present, values aligned.
2b. 历史 — PASS (03,04). 10 entry blocks w/ rendered markdown; "⋯ 工具调用 ×30" collapse expands (aria-expanded=true, 30 items). Nit: .entry-error fills whole 3900px block with error-soft red (spec: status color never as panel fill).
2c. Review — FAIL-partial (05). Tree+stats+diffs render, but diff pane ~90px wide at 461px detail → per-char wrap, unreadable.
2d. 终端 — PASS dark (07). wterm renders real TUI; toolbar 控制/观察 seg + 鼠标·自动 + Lucide 重连/⛶/✕ (aria-labels 重新连接终端/全屏切换/关闭终端面板). FAIL light (26,11): canvas blank/glitchy after theme switch.
2e. 文件 — PASS (06,19). Dir-grouped file-group-head mono + EDIT/WRITE chips + relTime.
3. CommandBar — FAIL render, logic OK (09,10,12). Groups 命令/过滤状态/最近会话 ✓, fuzzy "主题"→切换主题 ✓, ↑↓/Enter runs cmd ✓, Esc closes ✓, "没有匹配的命令" empty ✓. BUT modal reproducibly stuck invisible (display:none + enter styles while scrim shows) or shifted +280px (x=734 vs 454): CSS `animation: menu-in` (app.css:2018) fights Alpine `x-transition` (index.html:873) — inline scale(0.95) kills translateX(-50%), enter state never settles. Same menu-in on .menu/.confirm (app.css:279/1978).
4. Terminal ⛶ fullscreen → Esc — PASS (08). .drawer.term-full fixed 1440×900 z45 + scrim; Esc returns to 终端 tab, x-ref termHost preserved, tab bar intact.
5. 900px — FAIL (12). No 900–1179 breakpoint at all (app.css only @media max-width:899px). At 900px: rail 240 + list 380 + detail 420 = 1040px → horizontal overflow, row titles truncated to 2–3 chars. Spec's 48px icon rail + detail overlay min(560px,92vw)+scrim unimplemented. 800px mode OK (13: rail hidden, chips, hamburger).
6. Mobile 390×844 — PARTIAL. PASS: bottom bar 49px (会话/发现/设置, 48px tabs), search+repo chips, row tap → full-screen push w/ ← 返回 (15), tabs incl. terminal 触屏终端为受限体验 hint (18), Composer pinned (15–19), 发现 (20), 设置 (21). FAIL: topbar unadapted — "pi-mesh" wraps, desktop viewer-pick select + SSE pill + 3 icon btns overflow to 495px (page scrollWidth 495 vs 390); .row-actions also overflow row right edge (14/15/20/21). Rows render 40px: 48px/.row-act 44px rules only under @media(hover:none) (app.css:1753) which CDP device emu here couldn't trigger — verify on real device.
7. Themes — PASS w/ nit (11 light + toast, 28 dark). Contrast: dark body 15.05:1 meta 6.92:1; light body 13.67:1 meta 4.44:1 (just under 4.5). No dark-on-dark leakage except terminal glitch (26).
8. Hard rules — PASS. Rendered-DOM emoji scan: 0 pictograph/dingbat/arrow/geometric glyphs in UI (all icons inline Lucide SVG incl. ⌘K/branch/herdr/rotate-ccw/tab bar/empty states). AI-slop scan: glow 0, oversized padding 0, rounded-card soup 0; gradients only 2 sticky-header fade masks; blur only spec'd (topbar 20px/saturate1.8, cmdk scrim 4px) + offline banner 8px.
9. Polish — PASS most. Row hover --panel-2 ✓ (23); focus-visible 2px accent ring ✓ (24, offset 1px vs spec 2px); thin scrollbars (webkit 8px round thumb) ✓; toast ✓ (11); sticky section heads ✓ (position:sticky top:13). FAIL: no "无匹配结果" empty state — filtered list = blank void (25). SkeletonRows in DOM (25 nodes) but first-paint shimmer not captured (local API too fast) — verify throttled. Row press/tooltip timing unverified.

## Gaps ranked
BLOCKER
- B1 CommandBar render (all viewports): stuck invisible or off-center +280px; fix animation menu-in vs x-transition conflict on .cmdk (and audit .menu/.confirm).
- B2 900–1179 layout missing: three panes overflow 1040>900 at 900px (12); implement 48px icon rail + detail overlay + scrim per spec.
- B3 Mobile topbar + row-actions horizontal overflow (scrollWidth 495 @390): brand wraps, viewer select eats width (14/15/20/21).
SHOULD-FIX
- S1 Review diff ~90px wide / per-char wrap at desktop detail width (05) — needs diff-first layout or pane widening.
- S2 Terminal blank/glitchy in light theme after theme switch (26/11).
- S3 No no-match empty state for search filter (25).
- S4 .entry-error block = whole-run error-soft fill (04) violates "状态色绝不做面板填充".
- S5 App hard-depends on 3 external CDNs (tailwind/alpine/lucide) → blank page behind proxies/offline; vendor like wterm.
NIT
- Light muted meta 4.44:1 <4.5; focus ring offset 1px (spec 2px); mono on model/sid chips (spec mono=terminal/diff/paths); mobile 发现 relTime wraps "5小/时前"; offline banner overlaps brand (22); cmdk shows "命令" group twice; skeleton first-paint needs throttled re-check.

## Explicit answers
- Native/premium, not AI slop? YES at 1440 dark desktop: hairline chrome, 40px rows, dense purposeful layout, Lucide-only icons, no glow/gradient/card soup. Degrades at Review pane, CommandBar, mobile topbar.
- Any "1 card" flavor left? NO — rows carry 3 actions + overflow menu with exactly spec items (27: 关注/恢复/进入/复制 focus 命令/复制 sessionId/查看 Review); detail sections + docked Composer replace the old 8-button card.
- Mobile genuinely usable? PARTIAL — navigation/tabs/detail/composer/discover/settings work, but topbar + row-action overflow must be fixed first.

---

# LOOP-1 RE-VERIFICATION (v2-*, rework loop 1) — 2025-10-30 late
Method: same real Chrome CDP :9333 (agent-browser --session uxv). App now serves vendored /cdn/* (tailwind-3.4.16, lucide-0.469.0, alpinejs-3.14.9).

## Focus items
1. CommandBar 1440/900/390 — PASS (v2-02, v2-02b, v2-02c). One animation `cmdk-in` keeps translateX(-50%); centered x=440@1440 / 170@900 / 16@390, opacity 1 by ~400ms, never stuck, Esc closes (display:none + scrim gone), Ctrl+K reopens centered.
2. 900px — PASS (v2-03/04/05). 48px icon rail (counts stacked + repo icons), hover flyout .rail-wt 224px shows 主工作树/main, row tap → detail overlay 560px (=min(560,92vw)) + .detail-scrim (rgba .28 + blur 4px); dismiss: back btn ✓ + scrim click ✓ (Esc not wired — spec Esc chain excludes it). body scrollWidth == 900.
3. 390px — PASS (v2-06/07/08). scrollWidth === 390; topbar 44px single line (brand 1 line); rows 48px; row actions 44×44 icon-only (label spans hidden); 发现 relTime "6小时前" unwrapped; viewer select moved into 设置 pane (topbar select display:none). Mobile terminal hint 触屏终端为受限体验 renders (v2-19).
4. Review — PASS (v2-09, v2-10). 1440: detail auto-widens 461→634 on Review tab (list 566); pm-diff-pane 375px — unified diff with line numbers/syntax/truncation markers legible. 900 overlay: diff 301px, word-wrap, readable (was ~90px per-char).
5. Terminal theme flip — PARTIAL (v2-13a/b/c). Surface palette repaints cleanly dark(27,27,32)→light(255,255,255)→dark; no dark-block glitch (loop-0 bug gone), toast confirms flips. BUT terminal CONTENT is unverifiable: attach renders ZERO cells (empty .term-row grid, status "open", no error) for live herdr panes wJZ:p1 and wWJ:p1 — incl. after toolbar reconnect + ⛶ resize. In loop 0 the same wJZ:p1 pane rendered the full TUI. See gap B1.
6. No-match filter — PASS (v2-14). 「无匹配结果 / 当前过滤条件没有匹配的会话 / 清空过滤」; 清空过滤 restores 22 rows + clears search + filters.
7. History error run — PASS (v2-15). .entry-error background transparent (was rgba(248,113,113,.12)); error tint now 1px border only.
8. Offline resilience — PASS (v2-16). With all external https://** aborted: Alpine/tailwind/lucide all object, x-cloak removed, 22 rows, topbar renders — full boot from local /cdn/*.

## Regressions on previously-PASS items
- Three-pane geometry, 40px rows, row-sel --sel-soft + 2px bar, tabs 5×: PASS (v2-01/09).
- ⛶ fullscreen 1440×900 + Esc → tab, termHost kept: PASS (v2-17).
- Themes/contrast: dark body 15.05 / meta 6.92; light body 13.67 / meta 5.38 (≥4.5 now): PASS.
- Hard rules: emoji glyphs 0; glow 0; rounded-card soup 0; gradients only 2 sticky-header fades; blur only spec'd (topbar/scrim/banner): PASS (v2 scans). Nit: one `.empty` with 160px vertical padding.
- Mobile push detail + back + hint: PASS (v2-19).

## Nits re-measured
- light meta contrast 4.44 → 5.38 FIXED; focus-visible offset 1px → 2px (2px solid accent, offset 2px) FIXED; cmdk duplicate「命令」group FIXED (命令/过滤状态/最近会话, 暂停实时 merged); banner/brand overlap FIXED (banner is in-flow row y0-31, brand y42+, verified geometry).
- Remaining nits: `.empty` 160px padding; 终端 toolbar shows mode chip 控制 next to seg 控制/观察 (duplication); skeleton first-paint shimmer still not capturable (local API too fast).

## LOOP-1 GAP LIST
BLOCKER
- B1 Terminal content never paints on attach (live herdr panes wJZ:p1 / wWJ:p1: status open, 0 cells; also after reconnect + fullscreen resize). Acceptance item 5 (theme-flip content repaint) UNVERIFIED; surface/palette flip itself works. In loop 0 same pane rendered TUI — either hub `herdr terminal` screen-replay missing (src/hub/terminal.ts bridge) or a render regression; reproduce on an actively-writing session or add initial replay. (v2-11/12/13a-c)
SHOULD-FIX
- (none new from claimed fixes — all 3 blockers + S1/S3/S4/S5 + nits confirmed fixed)
NIT
- `.empty` 160px vertical padding (marketing whitespace in empty state); 终端 toolbar mode chip duplicates the 控制/观察 seg label; Esc does not dismiss the 900px detail overlay (spec Esc chain omits it — optional).

## Explicit answers (loop 1)
- Native/premium? YES — and stronger than loop 0: wide Review diff, clean light theme, responsive 900/390 all read as a real tool. Terminal blank is the only "broken product" feeling left.
- "1 card" flavor? Still NO.
- Mobile genuinely usable? YES now (topbar/rows/overflow fixed; 48px rows; push detail; settings-hosted viewer picker).

---

# LOOP-2 FINAL CONFIRM (v3-*) — 2025-10-31
Method note: terminal rendering requires a non-throttled page. My earlier "blank terminal" runs were an environment artifact (document.visibilityState='hidden' + rAF throttling stalls wterm's paint pump; herdr attach replay DID arrive — 4 frames, first 5452B, sitting unconsumed with _viewportStale). Re-verified in headed Chrome with --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding (vis=visible).

1. Terminal end-to-end on live pane wJZ:p1 (row-act 终端 on already-selected peer = former 0×0 path) — PASS (v3-01/02/03/04): attach paints 26/30 rows of real TUI content (status open); theme flip dark→light→dark keeps content in all three (host bg 27,27,32 ↔ 255,255,255, no glitch); toolbar 重连 → status open + content repainted. B1 CONFIRMED FIXED.
2. Nit sweep — PASS: `.empty` padding 160px → 32px 16px (all 5); terminal toolbar no duplicate 控制 chip (chip=herdr target wJZ:p1 + seg 控制/观察 + 鼠标·自动 only); Esc dismisses 900px detail overlay (mobileView detail→list, pane display:none) — correctly behind terminal priority (Esc #1 closes terminal, Esc #2 closes overlay). Real-key delivery verified in headless session (v2-17), logic verified here via dispatch.
3. Hard-rule scan rendered DOM — PASS: emoji glyphs 0; glow 0; oversized padding 0; rounded-card soup 0; gradients 2 (sticky-header fade masks only).

## LOOP-2 VERDICT: ACCEPT — no remaining gaps at acceptance level.
Observation (not a gap): wterm defers painting while the page is hidden (measured: replay frames arrive but sit unconsumed, _viewportStale=true, grid empty while document.hidden). A terminal opened in a backgrounded tab may therefore look empty until the tab is foregrounded; whether the stale viewport repaints on visibilitychange is unverified here. Optional hardening: force a repaint on visibilitychange.

---

# LOOP-3 FINAL VERIFICATION (v4-*) — 2025-10-31
1. Motion audit — PASS (v4-01/02). Rendered scan: zero scale/bounce/pulse/shimmer (CSS + getAnimations + computed animation/transition names). Only fade keyframes remain (menu-in, cmdk-in — opacity only); skeleton static (no shimmer); .peer-row hover = background-color only (bg rgb(32,32,39), transform none, 0 running anims); tab indicator static (::after bar, no transition); icons static .5px optical offset.
2. Composer — PASS (v4-03). Single .composer-field (10px radius, hairline border) containing seg 转向|追问 + textarea + send icon button (28px) INSIDE right edge; disabled→muted, enabled→accent rgb(125,211,252); no hint line below.
3. Review — PASS (v4-04/07). pm-tree exactly 260px + diff 283px word-boundary wrap (overflow-wrap normal — no per-char); DetailPane width CONSTANT 600px on 概览/历史/Review/终端 (no jump).
4. Tabs/files — PASS (v4-06/07). 4 tabs 概览|历史|Review|终端, 文件 tab gone; 概览's 文件活动 = collapsible .file-tree (20 dirs); clicking AppDelegate.swift → Review tab with that file selected (pm-tree-row pm-se) + focused.
5. md rendering — PASS (v4-08/09). 历史 shows 4 headings / 33 li / 3 lists / 48 pre-block code frames; theme toggle keeps md intact (light code frame rgb(241,241,243), readable colors).
6. Filters — PASS (v4-05). Status filters ONLY in GroupRail counters (全部 26/运行中 0/等待 3/离线 2/已关闭 21); list chip row gone (only mobile repo-chips remain, hidden desktop); clicking 等待 → exactly 3 rows, 全部 → 26.
7. Heartbeat-age text — PASS. Rendered-text scan for lastHeartbeat/心跳/N秒前/N分钟前/N小时前/N天前: ZERO matches.
8. Rail grouping — PASS (v4-01/05/14). Folders + repos (1 · 5, mcp-events-demo · 2, tmp · 4 …); single-chain collapses to one line 「agentdock / main · 2」.
9. 新建对话到 herdr — PASS (v4-10/11/12/14). Right-click rail group + list both show the single-item ctx menu; ONE deliberate click executed → toast「已新建对话 → herdr 工作区 pi-new-vp8ud8 (wK8)」. CREATED WORKSPACE FOR CLEANUP: pi-new-vp8ud8 (wK8), appears as row under rail group「dengwenyu · 1」.
10. Ephemeral peer — PASS w/ nit (v4-13/14). pi-mesh-ephemeral-demo: chip chip-ephemeral「⚡临时」(title 临时会话（--no-session）· 不保存记录); overflow menu hides 恢复/查看 Review/进入 (visibility-filtered); detail shows 临时会话，不保存记录; 历史/Review tabs remain in the tab strip but open to the 不保存记录 empty state (nit: could hide the tabs themselves).
11. Drag-resize — PASS (v4-15). Both .pane-handle drags work (rail 240→300; detail 600→658); pi-mesh.panes persisted {"rail":300,"detail":658}; exact restore after reload (300/480/658); dblclick resets to defaults (rail 240/detail 600, stored 0/0); zero text selection during drag. Automation note: dblclick handler verified via dispatched dblclick event — raw CDP mouse pairs don't coalesce into dblclick events in agent-browser; real-mouse dblclick is standard browser behavior (low risk).
12. Final scans — PASS. emoji glyphs 0; glow 0; oversized padding 0; rounded-card soup 0; scale/bounce/pulse/shimmer 0; gradients = section-head sticky fades only; dark (v4-16) + light (v4-09/14) readable; 390 mobile regression (v4-17): scrollWidth 390, rows 48px, topbar 44px single line, bottom bar + composer present; focus-visible 2px accent offset 2px.

## LOOP-3 VERDICT: ACCEPT — rework closes.
Non-blocking nits: ephemeral 历史/Review tabs not hidden (empty-state instead); ephemeral chip label renders「临时」(full text in tooltip); dblclick-reset untested with a physical double-click (handler verified).

---

# LOOP-4 CLOSING GATE (v5-*) — 2025-10-31
Throwaway workspace used for all terminal input tests: 「新建对话到 herdr」→ **pi-new-vw5xfn (wKB)** (created this round; also leftover pi-new-vp8ud8 from loop-3 — both for parent cleanup). Real sessions untouched except read-only browsing; the one resume-confirm opened on a closed demo peer was CANCELLED (never confirmed).

1. Terminal — PASS (v5-01/02). Throwaway wKB:p1 attach paints 30/30 rows; mouse click reaches pi (termSendInput 2×); wheel in 鼠标·自动 forwards to app (3×); wheel in 鼠标·本地 stays local (0 forwarded); shift+wheel → termScroll("up") history path. CPU-spin regression: with 恢复 ConfirmPopover open — 0 un-hydrated lucide icons (619 svg hydrated), 240 rAF frames/2s, zero page errors. (Automation note: agent-browser `mouse wheel` mis-targets the topbar in this headed setup; wheel verified via synthetic WheelEvents on the real handler path — the fixed termModeActivity prologue scan no longer misfires.)
2. Annoyances — PASS (v5-03/04/05). Select row + right-click → EXACTLY one menu; ⋯ tap at 390 opens the menu (44×44) without drill-in (mobileView stays list); keyboard survives Enter (arrows move selection, digit keys switch tabs, focus lands on panel H2 per spec); mobile bottom tabs switch content from pushed detail (发现 pane display:block, detail display:none).
3. De-native — PASS. 0 `<select>`, 0 visible native controls (only text inputs); viewer dropdown = custom button.viewer-btn, keyboard Enter→open, ArrowDown→Enter selects; custom checkbox = 1×1 appearance:none input + .check-box visual, Space toggles (check-on) with keyboard focus.
4. Regressions — PASS. Geometry 240/598/600 (v5-06); drag-resize persists (rail 280 → pi-mesh.panes → reload 280 → dblclick reset 240); Review at 600px: tree 180 + diff 367 (≈claimed 368) (v5-06); md history renders (v5-08); reload banner grace (no stuck banner, connected, v5-07); hard rules: emoji-as-icon 0 in UI chrome (only ✗ nit below), gradients 0 (excl sticky fades), glow 0, bigPad 0, scale/bounce/pulse/shimmer 0; dark (v5-08) + light (v5-09); 390px clean (v5-04/05).

## LOOP-4 VERDICT: ACCEPT (closing gate passed).
Nits (non-blocking):
- `.danger-text` uses a ✗ (U+2717) glyph as the toolrun error counter icon ("✗N" in 工具调用 heads) — hard rule is Lucide-only icons; swap to lucide x/circle-x. (The → arrows found in history are session TEXT, not UI — fine.)
- History `.entry` blocks are now card-styled (8px radius + 1px border + 0 1px 2px shadow) — technically touches the "no rounded-card soup / no row shadows" rule; reads as intentional message-thread styling, but flag for the taste-holder.
- Automation-only: agent-browser mouse-wheel targeting quirk (physical wheel plumbing is standard).

---

# LOOP-5 WEBUI PRODUCTIZATION — 2026-11-01

Method: isolated pi-mesh hub using scratch home /tmp/pi-mesh-webui-scratch-20261101, dedicated headed Chrome CDP :9225 with background throttling disabled and the working tab explicitly activated, plus browser-harness. Headless :9224 was used only for early exploratory checks. No real pi session received a message, resume, terminal input, or other mutating action. The only send requests in the browser were intercepted before reaching the hub; offline/closed guards were verified to make zero requests.

## Review and navigation

1. Review identity — PASS. The fixture contains packages/a/src/index.ts and packages/b/src/index.ts (same basename) plus a failed edit. The tree keeps the two package files distinct, merges absolute/relative aliases for package A, and displays repository-relative paths without using display paths as identity.
2. Review entry points — PASS. The real row overflow menu opens Review; clicking the session's file-activity entry for packages/a/src/index.ts also opens Changes and selects the matching canonical file key.
3. Deep link and tab round-trip — PASS. A cold load from URL hash includes session, tab and encoded canonical file key; the Review tree now mounts before rendering and restores the selected row. Switching Changes → Session → Changes preserves the same selected file.
4. Result accounting — PASS. Browser fixture renders 3 successful tool calls and 1 failed tool call separately; failed operations do not inflate successful addition/deletion totals. Unit tests cover pending results and SSE duplicate replay.
5. Default conversation — PASS. A legacy history tab hash migrates to the Session view; the scratch transcript loads 7 entries / 4 display groups, renders both user and assistant messages, and keeps the Composer docked. The three detail tabs are present.

## Composer and collaboration

1. Target availability — PASS. Running and waiting peers are messageable; offline and closed targets show distinct status text, disable the send button, and produce zero network requests. Waiting is presented as online/idle.
2. Request snapshot and single-flight — PASS. While a request was pending, a second send produced no second request. The captured request retained the original text, followUp mode and demo-waiting source even after the user edited the draft, changed mode and changed the selected source.
3. Draft isolation — PASS. Newer text and mode survive an accepted response; explicit rejection and network uncertainty both preserve the submitted text. Receipt labels distinguish accepted, rejected and unknown; no automatic retry occurs.
4. IME — PASS. Composition began on one target, selection changed to another, and Enter during composition was not sent. compositionend cleared the composing state even though the selected target had changed; the next Enter sent normally.
5. Source semantics — PASS. UI calls the optional fromSessionId a collaboration source, states whether delivery creates a follow edge, shows source state, and no longer claims the message is sent as another session's identity. An existing source choice survives an empty SSE snapshot; a missing choice falls back only to a live peer, or to direct WebUI when none is available.

## Session list and responsive layout

1. Search and filters — PASS. First-run filter is Online; search still finds offline history while Online is selected. A selected peer hidden by the filter retains its detail and draft; Locate restores visibility without losing the draft.
2. State transition — PASS. Running → offline keeps the selected session and draft, marks it hidden under Online, disables send, and does not change stable order when it returns online.
3. Desktop 1440×900 — PASS. Document/body width 1440; no horizontal overflow; Review and docked Composer render.
4. Compact 900×820 — PASS. Detail opens as a 560px right overlay; document/body width remains 900.
5. Mobile 390×844 — PASS. Detail fills 390px and ends at y=795 above the 49px bottom bar; document width remains 390. Compact header hides redundant session-id/current-view chips so the title remains readable; the overflow menu still exposes Copy sessionId. Back navigation works, per-session drafts remain isolated across A/B/A navigation, Review opens, and the Composer stays docked.
6. Browser diagnostics — PASS. Runtime errors 0; console errors 0.
7. DOM hard rules — PASS. Across 1440 / 900 / 390: native select 0, emoji text 0, horizontal overflow 0; Composer status contrast is 5.86:1. The menu/command/terminal-loader animation declarations are all under hidden elements; no visible non-fade motion.

## Evidence

- 1440×900: 20261101-pi-mesh-webui-productization/desktop-1440-review.png
- 900×820: 20261101-pi-mesh-webui-productization/compact-900-review.png
- 390×844: 20261101-pi-mesh-webui-productization/mobile-390-review.png
- Full automated suite: 237 passed, 0 failed (15 files); app.js and review.js node --check passed.
- Targeted Review/WebUI suite: 93 passed, 0 failed (1,405 assertions).

## LOOP-5 VERDICT: ACCEPT for the WebUI first-batch scope.

Limitations: mobile soft-keyboard/visualViewport behavior was not tested on a physical device. Terminal pane input and live herdr repaint were not re-run because this round changed no terminal code; prior LOOP-4 terminal acceptance remains the evidence for that separate surface. The test hub and browser profile are isolated and are not the user's normal hub/browser.
