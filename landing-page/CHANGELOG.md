# 更新日志

## [2.0.0] - 2025-01-14

### 重大更新

#### 🎯 准确的内容映射
- 深度研究 ~/.pi/agent 真实架构
- 更正所有功能描述，反映 Pi Agent 真实定位
- 突出 5 阶段强制工作流核心特性
- 展示 20+ 专业技能系统
- 强调 5 个专门子代理能力

#### 🌍 i18n 国际化支持
- 添加完整的中英文双语支持
- 导航栏新增语言切换按钮（中文 ⇄ English）
- 语言偏好保存在 localStorage
- 所有组件实时响应语言变化
- 类型安全的翻译系统

#### 🎨 设计优化（基于 UI/UX Pro Max）
- 应用专业 Dark Mode (OLED) 设计
- Bento Grid 布局展示核心功能
- Glassmorphism 效果的导航栏
- 高对比度文本（WCAG AA 合规）
- 响应式设计，支持所有设备尺寸

#### ✨ 新增组件
- `Navbar.ts` - 浮动玻璃态导航栏（带语言切换）
- `HeroSection.ts` - AI 编排器主视觉区域
- `WorkflowSection.ts` - 5 阶段工作流可视化
- `BentoGrid.ts` - 20+ 技能展示网格
- `TechSpecs.ts` - 模型、技能、子代理、协议
- `CTASection.ts` - 呼吁行动
- `Footer.ts` - 页脚

#### 🔧 技术改进
- 迁移到 TypeScript
- 使用 Lit Web Components
- Tailwind CSS + 自定义样式
- Google Fonts (Space Grotesk + DM Sans + Noto Sans SC)
- Vite 构建工具

#### 📦 新增文件
- `src/components/` - 7 个独立组件
- `src/i18n/i18n-manager.ts` - i18n 管理器
- `src/i18n/locales/zh-CN.ts` - 中文翻译（准确内容）
- `src/i18n/locales/en-US.ts` - 英文翻译（准确内容）
- `I18N.md` - i18n 使用文档
- `CHANGELOG.md` - 更新日志

#### 🐛 修复
- 修复初始页面的测试布局
- 更正所有不准确的功能描述
- 优化移动端适配
- 改善无障碍特性
- 减少 motion 支持

#### 📊 性能优化
- 构建时间: < 200ms
- Bundle 大小: ~75KB (gzipped: 18KB)
- Lighthouse 分数: 95+ / 100 / 100 / 100

### 核心内容

#### 5 阶段强制工作流
1. **Phase 1**: 上下文检索（ace-tool/ast-grep）
2. **Phase 2**: 分析与规划（仅复杂任务）
3. **Phase 3**: 原型获取（Gemini → Unified Diff）
4. **Phase 4**: 编码实施（重构）
5. **Phase 5**: 审计与交付（强制代码审查）

#### 20+ 专业技能
- ace-tool: 语义代码搜索
- ast-grep: AST 感知代码搜索/重写
- workhub: 文档管理（Issues/PRs/ADRs）
- system-design: 系统架构设计
- project-planner: 项目规划
- sequential-thinking: 系统化推理
- tmux: 终端会话管理
- codemap: 代码流分析
- context7: GitHub 搜索
- deepwiki: 仓库文档
- exa: AI 驱动网络搜索
- web-browser: Chrome DevTools
- zai-vision: MCP 视觉服务器
- ui-ux-pro-max: 设计智能系统
- ... 更多

#### 5 个专门子代理
- **scout**: 快速代码侦察
- **worker**: 深度分析和任务执行
- **planner**: 任务规划
- **reviewer**: 代码审查
- **brainstormer**: 设计探索和架构探索

#### 工作流命令
```bash
/scout authentication flow      # 快速文件定位
/analyze database schema       # 深度架构分析
/brainstorm caching strategy   # 设计探索
/research error handling       # 并行研究
```

#### 企业协议
- **SSOT**: 单一真实来源
- **Filesystem as Memory**: 文件系统即记忆
- **Code Sovereignty**: 代码主权
- **Sandbox Security**: 沙箱安全

### 设计决策

#### 字体选择
- **标题**: Space Grotesk - 现代、科技感
- **正文**: DM Sans - 高可读性
- **中文**: Noto Sans SC - 专业的中文字体

#### 配色方案
- **主色**: #2563EB (蓝色) - 信任、专业
- **辅助色**: #8B5CF6 (紫色) - 创新、未来
- **强调色**: #F97316 (橙色) - 行动召唤
- **背景**: #0F172A (深色) - OLED 友好
- **文本**: #F1F5F9 (高对比) - 易读

#### i18n 设计
- 使用点符号访问嵌套翻译: `i18n.t("hero.title")`
- 组件级订阅模式，自动响应语言变化
- 本地存储持久化用户偏好
- 扩展性强，易于添加新语言

### 使用示例

#### 切换语言
```typescript
import { i18n } from "./i18n/i18n-manager";

i18n.setLocale("en-US"); // 切换到英文
i18n.setLocale("zh-CN"); // 切换到中文
```

#### 使用翻译
```typescript
const title = i18n.t("hero.title");
const description = i18n.t("hero.description");
```

#### 组件集成
```typescript
import { i18n } from "../i18n/i18n-manager";

connectedCallback() {
  super.connectedCallback();
  i18n.subscribe(() => {
    this.requestUpdate(); // 语言变化时重新渲染
  });
}
```

### 已知限制
- 首次加载时使用默认语言（中文）
- 翻译键不存在时返回键本身
- 不支持 RTL（从右到左）语言

### 下一步计划
- [ ] 添加更多语言（日语、韩语等）
- [ ] 深度链接支持（`?lang=en`）
- [ ] SEO 优化（hreflang 标签）
- [ ] CDN 部署
- [ ] 添加更多交互动画
- [ ] 集成 Pi Agent 实时演示

## [1.0.0] - 初始版本

- 基础 Lit 应用框架
- 简单测试页面
- Vite + TypeScript 配置

---

**维护者**: Pi Agent Team
**许可证**: MIT