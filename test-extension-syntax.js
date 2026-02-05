#!/usr/bin/env node

/**
 * 测试扩展的 TypeScript 语法
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const EXTENSIONS_DIR = '/Users/dengwenyu/.pi/agent/extensions';

console.log('🔍 扩展语法测试\n');

// 获取所有 .ts 扩展文件
function getExtensionFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !entry.startsWith('.')) {
      // 检查目录下是否有 index.ts
      const indexPath = join(fullPath, 'index.ts');
      if (existsSync(indexPath)) {
        files.push(indexPath);
      }
    } else if (entry.endsWith('.ts') && !entry.startsWith('.')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

const extensionFiles = getExtensionFiles(EXTENSIONS_DIR);
console.log(`📄 找到 ${extensionFiles.length} 个扩展文件\n`);

let passed = 0;
let failed = 0;
const errors = [];

for (const file of extensionFiles) {
  const fileName = file.split('/').pop();
  process.stdout.write(`  检查 ${fileName}... `);

  try {
    // 使用 tsc 检查语法（不生成文件）
    execSync(`npx tsc --noEmit --skipLibCheck "${file}"`, {
      stdio: 'pipe',
      timeout: 10000
    });
    console.log('✅');
    passed++;
  } catch (error) {
    console.log('❌');
    failed++;
    errors.push({ file, error: error.message.split('\n').slice(0, 3).join('\n') });
  }
}

console.log('\n' + '='.repeat(60));
console.log(`📊 测试结果:`);
console.log(`   ✅ 通过: ${passed}`);
console.log(`   ❌ 失败: ${failed}`);
console.log('='.repeat(60));

if (errors.length > 0) {
  console.log('\n❌ 失败详情:\n');
  for (const { file, error } of errors) {
    console.log(`📄 ${file}`);
    console.log(`   ${error}\n`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 所有扩展语法检查通过！');
  process.exit(0);
}