#!/usr/bin/env bun

/**
 * 报告生成脚本 - 使用 LLM 生成智能化的技能评估报告
 */

import { $ } from 'bun';

const REPORTS_DIR = `${process.env.HOME}/.pi/agent/skills/skill-management/reports`;

interface ReportOptions {
  llm?: boolean;
  detailed?: boolean;
}

async function generateReport(skillName: string, options: ReportOptions = {}) {
  const skillPath = `${process.env.HOME}/.pi/agent/skills/${skillName}`;
  const reportPath = `${REPORTS_DIR}/${skillName}.md`;

  console.log(`\n📄 生成报告: ${skillName}`);
  console.log('━'.repeat(60));

  // 收集技能信息
  const skillInfo = await collectSkillInfo(skillPath);

  // 判断技能类型
  const skillType = await determineSkillType(skillInfo);
  console.log(`   技能类型: ${skillType}`);

  // 使用 LLM 生成报告
  if (options.llm !== false) {
    console.log(`\n🤖 调用 LLM 生成智能化报告...`);
    const llmReport = await generateLLMReport(skillInfo, skillType);

    // 写入报告
    await Bun.write(reportPath, llmReport);
    console.log(`   ✅ 报告已生成: ${reportPath}`);

    // 显示摘要
    showReportSummary(llmReport);
  } else {
    // 基础报告
    const basicReport = generateBasicReport(skillInfo, skillType);
    await Bun.write(reportPath, basicReport);
    console.log(`   ✅ 报告已生成: ${reportPath}`);
  }

  return { success: true, reportPath };
}

async function collectSkillInfo(skillPath: string) {
  const info: any = {
    path: skillPath,
    files: [],
    structure: {},
    content: {},
    stats: {}
  };

  // 读取 SKILL.md
  const skillFile = `${skillPath}/SKILL.md`;
  if (await $`test -f ${skillFile}`.quiet().then(() => true).catch(() => false)) {
    info.content.skill = await Bun.file(skillFile).text();

    // 提取 YAML 前言
    const yamlMatch = info.content.skill.match(/^---\n(.*?)\n---/s);
    if (yamlMatch) {
      info.content.yaml = yamlMatch[1];
      const nameMatch = yamlMatch[1].match(/name:\s*(.+)/);
      const descMatch = yamlMatch[1].match(/description:\s*(.+)/);
      const authorMatch = yamlMatch[1].match(/author:\s*(.+)/);
      const versionMatch = yamlMatch[1].match(/version:\s*(.+)/);
      const tagsMatch = yamlMatch[1].match(/tags:\s*\[(.+)\]/);

      info.name = nameMatch ? nameMatch[1].trim() : skillPath.split('/').pop();
      info.description = descMatch ? descMatch[1].trim() : '';
      info.author = authorMatch ? authorMatch[1].trim() : 'Unknown';
      info.version = versionMatch ? versionMatch[1].trim() : 'N/A';
      info.tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];
    }
  }

  // 统计信息
  const findProc = await $`find ${skillPath} -type f`.quiet();
  info.files = findProc.stdout.toString().trim().split('\n').filter(Boolean);
  info.stats.fileCount = info.files.length;

  // 目录结构
  const dirs = ['scripts', 'references', 'assets'];
  for (const dir of dirs) {
    const exists = await $`test -d ${skillPath}/${dir}`.quiet().then(() => true).catch(() => false);
    info.structure[dir] = { exists };
    if (exists) {
      const countProc = await $`find ${skillPath}/${dir} -type f | wc -l`.quiet();
      info.structure[dir].count = parseInt(countProc.stdout.toString().trim());
    }
  }

  // 依赖项
  const requirementsPath = `${skillPath}/requirements.txt`;
  if (await $`test -f ${requirementsPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.requirements = await Bun.file(requirementsPath).text();
    info.stats.pythonDeps = info.content.requirements.trim().split('\n').filter(Boolean).length;
  }

  const packageJsonPath = `${skillPath}/package.json`;
  if (await $`test -f ${packageJsonPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.package = await Bun.file(packageJsonPath).text();
    try {
      const pkg = JSON.parse(info.content.package);
      info.stats.nodeDeps = Object.keys(pkg.dependencies || {}).length;
      info.stats.devDeps = Object.keys(pkg.devDependencies || {}).length;
    } catch (e) {
      info.stats.nodeDeps = 0;
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
  const hasScripts = skillInfo.structure.scripts?.exists;

  if (hasScripts) {
    if (content.includes('guide') || content.includes('reference') || content.includes('best practices')) {
      return 'hybrid';
    }
    return 'tool';
  }

  if (content.includes('guide') || content.includes('reference') || content.includes('best practices') ||
      content.includes('tutorial') || content.includes('documentation')) {
    return 'knowledge';
  }

  if (content.includes('workflow') || content.includes('process') || content.includes('steps')) {
    return 'process';
  }

  return 'unknown';
}

/**
 * 调用 LLM 生成智能报告
 */
async function generateLLMReport(skillInfo: any, skillType: string): Promise<string> {
  // 生成报告提示
  const prompt = generateReportPrompt(skillInfo, skillType);

  // 将提示写入临时文件
  const promptFile = '/tmp/skill-report-prompt.md';
  await Bun.write(promptFile, prompt);

  console.log(`   报告提示已生成: ${promptFile}`);
  console.log(`   请让 Claude 阅读该文件并生成报告`);

  // 返回一个占位报告，实际的报告由 LLM 生成
  return `# ${skillInfo.name || '技能'} 评估报告

**生成时间:** ${new Date().toLocaleString('zh-CN')}
**技能类型:** ${skillType}
**作者:** ${skillInfo.author || 'Unknown'}
**版本:** ${skillInfo.version || 'N/A'}

---

## 🤖 LLM 智能分析

请阅读报告提示文件并生成详细分析:

\`\`\`bash
read /tmp/skill-report-prompt.md
\`\`\`

然后根据提示生成完整的评估报告。

---

## 📊 基础信息

- **文件数量:** ${skillInfo.stats.fileCount}
- **脚本文件:** ${skillInfo.structure.scripts?.exists ? `✅ (${skillInfo.structure.scripts.count} 个)` : '❌'}
- **参考资料:** ${skillInfo.structure.references?.exists ? `✅ (${skillInfo.structure.references.count} 个)` : '❌'}
- **资源文件:** ${skillInfo.structure.assets?.exists ? `✅ (${skillInfo.structure.assets.count} 个)` : '❌'}
- **Python 依赖:** ${skillInfo.stats.pythonDeps || 0}
- **Node.js 依赖:** ${skillInfo.stats.nodeDeps || 0}

---

## 📚 技能描述

${skillInfo.description || '无描述'}

---

## 🏷️ 标签

${skillInfo.tags?.length ? skillInfo.tags.map(t => `\`${t}\``).join(', ') : '无'}

---

## 📄 完整报告生成中...

请让 Claude 阅读 \`/tmp/skill-report-prompt.md\` 并生成完整的评估报告。
`;
}

