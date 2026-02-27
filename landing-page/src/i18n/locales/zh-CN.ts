export default {
  common: {
    getStarted: "开始使用",
    learnMore: "了解更多",
    viewOnGithub: "GitHub 仓库",
  },
  navbar: {
    links: {
      features: "功能",
      gateway: "网关",
      workflow: "工作流",
      extensions: "扩展",
      comparison: "对比",
    },
    cta: "开始使用",
  },
  hero: {
    badge: "v2.0 现已发布",
    title: {
      part1: "真正可用的",
      accent: "AI 工程师",
      part2: ""
    },
    description: "不再当 AI 的保姆。Pi 处理上下文检索、并行子代理、安全审计和多通道部署 — 你专注于架构，而非提示词工程。",
    cta: {
      primary: "开始使用",
      secondary: "阅读文档"
    },
    stats: {
      commands: "内置命令",
      extensions: "扩展插件",
      productivity: "效率提升"
    }
  },
  features: {
    label: "核心架构",
    title: "编排，不只是对话",
    subtitle: "从语义代码搜索到多代理协作，从安全审计到生产部署。",
    workflow: {
      title: "五阶段工作流",
      desc: "强制管线：上下文检索 → 分析 → 原型 → 实施 → 审计。没有捷径，没有幻觉编辑。",
      features: [
        "黄金法则：先检索再修改",
        "Unified Diff 隔离",
        "强制交付前审查",
        "L1-L4 复杂度路由"
      ],
      metrics: {
        tasks: "任务",
        success: "成功率",
        active: "活跃"
      }
    },
    skills: {
      title: "42 技能",
      desc: "语义搜索、AST 操作、系统设计、Office 自动化。",
      tags: ["ace-tool", "ast-grep", "codemap", "web-fetch", "+38 更多"]
    },
    subagents: {
      title: "25+ 代理",
      desc: "通过 Crew 协议协调的专用代理。",
      agents: ["侦察", "规划", "执行", "审查", "视觉", "研究", "API测试", "安全", "简化", "代码图", "头脑风暴", "系统设计"]
    },
    search: {
      title: "代码搜索",
      desc: "自然语言到精确位置。三层搜索，零遗漏。",
      example: "pi /search \"认证中间件\""
    },
    gateway: {
      title: "多通道网关",
      desc: "一个服务支持 Telegram、Discord、WebChat、OpenAI API。",
      code: "await gateway.route({ channel: 'telegram', session: uuid() });"
    }
  },
  gateway: {
    label: "网关",
    title: "进程编排器",
    subtitle: "管理 AI 代理池并路由消息。通道无关、插件优先、纵深安全。",
    layers: {
      channels: { title: "通道", desc: "Telegram · Discord · WebChat · API" },
      pipeline: { title: "管线", desc: "分发 → 去重 → 解析 → 处理" },
      plugins: { title: "插件", desc: "16 钩子 · 注册表 · 冲突检测" },
      runtime: { title: "运行时", desc: "RPC 池 · 路由 · 定时 · 事件" },
      security: { title: "安全", desc: "认证 · 执行守卫 · SSRF · 白名单" }
    }
  },
  workflow: {
    label: "工作流",
    title: "五阶段强制管线",
    subtitle: "每个任务都经过检索、分析、原型、实施和审计。质量源于设计。",
    phases: [
      { num: "01", title: "检索", desc: "语义搜索、精确匹配、语法结构" },
      { num: "02", title: "分析", desc: "侦察派发、策略选择" },
      { num: "03", title: "原型", desc: "外部模型 diff、内部重构" },
      { num: "04", title: "实施", desc: "精准编辑、依赖检查" },
      { num: "05", title: "审计", desc: "Codex 审查、测试验证" }
    ]
  },
  extensions: {
    label: "扩展",
    title: "无限扩展",
    subtitle: "从 CLI 命令到 TUI 组件，从网关插件到定时任务。",
    categories: {
      commands: { title: "命令", desc: "斜杠命令和快捷键" },
      tools: { title: "工具", desc: "可复用能力" },
      gateway: { title: "网关", desc: "通道集成" }
    }
  },
  comparison: {
    label: "对比",
    title: "不是又一个包装器",
    subtitle: "为严肃工程而生，非玩具项目。",
    headers: {
      feature: "能力",
      pi: "Pi Agent",
      others: "典型工具"
    },
    rows: [
      { feature: "多阶段工作流", pi: "5 个强制阶段", others: "单步执行" },
      { feature: "上下文检索", pi: "语义 + 精确 + AST", others: "基础搜索" },
      { feature: "安全模型", pi: "五层防御", others: "最小化" },
      { feature: "子代理系统", pi: "Crew 网格协议", others: "无" },
      { feature: "网关", pi: "多通道 + RPC", others: "单一接口" }
    ]
  },
  cta: {
    title: "准备更快交付？",
    subtitle: "加入那些不再当 AI 保姆、开始真正架构的工程师。",
    button: "开始使用"
  },
  footer: {
    tagline: "工程级 AI 编排。",
    links: {
      docs: "文档",
      github: "GitHub",
      discord: "Discord"
    },
    copyright: "精准构建。"
  }
};
