// Pi Insights Plugin - HTML Report Generator

import type { AggregatedData, InsightResults } from '../types'

export interface ReportOptions {
  title?: string
  includeCharts?: boolean
  theme?: 'light' | 'dark' | 'auto'
}

export function generateHtmlReport(
  data: AggregatedData,
  insights: InsightResults,
  options: ReportOptions = {}
): string {
  const title = options.title || 'Pi Agent Insights'
  const theme = options.theme || 'auto'
  const themeClass = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : ''
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #ffffff;
      --bg-secondary: #f5f5f7;
      --text: #1d1d1f;
      --text-secondary: #86868b;
      --accent: #0066cc;
      --accent-light: #e8f4fd;
      --success: #34c759;
      --warning: #ff9500;
      --error: #ff3b30;
      --border: #d2d2d7;
    }
    
    .dark {
      --bg: #1d1d1f;
      --bg-secondary: #2c2c2e;
      --text: #f5f5f7;
      --text-secondary: #98989d;
      --accent: #0a84ff;
      --accent-light: #1a3a5c;
      --success: #30d158;
      --warning: #ffd60a;
      --error: #ff453a;
      --border: #48484a;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }
    
    .subtitle { color: var(--text-secondary); margin-bottom: 2rem; }
    
    .card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 600; color: var(--accent); }
    .stat-label { color: var(--text-secondary); font-size: 0.875rem; }
    
    .tag {
      display: inline-block;
      background: var(--accent-light);
      color: var(--accent);
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.875rem;
      margin: 0.25rem;
    }
    
    .tag.success { background: rgba(52, 199, 89, 0.15); color: var(--success); }
    .tag.warning { background: rgba(255, 149, 0, 0.15); color: var(--warning); }
    .tag.error { background: rgba(255, 59, 48, 0.15); color: var(--error); }
    
    ul { margin-left: 1.5rem; }
    li { margin: 0.5rem 0; }
    
    .copy-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .copy-btn:hover { opacity: 0.9; }
    
    .chart-container {
      height: 300px;
      margin: 1rem 0;
    }
    
    @media (prefers-color-scheme: dark) {
      body.auto { --bg: #1d1d1f; --bg-secondary: #2c2c2e; --text: #f5f5f7; --text-secondary: #98989d; --accent: #0a84ff; --accent-light: #1a3a5c; --border: #48484a; }
    }
  </style>
</head>
<body class="${themeClass}">
  <h1>📊 ${escapeHtml(title)}</h1>
  <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  
  <!-- At a Glance -->
  <section class="card">
    <h2>🎯 At a Glance</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value">${data.total_sessions}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="stat">
        <div class="stat-value">${data.avg_session_duration}m</div>
        <div class="stat-label">Avg Duration</div>
      </div>
      <div class="stat">
        <div class="stat-value">+${data.lines_added}</div>
        <div class="stat-label">Lines Added</div>
      </div>
      <div class="stat">
        <div class="stat-value">${Math.round((1 - data.error_rate) * 100)}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>
  </section>
  
  ${insights.at_a_glance ? `
  <!-- What's Working -->
  <section class="card">
    <h2>✨ What's Working</h2>
    ${insights.at_a_glance.whats_working?.length ? `
    <ul>${insights.at_a_glance.whats_working.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
    ` : '<p>Keep exploring!</p>'}
  </section>
  
  <!-- Quick Wins -->
  ${insights.at_a_glance.quick_wins?.length ? `
  <section class="card">
    <h2>⚡ Quick Wins</h2>
    <ul>${insights.at_a_glance.quick_wins.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
  </section>
  ` : ''}
  
  <!-- Areas to Improve -->
  ${insights.at_a_glance.whats_hindering?.length ? `
  <section class="card">
    <h2>🔧 Areas to Improve</h2>
    <ul>${insights.at_a_glance.whats_hindering.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
  </section>
  ` : ''}
  ` : ''}
  
  <!-- Top Tools -->
  <section class="card">
    <h2>🛠️ Top Tools</h2>
    <div class="grid">
      ${data.top_tools.slice(0, 6).map(t => `
        <span class="tag">${escapeHtml(t.tool)} <span style="opacity:0.7">(${t.count})</span></span>
      `).join('')}
    </div>
  </section>
  
  <!-- Languages -->
  ${data.top_languages.length ? `
  <section class="card">
    <h2>💻 Languages</h2>
    <div class="grid">
      ${data.top_languages.slice(0, 6).map(l => `
        <span class="tag">${escapeHtml(l.lang)} <span style="opacity:0.7">(${l.count})</span></span>
      `).join('')}
    </div>
  </section>
  ` : ''}
  
  <!-- Outcome Distribution -->
  <section class="card">
    <h2>📈 Outcome Distribution</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value" style="color: var(--success)">${data.outcomes.fully_achieved}</div>
        <div class="stat-label">Fully Achieved</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: var(--accent)">${data.outcomes.mostly_achieved}</div>
        <div class="stat-label">Mostly Achieved</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: var(--warning)">${data.outcomes.partially_achieved}</div>
        <div class="stat-label">Partially Achieved</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: var(--error)">${data.outcomes.not_achieved}</div>
        <div class="stat-label">Not Achieved</div>
      </div>
    </div>
  </section>
  
  ${insights.what_works?.impressive_workflows?.length ? `
  <!-- Impressive Workflows -->
  <section class="card">
    <h2>🌟 Impressive Workflows</h2>
    ${insights.what_works.impressive_workflows.map(w => `
      <div style="margin-bottom: 1rem;">
        <h3>${escapeHtml(w.title)}</h3>
        <p>${escapeHtml(w.description)}</p>
      </div>
    `).join('')}
  </section>
  ` : ''}
  
  ${insights.suggestions?.features_to_try?.length ? `
  <!-- Suggestions -->
  <section class="card">
    <h2>💡 Suggestions</h2>
    <h3>Features to Try</h3>
    <ul>${insights.suggestions.features_to_try.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    ${insights.suggestions.usage_patterns?.length ? `
    <h3>Better Usage Patterns</h3>
    <ul>${insights.suggestions.usage_patterns.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    ` : ''}
  </section>
  ` : ''}
  
  ${insights.on_the_horizon?.opportunities?.length ? `
  <!-- On the Horizon -->
  <section class="card">
    <h2>🔭 On the Horizon</h2>
    <ul>${insights.on_the_horizon.opportunities.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
  </section>
  ` : ''}
  
  ${insights.fun_ending?.interesting_facts?.length ? `
  <!-- Fun Facts -->
  <section class="card">
    <h2>🎉 Fun Facts</h2>
    <ul>${insights.fun_ending.interesting_facts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
  </section>
  ` : ''}
  
  <footer style="text-align: center; color: var(--text-secondary); margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border);">
    <p>Generated by Pi Insights</p>
    <p style="font-size: 0.75rem; margin-top: 0.5rem;">Date range: ${new Date(data.date_range.start).toLocaleDateString()} - ${new Date(data.date_range.end).toLocaleDateString()}</p>
  </footer>
  
  <script>
    // Copy functionality
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.closest('.card').querySelector('ul')?.textContent || ''
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!'
          setTimeout(() => btn.textContent = 'Copy', 2000)
        })
      })
    })
  </script>
</body>
</html>`
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

export function getReportPath(): string {
  return `${process.env.HOME || '/tmp'}/.pi/agent/usage-data/report.html`
}

export async function saveReport(html: string, path?: string): Promise<string> {
  const { writeFile, mkdir } = await import('fs/promises')
  const { join } = await import('path')
  const { homedir } = await import('os')
  
  const dir = path || join(homedir(), '.pi', 'agent', 'usage-data')
  await mkdir(dir, { recursive: true })
  
  const filePath = join(dir, 'report.html')
  await writeFile(filePath, html, 'utf-8')
  
  return filePath
}
