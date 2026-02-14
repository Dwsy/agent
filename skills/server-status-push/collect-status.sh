#!/usr/bin/env bash
set -euo pipefail

now="$(date '+%F %T %Z')"
host="$(hostname)"
kernel="$(uname -srmo)"
uptime_h="$(uptime -p 2>/dev/null || true)"

cpu_cores="$(nproc 2>/dev/null || echo 'N/A')"
loadavg="$(awk '{print $1" "$2" "$3}' /proc/loadavg 2>/dev/null || echo 'N/A N/A N/A')"

mem_line="$(free -m 2>/dev/null | awk '/^Mem:/ {printf "%s %s %s", $2, $3, $7}')"
mem_total="$(echo "$mem_line" | awk '{print $1}')"
mem_used="$(echo "$mem_line" | awk '{print $2}')"
mem_avail="$(echo "$mem_line" | awk '{print $3}')"
mem_pct="N/A"
if [[ -n "${mem_total:-}" && "$mem_total" != "0" ]]; then
  mem_pct="$(awk -v u="$mem_used" -v t="$mem_total" 'BEGIN{printf "%.1f", (u/t)*100}')%"
fi

root_disk="$(df -h / | awk 'NR==2 {print $2" total, "$3" used, "$4" avail, "$5" used"}')"
root_pct_num="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"

ip_addr="$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'N/A')"

warns=()

if [[ "$root_pct_num" =~ ^[0-9]+$ ]] && (( root_pct_num > 85 )); then
  warns+=("磁盘使用率高: ${root_pct_num}%")
fi

mem_pct_num="${mem_pct%%%}"
if [[ "$mem_pct_num" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  mem_pct_int="${mem_pct_num%.*}"
  if (( mem_pct_int > 90 )); then
    warns+=("内存使用率高: ${mem_pct}")
  fi
fi

load1="$(echo "$loadavg" | awk '{print $1}')"
if [[ "$cpu_cores" =~ ^[0-9]+$ ]] && [[ "$load1" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  threshold="$(awk -v c="$cpu_cores" 'BEGIN{printf "%.2f", c*1.5}')"
  over="$(awk -v l="$load1" -v t="$threshold" 'BEGIN{print (l>t)?1:0}')"
  if [[ "$over" == "1" ]]; then
    warns+=("系统负载偏高: load1=${load1}, cores=${cpu_cores}")
  fi
fi

docker_summary="Docker 不可用"
if command -v docker >/dev/null 2>&1; then
  running="$(docker ps -q 2>/dev/null | wc -l | tr -d ' ')"
  allc="$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')"
  docker_summary="Docker 容器: running ${running} / total ${allc}"
fi

status="✅ 正常"
if (( ${#warns[@]} > 0 )); then
  status="⚠️ 告警"
fi

echo "=== 服务器状态报告 ==="
echo "状态: ${status}"
echo "时间: ${now}"
echo "主机: ${host}"
echo "IP: ${ip_addr}"
echo "内核: ${kernel}"
echo "运行时长: ${uptime_h}"
echo
echo "[负载] ${loadavg} (cores=${cpu_cores})"
echo "[内存] total ${mem_total}MB, used ${mem_used}MB, avail ${mem_avail}MB, used ${mem_pct}"
echo "[磁盘] / => ${root_disk}"
echo "[容器] ${docker_summary}"

echo
if (( ${#warns[@]} > 0 )); then
  echo "告警项:"
  for w in "${warns[@]}"; do
    echo "- ${w}"
  done
else
  echo "告警项: 无"
fi
