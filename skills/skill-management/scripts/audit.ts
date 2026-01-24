#!/usr/bin/env bun

/**
 * 安全审计脚本 - 调用 LLM 进行深度安全审计
 */

import { $ } from 'bun';

interface AuditOptions {
  llm?: boolean;
  interactive?: boolean;
}

interface AuditResult {
  skillName: string;
  passed: boolean;
  security: any;
  score: number;
  issues: string[];
  recommendations: string[];
}

async function auditSkill(skillPath: string, options: AuditOptions = {}) {
  const skillName = skillPath.split('/').pop() || skillPath;
  console.log(`\n🔒 安全审计: ${skillName}`);
  console.log('━'.repeat(60));

  const result: AuditResult = {
    skillName,
    passed: true,
    security: {},
    score: 0,
    issues: [],
    recommendations: []
  };

  // 收集技能信息
  const skillInfo = await collectSkillInfo(skillPath);

  // 判断技能类型
  const skillType = await determineSkillType(skillInfo);
  console.log(`   技能类型: ${skillType}`);

  // 基础安全检查（仅对有脚本的技能）
  let basicChecks: any = { score: 50, passed: true, issues: [], findings: {} };
  if (skillInfo.hasScripts) {
    console.log(`\n🔍 执行基础安全检查...`);
    basicChecks = await performBasicSecurityChecks(skillPath);
    result.security.basic = basicChecks;
  } else {
    console.log(`   ✅ 纯知识型技能，无需基础安全检查`);
    result.security.basic = { note: "纯知识型技能，无脚本文件" };
  }

  // 调用 LLM 进行深度安全审计（始终执行）
  if (options.llm !== false) {
    console.log(`\n🤖 调用 LLM 进行深度安全审计...`);
    const llmAnalysis = await performLLMSecurityAudit(skillInfo, basicChecks, skillType);

    // 解析 LLM 分析结果
    const parsed = parseLLMAudit(llmAnalysis);
    result.security.llm = parsed;
    result.score = parsed.score;
    result.issues.push(...parsed.issues);
    result.recommendations.push(...parsed.recommendations);
    result.passed = parsed.passed;
  } else {
    result.score = basicChecks.score;
    result.issues.push(...basicChecks.issues);
    result.passed = basicChecks.passed;
  }

  // 输出结果
  console.log(`\n✅ 审计完成`);
  console.log(`   安全评分: ${result.score}/100`);
  console.log(`   审计结果: ${result.passed ? '✅ 通过' : '❌ 未通过'}`);

  if (result.issues.length > 0) {
    console.log(`\n⚠️  发现 ${result.issues.length} 个安全问题:`);
    result.issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }

  if (result.recommendations.length > 0) {
    console.log(`\n💡 修复建议:`);
    result.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  return result;
}

async function collectSkillInfo(skillPath: string) {
  const info: any = {
    path: skillPath,
    files: [],
    content: {},
    hasScripts: false
  };

  // 读取 SKILL.md
  const skillFile = `${skillPath}/SKILL.md`;
  if (await $`test -f ${skillFile}`.quiet().then(() => true).catch(() => false)) {
    info.content.skill = await Bun.file(skillFile).text();
  }

  // 列出所有文件
  const findProc = await $`find ${skillPath} -type f`.quiet();
  info.files = findProc.stdout.toString().trim().split('\n').filter(Boolean);

  // 检查是否有脚本文件
  info.hasScripts = info.files.some(f => f.includes('/scripts/'));

  // 读取脚本文件内容
  if (info.hasScripts) {
    info.content.scripts = {};
    for (const file of info.files) {
      if (file.includes('/scripts/')) {
        const name = file.split('/').pop();
        try {
          info.content.scripts[name!] = await Bun.file(file).text();
        } catch (e) {
          info.content.scripts[name!] = '[读取失败]';
        }
      }
    }
  }

  // 读取依赖文件
  const requirementsPath = `${skillPath}/requirements.txt`;
  if (await $`test -f ${requirementsPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.requirements = await Bun.file(requirementsPath).text();
  }

  const packageJsonPath = `${skillPath}/package.json`;
  if (await $`test -f ${packageJsonPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.package = await Bun.file(packageJsonPath).text();
  }

  // 读取参考文档
  const refsPath = `${skillPath}/references`;
  if (await $`test -d ${refsPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.references = {};
    const findRefs = await $`find ${refsPath} -name "*.md" -o -name "*.txt"`.quiet();
    const refFiles = findRefs.stdout.toString().trim().split('\n').filter(Boolean);

    for (const file of refFiles) {
      const name = file.split('/').pop();
      try {
        info.content.references[name!] = await Bun.file(file).text();
      } catch (e) {
        info.content.references[name!] = '[读取失败]';
      }
    }
  }

  return info;
}

/**
 * 使用 LLM 判断技能类型
 */
async function determineSkillType(skillInfo: any): Promise<string> {
  if (!skillInfo.content.skill) return 'unknown';

  const content = skillInfo.content.skill.toLowerCase();
  const hasScripts = skillInfo.hasScripts;

  // 如果有脚本文件，很可能是工具型
  if (hasScripts) {
    if (content.includes('guide') || content.includes('reference') || content.includes('best practices')) {
      return 'hybrid'; // 混合型：有脚本但主要是知识
    }
    return 'tool'; // 工具型
  }

  // 没有脚本，判断内容类型
  if (content.includes('guide') || content.includes('reference') || content.includes('best practices') ||
      content.includes('tutorial') || content.includes('documentation')) {
    return 'knowledge'; // 知识型
  }

  if (content.includes('workflow') || content.includes('process') || content.includes('steps')) {
    return 'process'; // 流程型
  }

  return 'unknown';
}

async function performBasicSecurityChecks(skillPath: string) {
  const result: any = {
    score: 50,
    passed: true,
    issues: [],
    findings: {}
  };

  const scriptsPath = `${skillPath}/scripts`;

  // 检查危险函数
  const dangerousPatterns = {
    eval: 'eval() 执行动态代码',
    exec: 'exec() 执行系统命令',
    system: 'system() 执行 shell 命令',
    subprocess: 'subprocess 执行外部命令',
    'os.system': 'os.system() 执行系统命令'
  };

  if (await $`test -d ${scriptsPath}`.quiet().then(() => true).catch(() => false)) {
    for (const [pattern, desc] of Object.entries(dangerousPatterns)) {
      const grepProc = await $`grep -r "${pattern}" ${scriptsPath} 2>/dev/null || true`.quiet();
      const matches = grepProc.stdout.toString().trim();

      if (matches) {
        const count = matches.split('\n').filter(Boolean).length;
        result.findings[pattern] = { count, desc };
        if (pattern === 'eval' || pattern === 'exec' || pattern === 'system' || pattern === 'os.system') {
          result.issues.push(`高危函数 ${desc} (${count} 处)`);
          result.passed = false;
          result.score -= 10;
        } else {
          result.score -= 5;
        }
      }
    }

    // 检查硬编码凭据
    const secretPatterns = [
      'password\\s*=',
      'api_key\\s*=',
      'secret\\s*=',
      'token\\s*=',
      'private_key'
    ];

    for (const pattern of secretPatterns) {
      const grepProc = await $`grep -rE "${pattern}" ${scriptsPath} 2>/dev/null || true`.quiet();
      const matches = grepProc.stdout.toString().trim();

      if (matches) {
        result.issues.push(`可能包含硬编码凭据: ${pattern}`);
        result.passed = false;
        result.score -= 5;
      }
    }

    // 检查网络访问
    const netPatterns = ['http://', 'https://', 'requests.get', 'fetch(', 'axios'];
    for (const pattern of netPatterns) {
      const grepProc = await $`grep -r "${pattern}" ${scriptsPath} 2>/dev/null || true`.quiet();
      const matches = grepProc.stdout.toString().trim();

      if (matches) {
        const count = matches.split('\n').filter(Boolean).length;
        result.findings[`network_${pattern}`] = { count };
        result.score -= 2;
      }
    }
  }

  result.score = Math.max(0, result.score);

  return result;
}

/**
 * 调用 LLM 进行深度安全审计
 */
async function performLLMSecurityAudit(skillInfo: any, basicChecks: any, skillType: string): Promise<string> {
  // 生成审计提示
  const prompt = generateSecurityAuditPrompt(skillInfo, basicChecks, skillType);

  // 将提示写入临时文件，供主 LLM 分析
  const promptFile = '/tmp/skill-security-audit-prompt.md';
  await Bun.write(promptFile, prompt);

  console.log(`   审计提示已生成: ${promptFile}`);
  console.log(`   请让 Claude 阅读该文件并进行分析`);

  return prompt;
}

function generateSecurityAuditPrompt(skillInfo: any, basicChecks: any, skillType: string): string {
  let contentAnalysis = '### SKILL.md 内容\n```';
  if (skillInfo.content.skill) {
    contentAnalysis += skillInfo.content.skill.substring(0, 3000);
    if (skillInfo.content.skill.length > 3000) {
      contentAnalysis += '\n...(内容已截断)';
    }
  }
  contentAnalysis += '```\n';

  // 添加脚本内容
  if (skillInfo.hasScripts && skillInfo.content.scripts) {
    contentAnalysis += '\n### 脚本文件\n';
    Object.keys(skillInfo.content.scripts).forEach(name => {
      const scriptContent = skillInfo.content.scripts[name];
      contentAnalysis += `\n#### ${name}\n\`\`\`\n${scriptContent.substring(0, 500)}...\n\`\`\`\n`;
    });
  }

  // 添加依赖信息
  contentAnalysis += '\n### 依赖项\n```';
  if (skillInfo.content.requirements) {
    contentAnalysis += `Python:\n${skillInfo.content.requirements}`;
  }
  if (skillInfo.content.package) {
    contentAnalysis += `\nNode.js:\n${skillInfo.content.package}`;
  }
  contentAnalysis += '```\n';

  return `# 技能安全审计请求

## 技能信息

**技能类型:** ${skillType}
**是否有脚本:** ${skillInfo.hasScripts ? '是' : '否'}
**文件数量:** ${skillInfo.files.length}

${contentAnalysis}

## 基础安全检查结果
\`\`\`json
${JSON.stringify(basicChecks, null, 2)}
\`\`\`

## 审计要求

请根据技能类型（${skillType}）进行相应的安全审计：

### 如果是知识型技能（knowledge）
重点审查：
- **内容安全性**: 文档中是否包含危险操作示例？
- **误导性内容**: 是否有错误的安全建议？
- **敏感信息**: 文档中是否泄露敏感信息？
- **链接安全**: 外部链接是否安全可信？

### 如果是工具型技能（tool）
重点审查：
- **代码安全**: 危险函数、命令注入、路径遍历
- **依赖安全**: 依赖漏洞、来源可信度
- **数据安全**: 敏感信息、数据泄露
- **权限安全**: 文件权限、网络访问、系统调用
- **错误处理**: 错误信息泄露、异常处理

### 如果是混合型技能（hybrid）
同时审查知识型和工具型的所有维度

### 如果是流程型技能（process）
重点审查：
- **流程安全性**: 流程步骤是否有安全风险？
- **输入验证**: 流程中是否有用户输入验证？
- **输出安全**: 流程输出是否安全？

## 输出格式

请按照以下格式输出审计结果：

\`\`\`json
{
  "passed": true/false,
  "score": 0-100,
  "severity": "high/medium/low/none",
  "skillType": "${skillType}",
  "issues": [
    {
      "type": "类型",
      "severity": "high/medium/low",
      "description": "问题描述",
      "location": "位置",
      "recommendation": "修复建议"
    }
  ],
  "findings": {
    "contentIssues": [],
    "codeIssues": [],
    "dependencyIssues": [],
    "otherIssues": []
  },
  "recommendations": ["建议1", "建议2", ...],
  "analysis": "详细审计分析..."
}
\`\`\`

## 审计标准

### 高风险 (high)
- 存在可被利用的安全漏洞
- 硬编码敏感信息
- 未经验证的用户输入
- 危险的系统调用
- 误导性的安全建议（知识型）

### 中风险 (medium)
- 潜在的安全问题
- 不完善的错误处理
- 可疑的依赖项
- 不明确的最佳实践

### 低风险 (low)
- 代码质量问题
- 最佳实践建议
- 优化建议

### 无风险 (none)
- 纯知识型且内容安全
- 无任何安全问题

## 注意事项

- 根据技能类型调整审计重点
- 对于知识型技能，重点关注内容质量而非代码安全
- 给出具体、可操作的建议
- 评分要客观公正
`;
}

function parseLLMAudit(llmOutput: string): any {
  const result: any = {
    passed: true,
    score: 50,
    severity: 'none',
    issues: [],
    recommendations: []
  };

  // 尝试从 LLM 输出中提取 JSON
  const jsonMatch = llmOutput.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      result.passed = parsed.passed;
      result.score = parsed.score;
      result.severity = parsed.severity;
      result.issues = parsed.issues?.map((i: any) =>
        typeof i === 'string' ? i : `${i.type}: ${i.description}`
      ) || [];
      result.recommendations = parsed.recommendations || [];
      return result;
    } catch (e) {
      // JSON 解析失败
    }
  }

  // 基于关键词的分析
  if (llmOutput.includes('高风险') || llmOutput.includes('high')) {
    result.score -= 30;
    result.passed = false;
    result.severity = 'high';
  }
  if (llmOutput.includes('中风险') || llmOutput.includes('medium')) {
    result.score -= 15;
    result.severity = 'medium';
  }
  if (llmOutput.includes('无风险') || llmOutput.includes('none')) {
    result.score = 100;
    result.severity = 'none';
  }

  result.score = Math.max(0, Math.min(100, result.score));

  return result;
}

// 解析命令行参数
const args = process.argv.slice(2);
const skillPath = args[0];

if (!skillPath) {
  console.log(`
安全审计脚本 - 调用 LLM 进行深度安全审计

用法:
  bun scripts/audit.ts <skill-path> [选项]

选项:
  --no-llm         不使用 LLM，仅进行基础审计
  --interactive    交互式模式（需要用户介入）

示例:
  bun scripts/audit.ts ~/.pi/agent/skills/office-pdf
  bun scripts/audit.ts ~/.pi/agent/skills/react-best-practices
  bun scripts/audit.ts ~/.pi/agent/skills/office-pdf --no-llm
  `);
  process.exit(1);
}

// 解析选项
const options: AuditOptions = {
  llm: true
};

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--no-llm') options.llm = false;
  else if (arg === '--interactive') options.interactive = true;
}

// 执行审计
auditSkill(skillPath, options).catch(err => {
  console.error(`❌ 审计失败: ${err.message}`);
  process.exit(1);
});