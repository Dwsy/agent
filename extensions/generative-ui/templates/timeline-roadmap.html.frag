<style>
.timeline{display:grid;gap:0;padding:.25rem 0}
.milestone{display:grid;grid-template-columns:minmax(76px,110px) 20px minmax(0,1fr);gap:10px;align-items:start}
.when{font-size:12px;line-height:18px;color:var(--color-text-tertiary);text-align:right;padding-top:1px;font-variant-numeric:tabular-nums}
.rail{display:flex;flex-direction:column;align-items:center;align-self:stretch}
.dot{width:9px;height:9px;border-radius:50%;border:1px solid var(--color-border-primary);background:var(--color-background-primary);margin-top:4px;flex:0 0 auto}
.line{width:1px;min-height:34px;flex:1;background:var(--color-border-tertiary);margin-top:4px}
.milestone:last-child .line{display:none}
.detail{min-width:0;padding:0 0 16px}
.detail h3{font-size:16px;line-height:22px;font-weight:500;margin:0 0 2px;color:var(--color-text-primary)}
.detail p{font-size:14px;line-height:20px;margin:0;color:var(--color-text-secondary);overflow-wrap:anywhere}
.milestone.is-current .dot{background:var(--color-text-info);border-color:var(--color-text-info)}
@media(max-width:420px){.milestone{grid-template-columns:70px 18px minmax(0,1fr);gap:8px}.when{text-align:left}}
</style>
<div class="timeline" aria-label="Roadmap timeline">
  <div class="milestone">
    <div class="when">Phase 1</div><div class="rail"><span class="dot"></span><span class="line"></span></div>
    <div class="detail"><h3>Baseline</h3><p>Establish the current state and the decision criteria.</p></div>
  </div>
  <div class="milestone is-current">
    <div class="when">Phase 2</div><div class="rail"><span class="dot"></span><span class="line"></span></div>
    <div class="detail"><h3>Implement</h3><p>Ship the highest-value change and validate it with evidence.</p></div>
  </div>
  <div class="milestone">
    <div class="when">Phase 3</div><div class="rail"><span class="dot"></span><span class="line"></span></div>
    <div class="detail"><h3>Expand</h3><p>Scale only after the previous phase meets its exit criteria.</p></div>
  </div>
</div>
