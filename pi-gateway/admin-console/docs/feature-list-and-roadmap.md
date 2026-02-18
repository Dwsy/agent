# Admin Console：现有功能清单 + 未来展望 + 全功能配置

## 1) 现有功能清单（已落地）

### 1.1 基础架构
- React 19 + TypeScript 5
- Vite 6 + SWC
- React Router 7（多页面壳路由）
- TanStack Query 5（数据拉取、轮询）
- Zustand 5（UI 状态管理）
- TailwindCSS 3（样式系统）
- Axios（网关 API 客户端）
- Recharts（监控趋势图）
- lucide-react（统一图标体系）

### 1.2 页面与模块
- Overview：
  - 指标卡（Gateway、Sessions、RPC、Cron）
  - 趋势图（当前为 scaffold）
  - Recent Sessions 表
- Agents：
  - Session Controller 列表
  - RPC Pool 进程列表
- Plugins：
  - channels/tools/commands/hooks/services 注册快照
- Alerts：
  - cron 任务列表
  - pause/resume 操作
  - 失败任务摘要
- Settings：
  - 配置查看（脱敏配置）
  - reload config
  - restart gateway

### 1.3 已接入 API（真实）
- `/api/health`
- `/api/sessions`
- `/api/pool`
- `/api/plugins`
- `/api/cron/status`
- `/api/cron/jobs`
- `/api/gateway/config`
- `/api/gateway/reload`
- `/api/gateway/restart`

### 1.4 响应式与交互
- 移动端抽屉导航
- 移动端遮罩点击关闭
- 表格横向滚动兜底
- 桌面端侧栏折叠
- 图标化提示（不使用 emoji 充当图标）

---

## 2) 未来展望（Roadmap）

## Phase 1：可用性强化（短期）
1. 全站 Loading / Empty / Error 统一状态组件
2. 操作反馈（toast + mutation 状态）
3. 页面级 skeleton
4. 统一时间格式与本地化

## Phase 2：安全与权限
1. 登录认证（token / session）
2. RBAC（Admin/Operator/Viewer）
3. 路由守卫 + API 权限拦截
4. 审计日志（谁在何时改了什么）

## Phase 3：实时化
1. WebSocket/SSE 状态推送
2. 任务执行流实时面板
3. 告警实时订阅 + 可确认（ack）
4. 会话状态变化实时刷新（降低轮询）

## Phase 4：全功能控制台
1. Session：创建/删除/切换角色/模型
2. Cron：新增/编辑/复制/禁用/历史运行追踪
3. Plugin：启停/配置编辑/健康探针
4. Gateway：配置差异对比 + 一键回滚
5. 日志中心：检索、过滤、下载、脱敏

## Phase 5：工程化
1. Playwright E2E（核心路径）
2. 单元测试（API 适配层 + store + 组件）
3. Storybook 设计系统化
4. CI 质量门禁（lint/typecheck/test/build）

---

## 3) 全功能配置（目标结构）

建议将配置拆成 5 层：

1. `app`：品牌、环境、语言、主题
2. `auth`：登录方式、token、会话策略
3. `api`：网关地址、超时、重试、WS 地址
4. `features`：功能开关（按模块启停）
5. `permissions`：角色与能力矩阵

详见：`docs/full-config-template.jsonc`
