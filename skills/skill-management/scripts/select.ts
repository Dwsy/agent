#!/usr/bin/env bun

/**
 * 技能选择脚本 - 使用 interview 工具让用户选择和排序技能
 */

import { $ } from 'bun';

interface SkillOption {
  name: string;
  path: string;
  description: string;
  score?: number;
  stars?: number;
  updated?: string;
}

interface SelectOptions {
  sort?: 'score' | 'stars' | 'updated' | 'name';
  limit?: number;
  requireAnalysis?: boolean;
}

async function selectSkills(skills: SkillOption[], options: SelectOptions = {}) {
  const { sort = 'score', limit = 10, requireAnalysis = true } = options;

  console.log(`\n📋 技能选择`);
  console.log('━'.repeat(60));

  // 排序
  const sortedSkills = sortSkills(skills, sort);

  // 限制数量
  const displaySkills = sortedSkills.slice(0, limit);

  console.log(`\n找到 ${skills.length} 个技能，显示前 ${displaySkills.length} 个`);

  // 如果需要分析，生成分析
  let analyzedSkills = displaySkills;
  if (requireAnalysis) {
    console.log(`\n🤖 正在分析技能...`);
    analyzedSkills = await analyzeSkills(displaySkills);
  }

  // 生成 interview 配置
  const interviewConfig = generateInterviewConfig(analyzedSkills);

  // 写入配置文件
  const configFile = `${process.env.HOME}/.pi/agent/skills/skill-management/.skill-select-config.json`;
  await Bun.write(configFile, JSON.stringify(interviewConfig, null, 2));

  console.log(`\n✅ 技能选择配置已生成: ${configFile}`);
  console.log(`\n💡 请 Pi Agent 使用 interview 工具询问用户:`);
  console.log(`   interview ${configFile}`);

  return { configFile, skills: analyzedSkills };
}

function sortSkills(skills: SkillOption[], sortBy: string): SkillOption[] {
  return [...skills].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.score || 0) - (a.score || 0);
      case 'stars':
        return (b.stars || 0) - (a.stars || 0);
      case 'updated':
        return new Date(b.updated || '').getTime() - new Date(a.updated || '').getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
}

/**
 * 由 Pi Agent 分析技能并生成介绍
 */
async function analyzeSkills(skills: SkillOption[]): Promise<SkillOption[]> {
  const analyzed: SkillOption[] = [];

  for (const skill of skills) {
    // 读取技能信息
    const skillInfo = await readSkillInfo(skill.path);

    // 生成分析提示（供 Pi Agent 分析）
    const analysisPrompt = generateAnalysisPrompt(skill, skillInfo);

    // 保存提示文件
    const promptFile = `/tmp/skill-analysis-${skill.name}.md`;
    await Bun.write(promptFile, analysisPrompt);

    analyzed.push({
      ...skill,
      analysis: analysisPrompt,
      promptFile
    });
  }

  return analyzed;
}

async function readSkillInfo(skillPath: string) {
  const info: any = {};

  // 读取 SKILL.md
  const skillFile = `${skillPath}/SKILL.md`;
  if (await $`test -f ${skillFile}`.quiet().then(() => true).catch(() => false)) {
    info.skill = await Bun.file(skillFile).text();
  }

  // 统计文件
  const findProc = await $`find ${skillPath} -type f | wc -l`.quiet();
  info.fileCount = parseInt(findProc.stdout.toString().trim());

  // 检查目录
  info.hasScripts = await $`test -d ${skillPath}/scripts`.quiet().then(() => true).catch(() => false);
  info.hasReferences = await $`test -d ${skillPath}/references`.quiet().then(() => true).catch(() => false);
  info.hasAssets = await $`test -d ${skillPath}/assets`.quiet().then(() => true).catch(() => false);

  return info;
}

function generateAnalysisPrompt(skill: SkillOption, info: any): string {
  return `# 技能分析请求: ${skill.name}

## 基本信息

**名称:** ${skill.name}
**路径:** ${skill.path}
**描述:** ${skill.description}
**评分:** ${skill.score || 'N/A'}
**星标:** ${skill.stars || 'N/A'}
**更新:** ${skill.updated || 'N/A'}

## 技能详情

**文件数:** ${info.fileCount}
**脚本目录:** ${info.hasScripts ? '✅' : '❌'}
**参考资料:** ${info.hasReferences ? '✅' : '❌'}
**资源文件:** ${info.hasAssets ? '✅' : '❌'}

## SKILL.md 内容

\`\`\`
${info.skill || '无 SKILL.md 文件'}
\`\`\`

## 分析要求

请 Pi Agent 分析该技能并给出：

1. **功能介绍** - 这个技能的核心功能是什么？
2. **适用场景** - 什么时候应该使用这个技能？
3. **优势特点** - 相比其他技能的优势是什么？
4. **潜在问题** - 可能存在什么问题或限制？
5. **推荐指数** - 1-5 星，推荐使用吗？

## 输出格式

请用简洁明了的语言介绍，不超过 200 字。

---

*此提示由技能选择脚本生成，供 Pi Agent 阅读和分析*
`;
}

