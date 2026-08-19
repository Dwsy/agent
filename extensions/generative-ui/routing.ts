export type VisualTarget = "markdown" | "show_widget" | "show_canvas";
export type VisualStyle =
  | "editorial"
  | "analytical"
  | "system"
  | "comparison"
  | "record"
  | "workflow"
  | "product"
  | "illustrative";
export type ResearchPolicy = "none" | "if_missing" | "required";

export interface VisualRoute {
  id: string;
  title: string;
  target: VisualTarget;
  modules: string[];
  templates: string[];
  style: VisualStyle;
  reason: string;
  contentPlan: string[];
  research: ResearchPolicy;
  researchInstruction: string;
}

const CURRENT_DATA_RE = /\b(latest|current|today|tonight|recent|live|news|price|prices|market|weather|forecast|score|standings|release|version|availability)\b|最新|当前|今天|实时|新闻|价格|行情|天气|比分|排名|版本|发布|可用性/i;
const EXPLICIT_RESEARCH_RE = /\b(search|research|look up|browse|find sources?|verify|source)\b|搜索|检索|调研|查找|查一下|找资料|核实|来源/i;

function researchFor(request: string): Pick<VisualRoute, "research" | "researchInstruction"> {
  if (CURRENT_DATA_RE.test(request) || EXPLICIT_RESEARCH_RE.test(request)) {
    return {
      research: "required",
      researchInstruction:
        "Retrieve current/authoritative facts with the available search, file, code, or data tools before rendering. Keep source and time scope in the artifact; never substitute template/demo values.",
    };
  }
  return {
    research: "if_missing",
    researchInstruction:
      "Use facts already present in the conversation when sufficient. If concrete evidence, labels, or values are missing, retrieve them with the available search, file, code, or data tools before rendering; never invent filler data.",
  };
}

function route(
  request: string,
  spec: Omit<VisualRoute, "research" | "researchInstruction">,
): VisualRoute {
  return { ...spec, ...researchFor(request) };
}

function has(request: string, pattern: RegExp): boolean {
  return pattern.test(request);
}

