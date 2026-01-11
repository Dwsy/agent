#!/usr/bin/env bun
/**
 * Surge 配置管理库
 *
 * 用于管理 Surge 配置文件，支持规则添加、配置编辑等操作
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// 默认配置文件路径
const DEFAULT_CONFIG_PATH = join(
  process.env.HOME || "",
  "Library",
  "Application Support",
  "Surge",
  "Profiles",
  "cc.conf"
);

export interface SurgeConfig {
  path: string;
  content: string;
}

export interface TailscaleDevice {
  ip: string;
  name: string;
  user?: string;
  os?: string;
  status?: string;
}

export class SurgeManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || process.env.SURGE_CONFIG || DEFAULT_CONFIG_PATH;
  }

  /**
   * 读取配置文件
   */
  readConfig(): SurgeConfig {
    if (!existsSync(this.configPath)) {
      throw new Error(`配置文件不存在: ${this.configPath}`);
    }

    const content = readFileSync(this.configPath, "utf-8");
    return {
      path: this.configPath,
      content,
    };
  }

  /**
   * 写入配置文件
   */
  writeConfig(content: string): void {
    writeFileSync(this.configPath, content, "utf-8");
  }

  /**
   * 备份配置文件
   */
  backup(): string {
    const backupPath = `${this.configPath}.backup.${Date.now()}`;
    const { content } = this.readConfig();
    writeFileSync(backupPath, content, "utf-8");
    return backupPath;
  }

  /**
   * 添加 bypass-tun 网段
   */
  addBypassTun(cidr: string): void {
    const { content } = this.readConfig();
    const lines = content.split("\n");

    let updated = false;
    const newLines = lines.map((line) => {
      if (line.startsWith("bypass-tun =")) {
        const current = line.substring("bypass-tun = ".length);
        if (!current.includes(cidr)) {
          updated = true;
          return `bypass-tun = ${current},${cidr}`;
        }
      }
      return line;
    });

    if (updated) {
      this.writeConfig(newLines.join("\n"));
      console.log(`✓ 已添加 bypass-tun 网段: ${cidr}`);
    } else {
      console.log(`⊘ 网段已存在: ${cidr}`);
    }
  }

  /**
   * 添加规则到 [Rule] 部分
   */
  addRule(rule: string, comment?: string): void {
    const { content } = this.readConfig();
    const lines = content.split("\n");

    // 检查规则是否已存在
    if (lines.some((line) => line.startsWith(rule.split(",")[0]))) {
      console.log(`⊘ 规则已存在: ${rule}`);
      return;
    }

    const newLines: string[] = [];
    let inserted = false;

    for (let i = 0; i < lines.length; i++) {
      newLines.push(lines[i]);

      // 在 [Rule] 后插入
      if (!inserted && lines[i].trim() === "[Rule]") {
        if (comment) {
          newLines.push(`# ${comment}`);
        }
        newLines.push(rule);
        inserted = true;
      }
    }

    if (inserted) {
      this.writeConfig(newLines.join("\n"));
      console.log(`✓ 已添加规则: ${rule}`);
    } else {
      throw new Error("未找到 [Rule] 部分");
    }
  }

  /**
   * 添加 IP-CIDR 规则
   */
  addIpRule(cidr: string, policy: string = "🎯 全球直连"): void {
    const rule = `IP-CIDR,${cidr},${policy},no-resolve`;
    this.addRule(rule, "Tailscale 直连规则");
  }

  /**
   * 添加 DOMAIN 规则
   */
  addDomainRule(domain: string, policy: string = "🎯 全球直连"): void {
    const rule = `DOMAIN,${domain},${policy}`;
    this.addRule(rule, "Tailscale 直连规则");
  }

  /**
   * 添加 DOMAIN-SUFFIX 规则
   */
  addDomainSuffixRule(suffix: string, policy: string = "🎯 全球直连"): void {
    const rule = `DOMAIN-SUFFIX,${suffix},${policy}`;
    this.addRule(rule, "Tailscale 直连规则");
  }

  /**
   * 获取 Tailscale 设备列表
   */
  async getTailscaleDevices(): Promise<TailscaleDevice[]> {
    const { stdout } = Bun.spawn({
      cmd: ["tailscale", "status"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(stdout).text();
    const lines = output.split("\n");

    const devices: TailscaleDevice[] = [];

    for (const line of lines) {
      // 跳过注释和空行
      if (line.startsWith("#") || line.trim() === "") continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        devices.push({
          ip: parts[0],
          name: parts[1],
          user: parts[2]?.replace("@", ""),
          os: parts[3],
          status: parts.slice(4).join(" "),
        });
      }
    }

    return devices;
  }

  /**
   * 添加 Tailscale 设备直连规则
   */
  async addTailscaleDevices(): Promise<void> {
    console.log("从 tailscale status 获取设备列表...");

    const devices = await this.getTailscaleDevices();

    if (devices.length === 0) {
      console.log("⊘ 未获取到 Tailscale 设备");
      return;
    }

    this.backup();

    // 添加网段和域名后缀
    this.addBypassTun("100.64.0.0/10");
    this.addIpRule("100.64.0.0/10");
    this.addDomainSuffixRule("ts.net");

    // 为每个设备添加单独规则
    for (const device of devices) {
      this.addIpRule(`${device.ip}/32`);
      this.addDomainRule(`${device.name}.ts.net`);
      console.log(`  ✓ ${device.name} (${device.ip})`);
    }

    console.log(`✓ 已添加 ${devices.length} 个设备`);
  }

  /**
   * 列出当前直连规则
   */
  listDirectRules(): void {
    const { content } = this.readConfig();
    const lines = content.split("\n");

    console.log("\n=== bypass-tun 网段 ===");
    for (const line of lines) {
      if (line.startsWith("bypass-tun =")) {
        const cidrs = line.substring("bypass-tun = ".length).split(",");
        for (const cidr of cidrs) {
          console.log(`  - ${cidr.trim()}`);
        }
      }
    }

    console.log("\n=== [Rule] 部分直连规则 ===");
    let inRuleSection = false;
    for (const line of lines) {
      if (line.trim() === "[Rule]") {
        inRuleSection = true;
        continue;
      }
      if (inRuleSection && line.startsWith("[")) {
        break;
      }
      if (inRuleSection && line.match(/^(IP-CIDR|DOMAIN|DOMAIN-SUFFIX)/) && line.includes("🎯 全球直连")) {
        console.log(`  ${line}`);
      }
    }

    console.log("");
  }

  /**
   * 查找规则
   */
  findRule(pattern: string): string[] {
    const { content } = this.readConfig();
    const lines = content.split("\n");

    return lines.filter((line) => {
      if (!line.match(/^(IP-CIDR|DOMAIN|DOMAIN-SUFFIX)/)) return false;
      return line.toLowerCase().includes(pattern.toLowerCase());
    });
  }

  /**
   * 删除规则
   */
  removeRule(pattern: string): void {
    const { content } = this.readConfig();
    const lines = content.split("\n");

    const newLines = lines.filter((line) => {
      if (!line.match(/^(IP-CIDR|DOMAIN|DOMAIN-SUFFIX)/)) return true;
      return !line.toLowerCase().includes(pattern.toLowerCase());
    });

    if (newLines.length < lines.length) {
      this.writeConfig(newLines.join("\n"));
      console.log(`✓ 已删除匹配规则: ${pattern}`);
    } else {
      console.log(`⊘ 未找到匹配规则: ${pattern}`);
    }
  }
}

// CLI 接口
if (import.meta.main) {
  const manager = new SurgeManager();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "add-bypass":
        if (!args[0]) throw new Error("缺少参数: cidr");
        manager.addBypassTun(args[0]);
        break;

      case "add-ip":
        if (!args[0]) throw new Error("缺少参数: cidr");
        manager.addIpRule(args[0], args[1]);
        break;

      case "add-domain":
        if (!args[0]) throw new Error("缺少参数: domain");
        manager.addDomainRule(args[0], args[1]);
        break;

      case "add-suffix":
        if (!args[0]) throw new Error("缺少参数: suffix");
        manager.addDomainSuffixRule(args[0], args[1]);
        break;

      case "add-tailscale":
        await manager.addTailscaleDevices();
        break;

      case "list":
        manager.listDirectRules();
        break;

      case "find":
        if (!args[0]) throw new Error("缺少参数: pattern");
        const rules = manager.findRule(args[0]);
        rules.forEach((rule) => console.log(`  ${rule}`));
        break;

      case "remove":
        if (!args[0]) throw new Error("缺少参数: pattern");
        manager.removeRule(args[0]);
        break;

      default:
        console.log(`
Surge 配置管理工具

用法: bun surge-config.ts <command> [args...]

命令:
  add-bypass <cidr>          添加 bypass-tun 网段
  add-ip <cidr> [policy]     添加 IP-CIDR 规则
  add-domain <domain> [policy]  添加 DOMAIN 规则
  add-suffix <suffix> [policy]  添加 DOMAIN-SUFFIX 规则
  add-tailscale              从 tailscale status 添加所有设备
  list                       列出当前直连规则
  find <pattern>             查找匹配规则
  remove <pattern>           删除匹配规则

示例:
  bun surge-config.ts add-bypass 100.64.0.0/10
  bun surge-config.ts add-ip 100.89.35.126/32
  bun surge-config.ts add-domain mbp.ts.net
  bun surge-config.ts add-tailscale
  bun surge-config.ts list
        `);
    }

    console.log("\n✓ 配置已更新，请在 Surge 中重新加载配置");
  } catch (error) {
    console.error(`✗ 错误: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}