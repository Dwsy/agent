<style>
.flow{display:flex;flex-direction:column;align-items:center;gap:0;padding:.25rem 0}
.step{width:min(320px,100%);border:.5px solid var(--color-border-tertiary);border-radius:10px;padding:14px 18px;background:var(--color-background-primary)}
.step .t{font-size:15px;font-weight:500;margin:0 0 2px;color:var(--color-text-primary)}
.step .s{font-size:13px;color:var(--color-text-secondary);margin:0}
.step.is-active{background:var(--color-background-secondary);border-color:var(--color-border-secondary)}
.conn{width:.5px;height:18px;background:var(--color-border-secondary);position:relative}
.conn:after{content:"";position:absolute;left:50%;bottom:-1px;width:5px;height:5px;border-right:.5px solid var(--color-border-secondary);border-bottom:.5px solid var(--color-border-secondary);transform:translateX(-50%) rotate(45deg)}
</style>
<div class="flow">
  <div class="step"><p class="t">Step one</p><p class="s">Short subtitle</p></div>
  <div class="conn"></div>
  <div class="step is-active"><p class="t">Step two</p><p class="s">Current step</p></div>
  <div class="conn"></div>
  <div class="step"><p class="t">Step three</p><p class="s">Short subtitle</p></div>
</div>
