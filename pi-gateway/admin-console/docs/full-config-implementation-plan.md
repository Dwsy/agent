# Admin Console 全功能配置化深度规划（子代理产出）

## 目标
将当前 admin-console 从“页面硬编码 + 分散 API 调用”升级为“配置驱动控制台”，覆盖：
- 功能开关
- 权限矩阵（RBAC）
- 数据源策略（Polling / WS / SSE）
- 移动端策略
- 可观测性与审计

## 一、配置域模型（建议）

采用分层覆盖：
1. Schema 默认值（代码内）
2. 本地配置（`public/admin-console.config.json`）
3. 远程配置（建议新增 `/api/admin-console/config`）
4. 环境变量覆盖（`VITE_ADMIN_*`）
5. 运行时覆盖（URL/localStorage，可选）

核心配置域：
- `app`（名称、环境、主题、时区）
- `auth`（启用、模式、token 存储、refresh）
- `api`（baseURL、timeout、retry）
- `realtime`（polling/websocket/sse/hybrid）
- `features`（模块开关）
- `polling`（各模块轮询间隔）
- `permissions`（roles + matrix）
- `ui`（移动端断点、表格 mobileMode）
- `observability`（日志/分析/错误上报）
- `audit`（审计开关与保留策略）

## 二、前端架构改造

新增核心层：
- `ConfigProvider`：统一加载并校验配置
- `FeatureGate`：按 `features.*` 控制模块显示
- `PermissionGate`：按角色矩阵控制按钮/路由
- `DataSourceAdapter`：统一封装 polling/WS/SSE 数据来源
- `RealtimeProvider`：连接管理与降级策略

改造点：
- `sidebar` 改为动态菜单生成
- 页面 query 从硬编码间隔改为配置读取
- 高风险操作（restart）接入权限与确认门

## 三、API 契约映射

当前可用 API（已接入）：
- `/api/health`
- `/api/sessions`
- `/api/pool`
- `/api/plugins`
- `/api/cron/status`
- `/api/cron/jobs`
- `/api/gateway/config`
- `/api/gateway/reload`
- `/api/gateway/restart`

建议后续新增：
- `GET /api/admin-console/config`（远程配置层）
- `GET /api/admin-console/audit-logs`（审计查询）
- `POST /api/admin-console/audit-log`（审计写入）

## 四、分阶段实施（P0-P4）

### P0 配置基础设施
- 引入 `zod`
- 建立 `schema/defaults/merge/loader/parser`
- 输出稳定类型
- 验收：配置可加载、可校验、可覆盖

### P1 功能开关与动态导航
- 落地 `ConfigProvider` + `FeatureGate`
- 导航动态生成
- 页面级 Feature fallback
- 验收：关闭某模块后导航和路由一致收敛

### P2 权限与数据源适配
- 落地 `PermissionGate` + `usePermission`
- 建 `useDataSource` 抽象
- 高风险操作权限化
- 验收：viewer 无法触发 restart 等动作

### P3 实时化与移动端策略
- 增加 WS/SSE 连接层
- 保持 polling 兜底
- 表格支持 scroll/cards 配置模式
- 验收：弱网自动降级、移动端可读性达标

### P4 可观测性与审计中心
- 审计日志记录与查询
- 日志中心、错误上报
- 性能指标（web vitals）
- 验收：关键操作可追溯，诊断链路闭环

## 五、文件级落地（首批建议）

新增：
- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/config/merge.ts`
- `src/config/loader.ts`
- `src/config/config-provider.tsx`
- `src/config/navigation.ts`
- `src/components/feature-gate.tsx`
- `src/components/permission-gate.tsx`
- `src/hooks/use-data-source.ts`
- `src/providers/realtime-provider.tsx`
- `public/admin-console.config.json`

修改：
- `src/App.tsx`
- `src/layout/sidebar.tsx`
- `src/pages/overview-page.tsx`
- `src/pages/agents-page.tsx`
- `src/pages/settings-page.tsx`

## 六、测试策略

- 单测：配置合并、FeatureGate、PermissionGate
- 契约测试：API 响应结构（建议用 zod schema）
- E2E（Playwright）：
  - 模块开关生效
  - 权限拦截生效
  - 移动端导航与表格策略生效

## 七、可直接开工任务（优先级）

1. 加 zod 并建 `schema.ts`
2. 建 `merge.ts` + `defaults.ts`
3. 建 `config-provider.tsx`，App 接入
4. 建 `feature-gate.tsx`，侧栏动态化
5. 将 query 轮询间隔迁移到配置
6. 建 `permission-gate.tsx`，收口 restart/reload 权限
7. 建 `use-data-source.ts` 统一数据策略
8. 增加 `public/admin-console.config.json`
9. 接入环境变量覆盖
10. 补配置与 gate 的单测

---

如确认，我将直接按 P0→P1 开始编码落地（先提交“配置基础设施 + FeatureGate”两个原子 PR）。
