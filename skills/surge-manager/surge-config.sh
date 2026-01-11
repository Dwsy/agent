#!/usr/bin/env bash
#
# Surge 配置管理脚本
# 用于添加直连规则、管理 Tailscale 设备等
#

set -euo pipefail

# 默认配置文件路径
SURGE_CONFIG="${SURGE_CONFIG:-$HOME/Library/Application Support/Surge/Profiles/cc.conf}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查配置文件是否存在
check_config() {
    if [[ ! -f "$SURGE_CONFIG" ]]; then
        error "Surge 配置文件不存在: $SURGE_CONFIG"
        exit 1
    fi
}

# 备份配置
backup_config() {
    local backup_path="${SURGE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$SURGE_CONFIG" "$backup_path"
    info "已备份配置到: $backup_path"
}

# 添加 bypass-tun 网段
add_bypass_tun() {
    local cidr="$1"
    check_config

    if grep -q "bypass-tun.*${cidr}" "$SURGE_CONFIG"; then
        warn "网段 $cidr 已存在于 bypass-tun 中"
        return 0
    fi

    backup_config

    # 更新 bypass-tun 行
    sed -i '' "s/bypass-tun = \(.*\)/bypass-tun = \1,${cidr}/" "$SURGE_CONFIG"

    info "已添加 bypass-tun 网段: $cidr"
}

# 添加 IP-CIDR 规则
add_ip_rule() {
    local cidr="$1"
    local policy="${2:-🎯 全球直连}"

    check_config

    # 检查规则是否已存在
    if grep -q "IP-CIDR,${cidr}" "$SURGE_CONFIG"; then
        warn "IP 规则已存在: $cidr"
        return 0
    fi

    backup_config

    # 在 [Rule] 部分后添加规则
    local rule="IP-CIDR,${cidr},${policy},no-resolve"
    sed -i '' "/^\[Rule\]$/a\\
# Tailscale 直连规则\\
${rule}
" "$SURGE_CONFIG"

    info "已添加 IP 规则: $rule"
}

# 添加 DOMAIN 规则
add_domain_rule() {
    local domain="$1"
    local policy="${2:-🎯 全球直连}"

    check_config

    # 检查规则是否已存在
    if grep -q "DOMAIN,${domain}," "$SURGE_CONFIG"; then
        warn "域名规则已存在: $domain"
        return 0
    fi

    backup_config

    # 在 [Rule] 部分后添加规则
    local rule="DOMAIN,${domain},${policy}"
    sed -i '' "/^\[Rule\]$/a\\
# Tailscale 直连规则\\
${rule}
" "$SURGE_CONFIG"

    info "已添加域名规则: $rule"
}

# 添加 DOMAIN-SUFFIX 规则
add_domain_suffix_rule() {
    local suffix="$1"
    local policy="${2:-🎯 全球直连}"

    check_config

    # 检查规则是否已存在
    if grep -q "DOMAIN-SUFFIX,${suffix}," "$SURGE_CONFIG"; then
        warn "域名后缀规则已存在: $suffix"
        return 0
    fi

    backup_config

    # 在 [Rule] 部分后添加规则
    local rule="DOMAIN-SUFFIX,${suffix},${policy}"
    sed -i '' "/^\[Rule\]$/a\\
# Tailscale 直连规则\\
${rule}
" "$SURGE_CONFIG"

    info "已添加域名后缀规则: $rule"
}

