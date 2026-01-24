#!/usr/bin/env bun

/**
 * 通知脚本 - 向用户发送技能管理流程的通知
 */

import { $ } from 'bun';

interface NotifyOptions {
  type?: 'decision' | 'progress' | 'complete' | 'error' | 'warning';
  skill?: string;
  message?: string;
  phase?: string;
  report?: string;
  channel?: 'console' | 'file' | 'both';
}

async function notify(options: NotifyOptions = {}) {
  const {
    type = 'info',
    skill,
    message,
    phase,
    report,
    channel = 'console'
  } = options;

  const notification = buildNotification(type, skill, message, phase, report);

  if (channel === 'console' || channel === 'both') {
    console.log(notification);
  }

  if (channel === 'file' || channel === 'both') {
    const logPath = `${process.env.HOME}/.pi/agent/skills/skill-management/notifications.log`;
    await Bun.appendFile(logPath, `\n${new Date().toISOString()}\n${notification}\n`);
  }

  return { success: true };
}

function buildNotification(
  type: string,
  skill?: string,
  message?: string,
  phase?: string,
  report?: string
): string {
  const icons = {
    decision: '🤔',
    progress: '⏳',
    complete: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const icon = icons[type as keyof typeof icons] || icons.info;

  let output = `\n${icon} ${type.toUpperCase()}`;

  if (skill) output += ` - ${skill}`;
  output += '\n' + '━'.repeat(60);

  if (phase) output += `\n\n📍 阶段: ${phase}`;
  if (message) output += `\n\n📝 ${message}`;
  if (report) output += `\n\n📄 报告: ${report}`;

  switch (type) {
    case 'decision':
      output += `\n\n⏸️  流程暂停，等待用户确认`;
      output += `\n\n操作选项:`;
      output += `\n  [Y] 继续`;
      output += `\n  [N] 停止`;
      output += `\n  [S] 跳过当前阶段`;
      break;

    case 'progress':
      output += `\n\n🔄 流程进行中...`;
      break;

    case 'complete':
      output += `\n\n🎉 流程顺利完成！`;
      output += `\n\n后续步骤:`;
      output += `\n  1. 查看详细报告`;
      output += `\n  2. 测试技能功能`;
      output += `\n  3. 根据建议优化`;
      break;

    case 'error':
      output += `\n\n🚨 发生错误，流程终止`;
      output += `\n\n排查建议:`;
      output += `\n  1. 检查错误日志`;
      output += `\n  2. 验证输入参数`);
      output += `\n  3. 重试流程`;
      break;

    case 'warning':
      output += `\n\n⚠️  注意事项`;
      output += `\n\n建议:`;
      output += `\n  1. 仔细阅读警告信息`);
      output += `\n  2. 评估潜在风险`;
      output += `\n  3. 采取相应措施`;
      break;
  }

  output += '\n';

  return output;
}

// 解析命令行参数
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
通知脚本 - 向用户发送技能管理流程的通知

用法:
  bun scripts/notify.ts [选项]

选项:
  --type <type>       通知类型 (decision, progress, complete, error, warning)
  --skill <name>      技能名称
  --message <msg>     通知消息
  --phase <phase>     当前阶段
  --report <path>     报告路径
  --channel <channel> 通知渠道 (console, file, both)

示例:
  # 决策点通知
  bun scripts/notify.ts --type decision --skill office-pdf --message "需要确认是否继续"

  # 进度通知
  bun scripts/notify.ts --type progress --skill office-pdf --phase "Phase 3: 安全审计"

  # 完成通知
  bun scripts/notify.ts --type complete --skill office-pdf --report reports/office-pdf.md

  # 错误通知
  bun scripts/notify.ts --type error --message "依赖安装失败"

  # 警告通知
  bun scripts/notify.ts --type warning --message "发现潜在安全风险"
  `);
  process.exit(0);
}

// 解析选项
const options: NotifyOptions = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--type' && args[i + 1]) {
    options.type = args[i + 1] as any;
    i++;
  } else if (arg === '--skill' && args[i + 1]) {
    options.skill = args[i + 1];
    i++;
  } else if (arg === '--message' && args[i + 1]) {
    options.message = args[i + 1];
    i++;
  } else if (arg === '--phase' && args[i + 1]) {
    options.phase = args[i + 1];
    i++;
  } else if (arg === '--report' && args[i + 1]) {
    options.report = args[i + 1];
    i++;
  } else if (arg === '--channel' && args[i + 1]) {
    options.channel = args[i + 1] as any;
    i++;
  }
}

// 发送通知
notify(options).catch(err => {
  console.error(`❌ 通知发送失败: ${err.message}`);
  process.exit(1);
});