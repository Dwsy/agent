# Full HTML pages — visual-explainer owns those

This host renders **one artifact in one window**. A multi-figure explainer, a diff review, an
implementation plan, a slide deck, a narrated video — those are HTML *pages*, with a kit, a
renderer, and a browser-based check. Use the visual-explainer skill for them:

```
/Users/dengwenyu/agent-skills/agent-skills/visual-explainer
```

It is a git clone of `github.com/nicobailon/visual-explainer` (v0.14.0, MIT), already installed
with `playwright-core`. Its entry points:

```bash
VE=/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer

node $VE/kit/render.mjs page.src.html -o page.html   # render (add --open to view)
node $VE/kit/render.mjs page.src.html --lint          # checks only, writes nothing
```

## What it gives that this host does not

- **Mermaid drawn at build time by Pele**, vendored, so the page needs no CDN and no script. It
  also renders a second, narrower layout for phones and picks one with a media query — the
  reason it can show a wide diagram on a narrow screen without shrinking the labels.
- **A browser check after every render**: it opens the page in headless Chrome and reports
  overlapping text, labels under 12 px, text running past its drawing, and sideways scrolling,
  then saves a contact sheet. Fix what it lists, look at the sheet once, edit the source, render
  again.
- **Figure motion**: steppers, replays, flow dots, live figures, and 3D.
- **Reading the reply**: readers can select words or click a figure part to comment or ask.
- **Slash commands** for the common shapes: `/diff-review`, `/plan-review`, `/project-recap`,
  `/compare`, `/fact-check`, `/state-machine`, `/generate-web-diagram`, `/generate-slides`,
  `/generate-video`, `/generate-visual-plan`.

## Its references

| File | Read it for |
|---|---|
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/diagrams.md` | Hand-drawn SVG rules: grid, shapes, edges, dimensions, labels. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/motion.md` | Steppers, replays, flow dots, live figures, 3D. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/style-guide.md` | The look: register, motif, forbidden defaults. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/kit.md` | The kit's classes and components. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/plans.md` | Implementation plans. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/themes.md` | Switchable themes and named palettes. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/machines.md` | State machines walked from code. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/slides.md` | Slide decks. |
| `/Users/dengwenyu/agent-skills/agent-skills/visual-explainer/skills/visual-explainer/references/video.md` | Narrated MP4. |

Do not read the kit's CSS, JS, or `.mjs` source to write a page — the references and render
errors cover what a page needs.

## Which host for which job

| Deliverable | Use |
|---|---|
| One visual in a native window, host-themed | this host (`route` → `widget`/`canvas`) |
| A full HTML page: explainer, diff review, plan, deck, video | `visual-explainer` |
| A standalone `.svg` file | `pele-mermaid` CLI |

Do not rebuild the page machinery here.
