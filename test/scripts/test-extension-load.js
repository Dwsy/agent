#!/usr/bin/env node

/**
 * 扩展加载测试脚本
 * 验证扩展文件是否可以被正确加载
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const EXTENSIONS_DIR = join(process.env.HOME, '.pi/agent/extensions');

console.log('🔍 扩展加载测试\n');
console.log(`📂 扩展目录: ${EXTENSIONS_DIR}\n`);

// 检查目录是否存在
if (!existsSync(EXTENSIONS_DIR)) {
  console.error('❌ 扩展目录不存在！');
  process.exit(1);
}

console.log('✅ 扩展目录存在\n');

// 读取所有扩展文件
const entries = readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
const extensions = [];

for (const entry of entries) {
  const fullPath = join(EXTENSIONS_DIR, entry.name);
  
  // 跳过目录（如 games, subagent 等）
  if (entry.isDirectory()) {
    console.log(`📁 ${entry.name}/ (目录)`);
    continue;
  }
  
  // 只处理 .ts 和 .js 文件
  if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) {
    continue;
  }
  
  const stats = statSync(fullPath);
  extensions.push({
    name: entry.name,
    path: fullPath,
    size: stats.size,
    modified: stats.mtime
  });
  
  console.log(`📄 ${entry.name} (${(stats.size / 1024).toFixed(1)} KB)`);
}

console.log(`\n📊 统计:`);
console.log(`   - 总扩展数: ${extensions.length}`);
console.log(`   - 总大小: ${(extensions.reduce((sum, ext) => sum + ext.size, 0) / 1024).toFixed(1)} KB`);

// 检查测试扩展
const testExt = extensions.find(e => e.name === 'test-load.ts');
if (testExt) {
  console.log(`\n✅ 测试扩展已创建: ${testExt.name}`);
  console.log(`   大小: ${(testExt.size / 1024).toFixed(2)} KB`);
  console.log(`   修改时间: ${testExt.modified.toLocaleString('zh-CN')}`);
} else {
  console.log(`\n⚠️  测试扩展未找到`);
}

console.log('\n🎯 测试步骤:');
console.log('1. 启动 pi 代理');
console.log('2. 检查是否显示 "🧪 测试扩展已加载！" 通知');
console.log('3. 输入 /test-load 命令测试扩展功能');
console.log('4. 检查是否显示 "🎉 测试扩展工作正常！" 通知\n');