function generateReportPrompt(skillInfo: any, skillType: string): string {
  return `# 技能评估报告生成请求

请为以下技能生成一份详细的评估报告。

## 技能信息

**名称:** ${skillInfo.name || 'Unknown'}
**类型:** ${skillType}
**作者:** ${skillInfo.author || 'Unknown'}
**版本:** ${skillInfo.version || 'N/A'}
**描述:** ${skillInfo.description || '无'}

**标签:** ${skillInfo.tags?.join(', ') || '无'}

**统计信息:**
- 文件数量: ${skillInfo.stats.fileCount}
- 脚本文件: ${skillInfo.structure.scripts?.exists ? `${skillInfo.structure.scripts.count} 个` : '无'}
- 参考资料: ${skillInfo.structure.references?.exists ? `${skillInfo.structure.references.count} 个` : '无'}
- 资源文件: ${skillInfo.structure.assets?.exists ? `${skillInfo.structure.assets.count} 个` : '无'}
- Python 依赖: ${skillInfo.stats.pythonDeps || 0}
- Node.js 依赖: ${skillInfo.stats.nodeDeps || 0}

## SKILL.md 内容

\`\`\`
${skillInfo.content.skill || '无 SKILL.md 文件'}
\`\`\`

## 报告要求

请生成一份完整的评估报告，包含以下部分：

### 1. 执行摘要
- 技能类型和特点
- 综合评分（0-100）
- 主要优缺点
- 推荐使用场景

### 2. 技能类型分析
根据技能类型（${skillType}）进行分析：

**如果是知识型技能（knowledge）:**
- 内容质量和完整性
- 组织结构和可读性
- 实用性和应用价值
- 文档深度和广度

**如果是工具型技能（tool）:**
- 功能完整性和实用性
- 代码质量和可维护性
- 依赖项合理性
- 安全性和稳定性

**如果是混合型技能（hybrid）:**
- 同时分析知识部分和工具部分
- 评估两者的协调性

**如果是流程型技能（process）:**
- 流程清晰度和可操作性
- 步骤完整性和逻辑性
- 适用场景和灵活性

### 3. 详细评估

#### 3.1 内容质量
- SKILL.md 格式规范性
- 描述清晰度和完整性
- 文档结构和组织

#### 3.2 功能分析
- 核心功能是什么
- 功能覆盖度
- 与同类技能的对比

#### 3.3 使用体验
- 易用性
- 学习曲线
- 文档完整性

#### 3.4 技术评估
- 依赖项合理性
- 代码质量（如果适用）
- 安全性（如果适用）

### 4. 评分明细

根据技能类型给出评分：

| 维度 | 权重 | 得分 | 说明 |
|------|------|------|------|
| 内容质量 | ${skillType === 'knowledge' ? '40%' : '20%'} | 0-100 | |
| 功能完整性 | ${skillType === 'tool' ? '40%' : '20%'} | 0-100 | |
| 实用性 | 20% | 0-100 | |
| 文档质量 | 10% | 0-100 | |
| 代码质量 | ${skillType === 'tool' ? '10%' : '5%'} | 0-100 | |
| 安全性 | ${skillType === 'tool' ? '10%' : '5%'} | 0-100 | |
| **综合评分** | **100%** | **0-100** | |

### 5. 优势
列出 3-5 个主要优势

### 6. 不足
列出 3-5 个主要不足

### 7. 改进建议
给出 3-5 个具体的改进建议

### 8. 使用场景
列出适合的使用场景

### 9. 对比分析
与同类技能的对比（如果了解）

### 10. 总结
- 是否推荐使用
- 适用人群
- 注意事项

## 输出格式

请使用 Markdown 格式输出完整的报告，包含：
- 清晰的标题结构
- 表格展示评分
- 代码示例（如果适用）
- emoji 图标增强可读性

## 注意事项

- 根据技能类型调整评估重点
- 评分要客观公正
- 给出具体、可操作的建议
- 报告要易于阅读和理解
`;
}

