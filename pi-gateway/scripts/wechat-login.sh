#!/bin/bash
# 微信登录自动化 - 终端二维码显示 + 自动轮询

GATEWAY_URL="http://127.0.0.1:52134"
TIMEOUT=120  # 2分钟超时

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 微信扫码登录"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 获取二维码
RESPONSE=$(curl -s "$GATEWAY_URL/api/wechat/login")

if ! echo "$RESPONSE" | jq -e '.ok' > /dev/null 2>&1; then
    echo "❌ 获取二维码失败"
    echo "$RESPONSE" | jq .
    exit 1
fi

QRCODE_URL=$(echo "$RESPONSE" | jq -r '.qrcodeUrl')
SESSION_KEY=$(echo "$RESPONSE" | jq -r '.sessionKey')

# 显示二维码
echo "$QRCODE_URL" | qrencode -t ANSIUTF8 -m 2 2>/dev/null || echo "链接: $QRCODE_URL"

echo ""
echo "⏳ 请用微信扫描上方二维码 ($TIMEOUT 秒超时)"
echo ""

# 轮询登录状态
START_TIME=$(date +%s)
while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ $ELAPSED -gt $TIMEOUT ]; then
        echo ""
        echo "⏰ 登录超时，请重新运行脚本"
        exit 1
    fi
    
    STATUS=$(curl -s "$GATEWAY_URL/api/wechat/login/status?sessionKey=$SESSION_KEY")
    CONNECTED=$(echo "$STATUS" | jq -r '.connected // false')
    
    if [ "$CONNECTED" = "true" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ 登录成功！"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ACCOUNT_ID=$(echo "$STATUS" | jq -r '.accountId // "default"')
        echo "📋 账号ID: $ACCOUNT_ID"
        echo ""
        
        # 保存账号信息
        echo "💾 账号信息已保存到 ~/.pi/state/wechat/accounts/"
        
        # 检查 tmux session
        if tmux has-session -t gateway 2>/dev/null; then
            echo ""
            echo "🔄 正在重启 Gateway..."
            tmux send-keys -t gateway C-c
            sleep 2
            tmux send-keys -t gateway "cd ~/.pi/agent/pi-gateway && bun run src/cli.ts gateway" Enter
            sleep 3
            echo "✅ Gateway 已重启，微信频道已激活！"
        fi
        exit 0
    fi
    
    # 显示进度
    REMAINING=$((TIMEOUT - ELAPSED))
    printf "\r   等待扫码... (剩余 %ds)  " "$REMAINING"
    sleep 2
done
