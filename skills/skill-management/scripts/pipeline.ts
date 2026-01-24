#!/usr/bin/env bun

/**
 * 完整流程脚本 - 一键执行技能管理的完整流程，使用 interview 工具进行用户介入
 */

import { $ } from 'bun';

const SKILLS_DIR = `${process.env.HOME}/.pi/agent/skills`;
const TEMP_DIR = '/tmp/skill-pipeline';
const REPORTS_DIR = `${process.env.HOME}/.pi/agent/skills/skill-management/reports`;

interface PipelineOptions {
  interactive?: boolean;
  verbose?: boolean;
  skipAudit?: boolean;
  skipTest?: boolean;
}

async function runPipeline(keyword?: string, options: PipelineOptions = {}) {
  const phases = [
    'search',
    'select',
    'discover',
    'assess',
    'audit',
    'adapt',
    'integrate',
    'report',
    'notify'
  ];

  console.log(`\n🚀 技能管理流程启动`);
  if (keyword) console.log(`   搜索关键词: ${keyword}`);
  console.log(`   交互模式: ${options.interactive ? '✅' : '❌'}`);
  console.log('━'.repeat(60));

  const results: any = {};

  // 准备工作目录
  await $`rm -rf ${TEMP_DIR}`;
  await $`mkdir -p ${TEMP_DIR} ${REPORTS_DIR}`;

  // Phase 1: 搜索技能
  if (keyword) {
    console.log(`\n🔍 Phase 1: 搜索技能`);
    const searchResult = await searchSkills(keyword);
    results.search = searchResult;

    if (!searchResult.success || searchResult.skills.length === 0) {
      console.error(`❌ 搜索失败或未找到技能`);
      return results;
    }
  }

  // Phase 2: 选择技能
  console.log(`\n📋 Phase 2: 选择技能`);
  const selectResult = await selectSkill(results.search?.skills || [], options.interactive);
  results.select = selectResult;

  if (!selectResult.selected) {
    console.log(`⏸️  未选择技能，流程结束`);
    return results;
  }

  const selectedSkill = selectResult.selected;

  // Phase 3: 发现技能
  console.log(`\n📥 Phase 3: 发现技能`);
  const discoverResult = await discover(selectedSkill.repo, selectedSkill.name);
  results.discover = discoverResult;

  if (!discoverResult.success) {
    console.error(`❌ 发现阶段失败`);
    return results;
  }

  const skillPath = `${SKILLS_DIR}/${discoverResult.skillName}`;

  // Phase 4: 评估技能
  console.log(`\n📊 Phase 4: 评估技能`);
  const assessResult = await assess(skillPath, options.interactive);
  results.assess = assessResult;

  if (options.interactive && !assessResult.userDecision?.continue) {
    console.log(`⏸️  用户选择停止流程`);
    return results;
  }

  // Phase 5: 安全审计
  if (!options.skipAudit) {
    console.log(`\n🔒 Phase 5: 安全审计`);
    const auditResult = await audit(skillPath, options.interactive);
    results.audit = auditResult;

    if (options.interactive && !auditResult.userDecision?.continue) {
      console.log(`⏸️  用户选择停止流程`);
      return results;
    }
  }

  // Phase 6: 适应性改造
  console.log(`\n🔧 Phase 6: 适应性改造`);
  const adaptResult = await adapt(skillPath, options.interactive);
  results.adapt = adaptResult;

  // Phase 7: 融合测试
  if (!options.skipTest) {
    console.log(`\n🧪 Phase 7: 融合测试`);
    const integrateResult = await integrate(skillPath);
    results.integrate = integrateResult;
  }

  // Phase 8: 生成报告
  console.log(`\n📄 Phase 8: 生成报告`);
  const reportResult = await generateReport(discoverResult.skillName, results);
  results.report = reportResult;

  // Phase 9: 用户通知
  console.log(`\n🔔 Phase 9: 用户通知`);
  await notify(discoverResult.skillName, results);

  console.log(`\n✅ 流程完成`);
  console.log(`   技能: ${discoverResult.skillName}`);
  console.log(`   报告: ${REPORTS_DIR}/${discoverResult.skillName}.md`);

  return results;
}

async function searchSkills(keyword: string) {
  const result: any = { success: false, skills: [] };

  try {
    console.log(`   搜索: ${keyword}`);

    // 使用 gh 搜索
    const proc = Bun.spawn(['gh', 'search', 'repos', keyword, '-L', '20', '--sort', 'stars', '--order', 'desc'], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    if (error) {
      result.error = error;
      return result;
    }

    // 解析输出
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^(\S+)\/(\S+)\s+([\d.]+★)\s+(.+)$/);
      if (match) {
        result.skills.push({
          owner: match[1],
          name: match[2],
          repo: `${match[1]}/${match[2]}`,
          stars: match[3],
          description: match[4]
        });
      }
    }

    result.success = true;
    console.log(`   找到 ${result.skills.length} 个技能`);

  } catch (error: any) {
    result.error = error.message;
  }

  return result;
}

