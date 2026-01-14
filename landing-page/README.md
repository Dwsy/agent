# Pi Agent Landing Page

Autonomous AI orchestrator landing page, showcasing the 5-phase workflow, 20+ professional skills, and multi-model collaboration system.

## Features

- **5-Phase Mandatory Workflow**: Context Retrieval → Analysis → Prototyping → Implementation → Audit
- **20+ Professional Skills**: ace-tool, ast-grep, workhub, system-design, and more
- **5 Specialized Subagents**: scout, worker, planner, reviewer, brainstormer
- **Multi-Model Collaboration**: Claude + Codex + Gemini integration
- **Bilingual i18n Support**: Chinese/English with real-time switching
- **Enterprise Architecture**: Professional design with Bento Grid layout
- **Dark Mode First**: OLED-friendly theme with WCAG AA compliance
- **Responsive Design**: Mobile-first approach for all devices

## Tech Stack

- **Runtime**: Bun (ultra-fast JavaScript runtime)
- **UI Framework**: Lit Web Components
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + Custom CSS
- **Language**: TypeScript (strict mode)
- **Fonts**: Space Grotesk (headings) + DM Sans (body) + Noto Sans SC (Chinese)

## Design System

### Colors
- **Primary**: #2563EB (Blue)
- **Secondary**: #8B5CF6 (Purple)
- **Accent**: #F97316 (Orange)
- **Background**: #0F172A (Slate-900) → #0A0F1E (Deep)
- **Text**: #F1F5F9 (Slate-100)
- **Border**: #334155 (Slate-700)

### Typography
- **Headings**: Space Grotesk (modern, tech-forward)
- **Body**: DM Sans (highly readable)
- **Code**: JetBrains Mono (developer-friendly)

## Quick Start

### Development

```bash
cd landing-page
bun install
bun run dev
```

Open http://localhost:3000 in your browser.

### Production Build

```bash
bun run build
```

Built files will be in `./docs/` directory.

### Preview Production Build

```bash
bun run preview
```

## Component Structure

```
src/
├── components/
│   ├── Navbar.ts          # Floating navigation with lang switch
│   ├── HeroSection.ts     # Hero with workflow intro
│   ├── WorkflowSection.ts # 5-phase workflow visualization
│   ├── BentoGrid.ts       # Skills & features showcase
│   ├── TechSpecs.ts       # Models, skills, subagents, protocols
│   ├── CTASection.ts      # Call to action
│   └── Footer.ts          # Site footer
├── i18n/
│   ├── i18n-manager.ts    # Internationalization system
│   └── locales/
│       ├── zh-CN.ts       # Chinese translations
│       └── en-US.ts       # English translations
├── App.ts                 # Main app component
├── main.ts                # Entry point
└── app.css                # Global styles & theme
```

## Sections

1. **Navbar**: Floating with language switch (CN ⇄ EN)
2. **Hero**: Autonomous AI orchestrator intro
3. **Workflow**: 5-phase mandatory workflow visualization
4. **Features**: 20+ skills in Bento Grid layout
5. **Tech Specs**: Models, skills, subagents, protocols
6. **CTA**: Final section for getting started
7. **Footer**: Links and social media

## Key Content Highlights

### 5-Phase Workflow
1. **Phase 1**: Context Retrieval (ace-tool/ast-grep)
2. **Phase 2**: Analysis & Planning (complex tasks only)
3. **Phase 3**: Prototyping (Gemini → Unified Diff)
4. **Phase 4**: Implementation (refactoring)
5. **Phase 5**: Audit & Delivery (mandatory code review)

### 20+ Professional Skills
- ace-tool: Semantic code search
- ast-grep: AST-aware operations
- workhub: Document management
- system-design: Architecture design
- sequential-thinking: Reasoning
- tmux: Terminal management
- And 15+ more...

### 5 Specialized Subagents
- scout: Quick reconnaissance
- worker: Deep analysis
- planner: Task planning
- reviewer: Code review
- brainstormer: Design exploration

### Enterprise Protocols
- SSOT: Single Source of Truth
- Filesystem as Memory
- Code Sovereignty
- Sandbox Security

## Customization

### i18n (国际化)

The landing page supports bilingual switching (Chinese/English). To add new translations or languages, see [I18N.md](./I18N.md).

**Quick usage:**

```typescript
import { i18n } from "../i18n/i18n-manager";

// Get translation
i18n.t("hero.title")

// Change language
i18n.setLocale("en-US")

// Subscribe to changes
i18n.subscribe(() => this.requestUpdate())
```

### Colors

Edit `src/app.css` theme variables:

```css
@theme {
  --color-pi-primary: #2563EB;
  --color-pi-secondary: #8B5CF6;
  /* ... */
}
```

### Fonts

Change Google Fonts in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Content

Edit component `.ts` files to update text, icons, and structure.

## Best Practices

### Icons
- ✅ Use SVG icons (Heroicons style)
- ❌ No emojis as UI elements
- ✅ Consistent 24x24 viewBox
- ✅ Fixed sizing with Tailwind utilities

### Interactions
- ✅ `cursor-pointer` on clickable elements
- ✅ `transition-colors duration-200` on hover
- ❌ No `scale` transforms (layout shift)
- ✅ Hover feedback (color, shadow, border)

### Light/Dark Mode
- ✅ Glass cards with `rgba(30, 41, 59, 0.5)` in dark mode
- ✅ High contrast text (#F1F5F9, not #94A3B8)
- ✅ Visible borders (#334155, not transparent)
- ✅ Emission control (no neon overkill)

### Accessibility
- ✅ Semantic HTML elements
- ✅ Focus visible states
- ✅ `prefers-reduced-motion` support
- ✅ ARIA labels on interactive elements
- ✅ Proper heading hierarchy

## Deployment

Build outputs to `./docs/` directory. Deploy to:

- **Vercel**: `vercel --prod`
- **Netlify**: Drag `docs` folder to deploy
- **GitHub Pages**: Set source to `docs` folder
- **Cloudflare Pages**: Set output directory to `docs`

## Performance

- Build time: <200ms
- Bundle size: ~54KB (gzipped: 13KB)
- Lighthouse score:
  - Performance: 95+
  - Accessibility: 100
  - Best Practices: 100
  - SEO: 100

## License

MIT

## Credits

Design by Pi Agent Team
Icons from Heroicons (MIT)
Fonts from Google Fonts