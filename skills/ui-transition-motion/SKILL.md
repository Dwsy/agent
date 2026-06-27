---
name: ui-transition-motion
description: Use when user asks to design, choose, explain, or implement UI transitions, motion patterns, easing/timing choices, state-change animations, shared-element effects, drill-down navigation, tab/filter/list/detail switching, or vague requests like "make this feel smoother", "more iOS", "more natural", or "animate this UI" that need concrete motion taxonomy and implementation guidance.
---

# UI Transition Motion

Use this skill to turn vague motion requests into a concrete transition choice.

Core idea: most premium UI motion in product work can be framed as one of three transition families:

- `Context Transition`: content changes inside same surrounding layout.
- `Drill Transition`: user moves from broad view into deeper detail.
- `Continuity Transition`: shared element persists and morphs into next state.

Read [references/three-transition-reference.md](references/three-transition-reference.md) when you need fuller definitions, examples, prompt snippets, or platform mapping.

Read [references/web-motion-principles.md](references/web-motion-principles.md) when user needs better timing, easing, performance, or the answer to `why does this motion feel wrong?`.

Read [references/web-pattern-catalog.md](references/web-pattern-catalog.md) when user needs concrete UI motion patterns such as modal open/close, panel reveal, text swap, icon swap, badge pop, page transition, number animation, or card resize.

## Workflow

1. Identify what is changing.
2. Classify transition family.
3. Explain why that family fits.
4. Describe motion behavior in product language.
5. If user wants implementation, map it to concrete APIs for that stack.
6. If motion feels off, diagnose timing, easing, animated properties, and hierarchy before changing style.

## Fast Classification

Choose `Context Transition` when:

- surrounding frame stays same
- content swaps inside fixed area
- user is still in same page context
- examples: tabs, filters, segmented controls, list state changes, panel content refresh

Choose `Drill Transition` when:

- user goes from summary to detail
- hierarchy deepens by one level
- navigation should feel like entering a sub-layer
- examples: list item to detail page, feed to post, folder to subfolder, dashboard card to detailed view

Choose `Continuity Transition` when:

- one visible element exists in both states
- that element should keep identity while resizing, expanding, or morphing
- spatial continuity matters more than simple navigation depth
- examples: card to fullscreen, avatar to profile sheet, mini player to full player, FAB to radial/menu surface

## Decision Rules

Use this order:

1. If there is a strong shared element across states, prefer `Continuity Transition`.
2. Else if user is clearly entering deeper hierarchy, use `Drill Transition`.
3. Else use `Context Transition`.

This prevents overusing dramatic shared-element motion for ordinary content swaps.

## Motion Principles

Do not treat motion as decoration. Treat it as interaction semantics plus perceptual tuning.

- choose transition family first
- then choose timing and easing
- animate properties that preserve performance, usually `transform` and `opacity`
- make motion reinforce hierarchy, not fight it
- use strongest motion on structure changes, lighter motion on local state changes

If user says motion feels wrong, inspect these in order:

1. Wrong transition family
2. Wrong easing curve
3. Wrong duration
4. Wrong animated properties
5. Too much motion on secondary elements

## Output Format

When advising user or another model, structure answer like this:

```md
Transition choice: [Context | Drill | Continuity]
Reason: [one concise sentence]
Motion spec:
- [key visual behavior]
- [what stays stable]
- [what moves or transforms]
Prompt snippet:
"..."
Implementation notes:
- [stack-specific API or CSS/animation hint]
```

## Prompting Rules

Avoid vague motion guidance like `make it dynamic` or `add nice animation`.

Instead, name:

- transition family
- what remains visually stable
- what changes
- spatial direction or morphing behavior
- easing character: crisp, gentle, springy, inertial, decelerated
- duration band: fast, moderate, deliberate
- desired feeling: calm, premium, fast, spatial, layered, immersive

For stronger prompts, also name:

- entry behavior
- exit behavior
- interruption behavior
- whether motion is reversible
- whether shared elements must preserve radius, scale, and clipping continuity

## Implementation Guidance

For web and React:

- `Context Transition`: prefer content crossfade, subtle translate, or View Transitions API while keeping shell stable.
- `Drill Transition`: use directional slide/scale with clear enter/back relationship.
- `Continuity Transition`: use shared-element techniques such as Framer Motion `layoutId`, Motion `layout`, or platform view transitions.

For motion quality:

- prefer animating `transform` and `opacity` over layout-heavy properties
- use springs for interruptible UI state changes and continuity-heavy expansion
- use duration-based easing for simple one-shot reveals, fades, and microfeedback
- keep enter and exit asymmetry intentional; exit can be slightly faster than enter
- blur can help perception during text/icon/content swaps, but keep it subtle

When implementing common app motion, start from pattern families in [references/web-pattern-catalog.md](references/web-pattern-catalog.md) instead of inventing motion from scratch.

For native platforms:

- map `Continuity Transition` to matched geometry / shared element transitions
- map `Drill Transition` to navigation push/present patterns with depth cues
- map `Context Transition` to local content replacement, not full navigation chrome animation

## Anti-Patterns

Do not choose `Continuity Transition` if no element meaningfully persists across states.

Do not choose `Drill Transition` for simple filter or tab changes.

Do not animate entire page chrome during a small in-place content update unless user explicitly wants theatrical motion.

Do not stack all three transition families in one simple interaction.

Do not guess easing and duration blindly. If motion quality matters, specify both.

Do not animate width/height/top/left by default when transform-based staging can achieve same perceptual result.

Do not add bounce everywhere. Spring is for meaningful state or object continuity, not all UI.

## Review Checklist

Before finalizing motion guidance or code, check:

- Is transition family correct for interaction semantics?
- Is there a stable visual anchor?
- Is hierarchy legible during motion?
- Are easing and duration explicitly chosen?
- Are animated properties performant?
- Would this still feel right when repeated many times?
- Does motion improve clarity, not merely ornament surface?

## Prompt Templates

### Generic

```text
Use a [Context/Drill/Continuity] transition. Keep [stable shell/shared element/navigation relationship] visually anchored. Animate [content/card/panel/icon/text] with [crossfade/translate/scale/morph]. Use [crisp/gentle/springy] easing and [fast/moderate] duration. The result should feel [premium/calm/spatial/natural], not flashy.
```

### Continuity-heavy

```text
Use continuity transition where the same element preserves identity across states. Maintain shared visual features such as size relationship, border radius, clipping, and position continuity while the element expands into the next state.
```

### Drill navigation

```text
Apply a drill transition from overview to detail. Make the next view feel one level deeper, with clear enter and back-navigation cues. Use stronger directional motion than a simple in-place content update.
```

## Tone

Use professional motion-design language. Explain transition choice as information architecture plus visual continuity, not decoration.

If user asks for a premium, high-end, automotive, iOS-like, Material-like, or immersive feel, bias toward transitions with clear spatial logic and restrained timing instead of flashy effects.