# 从 tailscale status 添加设备
add_tailscale_devices() {
    check_config

    info "从 tailscale status 获取设备列表..."

    if ! command -v tailscale &> /dev/null; then
        error "tailscale 命令未找到"
        exit 1
    fi

    # 获取设备列表
    local devices
    devices=$(tailscale status 2>/dev/null | grep -v "^#" | grep -v "^$" | awk '{print $1, $2}')

    if [[ -z "$devices" ]]; then
        error "未获取到 Tailscale 设备列表"
        exit 1
    fi

    backup_config

    # 添加网段和域名后缀
    add_bypass_tun "100.64.0.0/10" 2>/dev/null || true

    # 添加整体规则
    if ! grep -q "IP-CIDR,100.64.0.0/10" "$SURGE_CONFIG"; then
        sed -i '' "/^\[Rule\]$/a\\
# Tailscale 直连规则\\
IP-CIDR,100.64.0.0/10,🎯 全球直连,no-resolve\\
DOMAIN-SUFFIX,ts.net,🎯 全球直连
" "$SURGE_CONFIG"
    fi

    # 为每个设备添加单独规则
    while read -r ip name; do
        if [[ -n "$ip" && -n "$name" ]]; then
            # 检查是否已存在
            if ! grep -q "IP-CIDR,${ip}/32" "$SURGE_CONFIG"; then
                sed -i '' "/DOMAIN-SUFFIX,ts.net/a\\
IP-CIDR,${ip}/32,🎯 全球直连,no-resolve\\
DOMAIN,${name}.ts.net,🎯 全球直连
" "$SURGE_CONFIG"
                info "已添加设备: $name ($ip)"
            fi
        fi
    done <<< "$devices"

    info "所有 Tailscale 设备已添加完成"
}

# 列出当前直连规则
list_rules() {
    check_config

    info "当前直连规则："
    echo ""

    echo "=== bypass-tun 网段 ==="
    grep "bypass-tun" "$SURGE_CONFIG" | sed 's/bypass-tun = /  /' | tr ',' '\n' | grep -v "^$" | sed 's/^/  - /'

    echo ""
    echo "=== [Rule] 部分直连规则 ==="
    awk '/^\[Rule\]$/,/^\[/{print}' "$SURGE_CONFIG" | grep -E "(IP-CIDR|DOMAIN|DOMAIN-SUFFIX)" | grep "🎯 全球直连" | sed 's/^/  /'
}

# 显示帮助
show_help() {
    cat << EOF
Surge 配置管理脚本

用法: $0 <command> [args...]

命令:
  add-bypass <cidr>          添加 bypass-tun 网段
  add-ip <cidr> [policy]     添加 IP-CIDR 规则
  add-domain <domain> [policy]  添加 DOMAIN 规则
  add-suffix <suffix> [policy]  添加 DOMAIN-SUFFIX 规则
  add-tailscale              从 tailscale status 添加所有设备
  list                       列出当前直连规则
  help                       显示此帮助信息

示例:
  $0 add-bypass 100.64.0.0/10
  $0 add-ip 100.89.35.126/32
  $0 add-domain mbp.ts.net
  $0 add-suffix ts.net
  $0 add-tailscale
  $0 list

环境变量:
  SURGE_CONFIG               自定义配置文件路径 (默认: ~/Library/Application Support/Surge/Profiles/cc.conf)

EOF
}

# 主函数
main() {
    local command="${1:-help}"

    case "$command" in
        add-bypass)
            [[ $# -lt 2 ]] && { error "缺少参数: cidr"; show_help; exit 1; }
            add_bypass_tun "$2"
            ;;
        add-ip)
            [[ $# -lt 2 ]] && { error "缺少参数: cidr"; show_help; exit 1; }
            add_ip_rule "$2" "${3:-🎯 全球直连}"
            ;;
        add-domain)
            [[ $# -lt 2 ]] && { error "缺少参数: domain"; show_help; exit 1; }
            add_domain_rule "$2" "${3:-🎯 全球直连}"
            ;;
        add-suffix)
            [[ $# -lt 2 ]] && { error "缺少参数: suffix"; show_help; exit 1; }
            add_domain_suffix_rule "$2" "${3:-🎯 全球直连}"
            ;;
        add-tailscale)
            add_tailscale_devices
            ;;
        list)
            list_rules
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac

    echo ""
    info "配置已更新，请在 Surge 中重新加载配置"
}

main "$@"