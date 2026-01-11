/**
 * CodeMap Generator 主入口
 */

import { ProviderFactory } from './providers/index.js';
import { readFiles, buildGeneratePrompt } from './utils/fileUtils.js';
import type { GenerateOptions, AnalyzeOptions } from './types.js';

/**
 * 生成 CodeMap
 */
export async function generateCodemap(options: GenerateOptions) {
  const { query, files, projectRoot, modelTier = 'fast', provider = 'pi' } = options;

  console.error('Generating CodeMap...');
  console.error(`Query: ${query}`);
  console.error(`Files: ${files.length}`);
  console.error(`Project Root: ${projectRoot}`);
  console.error(`Model Tier: ${modelTier}`);
  console.error(`Provider: ${provider}`);

  // 读取文件内容
  const fileContents = readFiles(files, projectRoot);

  if (fileContents.length === 0) {
    throw new Error('No valid files to analyze');
  }

  // 构建提示
  const prompt = buildGeneratePrompt(query, fileContents);

  // 创建提供者并生成 CodeMap
  const aiProvider = ProviderFactory.create(provider);
  const codemap = await aiProvider.generate(prompt, modelTier);

  console.error(`Successfully generated codemap with ${codemap.traces.length} traces`);

  return codemap;
}

/**
 * 分析代码
 */
export async function analyzeCode(options: AnalyzeOptions) {
  const { filePath, provider = 'pi' } = options;

  console.error('Analyzing code...');
  console.error(`File: ${filePath}`);

  const { readFileSync, extname } = await import('fs');
  const { getFileLanguage } = await import('./utils/fileUtils.js');

  const content = readFileSync(filePath, 'utf-8');
  const lang = getFileLanguage(filePath);

  const prompt = `Analyze this code and return JSON with functions, classes, imports, and complexity metrics:

\`\`\`${lang}
${content}
\`\`\`

Return JSON: {"file": "${filePath}", "type": "${extname(filePath)}", "functions": [...], "classes": [...], "imports": [...]}`;

  const aiProvider = ProviderFactory.create(provider);
  const analysis = await aiProvider.analyze(prompt);

  return analysis;
}

/**
 * CLI 入口
 */
export async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: bun run src/index.ts <action> [options]');
    console.error('Actions: generate, analyze');
    console.error('');
    console.error('Generate action:');
    console.error('  bun run src/index.ts generate "<query>" <files_json> <project_root> [model_tier] [provider]');
    console.error('');
    console.error('Analyze action:');
    console.error('  bun run src/index.ts analyze <file_path> [provider]');
    process.exit(1);
  }

  const action = args[0];

  try {
    switch (action) {
      case 'generate': {
        const [query, filesStr, projectRoot, modelTier = 'fast', provider = 'pi'] = args.slice(1);

        if (!query || !filesStr || !projectRoot) {
          throw new Error('Missing required arguments: query, files_json, project_root');
        }

        const files = JSON.parse(filesStr);
        const codemap = await generateCodemap({
          query,
          files,
          projectRoot,
          modelTier: modelTier as 'fast' | 'smart',
          provider: provider as 'pi' | 'claude'
        });

        // 输出 JSON
        console.log(JSON.stringify(codemap, null, 2));
        break;
      }

      case 'analyze': {
        const [filePath, provider = 'pi'] = args.slice(1);

        if (!filePath) {
          throw new Error('Missing file path');
        }

        const analysis = await analyzeCode({
          filePath,
          provider: provider as 'pi' | 'claude'
        });

        console.log(JSON.stringify(analysis, null, 2));
        break;
      }

      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 如果直接运行此文件，执行 CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}