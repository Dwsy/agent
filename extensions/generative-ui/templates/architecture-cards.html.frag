<style>
.arch{display:flex;flex-direction:column;gap:0;padding:.25rem 0}
.ve-card{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:14px 16px;min-width:0}
.ve-card h3{font-size:15px;font-weight:500;margin:0 0 8px;color:var(--color-text-primary)}
.ve-card ul{margin:0;padding:0 0 0 1.1rem;color:var(--color-text-secondary);font-size:13px;line-height:1.5}
.ve-card li{margin:2px 0;overflow-wrap:break-word}
.ve-card.is-accent{border-color:var(--color-border-secondary);background:var(--color-background-secondary)}
.ve-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.flow-arrow{display:flex;justify-content:center;align-items:center;padding:8px 0;color:var(--color-text-tertiary)}
.flow-arrow svg{width:18px;height:18px;stroke:var(--color-border-secondary);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;font-size:12px;color:var(--color-text-secondary)}
.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--color-border-secondary)}
</style>
<div class="arch">
  <div class="ve-card is-accent">
    <h3>Sources</h3>
    <ul>
      <li>User request</li>
      <li>Tool arguments</li>
    </ul>
  </div>
  <div class="flow-arrow" aria-hidden="true">
    <svg viewBox="0 0 20 20"><path d="M10 4v12M6 12l4 4 4-4"/></svg>
  </div>
  <div class="ve-row">
    <div class="ve-card">
      <h3>Core</h3>
      <ul>
        <li>read_me</li>
        <li>guidelines</li>
      </ul>
    </div>
    <div class="ve-card">
      <h3>Render</h3>
      <ul>
        <li>show_widget</li>
        <li>glimpseui</li>
      </ul>
    </div>
  </div>
  <div class="flow-arrow" aria-hidden="true">
    <svg viewBox="0 0 20 20"><path d="M10 4v12M6 12l4 4 4-4"/></svg>
  </div>
  <div class="ve-card">
    <h3>Outputs</h3>
    <ul>
      <li>Native window</li>
      <li>~/.pi/widgets</li>
    </ul>
  </div>
  <div class="legend"><span><i></i>neutral surface · accent only on entry</span></div>
</div>
