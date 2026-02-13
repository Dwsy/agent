export default {
  common: {
    getStarted: "Get Started",
    learnMore: "Learn More",
    features: "Features",
    workflow: "Workflow",
    techSpecs: "Tech Specs",
    docs: "Documentation",
    product: "Product",
    resources: "Resources",
    community: "Community",
    extensions: "Extensions",
    gateway: "Gateway",
    useCases: "Use Cases",
  },
  navbar: {
    links: {
      features: "Features",
      workflow: "Workflow",
      extensions: "Extensions",
      techSpecs: "Tech Specs",
    },
    cta: "Get Started",
  },
  hero: {
    badge: "Autonomous AI Orchestrator · Enterprise",
    title: "40+ Skills · 30+ Extensions",
    subtitle: "One Agent to Rule Full-Stack Dev",
    description:
      "Pi Agent orchestrates Claude / Codex / Gemini through a mandatory 5-phase workflow with sandbox security and code sovereignty. 9+ specialized subagents, multi-channel gateway (Telegram / Discord / WebChat), full pipeline from context retrieval to audit delivery.",
    stats: {
      skills: "40+",
      skillsLabel: "Skills",
      extensions: "30+",
      extensionsLabel: "Extensions",
      subagents: "9+",
      subagentsLabel: "Subagents",
      channels: "3",
      channelsLabel: "Channels",
    },
    ctas: {
      primary: "Quick Start",
      secondary: "View Workflow",
    },
  },
  features: {
    label: "Core Capabilities",
    title: "Beyond Code Completion — Full-Stack Orchestration",
    subtitle: "From semantic search to architecture design, from security audit to multi-agent collaboration",
    cards: {
      workflow: {
        title: "5-Phase Mandatory Workflow",
        description:
          "Context Retrieval → Analysis → Prototyping → Implementation → Audit. Each phase has explicit toolchains and quality gates. No skipping, no shortcuts.",
        features: [
          "Golden Rule: Must retrieve context before modifying code",
          "External models output Unified Diff only, no direct file writes",
          "Phase 5 forced code review — no delivery without audit",
          "L1-L4 complexity auto-routing prevents abandoned projects",
          "Complex tasks auto-create Issues + split into subtasks",
        ],
      },
      skills: {
        title: "40+ Professional Skills",
        description:
          "Semantic search (ace-tool), AST rewriting (ast-grep), doc management (workhub), system design (EventStorming), Office suite, web automation, SVG generation… covering the entire dev pipeline.",
      },
      subagents: {
        title: "9+ Specialized Subagents",
        description:
          "scout (read-only recon), planner (multi-agent planning), worker (general impl), reviewer (code review), brainstormer (design exploration), vision (multimodal), security-reviewer (vulnerability audit), simplifier (code reduction), system-design (architecture).",
      },
      search: {
        title: "Semantic Code Search",
        description:
          "Search code in natural language: \"Where's the auth logic?\" \"How does payment flow?\" ace-tool semantics + rg exact match + ast-grep syntax — three layers, complementary.",
      },
      gateway: {
        title: "Multi-Channel Gateway",
        description:
          "One server for Telegram / Discord / WebChat. RPC connection pool, session routing, 14 lifecycle hooks, cron scheduling, OpenAI-compatible API.",
      },
      enterprise: {
        title: "Enterprise Protocols",
        description:
          "Code Sovereignty: external AI code is reference only, must refactor. Sandbox Security: external models can't write files directly. SSOT: one authoritative source per domain. Filesystem as memory.",
        features: [
          "Code Sovereignty — external code must be production-grade",
          "Sandbox Security — Unified Diff Patch isolation",
          "SSOT — Single Source of Truth",
          "Complexity Routing — L1-L4 auto-grading",
        ],
      },
    },
  },
  extensions: {
    label: "Extension Ecosystem",
    title: "30+ Extensions, Developer Experience Maxed",
    subtitle: "Interactive shell, safety gates, plan mode, role memory, and yes — games",
    cards: {
      interactiveShell: {
        title: "Interactive Shell",
        description:
          "Delegate to Claude Code / Gemini CLI / Codex with hands-free monitoring, async dispatch, or interactive mode. Background sessions can be attached / dismissed anytime.",
      },
      safetyGates: {
        title: "Safety Gates",
        description:
          "Intercepts 40+ dangerous command patterns. rm → trash, git restore . → per-file restore, background tasks forced to tmux. One slip won't nuke your project.",
      },
      planMode: {
        title: "Plan Mode",
        description:
          "Read-only tools to explore the codebase without accidental modifications. Extract TODOs, analyze architecture, draft plans — confirm before executing. Shift+P to toggle.",
      },
      rolePersna: {
        title: "Role Memory System",
        description:
          "Auto-switch roles by project path. Each role has isolated MEMORY.md, SOUL.md, USER.md. Cross-session memory persistence with auto-extracted learnings and preferences.",
      },
      games: {
        title: "Built-in Games",
        description:
          "Snake / Tetris / 2048 / Minesweeper / Breakout / Pong — 6 classics with state persistence and high scores. Tired of coding? /snake for a break.",
      },
      commands: {
        title: "Workflow Commands",
        description:
          "/scout recon, /analyze deep dive, /brainstorm design, /research parallel study, /run single agent, /chain sequential, /parallel concurrent execution.",
      },
    },
  },
  workflow: {
    label: "Workflow",
    title: "Mandatory 5 Phases, Not Suggestions",
    subtitle: "Each phase has explicit inputs, outputs, and quality gates",
    phases: {
      phase1: {
        title: "Context Retrieval",
        description:
          "Golden Rule: retrieve before modifying. ace-tool semantic search + rg exact match + ast-grep syntax + fd file location. Recursively trace call chains and dependencies.",
        tool: "ace / rg / ast-grep / fd",
      },
      phase2: {
        title: "Analysis & Planning",
        description:
          "Triggered only for complex tasks. Distribute requirements to Codex / Gemini for cross-validation, output step-by-step plans with pseudocode. L3+ tasks auto-create Workhub Issues.",
        tool: "Codex · Gemini · Workhub",
      },
      phase3: {
        title: "Prototyping",
        description:
          "External models (Gemini) generate Unified Diff Patches. Frontend gets visual baseline, backend gets logic prototype. No direct file writes — that's sandbox security.",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "Implementation",
        description:
          "Refactor prototype to production code. Remove redundancy, improve clarity, minimal scope. Self-documenting code, comments only when necessary. Forced side-effect review.",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "Audit & Delivery",
        description:
          "Immediately invoke Codex / Gemini code review after changes. Deliver to user only after audit passes. This is not optional.",
        tool: "Mandatory Audit",
      },
    },
    complexity: {
      title: "Complexity Auto-Routing",
      l1: "L1 Simple — 1-2 files <50 lines, execute directly",
      l2: "L2 Medium — 3-5 files, add analysis phase",
      l3: "L3 Complex — 6-10 files, create Issue + subtasks + tmux",
      l4: "L4 Severe — 10+ files, Workhub + ADR + architecture design",
    },
    commands: {
      title: "Quick Commands",
      scout: "Quick code recon, locate files and architecture",
      analyze: "Deep code analysis, architecture and dependencies",
      brainstorm: "Design exploration with workhub + system-design",
      research: "Parallel codebase research, multi-tool collaboration",
    },
  },
  techSpecs: {
    label: "Tech Specs",
    title: "Built on Proven Protocols",
    subtitle: "Multi-model orchestration, professional skill system, enterprise security",
    columns: {
      core: {
        title: "Multi-Model Orchestration",
        items: {
          primary: "Claude — Main conversation + implementation",
          codex: "Codex — Algorithm analysis + code review",
          gemini: "Gemini — Prototyping + UI design",
          specialized: "Vision / GLM / MiniMax — Specialized scenarios",
        },
      },
      skills: {
        title: "Skill System (40+)",
        items: {
          search: "ace-tool · rg · fd — Multi-layer search",
          ast: "ast-grep — AST-aware rewriting",
          docs: "workhub · deepwiki · context7 — Docs & knowledge",
          tools: "office-combo · web-browser · tmux — Toolchain",
        },
      },
      subagents: {
        title: "Subagents (9+)",
        items: {
          scout: "scout — Read-only reconnaissance",
          worker: "worker · planner — Implementation & planning",
          reviewer: "reviewer · security — Review & security",
          creative: "brainstormer · vision · simplifier — Creative & optimization",
        },
      },
      protocols: {
        title: "Enterprise Protocols",
        items: {
          ssot: "SSOT — Single Source of Truth",
          sandbox: "Sandbox Security — External model isolation",
          sovereignty: "Code Sovereignty — External code must be refactored",
          routing: "Complexity Routing — L1-L4 auto-grading",
        },
      },
    },
  },
  useCases: {
    label: "Use Cases",
    title: "See It in Action",
    subtitle: "From quick recon to multi-agent collaboration",
    cases: {
      scout: {
        title: "Instant Code Location",
        description:
          "Type /scout auth flow → ace-tool semantic search → complete call chain and file locations. No need to know filenames.",
        command: "/scout authentication flow",
      },
      brainstorm: {
        title: "Architecture Design Exploration",
        description:
          "Type /brainstorm caching strategy → Workhub creates Issue → system-design generates EventStorming diagrams → structured design catalog.",
        command: "/brainstorm caching strategy",
      },
      multiAgent: {
        title: "Multi-Agent Parallel Work",
        description:
          "pi-messenger mesh → reserve files to avoid conflicts → agents work in parallel → notify commit hash on completion → merge after tests pass.",
        command: "pi_messenger({ action: 'reserve' })",
      },
      gateway: {
        title: "Telegram Bot Deployment",
        description:
          "pi-gateway one-click deploy → Telegram Bot connected → supports images/audio/group chats → multi-account management → cron tasks → autonomous operation.",
        command: "bun run pi-gw",
      },
    },
  },
  cta: {
    title: "Ready?",
    description:
      "40+ skills, 30+ extensions, 9+ subagents, multi-channel gateway. Mandatory workflow ensures code quality, sandbox security protects your project.",
    primary: "Get Started",
    secondary: "Read Docs",
  },
  footer: {
    description:
      "Autonomous AI orchestrator. 40+ skills, 30+ extensions, 9+ subagents, multi-channel gateway. Mandatory 5-phase workflow from context retrieval to audit delivery.",
    links: {
      product: "Product",
      resources: "Resources",
      community: "Community",
    },
    copyright: "© 2025 Pi Agent. All rights reserved.",
  },
} as const;
