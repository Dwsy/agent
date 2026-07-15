<style>
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.plan{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1rem 1.1rem;min-width:0}
.plan.hot{border:2px solid var(--color-border-info)}
.badge{display:inline-block;background:var(--color-background-info);color:var(--color-text-info);font-size:12px;padding:3px 10px;border-radius:var(--border-radius-md);margin:0 0 8px}
.plan h3{font-size:16px;font-weight:500;margin:0 0 4px;color:var(--color-text-primary)}
.plan .price{font-size:22px;font-weight:500;margin:0 0 10px;color:var(--color-text-primary)}
.plan ul{list-style:none;padding:0;margin:0;font-size:13px;color:var(--color-text-secondary)}
.plan li{padding:4px 0;overflow-wrap:break-word}
</style>
<div class="plans">
  <div class="plan">
    <h3>Starter</h3>
    <p class="price">$0</p>
    <ul>
      <li>Feature one</li>
      <li>Feature two</li>
      <li>Feature three</li>
    </ul>
  </div>
  <div class="plan hot">
    <span class="badge">Most popular</span>
    <h3>Pro</h3>
    <p class="price">$12</p>
    <ul>
      <li>Everything in Starter</li>
      <li>Priority support</li>
      <li>Advanced tools</li>
    </ul>
  </div>
  <div class="plan">
    <h3>Studio</h3>
    <p class="price">$39</p>
    <ul>
      <li>Everything in Pro</li>
      <li>Team seats</li>
      <li>Custom branding</li>
    </ul>
  </div>
</div>
