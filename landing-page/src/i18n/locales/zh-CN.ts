export default {
  common: {
    getStarted: "开始使用",
    learnMore: "了解更多",
    viewOnGithub: "GitHub 仓库",
  },
  navbar: {
    links: {
      features: "核心能力",
      gateway: "网关",
      workflow: "工作流",
      extensions: "扩展",
      comparison: "对比",
    },
    cta: "开始使用",
  },
  hero: {
    badge: "自主 AI 编排器",
    title: "一个 Agent\n驾驭全栈开发",
    subtitle: "通过强制 5 阶段工作流编排 Claude / Codex / Gemini，沙箱安全、代码主权、多通道网关。",
    stats: {
      skills: "42",
      skillsLabel: "专业技能",
      extensions: "26",
      extensionsLabel: "扩展插件",
      subagents: "25+",
      subagentsLabel: "专用子代理",
      gateway: "65+",
      gatewayLabel: "网关模块",
    },
    ctas: {
      primary: "快速开始",
      secondary: "GitHub 仓库",
    },
    terminal: {
      line1: "$ pi \"重构认证模块\"",
      line2: "⟐ Phase 1: 上下文检索",
      line3: "  ├─ ace search \"auth logic\" → 12 files",
      line4: "  └─ rg \"class Auth\" → src/core/auth.ts",
      line5: "⟐ Phase 2: 分析与规划",
      line6: "  └─ 并行派发 scout × 3 ...",
      line7: "⟐ Phase 4: 编码实施",
      line8: "  └─ 修改 4 个文件，127 行变更",
      line9: "⟐ Phase 5: 审计 — ✓ 全部通过",
      line10: "✓ 交付完成。4 文件，0 问题。",
    },
  },
  features: {
    label: "核心能力",
    title: "不只是代码补全",
    subtitle: "从语义搜索到架构设计，从安全审计到多 Agent 协作的全栈编排",
    cards: {
      workflow: {
        title: "5 阶段强制工作流",
        description: "上下文检索 → 分析规划 → 原型获取 → 编码实施 → 审计交付。每个阶段有明确的工具链和质量门禁，跳不过、绕不开。",
        features: [
          "黄金法则：改代码前必须先检索上下文",
          "外部模型只能输出 Unified Diff",
          "Phase 5 强制代码审查后才交付",
          "L1-L4 复杂度自动路由",
        ],
      },
      skills: {
        title: "42 项专业技能",
        description: "语义搜索（ace-tool）、AST 重写（ast-grep）、系统设计（EventStorming）、Office 全家桶、Web 自动化、SVG 生成 — 覆盖 9 大类别的完整开发管线。",
      },
      subagents: {
        title: "25+ 专用子代理",
        description: "scout、planner、worker、reviewer、brainstormer、vision、security-reviewer、simplifier、system-design、codemap、researcher、api-tester — 加上完整的 Crew 多代理编排系统。",
      },
      search: {
        title: "语义代码搜索",
        description: "「认证逻辑在哪？」— ace-tool 语义理解 + rg 精确匹配 + ast-grep 语法结构。三层搜索互补，自然语言到代码定位。",
      },
      gateway: {
        title: "多通道网关",
        description: "65+ 模块。RPC 进程池、会话路由、16 个生命周期 Hook、Cron 定时任务、OpenAI 兼容 API。一个服务同时接入 Telegram / Discord / WebChat。",
      },
      enterprise: {
        title: "企业级安全",
        description: "5 层安全体系：Auth（时序安全）、ExecGuard（可执行白名单）、SSRF Guard（DNS 重绑定防御）、Allowlist（配对审批）、Media Security（HMAC 令牌）。",
        features: [
          "代码主权 — 外部代码必须重构为生产级",
          "沙箱安全 — Unified Diff 隔离",
          "SSOT — 单一真实来源",
          "默认安全 — Fail-Closed 设计",
        ],
      },
    },
  },
  gateway: {
    label: "网关架构",
    title: "不是 Bot 框架 — 是进程编排器",
    subtitle: "网关管理 AI 代理进程池并路由消息。通道无关、插件优先、纵深安全。",
    layers: {
      channels: { title: "通道层", desc: "Telegram · Discord · WebChat · OpenAI API" },
      pipeline: { title: "管线层", desc: "分发 → 去重 → 模式解析 → 入队 → 处理" },
      plugins: { title: "插件层", desc: "加载器 · Hooks (16) · 注册表 · 冲突检测" },
      runtime: { title: "运行时", desc: "RPC 池 · 会话路由 · Cron · 系统事件" },
      security: { title: "安全层", desc: "Auth · ExecGuard · SSRF · Allowlist · Media" },
    },
    stats: {
      modules: { value: "65+", label: "源码模块" },
      hooks: { value: "16", label: "生命周期 Hook" },
      apis: { value: "30+", label: "API 端点" },
      security: { value: "5", label: "安全层" },
    },
    highlights: [
      "能力感知进程池 — 按签名匹配复用",
      "三模式消息并发：steer / follow-up / interrupt",
      "JSONL 检测跨重启会话恢复",
      "模型健康故障转移与自动冷却",
      "插件优先：Telegram / Discord / WebChat 都是插件",
      "OpenAI 兼容 /v1/chat/completions 端点",
    ],
  },
  workflow: {
    label: "工作流程",
    title: "强制 5 阶段",
    subtitle: "每个阶段都有明确的输入、输出和质量门禁",
    phases: {
      phase1: {
        title: "上下文检索",
        description: "黄金法则：改代码前必须先检索。ace-tool 语义搜索 + rg 精确匹配 + ast-grep 语法结构 + fd 文件定位。",
        tool: "ace / rg / ast-grep / fd",
      },
      phase2: {
        title: "分析与规划",
        description: "仅复杂任务触发。分发给 Codex / Gemini 交叉验证，输出分步计划。L3+ 自动创建 Workhub Issue。",
        tool: "Codex · Gemini · Workhub",
      },
      phase3: {
        title: "原型获取",
        description: "外部模型生成 Unified Diff Patch。前端走视觉基线，后端走逻辑原型。严禁直接写文件。",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "编码实施",
        description: "基于原型重构为生产代码。去冗余、最小范围、代码自解释。强制副作用审查。",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "审计与交付",
        description: "变更后立即调用代码审查。审计通过后才交付用户。这不是可选步骤。",
        tool: "强制审计",
      },
    },
    complexity: {
      title: "复杂度自动路由",
      l1: { label: "L1 简单", desc: "1-2 文件 <50 行 → 直接执行" },
      l2: { label: "L2 中等", desc: "3-5 文件 → 加分析阶段" },
      l3: { label: "L3 复杂", desc: "6-10 文件 → Issue + 子任务 + tmux" },
      l4: { label: "L4 严重", desc: "10+ 文件 → Workhub + ADR + 架构设计" },
    },
  },
  extensions: {
    label: "扩展生态",
    title: "26 个扩展，开发体验拉满",
    subtitle: "交互式 Shell、安全门禁、计划模式、角色记忆、自主循环，还有游戏",
    cards: {
      subagentOrch: {
        title: "子代理编排",
        description: "单任务 / 链式 / 并行执行。异步后台任务。代理 CRUD 管理 TUI。可视化进度组件。",
        tag: "多代理",
      },
      interactiveShell: {
        title: "交互式 Shell",
        description: "PTY 覆盖层运行 Claude Code / Gemini CLI / Codex。支持 hands-free、dispatch、interactive 三种模式。",
        tag: "委派",
      },
      loop: {
        title: "自主循环",
        description: "循环运行直到测试通过、自定义条件满足或自行判断。上下文压缩感知。",
        tag: "自动化",
      },
      rolePersona: {
        title: "角色记忆系统",
        description: "按项目路径自动切换角色。每个角色独立 MEMORY.md / SOUL.md / USER.md。SM-2 间隔重复整合。",
        tag: "记忆",
      },
      planMode: {
        title: "计划模式",
        description: "只读探索。提取 TODO、分析架构、制定方案。确认后再执行。Shift+P 切换。",
        tag: "安全",
      },
      safetyGates: {
        title: "安全门禁",
        description: "拦截 40+ 危险模式。rm → trash 带 30 秒倒计时。git restore . → 逐文件恢复。",
        tag: "安全",
      },
      outputStyles: {
        title: "输出风格",
        description: "可切换 AI 人格：解释型、学习型、编码型、结构化思维。项目或全局作用域。",
        tag: "体验",
      },
      games: {
        title: "内置游戏",
        description: "Snake / Tetris / 2048 / Minesweeper / Breakout / Pong。状态持久化，高分记录。",
        tag: "娱乐",
      },
    },
  },
  comparison: {
    label: "对比",
    title: "Pi Agent 的差异化",
    subtitle: "与其他 AI 编码工具的功能对比",
    features: {
      multiModel: "多模型编排",
      multiAgent: "多代理系统",
      skillSystem: "技能系统",
      extensionSystem: "扩展系统",
      gateway: "多通道网关",
      safetyGates: "安全门禁",
      memorySystem: "记忆系统",
      mandatoryWorkflow: "强制工作流",
      openSource: "开源",
    },
    tools: {
      pi: "Pi Agent",
      claudeCode: "Claude Code",
      cursor: "Cursor",
      aider: "Aider",
    },
    values: {
      pi:         [true, true, true, true, true, true, true, true, true],
      claudeCode: [false, false, false, true, false, false, false, false, false],
      cursor:     [true, false, false, true, false, false, false, false, false],
      aider:      [true, false, false, false, false, false, false, false, true],
    },
  },
  useCases: {
    label: "应用场景",
    title: "实际怎么用",
    subtitle: "从快速侦察到多 Agent 协作",
    cases: {
      scout: {
        title: "秒级代码定位",
        description: "输入 /scout auth flow → ace-tool 语义搜索 → 完整调用链和文件定位。不需要知道文件名。",
        command: "/scout authentication flow",
      },
      crew: {
        title: "多 Agent 协作",
        description: "pi_messenger mesh 组网 → PRD 规划 → 并行 worker 带文件锁 → reviewer 验证 → 自动同步下游规格。",
        command: "pi_messenger({ action: 'work', autonomous: true })",
      },
      gateway: {
        title: "分钟级部署 Bot",
        description: "pi-gateway 一键部署 → Telegram Bot 接入 → 图片/音频/群聊 → Cron 定时任务 → 自主运行。",
        command: "bun run pi-gw start",
      },
      selfImprove: {
        title: "自我进化",
        description: "evolution 技能挂钩生命周期 → 检测改进机会 → 自动纠错 → 验证自身技能 → 从经验中学习。",
        command: "evolution: auto-detect + self-correct",
      },
    },
  },
  techSpecs: {
    label: "技术规格",
    title: "基于成熟协议构建",
    subtitle: "多模型编排、专业技能系统、企业级安全协议",
    columns: {
      models: {
        title: "多模型编排",
        items: [
          "Claude — 主对话 + 实现",
          "Codex — 算法分析 + 代码审查",
          "Gemini — 原型获取 + UI 设计",
          "Vision / MiniMax — 专用场景",
        ],
      },
      skills: {
        title: "42 技能 (9 大类)",
        items: [
          "搜索：ace-tool · rg · fd · ast-grep · exa",
          "分析：codemap · har-to-vue · improve-skill",
          "文档：workhub · deepwiki · knowledge-base",
          "平台：evolution · mcp-to-skill · crew",
        ],
      },
      agents: {
        title: "25+ 子代理",
        items: [
          "侦察：scout · analyze · codemap · researcher",
          "构建：worker · planner · brainstormer",
          "审查：reviewer · security-reviewer · simplifier",
          "协作：crew-planner · crew-worker · crew-reviewer",
        ],
      },
      security: {
        title: "5 层安全",
        items: [
          "Auth — 时序安全令牌比较",
          "ExecGuard — 可执行白名单，默认拒绝",
          "SSRF Guard — DNS 重绑定防御",
          "Allowlist — 配对码审批机制",
        ],
      },
    },
  },
  cta: {
    title: "准备好编排了吗？",
    description: "42 技能、26 扩展、25+ 子代理、多通道网关。强制工作流确保代码质量，沙箱安全保护你的项目。",
    primary: "开始使用",
    secondary: "GitHub 仓库",
  },
  footer: {
    description: "自主 AI 编排器，强制 5 阶段工作流，从上下文检索到审计交付。",
    links: {
      product: "产品",
      resources: "资源",
      community: "社区",
    },
    items: {
      features: "核心能力",
      gateway: "网关",
      workflow: "工作流",
      extensions: "扩展",
      docs: "文档",
      skills: "技能目录",
      changelog: "更新日志",
      github: "GitHub",
      issues: "Issues",
    },
    copyright: "© 2026 Pi Agent. MIT 开源协议。",
  },
} as const;
