<style>
.mwrap{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:16px;overflow:auto;min-height:120px}
.mwrap .nodeLabel{color:var(--color-text-primary)!important}
.mwrap .edgeLabel{color:var(--color-text-secondary)!important;background:var(--color-background-primary)!important}
.mwrap .edgeLabel rect{fill:var(--color-background-primary)!important}
.mwrap .merr{margin:0;font-size:12px;line-height:1.5;color:var(--color-text-danger);white-space:pre-wrap;font-family:var(--font-mono,ui-monospace,monospace)}
</style>
<div class="mwrap"><div class="mermaid" id="flow">
flowchart TD
  A[Start] --> B[Process]
  B --> C{Branch?}
  C -->|yes| D[Path A]
  C -->|no| E[Path B]
</div></div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" onload="initMermaid()"></script>
<script>
function mermaidTheme(){
  var dark = matchMedia('(prefers-color-scheme: dark)').matches;
  var t = (typeof window._themeVars === 'function') ? window._themeVars() : null;
  var s = getComputedStyle(document.documentElement);
  var g = function(name, fallback){
    if (t) {
      var map = {
        '--color-background-primary': t.bg,
        '--color-background-secondary': t.bgSecondary,
        '--color-text-primary': t.text,
        '--color-text-secondary': t.textSecondary,
        '--color-text-tertiary': t.textTertiary,
        '--color-border-secondary': t.borderSecondary || t.border,
        '--font-sans': t.fontSans
      };
      if (map[name]) return map[name] || fallback;
    }
    return s.getPropertyValue(name).trim() || fallback;
  };
  return {
    fontFamily: g('--font-sans', 'system-ui, -apple-system, sans-serif'),
    fontSize: '14px',
    primaryColor: g('--color-background-primary', dark ? '#1c1c1e' : '#ffffff'),
    primaryBorderColor: g('--color-border-secondary', dark ? '#48484a' : '#d1d1d6'),
    primaryTextColor: g('--color-text-primary', dark ? '#f2f2f7' : '#1c1c1e'),
    secondaryColor: g('--color-background-secondary', dark ? '#2c2c2e' : '#f2f2f7'),
    secondaryBorderColor: g('--color-border-secondary', dark ? '#636366' : '#c7c7cc'),
    secondaryTextColor: g('--color-text-primary', dark ? '#f2f2f7' : '#1c1c1e'),
    tertiaryColor: g('--color-background-secondary', dark ? '#2c2c2e' : '#f2f2f7'),
    lineColor: g('--color-text-tertiary', '#8e8e93'),
    edgeLabelBackground: g('--color-background-primary', dark ? '#1c1c1e' : '#ffffff'),
  };
}
function showMermaidError(el, err){
  if (!el || el._done) return;
  el._done = true;
  var msg = (err && (err.message || String(err))) || 'Mermaid failed to load';
  el.innerHTML = '<pre class="merr">' + msg.replace(/[<>&]/g, function(c){
    return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;';
  }) + '</pre>';
}
function initMermaid(){
  var el = document.getElementById('flow');
  if (!el || el._done) return;
  if (!window.mermaid) {
    showMermaidError(el, new Error('window.mermaid missing after CDN load'));
    return;
  }
  try {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      look: 'classic',
      securityLevel: 'loose',
      themeVariables: mermaidTheme(),
    });
    var source = el.textContent.trim();
    var id = 'flow-svg-' + Math.random().toString(36).slice(2, 7);
    Promise.resolve(window.mermaid.render(id, source)).then(function(result){
      if (el._done) return;
      el._done = true;
      el.innerHTML = (result && result.svg) ? result.svg : result;
    }).catch(function(err){
      showMermaidError(el, err);
    });
  } catch (err) {
    showMermaidError(el, err);
  }
}
// Poll: shell _runScripts may drop onload; src-only CDN still sets window.mermaid later.
if (window.mermaid) initMermaid();
else {
  var tries = 0;
  var timer = setInterval(function(){
    tries += 1;
    if (window.mermaid) {
      clearInterval(timer);
      initMermaid();
    } else if (tries >= 80) {
      clearInterval(timer);
      showMermaidError(document.getElementById('flow'), new Error('Mermaid CDN timed out (jsdelivr mermaid.min.js)'));
    }
  }, 100);
}
</script>
