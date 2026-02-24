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
    badge: "Now in v2.0",
    title: {
      part1: "The ",
      accent: "AI Engineer",
      part2: " You Actually Want"
    },
    description: "Stop babysitting AI agents. Pi handles context retrieval, parallel subagents, security audits, and multi-channel deployment — so you focus on architecture, not prompting.",
    cta: {
      primary: "Get Started",
      secondary: "Read Docs"
    },
    stats: {
      commands: "Built-in Commands",
      extensions: "Extensions",
      productivity: "Faster Delivery"
    }
  },
  features: {
    label: "Core Architecture",
    title: "Orchestration, Not Just Chat",
    subtitle: "From semantic code search to multi-agent crews, from security audits to production deployment.",
    workflow: {
      title: "5-Phase Workflow",
      desc: "Mandatory pipeline: Context Retrieval → Analysis → Prototyping → Implementation → Audit. No shortcuts, no hallucinated edits.",
      features: [
        "Golden Rule: retrieve before modify",
        "Unified Diff isolation",
        "Forced pre-delivery review",
        "L1-L4 complexity routing"
      ],
      metrics: {
        tasks: "Tasks",
        success: "Success",
        active: "Active"
      }
    },
    skills: {
      title: "42 Skills",
      desc: "Semantic search, AST manipulation, system design, Office automation.",
      tags: ["ace-tool", "ast-grep", "codemap", "web-fetch", "+38 more"]
    },
    subagents: {
      title: "25+ Agents",
      desc: "Specialized agents coordinated via Crew protocol.",
      agents: ["scout", "planner", "worker", "reviewer", "vision", "researcher", "api-tester", "security", "simplifier", "codemap", "brainstormer", "system-design"]
    },
    search: {
      title: "Code Search",
      desc: "Natural language to exact location. Three layers, zero misses.",
      example: "pi /search \"auth middleware\""
    },
    gateway: {
      title: "Multi-Channel Gateway",
      desc: "One service for Telegram, Discord, WebChat, OpenAI API.",
      code: "await gateway.route({ channel: 'telegram', session: uuid() });"
    }
  },
  gateway: {
    label: "Gateway",
    title: "Process Orchestrator",
    subtitle: "Manage AI agent pools and route messages. Channel-agnostic, plugin-first, security-in-depth.",
    layers: {
      channels: { title: "Channels", desc: "Telegram · Discord · WebChat · API" },
      pipeline: { title: "Pipeline", desc: "Dispatch → Dedup → Resolve → Process" },
      plugins: { title: "Plugins", desc: "16 Hooks · Registry · Conflicts" },
      runtime: { title: "Runtime", desc: "RPC Pool · Router · Cron · Events" },
      security: { title: "Security", desc: "Auth · ExecGuard · SSRF · Allowlist" }
    }
  },
  workflow: {
    label: "Workflow",
    title: "5-Phase Mandatory Pipeline",
    subtitle: "Every task goes through retrieval, analysis, prototyping, implementation, and audit. Quality by design.",
    phases: [
      { num: "01", title: "Retrieve", desc: "Semantic search, exact match, syntax structure" },
      { num: "02", title: "Analyze", desc: "Scout dispatch, strategy selection" },
      { num: "03", title: "Prototype", desc: "External model diff, internal refactor" },
      { num: "04", title: "Implement", desc: "Surgical edits, dependency checks" },
      { num: "05", title: "Audit", desc: "Codex review, test verification" }
    ]
  },
  extensions: {
    label: "Extensions",
    title: "Infinite Extensibility",
    subtitle: "From CLI commands to TUI components, from gateway plugins to cron jobs.",
    categories: {
      commands: { title: "Commands", desc: "Slash commands and shortcuts" },
      tools: { title: "Tools", desc: "Reusable capabilities" },
      gateway: { title: "Gateway", desc: "Channel integrations" }
    }
  },
  comparison: {
    label: "Comparison",
    title: "Not Another Wrapper",
    subtitle: "Purpose-built for serious engineering, not toy projects.",
    headers: {
      feature: "Capability",
      pi: "Pi Agent",
      others: "Typical Tools"
    },
    rows: [
      { feature: "Multi-phase workflow", pi: "5 mandatory phases", others: "Single-step" },
      { feature: "Context retrieval", pi: "Semantic + exact + AST", others: "Basic search" },
      { feature: "Security model", pi: "5-layer defense", others: "Minimal" },
      { feature: "Subagent system", pi: "Crew mesh protocol", others: "None" },
      { feature: "Gateway", pi: "Multi-channel + RPC", others: "Single interface" }
    ]
  },
  cta: {
    title: "Ready to Ship Faster?",
    subtitle: "Join the engineers who stopped babysitting AI and started architecting.",
    button: "Get Started"
  },
  footer: {
    tagline: "Engineering-grade AI orchestration.",
    links: {
      docs: "Documentation",
      github: "GitHub",
      discord: "Discord"
    },
    copyright: "Built with precision."
  }
};
