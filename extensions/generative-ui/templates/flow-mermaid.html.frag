<style>
.mwrap{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:16px;overflow:auto;min-height:120px;--pele-bg:var(--color-background-primary);--pele-fg:var(--color-text-primary);--pele-fg-on-light:var(--color-text-primary);--pele-fg-on-dark:var(--color-text-primary);--pele-surface:var(--color-background-secondary);--pele-surface-alt:var(--color-background-secondary);--pele-line:var(--color-text-tertiary);--pele-border:var(--color-border-tertiary);--pele-muted:var(--color-text-secondary);--pele-accent:var(--color-text-info);--pele-error:var(--color-text-danger);--pele-font:var(--font-sans);--pele-font-mono:var(--font-mono,ui-monospace,monospace);--pele-radius:var(--border-radius-md)}
.mwrap .mermaid{margin:0;font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;line-height:1.5;white-space:pre-wrap;color:var(--color-text-secondary)}
.mwrap .merr{margin:0;font-size:12px;line-height:1.5;color:var(--color-text-danger);white-space:pre-wrap;font-family:var(--font-mono,ui-monospace,monospace)}
</style>
<div class="mwrap" id="flow-svg-wrap"><pre class="mermaid" id="flow">
flowchart TD
  A[Start] --> B[Process]
  B --> C{Branch?}
  C -->|yes| D[Path A]
  C -->|no| E[Path B]
</pre></div>
<script src="https://cdn.jsdelivr.net/npm/pele@1/dist/pele.global.js" onload="initPele()"></script>
<script>
function showPeleError(el, err){
  if (!el || el._done) return;
  el._done = true;
  var msg = (err && (err.message || String(err))) || 'Pele failed to load';
  el.className = 'merr';
  el.textContent = msg;
}
function initPele(){
  var el = document.getElementById('flow');
  if (!el || el._done) return;
  if (!window.pele) {
    showPeleError(el, new Error('window.pele missing after CDN load'));
    return;
  }
  try {
    window.pele.mount(el, el.textContent);
    el._done = true;
  } catch (err) {
    showPeleError(el, err);
  }
}
// Poll: shell _runScripts may drop onload; src-only CDN still sets window.pele later.
if (window.pele) initPele();
else {
  var tries = 0;
  var timer = setInterval(function(){
    tries += 1;
    if (window.pele) {
      clearInterval(timer);
      initPele();
    } else if (tries >= 80) {
      clearInterval(timer);
      showPeleError(document.getElementById('flow'), new Error('Pele CDN timed out (jsdelivr pele.global.js)'));
    }
  }, 100);
}
</script>