function generateBasicReport(skillInfo: any, skillType: string): string {
  return `# ${skillInfo.name || '技能'} 评估报告

**生成时间:** ${new Date().toLocaleString('zh-CN')}
**技能类型:** ${skillType}

---

## 基础信息

- **名称:** ${skillInfo.name || 'Unknown'}
- **描述:** ${skillInfo.description || '无'}
- **作者:** ${skillInfo.author || 'Unknown'}
- **版本:** ${skillInfo.version || 'N/A'}
- **文件数量:** ${skillInfo.stats.fileCount}

## 目录结构

| 目录 | 状态 |
|------|------|
| scripts/ | ${skillInfo.structure.scripts?.exists ? '✅' : '❌'} |
| references/ | ${skillInfo.structure.references?.exists ? '✅' : '❌'} |
| assets/ | ${skillInfo.structure.assets?.exists ? '✅' : '❌'} |

## 依赖项

- Python: ${skillInfo.stats.pythonDeps || 0}
- Node.js: ${skillInfo.stats.nodeDeps || 0}

---

*这是基础报告，请使用 --llm 选项生成完整的智能化报告。*
`;
}

function showReportSummary(report: string) {
  // 提取关键信息并显示摘要
  const lines = report.split('\n');
  console.log(`\n📋 报告摘要:`);

  for (const line of lines) {
    if (line.includes('技能类型:') || line.includes('综合评分:') ||
        line.includes('作者:') || line.includes('版本:')) {
      console.log(`   ${line.trim()}`);
    }
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const skillName = args[0];

if (!skillName) {
  console.log(`
报告生成脚本 - 使用 LLM 生成智能化的技能评估报告

用法:
  bun scripts/report.ts <skill-name> [选项]

参数:
  skill-name    技能名称（必需）

选项:
  --no-llm      不使用 LLM，生成基础报告
  --detailed    生成详细报告

示例:
  bun scripts/report.ts react-best-practices
  bun scripts/report.ts office-pdf --detailed
  bun scripts/report.ts office-docx --no-llm
  `);
  process.exit(1);
}

// 解析选项
const options: ReportOptions = {
  llm: true
};

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--no-llm') options.llm = false;
  else if (arg === '--detailed') options.detailed = true;
}

// 执行报告生成
generateReport(skillName, options).catch(err => {
  console.error(`❌ 报告生成失败: ${err.message}`);
  process.exit(1);
});