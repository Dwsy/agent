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
    badge: "持续进化的 Pi Runtime",
    title: {
      part1: "把 AI 编程变成",
      accent: "可编程系统",
      part2: ""
    },
    description: "Pi 不只是聊天窗口：它把代码检索、上下文 checkpoint、角色记忆、原生 GAPP 界面、Provider 可观测性和 Gateway 编排放进同一个可扩展运行时。",
    cta: {
      primary: "开始使用",
      secondary: "阅读文档"
    },
    stats: {
      commands: "持久上下文",
      extensions: "原生生成式 UI",
      productivity: "端到端可观测"
    }
  },
  features: {
    label: "运行时能力",
    title: "从上下文到交付，一条可观察链路",
    subtitle: "检索真实代码路径，保存可恢复上下文，用扩展和 GAPP 增强交互，并把验证证据留在同一会话里。",
    workflow: {
      title: "证据驱动工作流",
      desc: "先定位真实实现，再形成计划、执行最小修改、运行验证并交付证据；流程随任务复杂度伸缩，而不是固定阶段表演。",
      features: [
        "先读真实调用链，再动代码",
        "checkpoint / compact 保留关键上下文",
        "测试、diff、状态一起验证",
        "工具与扩展按任务动态组合"
      ],
      metrics: {
        tasks: "上下文标记",
        success: "工作树状态",
        active: "Provider 追踪"
      }
    },
    skills: {
      title: "按需技能与工具",
      desc: "语义检索、AST、浏览器、设计、诊断、文档与自动化能力按任务加载。",
      tags: ["ace-tool", "ast-grep", "codemap", "web-browser", "diagnose"]
    },
    subagents: {
      title: "角色与长期记忆",
      desc: "角色配置、记忆检索与 viewer 贯穿会话，而不是每次从零开始。",
      agents: ["角色", "记忆", "召回", "整理", "导出", "Viewer", "标签", "向量", "场景", "提示", "服务", "适配"]
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
    title: "把 Pi 运行时分发到更多入口",
    subtitle: "Gateway 用 RPC worker pool、会话路由和插件管线把同一套 Pi 能力接到 Web、API 与消息通道，同时保持 worker 启动可控。",
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
    title: "证据驱动的工程闭环",
    subtitle: "不是固定五阶段，而是围绕真实代码、可恢复上下文和可复现验证形成闭环。",
    phases: [
      { num: "01", title: "定位", desc: "语义检索、精确匹配、调用链" },
      { num: "02", title: "建模", desc: "理解约束、选择最小改动面" },
      { num: "03", title: "保存", desc: "checkpoint、tag、compact 关键上下文" },
      { num: "04", title: "执行", desc: "精准编辑、扩展工具、GAPP 交互" },
      { num: "05", title: "验证", desc: "测试、diff、状态与可观测证据" }
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
    title: "不把 Agent 当一次性聊天",
    subtitle: "Pi 的差异在运行时：上下文能恢复、能力能扩展、行为能观察、界面能生成。",
    headers: {
      feature: "能力",
      pi: "Pi Agent",
      others: "典型工具"
    },
    rows: [
      { feature: "上下文生命周期", pi: "checkpoint + tag + compact", others: "会话即上下文" },
      { feature: "代码定位", pi: "语义 + 精确 + AST", others: "基础搜索" },
      { feature: "交互表面", pi: "TUI + Web + GAPP", others: "单一聊天界面" },
      { feature: "长期记忆", pi: "角色记忆 + 检索 + viewer", others: "临时提示词" },
      { feature: "可观测与分发", pi: "Provider Trace + Gateway/RPC", others: "单一接口" }
    ]
  },
  cta: {
    title: "把你的 Pi 变成自己的工程系统",
    subtitle: "从一个可工作的 coding agent 开始，再按项目需要接入记忆、GAPP、可观测性与网关。",
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
