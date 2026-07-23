// Shared widget runtime adapted from Codex visualize.html.
// It is injected once by both native shells and saved standalone widgets.

const CDN_ORIGINS = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://esm.sh https://fonts.bunny.net https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com";

export const WIDGET_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: " + CDN_ORIGINS,
  "style-src 'unsafe-inline' " + CDN_ORIGINS,
  "img-src blob: data: " + CDN_ORIGINS,
  "font-src blob: data: " + CDN_ORIGINS,
  "media-src blob: data: " + CDN_ORIGINS,
  "worker-src blob:",
  "connect-src blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const WIDGET_UI_KIT_CSS = `
.widget-tooltip {
  position: fixed;
  z-index: 50;
  top: 0;
  left: 0;
  max-width: min(20rem, calc(100vw - 10px));
  padding: 4px 8px;
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  background: var(--color-background-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: break-word;
  pointer-events: none;
}
`;

export const WIDGET_UI_KIT_SCRIPT = `(function() {
  if (window.__generativeUiKitLoaded || !window.FloatingUIDOM) return;
  window.__generativeUiKitLoaded = true;

  var api = window.FloatingUIDOM;
  var activeTrigger = null;
  var tooltip = null;
  var cleanup = null;
  var openTimer = null;
  var tooltipId = 'generative-ui-tooltip-' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36));

  function triggerFor(target) {
    return target && target.nodeType === Node.ELEMENT_NODE ? target.closest('[data-tooltip]') : null;
  }

  function textFor(trigger) {
    return (trigger.getAttribute('data-tooltip') || '').trim();
  }

  function placementFor(trigger) {
    var placement = trigger.getAttribute('data-tooltip-placement');
    return placement === 'right' || placement === 'bottom' || placement === 'left' ? placement : 'top';
  }

  function getTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = tooltipId;
    tooltip.className = 'widget-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    return tooltip;
  }

  function setDescription(trigger, enabled) {
    var ids = (trigger.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
    ids = ids.filter(function(id) { return id !== tooltipId; });
    if (enabled) ids.push(tooltipId);
    if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
    else trigger.removeAttribute('aria-describedby');
  }

  function close() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    if (!activeTrigger) return;
    cleanup && cleanup();
    cleanup = null;
    setDescription(activeTrigger, false);
    activeTrigger = null;
    tooltip && tooltip.remove();
  }

  function position(trigger, floating) {
    api.computePosition(trigger, floating, {
      placement: placementFor(trigger),
      strategy: 'fixed',
      middleware: [api.offset(5), api.flip({ padding: 5 }), api.shift({ padding: 5 })],
    }).then(function(result) {
      if (activeTrigger !== trigger) return;
      floating.style.transform = 'translate(' + Math.round(result.x) + 'px, ' + Math.round(result.y) + 'px)';
      floating.style.visibility = 'visible';
    }).catch(close);
  }

  function open(trigger, immediate) {
    var content = textFor(trigger);
    if (!content || activeTrigger === trigger) return;
    close();
    var show = function() {
      openTimer = null;
      if (!trigger.isConnected) return;
      var floating = getTooltip();
      floating.textContent = content;
      floating.style.visibility = 'hidden';
      document.body.appendChild(floating);
      activeTrigger = trigger;
      setDescription(trigger, true);
      cleanup = api.autoUpdate(trigger, floating, function() { position(trigger, floating); });
    };
    if (immediate) show();
    else openTimer = setTimeout(show, 700);
  }

  document.addEventListener('pointerover', function(event) {
    if (event.pointerType === 'touch') return;
    var trigger = triggerFor(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) open(trigger, false);
  });
  document.addEventListener('pointerout', function(event) {
    var trigger = triggerFor(event.target);
    if (trigger && !trigger.contains(event.relatedTarget)) close();
  });
  document.addEventListener('focusin', function(event) {
    var trigger = triggerFor(event.target);
    if (trigger && trigger.matches(':focus-visible')) open(trigger, true);
  });
  document.addEventListener('focusout', close);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('pagehide', close, { once: true });
})();`;

export const WIDGET_UI_KIT_RESOURCES = `<script src="https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js"></script>
<script src="https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js"></script>
<script>${WIDGET_UI_KIT_SCRIPT}</script>
<script id="generative-ui-lucide" async src="https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js"></script>
<script>(function() {
  function initialize() {
    window.lucide && window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }
  if (window.lucide) initialize();
  else document.getElementById('generative-ui-lucide').addEventListener('load', initialize, { once: true });
})();</script>`;
