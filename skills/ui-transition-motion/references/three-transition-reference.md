# Three UI Transition Families

This reference gives precise language for three high-value motion patterns used in premium product UI, mobile OS design, design systems, and automotive HMI.

## 1. Context Transition

### Definition

`Context Transition` means content changes while overall layout, frame, and spatial context remain stable.

### Key Character

- content changes
- shell remains fixed
- user stays in same conceptual place
- motion emphasizes update, not travel

### Best For

- tab switching
- filter changes
- segmented control changes
- list states such as `All` to `Completed`
- same-page panel refresh
- same module with different dataset or facet

### Visual Feel

From user perspective, interface frame does not move much. Inner content fades, slides, or replaces smoothly. Emphasis is: `same place, new content`.

### Why It Works

It preserves orientation. User does not need to mentally relocate. Good for fast repeated interactions.

### AI Prompt Snippet

`Use a context transition where the content updates smoothly while the surrounding layout remains fixed.`

### Good Motion Spec

- keep container size and position stable
- animate only inner content blocks
- prefer subtle crossfade, blur-in, or short vertical/horizontal offset
- avoid large camera-like movement

### Common Mistake

Turning a filter toggle into a full page slide. That adds fake hierarchy where none exists.

## 2. Drill Transition

### Definition

`Drill Transition` means user moves from overview into a deeper, more detailed level of information.

### Key Character

- hierarchy deepens
- navigation enters child layer
- motion suggests going inward or forward
- detail density usually increases

### Best For

- list to detail page
- feed item to full post
- summary card to full report
- folder to subfolder
- search result to detailed object view

### Visual Feel

The next view feels like a deeper layer. Layout may change somewhat, but the main message is: `you are entering a more specific level`.

### Why It Works

It encodes information architecture through motion. Users feel depth and progression, which improves navigation clarity.

### AI Prompt Snippet

`Apply a drill transition for navigating from a list or summary to a detailed item view.`

### Good Motion Spec

- use directional motion that implies entering depth
- keep back-navigation relationship legible
- allow layout to reorganize around detailed content
- use slightly stronger motion than context transitions

### Common Mistake

Using drill motion for ordinary tabs. That falsely implies hierarchy and makes quick state toggles feel heavy.

## 3. Continuity Transition

### Definition

`Continuity Transition` means a shared element remains visually continuous across states, morphing, expanding, or reshaping while preserving identity.

### Key Character

- shared element exists in both states
- element keeps identity across change
- strong continuity and spatial coherence
- motion feels natural because user can track object itself

### Best For

- card to fullscreen detail
- mini player to full media player
- avatar to profile sheet
- floating button to expanded action menu
- thumbnail to immersive gallery view

### Visual Feel

User sees object itself expand, stretch, reposition, or transform. Shared pieces remain recognizable. Emphasis is: `same object, new state`.

### Why It Works

This is often most premium-feeling transition because it preserves object identity, reduces cognitive jump, and adds strong spatial storytelling.

### AI Prompt Snippet

`Use continuity transition where a card or element morphs and expands into the next state, maintaining shared visual elements.`

### Good Motion Spec

- preserve recognizable element features between states
- animate geometry, scale, clipping, radius, and position coherently
- avoid abrupt swap that breaks identity
- use when shared element is semantically real, not forced

### Common Mistake

Applying shared-element morphing when no true element continuity exists. That feels gimmicky instead of elegant.

## Comparison Table

| Transition | What changes | What stays stable | Best mental model |
|---|---|---|---|
| Context | content inside view | outer shell / layout | same place, updated content |
| Drill | information depth | navigation relationship | entering deeper layer |
| Continuity | element state and scale | element identity | same object, transformed |

## Selection Heuristic

Use this quick test:

1. Is same element visually present before and after? Use `Continuity`.
2. If not, is user moving from broad to detailed hierarchy? Use `Drill`.
3. If not, content likely changes within same context. Use `Context`.

## Premium Motion Guidance

These transition families matter because high-end motion is not random animation. It communicates:

- information architecture
- spatial logic
- object identity
- user confidence

When user says `make it feel smoother`, `more premium`, `more Apple-like`, `more natural`, or `less jarring`, translate that request into one of these families before proposing animation.

Premium feel usually comes from:

- right transition family
- restrained timing
- clear hierarchy
- stable shared anchors
- minimal unnecessary movement

## Stack Mapping

### Web

- `Context`: CSS transitions, content crossfades, View Transitions API
- `Drill`: route/view transitions with directional slide, scale, or opacity staging
- `Continuity`: Framer Motion `layoutId`, Motion `layout`, shared-element view transitions

### iOS / SwiftUI

- `Context`: local content animation
- `Drill`: navigation stack push/pop with depth cues
- `Continuity`: `matchedGeometryEffect`

### Android / Material

- `Context`: content fade through or container transform variants where shell remains stable
- `Drill`: navigation with clear depth and container transforms
- `Continuity`: shared element transitions / container transform

### Automotive / HMI

- prefer high legibility and stable anchors
- context motion for frequently toggled states
- drill motion for layer changes that affect task focus
- continuity motion for key object expansions such as media, maps, or surfaced controls

## Recommended Response Pattern

When user asks for help, answer in this order:

1. Name transition family.
2. Explain why it fits interaction semantics.
3. Describe what remains stable.
4. Describe what moves or morphs.
5. Give implementation hint for stack.
6. Give one reusable AI prompt sentence.
