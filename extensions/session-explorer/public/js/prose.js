/**
 * Rendering message text.
 *
 * Assistant turns are full of fenced code, and showing it as plain wrapped text
 * makes a transcript hard to read. This does the two things that actually
 * matter for legibility — fenced blocks and inline code — and leaves the rest
 * as authored text.
 *
 * It is deliberately not a markdown renderer. Everything is built from text
 * nodes, so no transcript content can become markup.
 */

import { h } from "./dom.js";

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\n`]*)$/;

/** Split text into prose and fenced-code segments. */
function segment(text) {
  const segments = [];
  const lines = text.split("\n");

  let prose = [];
  let fence = null;
  let code = [];
  let language = "";

  const flushProse = () => {
    if (prose.length > 0) {
      segments.push({ type: "prose", text: prose.join("\n") });
      prose = [];
    }
  };

  for (const line of lines) {
    const match = FENCE.exec(line);

    if (fence === null && match) {
      flushProse();
      fence = match[1][0].repeat(3);
      language = match[2].trim();
      code = [];
      continue;
    }

    if (fence !== null) {
      // A closing fence is the same character, at least as long, and bare.
      if (match && match[1][0] === fence[0] && match[2].trim() === "") {
        segments.push({ type: "code", text: code.join("\n"), language });
        fence = null;
        continue;
      }
      code.push(line);
      continue;
    }

    prose.push(line);
  }

  // An unterminated fence is still code the reader wants to see.
  if (fence !== null) segments.push({ type: "code", text: code.join("\n"), language });
  flushProse();

  return segments;
}

/** Turn `` `code` `` spans into elements, leaving all other text untouched. */
function inlineCode(text, into) {
  const parts = text.split(/(`[^`\n]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      into.append(h("code", null, part.slice(1, -1)));
    } else {
      into.append(document.createTextNode(part));
    }
  }
}

/**
 * Render message text into a fragment of `.prose` blocks.
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function renderProse(text) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  for (const part of segment(text)) {
    if (part.type === "code") {
      const code = h("code", null, part.text);
      if (part.language) code.dataset.language = part.language;
      fragment.append(h("pre.prose", null, code));
    } else if (part.text.trim()) {
      const block = h("p.prose");
      inlineCode(part.text, block);
      fragment.append(block);
    }
  }

  return fragment;
}
