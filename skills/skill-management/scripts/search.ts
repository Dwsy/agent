#!/usr/bin/env bun
import { $ } from 'bun';

const SKILLS_BASE = 'https://skills.sh';

interface Skill {
  source: string;
  skillId: string;
  name: string;
  installs: number;
}

let skillsCache: Skill[] | null = null;

async function fetchSkills(): Promise<Skill[]> {
  if (skillsCache) return skillsCache;

  try {
    console.log(`   正在获取 skills.sh 数据...`);
    const response = await fetch(`${SKILLS_BASE}/trending`);
    const html = await response.text();

    // Extract skills data from HTML
    const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) {
      console.warn(`   ⚠️  skills.sh 数据格式可能已变化，无法提取数据`);
      return [];
    }

    const data = JSON.parse(scriptMatch[1]);
    const skills: Skill[] = [];

    // Traverse the data structure to find skills
    function extractSkills(obj: any) {
      if (Array.isArray(obj)) {
        obj.forEach(extractSkills);
      } else if (typeof obj === 'object' && obj !== null) {
        if (obj.skillId && obj.source && obj.name && typeof obj.installs === 'number') {
          skills.push({
            source: obj.source,
            skillId: obj.skillId,
            name: obj.name,
            installs: obj.installs
          });
        }
        Object.values(obj).forEach(extractSkills);
      }
    }

    extractSkills(data);
    skillsCache = skills;
    console.log(`   ✅ 获取到 ${skills.length} 个技能`);
    return skills;
  } catch (error) {
    console.error('   ❌ Failed to fetch skills:', error.message);
    return [];
  }
}

async function searchMarketplace(keyword: string, limit: number = 20) {
  console.log(`\n🔍 搜索 skills.sh marketplace: ${keyword}`);
  console.log('━'.repeat(60));

  const skills = await fetchSkills();
  const lowerKeyword = keyword.toLowerCase();

  const results = skills.filter(s =>
    s.name.toLowerCase().includes(lowerKeyword) ||
    s.skillId.toLowerCase().includes(lowerKeyword) ||
    s.source.toLowerCase().includes(lowerKeyword)
  );

  if (results.length === 0) {
    console.log(`❌ 未找到匹配的技能`);
    return [];
  }

  results.sort((a, b) => b.installs - a.installs);

  console.log(`\n✅ 找到 ${Math.min(results.length, limit)} 个技能:\n`);

  return results.slice(0, limit);
}

async function getMarketplaceSkill(skillId: string) {
  const skills = await fetchSkills();
  return skills.find(s => s.skillId === skillId || s.skillId.toLowerCase() === skillId.toLowerCase());
}

export async function search(keyword: string, options: any = {}) {
  const { source = 'github', limit = 20 } = options;

  if (source === 'marketplace') {
    return await searchMarketplace(keyword, limit);
  }

  // 默认使用 GitHub 搜索
  console.log(`\n🔍 搜索 GitHub 仓库: ${keyword}`);
  console.log('━'.repeat(60));

  const proc = Bun.spawn(['gh', 'search', 'repos', keyword, '-L', limit.toString(), '--sort', 'stars'], {
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const output = await new Response(proc.stdout).text();
  const error = await new Response(proc.stderr).text();

  if (error) {
    console.error(`❌ 搜索失败: ${error}`);
    return [];
  }

  const lines = output.trim().split('\n');
  const results: any[] = [];

  for (const line of lines) {
    const match = line.match(/^(\S+)\/(\S+)\s+([\d.]+★)\s+(.+)$/);
    if (match) {
      results.push({
        owner: match[1],
        name: match[2],
        repo: `${match[1]}/${match[2]}`,
        stars: match[3],
        description: match[4],
        source: 'github'
      });
    }
  }

  console.log(`\n✅ 找到 ${results.length} 个技能\n`);

  return results;
}

export async function listTrending(limit: number = 20) {
  console.log(`\n📈 skills.sh 热门技能 (Top ${limit})`);
  console.log('━'.repeat(60));

  const skills = await fetchSkills();

  if (skills.length === 0) {
    console.log(`❌ 未找到技能`);
    return [];
  }

  const topSkills = skills.sort((a, b) => b.installs - a.installs).slice(0, limit);

  console.log(`\n✅ 找到 ${topSkills.length} 个热门技能:\n`);

  return topSkills;
}

export async function getStats() {
  const skills = await fetchSkills();

  const totalInstalls = skills.reduce((sum, s) => sum + s.installs, 0);
  const avgInstalls = totalInstalls / skills.length;
  const topSources = skills.reduce((acc, s) => {
    acc[s.source] = (acc[s.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: skills.length,
    totalInstalls,
    avgInstalls: Math.round(avgInstalls),
    topSources: Object.entries(topSources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }))
  };
}

// CLI 接口
if (import.meta.main) {
  const args = process.argv.slice(2);
  const keyword = args[0];

  if (!keyword) {
    console.log(`
技能搜索工具 - 支持双数据源

用法:
  bun scripts/search.ts <keyword> [选项]

数据源:
  github          GitHub 仓库搜索（默认）
  marketplace      skills.sh marketplace

选项:
  --source <type>  数据源类型 (github/marketplace)
  --limit <num>    结果数量 (默认: 20)

示例:
  bun scripts/search.ts "react" --source github
  bun scripts/search.ts "react" --source marketplace
  bun scripts/search.ts trending
  bun scripts/search.ts stats
    `);
    process.exit(1);
  }

  // 解析选项
  const options: any = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      options.source = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // 执行对应的命令
  if (keyword === 'marketplace') {
    const searchKeyword = args[1];
    if (!searchKeyword) {
      console.log('用法: bun scripts/search.ts marketplace <keyword>');
      process.exit(1);
    }
    await searchMarketplace(searchKeyword, options.limit);
  } else if (keyword === 'trending') {
    const results = await listTrending(options.limit);
    results.forEach((skill, i) => {
      console.log(`${i + 1}. ${skill.name} (${skill.installs} installs) [${skill.source}/${skill.skillId}]`);
    });
  } else if (keyword === 'stats') {
    const stats = await getStats();
    console.log(`\n📊 技能统计`);
    console.log('━'.repeat(60));
    console.log(`  总技能数: ${stats.total}`);
    console.log(`  总安装数: ${stats.totalInstalls.toLocaleString()}`);
    console.log(`  平均安装数: ${stats.avgInstalls.toLocaleString()}`);
    console.log(`  Top 5 来源:`);
    stats.topSources.forEach(({ source, count }) => {
      console.log(`    ${source}: ${count} 个技能`);
    });
  } else {
    // 默认：搜索
    await search(keyword, options);
  }
}