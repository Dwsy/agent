# Web Motion Principles

This reference distills practical principles behind motion that feels right on product UI.

## Core Idea

Good animation is not merely code. It is choice of:

- transition family
- easing
- duration
- animated properties
- hierarchy emphasis

When motion feels wrong, one of those is usually mismatched.

## Diagnose In This Order

1. Is this the right transition family at all?
2. Is easing character appropriate for interaction?
3. Is duration too slow, too fast, or too even?
4. Are wrong properties being animated?
5. Are secondary elements moving too much?

Do not start by adding more animation. First remove mismatch.

## Easing Heuristics

Use easing as behavioral meaning.

- `gentle deceleration`: calm context updates, premium content swaps
- `crisp ease-out`: menus, popovers, compact utility surfaces
- `spring`: continuity, interruptible UI, object expansion, badge pop, toggles, drag-adjacent motion
- `sharper snap`: error feedback, compact confirmation, tight tool UI

If interaction can be interrupted or reversed mid-flight, spring often feels more natural than fixed-duration easing.

## Duration Heuristics

Use shorter motion for repeated utility interactions. Use slightly longer motion for hierarchy changes and continuity transitions.

- very short: icon swaps, checkmarks, badge pop, text state flips
- short: dropdowns, filters, tab content, panel reveal
- medium: modal open/close, card expansion, page drill transitions

Exit may be slightly faster than enter, provided relationship stays legible.

## Property Heuristics

Prefer animating:

- `transform`
- `opacity`
- carefully controlled `filter` or blur for swaps

Avoid defaulting to:

- `top`
- `left`
- `width`
- `height`

If layout must change, use framework support such as shared layout / view transitions rather than brute-force property animation where possible.

## Hierarchy Rules

Motion should answer: what changed, where did it go, what matters now?

- strongest motion for structure or hierarchy changes
- lighter motion for local content updates
- keep stable anchors stable
- do not let background chrome compete with primary state change

## Blur, Scale, Stagger

Use blur sparingly to mask abrupt content replacement, especially for text and icon swaps.

Use scale for presence and emphasis, not as default for every reveal.

Use stagger when a group should read as coordinated sequence. Do not stagger tiny unrelated surfaces merely because it looks animated.

## Springs

Springs are especially useful when:

- user can interrupt transition
- object identity should persist
- expansion/collapse needs weight
- hover or badge motion needs lively return

Springs are less necessary for plain text fades or simple content replacements.

## Premium Feel Checklist

Premium motion often feels premium because it is:

- restrained
- semantically correct
- spatially coherent
- timed with confidence
- performant enough to remain smooth

Flashiness without semantic fit lowers perceived quality.

## Practical Advice For AI Prompting

When prompting another model, specify:

- what kind of transition this is
- what stays visually anchored
- what exact properties should appear to change
- easing character
- duration band
- whether motion is interruptible or reversible

Bad prompt:

`make it animate nicely`

Better prompt:

`Use a continuity transition for card expansion. Preserve shared element identity, animate transform and opacity, use spring easing, keep the shell stable, and make the expansion feel premium rather than playful.`