function generateInterviewConfig(skills: SkillOption[]) {
  const questions: any[] = [];

  // 主要问题：选择要安装的技能
  questions.push({
    id: 'selected_skills',
    type: 'multi',
    question: '请选择要安装的技能（可多选）：',
    options: skills.map(s => {
      let desc = s.description;
      if (s.score !== undefined) desc += ` [评分: ${s.score}]`;
      if (s.stars) desc += ` [⭐${s.stars}]`;
      return desc;
    }),
    recommended: skills.slice(0, 3).map((_, i) => i)
  });

  // 排序问题：优先级排序
  questions.push({
    id: 'priority_order',
    type: 'multi',
    question: '请按优先级排序选中的技能（按选择顺序）：',
    options: skills.map(s => s.name),
    recommended: skills.slice(0, 3).map(s => s.name),
    context: '第一个选择的技能将优先处理'
  });

  // 确认问题
  questions.push({
    id: 'confirm',
    type: 'single',
    question: '确认安装以上技能？',
    options: ['确认安装', '重新选择', '取消'],
    recommended: '确认安装'
  });

  // 反馈问题
  questions.push({
    id: 'feedback',
    type: 'text',
    question: '请提供任何额外的要求或说明：',
    recommended: ''
  });

  return {
    title: '技能选择与排序',
    description: `找到 ${skills.length} 个可用技能，请选择要安装的技能并设置优先级`,
    questions
  };
}

// 搜索并选择技能
async function searchAndSelect(keyword: string, options: SelectOptions = {}) {
  console.log(`\n🔍 搜索技能: ${keyword}`);
  console.log('━'.repeat(60));

  // 使用 gh-skill-finder 搜索
  const searchScript = `${process.env.HOME}/.pi/agent/skills/gh-skill-finder/scripts/search.ts`;
  const proc = Bun.spawn(['bun', searchScript, keyword, '--sort', options.sort || 'stars'], {
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const output = await new Response(proc.stdout).text();

  // 解析搜索结果
  const skills: SkillOption[] = parseSearchResults(output);

  if (skills.length === 0) {
    console.log(`❌ 未找到匹配的技能`);
    return { skills: [] };
  }

  // 调用选择流程
  return await selectSkills(skills, options);
}

function parseSearchResults(output: string): SkillOption[] {
  const skills: SkillOption[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(\S+)\/(\S+)/);
    if (match) {
      const owner = match[2];
      const name = match[3];

      skills.push({
        name: name,
        path: `${process.env.HOME}/.pi/agent/skills/${name}`,
        description: `从 ${owner}/${name} 仓库`,
        stars: 0 // 需要从 gh 获取
      });
    }
  }

  return skills;
}

// 从本地已安装的技能中选择
async function selectInstalledSkills(pattern: string = '*', options: SelectOptions = {}) {
  console.log(`\n📦 查看已安装技能: ${pattern}`);
  console.log('━'.repeat(60));

  const skills: SkillOption[] = [];

  // 列出已安装的技能
  const findProc = await $`find ${process.env.HOME}/.pi/agent/skills -maxdepth 1 -name "SKILL.md" -type f`.quiet();
  const skillFiles = findProc.stdout.toString().trim().split('\n').filter(Boolean);

  for (const skillFile of skillFiles) {
    const skillPath = skillFile.replace('/SKILL.md', '');
    const skillName = skillPath.split('/').pop()!;

    if (pattern !== '*' && !skillName.includes(pattern)) {
      continue;
    }

    // 读取 SKILL.md
    const content = await Bun.file(skillFile).text();
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);

    skills.push({
      name: skillName,
      path: skillPath,
      description: descMatch ? descMatch[1].trim() : '无描述',
      score: 0 // 可以从之前的评估中获取
    });
  }

  if (skills.length === 0) {
    console.log(`❌ 未找到匹配的已安装技能`);
    return { skills: [] };
  }

  return await selectSkills(skills, options);
}

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
技能选择脚本 - 使用 interview 工具让用户选择和排序技能

用法:
  bun scripts/select.ts <command> [参数]

命令:
  search <keyword>    搜索并选择技能
  installed [pattern] 从已安装技能中选择

选项:
  --sort <field>      排序字段 (score, stars, updated, name)
  --limit <num>       显示数量（默认: 10）
  --no-analysis       不进行技能分析

示例:
  # 搜索 office 相关技能
  bun scripts/select.ts search "office"

  # 从已安装技能中选择
  bun scripts/select.ts installed "office"

  # 按评分排序
  bun scripts/select.ts search "pdf" --sort score --limit 5

# 使用 interview 工具
# Pi Agent 应该使用以下命令询问用户：
# interview ~/.pi/agent/skills/skill-management/.skill-select-config.json
  `);
  process.exit(1);
}

// 解析选项
const options: SelectOptions = {};
let keyword = '';

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--sort' && args[i + 1]) {
    options.sort = args[i + 1] as any;
    i++;
  } else if (arg === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === '--no-analysis') {
    options.requireAnalysis = false;
  } else if (!arg.startsWith('--')) {
    keyword = arg;
  }
}

// 执行命令
if (command === 'search') {
  searchAndSelect(keyword, options).catch(err => {
    console.error(`❌ 搜索失败: ${err.message}`);
    process.exit(1);
  });
} else if (command === 'installed') {
  selectInstalledSkills(keyword || '*', options).catch(err => {
    console.error(`❌ 选择失败: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`❌ 未知命令: ${command}`);
  process.exit(1);
}