<style>
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 1rem}
.metric{background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:1rem;min-width:0}
.metric .l{font-size:13px;color:var(--color-text-secondary);margin:0 0 6px}
.metric .v{font-size:24px;font-weight:500;margin:0;color:var(--color-text-primary)}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:0 0 8px;font-size:12px;color:var(--color-text-secondary)}
.legend span{display:flex;align-items:center;gap:4px}
.sw{width:10px;height:10px;border-radius:2px;display:inline-block}
.sw-a{background:var(--color-text-secondary)}
.sw-b{background:var(--color-text-info)}
</style>
<div class="metrics">
  <div class="metric"><p class="l">Metric A</p><p class="v">128</p></div>
  <div class="metric"><p class="l">Metric B</p><p class="v">46%</p></div>
  <div class="metric"><p class="l">Metric C</p><p class="v">$12k</p></div>
</div>
<div class="legend">
  <span><i class="sw sw-a"></i>Series A</span>
  <span><i class="sw sw-b"></i>Series B</span>
</div>
<div style="position:relative;width:100%;height:260px">
  <canvas id="modChart"></canvas>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" onload="initChart()"></script>
<script>
function themeColors(){
  if(typeof window._themeVars === 'function'){
    var t = window._themeVars();
    return {
      textSecondary: t.textSecondary || '#8E8E93',
      textInfo: t.textInfo || '#007AFF',
      chartTick: t.chartTick || '#8E8E93',
      chartGrid: t.chartGrid || 'rgba(0,0,0,0.06)'
    };
  }
  var s=getComputedStyle(document.documentElement);
  var g=function(n,f){return s.getPropertyValue(n).trim()||f};
  return {
    textSecondary:g('--color-text-secondary','#8E8E93'),
    textInfo:g('--color-text-info','#007AFF'),
    chartTick:g('--chart-tick','#8E8E93'),
    chartGrid:g('--chart-grid','rgba(0,0,0,0.06)')
  };
}
function initChart(){
  if(!window.Chart) return;
  var el=document.getElementById('modChart');
  if(!el||el._done) return;
  el._done=true;
  var t=themeColors();
  new Chart(el,{
    type:'bar',
    data:{
      labels:['Q1','Q2','Q3','Q4'],
      datasets:[{
        data:[12,19,8,15],
        backgroundColor:[t.textSecondary,t.textInfo,t.textSecondary,t.textInfo],
        borderRadius:4,
        borderSkipped:false
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{display:false},ticks:{color:t.chartTick,font:{size:12}}},
        y:{beginAtZero:true,grid:{color:t.chartGrid},ticks:{color:t.chartTick,font:{size:11}}}
      }
    }
  });
}
if(window.Chart) initChart();
</script>
