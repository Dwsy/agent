# Pi Gateway Admin Console (Scaffold)

现代化前端仪表壳 + Controller 管理后台脚手架（第一版骨架）。

## 技术栈（React 生态，偏“最新可用”）

- React 19 + TypeScript 5
- Vite 6 + SWC
- React Router 7（路由壳）
- TanStack Query 5（服务端状态）
- Zustand 5（本地 UI 状态）
- TailwindCSS 3（快速搭壳）
- Axios（API 客户端）
- Recharts（监控趋势图）

## 参考说明（CodexApp 风格）

已尝试在线抓取 `codexapp` 站点技术指纹，但公开域名信息不稳定/停放页较多。
因此本次采用业内主流“现代控制台”组合：

- Vite + React + TS
- Query + Router + Zustand
- Tailwind + 图表组件

该组合兼顾开发效率、可维护性和后续扩展（权限、配置、审计、实时监控）。

## 目录结构

```text
admin-console/
  src/
    components/
      metric-card.tsx
      status-pill.tsx
    layout/
      app-shell.tsx
      sidebar.tsx
      topbar.tsx
    pages/
      overview-page.tsx
      agents-page.tsx
      plugins-page.tsx
      alerts-page.tsx
      settings-page.tsx
    lib/
      api.ts
      cn.ts
    store/
      ui-store.ts
    App.tsx
    main.tsx
    styles.css
```

## 快速启动

在 `pi-gateway` 目录执行：

```bash
bun run admin:install
bun run admin:dev
```

默认打开：`http://127.0.0.1:5176`

## 当前已完成

- 左侧导航 + 顶部控制条
- Overview/Agents/Plugins/Alerts/Settings 五大模块占位
- Health check API 连接点（`/api/health`）
- 趋势图与指标卡骨架
- 后续可直接接入真实 gateway API

## 规划文档

- 功能清单 + 未来展望：`docs/feature-list-and-roadmap.md`
- 全功能配置模板：`docs/full-config-template.jsonc`

## 下一步建议（你确认后我继续）

1. 登录鉴权 + RBAC 权限矩阵
2. WebSocket/SSE 实时态
3. 移动端表格卡片化（替代横向滚动）
4. 日志中心 + 审计中心
5. Playwright E2E 验收
