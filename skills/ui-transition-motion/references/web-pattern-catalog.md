# Web Motion Pattern Catalog

This reference collects high-value UI motion patterns commonly useful in web apps.

Use these as implementation starting points, not rigid templates.

## Context Transition Patterns

### Text State Swap

Best for:

- status label updates
- tab header text swaps
- compact stateful copy changes

Recipe:

- keep text frame stable
- use slight blur plus opacity swap
- optional small vertical offset

### Icon Swap

Best for:

- play/pause
- expand/collapse indicators
- sort or state icons

Recipe:

- quick scale + blur or opacity swap
- keep icon bounding box stable

### Number Pop-in

Best for:

- counters
- price changes
- KPI updates

Recipe:

- animate per-digit or grouped numeric change
- use short stagger and vertical drift
- preserve baseline alignment

### Panel Reveal

Best for:

- filters panel
- side utilities
- inline settings surface

Recipe:

- stable parent shell
- content reveal with opacity + translate
- make closing slightly faster than opening

## Drill Transition Patterns

### Page Side-by-Side

Best for:

- forward/back navigation
- split route transitions
- master/detail web apps

Recipe:

- outgoing page shifts aside while incoming page enters
- keep directional relationship clear
- back transition should visibly undo forward transition

### Modal Open/Close

Best for:

- elevated focus task
- confirmation or editor view

Recipe:

- backdrop opacity first
- surface scale or translate second
- exit faster than enter

### Menu Dropdown

Best for:

- anchored menus
- compact overflow actions

Recipe:

- use origin-aware scale/fade
- anchor to trigger location
- avoid large travel distance

## Continuity Transition Patterns

### Card Resize

Best for:

- dashboard card expansion
- summary to detailed module
- grid item enlargement

Recipe:

- preserve card identity
- animate geometry, radius, shadow, and clipping coherently
- shared element should feel like same object at larger resolution

### Notification Badge Pop

Best for:

- counters
- new-item indicators
- ephemeral attention cue

Recipe:

- diagonal or offset entry
- small spring pop-in
- fast settle, no long bounce tail

### Avatar Group Hover Lift

Best for:

- collaborative presence
- participant stacks

Recipe:

- distance-based lift or spread
- bouncy but controlled return
- preserve group cohesion

## Feedback Patterns

### Success Check

Best for:

- completion confirmation
- task success acknowledgement

Recipe:

- quick check draw or pop
- optional blur/rotate accent
- keep brief, do not celebrate too long

### Error Shake

Best for:

- invalid input
- blocked action

Recipe:

- short lateral shake
- high clarity, low duration
- use sparingly; repeated shake becomes noisy

## Pattern Selection Guide

If user asks for:

- content swaps inside fixed shell -> use context patterns
- route/detail navigation -> use drill patterns
- object expansion or preserved identity -> use continuity patterns
- validation or confirmation feedback -> use feedback patterns

## Prompt Snippets

### Card Resize

`Use a continuity transition for card expansion. Preserve the card's identity and animate its scale, position, radius, and content density coherently into the detail state.`

### Text Swap

`Use a context transition for text state updates. Keep the label frame fixed and swap content with a subtle blur and fade so the change feels smooth, not jumpy.`

### Panel Reveal

`Reveal the panel as a local context transition. Keep the parent shell stable and animate the panel with short translate and opacity changes rather than a full-page movement.`

### Drill Navigation

`Apply a drill transition from list to detail. Use directional motion that makes the destination feel one level deeper, and make the back transition clearly reverse the forward move.`
