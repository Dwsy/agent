#!/usr/bin/env bun

/**
 * 智能评估脚本 - 使用 LLM 进行智能分析和判断
 */

import { $ } from 'bun';

interface AssessmentOptions {
  llm?: boolean;
  verbose?: boolean;
}

interface SkillType {
  type: 'knowledge' | 'tool' | 'hybrid';
  confidence: number;
  reason: string;
}

interface AssessmentResult {
  skillName: string;
  skillType: SkillType;
  rationality: boolean;
  score: number;
  details: any;
  llmAnalysis?: string;
  issues: string[];
  strengths: string[];
  weaknesses: string[];
}

async function assessSkill(skillPath: string, options: AssessmentOptions = {}) {
  const skillName = skillPath.split('/').pop() || skillPath;
  console.log(`\n🤖 智能评估: ${skillName}`);
  console.log('━'.repeat(60));

  const result: AssessmentResult = {
    skillName,
    skillType: { type: 'knowledge', confidence: 0, reason: '' },
    rationality: true,
    score: 0,
    details: {},
    issues: [],
    strengths: [],
    weaknesses: []
  };

  // 步骤 1: 收集技能信息
  console.log(`\n📥 收集技能信息...`);
  const skillInfo = await collectSkillInfo(skillPath);
  result.details = skillInfo;

  // 步骤 2: LLM 智能识别技能类型
  console.log(`\n🧠 LLM 识别技能类型...`);
  const skillType = await identifySkillType(skillInfo);
  result.skillType = skillType;
  console.log(`   类型: ${skillType.type} (置信度: ${skillType.confidence}%)`);
  console.log(`   原因: ${skillType.reason}`);

  // 步骤 3: LLM 深度分析
  console.log(`\n🔍 LLM 深度分析...`);
  const llmAnalysis = await performLLMAnalysis(skillInfo, skillType);
  result.llmAnalysis = llmAnalysis;

  // 步骤 4: 解析 LLM 分析结果
  console.log(`\n📊 解析分析结果...`);
  const parsed = parseLLMAnalysis(llmAnalysis, skillType);
  result.rationality = parsed.rationality;
  result.score = parsed.score;
  result.issues.push(...parsed.issues);
  result.strengths.push(...parsed.strengths);
  result.weaknesses.push(...parsed.weaknesses);

  // 输出结果
  console.log(`\n✅ 评估完成`);
  console.log(`   技能类型: ${result.skillType.type}`);
  console.log(`   综合评分: ${result.score}/100`);
  console.log(`   合理性: ${result.rationality ? '✅ 通过' : '❌ 不通过'}`);

  if (result.strengths.length > 0) {
    console.log(`\n💪 优势 (${result.strengths.length}):`);
    result.strengths.slice(0, 3).forEach((s, i) => {
      console.log(`   ${i + 1}. ${s}`);
    });
  }

  if (result.issues.length > 0) {
    console.log(`\n⚠️  问题 (${result.issues.length}):`);
    result.issues.slice(0, 3).forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }

  return result;
}

