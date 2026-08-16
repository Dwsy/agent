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
    badge: "Pi Runtime, continuously evolving",
    title: {
      part1: "Make AI coding a ",
      accent: "programmable system",
      part2: ""
    },
    description: "Pi is more than a chat surface: code retrieval, context checkpoints, role memory, native GAPP interfaces, provider observability, and gateway orchestration live in one extensible runtime.",
    cta: {
      primary: "Get Started",
      secondary: "Read Docs"
    },
    stats: {
      commands: "Persistent Context",
      extensions: "Native Generative UI",
      productivity: "End-to-end Observability"
    }
  },
  features: {
    label: "Runtime Capabilities",
    title: "One observable path from context to delivery",
    subtitle: "Trace real code paths, preserve recoverable context, extend the runtime with tools and GAPPs, and keep verification evidence in the same session.",
    workflow: {
      title: "Evidence-driven workflow",
      desc: "Locate the real implementation, model constraints, make the smallest change, verify it, and ship evidence. The loop scales with the task instead of enforcing ceremony.",
      features: [
        "Read the real call path before editing",
        "Checkpoint / compact critical context",
        "Verify tests, diff, and worktree state together",
        "Compose tools and extensions per task"
      ],
      metrics: {
        tasks: "Context Tag",
        success: "Worktree State",
        active: "Provider Trace"
      }
    },
    skills: {
      title: "On-demand skills & tools",
      desc: "Semantic retrieval, AST, browser, design, diagnosis, docs, and automation capabilities load for the task at hand.",
      tags: ["ace-tool", "ast-grep", "codemap", "web-browser", "diagnose"]
    },
    subagents: {
      title: "Roles & durable memory",
      desc: "Role configuration, memory retrieval, and a viewer carry knowledge across sessions instead of starting from zero.",
      agents: ["role", "memory", "recall", "organize", "export", "viewer", "tags", "vector", "scenarios", "prompt", "service", "adapter"]
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
    title: "Distribute the Pi runtime beyond the terminal",
    subtitle: "Gateway uses an RPC worker pool, session routing, and a programmable plugin pipeline to expose the same Pi capabilities through Web, APIs, and messaging channels.",
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
    title: "An evidence-driven engineering loop",
    subtitle: "Not a mandatory five-step ritual: a loop around real code, recoverable context, precise edits, and reproducible verification.",
    phases: [
      { num: "01", title: "Locate", desc: "Semantic retrieval, exact match, call paths" },
      { num: "02", title: "Model", desc: "Understand constraints, choose the smallest surface" },
      { num: "03", title: "Preserve", desc: "Checkpoint, tag, and compact critical context" },
      { num: "04", title: "Execute", desc: "Surgical edits, extension tools, GAPP interaction" },
      { num: "05", title: "Verify", desc: "Tests, diff, state, and observable evidence" }
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
    title: "An agent runtime, not disposable chat",
    subtitle: "Pi differs at the runtime layer: context can recover, capabilities can extend, behavior can be observed, and interfaces can be generated.",
    headers: {
      feature: "Capability",
      pi: "Pi Agent",
      others: "Typical Tools"
    },
    rows: [
      { feature: "Context lifecycle", pi: "checkpoint + tag + compact", others: "session-only context" },
      { feature: "Code location", pi: "semantic + exact + AST", others: "basic search" },
      { feature: "Interaction surface", pi: "TUI + Web + GAPP", others: "single chat surface" },
      { feature: "Durable memory", pi: "role memory + retrieval + viewer", others: "temporary prompts" },
      { feature: "Observe & distribute", pi: "Provider Trace + Gateway/RPC", others: "single interface" }
    ]
  },
  cta: {
    title: "Turn Pi into your engineering system",
    subtitle: "Start with a working coding agent, then add memory, GAPPs, observability, and gateway capabilities as your project needs them.",
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
