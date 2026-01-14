export default {
  common: {
    getStarted: "开始使用",
    learnMore: "了解更多",
    features: "功能特性",
    workflow: "工作流",
    docs: "文档",
    product: "产品",
    resources: "资源",
    community: "社区",
  },
  navbar: {
    links: {
      features: "功能特性",
      workflow: "工作流程",
      docs: "文档",
    },
    cta: "开始使用",
  },
  hero: {
    badge: "自主 AI 编排器",
    title: "通过结构化技能系统管理",
    subtitle: "复杂的软件开发工作流",
    description: "Pi Agent 是自主 AI 编排器，通过结构化技能系统管理复杂的软件开发工作流。执行企业级协议，确保代码质量、文档和多模型协作。强制 5 阶段工作流，从上下文检索到审计交付。",
    ctas: {
      primary: "开始使用",
      secondary: "了解工作流",
    },
  },
  features: {
    label: "功能特性",
    title: "20+ 专业技能，5 阶段工作流",
    subtitle: "完整的软件开发辅助系统，从快速侦察到深度分析",
    cards: {
      workflow: {
        title: "5 阶段强制工作流",
        description: "严格的开发流程，从上下文检索到审计交付。确保代码质量和项目完整性。",
        features: [
          "Phase 1: 上下文检索",
          "Phase 2: 分析与规划",
          "Phase 3: 原型获取 (Unified Diff)",
          "Phase 4: 编码实施 (重构)",
          "Phase 5: 审计与交付",
        ],
      },
      skills: {
        title: "20+ 专业能力",
        description: "语义搜索、AST 感知代码重写、文档管理、项目规划、系统设计等技能。",
      },
      subagents: {
        title: "5 个专门子代理",
        description: "快速侦察、深度分析、任务规划、代码审查、设计探索等专用代理。",
      },
      search: {
        title: "语义代码搜索",
        description: "使用 ace-tool 进行自然语言代码搜索，无需知道确切文件名或符号名。",
      },
      astGrep: {
        title: "AST 感知代码操作",
        description: "使用 ast-grep 进行语法感知的代码搜索、代码重写和 Lint。",
      },
      workhub: {
        title: "文档管理系统",
        description: "Workhub 技能用于任务跟踪、架构决策记录（ADR）、Issue/PR 管理。",
        features: [
          "单一真实来源 (SSOT)",
          "文件系统即记忆",
          "变更可追溯性",
          "状态管理",
        ],
      },
    },
  },
  workflow: {
    label: "工作流程",
    title: "强制 5 阶段工作流",
    subtitle: "结构化的开发流程，确保代码质量和项目完整性",
    phases: {
      phase1: {
        title: "Phase 1: 上下文检索",
        description: "使用 ace-tool 或 ast-grep 进行语义/语法搜索，递归检索完整的代码定义。",
        tool: "ace-tool / ast-grep",
      },
      phase2: {
        title: "Phase 2: 分析与规划",
        description: "仅复杂任务执行。将原始需求分配给 Codex/Gemini，进行方案迭代和逻辑推理。",
        tool: "Gamma | Codex",
      },
      phase3: {
        title: "Phase 3: 原型获取",
        description: "Gemini 生成 Unified Diff Patch（前端/UI 或后端/逻辑）。",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "Phase 4: 编码实施",
        description: "基于原型重构为生产代码。删除冗余，优化效率，最小作用域。",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "Phase 5: 审计与交付",
        description: "自动代码审查（Codex 或 Gemini），审计通过后交付。",
        tool: "Audit Mandatory",
      },
    },
    commands: {
      title: "工作流命令",
      scout: "/scout - 快速代码侦察，定位文件和架构",
      analyze: "/analyze - 深度代码分析，架构和依赖分析",
      brainstorm: "/brainstorm - 设计探索，结合 workhub、system-design",
      research: "/research - 并行代码库研究，多工具协同",
    },
  },
  techSpecs: {
    label: "技术规格",
    title: "基于成熟协议构建",
    subtitle: "企业级架构，多模型协作，专业技能系统",
    columns: {
      core: {
        title: "核心模型",
        items: {
          primary: "Claude - 主对话模型",
          codex: "Codex - 算法、错误分析、代码审查",
          gemini: "Gemini - 原型获取、UI 设计、架构规划",
         专用: "nvidia/minimaxai/minimax-m2.1 - brainstormer 专用",
        },
      },
      skills: {
        title: "技能系统 (20+)",
        items: {
          search: "ace-tool - 语义代码搜索",
          ast: "ast-grep - AST 感知操搜",
          docs: "workhub - 文档管理",
          other: "17+ 专业技能 (规划、设计、搜索等)",
        },
      },
      subagents: {
        title: "子代理 (5)",
        items: {
          scout: "scout - 快速代码侦察",
          worker: "worker - 深度分析和任务执行",
          planner: "planner - 任务规划",
          reviewer: "reviewer - 代码审查",
          brainstormer: "brainstormer - 设计探索",
        },
      },
      protocols: {
        title: "企业协议",
        items: {
          ssot: "单一真实来源 (SSOT)",
          filesystem: "文件系统即记忆",
          sovereignty: "代码主权",
          sandbox: "沙箱安全",
        },
      },
    },
  },
  cta: {
    title: "准备提升软件开发效率了吗？",
    description: "使用 Pi Agent 的 5 阶段工作流和 20+ 专业技能，结构化管理复杂软件开发流程。立即开始体验。",
    primary: "开始使用",
    secondary: "阅读文档",
  },
  footer: {
    description: "自主 AI 编排器，通过结构化技能系统管理复杂的软件开发工作流。执行企业级协议，确保代码质量、文档和多模型协作。",
    links: {
      product: "产品",
      resources: "资源",
      community: "社区",
    },
    copyright: "© 2025 Pi Agent. 保留所有权利。",
  },
} as const;