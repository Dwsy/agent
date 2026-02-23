# Issue: 性能监控与记忆健康度仪表板

## Goal
建立 role-persona 的性能监控体系和记忆健康度评估，帮助用户了解记忆系统运行状况，及时发现和解决问题。

## Background
当前痛点：
- 记忆提取是否成功？用户无感知
- 搜索质量如何？没有度量
- 记忆库多大？是否需要整理？
- 高频使用记忆 vs 僵尸记忆，无法区分

目标：让用户和开发者能直观了解记忆系统的"健康状况"

## Phases

### Phase 1: 运行时指标采集
- [ ] 新增 `memory-metrics.ts` 模块
  ```typescript
  interface MemoryMetrics {
    // 提取指标
    extractionsTotal: number;
    extractionsSuccess: number;
    extractionsByTrigger: { keyword: number; batch: number; interval: number };
    avgExtractionTimeMs: number;
    
    // 搜索指标
    searchesTotal: number;
    avgResultsPerSearch: number;
    searchResultClickRate: number; // 用户是否采纳搜索结果
    
    // 存储指标
    learningsCount: number;
    preferencesCount: number;
    dailyFilesCount: number;
    memorySizeBytes: number;
    
    // 质量指标
    duplicateRate: number; // 重复提取率
    highPriorityRatio: number; // used >= 3 占比
  }
  ```
- [ ] 指标持久化
  - 存储在 `~/.pi/roles/.metrics/` 目录
  - 按日/周/月聚合

### Phase 2: 记忆健康度评估
- [ ] 健康度评分算法
  ```typescript
  interface HealthScore {
    overall: number; // 0-100
    dimensions: {
      freshness: number;      // 最近是否有新记忆
      diversity: number;      // 类别分布是否均衡
      quality: number;        // 去重后/去重前比例
      utilization: number;    // 记忆被使用频率
    };
    warnings: string[];
    suggestions: string[];
  }
  ```
- [ ] 健康度检查项
  - [ ] 僵尸记忆检测（90天未使用）
  - [ ] 重复记忆检测（Jaccard > 0.9）
  - [ ] 类别失衡检测（某类别占比 > 50%）
  - [ ] 记忆膨胀检测（总大小 > 10MB）
  - [ ] 提取失败率检测（失败率 > 20%）

### Phase 3: 命令行报告
- [ ] `/memory-stats` 命令
  ```
  📊 Memory Stats for role "zero"
  
  Storage:
  - Learnings: 156 (High: 23, Normal: 45, New: 88)
  - Preferences: 42 (Code: 15, Tools: 12, ...)
  - Daily files: 23 (last 30 days)
  - Total size: 2.3 MB
  
  Activity (last 7 days):
  - Extractions: 12 successful, 2 failed
  - Searches: 45, Avg results: 3.2
  - Reinforces: 8 (memory strengthened)
  
  Health Score: 78/100
  ⚠️ Warnings:
  - 34 zombie memories (>90 days unused)
  - High "New" ratio, consider /memory-tidy
  
  💡 Suggestions:
  - Run /memory-tidy to consolidate
  - Review zombie memories: /memory-zombies
  ```
- [ ] `/memory-health` 详细报告
  - 各维度得分
  - 具体问题列表
  - 一键修复建议

### Phase 4: TUI 仪表板
- [ ] 新增 `/memory-dashboard` 命令
  - 实时更新的 Overlay
  - 图表：记忆增长曲线、类别分布饼图
  - 搜索热力图（什么时间搜索最多）
  - 最近活动流
- [ ] 可视化组件
  - 使用 Unicode 块字符绘制简单图表
  - 颜色编码健康状态（绿/黄/红）

### Phase 5: 异常告警
- [ ] 智能告警规则
  ```jsonc
  "alerts": {
    "extractionFailureRate": { "threshold": 0.2, "window": "1h" },
    "memoryGrowth": { "threshold": "100KB/day", "window": "7d" },
    "zombieRatio": { "threshold": 0.3 },
    "diskFull": { "threshold": "90%" }
  }
  ```
- [ ] 告警渠道
  - 会话内通知（notify）
  - 日志记录
  - （可选）Webhook/邮件

## Acceptance Criteria
- [ ] 用户可通过 `/memory-stats` 了解记忆概况
- [ ] 健康度评分准确反映记忆质量
- [ ] 僵尸记忆检测准确率 > 80%
- [ ] 告警触发时用户能及时感知
- [ ] 性能开销 < 5%（不显著影响响应速度）

## Dashboard Mockup
```
┌─────────────────────────────────────────┐
│  📊 Role-Persona Dashboard              │
├─────────────────────────────────────────┤
│  Health: ████████░░ 78/100              │
│  ├─ Freshness  ████████░░ 82            │
│  ├─ Diversity  ██████░░░░ 65            │
│  ├─ Quality    █████████░ 88            │
│  └─ Utilization ███████░░ 75            │
│                                         │
│  Storage Growth (30d)                   │
│  ▁▂▃▄▅▆▇█  +2.3 MB                      │
│                                         │
│  Category Distribution                  │
│  Code ████████████████████ 45%          │
│  Tools ██████████ 22%                   │
│  ...                                    │
│                                         │
│  ⚠️ 34 zombies  [Review] [Clean]        │
└─────────────────────────────────────────┘
```

## Technical Notes
- 指标采集异步进行，不阻塞主流程
- 使用轻量级存储（JSON 文件或 SQLite）
- TUI 图表可用 `cliui` 或纯字符串拼接

## Estimated Effort
- Phase 1: 2-3 天
- Phase 2: 3-4 天
- Phase 3: 2-3 天
- Phase 4: 3-5 天
- Phase 5: 2-3 天
- **总计: 12-18 天**

## Related
- 可与 #记忆同步与多设备一致性 结合
  - 同步时对比设备间健康度差异
