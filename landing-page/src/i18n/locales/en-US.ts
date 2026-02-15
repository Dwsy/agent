export default {
  common: {
    getStarted: "Get Started",
    learnMore: "Learn More",
    viewOnGithub: "View on GitHub",
  },
  navbar: {
    links: {
      features: "Features",
      gateway: "Gateway",
      workflow: "Workflow",
      extensions: "Extensions",
      comparison: "Compare",
    },
    cta: "Get Started",
  },
  hero: {
    badge: "Autonomous AI Orchestrator",
    title: "One Agent to Rule\nFull-Stack Dev",
    subtitle: "Orchestrate Claude, Codex & Gemini through a mandatory 5-phase workflow with sandbox security, code sovereignty, and multi-channel gateway.",
    stats: {
      skills: "42",
      skillsLabel: "Skills",
      extensions: "26",
      extensionsLabel: "Extensions",
      subagents: "25+",
      subagentsLabel: "Subagents",
      gateway: "65+",
      gatewayLabel: "Gateway Modules",
    },
    ctas: {
      primary: "Quick Start",
      secondary: "View on GitHub",
    },
    terminal: {
      line1: "$ pi \"Refactor the auth module\"",
      line2: "⟐ Phase 1: Context Retrieval",
      line3: "  ├─ ace search \"auth logic\" → 12 files",
      line4: "  └─ rg \"class Auth\" → src/core/auth.ts",
      line5: "⟐ Phase 2: Analysis & Planning",
      line6: "  └─ Dispatching scout × 3 in parallel...",
      line7: "⟐ Phase 4: Implementation",
      line8: "  └─ Editing 4 files, 127 lines changed",
      line9: "⟐ Phase 5: Audit — ✓ All checks passed",
      line10: "✓ Delivered. 4 files, 0 issues.",
    },
  },
  features: {
    label: "Core Capabilities",
    title: "Beyond Code Completion",
    subtitle: "Full-stack orchestration from semantic search to architecture design, from security audit to multi-agent collaboration",
    cards: {
      workflow: {
        title: "5-Phase Mandatory Workflow",
        description: "Context Retrieval → Analysis → Prototyping → Implementation → Audit. Each phase has explicit toolchains and quality gates. No skipping, no shortcuts.",
        features: [
          "Golden Rule: retrieve context before modifying code",
          "External models output Unified Diff only",
          "Phase 5 forced code review before delivery",
          "L1-L4 complexity auto-routing",
        ],
      },
      skills: {
        title: "42 Professional Skills",
        description: "Semantic search (ace-tool), AST rewriting (ast-grep), system design (EventStorming), Office suite, web automation, SVG generation — covering 9 categories across the entire dev pipeline.",
      },
      subagents: {
        title: "25+ Specialized Subagents",
        description: "scout, planner, worker, reviewer, brainstormer, vision, security-reviewer, simplifier, system-design, codemap, researcher, api-tester — plus a full Crew mesh system for multi-agent orchestration.",
      },
      search: {
        title: "Semantic Code Search",
        description: "\"Where's the auth logic?\" — ace-tool semantics + rg exact match + ast-grep syntax structure. Three layers, complementary. Natural language to code location.",
      },
      gateway: {
        title: "Multi-Channel Gateway",
        description: "65+ modules. RPC process pool, session routing, 16 lifecycle hooks, cron scheduling, OpenAI-compatible API. One server for Telegram, Discord, and WebChat.",
      },
      enterprise: {
        title: "Enterprise Security",
        description: "5 security layers: Auth (timing-safe), ExecGuard (allowlist), SSRF Guard (DNS rebinding defense), Allowlist (pairing), Media Security (HMAC tokens).",
        features: [
          "Code Sovereignty — external code must be refactored",
          "Sandbox Security — Unified Diff isolation",
          "SSOT — Single Source of Truth",
          "Fail-Closed — secure by default",
        ],
      },
    },
  },
  gateway: {
    label: "Gateway Architecture",
    title: "Not a Bot Framework — A Process Orchestrator",
    subtitle: "The gateway manages a pool of AI agent processes and routes messages to them. Channel-agnostic, plugin-first, security-in-depth.",
    layers: {
      channels: { title: "Channels", desc: "Telegram · Discord · WebChat · OpenAI API" },
      pipeline: { title: "Pipeline", desc: "Dispatch → Dedup → Mode Resolve → Enqueue → Process" },
      plugins: { title: "Plugins", desc: "Loader · Hooks (16) · Registry · Conflict Detection" },
      runtime: { title: "Runtime", desc: "RPC Pool · Session Router · Cron · System Events" },
      security: { title: "Security", desc: "Auth · ExecGuard · SSRF Guard · Allowlist · Media" },
    },
    stats: {
      modules: { value: "65+", label: "Source Modules" },
      hooks: { value: "16", label: "Lifecycle Hooks" },
      apis: { value: "30+", label: "API Endpoints" },
      security: { value: "5", label: "Security Layers" },
    },
    highlights: [
      "Capability-aware process pooling — reuse by signature match",
      "Three-mode message concurrency: steer / follow-up / interrupt",
      "Session resume via JSONL detection across restarts",
      "Model health failover with automatic cooldown",
      "Plugin-first: Telegram, Discord, WebChat are all plugins",
      "OpenAI-compatible /v1/chat/completions endpoint",
    ],
  },
  workflow: {
    label: "Workflow",
    title: "Mandatory 5 Phases",
    subtitle: "Each phase has explicit inputs, outputs, and quality gates",
    phases: {
      phase1: {
        title: "Context Retrieval",
        description: "Golden Rule: retrieve before modifying. ace-tool semantic search + rg exact match + ast-grep syntax + fd file location.",
        tool: "ace / rg / ast-grep / fd",
      },
      phase2: {
        title: "Analysis & Planning",
        description: "Complex tasks only. Distribute to Codex / Gemini for cross-validation. Output step-by-step plans. L3+ auto-creates Workhub Issues.",
        tool: "Codex · Gemini · Workhub",
      },
      phase3: {
        title: "Prototyping",
        description: "External models generate Unified Diff Patches. Frontend gets visual baseline, backend gets logic prototype. No direct file writes.",
        tool: "Gemini → Unified Diff",
      },
      phase4: {
        title: "Implementation",
        description: "Refactor prototype to production code. Remove redundancy, minimal scope, self-documenting. Forced side-effect review.",
        tool: "Pi Agent (Self)",
      },
      phase5: {
        title: "Audit & Delivery",
        description: "Immediately invoke code review after changes. Deliver only after audit passes. This is not optional.",
        tool: "Mandatory Audit",
      },
    },
    complexity: {
      title: "Complexity Auto-Routing",
      l1: { label: "L1 Simple", desc: "1-2 files, <50 lines → execute directly" },
      l2: { label: "L2 Medium", desc: "3-5 files → add analysis phase" },
      l3: { label: "L3 Complex", desc: "6-10 files → Issue + subtasks + tmux" },
      l4: { label: "L4 Severe", desc: "10+ files → Workhub + ADR + architecture" },
    },
  },
  extensions: {
    label: "Extension Ecosystem",
    title: "26 Extensions, DX Maxed",
    subtitle: "Interactive shell, safety gates, plan mode, role memory, autonomous loops, and yes — games",
    cards: {
      subagentOrch: {
        title: "Subagent Orchestration",
        description: "Single / chain / parallel execution. Async background jobs. Agent CRUD management TUI. Visual progress widgets.",
        tag: "Multi-Agent",
      },
      interactiveShell: {
        title: "Interactive Shell",
        description: "PTY overlay for Claude Code / Gemini CLI / Codex. Hands-free, dispatch, or interactive mode. Background session management.",
        tag: "Delegation",
      },
      loop: {
        title: "Autonomous Loop",
        description: "Run agent in a loop until tests pass, custom condition met, or self-determined. Context compaction aware.",
        tag: "Automation",
      },
      rolePersona: {
        title: "Role Memory System",
        description: "Auto-switch roles by project path. Isolated MEMORY.md, SOUL.md, USER.md per role. SM-2 spaced repetition consolidation.",
        tag: "Memory",
      },
      planMode: {
        title: "Plan Mode",
        description: "Read-only exploration. Extract TODOs, analyze architecture, draft plans. Confirm before executing. Shift+P to toggle.",
        tag: "Safety",
      },
      safetyGates: {
        title: "Safety Gates",
        description: "Intercepts 40+ dangerous patterns. rm → trash with 30s countdown. git restore . → per-file. One slip won't nuke your project.",
        tag: "Safety",
      },
      outputStyles: {
        title: "Output Styles",
        description: "Switchable AI personalities: explanatory, learning, coding-vibes, structural-thinking. Project or global scope.",
        tag: "DX",
      },
      games: {
        title: "Built-in Games",
        description: "Snake / Tetris / 2048 / Minesweeper / Breakout / Pong. State persistence, high scores. /snake for a break.",
        tag: "Fun",
      },
    },
  },
  comparison: {
    label: "Comparison",
    title: "How Pi Agent Stacks Up",
    subtitle: "Feature comparison with other AI coding tools",
    features: {
      multiModel: "Multi-Model Orchestration",
      multiAgent: "Multi-Agent System",
      skillSystem: "Skill System",
      extensionSystem: "Extension System",
      gateway: "Multi-Channel Gateway",
      safetyGates: "Safety Gates",
      memorySystem: "Memory System",
      mandatoryWorkflow: "Mandatory Workflow",
      openSource: "Open Source",
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
    label: "Use Cases",
    title: "See It in Action",
    subtitle: "From quick recon to multi-agent collaboration",
    cases: {
      scout: {
        title: "Instant Code Location",
        description: "Type /scout auth flow → ace-tool semantic search → complete call chain and file locations. No need to know filenames.",
        command: "/scout authentication flow",
      },
      crew: {
        title: "Multi-Agent Crew",
        description: "pi_messenger mesh → plan from PRD → parallel workers with file reservations → reviewer validates → auto-sync downstream specs.",
        command: "pi_messenger({ action: 'work', autonomous: true })",
      },
      gateway: {
        title: "Telegram Bot in Minutes",
        description: "pi-gateway one-click deploy → Telegram Bot connected → images/audio/group chats → cron tasks → autonomous operation.",
        command: "bun run pi-gw start",
      },
      selfImprove: {
        title: "Self-Improving Agent",
        description: "evolution skill hooks into lifecycle → detects improvement opportunities → self-corrects errors → validates its own skills → learns from experience.",
        command: "evolution: auto-detect + self-correct",
      },
    },
  },
  techSpecs: {
    label: "Tech Specs",
    title: "Built on Proven Protocols",
    subtitle: "Multi-model orchestration, professional skill system, enterprise security",
    columns: {
      models: {
        title: "Multi-Model",
        items: [
          "Claude — Main conversation + implementation",
          "Codex — Algorithm analysis + code review",
          "Gemini — Prototyping + UI design",
          "Vision / MiniMax — Specialized scenarios",
        ],
      },
      skills: {
        title: "42 Skills (9 Categories)",
        items: [
          "Search: ace-tool · rg · fd · ast-grep · exa",
          "Analysis: codemap · har-to-vue · improve-skill",
          "Docs: workhub · deepwiki · knowledge-base",
          "Platform: evolution · mcp-to-skill · crew",
        ],
      },
      agents: {
        title: "25+ Subagents",
        items: [
          "Recon: scout · analyze · codemap · researcher",
          "Build: worker · planner · brainstormer",
          "Review: reviewer · security-reviewer · simplifier",
          "Crew: planner · worker · reviewer · plan-sync",
        ],
      },
      security: {
        title: "5 Security Layers",
        items: [
          "Auth — timing-safe token comparison",
          "ExecGuard — executable allowlist, fail-closed",
          "SSRF Guard — DNS rebinding defense",
          "Allowlist — pairing code approval",
        ],
      },
    },
  },
  cta: {
    title: "Ready to Orchestrate?",
    description: "42 skills. 26 extensions. 25+ subagents. Multi-channel gateway. Mandatory workflow ensures code quality. Sandbox security protects your project.",
    primary: "Get Started",
    secondary: "View on GitHub",
  },
  footer: {
    description: "Autonomous AI orchestrator with mandatory 5-phase workflow, from context retrieval to audit delivery.",
    links: {
      product: "Product",
      resources: "Resources",
      community: "Community",
    },
    items: {
      features: "Features",
      gateway: "Gateway",
      workflow: "Workflow",
      extensions: "Extensions",
      docs: "Documentation",
      skills: "Skill Directory",
      changelog: "Changelog",
      github: "GitHub",
      issues: "Issues",
    },
    copyright: "© 2026 Pi Agent. Open source under MIT.",
  },
} as const;
