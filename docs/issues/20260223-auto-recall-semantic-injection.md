# Issue: 自动语义召回 - 首消息记忆注入

## Goal
在 `before_agent_start` 阶段，基于用户首消息的语义内容自动搜索并注入相关记忆，减少用户重复提供上下文的成本。

## Background
当前行为：
- `onDemandSearch` 已存在，但仅支持关键词匹配
- High Priority 记忆自动加载（used >= 3）
- 用户需要手动调用 `memory search` 或依赖关键词命中

理想行为：
- 用户说"继续上次那个优化方案"
- Agent 自动召回"React 性能优化"相关记忆
- 无需用户精确描述上下文

## Phases

### Phase 1: 语义召回触发器
- [ ] 改造 `before_agent_start` handler
  ```typescript
  if (isFirstUserMessage && query.length > minLength) {
    const memories = await semanticRecall(query, {
      limit: config.recallLimit,
      minScore: config.recallMinScore
    });
    if (memories.length > 0) {
      event.systemPromptAppend = formatRelevantMemories(memories);
    }
  }
  ```
- [ ] 配置项扩展
  ```jsonc
  "autoRecall": {
    "enabled": true,
    "minQueryLength": 10,
    "limit": 3,
    "minScore": 0.3,
    "includePreferences": true,
    "includeEvents": false
  }
  ```

### Phase 2: 记忆格式化与注入
- [ ] 设计 `<relevant-memories>` 格式
  ```xml
  <relevant-memories score="0.85">
    <memory type="learning" id="abc123" used="5">
      React 组件优化：使用 useMemo 缓存 expensive computation
    </memory>
    <memory type="preference" category="Code">
      用户偏好使用 TypeScript 严格模式
    </memory>
  </relevant-memories>
  ```
- [ ] 实现 `formatRelevantMemories()`
  - 按相关度排序
  - 截断过长文本（保留核心信息）
  - 标注来源（learning/preference/event）

### Phase 3: 召回质量优化
- [ ] 上下文感知去重
  - 避免与 system prompt 中已有信息重复
  - 避免与最近 N 轮对话重复
- [ ] 相关性阈值自适应
  - 查询越长，阈值可适当提高
  - 查询越短，降低阈值确保召回
- [ ] 反馈闭环
  - 用户说"不对，我说的是另一个"
  - 记录负反馈，调整权重

### Phase 4: 与向量搜索集成
- [ ] 依赖 Issue: #向量记忆混合搜索层集成
- [ ] 语义召回使用向量搜索
- [ ] Hybrid 融合确保关键词精确匹配优先

## Acceptance Criteria
- [ ] 首消息自动召回延迟 < 200ms（含 embedding）
- [ ] 召回准确率 > 70%（用户认可为"相关"）
- [ ] 错误召回率 < 10%（用户明确否定）
- [ ] 可配置完全关闭（隐私/性能敏感场景）
- [ ] 召回记忆在上下文中清晰可识别

## Test Cases
```
User: "继续优化那个组件"
→ 应召回: React 性能优化相关记忆

User: "用我上次说的风格"
→ 应召回: Preferences 中 Code/Communication 风格

User: "翻译这段话"
→ 应召回: 翻译相关偏好/工具设置（如有）

User: "你好"
→ 不应召回任何记忆（查询太短）
```

## Technical Considerations
- **Token 预算**: 召回记忆占用 system prompt 空间
  - 建议预留 1000-2000 tokens
  - 超长记忆智能摘要
- **冷启动**: 新角色记忆为空时优雅降级
- **多轮累积**: 第二轮后是否继续召回？
  - 建议：仅首消息，避免过度干扰

## Estimated Effort
- Phase 1: 1-2 天
- Phase 2: 2-3 天
- Phase 3: 2-3 天
- Phase 4: 依赖向量搜索完成
- **总计: 5-8 天（不含向量搜索）**

## Related Issues
- #向量记忆混合搜索层集成（依赖）
- #Headless 模式支持（使用场景相关）
