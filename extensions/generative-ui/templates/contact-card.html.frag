<style>
.pad{background:var(--color-background-secondary);border-radius:var(--border-radius-lg);padding:1.25rem;display:flex;justify-content:center}
.card{background:var(--color-background-primary);border-radius:var(--border-radius-lg);border:.5px solid var(--color-border-tertiary);padding:1rem 1.25rem;max-width:360px;width:100%;min-width:0}
.card-top{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.av{width:44px;height:44px;border-radius:50%;background:var(--color-background-info);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:14px;color:var(--color-text-info);flex-shrink:0}
.card-top p{margin:0}
.card-top .name{font-weight:500;font-size:15px;color:var(--color-text-primary)}
.card-top .role{font-size:13px;color:var(--color-text-secondary)}
.card table{width:100%;font-size:13px;border-collapse:collapse;table-layout:fixed}
.card td{padding:4px 0;overflow-wrap:break-word}
.card td.k{color:var(--color-text-secondary);width:36%}
.card td.v{text-align:right;color:var(--color-text-primary)}
.card td.v.link{color:var(--color-text-info)}
</style>
<div class="pad">
  <div class="card">
    <div class="card-top">
      <div class="av">AB</div>
      <div>
        <p class="name">Ada Example</p>
        <p class="role">Product engineer</p>
      </div>
    </div>
    <div style="border-top:.5px solid var(--color-border-tertiary);padding-top:12px">
      <table>
        <tr><td class="k">Email</td><td class="v link">ada@example.com</td></tr>
        <tr><td class="k">Team</td><td class="v">Platform</td></tr>
        <tr><td class="k">Locale</td><td class="v">Remote</td></tr>
      </table>
    </div>
  </div>
</div>
