export default {
  common: {
    getStarted: "Get Started",
    learnMore: "Learn More",
    features: "Features",
    workflow: "Workflow",
    docs: "Documentation",
    product: "Product",
    resources: "Resources",
    community: "Community",
  },
  navbar: {
    links: {
      features: "Features",
      workflow: "Workflow",
      docs: "Documentation",
    },
    cta: "Get Started",
  },
  hero: {
    badge: "Autonomous AI Orchestrator",
    title: "Managing Complex Software Development",
    subtitle: "Through Structured Skill System",
    description: "Pi Agent is an autonomous AI orchestrator that manages complex software development workflows through a structured skill system. Enforces enterprise-level protocols for code quality, documentation, and multi-model collaboration. Forced 5-phase workflow from context retrieval to audit and delivery.",
    ctas: {
      primary: "Get Started",
      secondary: "View Workflow",
    },
  },
  features: {
    label: "Features",
    title: "20+ Skills, 5-Phase Workflow",
    subtitle: "Complete software development assistant system, from quick reconnaissance to deep analysis",
    cards: {
      workflow: {
        title: "5-Phase Mandatory Workflow",
        description: "Strict development process from context retrieval to audit delivery. Ensures code quality and project integrity.",
        features: [
          "Phase 1: Context Retrieval",
          "Phase 2: Analysis & Planning",
          "Phase 3: Prototyping (Unified Diff)",
          "Phase 4: Implementation (Refactoring)",
          "Phase 5: Audit & Delivery",
        ],
      },
      skills: {
        title: "20+ Professional Skills",
        description: "Semantic search, AST-aware code rewriting, document management, project planning, system design, and more.",
      },
      subagents: {
        title: "5 Specialized Subagents",
        description: "Quick reconnaissance, deep analysis, task planning, code review, design exploration, and other specialized agents.",
      },
      search: {
        title: "Semantic Code Search",
        description: "Natural language code search with ace-tool, no need to know exact file names or symbol names.",
      },
      astGrep: {
        title: "AST-Aware Code Operations",
        description: "Syntax-aware code search, rewriting, and linting with ast-grep.",
      },
      workhub: {
        title: "Document Management System",
        description: "Workhub skill for task tracking, Architecture Decision Records (ADRs), Issue/PR management.",
        features: [
          "Single Source of Truth (SSOT)",
          "Filesystem as Memory",
          "Change Traceability",
          "State Management",
        ],
      },
    },
  },
  workflow: {
    label: "Workflow",
    title: "Mandatory 5-Phase Workflow",
    subtitle: "Structured development process ensuring code quality and project integrity",
    phases: {
      phase1: {
        title: "Phase 1: Context Retrieval",
        description: "Use ace-tool或 ast-grep for semantic/syntactic search, recursively retrieving complete code definitions.",
        tool: "ace-tool / ast-grep",
      },
      phase2: {
        title: "Phase 2: Analysis & Planning",
        description: "Execute only for complex tasks. Distribute raw requirements to Codex/Gemini for solution iteration and logical reasoning.",
        tool: "Gemini | Codex",
      },
      phase3: {
        title: "Phase 3: Prototyping",
        description: "Gemini generates Unified Diff Patch (for Frontend/UI or Backend/Logic).",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "Phase 4: Implementation",
        description: "Refactor prototype to production code. Remove redundancy, optimize efficiency, minimal scope.",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "Phase 5: Audit & Delivery",
        description: "Automated code review (Codex or Gemini), deliver after audit passes.",
        tool: "Audit Mandatory",
      },
    },
    commands: {
      title: "Workflow Commands",
      scout: "/scout - Quick code reconnaissance, locate files and architecture",
      analyze: "/analyze - Deep code analysis, architecture and dependency analysis",
      brainstorm: "/brainstorm - Design exploration, combining workhub, system-design",
      research: "/research - Parallel codebase research, multi-tool collaboration",
    },
  },
  techSpecs: {
    label: "Tech Specs",
    title: "Built on Proven Protocols",
    subtitle: "Enterprise-grade architecture, multi-model collaboration, professional skill system",
    columns: {
      core: {
        title: "Core Models",
        items: {
          primary: "Claude - Main conversation model",
          codex: "Codex - Algorithms, error analysis, code review",
          gemini: "Gemini - Prototyping, UI design, architecture planning",
          specialized: "nvidia/minimaxai/minimax-m2.1 - brainstormer specific",
        },
      },
      skills: {
        title: "Skill System (20+)",
        items: {
          search: "ace-tool - Semantic code search",
          ast: "ast-grep - AST-aware operations",
          docs: "workhub - Document management",
          other: "17+ professional skills (planning, design, search, etc.)",
        },
      },
      subagents: {
        title: "Subagents (5)",
        items: {
          scout: "scout - Quick code reconnaissance",
          worker: "worker - Deep analysis and task execution",
          planner: "planner - Task planning",
          reviewer: "reviewer - Code review",
          brainstormer: "brainstormer - Design exploration",
        },
      },
      protocols: {
        title: "Enterprise Protocols",
        items: {
          ssot: "Single Source of Truth (SSOT)",
          filesystem: "Filesystem as Memory",
          sovereignty: "Code Sovereignty",
          sandbox: "Sandbox Security",
        },
      },
    },
  },
  cta: {
    title: "Ready to Boost Software Development?",
    description: "Use Pi Agent's 5-phase workflow and 20+ professional skills to manage complex software development processes structurally. Start now.",
    primary: "Get Started",
    secondary: "Read Documentation",
  },
  footer: {
    description: "Autonomous AI orchestrator managing complex software development workflows through a structured skill system. Enforces enterprise-level protocols for code quality, documentation, and multi-model collaboration.",
    links: {
      product: "Product",
      resources: "Resources",
      community: "Community",
    },
    copyright: "© 2025 Pi Agent. All rights reserved.",
  },
} as const;