export function routeVisualRequest(rawRequest: string): VisualRoute {
  const request = rawRequest.trim();
  const q = request.toLowerCase();

  if (has(q, /\b(text only|plain text|no visual|no chart|no diagram|just answer)\b|只要文字|不要图|不用可视化|纯文字/i)) {
    return route(request, {
      id: "text-first",
      title: "Text-first answer",
      target: "markdown",
      modules: [],
      templates: [],
      style: "editorial",
      reason: "The request explicitly prefers prose over a visual artifact.",
      contentPlan: ["Answer directly in prose", "Use a compact table only when comparison materially benefits"],
    });
  }

  if (has(q, /\b(illustration|poster|artwork|visual metaphor|concept art)\b|插画|海报|艺术作品|视觉隐喻|概念图/i)) {
    return route(request, {
      id: "illustration",
      title: "Illustrative visual",
      target: "show_widget",
      modules: ["art", "runtime"],
      templates: [],
      style: "illustrative",
      reason: "The user explicitly asked for an illustrative representation, so that representation takes priority over subject-matter words such as lifecycle or process.",
      contentPlan: ["Single focal subject", "Composition that supports the requested idea", "Minimal labels unless informative", "Accessible description"],
    });
  }

  if (has(q, /\b(diff|patch|code review|changed files?|change review|pull request review)\b|代码审查|变更审查|补丁|改动对比|差异/i)) {
    return route(request, {
      id: "code-diff-review",
      title: "Code diff review",
      target: "show_canvas",
      modules: ["canvas"],
      templates: ["canvas-diff"],
      style: "analytical",
      reason: "File-level changes need aligned diff evidence and compact review context.",
      contentPlan: ["Review title + change scope", "Per-file diff with additions/deletions", "Concrete findings tied to changed lines", "Risk/verification note only when supported"],
    });
  }

  if (has(q, /\b(todo|to-do|tasks?|checklist|milestones?|work items?)\b|待办|任务清单|检查清单|里程碑/i)) {
    return route(request, {
      id: "task-workflow",
      title: "Task workflow",
      target: "show_canvas",
      modules: ["canvas"],
      templates: ["canvas-todo"],
      style: "workflow",
      reason: "The artifact is stateful task/status content rather than a static diagram.",
      contentPlan: ["Short task objective", "Actionable task list with real status", "Only the next useful host action", "Progress context when it changes a decision"],
    });
  }

  if (has(q, /\b(form|settings?|preferences?|configuration|config|questionnaire|survey|input form)\b|表单|设置|配置|偏好|问卷|填写/i)) {
    return route(request, {
      id: "form-state",
      title: "Stateful form",
      target: "show_canvas",
      modules: ["canvas"],
      templates: ["canvas-form-state"],
      style: "product",
      reason: "The request needs native controls and persistent local state.",
      contentPlan: ["Purpose/context line", "Only required fields", "Inline validation/help when necessary", "One primary completion action"],
    });
  }

  const architectureStrong = has(q, /\b(architecture|system design|topology|infrastructure|c4)\b|架构|系统设计|拓扑|基础设施/i);
  const architectureWeak = has(q, /\b(components?|services?|modules?|dependencies|dependency)\b|组件|服务|模块|依赖/i);
  const visualCue = has(q, /\b(visualize|visualise|visual|diagram|map|graph|draw|show)\b|可视化|图解|图|地图|关系图|画|展示/i);
  const explicitRepresentation = has(q, /\b(timeline|roadmap|process|workflow|flowchart|pipeline|sequence|compare|comparison|versus|\bvs\.?\b|pricing|plans?|options?|alternatives?)\b|时间线|路线图|流程|工作流|流程图|管线|比较|对比|方案|选型/i);
  if (!explicitRepresentation && (architectureStrong || (architectureWeak && visualCue))) {
    const large = has(q, /\b(large|complex|many|15\+|dozens?|full system|deep dive)\b|大型|复杂|很多|十五个以上|全系统|深入/i);
    return route(request, {
      id: "architecture-map",
      title: "System architecture map",
      target: "show_widget",
      modules: ["diagram", "mockup", "runtime"],
      templates: ["architecture-cards"],
      style: "system",
      reason: large ? "A large architecture should use a small topology overview plus grouped detail, rather than cramming every component into one graph." : "Named components and relationships benefit from a neutral system map with compact responsibilities.",
      contentPlan: large
        ? ["System boundary and purpose", "Small overview topology with only major domains", "Grouped component detail cards", "Critical dependencies/data flow", "Constraints/ownership/source when relevant"]
        : ["System boundary and purpose", "Overview relationship map", "Component responsibilities", "Critical dependencies/data flow", "Constraints/legend/source when relevant"],
    });
  }

  if (has(q, /\b(timeline|roadmap|release history|history|milestones?|phases?|implementation stages?)\b|时间线|路线图|发布历史|历史|里程碑|阶段/i)) {
    return route(request, {
      id: "timeline-roadmap",
      title: "Timeline / roadmap",
      target: "show_widget",
      modules: ["diagram", "mockup", "runtime"],
      templates: ["timeline-roadmap"],
      style: "workflow",
      reason: "Chronological milestones are easier to scan on a dedicated timeline than as generic cards or a flowchart.",
      contentPlan: ["Time/phase labels", "Milestone names", "One concrete outcome or decision per milestone", "Current phase when applicable", "Dependencies/exit criteria only when they change sequencing"],
    });
  }

  if (has(q, /\b(process|workflow|flowchart|pipeline|lifecycle|sequence|steps?|state machine|decision flow)\b|流程|工作流|流程图|管线|生命周期|步骤|状态机|决策流/i)) {
    const branched = has(q, /\b(branch|branches|decision|state|pipeline|fan[- ]?out|conditional)\b|分支|判断|状态|管线|条件/i);
    return route(request, {
      id: branched ? "process-network" : "process-linear",
      title: branched ? "Branched process flow" : "Linear process flow",
      target: "show_widget",
      modules: ["diagram", "runtime"],
      templates: [branched ? "flow-mermaid" : "flow-steps"],
      style: "workflow",
      reason: branched ? "The flow has branches/states, so automatic graph layout is safer than hand placement." : "A small ordered sequence is clearer as a quiet step rail than a full graph.",
      contentPlan: ["One-line process scope", "Only decision-relevant steps/states", "Branch conditions on edges when present", "Start/end or outcome", "Exceptions only when they change the path"],
    });
  }

  if (has(q, /\b(compare|comparison|versus|\bvs\.?\b|pricing|plans?|options?|alternatives?|trade[- ]?offs?|selection)\b|比较|对比|方案|选型|价格方案|取舍/i)) {
    return route(request, {
      id: "option-comparison",
      title: "Option comparison",
      target: "show_widget",
      modules: ["mockup", "interactive", "runtime"],
      templates: ["compare-cards"],
      style: "comparison",
      reason: "Aligned option columns make trade-offs and recommendation criteria easier to scan.",
      contentPlan: ["Decision criterion/context", "2–4 aligned options", "Comparable attributes in the same order", "One recommendation accent at most", "Explicit trade-off or caveat"],
    });
  }

  if (has(q, /\b(contact|profile|receipt|invoice|record|customer|person detail|order detail)\b|联系人|资料卡|档案|收据|发票|记录详情|客户|订单详情/i)) {
    return route(request, {
      id: "record-detail",
      title: "Record detail",
      target: "show_widget",
      modules: ["mockup", "runtime"],
      templates: ["contact-card"],
      style: "record",
      reason: "A bounded object reads best as a compact key/value record rather than a dashboard.",
      contentPlan: ["Identity/title", "Primary fields", "Secondary metadata grouped quietly", "Status only when meaningful", "One contextual action only if requested"],
    });
  }

  const chartIntent = has(q, /\b(chart|graph|trend|time series|timeseries|metrics?|kpi|traffic|latency|performance|growth|distribution|bar chart|line chart|pie chart)\b|图表|趋势|时序|指标|流量|延迟|性能|增长|分布|柱状图|折线图|饼图/i);
  if (chartIntent) {
    const multi = has(q, /\b(dashboard|breakdown|multiple|multi[- ]?series|several|overview|drill[- ]?down)\b|仪表盘|看板|多指标|多序列|拆解|总览/i);
    return route(request, {
      id: multi ? "multi-chart-analysis" : "single-chart",
      title: multi ? "Multi-chart analysis" : "Focused chart",
      target: multi ? "show_canvas" : "show_widget",
      modules: multi ? ["canvas"] : ["chart", "runtime"],
      templates: [multi ? "canvas-charts" : "metric-chart"],
      style: "analytical",
      reason: multi ? "Several related measures need a composed analytical artifact." : "A single quantitative story is clearer as one focused chart without dashboard chrome.",
      contentPlan: ["Specific metric title + unit + time range", "Plot as the primary artifact", "Direct labels/key values where useful", "One evidence-based takeaway", "Source + recency"],
    });
  }

  if (has(q, /\b(dashboard|audit|review|findings?|analysis|report|incident|security review|assessment|brief)\b|仪表盘|审计|复盘|发现|分析|报告|事件|安全审查|评估|简报/i)) {
    return route(request, {
      id: "evidence-brief",
      title: "Evidence brief",
      target: "show_canvas",
      modules: ["canvas"],
      templates: ["canvas-brief"],
      style: "editorial",
      reason: "The user needs a complete analytical artifact with context, evidence, and a clear takeaway—not just UI chrome.",
      contentPlan: ["Title + scope/time/source context", "One-sentence takeaway grounded in evidence", "Primary evidence table/chart/list", "2–4 supporting findings with concrete values", "Caveat or uncertainty when material", "Source/recency footer"],
    });
  }

  if (has(q, /\b(mockup|wireframe|interface|screen|page|ui design|ux design|product ui)\b|界面|页面|原型|线框|UI设计|UX设计|产品界面/i)) {
    return route(request, {
      id: "ui-mockup",
      title: "Product UI mockup",
      target: "show_widget",
      modules: ["mockup", "interactive", "runtime"],
      templates: [],
      style: "product",
      reason: "The request is about an interface state itself, so native HTML controls and a focused product surface are the right medium.",
      contentPlan: ["One realistic screen/state", "Realistic labels and populated example content", "Primary task path", "Only requested controls", "Empty/error/loading states only when part of the task"],
    });
  }

  if (has(q, /\b(interactive explainer|simulation|simulator|calculator|playground|explorer)\b|交互解释|模拟器|计算器|探索器|可调/i)) {
    return route(request, {
      id: "interactive-explainer",
      title: "Interactive explainer",
      target: "show_widget",
      modules: ["interactive", "mockup", "runtime"],
      templates: [],
      style: "product",
      reason: "The visual's value comes from a small local interaction rather than persistent application state.",
      contentPlan: ["Immediate useful default state", "One primary visual/output", "Only controls that materially change that output", "Visible cause→effect feedback", "Agent follow-up only when reasoning is required"],
    });
  }

  if (has(q, /\b(visualize|visualise|visual|show me|make this visual)\b|可视化|图解|视觉化|展示成图|做成图/i)) {
    return route(request, {
      id: "visual-brief",
      title: "Structured visual brief",
      target: "show_canvas",
      modules: ["canvas"],
      templates: ["canvas-brief"],
      style: "editorial",
      reason: "The user asked for a visual but did not specify a narrower representation; a complete evidence-first brief is the safest default.",
      contentPlan: ["Title + concise context", "Primary point or artifact", "Evidence/details that make the artifact self-contained", "Source/recency when factual", "No ornamental controls"],
    });
  }

  return route(request, {
    id: "text-first",
    title: "Text-first answer",
    target: "markdown",
    modules: [],
    templates: [],
    style: "editorial",
    reason: "No strong visual structure is implied; avoid creating UI merely because visualization tools are available.",
    contentPlan: ["Answer in prose first", "Use a compact table only for genuine comparison", "Escalate to a visual only if it improves understanding or a decision"],
  });
}

