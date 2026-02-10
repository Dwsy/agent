#!/usr/bin/env node

/**
 * 测试扩展发现和加载功能
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const EXTENSIONS_DIR = path.join(AGENT_DIR, "extensions");

console.log("🔍 扩展发现测试\n");

// 测试 1: 检查扩展目录
console.log("📂 扩展目录:");
console.log(`   Agent Dir: ${AGENT_DIR}`);
console.log(`   Extensions Dir: ${EXTENSIONS_DIR}`);

if (!fs.existsSync(EXTENSIONS_DIR)) {
  console.log("   ❌ 扩展目录不存在");
  process.exit(1);
}
console.log("   ✅ 扩展目录存在\n");

// 测试 2: 发现扩展
console.log("📄 发现扩展:");

function isExtensionFile(name) {
  return name.endsWith(".ts") || name.endsWith(".js");
}

function resolveExtensionEntries(dir) {
  const packageJsonPath = path.join(dir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.pi?.extensions?.length) {
        const entries = [];
        for (const extPath of pkg.pi.extensions) {
          const resolvedExtPath = path.resolve(dir, extPath);
          if (fs.existsSync(resolvedExtPath)) {
            entries.push(resolvedExtPath);
          }
        }
        if (entries.length > 0) {
          return entries;
        }
      }
    } catch {}
  }

  const indexTs = path.join(dir, "index.ts");
  const indexJs = path.join(dir, "index.js");
  if (fs.existsSync(indexTs)) {
    return [indexTs];
  }
  if (fs.existsSync(indexJs)) {
    return [indexJs];
  }
  return null;
}

function discoverExtensionsInDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const discovered = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if ((entry.isFile() || entry.isSymbolicLink()) && isExtensionFile(entry.name)) {
        discovered.push(entryPath);
        continue;
      }

      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const subEntries = resolveExtensionEntries(entryPath);
        if (subEntries) {
          discovered.push(...subEntries);
        }
      }
    }
  } catch (err) {
    console.log(`   ⚠️  读取目录失败: ${err.message}`);
  }

  return discovered;
}

const extensions = discoverExtensionsInDir(EXTENSIONS_DIR);

if (extensions.length === 0) {
  console.log("   ❌ 没有发现扩展");
} else {
  console.log(`   ✅ 发现 ${extensions.length} 个扩展:`);
  for (const ext of extensions) {
    const relativePath = path.relative(AGENT_DIR, ext);
    const stats = fs.statSync(ext);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`      📄 ${relativePath} (${size} KB)`);
  }
}

// 测试 3: 检查测试扩展
console.log("\n🧪 测试扩展:");
const testExtPath = path.join(EXTENSIONS_DIR, "test-load.ts");

if (fs.existsSync(testExtPath)) {
  const stats = fs.statSync(testExtPath);
  const size = (stats.size / 1024).toFixed(1);
  console.log(`   ✅ 测试扩展存在`);
  console.log(`   📄 路径: ${testExtPath}`);
  console.log(`   📊 大小: ${size} KB`);
  console.log(`   🕐 修改时间: ${stats.mtime.toLocaleString("zh-CN")}`);

  // 读取内容并检查基本结构
  try {
    const content = fs.readFileSync(testExtPath, "utf-8");
    const hasExportDefault = content.includes("export default function");
    const hasRegisterCommand = content.includes("registerCommand");
    const hasRegisterTool = content.includes("registerTool");

    console.log("\n   📝 内容检查:");
    console.log(`      ${hasExportDefault ? "✅" : "❌"} 导出默认函数`);
    console.log(`      ${hasRegisterCommand ? "✅" : "❌"} 注册命令`);
    console.log(`      ${hasRegisterTool ? "✅" : "❌"} 注册工具`);
  } catch (err) {
    console.log(`   ⚠️  读取内容失败: ${err.message}`);
  }
} else {
  console.log(`   ❌ 测试扩展不存在`);
}

// 测试 4: 检查项目本地扩展
console.log("\n📁 项目本地扩展:");
const localExtDir = path.join(process.cwd(), ".pi", "extensions");

if (fs.existsSync(localExtDir)) {
  const localExtensions = discoverExtensionsInDir(localExtDir);
  console.log(`   ✅ 项目本地扩展目录存在`);
  console.log(`   📄 发现 ${localExtensions.length} 个扩展:`);
  for (const ext of localExtensions) {
    const relativePath = path.relative(process.cwd(), ext);
    console.log(`      📄 ${relativePath}`);
  }
} else {
  console.log(`   ℹ️  项目本地扩展目录不存在 (${localExtDir})`);
}

// 测试 5: 统计
console.log("\n📊 统计:");
console.log(`   总扩展数: ${extensions.length}`);
console.log(`   扩展目录: ${EXTENSIONS_DIR}`);
console.log(`   当前目录: ${process.cwd()}`);

// 测试 6: 验证扩展加载
console.log("\n🚀 加载验证:");
console.log("   请运行以下命令测试扩展加载:");
console.log(`   pi`);
console.log("   然后输入 /test-ext 命令测试扩展功能");
console.log("   如果看到 'Test extension is working! 🎉' 通知，说明扩展加载成功");

console.log("\n" + "=".repeat(50));
console.log("✅ 扩展发现测试完成");
console.log("=".repeat(50));