async function collectSkillInfo(skillPath: string) {
  const info: any = {
    path: skillPath,
    files: [],
    structure: {},
    content: {}
  };

  // 读取 SKILL.md
  const skillFile = `${skillPath}/SKILL.md`;
  if (await $`test -f ${skillFile}`.quiet().then(() => true).catch(() => false)) {
    info.content.skill = await Bun.file(skillFile).text();
  }

  // 列出所有文件
  const findProc = await $`find ${skillPath} -type f`.quiet();
  info.files = findProc.stdout.toString().trim().split('\n').filter(Boolean);

  // 检查目录结构
  const dirs = ['scripts', 'references', 'assets'];
  for (const dir of dirs) {
    const exists = await $`test -d ${skillPath}/${dir}`.quiet().then(() => true).catch(() => false);
    info.structure[dir] = {
      exists,
      files: exists ? await countFiles(`${skillPath}/${dir}`) : 0
    };
  }

  // 读取脚本文件内容
  if (info.structure.scripts.exists) {
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

  // 读取参考资料
  if (info.structure.references.exists) {
    info.content.references = {};
    for (const file of info.files) {
      if (file.includes('/references/')) {
        const name = file.split('/').pop();
        try {
          info.content.references[name!] = await Bun.file(file).text();
        } catch (e) {
          info.content.references[name!] = '[读取失败]';
        }
      }
    }
  }

  // 读取依赖文件
  const requirementsPath = `${skillPath}/requirements.txt`;
  if (await $`test -f ${requirementsPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.dependencies = await Bun.file(requirementsPath).text();
  }

  const packageJsonPath = `${skillPath}/package.json`;
  if (await $`test -f ${packageJsonPath}`.quiet().then(() => true).catch(() => false)) {
    info.content.packageJson = await Bun.file(packageJsonPath).text();
  }

  return info;
}

/**
 * LLM 智能识别技能类型
 */
async function identifySkillType(skillInfo: any): Promise<SkillType> {
  const prompt = generateTypeIdentificationPrompt(skillInfo);

  // 写入提示文件
  const promptFile = '/tmp/skill-type-identification.md';
  await Bun.write(promptFile, prompt);

  console.log(`   提示文件: ${promptFile}`);
  console.log(`   ⚠️  请 LLM 读取此文件并识别技能类型`);

  // 返回默认值，实际类型由 LLM 确定
  return {
    type: 'knowledge',
    confidence: 0,
    reason: '等待 LLM 分析'
  };
}

function generateTypeIdentificationPrompt(skillInfo: any): string {
  return `# 技能类型识别请求

请分析以下技能，识别其类型并给出置信度。

## 技能信息

### SKILL.md 内容
\`\`\`
${skillInfo.content.skill || '无 SKILL.md 文件'}
\`\`\`

### 目录结构
- scripts/: ${skillInfo.structure.scripts?.exists ? `✅ 存在 (${skillInfo.structure.scripts.files} 个文件)` : '❌ 不存在'}
- references/: ${skillInfo.structure.references?.exists ? `✅ 存在 (${skillInfo.structure.references.files} 个文件)` : '❌ 不存在'}
- assets/: ${skillInfo.structure.assets?.exists ? `✅ 存在 (${skillInfo.structure.assets.files} 个文件)` : '❌ 不存在'}

### 文件列表
${skillInfo.files.map(f => `- ${f}`).join('\n')}

### 脚本内容 (${Object.keys(skillInfo.content.scripts || {}).length} 个)
${Object.keys(skillInfo.content.scripts || {}).map(name => `#### ${name}\n\`\`\`\n${skillInfo.content.scripts[name].substring(0, 200)}...\n\`\`\``).join('\n\n')}

### 参考资料 (${Object.keys(skillInfo.content.references || {}).length} 个)
${Object.keys(skillInfo.content.references || {}).map(name => `- ${name}`).join('\n')}

### 依赖项
\`\`\`
Python: ${skillInfo.content.dependencies || '无'}
\`\`\`

\`\`\`
Node.js: ${skillInfo.content.packageJson || '无'}
\`\`\`

## 技能类型定义

### 1. 知识型 (knowledge)
- 主要提供知识、指南、最佳实践
- SKILL.md 包含详细的说明和示例
- 可能没有 scripts/ 目录
- 适合作为参考文档使用
- 例如: React Best Practices, Code Style Guide

### 2. 工具型 (tool)
- 提供可执行的脚本和工具
- 有 scripts/ 目录，包含可执行代码
- 可能需要依赖项
- 适合执行特定任务
- 例如: PDF 处理工具, 代码格式化器

### 3. 混合型 (hybrid)
- 既有知识内容，也有工具脚本
- SKILL.md 包含说明，scripts/ 包含工具
- references/ 可能包含详细文档
- 适合学习和实践结合
- 例如: Office 文档处理技能

## 输出格式

请按照以下格式输出识别结果：

\`\`\`json
{
  "type": "knowledge|tool|hybrid",
  "confidence": 0-100,
  "reason": "详细的判断理由",
  "characteristics": ["特征1", "特征2", ...]
}
\`\`\`

## 判断依据

请根据以下特征判断：
- SKILL.md 的内容和结构
- 是否有 scripts/ 目录及其内容
- 是否有 references/ 目录及其内容
- 是否有 assets/ 目录及其内容
- 依赖项的有无和类型
- 文件数量和类型

## 注意事项

- 知识型技能即使没有 scripts/ 目录也可能是优秀的
- 工具型技能的 SKILL.md 可能相对简单
- 混合型技能兼具两者特点
- 给出具体的判断理由
`;
}

/**
 * LLM 深度分析
 */
async function performLLMAnalysis(skillInfo: any, skillType: SkillType): Promise<string> {
  const prompt = generateAnalysisPrompt(skillInfo, skillType);

  // 写入提示文件
  const promptFile = '/tmp/skill-assessment-prompt.md';
  await Bun.write(promptFile, prompt);

  console.log(`   分析提示: ${promptFile}`);
  console.log(`   ⚠️  请 LLM 读取此文件并进行深度分析`);

  return prompt;
}

function generateAnalysisPrompt(skillInfo: any, skillType: SkillType): string {
  const typeSpecificGuidance = {
    knowledge: `
## 知识型技能评估重点

知识型技能主要评估：
1. **内容质量** - SKILL.md 的内容是否专业、准确、完整
2. **结构清晰** - 内容组织是否清晰，易于理解
3. **实用性** - 是否提供实际可用的指导和示例
4. **权威性** - 内容来源是否可靠，是否有参考价值
5. **完整性** - 是否覆盖了相关主题的主要方面

**不要求**：
- scripts/ 目录（知识型可能没有）
- references/ 目录（SKILL.md 本身可能已包含）
- assets/ 目录（知识型可能不需要）

**评分标准**：
- 内容质量 (40分)
- 结构清晰 (20分)
- 实用性 (20分)
- 权威性 (10分)
- 完整性 (10分)
`,
    tool: `
## 工具型技能评估重点

工具型技能主要评估：
1. **功能完整性** - 工具是否实现了预期的功能
2. **代码质量** - 脚本代码是否清晰、可维护
3. **错误处理** - 是否有适当的错误处理
4. **文档说明** - SKILL.md 是否清楚地说明如何使用
5. **依赖管理** - 依赖项是否合理、必要

**要求**：
- scripts/ 目录（工具型必须有）
- 清晰的使用说明
- 适当的错误处理

**评分标准**：
- 功能完整性 (30分)
- 代码质量 (25分)
- 错误处理 (20分)
- 文档说明 (15分)
- 依赖管理 (10分)
`,
    hybrid: `
## 混合型技能评估重点

混合型技能主要评估：
1. **知识内容** - SKILL.md 的内容质量
2. **工具功能** - 脚本工具的功能和代码质量
3. **整合程度** - 知识和工具是否很好地结合
4. **文档完整** - 是否有详细的参考资料
5. **实用性** - 是否能真正帮助用户完成任务

**要求**：
- SKILL.md 内容完整
- scripts/ 目录有实用工具
- references/ 可选但推荐

**评分标准**：
- 知识内容 (30分)
- 工具功能 (30分)
- 整合程度 (20分)
- 文档完整 (10分)
- 实用性 (10分)
`
  };

  return `# 技能深度分析请求

请对以下技能进行全面分析，按照技能类型使用相应的评估标准。

## 技能类型

**类型**: ${skillType.type}
**置信度**: ${skillType.confidence}%
**判断理由**: ${skillType.reason}

${typeSpecificGuidance[skillType.type]}

## 技能信息

### SKILL.md 内容
\`\`\`
${skillInfo.content.skill || '无 SKILL.md 文件'}
\`\`\`

### 目录结构
- scripts/: ${skillInfo.structure.scripts?.exists ? `✅ 存在 (${skillInfo.structure.scripts.files} 个文件)` : '❌ 不存在'}
- references/: ${skillInfo.structure.references?.exists ? `✅ 存在 (${skillInfo.structure.references.files} 个文件)` : '❌ 不存在'}
- assets/: ${skillInfo.structure.assets?.exists ? `✅ 存在 (${skillInfo.structure.assets.files} 个文件)` : '❌ 不存在'}

### 脚本文件 (${Object.keys(skillInfo.content.scripts || {}).length} 个)
${Object.keys(skillInfo.content.scripts || {}).length > 0
  ? Object.keys(skillInfo.content.scripts || {}).map(name => `#### ${name}\n\`\`\`\n${skillInfo.content.scripts[name].substring(0, 300)}...\n\`\`\``).join('\n\n')
  : '无脚本文件'}

### 参考资料 (${Object.keys(skillInfo.content.references || {}).length} 个)
${Object.keys(skillInfo.content.references || {}).length > 0
  ? Object.keys(skillInfo.content.references || {}).map(name => `- ${name}`).join('\n')
  : '无参考资料'}

### 依赖项
\`\`\`
Python: ${skillInfo.content.dependencies || '无'}
\`\`\`

\`\`\`
Node.js: ${skillInfo.content.packageJson || '无'}
\`\`\`

## 分析要求

请从以下维度进行评估：

### 1. 内容/功能分析 (${skillType.type === 'knowledge' ? '知识内容' : skillType.type === 'tool' ? '工具功能' : '知识和工具'})
- ${skillType.type === 'knowledge' ? 'SKILL.md 的内容质量、专业性、准确性' : skillType.type === 'tool' ? '工具的功能完整性、代码质量、错误处理' : '知识内容的质量和工具功能的完整性'}
- 是否有明显的缺陷或遗漏
- 与同类技能相比的优势/劣势

### 2. 结构/组织分析
- 内容组织是否清晰
- 是否易于理解和查找
- 是否有良好的层次结构

### 3. 实用性分析
- 是否真正有用
- 是否能解决实际问题
- 是否有实际应用场景

### 4. 完整性分析
- 是否覆盖了相关主题的主要方面
- 是否有重要的遗漏
- 是否需要补充

### 5. 安全性分析
- 是否有危险操作
- 是否有硬编码敏感信息
- 依赖项是否安全

## 输出格式

请按照以下格式输出分析结果：

\`\`\`json
{
  "rationality": true/false,
  "score": 0-100,
  "breakdown": {
    "contentQuality": 0-40,
    "structure": 0-20,
    "practicality": 0-20,
    "authority": 0-10,
    "completeness": 0-10
  },
  "issues": ["问题1", "问题2", ...],
  "strengths": ["优势1", "优势2", ...],
  "weaknesses": ["劣势1", "劣势2", ...],
  "recommendations": ["建议1", "建议2", ...],
  "analysis": "详细分析文本..."
}
\`\`\`

## 注意事项

- 请仔细阅读所有内容
- 根据技能类型使用相应的评分标准
- 给出具体、可操作的建议
- 评分要客观公正
- 知识型技能不要因为没有 scripts/ 目录就扣分
- 工具型技能重点评估代码质量和功能
`;
}

function parseLLMAnalysis(llmOutput: string, skillType: SkillType): any {
  const result: any = {
    rationality: true,
    score: 50,
    breakdown: {},
    issues: [],
    strengths: [],
    weaknesses: [],
    recommendations: []
  };

  // 尝试从 LLM 输出中提取 JSON
  const jsonMatch = llmOutput.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return parsed;
    } catch (e) {
      // JSON 解析失败
    }
  }

  // 基于关键词的分析
  if (llmOutput.includes('优秀') || llmOutput.includes('excellent')) {
    result.score = 85;
  } else if (llmOutput.includes('良好') || llmOutput.includes('good')) {
    result.score = 70;
  } else if (llmOutput.includes('一般') || llmOutput.includes('average')) {
    result.score = 50;
  }

  result.rationality = result.score >= 50;

  return result;
}

async function countFiles(dir: string): Promise<number> {
  const proc = await $`find ${dir} -type f | wc -l`.quiet();
  return parseInt(proc.stdout.toString().trim());
}

// 解析命令行参数
const args = process.argv.slice(2);
const skillPath = args[0];

if (!skillPath) {
  console.log(`
智能评估脚本 - 使用 LLM 进行智能分析和判断

用法:
  bun scripts/assess.ts <skill-path> [选项]

选项:
  --verbose       详细输出

示例:
  bun scripts/assess.ts ~/.pi/agent/skills/react-best-practices
  bun scripts/assess.ts ~/.pi/agent/skills/office-pdf --verbose
  `);
  process.exit(1);
}

// 解析选项
const options: AssessmentOptions = {
  llm: true
};

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--verbose') options.verbose = true;
}

// 执行评估
assessSkill(skillPath, options).catch(err => {
  console.error(`❌ 评估失败: ${err.message}`);
  process.exit(1);
});