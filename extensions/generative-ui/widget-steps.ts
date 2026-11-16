// Generic step mechanism for widgets.
//
// A container opts in with [data-steps]. Elements that belong to one step carry
// [data-step="N"]; elements that belong to several carry [data-step-in="1 3"].
// Captions are the <li> children of [data-step-captions], mapped by position onto
// the sorted step numbers.
//
// Visibility rules, applied only after the mechanism initialises:
//   [data-step]      visible exactly at its step
//   [data-step-in]   visible from its first listed step onward (sticky), and
//                     marked .is-current while one of its steps is active
// Until then everything stays visible, so a widget whose script never runs still
// shows its content instead of a blank panel.
//
// The runtime owns state only: which step is current, which captions show, which
// controls are enabled. The look is the model's — the skin below is a neutral
// default built on host tokens, restyleable without touching the mechanism.
//
// Bound on document with a MutationObserver, so a stepper that appears after the
// first render is picked up too.
//
// Inspired by the stepper in visual-explainer (MIT, nicobailon/visual-explainer),
// rewritten here against this host's tokens and event model.

export const WIDGET_STEPS_CSS = `
[data-steps]{display:grid;gap:8px}
[data-steps].is-steps-ready [data-step]:not(.is-current){display:none}
[data-steps].is-steps-ready [data-step-in]:not(.is-current):not(.is-reached){display:none}
[data-step-captions]{list-style:none;margin:0;padding:0;display:grid;gap:4px}
[data-step-captions] li{font-size:13px;color:var(--color-text-secondary)}
[data-step-captions] li.is-past{color:var(--color-text-tertiary)}
[data-step-captions] li.is-current{color:var(--color-text-primary);font-weight:500}
[data-step-controls]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
[data-step-controls] button{font:inherit;font-size:13px;color:var(--color-text-primary);background:var(--color-background-secondary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-md);padding:4px 10px;cursor:pointer}
[data-step-controls] button:disabled{opacity:.4;cursor:default}
[data-step-controls] button:hover:not(:disabled){border-color:var(--color-border-info)}
[data-step-controls] input[type=range]{accent-color:var(--color-text-info);min-width:0;flex:1}
[data-step-status]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;

export const WIDGET_STEPS_SCRIPT = `(function(){
  if (window.__genuiSteps) return;
  window.__genuiSteps = true;

  var CONTAINER = '[data-steps]';

  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function stepNumbers(root) {
    var seen = {};
    all('[data-step]', root).forEach(function(el){
      var n = parseInt(el.getAttribute('data-step'), 10);
      if (!isNaN(n)) seen[n] = true;
    });
    all('[data-step-in]', root).forEach(function(el){
      el.getAttribute('data-step-in').split(/\\s+/).forEach(function(part){
        var n = parseInt(part, 10);
        if (!isNaN(n)) seen[n] = true;
      });
    });
    return Object.keys(seen).map(Number).sort(function(a, b){ return a - b; });
  }

  function indexOfStep(list, n) {
    for (var i = 0; i < list.length; i++) if (list[i] === n) return i;
    return -1;
  }

  function setCurrent(root, n) {
    var list = stepNumbers(root);
    if (!list.length) return;
    var at = indexOfStep(list, n);
    if (at < 0) at = 0;
    var current = list[at];
    root.setAttribute('data-step-current', String(current));

    all('[data-step]', root).forEach(function(el){
      el.classList.toggle('is-current', parseInt(el.getAttribute('data-step'), 10) === current);
    });
    all('[data-step-in]', root).forEach(function(el){
      var owned = el.getAttribute('data-step-in').split(/\\s+/).map(Number).filter(function(x){ return !isNaN(x); });
      var first = owned.length ? Math.min.apply(null, owned) : Infinity;
      el.classList.toggle('is-current', owned.indexOf(current) >= 0);
      el.classList.toggle('is-reached', first <= current);
    });

    var caps = all('[data-step-captions] li', root);
    caps.forEach(function(li, i){
      var on = list[i] === current;
      li.classList.toggle('is-current', on);
      li.classList.toggle('is-past', !on && list[i] < current);
      if (on) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });

    var prev = root.querySelector('[data-step-prev]');
    var next = root.querySelector('[data-step-next]');
    if (prev) prev.disabled = at === 0;
    if (next) next.disabled = at === list.length - 1;

    var range = root.querySelector('input[type=range]');
    if (range) { range.max = String(list.length - 1); range.value = String(at); }

    announce(root, list, at);
  }

  // A caption that only changes colour announces nothing, so the step change is
  // reported through a dedicated live region instead.
  function announce(root, list, at) {
    var status = root.querySelector('[data-step-status]');
    if (!status) {
      status = document.createElement('div');
      status.setAttribute('data-step-status', '');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      root.appendChild(status);
    }
    var caps = all('[data-step-captions] li', root);
    var caption = caps[at] ? caps[at].textContent.trim() : '';
    status.textContent = 'Step ' + (at + 1) + ' of ' + list.length + (caption ? ': ' + caption : '');
  }

  function move(root, delta) {
    var list = stepNumbers(root);
    if (!list.length) return;
    var at = indexOfStep(list, parseInt(root.getAttribute('data-step-current'), 10));
    if (at < 0) at = 0;
    var target = Math.max(0, Math.min(list.length - 1, at + delta));
    if (target !== at) setCurrent(root, list[target]);
  }

  function stepTo(root, at) {
    var list = stepNumbers(root);
    if (!list.length) return;
    setCurrent(root, list[Math.max(0, Math.min(list.length - 1, at))]);
  }

  function stop(root) {
    if (root.__stepTimer) { clearInterval(root.__stepTimer); root.__stepTimer = null; }
    var play = root.querySelector('[data-step-play]');
    if (play) play.textContent = play.getAttribute('data-step-play-label') || '▶';
  }

  function play(root) {
    if (root.__stepTimer) { stop(root); return; }
    var list = stepNumbers(root);
    if (list.length < 2) return;
    var button = root.querySelector('[data-step-play]');
    if (!button) return;
    if (!button.getAttribute('data-step-play-label')) button.setAttribute('data-step-play-label', button.textContent || '▶');
    button.textContent = '❚❚';
    root.__stepTimer = setInterval(function(){
      var list2 = stepNumbers(root);
      var at = indexOfStep(list2, parseInt(root.getAttribute('data-step-current'), 10));
      if (at < 0) at = 0;
      if (at >= list2.length - 1) { stop(root); return; }
      setCurrent(root, list2[at + 1]);
    }, 3500);
  }

  function init(root) {
    if (root.getAttribute('data-step-ready') === '1') return;
    root.setAttribute('data-step-ready', '1');
    var caps = root.querySelector('[data-step-captions]');
    if (caps && !caps.hasAttribute('aria-live')) caps.setAttribute('aria-label', 'Steps');
    all('[data-step-prev]', root).forEach(function(b){ if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Previous step'); });
    all('[data-step-next]', root).forEach(function(b){ if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Next step'); });
    all('[data-step-play]', root).forEach(function(b){ if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Play'); });
    // Ready flag last: CSS hides non-current steps only once the state is known.
    root.classList.add('is-steps-ready');
    var start = parseInt(root.getAttribute('data-step-open'), 10);
    setCurrent(root, isNaN(start) ? stepNumbers(root)[0] : start);
  }

  function initAll(root) {
    all(CONTAINER, root).forEach(init);
    if (root.matches && root.matches(CONTAINER)) init(root);
  }

  document.addEventListener('click', function(event){
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('[data-step-prev],[data-step-next],[data-step-play]');
    if (!button) return;
    var root = button.closest(CONTAINER);
    if (!root) return;
    if (button.hasAttribute('data-step-prev')) { stop(root); move(root, -1); }
    else if (button.hasAttribute('data-step-next')) { stop(root); move(root, 1); }
    else if (button.hasAttribute('data-step-play')) { play(root); }
  });

  document.addEventListener('input', function(event){
    var range = event.target;
    if (!range || range.type !== 'range' || !range.closest) return;
    var root = range.closest(CONTAINER);
    if (!root) return;
    stop(root);
    stepTo(root, parseInt(range.value, 10) || 0);
  });

  if (window.MutationObserver) {
    new MutationObserver(function(records){
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) initAll(added[j]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot(){ initAll(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();`;
