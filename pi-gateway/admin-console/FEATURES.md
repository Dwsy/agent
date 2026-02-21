# Admin Console 功能规划

## 当前状态 (v0.1)

✅ 已完成：
- 基础框架（路由、布局、导航）
- Settings 页面（Gateway 配置查看、Reload/Restart、API Token 配置）
- Plugins 页面（注册表快照）
- Observability（事件/指标追踪）
- CORS 支持

---

## 待开发功能（按优先级）

### P0 - 核心功能

#### 1. Dashboard / Overview 增强
**API**: `/api/health`, `/api/metrics`, `/api/pool`, `/api/sessions`

- [ ] 实时健康状态卡片（状态、运行时长、通道）
- [ ] RPC Pool 使用率图表（活跃/空闲/等待）
- [ ] 消息队列状态（待处理、失败率）
- [ ] 会话数量趋势图
- [ ] 通道状态指示器（Telegram/WebChat 在线状态）

#### 2. Sessions 管理
**API**: `/api/sessions`, `/api/sessions/:key`, `/api/transcripts`, `/api/session/reset`

- [ ] 会话列表（表格/卡片视图）
- [ ] 会话详情（角色、消息数、最后活跃、RPC 进程）
- [ ] 会话搜索/筛选（按角色、状态）
- [ ] 查看会话记录（transcript）
- [ ] 重置会话（/api/session/reset）
- [ ] 切换模型（/api/session/model）
- [ ] 调整思考级别（/api/session/think）

#### 3. Cron 任务管理
**API**: `/api/cron/jobs`, `/api/cron/status`, `/api/cron/jobs/:id` (pause/resume/run)

- [ ] Cron 任务列表
- [ ] 任务状态（active/paused/disabled）
- [ ] 执行历史（最后运行时间、状态、耗时）
- [ ] 暂停/恢复/手动触发
- [ ] 创建新任务（如果 API 支持）

---

### P1 - 运维功能

#### 4. Gateway 配置管理
**API**: `/api/gateway/config`, `/api/gateway/reload`

- [ ] 配置查看器（JSON/表单视图切换）
- [ ] 配置编辑（如果支持写回）
- [ ] 配置历史/版本对比
- [ ] 一键重载配置

#### 5. Pool & Queue 监控
**API**: `/api/pool`, `/api/metrics`

- [ ] RPC 进程池详情（每个进程的状态、会话、最后活跃）
- [ ] 队列深度监控
- [ ] 失败率告警
- [ ] 自动扩缩容建议

#### 6. Observability 仪表盘
**API**: `/api/observability/events`, `/api/observability/summary`

- [ ] 事件时间线（按级别/类别筛选）
- [ ] 指标趋势图（请求数、错误率、响应时间）
- [ ] 告警规则配置
- [ ] 日志导出

---

### P2 - 高级功能

#### 7. 消息发送测试
**API**: `/api/message/send`, `/api/media/send`

- [ ] 消息发送表单（选择通道、会话、内容）
- [ ] 媒体文件上传发送
- [ ] 发送历史记录

#### 8. Tools 执行器
**API**: `/api/tools`, `/api/tools/call`

- [ ] 可用工具列表
- [ ] 工具参数表单
- [ ] 执行结果展示
- [ ] 工具调用历史

#### 9. Memory 管理
**API**: `/api/memory/search`, `/api/memory/stats`, `/api/memory/roles`

- [ ] Memory 搜索界面
- [ ] 各角色 Memory 统计
- [ ] Memory 清理/导出

#### 10. WebSocket 调试
**API**: WebSocket `/ws`

- [ ] WS 连接状态
- [ ] 实时事件订阅
- [ ] 手动发送 WS 消息
- [ ] 消息日志

---

### P3 - 系统管理

#### 11. 用户与权限
- [ ] 登录/登出
- [ ] 角色管理（admin/operator/viewer）
- [ ] Token 管理

#### 12. 系统设置
- [ ] 主题切换（light/dark）
- [ ] 刷新间隔配置
- [ ] 通知设置

---

## 技术债

- [ ] 统一错误处理（ErrorBoundary）
- [ ] 统一加载状态（Skeleton/Spinner）
- [ ] 统一空状态（EmptyState 组件）
- [ ] 响应式优化（移动端适配）
- [ ] 性能优化（虚拟滚动、分页）
- [ ] 测试覆盖（单元测试 + E2E）

---

## 快速开始建议

**第一阶段（1-2 天）：**
1. Dashboard 增强（健康状态 + Pool 图表）
2. Sessions 列表和详情
3. Cron 任务管理

**第二阶段（2-3 天）：**
1. Observability 仪表盘
2. Pool & Queue 监控
3. Gateway 配置管理

**第三阶段（3-5 天）：**
1. 消息发送测试
2. Tools 执行器
3. Memory 管理

---

## 设计原则

1. **数据驱动**：所有数据来自 API，不硬编码
2. **实时更新**：轮询 + WebSocket 推送
3. **操作可逆**：危险操作需要确认，支持回滚
4. **错误友好**：清晰的错误提示和恢复建议
5. **性能优先**：懒加载、虚拟滚动、合理缓存

---

*最后更新：2026-02-21*