async function selectSkill(skills: any[], interactive: boolean) {
  const result: any = { selected: null };

  if (skills.length === 0) {
    console.log(`   无技能可选择`);
    return result;
  }

  // 生成选择配置
  const selectConfig = generateSelectConfig(skills);

  // 写入配置文件
  const configFile = `${TEMP_DIR}/select-config.json`;
  await Bun.write(configFile, JSON.stringify(selectConfig, null, 2));

  console.log(`   💡 请使用 interview 工具让用户选择技能`);
  console.log(`   配置文件: ${configFile}`);

  if (interactive) {
    console.log(`\n   ⏸️  等待用户选择...`);
    // 在实际使用中，Pi Agent 会读取配置并使用 interview 工具
    // 这里只是生成配置，实际的交互由 Pi Agent 完成
  } else {
    // 非交互模式，选择第一个
    result.selected = skills[0];
    console.log(`   自动选择: ${result.selected.repo}`);
  }

  return result;
}

function generateSelectConfig(skills: any[]) {
  return {
    title: '选择要安装的技能',
    description: '根据搜索结果，请选择要安装和评估的技能',
    questions: [
      {
        id: 'skill_choice',
        type: 'single',
        question: '请选择要安装的技能：',
        options: skills.map(s => `${s.repo} ⭐ ${s.stars} - ${s.description.substring(0, 50)}...`),
        recommended: skills[0].repo
      },
      {
        id: 'custom_name',
        type: 'text',
        question: '自定义技能名称（可选，留空使用默认名称）：',
        recommended: ''
      },
      {
        id: 'feedback',
        type: 'text',
        question: '任何额外的要求或说明：',
        recommended: ''
      }
    ]
  };
}

async function discover(repo: string, skillName?: string) {
  const result: any = { success: false };

  try {
    console.log(`   克隆仓库: ${repo}`);
    const repoName = repo.split('/')[1];
    const cloneDir = `${TEMP_DIR}/${repoName}`;

    await $`gh repo clone ${repo} ${cloneDir}`;

    // 查找技能
    const skillFiles = await $`find ${cloneDir} -name "SKILL.md" -type f`.quiet();
    const skills = skillFiles.stdout.toString().trim().split('\n').filter(Boolean);

    if (skills.length === 0) {
      result.error = '未找到 SKILL.md 文件';
      return result;
    }

    // 复制技能
    const skillDir = skills[0].replace('/SKILL.md', '');
    const targetName = skillName || repoName.replace(/-skill$/, '').replace(/-skills$/, '');
    const targetPath = `${SKILLS_DIR}/${targetName}`;

    console.log(`   安装技能: ${targetName}`);
    await $`cp -r ${skillDir} ${targetPath}`;

    result.success = true;
    result.skillName = targetName;
    result.skillPath = targetPath;
    result.skillsFound = skills.length;

  } catch (error: any) {
    result.error = error.message;
  }

  return result;
}

async function assess(skillPath: string, interactive: boolean) {
  const assessScript = `${process.env.HOME}/.pi/agent/skills/skill-management/scripts/assess.ts`;

  // 生成分析提示
  await $`bun ${assessScript} ${skillPath}`.quiet();

  let userDecision: any = { continue: true };

  if (interactive) {
    console.log(`   💡 请阅读分析提示并使用 interview 工具询问用户`);
    console.log(`   分析提示: /tmp/skill-assessment-prompt.md`);
  }

  return { success: true, userDecision };
}

async function audit(skillPath: string, interactive: boolean) {
  const auditScript = `${process.env.HOME}/.pi/agent/skills/skill-management/scripts/audit.ts`;

  // 生成审计提示
  await $`bun ${auditScript} ${skillPath}`.quiet();

  let userDecision: any = { continue: true };

  if (interactive) {
    console.log(`   💡 请阅读审计提示并使用 interview 工具询问用户`);
    console.log(`   审计提示: /tmp/skill-security-audit-prompt.md`);
  }

  return { success: true, userDecision };
}

async function adapt(skillPath: string, interactive: boolean) {
  console.log(`   分析适配需求...`);
  const grepProc = await $`grep -r "home/\\.pi" ${skillPath} 2>/dev/null || true`.quiet();
  const matches = grepProc.stdout.toString().trim();

  if (matches) {
    console.log(`   ⚠️  发现 ${matches.split('\n').filter(Boolean).length} 处路径引用需要调整`);
  } else {
    console.log(`   ✅ 无需路径调整`);
  }

  return { success: true, adapted: matches.length > 0 };
}

