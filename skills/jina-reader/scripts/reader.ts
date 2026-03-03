#!/usr/bin/env bun
/**
 * Jina Reader CLI - URL 内容提取 + 网络搜索
 */

import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

// 加载 .env
function loadEnv() {
  const envPath = join(import.meta.dir, '..', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    }
  }
}
loadEnv();

const JINA_API_KEY = process.env.JINA_API_KEY;
const READ_BASE = 'https://r.jina.ai';
const SEARCH_BASE = 'https://s.jina.ai';

async function readUrl(url: string, opts: Record<string, any> = {}): Promise<string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${JINA_API_KEY}`,
    'Accept': opts.format === 'json' ? 'application/json' : 'text/plain'
  };
  if (opts['no-cache']) headers['X-No-Cache'] = 'true';
  if (opts.selector) headers['X-Target-Selector'] = opts.selector;
  if (opts.remove) headers['X-Remove-Selector'] = opts.remove;

  const params = new URLSearchParams();
  if (opts.format && opts.format !== 'markdown' && opts.format !== 'json') params.set('respondWith', opts.format);
  if (opts.timeout) params.set('timeout', String(opts.timeout));
  params.set('retainImages', 'alt');

  const query = params.toString() ? `?${params}` : '';
  const res = await fetch(`${READ_BASE}/${encodeURIComponent(url)}${query}`, { headers });
  if (!res.ok) throw new Error(`Read error (${res.status}): ${await res.text()}`);
  return res.text();
}

async function search(query: string, opts: Record<string, any> = {}): Promise<string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${JINA_API_KEY}`,
    'Accept': 'application/json'
  };

  const params = new URLSearchParams();
  params.set('q', query);
  if (opts.count) params.set('count', String(opts.count));
  if (opts.site) params.set('site', opts.site);
  if (opts.type) params.set('type', opts.type);
  if (opts.provider) params.set('provider', opts.provider);

  const res = await fetch(`${SEARCH_BASE}/?${params}`, { headers });
  if (!res.ok) throw new Error(`Search error (${res.status}): ${await res.text()}`);
  return res.text();
}

function usage() {
  console.log(`
Jina Reader - URL 内容提取 + 网络搜索

用法:
  reader.ts read <url> [options]
  reader.ts search <query> [options]

Read 选项:
  --format <fmt>    markdown|html|text|json (默认 markdown)
  --timeout <sec>   超时 1-180 (默认 30)
  --no-cache        禁用缓存
  --selector <css>  CSS 选择器

Search 选项:
  --count <n>       结果数 1-20 (默认 10)
  --site <domain>   限定站点
  --type <type>     web|images|news (默认 web)

示例:
  reader.ts read "https://example.com"
  reader.ts search "AI news" --count 5
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '-h' || args[0] === '--help') return usage();

  if (!JINA_API_KEY) {
    console.error('Error: JINA_API_KEY not set in .env');
    process.exit(1);
  }

  const [cmd, ...rest] = args;
  const positional: string[] = [];
  const opts: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const k = rest[i].slice(2);
      opts[k] = rest[i + 1]?.startsWith('--') ? true : (i++, rest[i]);
    } else {
      positional.push(rest[i]);
    }
  }

  try {
    if (cmd === 'read') {
      if (!positional[0]) throw new Error('URL required');
      console.log(await readUrl(positional[0], opts));
    } else if (cmd === 'search') {
      if (!positional[0]) throw new Error('Query required');
      console.log(await search(positional[0], opts));
    } else {
      throw new Error(`Unknown: ${cmd}`);
    }
  } catch (e) {
    console.error('Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
