#!/usr/bin/env node
/**
 * Node.js 集成 fzf CLI demo
 * 检索 ~/.pi/agent 目录
 * 
 * 使用方式：
 *   node fzf-demo.js [搜索词]
 * 
 * 示例：
 *   node fzf-demo.js          # 交互式选择（需要终端）
 *   node fzf-demo.js skill    # 非交互式过滤
 */

const { spawn, execSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');

const SEARCH_DIR = join(process.env.HOME, '.pi/agent');

// 检查是否有 TTY（交互式终端）
const isTTY = process.stdout.isTTY;

// 只获取当前目录的文件和目录
function getFiles(dir) {
  const files = [];
  
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.')) continue;
      if (item === 'node_modules') continue;
      
      const fullPath = join(dir, item);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push({ type: 'dir', path: fullPath + '/' });
        } else if (stat.isFile()) {
          files.push({ type: 'file', path: fullPath });
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  return files.sort((a, b) => {
    if (a.type === 'dir' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'dir') return 1;
    return a.path.localeCompare(b.path);
  });
}

// 非交互式：使用 fzf --filter
function fzfFilter(items, query) {
  if (!query) return items;
  
  try {
    const input = items.map(i => i.path).join('\n');
    const result = execSync(`echo "${input}" | fzf -f "${query}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    
    const selected = result.trim().split('\n').filter(Boolean);
    return items.filter(item => selected.includes(item.path));
  } catch (e) {
    return items;
  }
}

// 交互式选择（需要在终端运行）
function fzfSelectInteractive(items) {
  return new Promise((resolve, reject) => {
    const child = spawn('fzf', [
      '--height=60%',
      '--reverse',
      '--border=rounded',
      '--info=inline',
      '--prompt', 'Select> ',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = [];
    
    child.stdout.on('data', (data) => output.push(data));
    child.on('close', (code) => {
      const selected = output.join('').trim();
      resolve(code === 0 ? selected : null);
    });
    
    child.on('error', reject);
    
    // 发送数据
    const input = items.map(i => i.path).join('\n') + '\n';
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const query = args[0] || '';
  
  console.log('🔍 扫描目录:', SEARCH_DIR);
  console.log('📂 获取文件列表...\n');
  
  const files = getFiles(SEARCH_DIR);
  
  if (files.length === 0) {
    console.log('❌ 未找到文件');
    return;
  }
  
  console.log(`📋 找到 ${files.length} 个文件/目录\n`);
  
  if (query) {
    // 非交互式过滤模式
    console.log(`🔎 搜索: "${query}"\n`);
    const filtered = fzfFilter(files, query);
    
    if (filtered.length === 0) {
      console.log('❌ 没有匹配结果');
    } else {
      console.log(`✅ 找到 ${filtered.length} 个匹配:\n`);
      filtered.forEach(item => {
        const icon = item.type === 'dir' ? '📁' : '📄';
        const name = item.path.replace(SEARCH_DIR + '/', '');
        console.log(`  ${icon} ${name}`);
      });
    }
  } else if (!isTTY) {
    // 无 TTY 时显示帮助
    console.log('💡 提示: 在终端中运行以使用交互式选择\n');
    console.log('使用示例:\n');
    console.log('  node fzf-demo.js skill      # 搜索包含 "skill" 的文件');
    console.log('  node fzf-demo.js read       # 搜索包含 "read" 的文件');
    console.log('  node fzf-demo.js .md        # 搜索 .md 文件\n');
    console.log('文件列表:\n');
    files.forEach(item => {
      const icon = item.type === 'dir' ? '📁' : '📄';
      const name = item.path.replace(SEARCH_DIR + '/', '');
      console.log(`  ${icon} ${name}`);
    });
  } else {
    // 交互式选择模式
    console.log('🎯 启动 fzf 交互式选择...\n');
    
    const selected = await fzfSelectInteractive(files);
    
    if (selected) {
      console.log('\n✅ 选中:', selected);
    } else {
      console.log('\n👋 已取消选择');
    }
  }
}

main().catch(console.error);
