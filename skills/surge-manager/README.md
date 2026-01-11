# Surge Manager

Surge 配置管理技能，用于管理 Surge 配置文件，支持规则添加、配置编辑、Tailscale 设备管理等操作。

## 功能特性

- ✅ 添加直连规则（IP-CIDR、DOMAIN、DOMAIN-SUFFIX）
- ✅ 管理 bypass-tun 网段
- ✅ 自动从 Tailscale 获取设备并添加直连规则
- ✅ 列出当前直连规则
- ✅ 查找和删除规则
- ✅ 自动备份配置

## 文件结构

```
surge-manager/
├── SKILL.md          # 技能文档
├── surge-config.sh   # Bash 脚本版本
├── surge-config.ts   # TypeScript 版本
└── README.md         # 本文件
```

## 快速开始

### 使用 Bash 脚本

```bash
# 添加 bypass-tun 网段
~/.pi/agent/skills/surge-manager/surge-config.sh add-bypass 100.64.0.0/10

# 添加 IP 规则
~/.pi/agent/skills/surge-manager/surge-config.sh add-ip 100.89.35.126/32

# 添加域名规则
~/.pi/agent/skills/surge-manager/surge-config.sh add-domain mbp.ts.net

# 添加域名后缀规则
~/.pi/agent/skills/surge-manager/surge-config.sh add-suffix ts.net

# 自动添加所有 Tailscale 设备
~/.pi/agent/skills/surge-manager/surge-config.sh add-tailscale

# 列出当前直连规则
~/.pi/agent/skills/surge-manager/surge-config.sh list

# 显示帮助
~/.pi/agent/skills/surge-manager/surge-config.sh help
```

### 使用 TypeScript 版本

```bash
# 添加 bypass-tun 网段
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-bypass 100.64.0.0/10

# 添加 IP 规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-ip 100.89.35.126/32

# 添加域名规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-domain mbp.ts.net

# 添加域名后缀规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-suffix ts.net

# 自动添加所有 Tailscale 设备
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-tailscale

# 列出当前直连规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts list

# 查找规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts find mbp

# 删除规则
bun ~/.pi/agent/skills/surge-manager/surge-config.ts remove mbp
```

## Tailscale 设备管理

### 自动添加所有设备

```bash
# Bash 版本
~/.pi/agent/skills/surge-manager/surge-config.sh add-tailscale

# TypeScript 版本
bun ~/.pi/agent/skills/surge-manager/surge-config.ts add-tailscale
```

这个命令会：
1. 从 `tailscale status` 获取所有设备列表
2. 添加 `100.64.0.0/10` 网段到 bypass-tun
3. 添加 `*.ts.net` 域名后缀规则
4. 为每个设备添加单独的 IP 和域名规则

### 手动添加单个设备

```bash
# 添加 IP 规则
~/.pi/agent/skills/surge-manager/surge-config.sh add-ip 100.89.35.126/32

# 添加域名规则
~/.pi/agent/skills/surge-manager/surge-config.sh add-domain mbp.ts.net
```

## 配置文件路径

默认配置文件路径：
```
~/Library/Application Support/Surge/Profiles/cc.conf
```

可以通过环境变量自定义：
```bash
export SURGE_CONFIG="/path/to/your/surge.conf"
~/.pi/agent/skills/surge-manager/surge-config.sh list
```

## 规则类型说明

### IP-CIDR

用于 IP 地址或网段直连：

```ini
IP-CIDR,100.89.35.126/32,🎯 全球直连,no-resolve
IP-CIDR,100.64.0.0/10,🎯 全球直连,no-resolve
```

### DOMAIN

用于单个域名直连：

```ini
DOMAIN,mbp.ts.net,🎯 全球直连
```

### DOMAIN-SUFFIX

用于域名后缀直连（匹配所有子域名）：

```ini
DOMAIN-SUFFIX,ts.net,🎯 全球直连
```

## 常见使用场景

### 场景 1：添加内网网段直连

```bash
~/.pi/agent/skills/surge-manager/surge-config.sh add-bypass 192.168.1.0/24
~/.pi/agent/skills/surge-manager/surge-config.sh add-ip 192.168.1.0/24
```

### 场景 2：添加 Tailscale 设备

```bash
# 自动添加所有设备
~/.pi/agent/skills/surge-manager/surge-config.sh add-tailscale

# 或手动添加特定设备
~/.pi/agent/skills/surge-manager/surge-config.sh add-ip 100.89.35.126/32
~/.pi/agent/skills/surge-manager/surge-config.sh add-domain mbp.ts.net
```

### 场景 3：添加公司内网域名

```bash
~/.pi/agent/skills/surge-manager/surge-config.sh add-suffix company.local
```

## 备份和恢复

每次修改配置前会自动创建备份：

```bash
# 备份文件格式
cc.conf.backup.20250109_094459

# 恢复备份
cp ~/Library/Application\ Support/Surge/Profiles/cc.conf.backup.20250109_094459 \
   ~/Library/Application\ Support/Surge/Profiles/cc.conf
```

## 注意事项

1. **规则优先级**：
   - 具体规则（IP-CIDR /32、DOMAIN）优先于网段规则
   - 规则顺序很重要，越靠前优先级越高

2. **no-resolve 参数**：
   - IP 规则建议添加 `no-resolve` 避免不必要的 DNS 查询

3. **重新加载配置**：
   - 修改后需要在 Surge 中重新加载配置使规则生效

4. **Tailscale 网段**：
   - Tailscale 使用 CGNAT 网段 `100.64.0.0/10`
   - 域名统一使用 `.ts.net` 后缀

## 故障排查

### 规则不生效

1. 检查规则顺序是否正确
2. 确认是否重新加载了配置
3. 使用 Surge 的规则测试功能验证

### IP 无法直连

1. 确认 IP 在 bypass-tun 列表中
2. 检查是否有冲突的规则
3. 使用 ping 测试网络连通性

### 域名无法直连

1. 确认 DNS 解析正确
2. 检查域名规则拼写
3. 尝试使用 IP 规则替代

## 相关链接

- [Surge 官方文档](https://manual.nssurge.com/)
- [Tailscale 官网](https://tailscale.com/)
- [SKILL.md](./SKILL.md) - 完整技能文档