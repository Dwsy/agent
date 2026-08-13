/**
 * A minimal element builder.
 *
 * Every string passed as a child becomes a text node, so transcript content —
 * which is arbitrary text from tool output and user messages — can never be
 * parsed as markup. Nothing in this app assigns innerHTML.
 */

/**
 * @param {string} tag  Tag name, optionally with `.class.names`.
 * @param {object|null} [props]  Attributes; `class`, `dataset`, `on*` handlers.
 * @param {...(Node|string|null|false|undefined|Array)} children
 */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");

  if (classes.length > 0) el.className = classes.join(" ");

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") {
      el.className = el.className ? `${el.className} ${value}` : String(value);
    } else if (key === "dataset") {
      Object.assign(el.dataset, value);
    } else if (key === "style") {
      Object.assign(el.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "text") {
      el.textContent = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }

  append(el, children);
  return el;
}

/** @param {Element} parent @param {any} children */
export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** An icon span. Shape comes from `[data-icon]` rules in the stylesheet. */
export function icon(name, className = "") {
  return h("span", { dataset: { icon: name }, class: className, "aria-hidden": "true" });
}

/** Replace an element's children in one shot. */
export function fill(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

/**
 * Render text with highlighted ranges as a fragment of text nodes and `<mark>`
 * elements. Ranges are `[start, length]` in UTF-16 units and must be sorted and
 * non-overlapping, which is what the server guarantees.
 */
export function highlighted(text, ranges) {
  const fragment = document.createDocumentFragment();
  if (!ranges || ranges.length === 0) {
    fragment.append(document.createTextNode(text));
    return fragment;
  }

  let cursor = 0;
  for (const [start, length] of ranges) {
    if (start < cursor || start >= text.length) continue;
    if (start > cursor) fragment.append(document.createTextNode(text.slice(cursor, start)));
    const end = Math.min(start + length, text.length);
    fragment.append(h("mark", null, text.slice(start, end)));
    cursor = end;
  }
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));

  return fragment;
}

/** Run `fn` after the user stops calling it for `wait` ms. */
export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
