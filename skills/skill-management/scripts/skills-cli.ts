#!/usr/bin/env bun
/**
 * Skills CLI 集成模块
 * 基于 Vercel skills 原理，使用 npx skills 作为数据源
 */

import { $ } from 'bun';

export interface SkillsCLIResult {
  name: string;
  fullName: string;
  source: string;
  description?: string;
  url?: string;
}

/**
 * 使用 npx skills find 搜索技能
 */
export async function searchWithCLI(keyword: string, limit: number = 10): Promise<SkillsCLIResult[]> {
  console.log(`\n🔍 使用 Skills CLI 搜索: ${keyword}`);
  console.log('━'.repeat(60));

  try {
    const proc = Bun.spawn(['npx', 'skills', 'find', keyword, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    if (error && !output) {
      console.error(`   ⚠️ CLI 错误: ${error}`);
      return [];
    }

    // 解析 JSON 结果
    let results: SkillsCLIResult[] = [];
    try {
      const parsed = JSON.parse(output);
      results = Array.isArray(parsed) ? parsed.slice(0, limit) : [];
    } catch {
      // 如果不是 JSON，尝试解析文本格式
      results = parseTextOutput(output).slice(0, limit);
    }

    console.log(`   ✅ 找到 ${results.length} 个技能`);
    return results;

  } catch (error: any) {
    if (error.message?.includes('timeout')) {
      console.log(`   ⏱️ 搜索超时，CLI 可能需要首次安装`);
    } else {
      console.error(`   ❌ CLI 搜索失败: ${error.message}`);
    }
    return [];
  }
}

/**
 * 解析文本格式的输出
 */
function parseTextOutput(output: string): SkillsCLIResult[] {
  const results: SkillsCLIResult[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // 匹配格式: owner/repo@skill-name 或 owner/repo
    const match = line.match(/^(\S+)\/(\S+)(?:@(\S+))?/);
    if (match) {
      const [, owner, repo, skillName] = match;
      const fullName = skillName ? `${owner}/${repo}@${skillName}` : `${owner}/${repo}`;
      results.push({
        name: skillName || repo,
        fullName,
        source: `${owner}/${repo}`,
        description: line.replace(match[0], '').trim()
      });
    }
  }

  return results;
}

/**
 * 安装技能
 */
export async function installSkill(skillRef: string, global: boolean = true): Promise<boolean> {
  console.log(`\n📦 安装技能: ${skillRef}`);
  console.log('━'.repeat(60));

  try {
    const args = ['npx', 'skills', 'add', skillRef, '-y'];
    if (global) args.push('-g');

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    if (output.includes('success') || output.includes('installed') || !error) {
      console.log(`   ✅ 安装成功`);
      return true;
    } else {
      console.error(`   ❌ 安装失败: ${error || output}`);
      return false;
    }

  } catch (error: any) {
    console.error(`   ❌ 安装出错: ${error.message}`);
    return false;
  }
}

/**
 * 检查技能更新
 */
export async function checkUpdates(): Promise<{ hasUpdates: boolean; skills: string[] }> {
  console.log(`\n🔄 检查技能更新...`);
  console.log('━'.repeat(60));

  try {
    const proc = Bun.spawn(['npx', 'skills', 'check', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000
    });

    const output = await new Response(proc.stdout).text();

    try {
      const parsed = JSON.parse(output);
      const skills = Array.isArray(parsed) ? parsed : [];
      return {
        hasUpdates: skills.length > 0,
        skills
      };
    } catch {
      return { hasUpdates: false, skills: [] };
    }

  } catch (error: any) {
    console.error(`   ⚠️ 检查更新失败: ${error.message}`);
    return { hasUpdates: false, skills: [] };
  }
}

/**
 * 更新所有技能
 */
export async function updateAll(): Promise<boolean> {
  console.log(`\n⬆️ 更新所有技能...`);
  console.log('━'.repeat(60));

  try {
    const proc = Bun.spawn(['npx', 'skills', 'update', '-y'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 180000
    });

    const output = await new Response(proc.stdout).text();
    console.log(`   ✅ ${output || '更新完成'}`);
    return true;

  } catch (error: any) {
    console.error(`   ❌ 更新失败: ${error.message}`);
    return false;
  }
}

/**
 * 获取技能详情
 */
export async function getSkillInfo(skillRef: string): Promise<Record<string, any> | null> {
  try {
    const proc = Bun.spawn(['npx', 'skills', 'info', skillRef, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30000
    });

    const output = await new Response(proc.stdout).text();
    return JSON.parse(output);

  } catch {
    return null;
  }
}

// CLI 接口
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'find':
      const keyword = args[1];
      if (!keyword) {
        console.log('用法: bun scripts/skills-cli.ts find <keyword>');
        process.exit(1);
      }
      const results = await searchWithCLI(keyword, parseInt(args[2] || '10', 10));
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.fullName}`);
        if (r.description) console.log(`   ${r.description}`);
      });
      break;

    case 'install':
      const skill = args[1];
      if (!skill) {
        console.log('用法: bun scripts/skills-cli.ts install <skill-ref>');
        process.exit(1);
      }
      await installSkill(skill);
      break;

    case 'check':
      const updates = await checkUpdates();
      if (updates.hasUpdates) {
        console.log(`发现 ${updates.skills.length} 个可更新技能:`);
        updates.skills.forEach(s => console.log(`  - ${s}`));
      } else {
        console.log('所有技能已是最新');
      }
      break;

    case 'update':
      await updateAll();
      break;

    default:
      console.log(`
Skills CLI 集成工具

用法:
  bun scripts/skills-cli.ts <command> [选项]

命令:
  find <keyword> [limit]  搜索技能
  install <skill-ref>     安装技能 (格式: owner/repo@skill)
  check                   检查更新
  update                  更新所有技能

示例:
  bun scripts/skills-cli.ts find react
  bun scripts/skills-cli.ts install vercel-labs/agent-skills@vercel-react-best-practices
  bun scripts/skills-cli.ts check
      `);
  }
}
