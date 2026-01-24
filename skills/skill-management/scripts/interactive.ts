#!/usr/bin/env bun

/**
 * 用户交互脚本 - 使用 interview 工具进行用户介入决策
 */

import { $ } from 'bun';

interface InteractiveOptions {
  phase?: string;
  message?: string;
  promptFile?: string;
  issues?: string[];
}

async function interactiveDecision(options: InteractiveOptions = {}) {
  const { phase, message, promptFile, issues } = options;

  console.log(`\n🤔 用户介入请求`);
  console.log('━'.repeat(60));

  // 读取 LLM 分析结果
  let analysisContent = '';
  if (promptFile && await $`test -f ${promptFile}`.quiet().then(() => true).catch(() => false)) {
    console.log(`\n📄 读取分析结果: ${promptFile}`);
    analysisContent = await Bun.file(promptFile).text();
    console.log(`   分析内容长度: ${analysisContent.length} 字符`);
  }

  // 生成 interview 问题配置
  const interviewConfig = generateInterviewConfig(phase, message, issues, analysisContent);

  // 写入配置文件
  const configFile = `${process.env.HOME}/.pi/agent/skills/skill-management/.interview-config.json`;
  await Bun.write(configFile, JSON.stringify(interviewConfig, null, 2));

  console.log(`\n💡 Interview 配置已生成: ${configFile}`);
  console.log(`\n📝 请 Claude 使用 interview 工具询问用户:`);
  console.log(`   interview ${configFile}`);

  console.log(`\n⚠️  等待用户决策...`);

  return { configFile };
}

function generateInterviewConfig(
  phase?: string,
  message?: string,
  issues?: string[],
  analysisContent?: string
) {
  const questions: any[] = [];

  // 基础问题：是否继续
  questions.push({
    id: 'continue',
    type: 'single',
    question: message || '是否继续流程？',
    options: ['继续', '停止', '跳过当前阶段'],
    recommended: '继续'
  });

  // 如果有分析内容，添加相关问题
  if (analysisContent && analysisContent.length > 0) {
    questions.push({
      id: 'review_analysis',
      type: 'single',
      question: 'LLM 分析结果是否可接受？',
      options: ['完全接受', '部分接受', '不接受'],
      recommended: '部分接受'
    });

    questions.push({
      id: 'analysis_score',
      type: 'single',
      question: 'LLM 给出的评分是否合理？',
      options: ['合理', '偏高', '偏低'],
      recommended: '合理'
    });
  }

  // 如果有问题列表，添加反馈问题
  if (issues && issues.length > 0) {
    questions.push({
      id: 'address_issues',
      type: 'multi',
      question: '发现以下问题，请选择需要立即修复的：',
      options: issues.slice(0, 10), // 限制最多 10 个选项
      recommended: []
    });

    questions.push({
      id: 'issue_action',
      type: 'single',
      question: '对于未修复的问题，希望如何处理？',
      options: ['记录并继续', '暂时跳过', '停止流程等待修复'],
      recommended: '记录并继续'
    });
  }

  // 阶段特定问题
  if (phase === 'assess') {
    questions.push({
      id: 'skill_rationality',
      type: 'single',
      question: '该技能的合理性评估：',
      options: ['完全合理', '基本合理', '需要改进', '不合理'],
      recommended: '基本合理'
    });
  }

  if (phase === 'audit') {
    questions.push({
      id: 'security_acceptance',
      type: 'single',
      question: '安全审计结果：',
      options: ['安全可用', '存在低风险可接受', '存在中风险需考虑', '存在高风险不可用'],
      recommended: '存在低风险可接受'
    });
  }

  if (phase === 'adapt') {
    questions.push({
      id: 'adapt_action',
      type: 'single',
      question: '是否需要进行适应性改造？',
      options: ['立即改造', '稍后改造', '无需改造'],
      recommended: '立即改造'
    });
  }

  // 添加反馈问题
  questions.push({
    id: 'feedback',
    type: 'text',
    question: '请提供任何额外的反馈或要求：',
    recommended: ''
  });

  return {
    title: `技能管理流程 - ${phase || '决策点'}`,
    description: message || '请根据 LLM 分析结果做出决策',
    questions
  };
}

// 解析命令行参数
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
用户交互脚本 - 使用 interview 工具进行用户介入决策

用法:
  bun scripts/interactive.ts [选项]

选项:
  --phase <phase>       当前阶段
  --message <msg>       决策消息
  --prompt-file <file>  LLM 分析提示文件
  --issues <issue1,issue2,...>  问题列表（逗号分隔）

示例:
  # 评估阶段决策
  bun scripts/interactive.ts --phase assess --message "评估已完成，是否继续？"

  # 审计阶段决策（带分析结果）
  bun scripts/interactive.ts --phase audit --message "审计已完成" --prompt-file /tmp/skill-security-audit-prompt.md

  # 改造阶段决策（带问题列表）
  bun scripts/interactive.ts --phase adapt --message "发现需要适配的路径" --issues "路径1,路径2,路径3"

# 使用 interview 工具
# Claude 应该使用以下命令询问用户：
# interview ~/.pi/agent/skills/skill-management/.interview-config.json
  `);
  process.exit(1);
}

// 解析选项
const options: InteractiveOptions = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--phase' && args[i + 1]) {
    options.phase = args[i + 1];
    i++;
  } else if (arg === '--message' && args[i + 1]) {
    options.message = args[i + 1];
    i++;
  } else if (arg === '--prompt-file' && args[i + 1]) {
    options.promptFile = args[i + 1];
    i++;
  } else if (arg === '--issues' && args[i + 1]) {
    options.issues = args[i + 1].split(',');
    i++;
  }
}

// 执行交互
interactiveDecision(options).catch(err => {
  console.error(`❌ 交互失败: ${err.message}`);
  process.exit(1);
});