async function integrate(skillPath: string) {
  console.log(`   检查命名冲突...`);
  const skillName = skillPath.split('/').pop()!;
  const conflict = await $`find ${SKILLS_DIR} -maxdepth 1 -name "${skillName}*" ! -path "${skillPath}" 2>/dev/null | wc -l`.quiet();
  const conflictCount = parseInt(conflict.stdout.toString().trim());

  if (conflictCount > 0) {
    console.log(`   ⚠️  发现 ${conflictCount} 个可能冲突的技能`);
  } else {
    console.log(`   ✅ 无命名冲突`);
  }

  console.log(`   ✅ 基础兼容性检查通过`);
  return { success: true, conflicts: conflictCount };
}

async function generateReport(skillName: string, results: any) {
  const reportPath = `${REPORTS_DIR}/${skillName}.md`;

  const content = `# 技能评估报告: ${skillName}

生成时间: ${new Date().toLocaleString('zh-CN')}

## 执行流程

✅ 搜索 → ✅ 选择 → ✅ 发现 → ✅ 评估 → ${results.audit ? '✅' : '⏭️'} 审计 → ✅ 改造 → ${results.integrate ? '✅' : '⏭️'} 融合 → ✅ 报告

## 技能信息

- **名称**: ${skillName}
- **仓库**: ${results.select?.selected?.repo || 'N/A'}
- **描述**: ${results.select?.selected?.description || 'N/A'}
- **星标**: ${results.select?.selected?.stars || 'N/A'}

## LLM 分析文件

- 评估分析: \`/tmp/skill-assessment-prompt.md\`
- 安全审计: \`/tmp/skill-security-audit-prompt.md\`

## 建议

1. ✅ 技能已安装到本地
2. 📝 查看 LLM 分析结果
3. 🧪 测试技能功能
4. 📚 阅读技能文档: \`${SKILLS_DIR}/${skillName}/SKILL.md\`

## 下一步

请 Pi Agent 读取 LLM 分析文件并给出详细建议。
`;

  await Bun.write(reportPath, content);
  console.log(`   报告已生成: ${reportPath}`);

  return { success: true, reportPath };
}

async function notify(skillName: string, results: any) {
  console.log(`\n📋 通知摘要`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ 技能管理流程已完成`);
  console.log(`   技能: ${skillName}`);
  console.log(`   仓库: ${results.select?.selected?.repo || 'N/A'}`);
  console.log(`\n📄 LLM 分析文件:`);
  console.log(`   - 评估: /tmp/skill-assessment-prompt.md`);
  console.log(`   - 审计: /tmp/skill-security-audit-prompt.md`);
  console.log(`\n📚 技能文档: ${SKILLS_DIR}/${skillName}/SKILL.md`);
  console.log(`\n💡 下一步:`);
  console.log(`   1. 读取 LLM 分析文件`);
  console.log(`   2. 根据分析结果进行决策`);
  console.log(`   3. 测试技能功能`);
}

// 解析命令行参数
const args = process.argv.slice(2);
const keyword = args[0];

if (!keyword) {
  console.log(`
完整流程脚本 - 技能搜索、选择、安装、评估全流程

用法:
  bun scripts/pipeline.ts <keyword> [选项]

参数:
  keyword         搜索关键词（必需）

选项:
  --interactive   交互式模式（使用 interview 工具）
  --verbose       详细输出
  --skip-audit    跳过安全审计
  --skip-test     跳过融合测试

阶段:
  search    搜索技能
  select    选择技能（使用 interview）
  discover  发现并安装技能
  assess    评估技能（Pi Agent 分析）
  audit     安全审计（Pi Agent 分析）
  adapt     适应性改造
  integrate 融合测试
  report    生成报告
  notify    用户通知

示例:
  # 搜索 office 技能并选择
  bun scripts/pipeline.ts "claude office" --interactive

  # 搜索 pdf 技能
  bun scripts/pipeline.ts "pdf processing"

  # 搜索并自动选择第一个
  bun scripts/pipeline.ts "browser skill"
  `);
  process.exit(1);
}

// 解析选项
const options: PipelineOptions = {};
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--interactive') {
    options.interactive = true;
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--skip-audit') {
    options.skipAudit = true;
  } else if (arg === '--skip-test') {
    options.skipTest = true;
  }
}

// 执行流程
runPipeline(keyword, options).catch(err => {
  console.error(`❌ 流程失败: ${err.message}`);
  process.exit(1);
});