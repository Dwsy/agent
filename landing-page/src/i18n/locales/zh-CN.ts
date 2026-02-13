export default {
  common: {
    getStarted: "开始使用",
    learnMore: "了解更多",
    features: "核心能力",
    workflow: "工作流",
    techSpecs: "技术规格",
    docs: "文档",
    product: "产品",
    resources: "资源",
    community: "社区",
    extensions: "扩展生态",
    gateway: "多通道网关",
    useCases: "应用场景",
  },
  navbar: {
    links: {
      features: "核心能力",
      workflow: "工作流程",
      extensions: "扩展生态",
      techSpecs: "技术规格",
    },
    cta: "开始使用",
  },
  hero: {
    badge: "自主 AI 编排器 · 企业级",
    title: "40+ 技能 · 30+ 扩展",
    subtitle: "一个 Agent 驾驭全栈开发",
    description:
      "Pi Agent 通过强制 5 阶段工作流、沙箱安全和代码主权协议，编排 Claude / Codex / Gemini 多模型协作。9+ 专用子代理、多通道网关（Telegram / Discord / WebChat），从上下文检索到审计交付，全链路可控。",
    stats: {
      skills: "40+",
      skillsLabel: "专业技能",
      extensions: "30+",
      extensionsLabel: "扩展插件",
      subagents: "9+",
      subagentsLabel: "专用子代理",
      channels: "3",
      channelsLabel: "通信通道",
    },
    ctas: {
      primary: "快速开始",
      secondary: "查看工作流",
    },
  },
  features: {
    label: "核心能力",
    title: "不只是代码补全，是全栈开发编排",
    subtitle: "从语义搜索到架构设计，从安全审计到多 Agent 协作",
    cards: {
      workflow: {
        title: "5 阶段强制工作流",
        description:
          "上下文检索 → 分析规划 → 原型获取 → 编码实施 → 审计交付。每个阶段有明确的工具链和质量门禁，跳不过、绕不开。",
        features: [
          "黄金法则：改代码前必须先检索上下文",
          "外部模型只能输出 Unified Diff，不能直接写文件",
          "Phase 5 强制代码审查，审计不过不交付",
          "L1-L4 复杂度自动路由，防止项目烂尾",
          "复杂任务自动创建 Issue + 拆分子任务",
        ],
      },
      skills: {
        title: "40+ 专业技能",
        description:
          "语义搜索（ace-tool）、AST 重写（ast-grep）、文档管理（workhub）、系统设计（EventStorming）、Office 全家桶、Web 自动化、SVG 生成……覆盖开发全链路。",
      },
      subagents: {
        title: "9+ 专用子代理",
        description:
          "scout（只读侦察）、planner（多代理规划）、worker（通用实现）、reviewer（代码审查）、brainstormer（设计探索）、vision（多模态分析）、security-reviewer（安全审计）、simplifier（代码精简）、system-design（架构设计）。",
      },
      search: {
        title: "语义代码搜索",
        description:
          "用自然语言搜索代码：「认证逻辑在哪？」「支付流程怎么走？」ace-tool 语义理解 + rg 精确匹配 + ast-grep 语法结构，三层搜索互补。",
      },
      gateway: {
        title: "多通道网关",
        description:
          "一个服务同时接入 Telegram / Discord / WebChat。RPC 连接池、会话路由、14 个生命周期 Hook、Cron 定时任务、OpenAI 兼容 API。",
      },
      enterprise: {
        title: "企业级协议",
        description:
          "代码主权：外部 AI 代码仅作参考，必须重构。沙箱安全：外部模型禁止直接写文件。SSOT：每个知识领域只有一个权威文档。文件系统即记忆。",
        features: [
          "代码主权 — 外部代码必须重构为生产级",
          "沙箱安全 — Unified Diff Patch 隔离",
          "SSOT — 单一真实来源",
          "复杂度路由 — L1-L4 自动分级",
        ],
      },
    },
  },
  extensions: {
    label: "扩展生态",
    title: "30+ 扩展，开发者体验拉满",
    subtitle: "交互式 Shell、安全门禁、计划模式、角色记忆、甚至还有游戏",
    cards: {
      interactiveShell: {
        title: "交互式 Shell",
        description:
          "委派任务给 Claude Code / Gemini CLI / Codex，支持 hands-free 监控、dispatch 异步、interactive 交互三种模式。后台会话可随时 attach / dismiss。",
      },
      safetyGates: {
        title: "安全门禁",
        description:
          "拦截 40+ 危险命令模式。rm → trash，git restore . → 逐文件恢复，后台任务强制 tmux。防止一个手滑毁掉整个项目。",
      },
      planMode: {
        title: "计划模式",
        description:
          "只读工具探索代码库，不会意外修改任何文件。提取 TODO、分析架构、制定方案，确认后再执行。Shift+P 一键切换。",
      },
      rolePersna: {
        title: "角色记忆系统",
        description:
          "按项目路径自动切换角色。每个角色独立的 MEMORY.md、SOUL.md、USER.md。跨会话记忆持久化，自动提取学习和偏好。",
      },
      games: {
        title: "内置游戏",
        description:
          "Snake / Tetris / 2048 / Minesweeper / Breakout / Pong — 6 款经典游戏，状态持久化，高分记录。写代码累了？/snake 放松一下。",
      },
      commands: {
        title: "工作流命令",
        description:
          "/scout 快速侦察、/analyze 深度分析、/brainstorm 设计探索、/research 并行研究、/run 单代理执行、/chain 链式执行、/parallel 并行执行。",
      },
    },
  },
  workflow: {
    label: "工作流程",
    title: "强制 5 阶段，不是建议",
    subtitle: "每个阶段都有明确的输入、输出和质量门禁",
    phases: {
      phase1: {
        title: "上下文检索",
        description:
          "黄金法则：改代码前必须先检索。ace-tool 语义搜索 + rg 精确匹配 + ast-grep 语法结构 + fd 文件定位。递归追踪调用链和依赖。",
        tool: "ace / rg / ast-grep / fd",
      },
      phase2: {
        title: "分析与规划",
        description:
          "仅复杂任务触发。将需求分发给 Codex / Gemini 交叉验证，输出分步计划和伪代码。L3+ 任务自动创建 Workhub Issue。",
        tool: "Codex · Gemini · Workhub",
      },
      phase3: {
        title: "原型获取",
        description:
          "外部模型（Gemini）生成 Unified Diff Patch。前端走视觉基线，后端走逻辑原型。严禁直接写入文件 — 这就是沙箱安全。",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "编码实施",
        description:
          "基于原型重构为生产代码。去冗余、提清晰度、最小范围修改。代码自解释，非必要不注释。强制副作用审查。",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "审计与交付",
        description:
          "变更后立即调用 Codex / Gemini 代码审查。审计通过后才交付用户。这不是可选步骤。",
        tool: "强制审计",
      },
    },
    complexity: {
      title: "复杂度自动路由",
      l1: "L1 简单 — 1-2 文件 <50 行，直接执行",
      l2: "L2 中等 — 3-5 文件，加分析阶段",
      l3: "L3 复杂 — 6-10 文件，创建 Issue + 子任务 + tmux",
      l4: "L4 严重 — 10+ 文件，Workhub + ADR + 架构设计",
    },
    commands: {
      title: "快捷命令",
      scout: "快速代码侦察，定位文件和架构",
      analyze: "深度代码分析，架构和依赖",
      brainstorm: "设计探索，结合 workhub + system-design",
      research: "并行代码库研究，多工具协同",
    },
  },
  techSpecs: {
    label: "技术规格",
    title: "基于成熟协议构建",
    subtitle: "多模型编排、专业技能系统、企业级安全协议",
    columns: {
      core: {
        title: "多模型编排",
        items: {
          primary: "Claude — 主对话 + 实现",
          codex: "Codex — 算法分析 + 代码审查",
          gemini: "Gemini — 原型获取 + UI 设计",
          specialized: "Vision / GLM / MiniMax — 专用场景",
        },
      },
      skills: {
        title: "技能系统 (40+)",
        items: {
          search: "ace-tool · rg · fd — 多层搜索",
          ast: "ast-grep — AST 感知重写",
          docs: "workhub · deepwiki · context7 — 文档与知识",
          tools: "office-combo · web-browser · tmux — 工具链",
        },
      },
      subagents: {
        title: "子代理 (9+)",
        items: {
          scout: "scout — 只读侦察",
          worker: "worker · planner — 实现与规划",
          reviewer: "reviewer · security — 审查与安全",
          creative: "brainstormer · vision · simplifier — 创意与优化",
        },
      },
      protocols: {
        title: "企业协议",
        items: {
          ssot: "SSOT — 单一真实来源",
          sandbox: "沙箱安全 — 外部模型隔离",
          sovereignty: "代码主权 — 外部代码必须重构",
          routing: "复杂度路由 — L1-L4 自动分级",
        },
      },
    },
  },
  useCases: {
    label: "应用场景",
    title: "看看实际怎么用",
    subtitle: "从快速侦察到多 Agent 协作",
    cases: {
      scout: {
        title: "秒级代码定位",
        description:
          "输入 /scout 认证流程 → ace-tool 语义搜索 → 完整调用链和文件定位。不需要知道文件名。",
        command: "/scout authentication flow",
      },
      brainstorm: {
        title: "架构设计探索",
        description:
          "输入 /brainstorm 缓存策略 → Workhub 创建 Issue → system-design 生成 EventStorming 图 → 结构化设计目录。",
        command: "/brainstorm caching strategy",
      },
      multiAgent: {
        title: "多 Agent 并行协作",
        description:
          "pi-messenger mesh 组网 → reserve 文件避免冲突 → 多 Agent 并行开发 → 完成后通知 commit hash → 测试通过再合并。",
        command: "pi_messenger({ action: 'reserve' })",
      },
      gateway: {
        title: "Telegram 机器人",
        description:
          "pi-gateway 一键部署 → Telegram Bot 接入 → 支持图片/音频/群聊 → 多账号管理 → Cron 定时任务 → 自主运行。",
        command: "bun run pi-gw",
      },
    },
  },
  cta: {
    title: "准备好了吗？",
    description:
      "40+ 技能、30+ 扩展、9+ 子代理、多通道网关。强制工作流确保代码质量，沙箱安全保护你的项目。",
    primary: "开始使用",
    secondary: "阅读文档",
  },
  footer: {
    description:
      "自主 AI 编排器。40+ 技能、30+ 扩展、9+ 子代理、多通道网关。强制 5 阶段工作流，从上下文检索到审计交付。",
    links: {
      product: "产品",
      resources: "资源",
      community: "社区",
    },
    copyright: "© 2025 Pi Agent. All rights reserved.",
  },
} as const;
