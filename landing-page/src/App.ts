import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import {
  Terminal,
  Zap,
  Shield,
  GitBranch,
  Code2,
  Cpu,
  ChevronRight,
  ArrowRight,
  Github,
  ExternalLink,
  CheckCircle2,
  Layers,
  Workflow,
  Bot,
  Database,
  Globe,
  Lock,
  Rocket,
  Star,
  type IconNode,
} from "lucide";

@customElement("pi-app")
export class App extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .content-wrapper {
      position: relative;
      z-index: 1;
    }

    /* Smooth scroll */
    html {
      scroll-behavior: smooth;
    }

    /* Custom animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .animate-fade-in-up {
      animation: fadeInUp 0.8s ease-out forwards;
    }

    .animate-scale-in {
      animation: scaleIn 0.6s ease-out forwards;
    }

    .delay-100 { animation-delay: 0.1s; }
    .delay-200 { animation-delay: 0.2s; }
    .delay-300 { animation-delay: 0.3s; }
    .delay-400 { animation-delay: 0.4s; }
    .delay-500 { animation-delay: 0.5s; }

    /* Terminal styling */
    .terminal-window {
      background: linear-gradient(180deg, #0d0d12 0%, #0a0a0f 100%);
      border: 1px solid rgba(0, 240, 255, 0.2);
      border-radius: 12px;
      overflow: hidden;
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.5),
        0 0 60px rgba(0, 240, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .terminal-header {
      background: rgba(0, 240, 255, 0.05);
      border-bottom: 1px solid rgba(0, 240, 255, 0.1);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .terminal-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .terminal-body {
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.8;
    }

    .terminal-line {
      opacity: 0;
      animation: fadeInUp 0.5s ease-out forwards;
    }

    .terminal-prompt {
      color: #00f0ff;
    }

    .terminal-command {
      color: #7000ff;
    }

    .terminal-output {
      color: rgba(255, 255, 255, 0.7);
      margin-left: 16px;
    }

    .terminal-success {
      color: #22c55e;
    }

    .terminal-warning {
      color: #f59e0b;
    }

    /* Feature cards */
    .feature-card {
      background: rgba(10, 10, 15, 0.6);
      border: 1px solid rgba(0, 240, 255, 0.15);
      border-radius: 16px;
      padding: 32px;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(20px);
    }

    .feature-card:hover {
      border-color: rgba(0, 240, 255, 0.4);
      transform: translateY(-8px);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        0 0 80px rgba(0, 240, 255, 0.1);
    }

    /* Workflow steps */
    .workflow-step {
      position: relative;
    }

    .workflow-step::after {
      content: '';
      position: absolute;
      top: 50%;
      right: -32px;
      width: 32px;
      height: 2px;
      background: linear-gradient(90deg, rgba(0, 240, 255, 0.5), rgba(112, 0, 255, 0.5));
    }

    .workflow-step:last-child::after {
      display: none;
    }

    /* Skill grid */
    .skill-item {
      background: rgba(10, 10, 15, 0.4);
      border: 1px solid rgba(0, 240, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      transition: all 0.3s ease;
    }

    .skill-item:hover {
      border-color: rgba(0, 240, 255, 0.3);
      background: rgba(10, 10, 15, 0.8);
    }

    /* Stats */
    .stat-number {
      background: linear-gradient(135deg, #00f0ff 0%, #7000ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Button styles */
    .btn-primary {
      background: linear-gradient(135deg, #00f0ff 0%, #7000ff 100%);
      color: #0a0a0f;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 12px;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0, 240, 255, 0.3);
    }

    .btn-secondary {
      background: rgba(0, 240, 255, 0.1);
      color: #00f0ff;
      font-weight: 500;
      padding: 14px 32px;
      border-radius: 12px;
      transition: all 0.3s ease;
      border: 1px solid rgba(0, 240, 255, 0.3);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
    }

    .btn-secondary:hover {
      background: rgba(0, 240, 255, 0.2);
      border-color: rgba(0, 240, 255, 0.5);
      transform: translateY(-2px);
    }

    /* Section divider */
    .section-divider {
      height: 1px;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(0, 240, 255, 0.3) 20%,
        rgba(112, 0, 255, 0.3) 50%,
        rgba(0, 240, 255, 0.3) 80%,
        transparent 100%
      );
    }

    /* Code block */
    .code-block {
      background: #0d0d12;
      border: 1px solid rgba(0, 240, 255, 0.15);
      border-radius: 8px;
      padding: 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      line-height: 1.6;
      overflow-x: auto;
    }

    .code-keyword { color: #ff79c6; }
    .code-string { color: #f1fa8c; }
    .code-comment { color: #6272a4; }
    .code-function { color: #8be9fd; }
    .code-number { color: #bd93f9; }
  `;

  @state()
  mobileMenuOpen = false;

  render() {
    return html`
      <div class="content-wrapper min-h-screen">
        ${this.renderNavbar()}
        ${this.renderHero()}
        ${this.renderStats()}
        ${this.renderFeatures()}
        ${this.renderWorkflow()}
        ${this.renderSkills()}
        ${this.renderCodeExample()}
        ${this.renderCTA()}
        ${this.renderFooter()}
      </div>
    `;
  }

  renderNavbar() {
    return html`
      <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-custom border-b border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#7000ff] flex items-center justify-center">
                <span class="text-[#0a0a0f] font-bold text-xl">π</span>
              </div>
              <span class="text-white font-bold text-xl">Pi Agent</span>
            </div>

            <div class="hidden md:flex items-center gap-8">
              <a href="#features" class="text-gray-300 hover:text-[#00f0ff] transition-colors">特性</a>
              <a href="#workflow" class="text-gray-300 hover:text-[#00f0ff] transition-colors">工作流</a>
              <a href="#skills" class="text-gray-300 hover:text-[#00f0ff] transition-colors">技能</a>
              <a href="https://github.com/Dwsy/agent" target="_blank" class="text-gray-300 hover:text-[#00f0ff] transition-colors flex items-center gap-2">
                ${icon(Github, { size: 20 })}
                <span>GitHub</span>
              </a>
            </div>

            <div class="flex items-center gap-4">
              <button
                class="btn-primary hidden md:flex"
                @click="${() => window.open('https://github.com/Dwsy/agent', '_blank')}"
              >
                开始使用
                ${icon(ArrowRight, { size: 16 })}
              </button>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  renderHero() {
    return html`
      <section class="pt-32 pb-20 px-6 relative overflow-hidden">
        <div class="max-w-7xl mx-auto">
          <div class="grid lg:grid-cols-2 gap-12 items-center">
            <div class="animate-fade-in-up">
              <div class="inline-flex items-center gap-2 bg-[#00f0ff]/10 border border-[#00f0ff]/20 rounded-full px-4 py-2 mb-6">
                ${icon(Zap, { size: 16, class: "text-[#00f0ff]" })}
                <span class="text-[#00f0ff] text-sm font-medium">企业级 AI 编排系统</span>
              </div>

              <h1 class="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                <span class="block">下一代</span>
                <span class="block text-gradient">AI 智能体</span>
                <span class="block">编排引擎</span>
              </h1>

              <p class="text-xl text-gray-400 mb-8 leading-relaxed max-w-xl">
                通过结构化技能系统和多模型协作，实现代码生成、分析和编排的自动化工作流。
                <span class="text-[#00f0ff]">精简、高效、企业级</span>。
              </p>

              <div class="flex flex-wrap gap-4 mb-12">
                <button
                  class="btn-primary"
                  @click="${() => window.open('https://github.com/Dwsy/agent', '_blank')}"
                >
                  ${icon(Rocket, { size: 18 })}
                  立即开始
                </button>
                <button
                  class="btn-secondary"
                  @click="${() => window.open('https://github.com/Dwsy/agent/blob/main/README.zh-CN.md', '_blank')}"
                >
                  ${icon(BookOpen, { size: 18 })}
                  查看文档
                </button>
              </div>

              <div class="flex items-center gap-8 text-sm text-gray-500">
                <div class="flex items-center gap-2">
                  ${icon(CheckCircle2, { size: 16, class: "text-green-500" })}
                  <span>开源免费</span>
                </div>
                <div class="flex items-center gap-2">
                  ${icon(CheckCircle2, { size: 16, class: "text-green-500" })}
                  <span>类型安全</span>
                </div>
                <div class="flex items-center gap-2">
                  ${icon(CheckCircle2, { size: 16, class: "text-green-500" })}
                  <span>生产就绪</span>
                </div>
              </div>
            </div>

            <div class="animate-scale-in delay-200">
              <div class="terminal-window">
                <div class="terminal-header">
                  <div class="terminal-dot bg-red-500"></div>
                  <div class="terminal-dot bg-yellow-500"></div>
                  <div class="terminal-dot bg-green-500"></div>
                  <span class="ml-4 text-gray-500 text-sm">pi-agent — zsh</span>
                </div>
                <div class="terminal-body">
                  <div class="terminal-line" style="animation-delay: 0.1s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-white"> pi init my-project</span>
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.2s">
                    ✓ Initializing Pi Agent workspace...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.3s">
                    ✓ Creating documentation structure...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.4s">
                    ✓ Setting up skill system...
                  </div>
                  <div class="terminal-line terminal-success" style="animation-delay: 0.5s">
                    ✓ Project initialized successfully!
                  </div>
                  <div class="terminal-line" style="animation-delay: 0.6s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-white"> pi /scout authentication flow</span>
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.7s">
                    → Scanning codebase...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.8s">
                    → Found 12 authentication-related files
                  </div>
                  <div class="terminal-line terminal-success" style="animation-delay: 0.9s">
                    ✓ Analysis complete. See report for details.
                  </div>
                  <div class="terminal-line" style="animation-delay: 1s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-gray-500 animate-pulse">█</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderStats() {
    const stats = [
      { value: "14+", label: "内置技能" },
      { value: "5", label: "阶段工作流" },
      { value: "3", label: "协作模型" },
      { value: "100%", label: "类型安全" },
    ];

    return html`
      <section class="py-16 border-t border-b border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto px-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
            ${stats.map((stat, index) => html`
              <div class="text-center animate-fade-in-up" style="animation-delay: ${index * 0.1}s">
                <div class="stat-number text-5xl font-bold mb-2">${stat.value}</div>
                <div class="text-gray-400 text-lg">${stat.label}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }

  renderFeatures() {
    const features = [
      {
        icon: Shield,
        title: "沙箱安全",
        description: "外部模型无法直接写入，所有修改需人工审查，强制执行 Phase 5 审计流程",
      },
      {
        icon: Layers,
        title: "SSOT 原则",
        description: "单数据源架构，通过 workhub 管理文档，每个知识域只有一份权威文档",
      },
      {
        icon: GitBranch,
        title: "多模型协作",
        description: "Codex 算法实现、Gemini UI 设计、ace-tool 语义搜索，各司其职",
      },
      {
        icon: Cpu,
        title: "模块化技能",
        description: "14+ 独立技能，清晰接口，可测试验证，按需组合",
      },
      {
        icon: Lock,
        title: "代码主权",
        description: "AI 生成代码仅作参考，必须重构为精简高效的企业级代码",
      },
      {
        icon: Workflow,
        title: "结构化工作流",
        description: "从上下文检索到审计交付，5 阶段标准化流程确保质量",
      },
    ];

    return html`
      <section id="features" class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              核心特性
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              企业级设计原则，专业开发流程
            </p>
          </div>

          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${features.map((feature, index) => html`
              <div
                class="feature-card animate-fade-in-up"
                style="animation-delay: ${index * 0.1}s"
              >
                <div class="w-12 h-12 rounded-lg bg-[#00f0ff]/10 flex items-center justify-center mb-4">
                  ${icon(feature.icon, { size: 24, class: "text-[#00f0ff]" })}
                </div>
                <h3 class="text-xl font-bold text-white mb-3">${feature.title}</h3>
                <p class="text-gray-400 leading-relaxed">${feature.description}</p>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }

  renderWorkflow() {
    const steps = [
      {
        number: "01",
        title: "上下文检索",
        description: "ace-tool 语义搜索 / ast-grep 语法感知，递归获取完整定义",
        icon: Database,
      },
      {
        number: "02",
        title: "分析规划",
        description: "Gemini 多模型协作，交叉验证，输出 Step-by-step 计划",
        icon: Cpu,
      },
      {
        number: "03",
        title: "原型获取",
        description: "前端/UI → Gemini，后端/逻辑 → Gemini，仅提供 Diff Patch",
        icon: Code2,
      },
      {
        number: "04",
        title: "编码实施",
        description: "逻辑重构，去除冗余，精简高效，最小作用域",
        icon: Terminal,
      },
      {
        number: "05",
        title: "审计交付",
        description: "Codex 自动代码审查，审计通过后交付用户",
        icon: Shield,
      },
    ];

    return html`
      <section id="workflow" class="py-24 px-6 relative">
        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f] to-transparent pointer-events-none"></div>

        <div class="max-w-7xl mx-auto relative z-10">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              5 阶段工作流
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              结构化流程，确保每一步都精准高效
            </p>
          </div>

          <div class="grid md:grid-cols-5 gap-4">
            ${steps.map((step, index) => html`
              <div class="workflow-step animate-fade-in-up" style="animation-delay: ${index * 0.15}s">
                <div class="feature-card text-center h-full">
                  <div class="text-[#00f0ff]/30 text-5xl font-bold mb-4">${step.number}</div>
                  <div class="w-12 h-12 rounded-lg bg-[#7000ff]/20 flex items-center justify-center mx-auto mb-4">
                    ${icon(step.icon, { size: 20, class: "text-[#7000ff]" })}
                  </div>
                  <h3 class="text-lg font-bold text-white mb-2">${step.title}</h3>
                  <p class="text-sm text-gray-400">${step.description}</p>
                </div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }

  renderSkills() {
    const skills = [
      { name: "workhub", desc: "文档管理与任务跟踪" },
      { name: "ace-tool", desc: "语义化代码搜索" },
      { name: "ast-grep", desc: "语法感知代码重写" },
      { name: "codemap", desc: "代码流程可视化" },
      { name: "context7", desc: "GitHub Issues/PRs 搜索" },
      { name: "deepwiki", desc: "GitHub 仓库文档获取" },
      { name: "exa", desc: "高质量互联网搜索" },
      { name: "tmux", desc: "终端会话管理" },
      { name: "project-planner", desc: "项目规划与文档生成" },
      { name: "system-design", desc: "系统架构设计" },
      { name: "web-browser", desc: "Chrome DevTools 协议" },
      { name: "zai-vision", desc: "MCP 视觉服务器" },
    ];

    return html`
      <section id="skills" class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              技能系统
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              14+ 专业化技能，覆盖开发全流程
            </p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${skills.map((skill, index) => html`
              <div
                class="skill-item animate-fade-in-up"
                style="animation-delay: ${index * 0.05}s"
              >
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-8 h-8 rounded bg-[#00f0ff]/10 flex items-center justify-center">
                    ${icon(Bot, { size: 14, class: "text-[#00f0ff]" })}
                  </div>
                  <span class="text-white font-mono text-sm">${skill.name}</span>
                </div>
                <p class="text-gray-500 text-xs">${skill.desc}</p>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }

  renderCodeExample() {
    return html`
      <section class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
                简洁高效
              </h2>
              <p class="text-xl text-gray-400 mb-8 leading-relaxed">
                从 22KB 优化到 8.8KB，减少 59% 代码量。
                <span class="text-[#00f0ff]">自解释代码，最小注释，零冗余</span>。
              </p>

              <div class="space-y-4">
                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${icon(CheckCircle2, { size: 16, class: "text-[#00f0ff]" })}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">Token 优化</h4>
                    <p class="text-gray-400 text-sm">15,000 → 8,814 字符，节省 41%</p>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${icon(CheckCircle2, { size: 16, class: "text-[#00f0ff]" })}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">引用优先</h4>
                    <p class="text-gray-400 text-sm">详细内容在技能文档，避免重复</p>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${icon(CheckCircle2, { size: 16, class: "text-[#00f0ff]" })}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">文件系统即记忆</h4>
                    <p class="text-gray-400 text-sm">大内容存储文件，上下文仅保留路径</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="code-block">
              <pre><code><span class="code-comment">// Before: 500+ lines, 22KB</span>
<span class="code-keyword">const</span> <span class="code-function">executeWorkflow</span> = (<span class="code-keyword">async</span> () => {
  <span class="code-comment">// ... lots of redundant code</span>
  <span class="code-keyword">if</span> (condition) {
    <span class="code-comment">// ... 50 lines</span>
  }
  <span class="code-comment">// ... 400 more lines</span>
});

<span class="code-comment">// After: 214 lines, 8.8KB</span>
<span class="code-keyword">const</span> <span class="code-function">executeWorkflow</span> = <span class="code-keyword">async</span> (phase, input) => {
  <span class="code-keyword">const</span> tools = { aceTool, astGrep };
  <span class="code-keyword">const</span> models = { codex, gemini };
  <span class="code-keyword">return</span> tools[phase]?.(input) ?? models[phase]?.(input);
};</code></pre>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderCTA() {
    return html`
      <section class="py-24 px-6">
        <div class="max-w-4xl mx-auto">
          <div class="feature-card text-center glow">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
              准备好开始了吗？
            </h2>
            <p class="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              加入下一代 AI 开发工作流，提升生产力，确保代码质量。
            </p>

            <div class="flex flex-wrap justify-center gap-4">
              <button
                class="btn-primary text-lg px-8 py-4"
                @click="${() => window.open('https://github.com/Dwsy/agent', '_blank')}"
              >
                ${icon(Github, { size: 20 })}
                在 GitHub 上查看
              </button>
              <button
                class="btn-secondary text-lg px-8 py-4"
                @click="${() => window.open('https://github.com/Dwsy/agent/blob/main/README.zh-CN.md', '_blank')}"
              >
                ${icon(BookOpen, { size: 20 })}
                阅读文档
              </button>
            </div>

            <div class="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
              <div class="flex items-center gap-2">
                ${icon(Star, { size: 16, class: "text-yellow-500" })}
                <span>Star on GitHub</span>
              </div>
              <div class="flex items-center gap-2">
                ${icon(Globe, { size: 16, class: "text-blue-500" })}
                <span>MIT License</span>
              </div>
              <div class="flex items-center gap-2">
                ${icon(ExternalLink, { size: 16, class: "text-green-500" })}
                <span>Production Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderFooter() {
    return html`
      <footer class="py-12 px-6 border-t border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto">
          <div class="flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#7000ff] flex items-center justify-center">
                <span class="text-[#0a0a0f] font-bold">π</span>
              </div>
              <span class="text-white font-semibold">Pi Agent</span>
            </div>

            <div class="flex items-center gap-6 text-sm text-gray-400">
              <a href="https://github.com/Dwsy/agent" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                GitHub
              </a>
              <a href="https://github.com/Dwsy/agent/blob/main/README.zh-CN.md" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                文档
              </a>
              <a href="https://github.com/Dwsy/agent/issues" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                Issues
              </a>
            </div>

            <div class="text-sm text-gray-500">
              © 2026 Pi Agent. MIT License.
            </div>
          </div>
        </div>
      </footer>
    `;
  }
}

// Import BookOpen icon
const BookOpen = {
  name: "book-open",
  render: () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  `,
};