const STYLE_RULES: Record<VisualStyle, string[]> = {
  editorial: ["Narrative hierarchy first; one strong takeaway, then evidence", "Use open sections rather than card walls", "Keep supporting metadata quiet"],
  analytical: ["Plot/table is the dominant artifact", "Right-align numbers and use tabular numerals", "Use semantic color only for meaning or thresholds"],
  system: ["Neutral nodes and connectors; one accent max", "Keep node labels short; put responsibilities outside dense boxes", "Prefer automatic layout for graphs"],
  comparison: ["Align attributes and ordering across options", "One highlighted recommendation max", "Keep differences explicit and scannable"],
  record: ["Compact key/value hierarchy", "Group secondary metadata without extra chrome", "Avoid dashboard metrics for bounded objects"],
  workflow: ["Make sequence and state unmistakable", "Use short action labels", "Show branches only when they change the outcome"],
  product: ["Use semantic native controls", "One primary task per screen", "Populate realistic content; do not present empty skeleton UI"],
  illustrative: ["One focal composition", "Decoration must serve the idea", "Keep labels sparse and accessible"],
};

export function formatVisualRoute(route: VisualRoute): string {
  const template = route.templates.length ? route.templates.map((id) => "`" + id + "`").join(", ") : "none";
  const modules = route.modules.length ? route.modules.map((id) => "`" + id + "`").join(", ") : "none";
  const styleRules = STYLE_RULES[route.style].map((rule) => "- " + rule).join("\n");
  const content = route.contentPlan.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return `## Auto route\n\n- Route: \`${route.id}\` — ${route.title}\n- Target: \`${route.target}\`\n- Style: \`${route.style}\`\n- Modules: ${modules}\n- Template: ${template}\n- Why: ${route.reason}\n- Retrieval: \`${route.research}\` — ${route.researchInstruction}\n\n### Unified UI/UX contract\n\n- Content anatomy: context → one dominant artifact → evidence/detail → source/recency → action only when needed. No empty shell UI.\n- Typography: 24px title, 18px section, 16px subheading, 14px body, 12px metadata; sentence case.\n- Spacing: use the 4/8/12/16/24/32 rhythm. Prefer 8px small gaps, 12–16px section internals, 24px major separation.\n- Surfaces: transparent page; flat secondary surfaces only when grouping is necessary; 1px semantic borders; 6–12px radii.\n- Color: host theme tokens only for UI chrome; neutral base + one accent max; semantic colors only when they encode status/meaning.\n- Responsive: one-column reading order must remain intact around 320px; rows wrap/stack; avoid fixed outer widths and nested scrolling.\n- Accessibility: semantic controls, visible labels, native focus, and non-color encodings for meaning.\n- Grounding: demo/template values are structure examples only. Replace them with supplied or retrieved evidence before rendering. Every visual render must pass the host-enforced grounding declaration; factual artifacts use \`grounded\` with structured sources, while genuinely non-factual artifacts use \`not_applicable\` with a reason. Grounded provenance is rendered by the host, not left to prompt compliance.\n\n### Style profile\n\n${styleRules}\n\n### Minimum content plan\n\n${content}\n`;
}
